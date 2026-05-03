import type { NormalizedChunkRecord } from "@/lib/knowledge/normalizeChunk";

import {
  buildTextRecords,
  extractRoleMain,
  htmlH1,
  htmlTitle,
  htmlToReadableMarkdown,
} from "./documentRecords";

export const MITCHELL_CEG_START_URL =
  "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020000.htm";
export const MITCHELL_CEG_CONTENT_PREFIX =
  "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/";

export type MitchellCegBuildResult = {
  sourceUrl: string;
  title: string;
  records: NormalizedChunkRecord[];
  skippedReason: "empty_content" | null;
};

export type MitchellCegRefreshResult = {
  batchId: string;
  refreshedAt: number;
  durationMs: number;
  pagesFound: number;
  pagesImported: number;
  chunksUpserted: number;
  oldSourcesDeleted: number;
  oldChunksDeleted: number;
  skipped: Array<{ sourceUrl: string; error: string }>;
  summary: string;
};

export function mitchellCegUrlFromHref(href: string, baseUrl: string): string | null {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";
    url.search = "";

    if (!url.href.startsWith(MITCHELL_CEG_CONTENT_PREFIX)) {
      return null;
    }
    if (!/^ceg\d+\.htm$/i.test(url.pathname.split("/").pop() || "")) {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

export function extractMitchellCegLinks(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  const pattern = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const url = mitchellCegUrlFromHref(match[1], baseUrl);
    if (url) {
      links.add(url);
    }
  }

  return Array.from(links);
}

export function extractMitchellCegText(html: string): { title: string; text: string } {
  const main = extractRoleMain(html);
  const targetHtml = main || html;
  const title = htmlH1(targetHtml) || htmlTitle(html).replace(/^CEG:\s*/i, "") || "Mitchell CEG";
  const text = htmlToReadableMarkdown(targetHtml);

  return {
    title,
    text,
  };
}

export function buildMitchellCegRecords(input: {
  batchId: string;
  html: string;
  sourceUrl: string;
  maxChunkChars?: number;
}): MitchellCegBuildResult {
  const extracted = extractMitchellCegText(input.html);
  if (!extracted.text) {
    return {
      sourceUrl: input.sourceUrl,
      title: extracted.title,
      records: [],
      skippedReason: "empty_content",
    };
  }

  return {
    sourceUrl: input.sourceUrl,
    title: extracted.title,
    records: buildTextRecords({
      batchId: input.batchId,
      category: "Mitchell CEG",
      fileType: "html",
      knowledgeType: "shop_doc",
      sourceRef: input.sourceUrl,
      sourceUrl: input.sourceUrl,
      text: extracted.text,
      title: extracted.title,
      maxChunkChars: input.maxChunkChars,
    }).records,
    skippedReason: null,
  };
}
