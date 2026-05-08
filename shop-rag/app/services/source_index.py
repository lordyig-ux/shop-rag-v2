from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


class SourceRecord(BaseModel):
    source_id: str
    collection: str
    knowledge_type: str
    title: str
    source_ref: str
    source_url: str | None = None
    file_type: str
    category: str = ""
    modified_at: str = ""
    imported_at: str = Field(default_factory=lambda: datetime.now(UTC).isoformat())
    chunk_count: int = 0
    content_hash: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class SourceIndexPage(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[SourceRecord]


class SourceIndex:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def upsert_sources(self, records: list[SourceRecord]) -> None:
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO sources (
                    source_id, collection, knowledge_type, title, source_ref, source_url,
                    file_type, category, modified_at, imported_at, chunk_count, content_hash, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(source_id) DO UPDATE SET
                    collection=excluded.collection,
                    knowledge_type=excluded.knowledge_type,
                    title=excluded.title,
                    source_ref=excluded.source_ref,
                    source_url=excluded.source_url,
                    file_type=excluded.file_type,
                    category=excluded.category,
                    modified_at=excluded.modified_at,
                    imported_at=excluded.imported_at,
                    chunk_count=excluded.chunk_count,
                    content_hash=excluded.content_hash,
                    metadata_json=excluded.metadata_json
                """,
                [_record_params(record) for record in records],
            )

    def replace_collection_sources(self, collection: str, records: list[SourceRecord]) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM sources WHERE collection = ?", (collection,))
            conn.executemany(
                """
                INSERT INTO sources (
                    source_id, collection, knowledge_type, title, source_ref, source_url,
                    file_type, category, modified_at, imported_at, chunk_count, content_hash, metadata_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [_record_params(record) for record in records],
            )

    def search(
        self,
        query: str = "",
        collection: str | None = None,
        knowledge_type: str | None = None,
        file_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> SourceIndexPage:
        where: list[str] = []
        params: list[Any] = []
        if query.strip():
            where.append("(LOWER(title) LIKE ? OR LOWER(source_ref) LIKE ? OR LOWER(category) LIKE ?)")
            needle = f"%{query.strip().lower()}%"
            params.extend([needle, needle, needle])
        if collection:
            where.append("collection = ?")
            params.append(collection)
        if knowledge_type:
            where.append("knowledge_type = ?")
            params.append(knowledge_type)
        if file_type:
            where.append("file_type = ?")
            params.append(file_type)

        where_sql = f"WHERE {' AND '.join(where)}" if where else ""
        with self._connect() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM sources {where_sql}", params).fetchone()[0]
            rows = conn.execute(
                f"""
                SELECT source_id, collection, knowledge_type, title, source_ref, source_url,
                    file_type, category, modified_at, imported_at, chunk_count, content_hash, metadata_json
                FROM sources
                {where_sql}
                ORDER BY knowledge_type, title
                LIMIT ? OFFSET ?
                """,
                params + [limit, offset],
            ).fetchall()
        return SourceIndexPage(
            total=int(total),
            limit=limit,
            offset=offset,
            items=[_record_from_row(row) for row in rows],
        )

    def all_for_collection(self, collection: str) -> list[SourceRecord]:
        return self.search(collection=collection, limit=100000).items

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sources (
                    source_id TEXT PRIMARY KEY,
                    collection TEXT NOT NULL,
                    knowledge_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source_ref TEXT NOT NULL,
                    source_url TEXT,
                    file_type TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT '',
                    modified_at TEXT NOT NULL DEFAULT '',
                    imported_at TEXT NOT NULL DEFAULT '',
                    chunk_count INTEGER NOT NULL DEFAULT 0,
                    content_hash TEXT NOT NULL DEFAULT '',
                    metadata_json TEXT NOT NULL DEFAULT '{}'
                )
                """
            )
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sources_collection ON sources(collection)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sources_knowledge_type ON sources(knowledge_type)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sources_file_type ON sources(file_type)")


def _record_params(record: SourceRecord) -> tuple[Any, ...]:
    return (
        record.source_id,
        record.collection,
        record.knowledge_type,
        record.title,
        record.source_ref,
        record.source_url,
        record.file_type,
        record.category,
        record.modified_at,
        record.imported_at,
        record.chunk_count,
        record.content_hash,
        json.dumps(record.metadata, ensure_ascii=False),
    )


def _record_from_row(row: sqlite3.Row) -> SourceRecord:
    return SourceRecord(
        source_id=row["source_id"],
        collection=row["collection"],
        knowledge_type=row["knowledge_type"],
        title=row["title"],
        source_ref=row["source_ref"],
        source_url=row["source_url"],
        file_type=row["file_type"],
        category=row["category"],
        modified_at=row["modified_at"],
        imported_at=row["imported_at"],
        chunk_count=int(row["chunk_count"]),
        content_hash=row["content_hash"],
        metadata=json.loads(row["metadata_json"] or "{}"),
    )
