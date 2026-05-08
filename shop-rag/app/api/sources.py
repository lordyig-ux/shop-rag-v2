from __future__ import annotations

import hashlib
import time
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException

from app.core.config import Settings, get_settings
from app.qdrant.client import create_qdrant_client
from app.qdrant.inspector import inspect_qdrant
from app.qdrant.schema_mapper import best_source_url, best_text, best_title, infer_payload_schema


router = APIRouter()
_SOURCE_INDEX_CACHE: dict[tuple[str, str], tuple[float, list[dict[str, Any]]]] = {}
_SOURCE_INDEX_TTL_SECONDS = 300.0


@router.get("/api/sources")
def list_sources(
    settings: Annotated[Settings, Depends(get_settings)],
    q: str = "",
    collection: str | None = None,
    limit: int = 50,
) -> dict[str, Any]:
    collection_name = collection or settings.selected_collection or _first_collection(settings)
    if not collection_name:
        return {"sources": [], "warnings": ["qdrant_collection_unavailable"]}

    sources = _scan_sources(settings, collection_name, q, limit)
    return {"sources": sources, "warnings": []}


@router.get("/api/sources/{source_id}")
def get_source(
    source_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    collection: str | None = None,
) -> dict[str, Any]:
    collection_name = collection or settings.selected_collection or _first_collection(settings)
    if not collection_name:
        raise HTTPException(status_code=404, detail="No Qdrant collection available")

    sources = _scan_sources(settings, collection_name, "", settings.keyword_fallback_scan_limit)
    for source in sources:
        if source["id"] == source_id:
            return source
    raise HTTPException(status_code=404, detail="Source not found")


def _scan_sources(settings: Settings, collection_name: str, query: str, limit: int) -> list[dict[str, Any]]:
    all_sources = _get_cached_sources(settings, collection_name)
    query_lower = query.lower().strip()
    if query_lower:
        all_sources = [source for source in all_sources if query_lower in source.get("_search_text", "")]
    return [_public_source(source) for source in all_sources[:limit]]


def _get_cached_sources(settings: Settings, collection_name: str) -> list[dict[str, Any]]:
    cache_key = (settings.qdrant_url, collection_name)
    cached = _SOURCE_INDEX_CACHE.get(cache_key)
    if cached and time.monotonic() - cached[0] < _SOURCE_INDEX_TTL_SECONDS:
        return cached[1]

    sources = _build_source_index(settings, collection_name)
    _SOURCE_INDEX_CACHE[cache_key] = (time.monotonic(), sources)
    return sources


def _build_source_index(settings: Settings, collection_name: str) -> list[dict[str, Any]]:
    try:
        client = create_qdrant_client(settings)
    except Exception:
        return []

    grouped: dict[str, dict[str, Any]] = {}
    offset = None
    scanned = 0
    payload_samples: list[dict[str, Any]] = []

    while scanned < settings.keyword_fallback_scan_limit:
        try:
            points, offset = client.scroll(
                collection_name=collection_name,
                limit=min(256, settings.keyword_fallback_scan_limit - scanned),
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
            title = best_title(payload, schema)
            source_url = best_source_url(payload, schema)
            text = best_text(payload, schema)
            key = source_url or title
            source_id = _source_id(key)
            source = grouped.setdefault(
                source_id,
                {
                    "id": source_id,
                    "title": title,
                    "source_url": source_url,
                    "collection": collection_name,
                    "chunk_count": 0,
                    "chunks": [],
                    "_search_text": "",
                },
            )
            source["_search_text"] += f" {title} {source_url or ''} {text}".lower()
            source["chunk_count"] += 1
            if len(source["chunks"]) < 6:
                page_number = payload.get("page_number")
                page_range = payload.get("page_range")
                source["chunks"].append(
                    {
                        "chunk_id": str(payload.get("id") or payload.get("chunk_id") or getattr(point, "id", "")),
                        "excerpt": text[:1000],
                        "page_number": page_number,
                        "page_range": str(page_range) if page_range else None,
                        "source_url_with_page": payload.get("source_url_with_page"),
                    }
                )

        scanned += len(points)
        if offset is None:
            break

    return list(grouped.values())


def _public_source(source: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in source.items() if not key.startswith("_")}


def _first_collection(settings: Settings) -> str | None:
    report = inspect_qdrant(settings, sample_size=1)
    if not report.connected or not report.collections:
        return None
    return report.collections[0].name


def _source_id(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:16]
