from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from app.core.config import Settings
from app.qdrant.client import create_qdrant_client
from app.qdrant.schema_mapper import PayloadSchema, infer_payload_schema


class CollectionInspection(BaseModel):
    name: str
    point_count: int | None = None
    vector_dimensions: dict[str, int] = Field(default_factory=dict)
    vector_distances: dict[str, str] = Field(default_factory=dict)
    vector_names: list[str] = Field(default_factory=list)
    payload_fields: list[str] = Field(default_factory=list)
    likely_text_fields: list[str] = Field(default_factory=list)
    likely_title_fields: list[str] = Field(default_factory=list)
    likely_source_url_fields: list[str] = Field(default_factory=list)
    likely_category_fields: list[str] = Field(default_factory=list)
    likely_timestamp_fields: list[str] = Field(default_factory=list)
    metadata_fields: list[str] = Field(default_factory=list)
    embedding_model: str | None = None
    sample_count: int = 0
    errors: list[str] = Field(default_factory=list)


class QdrantInspectionReport(BaseModel):
    qdrant_url: str
    connected: bool
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    collections: list[CollectionInspection] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)

    def to_markdown(self) -> str:
        lines = [
            "# Qdrant Inspection Report",
            "",
            f"Generated: {self.generated_at.isoformat()}",
            f"Qdrant URL: `{self.qdrant_url}`",
            f"Connection status: {'connected' if self.connected else 'not connected'}",
            "",
        ]

        if self.errors:
            lines.extend(["## Connection Notes", ""])
            lines.extend(f"- {error}" for error in self.errors)
            lines.append("")

        if not self.connected:
            lines.extend(
                [
                    "## Result",
                    "",
                    "The app could not connect to Qdrant during this inspection run.",
                    "Start Qdrant, confirm `QDRANT_URL`, then rerun `python scripts/inspect_qdrant.py` from the `shop-rag` folder.",
                    "",
                    "## Embedding Compatibility Risk",
                    "",
                    "Embedding compatibility could not be verified because no collection metadata was available.",
                    "The retrieval layer will use keyword/payload fallback until a compatible query embedding model is configured.",
                    "",
                ]
            )
            return "\n".join(lines)

        if not self.collections:
            lines.extend(["## Collections", "", "No collections were returned by Qdrant.", ""])
            return "\n".join(lines)

        lines.extend(["## Collections", ""])
        for collection in self.collections:
            lines.extend(
                [
                    f"### `{collection.name}`",
                    "",
                    f"- Point count: `{collection.point_count if collection.point_count is not None else 'unknown'}`",
                    f"- Vector names: `{', '.join(collection.vector_names) if collection.vector_names else 'default'}`",
                    f"- Vector dimensions: `{collection.vector_dimensions or 'unknown'}`",
                    f"- Distance metrics: `{collection.vector_distances or 'unknown'}`",
                    f"- Sampled points: `{collection.sample_count}`",
                    f"- Payload fields: `{', '.join(collection.payload_fields) if collection.payload_fields else 'none detected'}`",
                    f"- Likely text fields: `{', '.join(collection.likely_text_fields) if collection.likely_text_fields else 'none detected'}`",
                    f"- Likely title fields: `{', '.join(collection.likely_title_fields) if collection.likely_title_fields else 'none detected'}`",
                    f"- Likely source URL fields: `{', '.join(collection.likely_source_url_fields) if collection.likely_source_url_fields else 'none detected'}`",
                    f"- Likely category / policy / section fields: `{', '.join(collection.likely_category_fields) if collection.likely_category_fields else 'none detected'}`",
                    f"- Likely scrape timestamp fields: `{', '.join(collection.likely_timestamp_fields) if collection.likely_timestamp_fields else 'none detected'}`",
                    f"- Other metadata fields: `{', '.join(collection.metadata_fields) if collection.metadata_fields else 'none detected'}`",
                ]
            )
            if collection.embedding_model:
                lines.append(f"- Detected embedding model: `{collection.embedding_model}`")
            else:
                lines.extend(
                    [
                        "- Detected embedding model: `unknown`",
                        "- Embedding model was not detected. This is a retrieval risk: vector search may be unreliable unless the query embedding model matches the indexed vectors. The app keeps keyword/payload fallback available.",
                    ]
                )
            if collection.errors:
                lines.extend(f"- Inspection warning: {error}" for error in collection.errors)
            lines.append("")

        return "\n".join(lines)


def inspect_qdrant(settings: Settings, sample_size: int = 8) -> QdrantInspectionReport:
    try:
        client = create_qdrant_client(settings)
        collections_response = client.get_collections()
    except Exception as exc:
        return QdrantInspectionReport(
            qdrant_url=settings.qdrant_url,
            connected=False,
            errors=[str(exc)],
        )

    collection_names = _collection_names(collections_response)
    inspections = [_inspect_collection(client, name, sample_size) for name in collection_names]
    return QdrantInspectionReport(
        qdrant_url=settings.qdrant_url,
        connected=True,
        collections=inspections,
    )


