import { describe, expect, it } from "vitest";

import { shopDocSourceBlobPathname } from "./shopDocSourceFiles";

describe("shopDocSourceBlobPathname", () => {
  it("creates a stable public-source path with the batch id and original extension", () => {
    expect(
      shopDocSourceBlobPathname({
        batchId: "shop-docs-2026-05-05-184650554",
        documentKey: "SOP Estimate scheduling ProgiSync",
        fileName: "SOP Estimate scheduling ProgiSync.docx",
      }),
    ).toBe("shop-docs/sop-estimate-scheduling-progisync/shop-docs-2026-05-05-184650554-sop-estimate-scheduling-progisync.docx");
  });

  it("removes unsafe path characters", () => {
    expect(
      shopDocSourceBlobPathname({
        batchId: "batch:one",
        documentKey: "../Paint & Body",
        fileName: "..\\Paint & Body Rates.xlsx",
      }),
    ).toBe("shop-docs/paint-and-body/batch-one-paint-and-body-rates.xlsx");
  });
});
