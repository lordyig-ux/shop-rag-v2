import { makeFunctionReference } from "convex/server";

import type { AdminOverview } from "@/lib/admin/contracts";
import type { NormalizedChunkRecord } from "@/lib/knowledge/normalizeChunk";
import type { EvidenceChunk, KnowledgeFilter } from "@/lib/search/contracts";

export const convexFunctions = {
  search: makeFunctionReference<
    "query",
    {
      question: string;
      knowledgeType?: KnowledgeFilter;
      importedBatchId?: string;
      limit?: number;
    },
    EvidenceChunk[]
  >("knowledge:search"),

  adminOverview: makeFunctionReference<"query", Record<string, never>, AdminOverview>("knowledge:adminOverview"),

  logQuery: makeFunctionReference<
    "mutation",
    {
      question: string;
      resultCount: number;
      usedAi: boolean;
      warnings: string[];
    },
    null
  >("knowledge:logQuery"),

  upsertImportedChunks: makeFunctionReference<
    "mutation",
    {
      importSecret?: string;
      records: NormalizedChunkRecord[];
    },
    {
      sourcesUpserted: number;
      chunksUpserted: number;
    }
  >("knowledge:upsertImportedChunks"),
};
