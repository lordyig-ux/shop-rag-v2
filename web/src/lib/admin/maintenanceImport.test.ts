import { describe, expect, it } from "vitest";

import { parseMaintenanceImportRequest } from "./maintenanceImport";

describe("parseMaintenanceImportRequest", () => {
  it("normalizes a valid import request", () => {
    expect(
      parseMaintenanceImportRequest({
        content: "{\"id\":\"one\",\"text\":\"hello\"}",
        batch: " Public Safe V2 ",
        knowledgeType: "shop_doc",
        dryRun: false,
      }),
    ).toEqual({
      ok: true,
      value: {
        content: "{\"id\":\"one\",\"text\":\"hello\"}",
        batchId: "public-safe-v2",
        knowledgeType: "shop_doc",
        dryRun: false,
      },
    });
  });

  it("defaults to dry-run and insurance policy imports", () => {
    expect(
      parseMaintenanceImportRequest({
        content: "{\"id\":\"one\",\"text\":\"hello\"}",
        batch: "public-safe-v1",
      }),
    ).toMatchObject({
      ok: true,
      value: {
        batchId: "public-safe-v1",
        knowledgeType: "insurance_policy",
        dryRun: true,
      },
    });
  });

  it("rejects missing content", () => {
    expect(parseMaintenanceImportRequest({ batch: "public-safe-v1" })).toEqual({
      ok: false,
      error: "Upload a JSONL file before importing.",
    });
  });

  it("rejects unsafe batch ids and unknown knowledge types", () => {
    expect(
      parseMaintenanceImportRequest({
        content: "{}",
        batch: "../bad",
      }),
    ).toEqual({
      ok: false,
      error: "Batch ID can only contain letters, numbers, dots, underscores, and hyphens.",
    });

    expect(
      parseMaintenanceImportRequest({
        content: "{}",
        batch: "safe",
        knowledgeType: "bad",
      }),
    ).toEqual({
      ok: false,
      error: "Knowledge type must be one of: sop, insurance_policy, shop_doc, reference.",
    });
  });
});
