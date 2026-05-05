import type { EvidenceChunk } from "@/lib/search/contracts";

export type OllamaConfig = {
  apiKey: string;
  host: string;
  model: string;
};

export type GenerateOllamaAnswerInput = {
  question: string;
  chunks: EvidenceChunk[];
  config: OllamaConfig;
  fetchImpl?: typeof fetch;
};

export type GenerateOllamaAnswerResult = {
  answer: string;
  usedAi: boolean;
  warnings: string[];
};

export type RerankOllamaEvidenceInput = {
  question: string;
  chunks: EvidenceChunk[];
  config: OllamaConfig;
  fetchImpl?: typeof fetch;
};

export type RerankOllamaEvidenceResult = {
  rankedChunkIds: string[];
  usedAi: boolean;
  warnings: string[];
};

export async function generateOllamaAnswer(
  input: GenerateOllamaAnswerInput,
): Promise<GenerateOllamaAnswerResult> {
  if (!input.config.apiKey.trim()) {
    return { answer: "", usedAi: false, warnings: ["ollama_api_key_missing"] };
  }

  const fetchImpl = input.fetchImpl || fetch;
  const host = input.config.host.replace(/\/+$/, "");
  const response = await fetchImpl(`${host}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.config.model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "Answer only from the supplied knowledge-base excerpts. If the excerpts do not support an answer, say that there is not enough evidence. Keep answers concise and cite source numbers inline.",
        },
        {
          role: "user",
          content: buildPrompt(input.question, input.chunks),
        },
      ],
    }),
  });

  if (!response.ok) {
    return { answer: "", usedAi: false, warnings: [`ollama_request_failed:${response.status}`] };
  }

  const data = (await response.json()) as unknown;
  const answer = parseOllamaText(data);
  if (!answer) {
    return { answer: "", usedAi: false, warnings: ["ollama_empty_response"] };
  }

  return { answer, usedAi: true, warnings: [] };
}

export async function rerankOllamaEvidence(input: RerankOllamaEvidenceInput): Promise<RerankOllamaEvidenceResult> {
  if (!input.config.apiKey.trim()) {
    return { rankedChunkIds: [], usedAi: false, warnings: ["rerank_ollama_api_key_missing"] };
  }

  if (input.chunks.length < 2) {
    return { rankedChunkIds: input.chunks.map((chunk) => chunk.chunkId), usedAi: false, warnings: [] };
  }

  const fetchImpl = input.fetchImpl || fetch;
  const host = input.config.host.replace(/\/+$/, "");
  const response = await fetchImpl(`${host}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.config.model,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            'Rank the supplied knowledge-base excerpts by usefulness for answering the question. Return JSON only in this exact shape: {"rankedChunkIds":["chunk_id"]}. Use only provided chunk_id values. Do not explain.',
        },
        {
          role: "user",
          content: buildRerankPrompt(input.question, input.chunks),
        },
      ],
    }),
  });

  if (!response.ok) {
    return { rankedChunkIds: [], usedAi: false, warnings: [`rerank_ollama_request_failed:${response.status}`] };
  }

  const data = (await response.json()) as unknown;
  const rankedChunkIds = parseRankedChunkIds(parseOllamaText(data));
  if (!rankedChunkIds.length) {
    return { rankedChunkIds: [], usedAi: false, warnings: ["rerank_ollama_invalid_json"] };
  }

  return { rankedChunkIds, usedAi: true, warnings: [] };
}

function buildPrompt(question: string, chunks: EvidenceChunk[]): string {
  const context = chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] ${chunk.title}\nCategory: ${chunk.category}\nSource: ${
          chunk.sourceUrl || chunk.sourceRef
        }\nExcerpt:\n${chunk.text.slice(0, 1600)}`,
    )
    .join("\n\n");

  return `Question: ${question}\n\nKnowledge-base excerpts:\n${context}`;
}

function buildRerankPrompt(question: string, chunks: EvidenceChunk[]): string {
  const candidates = chunks
    .map(
      (chunk, index) =>
        `Candidate ${index + 1}\nchunk_id: ${chunk.chunkId}\ntitle: ${chunk.title}\ncategory: ${chunk.category}\ntype: ${chunk.knowledgeType}\nexcerpt:\n${chunk.text.slice(0, 900)}`,
    )
    .join("\n\n");

  return `Question: ${question}\n\nCandidates:\n${candidates}`;
}

function parseOllamaText(data: unknown): string {
  if (!data || typeof data !== "object") {
    return "";
  }

  const maybeMessage = "message" in data ? data.message : undefined;
  if (maybeMessage && typeof maybeMessage === "object" && "content" in maybeMessage) {
    const content = maybeMessage.content;
    if (typeof content === "string") {
      return content.trim();
    }
  }

  if ("response" in data && typeof data.response === "string") {
    return data.response.trim();
  }

  return "";
}

export function parseRankedChunkIds(value: string): string[] {
  const jsonText = extractJsonObject(value);
  if (!jsonText) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!parsed || typeof parsed !== "object" || !("rankedChunkIds" in parsed) || !Array.isArray(parsed.rankedChunkIds)) {
      return [];
    }

    return parsed.rankedChunkIds.filter((chunkId): chunkId is string => typeof chunkId === "string" && Boolean(chunkId.trim())).map((chunkId) => chunkId.trim());
  } catch {
    return [];
  }
}

function extractJsonObject(value: string) {
  const trimmed = value.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }

  return trimmed.slice(start, end + 1);
}
