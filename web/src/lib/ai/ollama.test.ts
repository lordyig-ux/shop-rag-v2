import { describe, expect, it } from "vitest";

import { generateOllamaAnswer } from "./ollama";

const chunks = [
  {
    chunkId: "scan_chunk_1",
    title: "Scanning guide",
    category: "Policies",
    text: "Pre-repair and post-repair scans must be documented.",
    sourceUrl: "https://example.test/scanning.pdf",
    sourceRef: "scanning.pdf",
    pageNumber: 4,
    pageRange: "4",
    knowledgeType: "insurance_policy" as const,
    score: 0.91,
  },
];

describe("generateOllamaAnswer", () => {
  it("falls back when no Ollama API key is configured", async () => {
    const response = await generateOllamaAnswer({
      question: "What does the guide say about scans?",
      chunks,
      config: { apiKey: "", host: "https://ollama.com", model: "gpt-oss:120b" },
    });

    expect(response).toEqual({
      answer: "",
      usedAi: false,
      warnings: ["ollama_api_key_missing"],
    });
  });

  it("parses Ollama chat responses", async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify({
          message: { content: "Scans must be documented before and after repair." },
        }),
        { status: 200 },
      );

    const response = await generateOllamaAnswer({
      question: "What does the guide say about scans?",
      chunks,
      config: { apiKey: "test-key", host: "https://ollama.com", model: "gpt-oss:120b" },
      fetchImpl,
    });

    expect(response).toEqual({
      answer: "Scans must be documented before and after repair.",
      usedAi: true,
      warnings: [],
    });
  });

  it("falls back on Ollama API errors", async () => {
    const fetchImpl = async () => new Response("nope", { status: 429 });

    const response = await generateOllamaAnswer({
      question: "What does the guide say about scans?",
      chunks,
      config: { apiKey: "test-key", host: "https://ollama.com", model: "gpt-oss:120b" },
      fetchImpl,
    });

    expect(response).toEqual({
      answer: "",
      usedAi: false,
      warnings: ["ollama_request_failed:429"],
    });
  });
});
