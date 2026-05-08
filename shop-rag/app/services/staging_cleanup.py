from __future__ import annotations

from typing import Any


def cleanup_staging_collections(client: Any) -> dict[str, list[str]]:
    collections = client.get_collections().collections
    deleted: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []

    for collection in collections:
        name = collection.name
        if not name.endswith("_staging"):
            skipped.append(name)
            continue
        try:
            client.delete_collection(collection_name=name)
            deleted.append(name)
        except Exception as exc:
            errors.append(f"{name}: {type(exc).__name__}: {exc}")

    return {
        "deleted": deleted,
        "skipped": skipped,
        "errors": errors,
    }
