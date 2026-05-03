import { describe, expect, it } from "vitest";

import type { AdminAiHealth, AdminOverview } from "./contracts";
import { deriveAdminSignals } from "./adminStatus";

const overview: AdminOverview = {
  sourceCount: 2,
  chunkCount: 5,
  queryCount: 1,
  latestImportAt: 1000,
  chunksByKnowledgeType: {
    sop: 0,
    insurance_policy: 5,
    shop_doc: 0,
    reference: 0,
  },
  sourcesByKnowledgeType: {
    sop: 0,
    insurance_policy: 2,
    shop_doc: 0,
    reference: 0,
  },
  batches: [],
  recentQueries: [],
  sourceSamples: [],
  maintenanceRuns: [],
};

const aiHealth: AdminAiHealth = {
  checkedAt: 2000,
  configured: true,
  host: "https://ollama.com",
  model: "gpt-oss:120b",
  ok: true,
  usedAi: true,
  warnings: [],
};

describe("deriveAdminSignals", () => {
  it("reports ready signals when data and AI are healthy", () => {
    expect(deriveAdminSignals(overview, aiHealth)).toEqual([
      {
        label: "Database",
        tone: "good",
        message: "5 chunks across 2 sources",
      },
      {
        label: "AI",
        tone: "good",
        message: "Ollama answered using gpt-oss:120b",
      },
    ]);
  });

  it("warns when no chunks have been imported", () => {
    const emptyOverview = { ...overview, sourceCount: 0, chunkCount: 0 };
    expect(deriveAdminSignals(emptyOverview, aiHealth)[0]).toEqual({
      label: "Database",
      tone: "warn",
      message: "No chunks imported",
    });
  });

  it("warns when AI health has warnings", () => {
    const unhealthyAi = { ...aiHealth, ok: false, usedAi: false, warnings: ["ollama_request_failed:401"] };
    expect(deriveAdminSignals(overview, unhealthyAi)[1]).toEqual({
      label: "AI",
      tone: "warn",
      message: "ollama_request_failed:401",
    });
  });
});
