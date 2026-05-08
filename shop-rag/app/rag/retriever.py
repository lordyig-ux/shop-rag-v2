import logging

from app.core.config import Settings
from app.qdrant.search import QdrantSearchService
from app.rag.answer_builder import create_answer_builder
from app.rag.local_chunks import LocalChunksSearchService
from app.rag.models import QueryRequest, QueryResponse, RetrievalInfo
from app.services.query_log import QueryLog
from app.services.shop_docs import SHOP_DOCS_COLLECTION


logger = logging.getLogger(__name__)


class RagService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.search_service = QdrantSearchService(settings)
        self.local_chunks_service = LocalChunksSearchService(settings.local_chunks_path)
        self.answer_builder = create_answer_builder(settings)
        self.query_log = QueryLog(settings)

    def answer_question(self, request: QueryRequest) -> QueryResponse:
        top_k = request.top_k or self.settings.default_top_k
        requested_collection = request.collection or self.settings.selected_collection or "auto"
        chunks, retrieval_mode, retrieval_warnings, retrieval_collection = self._retrieve(
            request=request,
            top_k=top_k,
        )
        if not chunks and self.settings.enable_local_chunks_fallback:
            local_chunks = self.local_chunks_service.search(request.question, top_k)
            if local_chunks:
                chunks = local_chunks
                retrieval_mode = "keyword_fallback"
                retrieval_collection = "local_chunks"
                retrieval_warnings = _dedupe(retrieval_warnings + ["local_chunks_fallback"])

        if not chunks:
            if retrieval_warnings:
                logger.warning("Retrieval returned no chunks: %s", retrieval_warnings)
            response = QueryResponse.insufficient_evidence(
                collection=retrieval_collection or requested_collection,
                top_k=top_k,
                retrieval_mode=retrieval_mode,
            )
            self.query_log.log_query(request.question, response)
            return response

        best_score = chunks[0].score
        if best_score < self.settings.min_score_threshold:
            if retrieval_warnings:
                logger.warning("Retrieval below confidence threshold: %s", retrieval_warnings)
            response = QueryResponse.insufficient_evidence(
                collection=chunks[0].collection,
                top_k=top_k,
                retrieval_mode=retrieval_mode,
            )
            self.query_log.log_query(request.question, response)
            return response

        selected_chunks = chunks[: self.settings.max_context_chunks]
        answer, answer_warnings = self.answer_builder.build_answer(request.question, selected_chunks)
        scores = [chunk.score for chunk in selected_chunks]
        response = QueryResponse(
            answer=answer,
            citations=[chunk.citation() for chunk in selected_chunks],
            retrieval=RetrievalInfo(
                collection=retrieval_collection or selected_chunks[0].collection,
                top_k=top_k,
                used_chunks=len(selected_chunks),
                score_range=(min(scores), max(scores)),
                retrieval_mode=retrieval_mode,
            ),
            warnings=_dedupe(retrieval_warnings + answer_warnings),
        )
        self.query_log.log_query(request.question, response)
        logger.info(
            "Query answered mode=%s collection=%s chunks=%s scores=%s",
            response.retrieval.retrieval_mode,
            response.retrieval.collection,
            [citation.chunk_id for citation in response.citations],
            scores,
        )
        return response

    def _retrieve(self, request: QueryRequest, top_k: int):
        if request.collection:
            chunks, mode, warnings = self.search_service.search(
                question=request.question,
                collection=request.collection,
                top_k=top_k,
                filters=request.filters,
            )
            return chunks, mode, warnings, request.collection

        available = set(self.search_service.available_collections())
        preferred = [name for name in [self.settings.selected_collection, SHOP_DOCS_COLLECTION] if name]
        collections = []
        for collection in preferred:
            if collection in available and collection not in collections:
                collections.append(collection)

        if len(collections) <= 1:
            chunks, mode, warnings = self.search_service.search(
                question=request.question,
                collection=collections[0] if collections else None,
                top_k=top_k,
                filters=request.filters,
            )
            return chunks, mode, warnings, chunks[0].collection if chunks else (collections[0] if collections else "auto")

        all_chunks = []
        all_warnings = []
        modes = []
        for collection in collections:
            chunks, mode, warnings = self.search_service.search(
                question=request.question,
                collection=collection,
                top_k=top_k,
                filters=request.filters,
            )
            all_chunks.extend(chunks)
            all_warnings.extend(warnings)
            modes.append(mode)
        all_chunks.sort(key=lambda chunk: chunk.score, reverse=True)
        mode = "vector" if "vector" in modes else "keyword_fallback"
        return all_chunks[:top_k], mode, _dedupe(all_warnings), "all"


def _dedupe(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            result.append(item)
    return result
