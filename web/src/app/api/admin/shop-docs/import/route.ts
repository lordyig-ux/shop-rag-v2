import { ConvexHttpClient } from "convex/browser";

import {
  extractRoleMain,
  htmlH1,
  htmlTitle,
  htmlToReadableMarkdown,
  makeMaintenanceBatchId,
} from "@/lib/admin/documentRecords";
import {
  buildShopDocPdfRecords,
  buildShopDocTextRecords,
  parseShopDocUrlImportRequest,
  shopDocsNoRecordsError,
  type ShopDocsImportResult,
} from "@/lib/admin/shopDocs";
import { extractPdfTextPages } from "@/lib/admin/pdfText";
import { adminAccessErrorResponse, requireAdminAccess } from "@/lib/auth/requireAdminAccess";
import { convexFunctions } from "@/lib/convexReferences";
import type { NormalizedChunkRecord } from "@/lib/knowledge/normalizeChunk";

export const runtime = "nodejs";
export const maxDuration = 300;

const IMPORT_BATCH_SIZE = 100;

export async function POST(request: Request) {
  const access = await requireAdminAccess();
  if (!access.ok) {
    return adminAccessErrorResponse(access);
  }

  const parsed = parseShopDocUrlImportRequest(await request.json());
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
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
  const batchId = makeMaintenanceBatchId("shop-docs");
  const skipped: ShopDocsImportResult["skipped"] = [];
  const sourceRefs: string[] = [];
  const records: NormalizedChunkRecord[] = [];

  await recordMaintenanceRun(client, importSecret, {
    createdByEmail: access.email,
    detail: { batchId, urls: parsed.value.urls },
    status: "running",
    summary: `Shop Docs import started for ${parsed.value.urls.length} URL(s).`,
  });

  for (const url of parsed.value.urls) {
    try {
      const imported = await fetchShopDocRecords(url, batchId);
      sourceRefs.push(url);
      records.push(...imported.records);
    } catch (error) {
      skipped.push({ url, error: error instanceof Error ? error.message : "Import failed" });
    }
  }

  if (!records.length) {
    const summary = shopDocsNoRecordsError(skipped);
    await recordMaintenanceRun(client, importSecret, {
      createdByEmail: access.email,
      detail: { batchId, skipped },
      status: "failed",
      summary,
    });
    return Response.json({ error: summary, skipped }, { status: 502 });
  }

  const imported = await importRecords(client, importSecret, records);
  const deleted = await deleteOldSourceRefs(client, importSecret, batchId, sourceRefs);
  const result: ShopDocsImportResult = {
    batchId,
    importedAt: Date.now(),
    documentsImported: sourceRefs.length,
    chunksUpserted: imported.chunksUpserted,
    skipped,
    summary: `Imported ${sourceRefs.length} Shop Docs URL(s) into ${imported.chunksUpserted} chunks.`,
  };

  await recordMaintenanceRun(client, importSecret, {
    createdByEmail: access.email,
    detail: {
      ...result,
      oldSourcesDeleted: deleted.sourcesDeleted,
      oldChunksDeleted: deleted.chunksDeleted,
    },
    status: skipped.length ? "failed" : "succeeded",
    summary: result.summary,
  });

  return Response.json({
    ...result,
    oldSourcesDeleted: deleted.sourcesDeleted,
    oldChunksDeleted: deleted.chunksDeleted,
  });
}

async function fetchShopDocRecords(url: string, batchId: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() || "";
  const modifiedAt = response.headers.get("last-modified") || "";
  const looksLikePdf = contentType.includes("application/pdf") || new URL(url).pathname.toLowerCase().endsWith(".pdf");

  if (looksLikePdf) {
    const data = Buffer.from(await response.arrayBuffer());
    const textResult = await extractPdfTextPages(data);
    const title = normalizeTitle(textResult.title || titleFromUrl(url));
    return buildShopDocPdfRecords({
      batchId,
      modifiedAt,
      pages: textResult.pages,
      sourceUrl: url,
      title,
    });
  }

  const rawText = await response.text();
  if (contentType.includes("html") || /<\/?[a-z][\s\S]*>/i.test(rawText)) {
    const main = extractRoleMain(rawText);
    const targetHtml = main || rawText;
    const title = normalizeTitle(htmlH1(targetHtml) || htmlTitle(rawText) || titleFromUrl(url));
    return buildShopDocTextRecords({
      batchId,
      fileType: "html",
      modifiedAt,
      sourceUrl: url,
      text: htmlToReadableMarkdown(targetHtml),
      title,
    });
  }

  return buildShopDocTextRecords({
    batchId,
    fileType: "txt",
    modifiedAt,
    sourceUrl: url,
    text: rawText,
    title: normalizeTitle(titleFromUrl(url)),
  });
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

async function deleteOldSourceRefs(
  client: ConvexHttpClient,
  importSecret: string,
  keepBatchId: string,
  sourceRefs: string[],
) {
  let chunksDeleted = 0;
  let sourcesDeleted = 0;
  let hasMore = true;
  let iterations = 0;

  while (hasMore && iterations < 50) {
    const result = await client.mutation(convexFunctions.deleteSourcesBySourceRefExceptBatchPage, {
      importSecret,
      keepBatchId,
      sourceRefs,
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
    jobType: "shop_docs_import",
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

function titleFromUrl(url: string) {
  const fileName = decodeURIComponent(new URL(url).pathname.split("/").pop() || "Shop document");
  return fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
}

function normalizeTitle(value: string) {
  return value.trim().replace(/\s+/g, " ") || "Shop document";
}
