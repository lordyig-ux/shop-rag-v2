from dataclasses import dataclass
from typing import Any

from app.core.config import Settings


@dataclass(frozen=True)
class QdrantClientStatus:
    connected: bool
    error: str | None = None


class QdrantDependencyError(RuntimeError):
    pass


def create_qdrant_client(settings: Settings) -> Any:
    try:
        from qdrant_client import QdrantClient
    except ImportError as exc:
        raise QdrantDependencyError(
            "qdrant-client is not installed. Install requirements.txt before connecting to Qdrant."
        ) from exc

    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key_value,
        timeout=8,
        check_compatibility=False,
    )


def check_qdrant(settings: Settings) -> QdrantClientStatus:
    try:
        client = create_qdrant_client(settings)
        client.get_collections()
        return QdrantClientStatus(connected=True)
    except Exception as exc:
        return QdrantClientStatus(connected=False, error=str(exc))
