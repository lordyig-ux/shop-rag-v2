import type { KnowledgeType } from "@/lib/knowledge/normalizeChunk";

const knowledgeTypes: KnowledgeType[] = ["sop", "insurance_policy", "shop_doc", "reference"];

export type MaintenanceImportRequest = {
  content: string;
  batchId: string;
  knowledgeType: KnowledgeType;
  dryRun: boolean;
};

export type MaintenanceImportParseResult =
  | { ok: true; value: MaintenanceImportRequest }
  | { ok: false; error: string };

export function parseMaintenanceImportRequest(input: unknown): MaintenanceImportParseResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Upload a JSONL file before importing." };
  }

  const record = input as Record<string, unknown>;
  const content = typeof record.content === "string" ? record.content : "";
  if (!content.trim()) {
    return { ok: false, error: "Upload a JSONL file before importing." };
  }

  const batchId = normalizeBatchId(typeof record.batch === "string" ? record.batch : "");
  if (!batchId) {
    return { ok: false, error: "Enter a batch ID before importing." };
  }
  if (!/^[a-z0-9._-]{1,80}$/.test(batchId)) {
    return { ok: false, error: "Batch ID can only contain letters, numbers, dots, underscores, and hyphens." };
  }

  const knowledgeType = typeof record.knowledgeType === "string" ? record.knowledgeType : "insurance_policy";
  if (!isKnowledgeType(knowledgeType)) {
    return { ok: false, error: "Knowledge type must be one of: sop, insurance_policy, shop_doc, reference." };
  }

  return {
    ok: true,
    value: {
      content,
      batchId,
      knowledgeType,
      dryRun: record.dryRun !== false,
    },
  };
}

function normalizeBatchId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

function isKnowledgeType(value: string): value is KnowledgeType {
  return knowledgeTypes.includes(value as KnowledgeType);
}
