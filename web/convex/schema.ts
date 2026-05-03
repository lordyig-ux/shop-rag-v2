import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const knowledgeType = v.union(
  v.literal("sop"),
  v.literal("insurance_policy"),
  v.literal("shop_doc"),
  v.literal("reference"),
);

const maintenanceJobType = v.union(
  v.literal("icbc_check"),
  v.literal("icbc_refresh"),
  v.literal("mitchell_ceg_refresh"),
  v.literal("shop_docs_import"),
);

const maintenanceStatus = v.union(v.literal("running"), v.literal("succeeded"), v.literal("failed"));

export default defineSchema({
  sources: defineTable({
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
    importedAt: v.number(),
  })
    .index("by_sourceId", ["sourceId"])
    .index("by_knowledgeType", ["knowledgeType"])
    .index("by_importedBatchId", ["importedBatchId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["knowledgeType", "importedBatchId"],
    }),

  chunks: defineTable({
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
    importedAt: v.number(),
  })
    .index("by_chunkId", ["chunkId"])
    .index("by_sourceId", ["sourceId"])
    .index("by_knowledgeType", ["knowledgeType"])
    .index("by_importedBatchId", ["importedBatchId"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["knowledgeType", "importedBatchId"],
    })
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["knowledgeType", "importedBatchId"],
    })
    .searchIndex("search_category", {
      searchField: "category",
      filterFields: ["knowledgeType", "importedBatchId"],
    }),

  queryLogs: defineTable({
    question: v.string(),
    normalizedQuestion: v.string(),
    resultCount: v.number(),
    usedAi: v.boolean(),
    warnings: v.array(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  feedback: defineTable({
    question: v.string(),
    answer: v.string(),
    rating: v.union(v.literal("up"), v.literal("down")),
    comment: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_createdAt", ["createdAt"]),

  maintenanceRuns: defineTable({
    jobType: maintenanceJobType,
    status: maintenanceStatus,
    summary: v.string(),
    detailJson: v.string(),
    createdByEmail: v.string(),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_jobType_createdAt", ["jobType", "createdAt"]),
});
