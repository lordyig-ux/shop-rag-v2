import { generateOllamaAnswer } from "@/lib/ai/ollama";
import type { EvidenceChunk } from "@/lib/search/contracts";
import { shapeSearchResponse } from "@/lib/search/shapeResults";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    question?: unknown;
    chunks?: unknown;
  };
  const question = typeof body.question === "string" ? body.question : "";
  const chunks = Array.isArray(body.chunks) ? (body.chunks as EvidenceChunk[]) : [];

  const ai = await generateOllamaAnswer({
    question,
    chunks,
    config: {
      apiKey: process.env.OLLAMA_API_KEY || "",
      host: process.env.OLLAMA_HOST || "https://ollama.com",
      model: process.env.OLLAMA_MODEL || "gpt-oss:120b",
    },
  });

  return Response.json(
    shapeSearchResponse({
      question,
      chunks,
      usedAi: ai.usedAi,
      aiAnswer: ai.answer,
      warnings: ai.warnings,
    }),
  );
}
