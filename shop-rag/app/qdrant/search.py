from __future__ import annotations

import math
import re
from collections.abc import Iterable
from functools import lru_cache
from typing import Any

from sentence_transformers import SentenceTransformer

from app.core.config import Settings
from app.qdrant.client import create_qdrant_client
from app.qdrant.inspector import inspect_qdrant
from app.qdrant.schema_mapper import PayloadSchema, best_source_url, best_text, best_title, infer_payload_schema
from app.rag.models import RetrievedChunk, RetrievalMode


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


class QdrantSearchService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def search(
        self,
        question: str,
        collection: str | None,
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> tuple[list[RetrievedChunk], RetrievalMode, list[str]]:
        warnings: list[str] = []
        collection_name = collection or self.settings.selected_collection or self._first_collection()
        if not collection_name:
            return [], "keyword_fallback", ["qdrant_collection_unavailable"]

        if self.settings.query_embedding_model:
            vector_results = self._vector_search(question, collection_name, top_k, filters)
            if vector_results:
                return vector_results, "vector", warnings
            warnings.append("vector_search_unavailable")

        keyword_results = self.keyword_fallback(question, collection_name, top_k, filters)
        if not keyword_results:
            warnings.append("keyword_fallback_no_matches")
        return keyword_results, "keyword_fallback", warnings

    def keyword_fallback(
        self,
        question: str,
        collection_name: str,
        top_k: int,
        filters: dict[str, Any] | None = None,
    ) -> list[RetrievedChunk]:
        del filters
        try:
            client = create_qdrant_client(self.settings)
        except Exception:
            return []

        tokens = _tokens(question)
        if not tokens:
            return []

        candidates: list[RetrievedChunk] = []
        offset = None
        scanned = 0
        payload_samples: list[dict[str, Any]] = []

        while scanned < self.settings.keyword_fallback_scan_limit:
            try:
                points, offset = client.scroll(
                    collection_name=collection_name,
                    limit=min(256, self.settings.keyword_fallback_scan_limit - scanned),
                    offset=offset,
                    with_payload=True,
                    with_vectors=False,
                )
            except Exception:
                return []

            if not points:
                break

            payloads = [getattr(point, "payload", None) or {} for point in points]
            payload_samples.extend(payload for payload in payloads if isinstance(payload, dict))
            schema = infer_payload_schema(payload_samples[:20])

            for point, payload in zip(points, payloads):
                if not isinstance(payload, dict):
                    continue
                chunk = _chunk_from_payload(
                    collection=collection_name,
                    point_id=str(getattr(point, "id", "")),
                    payload=payload,
                    schema=schema,
                    tokens=tokens,
                )
                if chunk is not None:
                    candidates.append(chunk)

            scanned += len(points)
            if offset is None:
                break

        candidates.sort(key=lambda chunk: chunk.score, reverse=True)
        return candidates[:top_k]

    def _vector_search(
        self,
        question: str,
        collection_name: str,
        top_k: int,
        filters: dict[str, Any] | None,
    ) -> list[RetrievedChunk]:
        del filters
        vector = self._embed_question(question)
        if vector is None:
            return []

        try:
            client = create_qdrant_client(self.settings)
            if hasattr(client, "search"):
                hits = client.search(
                    collection_name=collection_name,
                    query_vector=vector,
                    limit=top_k,
                    with_payload=True,
                    with_vectors=False,
                )
            else:
                query_response = client.query_points(
                    collection_name=collection_name,
                    query=vector,
                    limit=top_k,
                    with_payload=True,
                    with_vectors=False,
                )
                hits = getattr(query_response, "points", query_response)
        except Exception:
            return []

        payloads = [getattr(hit, "payload", None) or {} for hit in hits]
        schema = infer_payload_schema(payload for payload in payloads if isinstance(payload, dict))
        chunks: list[RetrievedChunk] = []
        for hit, payload in zip(hits, payloads):
            if not isinstance(payload, dict):
                continue
            text = best_text(payload, schema)
            if not text:
                continue
            chunks.append(
                RetrievedChunk(
                    collection=collection_name,
                    chunk_id=str(getattr(hit, "id", "")),
                    text=text,
                    title=best_title(payload, schema),
                    source_url=best_source_url(payload, schema),
                    score=float(getattr(hit, "score", 0.0) or 0.0),
                    payload=payload,
                )
            )
        return chunks

    def _embed_question(self, question: str) -> list[float] | None:
        try:
            model = get_cached_sentence_transformer(self.settings.query_embedding_model)
            return model.encode([question], show_progress_bar=False).tolist()[0]
        except Exception:
            return None

    def _first_collection(self) -> str | None:
        report = inspect_qdrant(self.settings, sample_size=1)
        if not report.connected or not report.collections:
            return None
        return report.collections[0].name

    def available_collections(self) -> list[str]:
        report = inspect_qdrant(self.settings, sample_size=0)
        if not report.connected:
            return []
        return [collection.name for collection in report.collections]


def _chunk_from_payload(
    collection: str,
    point_id: str,
    payload: dict[str, Any],
    schema: PayloadSchema,
    tokens: list[str],
) -> RetrievedChunk | None:
    text = best_text(payload, schema)
    title = best_title(payload, schema)
    source_url = best_source_url(payload, schema)
    score = _keyword_score(tokens, title, text, payload)
    if score <= 0:
        return None
    chunk_id = str(payload.get("id") or payload.get("chunk_id") or point_id)
    return RetrievedChunk(
        collection=collection,
        chunk_id=chunk_id,
        text=text,
        title=title,
        source_url=source_url,
        score=score,
        payload=payload,
    )


def _keyword_score(tokens: list[str], title: str, text: str, payload: dict[str, Any]) -> float:
    haystacks = [
        (title.lower(), 3.0),
        (_payload_text(payload, ("category", "section", "policy", "topic")).lower(), 2.0),
        (text.lower(), 1.0),
    ]
    raw = 0.0
    for token in tokens:
        for haystack, weight in haystacks:
            count = haystack.count(token)
            if count:
                raw += weight * min(count, 4)
    if raw <= 0:
        return 0.0
    normalized = raw / max(len(tokens) * 5.0, 1.0)
    return round(min(1.0, math.sqrt(normalized)), 4)


def _payload_text(payload: dict[str, Any], keys: Iterable[str]) -> str:
    values: list[str] = []
    for key, value in payload.items():
        if any(hint in str(key).lower() for hint in keys):
            values.append(str(value))
    return " ".join(values)


def _tokens(question: str) -> list[str]:
    terms = [term.lower() for term in re.findall(r"[A-Za-z0-9][A-Za-z0-9-]{1,}", question)]
    return [term for term in terms if term not in STOPWORDS]


@lru_cache(maxsize=4)
def get_cached_sentence_transformer(model_name: str) -> SentenceTransformer:
    return SentenceTransformer(model_name)
