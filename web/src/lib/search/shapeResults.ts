import type { Citation, EvidenceChunk, SearchResponse } from "./contracts";

const LOW_EVIDENCE_ANSWER =
  "I could not find enough evidence in the indexed knowledge base to answer that reliably.";

export type ShapeSearchResponseInput = {
  question: string;
  chunks: EvidenceChunk[];
  usedAi: boolean;
  aiAnswer?: string;
  warnings?: string[];
};

export function shapeSearchResponse(input: ShapeSearchResponseInput): SearchResponse {
  if (input.chunks.length === 0) {
    return {
      question: input.question,
      answer: LOW_EVIDENCE_ANSWER,
      citations: [],
      resultCount: 0,
      usedAi: false,
      warnings: dedupe([...(input.warnings || []), "low_retrieval_confidence"]),
    };
  }

  return {
    question: input.question,
    answer: input.aiAnswer?.trim() || extractiveAnswer(input.chunks),
    citations: input.chunks.map(toCitation),
    resultCount: input.chunks.length,
    usedAi: input.usedAi,
    warnings: dedupe(input.warnings || []),
  };
}

function toCitation(chunk: EvidenceChunk): Citation {
  return {
    chunkId: chunk.chunkId,
    title: chunk.title,
    category: chunk.category,
    sourceUrl: chunk.sourceUrl,
    sourceUrlWithPage: pdfPageUrl(chunk.sourceUrl, chunk.pageNumber),
    sourceRef: chunk.sourceRef,
    pageNumber: chunk.pageNumber,
    pageRange: chunk.pageRange,
    knowledgeType: chunk.knowledgeType,
    score: chunk.score,
    excerpt: chunk.text.slice(0, 1200),
  };
}

function extractiveAnswer(chunks: EvidenceChunk[]): string {
  const first = chunks[0];
  return `I found relevant source excerpts. The strongest match is "${first.title}". Review the citations below to verify the details.`;
}

function pdfPageUrl(sourceUrl: string | null, pageNumber: number | null): string | null {
  if (!sourceUrl || !pageNumber || !sourceUrl.toLowerCase().includes(".pdf")) {
    return null;
  }
  return `${sourceUrl.split("#", 1)[0]}#page=${pageNumber}`;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}
