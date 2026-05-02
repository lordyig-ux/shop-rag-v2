import type { KnowledgeType } from "@/lib/knowledge/normalizeChunk";

export type KnowledgeFilter = "all" | KnowledgeType;

export type EvidenceChunk = {
  chunkId: string;
  title: string;
  category: string;
  text: string;
  sourceUrl: string | null;
  sourceRef: string;
  pageNumber: number | null;
  pageRange: string | null;
  knowledgeType: KnowledgeType;
  score: number;
};

export type Citation = {
  chunkId: string;
  title: string;
  category: string;
  sourceUrl: string | null;
  sourceUrlWithPage: string | null;
  sourceRef: string;
  pageNumber: number | null;
  pageRange: string | null;
  knowledgeType: KnowledgeType;
  score: number;
  excerpt: string;
};

export type SearchResponse = {
  question: string;
  answer: string;
  citations: Citation[];
  resultCount: number;
  usedAi: boolean;
  warnings: string[];
};
