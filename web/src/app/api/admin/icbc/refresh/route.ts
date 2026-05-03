import { ConvexHttpClient } from "convex/browser";

import {
  ICBC_NAV_XML_URL,
  parseIcbcNavEntries,
  type IcbcNavEntry,
} from "@/lib/admin/icbcMaintenance";
import {
  buildIcbcRefreshRecords,
  makeIcbcRefreshBatchId,
  type IcbcRefreshFailure,
  type IcbcRefreshResult,
} from "@/lib/admin/icbcRefresh";
import { adminAccessErrorResponse, requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { convexFunctions } from "@/lib/convexReferences";
import type { NormalizedChunkRecord } from "@/lib/knowledge/normalizeChunk";

export const runtime = "nodejs";
export const maxDuration = 300;

const REFRESH_CONCURRENCY = 8;
const IMPORT_BATCH_SIZE = 100;

export async function POST() {
  const startedAt = Date.now();
  const access = await requireAdminAccess();
  if (!access.ok) {
    return adminAccessErrorResponse(access);
  }

  const convexUrl = process.env.CONVEX_URL || process.env.NEXT_PUBLIC_CONVEX_URL;
  const importSecret = process.env.KNOWLEDGE_IMPORT_SECRET;
  if (!convexUrl) {
    return Response.json({ error: "Convex URL is not configured." }, { status: 500 });
  }
  if (!importSecret) {
    return Response.json({ error: "KNOWLEDGE_IMPORT_SECRET is not configured in Vercel." }, { status: 500 });
  }

  const client = new ConvexHttpClient(convexUrl);
  const batchId = makeIcbcRefreshBatchId(new Date(startedAt));
  let importedNewBatch = false;

  try {
    await recordMaintenanceRun(client, importSecret, {
      createdByEmail: access.email,
      detail: { batchId },
      status: "running",
      summary: `ICBC refresh started for ${batchId}.`,
    });

    const entries = await fetchIcbcNavEntries();
    const scraped = await scrapeIcbcEntries(entries, batchId);
    const failed = scraped.filter((result) => result.failure).map((result) => result.failure as IcbcRefreshFailure);
    const records = scraped.flatMap((result) => result.records);
    const importedTopicIds = new Set(records.map((record) => record.source.sourceId));

    if (failed.length || !records.length || importedTopicIds.size !== entries.length) {
      const summary = `ICBC refresh stopped before import: ${failed.length} failed topics, ${importedTopicIds.size}/${entries.length} parsed topics.`;
      await recordMaintenanceRun(client, importSecret, {
        createdByEmail: access.email,
        detail: {
          batchId,
          topicsFound: entries.length,
          topicsParsed: importedTopicIds.size,
          failed: failed.slice(0, 25),
        },
        status: "failed",
        summary,
      });

      return Response.json({ error: summary, failed: failed.slice(0, 25) }, { status: 502 });
    }

    const imported = await importRecords(client, importSecret, records);
    importedNewBatch = true;
    const deleted = await deleteOldIcbcSources(client, importSecret, batchId);
    const result: IcbcRefreshResult = {
      batchId,
      refreshedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      topicsFound: entries.length,
      topicsImported: importedTopicIds.size,
      sourcesUpserted: importedTopicIds.size,
      chunksUpserted: imported.chunksUpserted,
      oldSourcesDeleted: deleted.sourcesDeleted,
      oldChunksDeleted: deleted.chunksDeleted,
      skipped: [],
      summary: `Refreshed ${importedTopicIds.size} ICBC topics into ${records.length} chunks.`,
      logStored: true,
    };

    await recordMaintenanceRun(client, importSecret, {
      createdByEmail: access.email,
      detail: result,
      status: "succeeded",
      summary: result.summary,
    });

    return Response.json(result);
  } catch (error) {
    if (!importedNewBatch) {
      try {
        await cleanupBatch(client, importSecret, batchId);
      } catch {
        // Best-effort cleanup only. The original error is more useful to the admin.
      }
    }

    const message = error instanceof Error ? error.message : "ICBC refresh failed.";
    try {
      await recordMaintenanceRun(client, importSecret, {
        createdByEmail: access.email,
        detail: { batchId, error: message },
        status: "failed",
        summary: message,
      });
    } catch {
      // If the import secret is wrong, even the failure log cannot be stored.
    }

    return Response.json({ error: message }, { status: 500 });
  }
}

async function fetchIcbcNavEntries() {
  const navResponse = await fetch(ICBC_NAV_XML_URL, {
    cache: "no-store",
    headers: refreshHeaders(),
  });

  if (!navResponse.ok) {
    throw new Error(`ICBC navigation map request failed: ${navResponse.status} ${navResponse.statusText}`);
  }

  const entries = parseIcbcNavEntries(await navResponse.text());
  if (!entries.length) {
    throw new Error("ICBC navigation map did not contain any topic references.");
  }

  return entries;
}

async function scrapeIcbcEntries(entries: IcbcNavEntry[], batchId: string) {
  return mapWithConcurrency(entries, REFRESH_CONCURRENCY, async (entry) => {
    try {
      const html = await fetchTextWithRetry(entry.sourceUrl);
      const built = buildIcbcRefreshRecords({
        batchId,
        entry,
        html,
      });

      if (built.skippedReason) {
        return {
          records: [],
          failure: {
            topicId: entry.topicId,
            title: entry.title,
            sourceUrl: entry.sourceUrl,
            error: built.skippedReason,
          },
        };
      }

      return { records: built.records, failure: null };
    } catch (error) {
      return {
        records: [],
        failure: {
          topicId: entry.topicId,
          title: entry.title,
          sourceUrl: entry.sourceUrl,
          error: error instanceof Error ? error.message : "Topic scrape failed",
        },
      };
    }
  });
}

async function fetchTextWithRetry(url: string) {
  let lastError = "";

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        headers: refreshHeaders(),
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error.message : "request failed";
      if (attempt < 2) {
        await sleep(250);
      }
    }
  }

  throw new Error(lastError);
}

