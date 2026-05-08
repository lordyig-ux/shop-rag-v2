import { describe, expect, it } from "vitest";

import { buildAdminOverviewSummaries } from "./adminOverviewSummary";

describe("buildAdminOverviewSummaries", () => {
  it("creates lightweight dashboard summaries without returning chunk text", () => {
    const summaries = buildAdminOverviewSummaries(
      [
        {
          sourceId: "icbc-1",
          title: "ICBC Review Required",
          category: "Estimating",
          sourceRef: "icbc-review",
          sourceUrl: "https://example.test/icbc",
          fileType: "html",
          knowledgeType: "insurance_policy",
          modifiedAt: "2026-05-01",
          importedBatchId: "icbc-refresh-1",
          importedAt: 100,
        },
        {
          sourceId: "shop-1",
          title: "Family Ford Contact",
          category: "Contacts",
          sourceRef: "shop-doc-upload:family-ford.docx",
          sourceUrl: "https://blob.test/family-ford.docx",
          fileType: "docx",
          knowledgeType: "shop_doc",
          modifiedAt: "2026-05-02",
          importedBatchId: "shop-docs-1",
          importedAt: 200,
        },
      ],
      [
        {
          chunkId: "chunk-1",
          sourceRef: "icbc-review",
          knowledgeType: "insurance_policy",
          importedBatchId: "icbc-refresh-1",
          importedAt: 101,
        },
        {
          chunkId: "chunk-2",
          sourceRef: "shop-doc-upload:family-ford.docx",
          knowledgeType: "shop_doc",
          importedBatchId: "shop-docs-1",
          importedAt: 201,
        },
      ],
      300,
    );

    expect(summaries.stats).toMatchObject({
      sourceCount: 2,
      chunkCount: 2,
      latestImportAt: 201,
      updatedAt: 300,
      sourcesByKnowledgeType: {
        sop: 0,
        insurance_policy: 1,
        shop_doc: 1,
        reference: 0,
      },
      chunksByKnowledgeType: {
        sop: 0,
        insurance_policy: 1,
        shop_doc: 1,
        reference: 0,
      },
    });
    expect(summaries.batches[0]).toEqual({
      batchId: "shop-docs-1",
      label: "Family Ford Contact",
      sources: 1,
      chunks: 1,
      importedAt: 201,
    });
    expect(summaries.shopDocuments[0]).toMatchObject({
      documentKey: "family-ford.docx",
      title: "Family Ford Contact",
      chunkCount: 1,
      sourceCount: 1,
    });
    expect(JSON.stringify(summaries)).not.toContain("full searchable chunk text");
  });
});
