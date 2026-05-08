import logging
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.admin import router as admin_router
from app.api.health import router as health_router
from app.api.query import router as query_router
from app.api.sources import router as sources_router
from app.core.config import Settings, get_settings
from app.core.logging import configure_logging
from app.core.security import require_admin
from app.services.diagnostics import system_health


settings = get_settings()
configure_logging(settings)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("Starting %s on %s:%s", settings.app_name, settings.app_host, settings.app_port)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
templates = Jinja2Templates(directory=str(settings.templates_dir))
app.mount("/static", StaticFiles(directory=str(settings.static_dir)), name="static")

app.include_router(health_router)
app.include_router(query_router)
app.include_router(admin_router)
app.include_router(sources_router)


@app.get("/health")
def health(settings: Annotated[Settings, Depends(get_settings)]) -> dict:
    health_data = system_health(settings)
    return {
        "status": health_data["status"],
        "app": health_data["app"],
        "qdrant_connected": health_data["qdrant"]["connected"],
        "openai_configured": health_data["openai"]["configured"],
    }


@app.get("/", response_class=HTMLResponse)
def staff_dashboard(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "staff.html", {"page": "staff"})


@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard(
    request: Request,
    _: Annotated[str, Depends(require_admin)],
) -> HTMLResponse:
    return templates.TemplateResponse(request, "admin.html", {"page": "admin"})


@app.get("/sources", response_class=HTMLResponse)
def sources_page(request: Request) -> HTMLResponse:
    return templates.TemplateResponse(request, "sources.html", {"page": "sources"})
