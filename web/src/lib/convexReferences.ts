import { makeFunctionReference } from "convex/server";

import type { AdminOverview } from "@/lib/admin/contracts";
import type { IcbcSourceSnapshot } from "@/lib/admin/icbcMaintenance";
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

  icbcSourceSnapshot: makeFunctionReference<"query", Record<string, never>, IcbcSourceSnapshot[]>(
    "knowledge:icbcSourceSnapshot",
  ),

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

  deleteImportedBatchPage: makeFunctionReference<
    "mutation",
    {
      importSecret?: string;
      batchId: string;
      limit?: number;
    },
    {
      chunksDeleted: number;
      sourcesDeleted: number;
      hasMore: boolean;
    }
  >("knowledge:deleteImportedBatchPage"),

  deleteIcbcSourcesExceptBatchPage: makeFunctionReference<
    "mutation",
    {
      importSecret?: string;
      keepBatchId: string;
      limit?: number;
    },
    {
      chunksDeleted: number;
      sourcesDeleted: number;
      hasMore: boolean;
    }
  >("knowledge:deleteIcbcSourcesExceptBatchPage"),

  deleteSourcesBySourceRefExceptBatchPage: makeFunctionReference<
    "mutation",
    {
      importSecret?: string;
      keepBatchId: string;
      sourceRefs: string[];
      limit?: number;
    },
    {
      chunksDeleted: number;
      sourcesDeleted: number;
      hasMore: boolean;
    }
  >("knowledge:deleteSourcesBySourceRefExceptBatchPage"),

  deleteSourcesByUrlPrefixExceptBatchPage: makeFunctionReference<
    "mutation",
    {
      importSecret?: string;
      keepBatchId: string;
      urlPrefix: string;
      limit?: number;
    },
    {
      chunksDeleted: number;
      sourcesDeleted: number;
      hasMore: boolean;
    }
  >("knowledge:deleteSourcesByUrlPrefixExceptBatchPage"),

  recordMaintenanceRun: makeFunctionReference<
    "mutation",
    {
      importSecret?: string;
      jobType: "icbc_check" | "icbc_refresh" | "mitchell_ceg_refresh" | "shop_docs_import";
      status: "running" | "succeeded" | "failed";
      summary: string;
      detailJson: string;
      createdByEmail: string;
    },
    null
  >("knowledge:recordMaintenanceRun"),
};
