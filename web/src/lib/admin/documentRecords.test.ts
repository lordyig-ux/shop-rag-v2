import { describe, expect, it } from "vitest";

import {
  buildPageRecords,
  buildTextRecords,
  htmlToReadableMarkdown,
  makeMaintenanceBatchId,
} from "./documentRecords";

describe("htmlToReadableMarkdown", () => {
  it("turns a focused HTML block into readable markdown", () => {
    expect(
      htmlToReadableMarkdown(`
        <div role="main">
          <h1>Procedure Explanations</h1>
          <p>The Procedure Explanations are essential.</p>
          <ul><li>Included operation</li><li>Not included operation</li></ul>
        </div>
      `),
    ).toBe(
      [
        "# Procedure Explanations",
        "The Procedure Explanations are essential.",
        "- Included operation",
        "- Not included operation",
      ].join("\n\n"),
    );
  });
});

describe("buildTextRecords", () => {
  it("builds chunk records for a hosted HTML shop document", () => {
    const result = buildTextRecords({
      batchId: "shop-docs-2026-05-02-223005",
      category: "Mitchell CEG",
      fileType: "html",
      knowledgeType: "shop_doc",
      modifiedAt: "2026-05-02",
      sourceRef: "https://example.test/ceg020000.htm",
      sourceUrl: "https://example.test/ceg020000.htm",
      text: "# Procedure Explanations\n\nThe Procedure Explanations are essential.",
      title: "Procedure Explanations",
      maxChunkChars: 500,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].source).toEqual({
      sourceId: "shop_doc:https://example.test/ceg020000.htm",
      title: "Procedure Explanations",
      category: "Mitchell CEG",
      sourceRef: "https://example.test/ceg020000.htm",
      sourceUrl: "https://example.test/ceg020000.htm",
      fileType: "html",
      knowledgeType: "shop_doc",
      contentHash: expect.stringMatching(/^[a-f0-9]{40}$/),
      modifiedAt: "2026-05-02",
      importedBatchId: "shop-docs-2026-05-02-223005",
    });
    expect(result.records[0].chunk).toMatchObject({
      chunkId: expect.stringMatching(/^[a-f0-9]{12}_chunk_0$/),
      sourceId: "shop_doc:https://example.test/ceg020000.htm",
      sourceUrl: "https://example.test/ceg020000.htm",
      pageNumber: null,
    });
  });
});

describe("buildPageRecords", () => {
  it("builds page-linked PDF records", () => {
    const result = buildPageRecords({
      batchId: "shop-docs-2026-05-02-223005",
      category: "ICBC Collision Repair Program",
      fileType: "pdf",
      knowledgeType: "shop_doc",
      modifiedAt: "2025-04-01",
      pages: [
        { pageNumber: 1, text: "Collision Repair program guide" },
        { pageNumber: 2, text: "Table of contents" },
      ],
      sourceRef: "https://example.test/collision-program-guide.pdf",
      sourceUrl: "https://example.test/collision-program-guide.pdf",
      title: "Collision Repair Program Guide",
      maxChunkChars: 500,
    });

    expect(result.records).toHaveLength(2);
    expect(result.records[0].source.sourceUrl).toBe("https://example.test/collision-program-guide.pdf#page=1");
    expect(result.records[0].chunk.sourceUrl).toBe("https://example.test/collision-program-guide.pdf#page=1");
    expect(result.records[0].chunk.pageNumber).toBe(1);
    expect(result.records[1].chunk.pageNumber).toBe(2);
  });
});

describe("makeMaintenanceBatchId", () => {
  it("uses a timestamped prefix", () => {
    expect(makeMaintenanceBatchId("shop-docs", new Date("2026-05-02T22:30:05.000Z"))).toBe(
      "shop-docs-2026-05-02-223005",
    );
  });
});
