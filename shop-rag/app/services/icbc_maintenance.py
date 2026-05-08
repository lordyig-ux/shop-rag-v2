from __future__ import annotations

import json
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, Field

from app.core.config import Settings
from app.qdrant.client import create_qdrant_client
from app.qdrant.importer import (
    DEFAULT_IMPORT_COLLECTION,
    DEFAULT_IMPORT_EMBEDDING_MODEL,
    QdrantChunkImporter,
    SentenceTransformerEmbeddingProvider,
)
from app.services.job_manager import JobContext
from app.services.source_index import SourceIndex, SourceRecord


NAV_XML_URL = "https://mdp.partners.icbc.com/maps/nav_DAMG-MP-NRP91J-vendors.xml"
BASE_TOPIC_URL = "https://mdp.partners.icbc.com/topic"
MAP_NAME = "DAMG-MP-NRP91J-vendors"


class IcbcUpdateSummary(BaseModel):
    checked_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    new_count: int = 0
    removed_count: int = 0
    changed_count: int = 0
    new_topics: list[dict[str, str]] = Field(default_factory=list)
    removed_topics: list[dict[str, str]] = Field(default_factory=list)
    changed_topics: list[dict[str, Any]] = Field(default_factory=list)


def compare_icbc_nav_entries(
    latest_entries: list[dict[str, str]],
    current_sources: list[SourceRecord],
) -> IcbcUpdateSummary:
    latest_by_id = {entry["id"]: entry for entry in latest_entries}
    current_by_id = {source.source_ref: source for source in current_sources}

    new_topics = [entry for topic_id, entry in latest_by_id.items() if topic_id not in current_by_id]
    removed_topics = [
        {"id": source.source_ref, "title": source.title, "category": source.category}
        for topic_id, source in current_by_id.items()
        if topic_id not in latest_by_id
    ]
    changed_topics: list[dict[str, Any]] = []
    for topic_id, latest in latest_by_id.items():
        current = current_by_id.get(topic_id)
        if not current:
            continue
        changes: dict[str, dict[str, str]] = {}
        if latest.get("title", "") != current.title:
            changes["title"] = {"old": current.title, "new": latest.get("title", "")}
        if latest.get("category", "") != current.category:
            changes["category"] = {"old": current.category, "new": latest.get("category", "")}
        if changes:
            changed_topics.append({"id": topic_id, "changes": changes})

    return IcbcUpdateSummary(
        new_count=len(new_topics),
        removed_count=len(removed_topics),
        changed_count=len(changed_topics),
        new_topics=new_topics[:100],
        removed_topics=removed_topics[:100],
        changed_topics=changed_topics[:100],
    )


def fetch_icbc_nav_entries() -> list[dict[str, str]]:
    response = httpx.get(NAV_XML_URL, timeout=30)
    response.raise_for_status()
    root = ET.fromstring(response.text)
    return _parse_topicrefs(root)


def run_icbc_check(settings: Settings, source_index: SourceIndex) -> dict[str, object]:
    latest = fetch_icbc_nav_entries()
    current = source_index.all_for_collection(DEFAULT_IMPORT_COLLECTION)
    if not current:
        current = _source_records_from_links_file(settings)
    summary = compare_icbc_nav_entries(latest, current)
    _write_maintenance_state(settings, {"last_checked": summary.checked_at, "last_check": summary.model_dump()})
    return summary.model_dump(mode="json")


def run_icbc_refresh(settings: Settings, source_index: SourceIndex, context: JobContext) -> dict[str, object]:
    scraper_root = Path(__file__).resolve().parents[3]
    staging_collection = f"{DEFAULT_IMPORT_COLLECTION}_staging"
    context.set_step("extracting ICBC link map")
    _run_process([sys.executable, "extract_links.py"], scraper_root, context)
    context.set_step("scraping ICBC procedure pages")
    _reset_scrape_outputs(scraper_root)
    _run_process([sys.executable, "scrape_procedures.py"], scraper_root, context)
    context.set_step("chunking ICBC procedures")
    _run_process([sys.executable, "process_chunks.py"], scraper_root, context)

    chunks_path = scraper_root / "output" / "chunks.jsonl"
    context.set_step("importing staging Qdrant collection")
    client = create_qdrant_client(settings)
    staging_import = QdrantChunkImporter(
        client=client,
        embedding_provider=SentenceTransformerEmbeddingProvider(
            settings.query_embedding_model or DEFAULT_IMPORT_EMBEDDING_MODEL
        ),
        collection_name=staging_collection,
        batch_size=64,
        recreate=True,
    ).import_file(chunks_path)

    context.set_step("promoting ICBC collection")
    QdrantChunkImporter(
        client=client,
        embedding_provider=SentenceTransformerEmbeddingProvider(
            settings.query_embedding_model or DEFAULT_IMPORT_EMBEDDING_MODEL
        ),
        collection_name=DEFAULT_IMPORT_COLLECTION,
        batch_size=64,
        recreate=True,
    ).import_file(chunks_path)

    context.set_step("updating source index")
    source_index.replace_collection_sources(
        DEFAULT_IMPORT_COLLECTION,
        source_records_from_chunks_file(chunks_path, DEFAULT_IMPORT_COLLECTION),
    )
    refreshed_at = datetime.now(UTC).isoformat()
    _write_maintenance_state(
        settings,
        {
            "last_refreshed": refreshed_at,
            "next_recommended_check": (datetime.now(UTC) + timedelta(days=30)).date().isoformat(),
        },
    )
    return {
        "collection": DEFAULT_IMPORT_COLLECTION,
        "staging_collection": staging_collection,
        "imported_points": staging_import.imported_points,
        "refreshed_at": refreshed_at,
    }


