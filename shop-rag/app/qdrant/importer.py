from __future__ import annotations

import json
import uuid
from collections.abc import Sequence
from pathlib import Path
from typing import Any, Protocol

from pydantic import BaseModel, Field


DEFAULT_IMPORT_COLLECTION = "icbc_procedures"
DEFAULT_IMPORT_EMBEDDING_MODEL = "all-MiniLM-L6-v2"


class ChunkRecord(BaseModel):
    chunk_id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class ImportResult(BaseModel):
    collection_name: str
    imported_points: int
    vector_size: int
    embedding_model: str
    chunks_path: Path


class EmbeddingProvider(Protocol):
    model_name: str

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        pass


class SentenceTransformerEmbeddingProvider:
    def __init__(self, model_name: str = DEFAULT_IMPORT_EMBEDDING_MODEL) -> None:
        self.model_name = model_name
        self._model: Any | None = None

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if self._model is None:
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:
                raise RuntimeError(
                    "sentence-transformers is not installed. Run: pip install -r requirements.txt"
                ) from exc
            self._model = SentenceTransformer(self.model_name)

        vectors = self._model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return [list(map(float, vector)) for vector in vectors.tolist()]


class QdrantChunkImporter:
    def __init__(
        self,
        client: Any,
        embedding_provider: EmbeddingProvider,
        collection_name: str = DEFAULT_IMPORT_COLLECTION,
        batch_size: int = 64,
        recreate: bool = False,
    ) -> None:
        self.client = client
        self.embedding_provider = embedding_provider
        self.collection_name = collection_name
        self.batch_size = batch_size
        self.recreate = recreate

    def import_file(self, chunks_path: Path, limit: int | None = None) -> ImportResult:
        records = load_chunk_records(chunks_path)
        if limit is not None:
            records = records[:limit]
        return self.import_records(records, chunks_path=chunks_path)

    def import_records(
        self,
        records: Sequence[ChunkRecord],
        chunks_path: Path | None = None,
    ) -> ImportResult:
        if not records:
            source = str(chunks_path) if chunks_path is not None else "provided records"
            raise ValueError(f"No importable chunks found in {source}")

        first_vector = self.embedding_provider.embed_texts([records[0].text])[0]
        vector_size = len(first_vector)
        self._ensure_collection(vector_size)
        self._upsert_records(records, first_vector)

        return ImportResult(
            collection_name=self.collection_name,
            imported_points=len(records),
            vector_size=vector_size,
            embedding_model=self.embedding_provider.model_name,
            chunks_path=chunks_path or Path("<records>"),
        )

    def _ensure_collection(self, vector_size: int) -> None:
        if self.recreate and self.client.collection_exists(self.collection_name):
            self.client.delete_collection(self.collection_name)

        if self.client.collection_exists(self.collection_name):
            return

        try:
            from qdrant_client.models import Distance, VectorParams
        except ImportError as exc:
            raise RuntimeError(
                "qdrant-client is not installed. Run: pip install -r requirements.txt"
            ) from exc

        self.client.create_collection(
            collection_name=self.collection_name,
            vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
        )

    def _upsert_records(self, records: Sequence[ChunkRecord], first_vector: list[float]) -> None:
        for start in range(0, len(records), self.batch_size):
            batch = list(records[start : start + self.batch_size])
            if start == 0:
                remaining_texts = [record.text for record in batch[1:]]
                remaining_vectors = self.embedding_provider.embed_texts(remaining_texts) if remaining_texts else []
                vectors = [first_vector] + remaining_vectors
            else:
                vectors = self.embedding_provider.embed_texts([record.text for record in batch])
            points = [
                _point_struct(record, vector, self.embedding_provider.model_name)
                for record, vector in zip(batch, vectors)
            ]
            self.client.upsert(collection_name=self.collection_name, points=points, wait=True)


def load_chunk_records(chunks_path: Path) -> list[ChunkRecord]:
    records: list[ChunkRecord] = []
    with chunks_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            try:
                raw = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON on line {line_number} of {chunks_path}") from exc

            chunk_id = str(raw.get("id") or raw.get("chunk_id") or "").strip()
            text = str(raw.get("text") or raw.get("content") or raw.get("page_content") or "").strip()
            metadata = raw.get("metadata") if isinstance(raw.get("metadata"), dict) else {}
            if chunk_id and text:
                records.append(ChunkRecord(chunk_id=chunk_id, text=text, metadata=metadata))
    return records


def build_qdrant_payload(record: ChunkRecord, embedding_model: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "id": record.chunk_id,
        "chunk_id": record.chunk_id,
        "text": record.text,
        "metadata": record.metadata,
        "embedding_model": embedding_model,
    }
    for key in (
        "title",
        "category",
        "source_url",
        "content_url",
        "description",
        "date_modified",
        "chunk_index",
        "total_chunks",
        "file_type",
        "source_ref",
        "source_url_with_page",
        "page_number",
        "page_start",
        "page_end",
        "page_range",
    ):
        value = record.metadata.get(key)
        if value is not None:
            payload[key] = value
    return payload


def qdrant_point_id(chunk_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"shop-rag:{chunk_id}"))


def _point_struct(record: ChunkRecord, vector: list[float], embedding_model: str) -> Any:
    try:
        from qdrant_client.models import PointStruct
    except ImportError as exc:
        raise RuntimeError("qdrant-client is not installed. Run: pip install -r requirements.txt") from exc

    return PointStruct(
        id=qdrant_point_id(record.chunk_id),
        vector=vector,
        payload=build_qdrant_payload(record, embedding_model),
    )
