import { describe, expect, it } from "vitest";

import { summarizeUsageAnalytics } from "./usageStats";

describe("summarizeUsageAnalytics", () => {
  it("summarizes searches, source clicks, feedback, and review candidates", () => {
    const summary = summarizeUsageAnalytics({
      queryLogs: [
        {
          question: "When does the structural aluminum repair rate apply?",
          normalizedQuestion: "when does the structural aluminum repair rate apply?",
          resultCount: 8,
          usedAi: true,
          warnings: [],
          createdAt: 10,
          responseTimeMs: 1200,
          topSources: [{ title: "Structural aluminum repair rate guidelines", sourceRef: "aluminum", sourceUrl: null, rank: 1 }],
        },
        {
          question: "Family Ford contact",
          normalizedQuestion: "family ford contact",
          resultCount: 0,
          usedAi: false,
          warnings: ["low_retrieval_confidence"],
          createdAt: 9,
          responseTimeMs: 400,
          topSources: [],
        },
        {
          question: "Family Ford contact",
          normalizedQuestion: "family ford contact",
          resultCount: 0,
          usedAi: false,
          warnings: ["low_retrieval_confidence"],
          createdAt: 8,
          responseTimeMs: 450,
          topSources: [],
        },
      ],
      sourceClicks: [
        {
          question: "When does the structural aluminum repair rate apply?",
          chunkId: "aluminum-1",
          title: "Structural aluminum repair rate guidelines",
          sourceUrl: null,
          sourceRank: 1,
          createdAt: 11,
        },
      ],
      feedback: [
        {
          question: "Family Ford contact",
          answer: "I could not find enough evidence.",
          rating: "missing_info",
          createdAt: 12,
        },
      ],
    });

    expect(summary.totals).toEqual({
      searches: 3,
      sourceClicks: 1,
      helpful: 0,
      needsReview: 3,
      noResultSearches: 2,
      averageResponseTimeMs: 683,
    });
    expect(summary.topSearches[0]).toEqual({ question: "Family Ford contact", count: 2 });
    expect(summary.mostClickedSources[0]).toEqual({
      title: "Structural aluminum repair rate guidelines",
      sourceUrl: null,
      clicks: 1,
    });
    expect(summary.reviewCandidates.map((candidate) => candidate.question)).toEqual(["Family Ford contact"]);
  });
});
