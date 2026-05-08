import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import { AnswerPanel } from "./AnswerPanel";

describe("AnswerPanel", () => {
  it("renders answers, warnings, and citations", () => {
    render(
      <AnswerPanel
        response={{
          question: "What does the guide say about scans?",
          answer: "Scans must be documented.",
          resultCount: 1,
          usedAi: true,
          warnings: ["public_safe_docs_only"],
          citations: [
            {
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
              excerpt: "Pre-repair scan excerpt.",
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Answer" })).toBeInTheDocument();
    expect(screen.getByText("Scans must be documented.")).toBeInTheDocument();
    expect(screen.getByText("public_safe_docs_only")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open page 4" })).toHaveAttribute(
      "href",
      "https://example.test/scanning.pdf#page=4",
    );
    expect(screen.getByText("Pre-repair scan excerpt.")).toBeInTheDocument();
  });

  it("reports source clicks and feedback", async () => {
    const user = userEvent.setup();
    const handleSourceClick = vi.fn();
    const handleFeedback = vi.fn();

    render(
      <AnswerPanel
        response={{
          question: "What does the guide say about scans?",
          answer: "Scans must be documented.",
          resultCount: 1,
          usedAi: true,
          warnings: [],
          citations: [
            {
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
              excerpt: "Pre-repair scan excerpt.",
            },
          ],
        }}
        onFeedback={handleFeedback}
        onSourceClick={handleSourceClick}
      />,
    );

    await user.click(screen.getByRole("link", { name: "Open page 4" }));
    expect(handleSourceClick).toHaveBeenCalledWith(expect.objectContaining({ chunkId: "scan_chunk_1" }), 0);

    await user.click(screen.getByRole("button", { name: "Missing info" }));
    expect(handleFeedback).toHaveBeenCalledWith("missing_info");
  });
});
