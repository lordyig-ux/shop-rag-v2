from collections.abc import Iterable, Mapping
from typing import Any

from pydantic import BaseModel, Field


TEXT_FIELD_NAMES = {
    "text",
    "chunk",
    "chunk_text",
    "content",
    "page_content",
    "document",
    "body",
    "excerpt",
}
TITLE_HINTS = ("title", "heading", "name", "subject")
URL_HINTS = ("url", "uri", "href", "link")
CATEGORY_HINTS = ("category", "policy", "section", "topic", "breadcrumb", "department", "type")
TIMESTAMP_HINTS = ("date", "time", "modified", "created", "scraped", "timestamp", "updated")


class PayloadSchema(BaseModel):
    payload_fields: list[str] = Field(default_factory=list)
    text_fields: list[str] = Field(default_factory=list)
    title_fields: list[str] = Field(default_factory=list)
    source_url_fields: list[str] = Field(default_factory=list)
    category_fields: list[str] = Field(default_factory=list)
    timestamp_fields: list[str] = Field(default_factory=list)
    metadata_fields: list[str] = Field(default_factory=list)
    sample_count: int = 0


def infer_payload_schema(payloads: Iterable[Mapping[str, Any]]) -> PayloadSchema:
    flattened_payloads = [_flatten_payload(payload) for payload in payloads]
    fields = _ordered_fields(flattened_payloads)

    text_fields = [field for field in fields if _is_text_field(field, flattened_payloads)]
    title_fields = [field for field in fields if _contains_hint(field, TITLE_HINTS)]
    source_url_fields = [field for field in fields if _contains_hint(field, URL_HINTS)]
    category_fields = [field for field in fields if _contains_hint(field, CATEGORY_HINTS)]
    timestamp_fields = [field for field in fields if _contains_hint(field, TIMESTAMP_HINTS)]

    classified = set(text_fields + title_fields + source_url_fields + category_fields + timestamp_fields)
    metadata_fields = [field for field in fields if field not in classified]

    return PayloadSchema(
        payload_fields=fields,
        text_fields=text_fields,
        title_fields=title_fields,
        source_url_fields=source_url_fields,
        category_fields=category_fields,
        timestamp_fields=timestamp_fields,
        metadata_fields=metadata_fields,
        sample_count=len(flattened_payloads),
    )


def best_text(payload: Mapping[str, Any], schema: PayloadSchema | None = None) -> str:
    schema = schema or infer_payload_schema([payload])
    for field in schema.text_fields:
        value = read_payload_value(payload, field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    for fallback in ("text", "page_content", "content", "document", "body", "excerpt"):
        value = read_payload_value(payload, fallback)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def best_title(payload: Mapping[str, Any], schema: PayloadSchema | None = None) -> str:
    schema = schema or infer_payload_schema([payload])
    for field in schema.title_fields:
        value = read_payload_value(payload, field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "Untitled source"


def best_source_url(payload: Mapping[str, Any], schema: PayloadSchema | None = None) -> str | None:
    schema = schema or infer_payload_schema([payload])
    for field in schema.source_url_fields:
        value = read_payload_value(payload, field)
        if isinstance(value, str) and value.strip().lower().startswith(("http://", "https://")):
            return value.strip()
    return None


def read_payload_value(payload: Mapping[str, Any], field_path: str) -> Any:
    value: Any = payload
    for part in field_path.split("."):
        if not isinstance(value, Mapping) or part not in value:
            return None
        value = value[part]
    return value


def _ordered_fields(payloads: list[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    fields: list[str] = []
    for payload in payloads:
        for field in payload:
            if field not in seen:
                seen.add(field)
                fields.append(field)
    return fields


def _flatten_payload(payload: Mapping[str, Any], prefix: str = "") -> dict[str, Any]:
    flattened: dict[str, Any] = {}
    for key, value in payload.items():
        field = f"{prefix}.{key}" if prefix else str(key)
        flattened[field] = value
        if isinstance(value, Mapping):
            flattened.update(_flatten_payload(value, field))
    return flattened


def _is_text_field(field: str, payloads: list[dict[str, Any]]) -> bool:
    normalized = field.lower().split(".")[-1]
    if normalized in {"title", "description", "category"}:
        return False
    if normalized in TEXT_FIELD_NAMES:
        return True
    if normalized.endswith("_text") or normalized.endswith("content"):
        return True

    values = [payload.get(field) for payload in payloads if isinstance(payload.get(field), str)]
    if not values:
        return False
    average_length = sum(len(value) for value in values) / len(values)
    return average_length >= 250 and not _contains_hint(field, URL_HINTS + TITLE_HINTS)


def _contains_hint(field: str, hints: tuple[str, ...]) -> bool:
    normalized = field.lower().split(".")[-1]
    return any(hint in normalized for hint in hints)