def write_inspection_report(settings: Settings, output_path: str | None = None) -> QdrantInspectionReport:
    report = inspect_qdrant(settings)
    path = settings.inspection_report_path if output_path is None else settings.inspection_report_path.parent / output_path
    path.write_text(report.to_markdown(), encoding="utf-8")
    return report


def _inspect_collection(client: Any, name: str, sample_size: int) -> CollectionInspection:
    errors: list[str] = []
    info: Any = None
    try:
        info = client.get_collection(name)
    except Exception as exc:
        errors.append(f"Could not load collection info: {exc}")

    vector_dimensions, vector_distances = _vector_info(info)
    vector_names = list(vector_dimensions.keys())

    payloads: list[dict[str, Any]] = []
    point_ids: list[str] = []
    try:
        points, _ = client.scroll(
            collection_name=name,
            limit=sample_size,
            with_payload=True,
            with_vectors=False,
        )
        for point in points:
            payload = getattr(point, "payload", None) or {}
            if isinstance(payload, dict):
                payloads.append(payload)
            point_ids.append(str(getattr(point, "id", "")))
    except Exception as exc:
        errors.append(f"Could not sample points: {exc}")

    schema = infer_payload_schema(payloads)
    return CollectionInspection(
        name=name,
        point_count=_point_count(info),
        vector_dimensions=vector_dimensions,
        vector_distances=vector_distances,
        vector_names=vector_names,
        payload_fields=schema.payload_fields,
        likely_text_fields=schema.text_fields,
        likely_title_fields=schema.title_fields,
        likely_source_url_fields=schema.source_url_fields,
        likely_category_fields=schema.category_fields,
        likely_timestamp_fields=schema.timestamp_fields,
        metadata_fields=schema.metadata_fields + (["sample_point_ids"] if point_ids else []),
        embedding_model=_detect_embedding_model(info, schema, payloads),
        sample_count=len(payloads),
        errors=errors,
    )


def _collection_names(collections_response: Any) -> list[str]:
    collections = getattr(collections_response, "collections", collections_response)
    names: list[str] = []
    for collection in collections:
        name = getattr(collection, "name", None)
        if name is None and isinstance(collection, dict):
            name = collection.get("name")
        if name:
            names.append(str(name))
    return names


def _point_count(info: Any) -> int | None:
    for attr in ("points_count", "indexed_vectors_count", "vectors_count"):
        value = getattr(info, attr, None)
        if isinstance(value, int):
            return value
    if isinstance(info, dict):
        for key in ("points_count", "indexed_vectors_count", "vectors_count"):
            value = info.get(key)
            if isinstance(value, int):
                return value
    return None


def _vector_info(info: Any) -> tuple[dict[str, int], dict[str, str]]:
    vectors = _dig(info, ["config", "params", "vectors"])
    dimensions: dict[str, int] = {}
    distances: dict[str, str] = {}

    if vectors is None:
        return dimensions, distances

    vectors_data = _model_dump(vectors)
    if isinstance(vectors_data, dict) and "size" in vectors_data:
        dimensions["default"] = int(vectors_data["size"])
        if vectors_data.get("distance"):
            distances["default"] = str(vectors_data["distance"])
        return dimensions, distances

    if isinstance(vectors_data, dict):
        for name, params in vectors_data.items():
            params_data = _model_dump(params)
            if isinstance(params_data, dict):
                if params_data.get("size") is not None:
                    dimensions[str(name)] = int(params_data["size"])
                if params_data.get("distance") is not None:
                    distances[str(name)] = str(params_data["distance"])
    return dimensions, distances


def _detect_embedding_model(info: Any, schema: PayloadSchema, payloads: list[dict[str, Any]]) -> str | None:
    info_data = _model_dump(info)
    for key in ("embedding_model", "embeddings_model", "model", "vector_model"):
        value = _find_key(info_data, key)
        if isinstance(value, str) and value.strip():
            return value.strip()

    candidate_fields = [
        field for field in schema.payload_fields if any(hint in field.lower() for hint in ("embedding", "model"))
    ]
    for payload in payloads:
        for field in candidate_fields:
            value = _dig_dict(payload, field)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None


def _model_dump(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return value


def _dig(value: Any, path: list[str]) -> Any:
    current = value
    for part in path:
        if current is None:
            return None
        if isinstance(current, dict):
            current = current.get(part)
        else:
            current = getattr(current, part, None)
    return current


def _dig_dict(value: dict[str, Any], field_path: str) -> Any:
    current: Any = value
    for part in field_path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(part)
    return current


def _find_key(value: Any, key: str) -> Any:
    if isinstance(value, dict):
        for existing_key, existing_value in value.items():
            if str(existing_key).lower() == key:
                return existing_value
            found = _find_key(existing_value, key)
            if found is not None:
                return found
    elif isinstance(value, list):
        for item in value:
            found = _find_key(item, key)
            if found is not None:
                return found
    return None
