export type AdminCountByKnowledgeType = {
  sop: number;
  insurance_policy: number;
  shop_doc: number;
  reference: number;
};

export type AdminBatchSummary = {
  batchId: string;
  label: string;
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

export type AdminShopDocument = {
  documentKey: string;
  title: string;
  fileType: string;
  sourceRef: string;
  sourceUrl: string | null;
  sourceCount: number;
  chunkCount: number;
  importedBatchId: string;
  importedAt: number;
  modifiedAt: string;
};

export type AdminMaintenanceRun = {
  jobType: "icbc_check" | "icbc_refresh" | "mitchell_ceg_refresh" | "shop_docs_import";
  status: "running" | "succeeded" | "failed";
  summary: string;
  detailJson: string;
  createdByEmail: string;
  createdAt: number;
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
  shopDocuments: AdminShopDocument[];
  maintenanceRuns: AdminMaintenanceRun[];
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
