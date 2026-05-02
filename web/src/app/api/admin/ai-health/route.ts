import { auth, clerkClient } from "@clerk/nextjs/server";

import { generateOllamaAnswer } from "@/lib/ai/ollama";
import type { AdminAiHealth } from "@/lib/admin/contracts";
import { isAllowedAdminEmail } from "@/lib/auth/adminAccess";
import { isClerkConfigured } from "@/lib/auth/clerkConfig";
import { getPrimaryEmailFromClerkUser } from "@/lib/auth/clerkUserEmail";
import type { EvidenceChunk } from "@/lib/search/contracts";

export async function GET() {
  if (isClerkConfigured()) {
    const { userId } = await auth();
    if (!userId) {
      return Response.json({ error: "Admin sign-in required" }, { status: 401 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = getPrimaryEmailFromClerkUser(user);

    if (!isAllowedAdminEmail(email)) {
      return Response.json({ error: "Admin email domain required" }, { status: 403 });
    }
  }

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
