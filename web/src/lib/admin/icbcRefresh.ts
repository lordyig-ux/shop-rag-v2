import { createHash } from "node:crypto";

import type { NormalizedChunkRecord } from "@/lib/knowledge/normalizeChunk";

import type { IcbcNavEntry } from "./icbcMaintenance";

export type IcbcRefreshBuildInput = {
  batchId: string;
  entry: IcbcNavEntry;
  html: string;
  maxChunkChars?: number;
};

export type IcbcRefreshBuildResult = {
  topicId: string;
  title: string;
  sourceUrl: string;
  contentUrl: string;
  records: NormalizedChunkRecord[];
  skippedReason: "empty_article" | null;
};

export type IcbcRefreshFailure = {
  topicId: string;
  title: string;
  sourceUrl: string;
  error: string;
};

export type IcbcRefreshResult = {
  batchId: string;
  refreshedAt: number;
  durationMs: number;
  topicsFound: number;
  topicsImported: number;
  sourcesUpserted: number;
  chunksUpserted: number;
  oldSourcesDeleted: number;
  oldChunksDeleted: number;
  notListedSourcesChecked?: number;
  notListedSourcesPreserved?: number;
  confirmedNotFoundSources?: number;
  directCheckFailedSources?: number;
  skipped: IcbcRefreshFailure[];
  summary: string;
  logStored: boolean;
  logWarning?: string;
};

export function makeIcbcRefreshBatchId(now = new Date()): string {
  const iso = now.toISOString();
  return `icbc-refresh-${iso.slice(0, 10)}-${iso.slice(11, 19).replace(/:/g, "")}`;
}

export function buildIcbcRefreshRecords(input: IcbcRefreshBuildInput): IcbcRefreshBuildResult {
  const articleText = extractIcbcArticleText(input.html);
  const contentUrl = `https://mdp.partners.icbc.com/topics/${input.entry.topicId}.html`;

  if (!articleText) {
    return {
      topicId: input.entry.topicId,
      title: input.entry.title,
      sourceUrl: input.entry.sourceUrl,
      contentUrl,
      records: [],
      skippedReason: "empty_article",
    };
  }

  const chunks = chunkText(articleText, input.maxChunkChars || 1800);
  const contentHash = sha1(articleText);
  const modifiedAt = extractModifiedAt(input.html);
  const sourceId = `insurance_policy:${input.entry.sourceUrl}`;
  const records: NormalizedChunkRecord[] = chunks.map((chunk, index) => ({
    source: {
      sourceId,
      title: input.entry.title,
      category: input.entry.category,
      sourceRef: contentUrl,
      sourceUrl: input.entry.sourceUrl,
      fileType: "html",
      knowledgeType: "insurance_policy",
      contentHash,
      modifiedAt,
      importedBatchId: input.batchId,
    },
    chunk: {
      chunkId: `${input.entry.topicId}_chunk_${index}`,
      sourceId,
      title: input.entry.title,
      category: input.entry.category,
      text: chunk,
      sourceUrl: input.entry.sourceUrl,
      sourceRef: contentUrl,
      knowledgeType: "insurance_policy",
      chunkIndex: index,
      totalChunks: chunks.length,
      pageNumber: null,
      pageRange: null,
      importedBatchId: input.batchId,
    },
  }));

  return {
    topicId: input.entry.topicId,
    title: input.entry.title,
    sourceUrl: input.entry.sourceUrl,
    contentUrl,
    records,
    skippedReason: null,
  };
}

export function extractIcbcArticleText(html: string): string {
  const articleHtml = extractFirstTag(html, "article");
  if (!articleHtml) {
    return "";
  }

  return htmlToReadableMarkdown(articleHtml);
}

function extractFirstTag(html: string, tagName: string): string {
  const pattern = new RegExp(`<${tagName}\\b[^>]*>[\\s\\S]*?<\\/${tagName}>`, "i");
  return html.match(pattern)?.[0] || "";
}

function htmlToReadableMarkdown(html: string): string {
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

function chunkText(text: string, maxChunkChars: number): string[] {
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

function extractModifiedAt(html: string): string {
  const metaMatch = html.match(/<meta\s+[^>]*name=["']last_update["'][^>]*content=["']([^"']+)["'][^>]*>/i);
  if (metaMatch?.[1]) {
    return decodeHtmlEntities(metaMatch[1]).trim();
  }

  const visibleMatch = html.match(/Last updated\s+([0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  return visibleMatch?.[1] || "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
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
