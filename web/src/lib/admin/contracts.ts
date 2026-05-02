export type AdminCountByKnowledgeType = {
  sop: number;
  insurance_policy: number;
  shop_doc: number;
  reference: number;
};

export type AdminBatchSummary = {
  batchId: string;
  sources: number;
  chunks: number;
  importedAt: number;
};

export type AdminRecentQuery = {
  question: string;
  resultCount: number;
  usedAi: boolean;
  warnings: string[];
  createdAt: number;
};

export type AdminSourceSample = {
  title: string;
  category: string;
  knowledgeType: keyof AdminCountByKnowledgeType;
  sourceUrl: string | null;
  importedBatchId: string;
  importedAt: number;
};

export type AdminOverview = {
  sourceCount: number;
  chunkCount: number;
  queryCount: number;
  latestImportAt: number | null;
  chunksByKnowledgeType: AdminCountByKnowledgeType;
  sourcesByKnowledgeType: AdminCountByKnowledgeType;
  batches: AdminBatchSummary[];
  recentQueries: AdminRecentQuery[];
  sourceSamples: AdminSourceSample[];
};

export type AdminAiHealth = {
  checkedAt: number;
  configured: boolean;
  host: string;
  model: string;
  ok: boolean;
  usedAi: boolean;
  warnings: string[];
};

export type AdminSignal = {
  label: string;
  tone: "good" | "warn" | "neutral";
  message: string;
};
