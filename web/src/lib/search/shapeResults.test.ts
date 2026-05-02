import { describe, expect, it } from "vitest";

import { shapeSearchResponse } from "./shapeResults";

describe("shapeSearchResponse", () => {
  it("returns a low-evidence response when no chunks are found", () => {
    const response = shapeSearchResponse({
      question: "What is the aluminum repair SOP?",
      chunks: [],
      usedAi: false,
    });

    expect(response).toEqual({
      question: "What is the aluminum repair SOP?",
      answer: "I could not find enough evidence in the indexed knowledge base to answer that reliably.",
      citations: [],
      resultCount: 0,
      usedAi: false,
      warnings: ["low_retrieval_confidence"],
    });
  });

  it("uses an AI answer and formats citations with page-aware links", () => {
    const response = shapeSearchResponse({
      question: "What does the guide say about scans?",
      usedAi: true,
      aiAnswer: "Pre-repair and post-repair scans must be documented.",
      chunks: [
        {
          chunkId: "scan_chunk_1",
          title: "Scanning guide",
          category: "Policies",
          text: "Pre-repair scan excerpt from page 4.",
          sourceUrl: "https://example.test/scanning.pdf",
          sourceRef: "scanning.pdf",
          pageNumber: 4,
          pageRange: "4",
          knowledgeType: "insurance_policy",
          score: 0.91,
        },
      ],
    });

    expect(response.answer).toBe("Pre-repair and post-repair scans must be documented.");
    expect(response.resultCount).toBe(1);
    expect(response.usedAi).toBe(true);
    expect(response.citations[0]).toEqual({
      chunkId: "scan_chunk_1",
      title: "Scanning guide",
      category: "Policies",
      sourceUrl: "https://example.test/scanning.pdf",
      sourceUrlWithPage: "https://example.test/scanning.pdf#page=4",
      sourceRef: "scanning.pdf",
      pageNumber: 4,
      pageRange: "4",
      knowledgeType: "insurance_policy",
      score: 0.91,
      excerpt: "Pre-repair scan excerpt from page 4.",
    });
  });
});
