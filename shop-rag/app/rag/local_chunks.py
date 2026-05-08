from __future__ import annotations

import json
import math
import re
from pathlib import Path
from typing import Any

from app.qdrant.schema_mapper import best_source_url, best_text, best_title, infer_payload_schema
from app.rag.models import RetrievedChunk


STOPWORDS = {
    "a",
    "an",
    "and",
    "apply",
    "applies",
    "are",
    "as",
    "at",
    "be",
    "does",
    "evidence",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "no",
    "of",
    "on",
    "or",
    "our",
    "policies",
    "policy",
    "say",
    "the",
    "to",
    "test",
    "what",
    "when",
    "where",
    "with",
}


class LocalChunksSearchService:
    def __init__(self, chunks_path: Path) -> None:
        self.chunks_path = chunks_path

    def search(self, question: str, top_k: int) -> list[RetrievedChunk]:
        if not self.chunks_path.exists():
            return []

        tokens = _tokens(question)
        if not tokens:
            return []

        payloads = self._load_payloads()
        schema = infer_payload_schema(payloads[:30])
        results: list[RetrievedChunk] = []
        for payload in payloads:
            text = best_text(payload, schema)
            if not text:
                continue
            title = best_title(payload, schema)
            score = _keyword_score(tokens, title, text, payload)
            if score <= 0:
                continue
            results.append(
                RetrievedChunk(
                    collection="local_chunks",
                    chunk_id=str(payload.get("id") or payload.get("chunk_id") or title),
                    text=text,
                    title=title,
                    source_url=best_source_url(payload, schema),
                    score=score,
                    payload=payload,
                )
            )

        results.sort(key=lambda chunk: chunk.score, reverse=True)
        return results[:top_k]

    def _load_payloads(self) -> list[dict[str, Any]]:
        payloads: list[dict[str, Any]] = []
        with self.chunks_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(payload, dict):
                    payloads.append(payload)
        return payloads


def _keyword_score(tokens: list[str], title: str, text: str, payload: dict[str, Any]) -> float:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    metadata_text = " ".join(str(value) for value in metadata.values())
    haystacks = [
        (title.lower(), 3.0),
        (metadata_text.lower(), 2.0),
        (text.lower(), 1.0),
    ]

    raw = 0.0
    matched_tokens = 0
    for token in tokens:
        token_score = 0.0
        for haystack, weight in haystacks:
            count = haystack.count(token)
            if count:
                token_score += weight * min(count, 4)
        if token_score:
            matched_tokens += 1
            raw += token_score

    if raw <= 0:
        return 0.0
    coverage = matched_tokens / max(len(tokens), 1)
    normalized = raw / max(len(tokens) * 5.0, 1.0)
    return round(min(1.0, math.sqrt(normalized) * coverage), 4)


def _tokens(question: str) -> list[str]:
    terms = [term.lower() for term in re.findall(r"[A-Za-z0-9][A-Za-z0-9-]{1,}", question)]
    return [term for term in terms if term not in STOPWORDS]