async function importRecords(client: ConvexHttpClient, importSecret: string, records: NormalizedChunkRecord[]) {
  let chunksUpserted = 0;

  for (const batch of chunk(records, IMPORT_BATCH_SIZE)) {
    const result = await client.mutation(convexFunctions.upsertImportedChunks, {
      importSecret,
      records: batch,
    });
    chunksUpserted += result.chunksUpserted;
  }

  return { chunksUpserted };
}

async function deleteOldIcbcSources(client: ConvexHttpClient, importSecret: string, keepBatchId: string) {
  let chunksDeleted = 0;
  let sourcesDeleted = 0;
  let hasMore = true;
  let iterations = 0;

  while (hasMore && iterations < 80) {
    const result = await client.mutation(convexFunctions.deleteIcbcSourcesExceptBatchPage, {
      importSecret,
      keepBatchId,
      limit: 200,
    });
    chunksDeleted += result.chunksDeleted;
    sourcesDeleted += result.sourcesDeleted;
    hasMore = result.hasMore;
    iterations += 1;
  }

  return { chunksDeleted, sourcesDeleted, hasMore };
}

async function cleanupBatch(client: ConvexHttpClient, importSecret: string, batchId: string) {
  let hasMore = true;
  let iterations = 0;

  while (hasMore && iterations < 50) {
    const result = await client.mutation(convexFunctions.deleteImportedBatchPage, {
      importSecret,
      batchId,
      limit: 200,
    });
    hasMore = result.hasMore;
    iterations += 1;
  }
}

async function recordMaintenanceRun(
  client: ConvexHttpClient,
  importSecret: string,
  input: {
    createdByEmail: string;
    detail: unknown;
    status: "running" | "succeeded" | "failed";
    summary: string;
  },
) {
  await client.mutation(convexFunctions.recordMaintenanceRun, {
    importSecret,
    jobType: "icbc_refresh",
    status: input.status,
    summary: input.summary,
    detailJson: JSON.stringify(input.detail),
    createdByEmail: input.createdByEmail,
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function refreshHeaders() {
  return {
    "User-Agent": "Terminal Auto Body Knowledge Base Maintenance",
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
