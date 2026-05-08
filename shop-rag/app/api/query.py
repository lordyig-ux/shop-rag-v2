from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.rag.models import QueryRequest, QueryResponse
from app.rag.retriever import RagService


router = APIRouter()


def get_rag_service(settings: Annotated[Settings, Depends(get_settings)]) -> RagService:
    return RagService(settings)


@router.post("/api/query", response_model=QueryResponse)
def query_knowledge_base(
    request: QueryRequest,
    service: Annotated[RagService, Depends(get_rag_service)],
) -> QueryResponse:
    return service.answer_question(request)
