import { mutationGeneric, queryGeneric } from "convex/server";
import { v } from "convex/values";

import { assertImportSecret } from "./importSecret";

const knowledgeType = v.union(
  v.literal("sop"),
  v.literal("insurance_policy"),
  v.literal("shop_doc"),
  v.literal("reference"),
);

const sourceInput = v.object({
  sourceId: v.string(),
  title: v.string(),
  category: v.string(),
  sourceRef: v.string(),
  sourceUrl: v.union(v.string(), v.null()),
  fileType: v.string(),
  knowledgeType,
  contentHash: v.string(),
  modifiedAt: v.string(),
  importedBatchId: v.string(),
});

const chunkInput = v.object({
  chunkId: v.string(),
  sourceId: v.string(),
  title: v.string(),
  category: v.string(),
  text: v.string(),
  sourceUrl: v.union(v.string(), v.null()),
  sourceRef: v.string(),
  chunkIndex: v.number(),
  totalChunks: v.number(),
  pageNumber: v.union(v.number(), v.null()),
  pageRange: v.union(v.string(), v.null()),
  knowledgeType,
  importedBatchId: v.string(),
});

const searchKnowledgeType = v.union(v.literal("all"), knowledgeType);
type KnowledgeTypeValue = "sop" | "insurance_policy" | "shop_doc" | "reference";

export const upsertImportedChunks = mutationGeneric({
  args: {
    importSecret: v.optional(v.string()),
    records: v.array(
      v.object({
        source: sourceInput,
        chunk: chunkInput,
      }),
    ),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.importSecret);

    const importedAt = Date.now();
    const sources = new Map<string, (typeof args.records)[number]["source"]>();
    let chunksUpserted = 0;

    for (const record of args.records) {
      sources.set(record.source.sourceId, record.source);

      const existingChunk = await ctx.db
        .query("chunks")
        .withIndex("by_chunkId", (q) => q.eq("chunkId", record.chunk.chunkId))
        .first();

      const chunkDoc = { ...record.chunk, importedAt };
      if (existingChunk) {
        await ctx.db.patch(existingChunk._id, chunkDoc);
      } else {
        await ctx.db.insert("chunks", chunkDoc);
      }
      chunksUpserted += 1;
    }

    for (const source of sources.values()) {
      const existingSource = await ctx.db
        .query("sources")
        .withIndex("by_sourceId", (q) => q.eq("sourceId", source.sourceId))
        .first();

      const sourceDoc = { ...source, importedAt };
      if (existingSource) {
        await ctx.db.patch(existingSource._id, sourceDoc);
      } else {
        await ctx.db.insert("sources", sourceDoc);
      }
    }

    return {
      sourcesUpserted: sources.size,
      chunksUpserted,
    };
  },
});

export const deleteImportedBatchPage = mutationGeneric({
  args: {
    importSecret: v.optional(v.string()),
    batchId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.importSecret);

    const batchId = args.batchId.trim();
    if (!batchId) {
      throw new Error("Batch ID is required");
    }

    const limit = Math.max(1, Math.min(args.limit || 200, 500));
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_importedBatchId", (q) => q.eq("importedBatchId", batchId))
      .take(limit);
    const sources = await ctx.db
      .query("sources")
      .withIndex("by_importedBatchId", (q) => q.eq("importedBatchId", batchId))
      .take(limit);

    for (const chunk of chunks) {
      await ctx.db.delete(chunk._id);
    }

    for (const source of sources) {
      await ctx.db.delete(source._id);
    }

    return {
      chunksDeleted: chunks.length,
      sourcesDeleted: sources.length,
      hasMore: chunks.length === limit || sources.length === limit,
    };
  },
});

export const search = queryGeneric({
  args: {
    question: v.string(),
    knowledgeType: v.optional(searchKnowledgeType),
    importedBatchId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const question = args.question.trim();
    if (!question) {
      return [];
    }

    const limit = Math.max(1, Math.min(args.limit || 8, 20));
    const knowledgeFilter = args.knowledgeType || "all";

    const rows = await ctx.db
      .query("chunks")
      .withSearchIndex("search_text", (q) => {
        let search = q.search("text", question);
        if (knowledgeFilter !== "all") {
          search = search.eq("knowledgeType", knowledgeFilter);
        }
        if (args.importedBatchId) {
          search = search.eq("importedBatchId", args.importedBatchId);
        }
        return search;
      })
      .take(limit);

    return rows.map((row, index) => ({
      chunkId: row.chunkId,
      title: row.title,
      category: row.category,
      text: row.text,
      sourceUrl: row.sourceUrl,
      sourceRef: row.sourceRef,
      pageNumber: row.pageNumber,
      pageRange: row.pageRange,
      knowledgeType: row.knowledgeType,
      score: Number((1 - index * 0.05).toFixed(2)),
    }));
  },
});

export const adminOverview = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const [sources, chunks, recentQueries] = await Promise.all([
      ctx.db.query("sources").collect(),
      ctx.db.query("chunks").collect(),
      ctx.db.query("queryLogs").withIndex("by_createdAt").order("desc").take(12),
    ]);

    const sourcesByKnowledgeType = countByKnowledgeType(sources);
    const chunksByKnowledgeType = countByKnowledgeType(chunks);
    const batchMap = new Map<string, { sources: Set<string>; chunks: number; importedAt: number }>();

    for (const source of sources) {
      const batch = batchMap.get(source.importedBatchId) || {
        sources: new Set<string>(),
        chunks: 0,
        importedAt: 0,
      };
      batch.sources.add(source.sourceId);
      batch.importedAt = Math.max(batch.importedAt, source.importedAt);
      batchMap.set(source.importedBatchId, batch);
    }

    for (const chunk of chunks) {
      const batch = batchMap.get(chunk.importedBatchId) || {
        sources: new Set<string>(),
        chunks: 0,
        importedAt: 0,
      };
      batch.chunks += 1;
      batch.importedAt = Math.max(batch.importedAt, chunk.importedAt);
      batchMap.set(chunk.importedBatchId, batch);
    }

    const batches = Array.from(batchMap.entries())
      .map(([batchId, batch]) => ({
        batchId,
        sources: batch.sources.size,
        chunks: batch.chunks,
        importedAt: batch.importedAt,
      }))
      .sort((left, right) => right.importedAt - left.importedAt);

    const sourceSamples = sources
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
      }));

    return {
      sourceCount: sources.length,
      chunkCount: chunks.length,
      queryCount: recentQueries.length,
      latestImportAt: batches[0]?.importedAt || null,
      chunksByKnowledgeType,
      sourcesByKnowledgeType,
      batches,
      recentQueries: recentQueries.map((query) => ({
        question: query.question,
        resultCount: query.resultCount,
        usedAi: query.usedAi,
        warnings: query.warnings,
        createdAt: query.createdAt,
      })),
      sourceSamples,
    };
  },
});

export const logQuery = mutationGeneric({
  args: {
    question: v.string(),
    resultCount: v.number(),
    usedAi: v.boolean(),
    warnings: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("queryLogs", {
      question: args.question,
      normalizedQuestion: args.question.trim().toLowerCase(),
      resultCount: args.resultCount,
      usedAi: args.usedAi,
      warnings: args.warnings,
      createdAt: Date.now(),
    });
  },
});

function countByKnowledgeType<T extends { knowledgeType: KnowledgeTypeValue }>(rows: T[]) {
  const counts = {
    sop: 0,
    insurance_policy: 0,
    shop_doc: 0,
    reference: 0,
  };

  for (const row of rows) {
    counts[row.knowledgeType] += 1;
  }

  return counts;
}
