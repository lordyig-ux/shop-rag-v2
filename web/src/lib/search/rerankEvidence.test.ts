import { describe, expect, it } from "vitest";

import type { EvidenceChunk } from "./contracts";
import { applyChunkIdRanking } from "./rerankEvidence";

const chunks: EvidenceChunk[] = [
  chunk("ceg_back_panel", "18 Pickup Cab Panels"),
  chunk("ceg_quarter_panel", "20 Quarter Panel"),
  chunk("ats_compensation", "Alternative Transportation Service compensation"),
  chunk("ats_sublet", "ATS sublet conversion"),
];

describe("applyChunkIdRanking", () => {
  it("orders chunks by ranked ids and recomputes display scores", () => {
    const result = applyChunkIdRanking(chunks, ["ats_compensation", "ats_sublet"], 3);

    expect(result.warnings).toEqual([]);
    expect(result.chunks.map((item) => item.chunkId)).toEqual(["ats_compensation", "ats_sublet", "ceg_back_panel"]);
    expect(result.chunks.map((item) => item.score)).toEqual([1, 0.95, 0.9]);
  });

  it("ignores unknown and duplicate ids", () => {
    const result = applyChunkIdRanking(chunks, ["missing", "ats_compensation", "ats_compensation"], 4);

    expect(result.chunks.map((item) => item.chunkId)).toEqual([
      "ats_compensation",
      "ceg_back_panel",
      "ceg_quarter_panel",
      "ats_sublet",
    ]);
  });

  it("falls back to original order when no ranked ids match", () => {
    const result = applyChunkIdRanking(chunks, ["missing"], 2);

    expect(result.warnings).toEqual(["rerank_no_matching_ids"]);
    expect(result.chunks.map((item) => item.chunkId)).toEqual(["ceg_back_panel", "ceg_quarter_panel"]);
  });
});

function chunk(chunkId: string, title: string): EvidenceChunk {
  return {
    chunkId,
    title,
    category: "Test",
    text: `${title} excerpt`,
    sourceUrl: null,
    sourceRef: title,
    pageNumber: null,
    pageRange: null,
    knowledgeType: "shop_doc",
    score: 0.5,
  };
}
