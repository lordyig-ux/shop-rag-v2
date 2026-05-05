import type { EvidenceChunk } from "./contracts";

export type RerankEvidenceResult = {
  chunks: EvidenceChunk[];
  warnings: string[];
};

export function applyChunkIdRanking(chunks: EvidenceChunk[], rankedChunkIds: string[], maxResults = chunks.length): RerankEvidenceResult {
  const chunksById = new Map(chunks.map((chunk) => [chunk.chunkId, chunk]));
  const usedIds = new Set<string>();
  const ranked: EvidenceChunk[] = [];

  for (const chunkId of rankedChunkIds) {
    const chunk = chunksById.get(chunkId);
    if (!chunk || usedIds.has(chunkId)) {
      continue;
    }

    ranked.push(chunk);
    usedIds.add(chunkId);
  }

  const unranked = chunks.filter((chunk) => !usedIds.has(chunk.chunkId));
  const nextChunks = [...ranked, ...unranked].slice(0, Math.max(1, maxResults)).map((chunk, index) => ({
    ...chunk,
    score: Number(Math.max(0.05, 1 - index * 0.05).toFixed(2)),
  }));

  return {
    chunks: nextChunks,
    warnings: ranked.length ? [] : ["rerank_no_matching_ids"],
  };
}
