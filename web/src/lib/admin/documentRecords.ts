import { createHash } from "node:crypto";

import type { KnowledgeType, NormalizedChunkRecord } from "@/lib/knowledge/normalizeChunk";

export type TextRecordInput = {
  batchId: string;
  category: string;
  fileType: string;
  knowledgeType: KnowledgeType;
  modifiedAt?: string;
  sourceRef: string;
  sourceUrl: string;
  text: string;
  title: string;
  maxChunkChars?: number;
};

export type PageRecordInput = Omit<TextRecordInput, "text"> & {
  pages: Array<{
    pageNumber: number;
    text: string;
  }>;
};

export function makeMaintenanceBatchId(prefix: string, now = new Date()): string {
  const iso = now.toISOString();
  return `${prefix}-${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, "")}`;
}

export function buildTextRecords(input: TextRecordInput): { records: NormalizedChunkRecord[] } {
  const cleanText = normalizeWhitespace(input.text);
  if (!cleanText) {
    return { records: [] };
  }

  const chunks = chunkText(cleanText, input.maxChunkChars || 1800);
  const sourceId = `${input.knowledgeType}:${input.sourceUrl}`;
  const sourceHash = shortHash(input.sourceRef || input.sourceUrl);
  const contentHash = sha1(cleanText);

  return {
    records: chunks.map((chunk, index) => ({
      source: {
        sourceId,
        title: input.title,
        category: input.category,
        sourceRef: input.sourceRef,
        sourceUrl: input.sourceUrl,
        fileType: input.fileType,
        knowledgeType: input.knowledgeType,
        contentHash,
        modifiedAt: input.modifiedAt || "",
        importedBatchId: input.batchId,
      },
      chunk: {
        chunkId: `${sourceHash}_chunk_${index}`,
        sourceId,
        title: input.title,
        category: input.category,
        text: chunk,
        sourceUrl: input.sourceUrl,
        sourceRef: input.sourceRef,
        knowledgeType: input.knowledgeType,
        chunkIndex: index,
        totalChunks: chunks.length,
        pageNumber: null,
        pageRange: null,
        importedBatchId: input.batchId,
      },
    })),
  };
}

export function buildPageRecords(input: PageRecordInput): { records: NormalizedChunkRecord[] } {
  const records: NormalizedChunkRecord[] = [];
  const sourceHash = shortHash(input.sourceRef || input.sourceUrl);

  for (const page of input.pages) {
    const cleanText = normalizeWhitespace(page.text);
    if (!cleanText) {
      continue;
    }

    const pageUrl = `${input.sourceUrl}#page=${page.pageNumber}`;
    const sourceId = `${input.knowledgeType}:${pageUrl}`;
    const chunks = chunkText(cleanText, input.maxChunkChars || 1800);
    const contentHash = sha1(cleanText);

    chunks.forEach((chunk, index) => {
      records.push({
        source: {
          sourceId,
          title: input.title,
          category: input.category,
          sourceRef: input.sourceRef,
          sourceUrl: pageUrl,
          fileType: input.fileType,
          knowledgeType: input.knowledgeType,
          contentHash,
          modifiedAt: input.modifiedAt || "",
          importedBatchId: input.batchId,
        },
        chunk: {
          chunkId: `${sourceHash}_page_${page.pageNumber}_chunk_${index}`,
          sourceId,
          title: input.title,
          category: input.category,
          text: chunk,
          sourceUrl: pageUrl,
          sourceRef: input.sourceRef,
          knowledgeType: input.knowledgeType,
          chunkIndex: index,
          totalChunks: chunks.length,
          pageNumber: page.pageNumber,
          pageRange: String(page.pageNumber),
          importedBatchId: input.batchId,
        },
      });
    });
  }

  return { records };
}

export function extractFirstTag(html: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i");
  return html.match(pattern)?.[0] || "";
}

export function extractRoleMain(html: string): string {
  const pattern = /<([a-z0-9-]+)\b[^>]*role=["']main["'][^>]*>[\s\S]*?<\/\1>/i;
  return html.match(pattern)?.[0] || "";
}

export function htmlTitle(html: string): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return decodeHtmlEntities(stripTags(title)).trim();
}

export function htmlH1(html: string): string {
  const title = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "";
  return decodeHtmlEntities(stripTags(title)).trim();
}

export function htmlToReadableMarkdown(html: string): string {
  const withBlocks = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<h1\b[^>]*>/gi, "\n\n# ")
    .replace(/<h2\b[^>]*>/gi, "\n\n## ")
    .replace(/<h3\b[^>]*>/gi, "\n\n### ")
    .replace(/<h4\b[^>]*>/gi, "\n\n#### ")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n\n")
    .replace(/<\/(h1|h2|h3|h4|p|div|section|tr|ul|ol|table)>/gi, "\n\n")
    .replace(/<\/(td|th)>/gi, " | ")
    .replace(/<[^>]+>/g, " ");

  return decodeHtmlEntities(withBlocks)
    .split(/\n{2,}/)
    .map((block) => block.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function chunkText(text: string, maxChunkChars: number): string[] {
  const chunks: string[] = [];
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  let current = "";

  for (const block of blocks) {
    if (block.length > maxChunkChars) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(...hardChunk(block, maxChunkChars));
      continue;
    }

    const candidate = current ? `${current}\n\n${block}` : block;
    if (candidate.length > maxChunkChars && current) {
      chunks.push(current);
      current = block;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.length ? chunks : [text];
}

function hardChunk(text: string, maxChunkChars: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxChunkChars) {
    chunks.push(text.slice(index, index + maxChunkChars).trim());
  }
  return chunks.filter(Boolean);
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, codePoint: string) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) => String.fromCodePoint(parseInt(codePoint, 16)));
}

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function shortHash(value: string): string {
  return sha1(value).slice(0, 12);
}
