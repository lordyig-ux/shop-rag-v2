import { generateOllamaAnswer } from "@/lib/ai/ollama";
import type { AdminAiHealth } from "@/lib/admin/contracts";
import type { EvidenceChunk } from "@/lib/search/contracts";

export async function GET() {
  const host = process.env.OLLAMA_HOST || "https://ollama.com";
  const model = process.env.OLLAMA_MODEL || "gpt-oss:120b";
  const apiKey = process.env.OLLAMA_API_KEY || "";

  const diagnosticChunk: EvidenceChunk = {
    chunkId: "admin-ai-health",
    title: "Admin AI health check",
    category: "Diagnostics",
    text: "Terminal Auto Body knowledge base AI health check.",
    sourceUrl: null,
    sourceRef: "admin",
    pageNumber: null,
    pageRange: null,
    knowledgeType: "reference",
    score: 1,
  };

  const result = await generateOllamaAnswer({
    question: "Reply with exactly: AI health check passed.",
    chunks: [diagnosticChunk],
    config: {
      apiKey,
      host,
      model,
    },
  });

  const body: AdminAiHealth = {
    checkedAt: Date.now(),
    configured: Boolean(apiKey),
    host,
    model,
    ok: result.usedAi && result.warnings.length === 0,
    usedAi: result.usedAi,
    warnings: result.warnings,
  };

  return Response.json(body);
}
