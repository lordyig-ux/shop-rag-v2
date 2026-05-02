import { describe, expect, it } from "vitest";

import { normalizeChunkRecord } from "./normalizeChunk";

describe("normalizeChunkRecord", () => {
  it("normalizes an ICBC chunk into stable source and chunk records", () => {
    const raw = {
      id: "Policy-on-pre-repair-scanning_chunk_0",
      text: "# Policy on pre-repair and post-repair scanning\n\nShops must document scans.",
      metadata: {
        title: "Policy on pre-repair and post-repair scanning",
        category: "Repairs > Scanning",
        source_url: "https://example.test/policy/scanning",
        content_url: "https://example.test/policy/scanning.html",
        description: "Scanning policy",
        date_modified: "2026-04-01",
        chunk_index: 0,
        total_chunks: 2,
      },
    };

    const normalized = normalizeChunkRecord(raw, {
      batchId: "public-safe-v1",
      defaultKnowledgeType: "insurance_policy",
    });

    expect(normalized.source).toEqual({
      sourceId: "insurance_policy:https://example.test/policy/scanning",
      title: "Policy on pre-repair and post-repair scanning",
      category: "Repairs > Scanning",
      sourceRef: "https://example.test/policy/scanning.html",
      sourceUrl: "https://example.test/policy/scanning",
      fileType: "html",
      knowledgeType: "insurance_policy",
      contentHash: expect.stringMatching(/^[a-f0-9]{40}$/),
      modifiedAt: "2026-04-01",
      importedBatchId: "public-safe-v1",
    });
    expect(normalized.chunk).toEqual({
      chunkId: "Policy-on-pre-repair-scanning_chunk_0",
      sourceId: "insurance_policy:https://example.test/policy/scanning",
      title: "Policy on pre-repair and post-repair scanning",
      category: "Repairs > Scanning",
      text: "# Policy on pre-repair and post-repair scanning\n\nShops must document scans.",
      sourceUrl: "https://example.test/policy/scanning",
      sourceRef: "https://example.test/policy/scanning.html",
      knowledgeType: "insurance_policy",
      chunkIndex: 0,
      totalChunks: 2,
      pageNumber: null,
      pageRange: null,
      importedBatchId: "public-safe-v1",
    });
  });

  it("returns null for malformed or empty chunk records", () => {
    expect(normalizeChunkRecord({}, { batchId: "batch" })).toBeNull();
    expect(normalizeChunkRecord({ id: "x", text: "" }, { batchId: "batch" })).toBeNull();
  });
});
