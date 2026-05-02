import { createHash } from "node:crypto";

export type KnowledgeType = "sop" | "insurance_policy" | "shop_doc" | "reference";

export type NormalizedSource = {
  sourceId: string;
  title: string;
  category: string;
  sourceRef: string;
  sourceUrl: string | null;
  fileType: string;
  knowledgeType: KnowledgeType;
  contentHash: string;
  modifiedAt: string;
  importedBatchId: string;
};

export type NormalizedChunk = {
  chunkId: string;
  sourceId: string;
  title: string;
  category: string;
  text: string;
  sourceUrl: string | null;
  sourceRef: string;
  knowledgeType: KnowledgeType;
  chunkIndex: number;
  totalChunks: number;
  pageNumber: number | null;
  pageRange: string | null;
  importedBatchId: string;
};

export type NormalizedChunkRecord = {
  source: NormalizedSource;
  chunk: NormalizedChunk;
};

export type NormalizeOptions = {
  batchId: string;
  defaultKnowledgeType?: KnowledgeType;
};

type RawMetadata = Record<string, unknown>;

export function normalizeChunkRecord(
  raw: unknown,
  options: NormalizeOptions,
): NormalizedChunkRecord | null {
  if (!isRecord(raw)) {
    return null;
  }

  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  const chunkId = firstText(raw.id, raw.chunk_id);
  const text = firstText(raw.text, raw.content, raw.page_content);

  if (!chunkId || !text) {
    return null;
  }

  const title = firstText(metadata.title, metadata.name, metadata.heading) || "Untitled source";
  const category = firstText(metadata.category, metadata.section, metadata.topic) || "Uncategorized";
  const sourceUrl = firstText(metadata.source_url, metadata.url) || null;
  const sourceRef =
    firstText(metadata.content_url, metadata.source_ref, metadata.path, metadata.file_name, sourceUrl) ||
    title;
  const knowledgeType = normalizeKnowledgeType(
    firstText(metadata.knowledge_type, metadata.knowledgeType),
    options.defaultKnowledgeType || "reference",
  );
  const sourceId = `${knowledgeType}:${sourceUrl || sourceRef}`;
  const chunkIndex = numberOrDefault(metadata.chunk_index, 0);

  return {
    source: {
      sourceId,
      title,
      category,
      sourceRef,
      sourceUrl,
      fileType: inferFileType(sourceRef, sourceUrl),
      knowledgeType,
      contentHash: sha1(text),
      modifiedAt: firstText(metadata.date_modified, metadata.modified_at) || "",
      importedBatchId: options.batchId,
    },
    chunk: {
      chunkId,
      sourceId,
      title,
      category,
      text,
      sourceUrl,
      sourceRef,
      knowledgeType,
      chunkIndex,
      totalChunks: numberOrDefault(metadata.total_chunks, chunkIndex + 1),
      pageNumber: nullableNumber(metadata.page_number),
      pageRange: firstText(metadata.page_range) || null,
      importedBatchId: options.batchId,
    },
  };
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function isRecord(value: unknown): value is RawMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeKnowledgeType(value: string, fallback: KnowledgeType): KnowledgeType {
  if (value === "sop" || value === "insurance_policy" || value === "shop_doc" || value === "reference") {
    return value;
  }
  return fallback;
}

function numberOrDefault(value: unknown, fallback: number): number {
  const parsed = nullableNumber(value);
  return parsed === null ? fallback : parsed;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function inferFileType(...values: Array<string | null>): string {
  const target = values.find((value): value is string => Boolean(value));
  if (!target) {
    return "unknown";
  }
  const withoutQuery = target.split(/[?#]/, 1)[0] || target;
  const match = withoutQuery.match(/\.([a-z0-9]+)$/i);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }
  if (/^https?:\/\//i.test(target)) {
    return "html";
  }
  return "unknown";
}

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}
