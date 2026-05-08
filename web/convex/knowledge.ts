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
const maintenanceJobType = v.union(
  v.literal("icbc_check"),
  v.literal("icbc_refresh"),
  v.literal("mitchell_ceg_refresh"),
  v.literal("shop_docs_import"),
);
const maintenanceStatus = v.union(v.literal("running"), v.literal("succeeded"), v.literal("failed"));
const feedbackRating = v.union(
  v.literal("up"),
  v.literal("down"),
  v.literal("helpful"),
  v.literal("not_helpful"),
  v.literal("missing_info"),
  v.literal("wrong_source"),
);
const usageTopSource = v.object({
  title: v.string(),
  sourceRef: v.string(),
  sourceUrl: v.union(v.string(), v.null()),
  rank: v.number(),
});

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

export const deleteIcbcSourcesExceptBatchPage = mutationGeneric({
  args: {
    importSecret: v.optional(v.string()),
    keepBatchId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.importSecret);

    const keepBatchId = args.keepBatchId.trim();
    if (!keepBatchId) {
      throw new Error("Batch ID is required");
    }

    const limit = Math.max(1, Math.min(args.limit || 200, 500));
    const chunks = (await ctx.db.query("chunks").collect())
      .filter((chunk) => chunk.importedBatchId !== keepBatchId && isIcbcSource(chunk.sourceRef, chunk.sourceUrl))
      .slice(0, limit);
    const sources = (await ctx.db.query("sources").collect())
      .filter((source) => source.importedBatchId !== keepBatchId && isIcbcSource(source.sourceRef, source.sourceUrl))
      .slice(0, limit);

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

export const deleteSourcesBySourceRefExceptBatchPage = mutationGeneric({
  args: {
    importSecret: v.optional(v.string()),
    keepBatchId: v.string(),
    sourceRefs: v.array(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.importSecret);

    const keepBatchId = args.keepBatchId.trim();
    const sourceRefs = new Set(args.sourceRefs.map((sourceRef) => sourceRef.trim()).filter(Boolean));
    if (!keepBatchId || !sourceRefs.size) {
      throw new Error("Batch ID and source refs are required");
    }

    const limit = Math.max(1, Math.min(args.limit || 200, 500));
    const chunks = (await ctx.db.query("chunks").collect())
      .filter((chunk) => chunk.importedBatchId !== keepBatchId && sourceRefs.has(chunk.sourceRef))
      .slice(0, limit);
    const sources = (await ctx.db.query("sources").collect())
      .filter((source) => source.importedBatchId !== keepBatchId && sourceRefs.has(source.sourceRef))
      .slice(0, limit);

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

export const deleteSourcesBySourceRefPage = mutationGeneric({
  args: {
    importSecret: v.optional(v.string()),
    sourceRef: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.importSecret);

    const sourceRef = args.sourceRef.trim();
    if (!sourceRef) {
      throw new Error("Source ref is required");
    }

    const limit = Math.max(1, Math.min(args.limit || 200, 500));
    const chunks = (await ctx.db.query("chunks").collect())
      .filter((chunk) => chunk.sourceRef === sourceRef)
      .slice(0, limit);
    const sources = (await ctx.db.query("sources").collect())
      .filter((source) => source.sourceRef === sourceRef)
      .slice(0, limit);

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

export const deleteSourcesByUrlPrefixExceptBatchPage = mutationGeneric({
  args: {
    importSecret: v.optional(v.string()),
    keepBatchId: v.string(),
    urlPrefix: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.importSecret);

    const keepBatchId = args.keepBatchId.trim();
    const urlPrefix = args.urlPrefix.trim().toLowerCase();
    if (!keepBatchId || !urlPrefix) {
      throw new Error("Batch ID and URL prefix are required");
    }

    const limit = Math.max(1, Math.min(args.limit || 200, 500));
    const chunks = (await ctx.db.query("chunks").collect())
      .filter((chunk) => chunk.importedBatchId !== keepBatchId && sourceMatchesPrefix(chunk, urlPrefix))
      .slice(0, limit);
    const sources = (await ctx.db.query("sources").collect())
      .filter((source) => source.importedBatchId !== keepBatchId && sourceMatchesPrefix(source, urlPrefix))
      .slice(0, limit);

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
    const [sources, chunks, recentQueries, recentMaintenanceRuns] = await Promise.all([
      ctx.db.query("sources").collect(),
      ctx.db.query("chunks").collect(),
      ctx.db.query("queryLogs").withIndex("by_createdAt").order("desc").take(12),
      ctx.db.query("maintenanceRuns").withIndex("by_createdAt").order("desc").take(8),
    ]);

    const sourcesByKnowledgeType = countByKnowledgeType(sources);
    const chunksByKnowledgeType = countByKnowledgeType(chunks);
    const batchMap = new Map<string, { sources: Set<string>; chunks: number; importedAt: number; titles: Map<string, number> }>();

    for (const source of sources) {
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

    const batches = Array.from(batchMap.entries())
      .map(([batchId, batch]) => ({
        batchId,
        label: batchLabel(batchId, batch.titles),
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

    const chunkCountsBySourceRef = new Map<string, number>();
    for (const chunk of chunks) {
      chunkCountsBySourceRef.set(chunk.sourceRef, (chunkCountsBySourceRef.get(chunk.sourceRef) || 0) + 1);
    }

    const shopDocumentMap = new Map<
      string,
      {
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
      }
    >();

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

    const shopDocuments = Array.from(shopDocumentMap.values()).sort((left, right) => right.importedAt - left.importedAt);

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
      shopDocuments,
      maintenanceRuns: recentMaintenanceRuns.map((run) => ({
        jobType: run.jobType,
        status: run.status,
        summary: run.summary,
        detailJson: run.detailJson,
        createdByEmail: run.createdByEmail,
        createdAt: run.createdAt,
      })),
    };
  },
});

export const icbcSourceSnapshot = queryGeneric({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db.query("sources").collect();

    return sources
      .filter((source) => isIcbcSource(source.sourceRef, source.sourceUrl))
      .map((source) => ({
        title: source.title,
        sourceRef: source.sourceRef,
        sourceUrl: source.sourceUrl,
        importedBatchId: source.importedBatchId,
        importedAt: source.importedAt,
      }));
  },
});

export const recordMaintenanceRun = mutationGeneric({
  args: {
    importSecret: v.optional(v.string()),
    jobType: maintenanceJobType,
    status: maintenanceStatus,
    summary: v.string(),
    detailJson: v.string(),
    createdByEmail: v.string(),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.importSecret);

    await ctx.db.insert("maintenanceRuns", {
      jobType: args.jobType,
      status: args.status,
      summary: args.summary,
      detailJson: args.detailJson,
      createdByEmail: args.createdByEmail,
      createdAt: Date.now(),
    });

    return null;
  },
});

export const logQuery = mutationGeneric({
  args: {
    question: v.string(),
    resultCount: v.number(),
    usedAi: v.boolean(),
    warnings: v.array(v.string()),
    sessionId: v.optional(v.string()),
    responseTimeMs: v.optional(v.number()),
    topSources: v.optional(v.array(usageTopSource)),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("queryLogs", {
      question: args.question,
      normalizedQuestion: args.question.trim().toLowerCase(),
      resultCount: args.resultCount,
      usedAi: args.usedAi,
      warnings: args.warnings,
      ...(args.sessionId ? { sessionId: args.sessionId } : {}),
      ...(typeof args.responseTimeMs === "number" ? { responseTimeMs: args.responseTimeMs } : {}),
      ...(args.topSources ? { topSources: args.topSources } : {}),
      createdAt: Date.now(),
    });
  },
});

export const logSourceClick = mutationGeneric({
  args: {
    question: v.string(),
    chunkId: v.string(),
    title: v.string(),
    sourceUrl: v.union(v.string(), v.null()),
    sourceRank: v.number(),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sourceClicks", {
      question: args.question,
      chunkId: args.chunkId,
      title: args.title,
      sourceUrl: args.sourceUrl,
      sourceRank: args.sourceRank,
      ...(args.sessionId ? { sessionId: args.sessionId } : {}),
      createdAt: Date.now(),
    });
  },
});

export const recordFeedback = mutationGeneric({
  args: {
    question: v.string(),
    answer: v.string(),
    rating: feedbackRating,
    comment: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    topSourceTitle: v.optional(v.string()),
    topSourceRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("feedback", {
      question: args.question,
      answer: args.answer,
      rating: args.rating,
      ...(args.comment ? { comment: args.comment } : {}),
      ...(args.sessionId ? { sessionId: args.sessionId } : {}),
      ...(args.topSourceTitle ? { topSourceTitle: args.topSourceTitle } : {}),
      ...(args.topSourceRef ? { topSourceRef: args.topSourceRef } : {}),
      createdAt: Date.now(),
    });
  },
});

export const adminUsageAnalytics = queryGeneric({
  args: {
    importSecret: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertImportSecret(args.importSecret);

    const limit = Math.max(1, Math.min(args.limit || 500, 1000));
    const [queryLogs, sourceClicks, feedback] = await Promise.all([
      ctx.db.query("queryLogs").withIndex("by_createdAt").order("desc").take(limit),
      ctx.db.query("sourceClicks").withIndex("by_createdAt").order("desc").take(limit),
      ctx.db.query("feedback").withIndex("by_createdAt").order("desc").take(limit),
    ]);

    return {
      queryLogs: queryLogs.map((log) => ({
        question: log.question,
        normalizedQuestion: log.normalizedQuestion,
        resultCount: log.resultCount,
        usedAi: log.usedAi,
        warnings: log.warnings,
        createdAt: log.createdAt,
        ...(typeof log.responseTimeMs === "number" ? { responseTimeMs: log.responseTimeMs } : {}),
        topSources: log.topSources || [],
      })),
      sourceClicks: sourceClicks.map((click) => ({
        question: click.question,
        chunkId: click.chunkId,
        title: click.title,
        sourceUrl: click.sourceUrl,
        sourceRank: click.sourceRank,
        createdAt: click.createdAt,
      })),
      feedback: feedback.map((item) => ({
        question: item.question,
        answer: item.answer,
        rating: item.rating,
        ...(item.comment ? { comment: item.comment } : {}),
        ...(item.topSourceTitle ? { topSourceTitle: item.topSourceTitle } : {}),
        ...(item.topSourceRef ? { topSourceRef: item.topSourceRef } : {}),
        createdAt: item.createdAt,
      })),
    };
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

function documentKeyFromSourceRef(sourceRef: string) {
  return sourceRef.startsWith("shop-doc-upload:") ? sourceRef.slice("shop-doc-upload:".length) : sourceRef;
}

function batchLabel(batchId: string, titles: Map<string, number>) {
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

function isIcbcSource(sourceRef: string, sourceUrl: string | null) {
  const values = [sourceRef, sourceUrl || ""].map((value) => value.toLowerCase());
  return values.some(
    (value) =>
      value.includes("mdp.partners.icbc.com/topic") ||
      value.includes("mdp.partners.icbc.com/topics") ||
      value.includes("damg-"),
  );
}

function sourceMatchesPrefix(row: { sourceRef: string; sourceUrl: string | null }, prefix: string) {
  return [row.sourceRef, row.sourceUrl || ""].some((value) => value.toLowerCase().startsWith(prefix));
}
