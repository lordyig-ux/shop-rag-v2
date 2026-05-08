export type KnowledgeTypeValue = "sop" | "insurance_policy" | "shop_doc" | "reference";

export type KnowledgeCounts = Record<KnowledgeTypeValue, number>;

export type SummarySourceRow = {
  sourceId: string;
  title: string;
  category: string;
  sourceRef: string;
  sourceUrl: string | null;
  fileType: string;
  knowledgeType: KnowledgeTypeValue;
  modifiedAt: string;
  importedBatchId: string;
  importedAt: number;
};

export type SummaryChunkRow = {
  chunkId: string;
  sourceRef: string;
  knowledgeType: KnowledgeTypeValue;
  importedBatchId: string;
  importedAt: number;
};

export type AdminStatsSummary = {
  key: "overview";
  sourceCount: number;
  chunkCount: number;
  latestImportAt: number | null;
  sourcesByKnowledgeType: KnowledgeCounts;
  chunksByKnowledgeType: KnowledgeCounts;
  updatedAt: number;
};

export type ImportBatchSummary = {
  batchId: string;
  label: string;
  sources: number;
  chunks: number;
  importedAt: number;
};

export type ShopDocumentSummary = {
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

export function emptyKnowledgeCounts(): KnowledgeCounts {
  return {
    sop: 0,
    insurance_policy: 0,
    shop_doc: 0,
    reference: 0,
  };
}

export function buildAdminOverviewSummaries(
  sources: SummarySourceRow[],
  chunks: SummaryChunkRow[],
  updatedAt = Date.now(),
) {
  const sourcesByKnowledgeType = emptyKnowledgeCounts();
  const chunksByKnowledgeType = emptyKnowledgeCounts();
  const batchMap = new Map<string, { sources: Set<string>; chunks: number; importedAt: number; titles: Map<string, number> }>();
  const chunkCountsBySourceRef = new Map<string, number>();

  for (const source of sources) {
    sourcesByKnowledgeType[source.knowledgeType] += 1;
    const batch = batchMap.get(source.importedBatchId) || {
      sources: new Set<string>(),
      chunks: 0,
      importedAt: 0,
      titles: new Map<string, number>(),
    };
    batch.sources.add(source.sourceId);
    batch.importedAt = Math.max(batch.importedAt, source.importedAt);
    batch.titles.set(source.title, (batch.titles.get(source.title) || 0) + 1);
    batchMap.set(source.importedBatchId, batch);
  }

  for (const chunk of chunks) {
    chunksByKnowledgeType[chunk.knowledgeType] += 1;
    chunkCountsBySourceRef.set(chunk.sourceRef, (chunkCountsBySourceRef.get(chunk.sourceRef) || 0) + 1);
    const batch = batchMap.get(chunk.importedBatchId) || {
      sources: new Set<string>(),
      chunks: 0,
      importedAt: 0,
      titles: new Map<string, number>(),
    };
    batch.chunks += 1;
    batch.importedAt = Math.max(batch.importedAt, chunk.importedAt);
    batchMap.set(chunk.importedBatchId, batch);
  }

  return {
    stats: {
      key: "overview" as const,
      sourceCount: sources.length,
      chunkCount: chunks.length,
      latestImportAt: Math.max(0, ...sources.map((source) => source.importedAt), ...chunks.map((chunk) => chunk.importedAt)) || null,
      sourcesByKnowledgeType,
      chunksByKnowledgeType,
      updatedAt,
    },
    batches: Array.from(batchMap.entries())
      .map(([batchId, batch]) => ({
        batchId,
        label: batchLabel(batchId, batch.titles),
        sources: batch.sources.size,
        chunks: batch.chunks,
        importedAt: batch.importedAt,
      }))
      .sort((left, right) => right.importedAt - left.importedAt),
    sourceSamples: sources
      .slice()
      .sort((left, right) => right.importedAt - left.importedAt)
      .slice(0, 12)
      .map((source) => ({
        title: source.title,
        category: source.category,
        knowledgeType: source.knowledgeType,
        sourceUrl: source.sourceUrl,
        importedBatchId: source.importedBatchId,
        importedAt: source.importedAt,
      })),
    shopDocuments: buildShopDocumentSummaries(sources, chunkCountsBySourceRef),
  };
}

export function buildShopDocumentSummaries(sources: SummarySourceRow[], chunkCountsBySourceRef: Map<string, number>) {
  const shopDocumentMap = new Map<string, ShopDocumentSummary>();

  for (const source of sources) {
    if (source.knowledgeType !== "shop_doc") {
      continue;
    }

    const current = shopDocumentMap.get(source.sourceRef);
    const importedAt = Math.max(current?.importedAt || 0, source.importedAt);
    const sourceUrl = source.sourceUrl?.split("#page=")[0] || null;
    shopDocumentMap.set(source.sourceRef, {
      documentKey: documentKeyFromSourceRef(source.sourceRef),
      title: importedAt === source.importedAt ? source.title : current?.title || source.title,
      fileType: importedAt === source.importedAt ? source.fileType : current?.fileType || source.fileType,
      sourceRef: source.sourceRef,
      sourceUrl: sourceUrl || current?.sourceUrl || null,
      sourceCount: (current?.sourceCount || 0) + 1,
      chunkCount: chunkCountsBySourceRef.get(source.sourceRef) || current?.chunkCount || 0,
      importedBatchId: importedAt === source.importedAt ? source.importedBatchId : current?.importedBatchId || source.importedBatchId,
      importedAt,
      modifiedAt: importedAt === source.importedAt ? source.modifiedAt : current?.modifiedAt || source.modifiedAt,
    });
  }

  return Array.from(shopDocumentMap.values()).sort((left, right) => right.importedAt - left.importedAt);
}

export function documentKeyFromSourceRef(sourceRef: string) {
  return sourceRef.startsWith("shop-doc-upload:") ? sourceRef.slice("shop-doc-upload:".length) : sourceRef;
}

export function batchLabel(batchId: string, titles: Map<string, number>) {
  const orderedTitles = Array.from(titles.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([title]) => title.trim())
    .filter(Boolean);

  if (!orderedTitles.length) {
    return batchId;
  }

  if (orderedTitles.length === 1) {
    return orderedTitles[0];
  }

  return `${orderedTitles[0]} + ${orderedTitles.length - 1} more`;
}
