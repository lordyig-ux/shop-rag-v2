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
