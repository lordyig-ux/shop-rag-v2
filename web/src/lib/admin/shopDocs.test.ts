import { describe, expect, it } from "vitest";

import {
  COLLISION_PROGRAM_GUIDE_URL,
  buildShopDocTextRecords,
  shopDocsNoRecordsError,
  parseShopDocUrlImportRequest,
} from "./shopDocs";

describe("parseShopDocUrlImportRequest", () => {
  it("normalizes public URL import requests", () => {
    expect(
      parseShopDocUrlImportRequest({
        urls: ` ${COLLISION_PROGRAM_GUIDE_URL}\nhttps://example.test/guide.html `,
      }),
    ).toEqual({
      ok: true,
      value: {
        urls: [COLLISION_PROGRAM_GUIDE_URL, "https://example.test/guide.html"],
      },
    });
  });

  it("rejects empty or non-http URL requests", () => {
    expect(parseShopDocUrlImportRequest({ urls: "" })).toEqual({
      ok: false,
      error: "Enter at least one public document URL.",
    });
    expect(parseShopDocUrlImportRequest({ urls: "file:///C:/secret.pdf" })).toEqual({
      ok: false,
      error: "Only http and https document URLs can be imported.",
    });
  });
});

describe("buildShopDocTextRecords", () => {
  it("uses the original source URL for HTML/text imports", () => {
    const result = buildShopDocTextRecords({
      batchId: "shop-docs-2026-05-02-223005",
      fileType: "html",
      modifiedAt: "2026-05-02",
      sourceUrl: "https://example.test/shop-sop.html",
      text: "# Shop SOP\n\nCheck the vehicle before release.",
      title: "Shop SOP",
      maxChunkChars: 500,
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0].source).toMatchObject({
      title: "Shop SOP",
      category: "Shop Docs",
      sourceRef: "https://example.test/shop-sop.html",
      sourceUrl: "https://example.test/shop-sop.html",
      fileType: "html",
      knowledgeType: "shop_doc",
    });
  });
});

describe("shopDocsNoRecordsError", () => {
  it("includes the first skipped URL error so production PDF failures are visible", () => {
    expect(
      shopDocsNoRecordsError([
        {
          url: COLLISION_PROGRAM_GUIDE_URL,
          error: "Cannot find module pdf.worker.mjs",
        },
      ]),
    ).toBe(
      `Shop Docs import failed: no records were extracted. First skipped URL: ${COLLISION_PROGRAM_GUIDE_URL} - Cannot find module pdf.worker.mjs`,
    );
  });
});
