import { ConvexHttpClient } from "convex/browser";

import { makeMaintenanceBatchId } from "@/lib/admin/documentRecords";
import {
  buildMitchellCegRecords,
  extractMitchellCegLinks,
  MITCHELL_CEG_CONTENT_PREFIX,
  MITCHELL_CEG_START_URL,
  type MitchellCegRefreshResult,
} from "@/lib/admin/mitchellCeg";
import { rebuildAdminOverviewSummaries } from "@/lib/admin/rebuildOverviewSummaries";
import { adminAccessErrorResponse, requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { convexFunctions } from "@/lib/convexReferences";
import type { NormalizedChunkRecord } from "@/lib/knowledge/normalizeChunk";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PAGES = 150;
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
  const batchId = makeMaintenanceBatchId("mitchell-ceg", new Date(startedAt));

  await recordMaintenanceRun(client, importSecret, {
    createdByEmail: access.email,
    detail: { batchId, startUrl: MITCHELL_CEG_START_URL },
    status: "running",
    summary: `Mitchell CEG refresh started for ${batchId}.`,
  });

  try {
    const crawl = await crawlMitchellCeg();
    const records: NormalizedChunkRecord[] = [];
    const skipped: MitchellCegRefreshResult["skipped"] = [...crawl.skipped];

    for (const page of crawl.pages) {
      const built = buildMitchellCegRecords({
        batchId,
        html: page.html,
        sourceUrl: page.url,
      });
      if (built.skippedReason) {
        skipped.push({ sourceUrl: page.url, error: built.skippedReason });
      }
      records.push(...built.records);
    }

    if (!records.length) {
      throw new Error("Mitchell CEG refresh failed: no content was extracted.");
    }

    const imported = await importRecords(client, importSecret, records);
    const deleted = await deleteOldMitchell(client, importSecret, batchId);
    await rebuildAdminOverviewSummaries(client, importSecret);
    const pagesImported = new Set(records.map((record) => record.source.sourceRef)).size;
    const result: MitchellCegRefreshResult = {
      batchId,
      refreshedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      pagesFound: crawl.pages.length,
      pagesImported,
      chunksUpserted: imported.chunksUpserted,
      oldSourcesDeleted: deleted.sourcesDeleted,
      oldChunksDeleted: deleted.chunksDeleted,
      skipped,
      summary: `Refreshed ${pagesImported} Mitchell CEG pages into ${imported.chunksUpserted} chunks.`,
    };

    await recordMaintenanceRun(client, importSecret, {
      createdByEmail: access.email,
      detail: result,
      status: skipped.length ? "failed" : "succeeded",
      summary: result.summary,
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mitchell CEG refresh failed.";
    await recordMaintenanceRun(client, importSecret, {
      createdByEmail: access.email,
      detail: { batchId, error: message },
      status: "failed",
      summary: message,
    });
    return Response.json({ error: message }, { status: 500 });
  }
}

async function crawlMitchellCeg() {
  const queue = [MITCHELL_CEG_START_URL];
  const queued = new Set(queue);
  const visited = new Set<string>();
  const pages: Array<{ url: string; html: string }> = [];
  const skipped: MitchellCegRefreshResult["skipped"] = [];

  while (queue.length && visited.size < MAX_PAGES) {
    const url = queue.shift() as string;
    if (visited.has(url)) {
      continue;
    }
    visited.add(url);

    try {
      const html = await fetchText(url);
      pages.push({ url, html });
      for (const link of extractMitchellCegLinks(html, url)) {
        if (!queued.has(link) && queued.size < MAX_PAGES) {
          queued.add(link);
          queue.push(link);
        }
      }
    } catch (error) {
      skipped.push({ sourceUrl: url, error: error instanceof Error ? error.message : "Fetch failed" });
    }
  }

  return { pages, skipped };
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "Terminal Auto Body Knowledge Base Maintenance",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return response.text();
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

async function deleteOldMitchell(client: ConvexHttpClient, importSecret: string, keepBatchId: string) {
  let chunksDeleted = 0;
  let sourcesDeleted = 0;
  let hasMore = true;
  let iterations = 0;

  while (hasMore && iterations < 80) {
    const result = await client.mutation(convexFunctions.deleteSourcesByUrlPrefixExceptBatchPage, {
      importSecret,
      keepBatchId,
      urlPrefix: MITCHELL_CEG_CONTENT_PREFIX,
      limit: 200,
    });
    chunksDeleted += result.chunksDeleted;
    sourcesDeleted += result.sourcesDeleted;
    hasMore = result.hasMore;
    iterations += 1;
  }

  return { chunksDeleted, sourcesDeleted };
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
    jobType: "mitchell_ceg_refresh",
    status: input.status,
    summary: input.summary,
    detailJson: JSON.stringify(input.detail),
    createdByEmail: input.createdByEmail,
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}
