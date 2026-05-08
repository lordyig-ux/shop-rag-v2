import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import Settings
from app.rag.models import QueryResponse


class QueryLog:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.path = settings.logs_dir / "queries.jsonl"
        self.error_path = settings.logs_dir / "errors.jsonl"

    def log_query(self, question: str, response: QueryResponse) -> None:
        self.settings.ensure_local_dirs()
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "question": question,
            "retrieval": response.retrieval.model_dump(mode="json"),
            "warnings": response.warnings,
            "citation_chunk_ids": [citation.chunk_id for citation in response.citations],
        }
        self._append_jsonl(self.path, record)

    def log_error(self, message: str, detail: str | None = None) -> None:
        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "message": message,
            "detail": detail,
        }
        self._append_jsonl(self.error_path, record)

    def recent_queries(self, limit: int = 25) -> list[dict[str, Any]]:
        return _read_recent(self.path, limit)

    def recent_errors(self, limit: int = 25) -> list[dict[str, Any]]:
        return _read_recent(self.error_path, limit)

    def _append_jsonl(self, path: Path, record: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=True) + "\n")


def _read_recent(path: Path, limit: int) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    lines = path.read_text(encoding="utf-8").splitlines()[-limit:]
    records: list[dict[str, Any]] = []
    for line in lines:
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return list(reversed(records))
