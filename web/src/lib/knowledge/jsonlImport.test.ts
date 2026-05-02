import { describe, expect, it } from "vitest";

import { parseChunkJsonl } from "./jsonlImport";

describe("parseChunkJsonl", () => {
  it("normalizes valid JSONL lines and reports skipped lines", () => {
    const text = [
      JSON.stringify({
        id: "scan-policy_chunk_0",
        text: "Scan policy excerpt",
        metadata: {
          title: "Scan policy",
          category: "Policies",
          source_url: "https://example.test/scan",
          content_url: "https://example.test/scan.html",
        },
      }),
      "",
      "{bad json",
      JSON.stringify({ id: "empty", text: "" }),
    ].join("\n");

    const result = parseChunkJsonl(text, {
      batchId: "public-safe-v1",
      defaultKnowledgeType: "insurance_policy",
    });

    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.chunk.chunkId).toBe("scan-policy_chunk_0");
    expect(result.skipped).toEqual([
      { line: 3, reason: "invalid_json" },
      { line: 4, reason: "empty_or_malformed_record" },
    ]);
  });
});
