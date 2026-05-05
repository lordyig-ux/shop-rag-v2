import { generateOllamaAnswer, rerankOllamaEvidence } from "@/lib/ai/ollama";
import type { EvidenceChunk } from "@/lib/search/contracts";
import { applyChunkIdRanking } from "@/lib/search/rerankEvidence";
import { shapeSearchResponse } from "@/lib/search/shapeResults";

export const runtime = "nodejs";
const MAX_DISPLAY_RESULTS = 8;

export async function POST(request: Request) {
  const body = (await request.json()) as {
    question?: unknown;
    chunks?: unknown;
  };
  const question = typeof body.question === "string" ? body.question : "";
  const chunks = Array.isArray(body.chunks) ? (body.chunks as EvidenceChunk[]) : [];
  const config = {
    apiKey: process.env.OLLAMA_API_KEY || "",
    host: process.env.OLLAMA_HOST || "https://ollama.com",
    model: process.env.OLLAMA_MODEL || "gpt-oss:120b",
  };
  const rerank = await rerankOllamaEvidence({
    question,
    chunks,
    config,
  });
  const ranked = rerank.rankedChunkIds.length
    ? applyChunkIdRanking(chunks, rerank.rankedChunkIds, MAX_DISPLAY_RESULTS)
    : { chunks: chunks.slice(0, MAX_DISPLAY_RESULTS), warnings: rerank.warnings };

  const ai = await generateOllamaAnswer({
    question,
    chunks: ranked.chunks,
    config,
  });

  return Response.json(
    shapeSearchResponse({
      question,
      chunks: ranked.chunks,
      usedAi: ai.usedAi,
      aiAnswer: ai.answer,
      warnings: [...rerank.warnings, ...ranked.warnings, ...ai.warnings],
    }),
  );
}
