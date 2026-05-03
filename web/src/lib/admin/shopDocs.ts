import type { NormalizedChunkRecord } from "@/lib/knowledge/normalizeChunk";

import { buildPageRecords, buildTextRecords } from "./documentRecords";

export const COLLISION_PROGRAM_GUIDE_URL =
  "https://assets.ctfassets.net/ways6qm8tbfw/2NgmPKP5LdEwCPfTWbCP8F/2178e918c12c066c5db0a91c2d9cc63e/collision-program-guide.pdf";

export type ShopDocUrlImportRequest =
  | { ok: true; value: { urls: string[] } }
  | { ok: false; error: string };

export type ShopDocsImportResult = {
  batchId: string;
  importedAt: number;
  documentsImported: number;
  chunksUpserted: number;
  skipped: Array<{ url: string; error: string }>;
  summary: string;
};

export function shopDocsNoRecordsError(skipped: ShopDocsImportResult["skipped"]): string {
  const firstSkipped = skipped[0];
  if (!firstSkipped) {
    return "Shop Docs import failed: no records were extracted.";
  }

  return `Shop Docs import failed: no records were extracted. First skipped URL: ${firstSkipped.url} - ${firstSkipped.error}`;
}

export function parseShopDocUrlImportRequest(input: unknown): ShopDocUrlImportRequest {
  if (!isRecord(input) || typeof input.urls !== "string") {
    return { ok: false, error: "Enter at least one public document URL." };
  }

  const urls = input.urls
    .split(/\r?\n|,/)
    .map((url) => url.trim())
    .filter(Boolean);

  if (!urls.length) {
    return { ok: false, error: "Enter at least one public document URL." };
  }

  for (const url of urls) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, error: "Document URLs must be valid URLs." };
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: "Only http and https document URLs can be imported." };
    }
  }

  return { ok: true, value: { urls: Array.from(new Set(urls)) } };
}

export function buildShopDocTextRecords(input: {
  batchId: string;
  fileType: string;
  modifiedAt?: string;
  sourceUrl: string;
  text: string;
  title: string;
  maxChunkChars?: number;
}): { records: NormalizedChunkRecord[] } {
  return buildTextRecords({
    batchId: input.batchId,
    category: "Shop Docs",
    fileType: input.fileType,
    knowledgeType: "shop_doc",
    modifiedAt: input.modifiedAt,
    sourceRef: input.sourceUrl,
    sourceUrl: input.sourceUrl,
    text: input.text,
    title: input.title,
    maxChunkChars: input.maxChunkChars,
  });
}

export function buildShopDocPdfRecords(input: {
  batchId: string;
  modifiedAt?: string;
  pages: Array<{ pageNumber: number; text: string }>;
  sourceUrl: string;
  title: string;
  maxChunkChars?: number;
}): { records: NormalizedChunkRecord[] } {
  return buildPageRecords({
    batchId: input.batchId,
    category: input.title.toLowerCase().includes("collision repair program")
      ? "ICBC Collision Repair Program"
      : "Shop Docs",
    fileType: "pdf",
    knowledgeType: "shop_doc",
    modifiedAt: input.modifiedAt,
    pages: input.pages,
    sourceRef: input.sourceUrl,
    sourceUrl: input.sourceUrl,
    title: input.title,
    maxChunkChars: input.maxChunkChars,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
