from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.services.diagnostics import system_health


router = APIRouter()


@router.get("/api/health")
def api_health(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    return system_health(settings)