def maintenance_state(settings: Settings) -> dict[str, object]:
    path = settings.data_dir / "maintenance_state.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _parse_topicrefs(element: ET.Element, category_path: list[str] | None = None) -> list[dict[str, str]]:
    category_path = category_path or []
    results: list[dict[str, str]] = []
    for topicref in element.findall("topicref"):
        href = topicref.get("href", "")
        navtitle = topicref.get("navtitle", "")
        if not href:
            continue
        results.append(
            {
                "id": href,
                "title": navtitle,
                "url": f"{BASE_TOPIC_URL}/{href}?map={MAP_NAME}",
                "category": " > ".join(category_path) if category_path else "",
                "content_url": f"https://mdp.partners.icbc.com/topics/{href}.html",
            }
        )
        results.extend(_parse_topicrefs(topicref, category_path + ([navtitle] if navtitle else [])))
    return results


def _source_records_from_links_file(settings: Settings) -> list[SourceRecord]:
    links_path = settings.local_chunks_path.parent / "all_links.json"
    if not links_path.exists():
        return []
    links = json.loads(links_path.read_text(encoding="utf-8"))
    return [
        SourceRecord(
            source_id=str(item.get("id", "")),
            collection=DEFAULT_IMPORT_COLLECTION,
            knowledge_type="icbc",
            title=str(item.get("title", "")),
            source_ref=str(item.get("id", "")),
            source_url=str(item.get("url", "")),
            file_type="url",
            category=str(item.get("category", "")),
            metadata=item,
        )
        for item in links
        if item.get("id")
    ]


def source_records_from_chunks_file(chunks_path: Path, collection: str) -> list[SourceRecord]:
    grouped: dict[str, dict[str, Any]] = {}
    with chunks_path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            metadata = record.get("metadata") if isinstance(record.get("metadata"), dict) else {}
            key = str(metadata.get("source_url") or record.get("id"))
            source = grouped.setdefault(
                key,
                {
                    "title": str(metadata.get("title", key)),
                    "source_ref": str(record.get("id", key)).split("_chunk_")[0],
                    "source_url": str(metadata.get("source_url") or ""),
                    "category": str(metadata.get("category") or ""),
                    "date_modified": str(metadata.get("date_modified") or ""),
                    "chunk_count": 0,
                },
            )
            source["chunk_count"] += 1
    return [
        SourceRecord(
            source_id=_stable_source_id("icbc", key),
            collection=collection,
            knowledge_type="icbc",
            title=value["title"],
            source_ref=value["source_ref"],
            source_url=value["source_url"],
            file_type="url",
            category=value["category"],
            modified_at=value["date_modified"],
            chunk_count=value["chunk_count"],
        )
        for key, value in grouped.items()
    ]


def _reset_scrape_outputs(scraper_root: Path) -> None:
    progress = scraper_root / "output" / "scrape_progress.json"
    procedures = scraper_root / "output" / "procedures"
    if progress.exists():
        progress.unlink()
    if procedures.exists():
        shutil.rmtree(procedures)


def _run_process(command: list[str], cwd: Path, context: JobContext) -> None:
    process = subprocess.run(command, cwd=cwd, capture_output=True, text=True, timeout=3600)
    if process.stdout.strip():
        context.log(process.stdout.strip()[-4000:])
    if process.stderr.strip():
        context.log(process.stderr.strip()[-4000:])
    if process.returncode != 0:
        raise RuntimeError(f"Command failed ({process.returncode}): {' '.join(command)}")


def _write_maintenance_state(settings: Settings, updates: dict[str, object]) -> None:
    path = settings.data_dir / "maintenance_state.json"
    state = maintenance_state(settings)
    state.update(updates)
    path.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _stable_source_id(prefix: str, value: str) -> str:
    import hashlib

    return hashlib.sha1(f"{prefix}:{value}".encode("utf-8")).hexdigest()[:24]
