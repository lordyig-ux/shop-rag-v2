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
