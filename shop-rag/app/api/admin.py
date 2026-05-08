from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.config import Settings, get_settings
from app.core.security import require_admin
from app.qdrant.client import create_qdrant_client
from app.qdrant.importer import DEFAULT_IMPORT_COLLECTION
from app.qdrant.inspector import inspect_qdrant
from app.rag.models import QueryRequest
from app.rag.retriever import RagService
from app.services.collection_selection import write_selected_collection
from app.services.diagnostics import system_health
from app.services.icbc_maintenance import (
    maintenance_state,
    run_icbc_check,
    run_icbc_refresh,
    source_records_from_chunks_file,
)
from app.services.job_manager import JobAlreadyRunningError, JobManager
from app.services.mitchell_ceg import run_mitchell_ceg_refresh
from app.services.query_log import QueryLog
from app.services.shop_docs import ShopDocsService, run_shop_docs_import
from app.services.staging_cleanup import cleanup_staging_collections
from app.services.source_index import SourceIndex


router = APIRouter(prefix="/api/admin", dependencies=[Depends(require_admin)])
_JOB_MANAGERS: dict[str, JobManager] = {}
_SOURCE_INDEXES: dict[str, SourceIndex] = {}


class SelectCollectionRequest(BaseModel):
    collection: str = Field(min_length=1, max_length=200)


@router.get("/qdrant")
def qdrant_health(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    health = system_health(settings)
    return health["qdrant"]


@router.get("/collections")
def admin_collections(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    report = inspect_qdrant(settings, sample_size=2)
    return {
        "connected": report.connected,
        "selected_collection": settings.selected_collection,
        "env_collection_locked": bool(settings.qdrant_collection.strip()),
        "collections": [
            {
                "name": collection.name,
                "point_count": collection.point_count,
                "vector_dimensions": collection.vector_dimensions,
                "distance": collection.vector_distances,
            }
            for collection in report.collections
        ],
        "errors": report.errors,
    }


@router.get("/schema")
def admin_schema(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    return inspect_qdrant(settings).model_dump(mode="json")


@router.get("/report")
def admin_report(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, str]:
    if settings.inspection_report_path.exists():
        content = settings.inspection_report_path.read_text(encoding="utf-8")
    else:
        content = inspect_qdrant(settings).to_markdown()
    return {"content": content}


@router.get("/recent-queries")
def recent_queries(settings: Annotated[Settings, Depends(get_settings)]) -> list[dict[str, Any]]:
    return QueryLog(settings).recent_queries()


@router.get("/errors")
def recent_errors(settings: Annotated[Settings, Depends(get_settings)]) -> list[dict[str, Any]]:
    return QueryLog(settings).recent_errors()


@router.post("/test-query")
def admin_test_query(
    request: QueryRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    return RagService(settings).answer_question(request).model_dump(mode="json")


@router.post("/select-collection")
def select_collection(
    request: SelectCollectionRequest,
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, str]:
    write_selected_collection(settings, request.collection)
    return {"selected_collection": request.collection}


@router.get("/jobs/current")
def current_job(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any] | None:
    job = _job_manager(settings).current_job()
    return job.model_dump(mode="json") if job else None


@router.get("/jobs/history")
def job_history(settings: Annotated[Settings, Depends(get_settings)]) -> list[dict[str, Any]]:
    return [job.model_dump(mode="json") for job in _job_manager(settings).history()]


@router.post("/jobs/icbc-check")
def start_icbc_check(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    def job(context):
        context.set_step("checking ICBC navigation map")
        return run_icbc_check(settings, _source_index(settings))

    return _start_job(
        settings,
        "icbc_check",
        job,
    )


@router.post("/jobs/icbc-refresh")
def start_icbc_refresh(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    return _start_job(
        settings,
        "icbc_refresh",
        lambda context: run_icbc_refresh(settings, _source_index(settings), context),
    )


@router.post("/jobs/shop-docs-import")
def start_shop_docs_import(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    return _start_job(
        settings,
        "shop_docs_import",
        lambda context: run_shop_docs_import(settings, _source_index(settings), context),
    )


@router.post("/jobs/mitchell-ceg-refresh")
def start_mitchell_ceg_refresh(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    return _start_job(
        settings,
        "mitchell_ceg_refresh",
        lambda context: run_mitchell_ceg_refresh(settings, _source_index(settings), context),
    )


@router.get("/maintenance")
def admin_maintenance_state(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    state = maintenance_state(settings)
    state.setdefault("live_icbc_collection", DEFAULT_IMPORT_COLLECTION)
    state.setdefault("shop_docs_inbox_path", str(settings.shop_docs_inbox_path))
    return state


@router.get("/shop-docs/scan")
def scan_shop_docs(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    return ShopDocsService(settings.shop_docs_inbox_path).scan().model_dump(mode="json")


@router.post("/cleanup/staging-collections")
def cleanup_staging(settings: Annotated[Settings, Depends(get_settings)]) -> dict[str, Any]:
    return cleanup_staging_collections(create_qdrant_client(settings))


@router.get("/source-index")
def admin_source_index(
    settings: Annotated[Settings, Depends(get_settings)],
    q: str = "",
    collection: str | None = None,
    knowledge_type: str | None = None,
    file_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, Any]:
    index = _source_index(settings)
    if index.search(limit=1).total == 0 and settings.local_chunks_path.exists():
        index.replace_collection_sources(
            DEFAULT_IMPORT_COLLECTION,
            source_records_from_chunks_file(settings.local_chunks_path, DEFAULT_IMPORT_COLLECTION),
        )
    page = index.search(
        query=q,
        collection=collection,
        knowledge_type=knowledge_type,
        file_type=file_type,
        limit=max(1, min(limit, 200)),
        offset=max(0, offset),
    )
    return page.model_dump(mode="json")


def _start_job(settings: Settings, name: str, target) -> dict[str, Any]:
    try:
        job = _job_manager(settings).start_job(name, target)
    except JobAlreadyRunningError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return job.model_dump(mode="json")


def _job_manager(settings: Settings) -> JobManager:
    key = str(settings.jobs_dir)
    if key not in _JOB_MANAGERS:
        _JOB_MANAGERS[key] = JobManager(settings.jobs_dir)
    return _JOB_MANAGERS[key]


def _source_index(settings: Settings) -> SourceIndex:
    key = str(settings.source_index_path)
    if key not in _SOURCE_INDEXES:
        _SOURCE_INDEXES[key] = SourceIndex(settings.source_index_path)
    return _SOURCE_INDEXES[key]
