from typing import Any

import httpx

from app.core.config import Settings
from app.qdrant.client import check_qdrant


def system_health(settings: Settings) -> dict[str, Any]:
    qdrant = check_qdrant(settings)
    return {
        "status": "ok",
        "app": settings.app_name,
        "environment": settings.app_env,
        "qdrant": {
            "url": settings.qdrant_url,
            "connected": qdrant.connected,
            "error": qdrant.error,
        },
        "openai": {
            "configured": settings.openai_configured,
            "model": settings.openai_model,
            "api_key_present": settings.openai_configured,
        },
        "ollama": {
            "configured": settings.ollama_configured,
            "base_url": settings.ollama_base_url,
            "model": settings.ollama_model,
            "api_key_present": bool(settings.ollama_api_key_value),
            "connected": check_ollama(settings),
        },
        "answer_provider": settings.answer_provider,
    }


def check_ollama(settings: Settings) -> bool:
    try:
        response = httpx.get(
            f"{settings.ollama_base_url.rstrip('/')}/api/tags",
            timeout=1.5,
            headers=_ollama_headers(settings),
        )
        return response.status_code == 200
    except Exception:
        return False


def _ollama_headers(settings: Settings) -> dict[str, str] | None:
    key = settings.ollama_api_key_value
    if not key:
        return None
    return {"Authorization": f"Bearer {key}"}
