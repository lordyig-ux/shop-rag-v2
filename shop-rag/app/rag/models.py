from typing import Any, Literal

from pydantic import BaseModel, Field


RetrievalMode = Literal["vector", "keyword_fallback"]

INSUFFICIENT_EVIDENCE_ANSWER = (
    "I could not find enough evidence in the indexed ICBC policy data to answer that reliably."
)


class QueryRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    collection: str | None = None
    top_k: int | None = Field(default=None, ge=1, le=50)
    filters: dict[str, Any] = Field(default_factory=dict)


class Citation(BaseModel):
    title: str
    source_url: str | None = None
    source_url_with_page: str | None = None
    page_number: int | None = None
    page_range: str | None = None
    collection: str
    chunk_id: str
    score: float
    excerpt: str


class RetrievalInfo(BaseModel):
    collection: str
    top_k: int
    used_chunks: int
    score_range: tuple[float, float] | None = None
    retrieval_mode: RetrievalMode


class QueryResponse(BaseModel):
    answer: str
    citations: list[Citation]
    retrieval: RetrievalInfo
    warnings: list[str] = Field(default_factory=list)

    @classmethod
    def insufficient_evidence(
        cls,
        collection: str,
        top_k: int,
        retrieval_mode: RetrievalMode,
        warnings: list[str] | None = None,
    ) -> "QueryResponse":
        response_warnings = warnings if warnings is not None else ["low_retrieval_confidence"]
        if "low_retrieval_confidence" not in response_warnings:
            response_warnings.append("low_retrieval_confidence")
        return cls(
            answer=INSUFFICIENT_EVIDENCE_ANSWER,
            citations=[],
            retrieval=RetrievalInfo(
                collection=collection,
                top_k=top_k,
                used_chunks=0,
                score_range=None,
                retrieval_mode=retrieval_mode,
            ),
            warnings=response_warnings,
        )


class RetrievedChunk(BaseModel):
    collection: str
    chunk_id: str
    text: str
    title: str
    source_url: str | None = None
    score: float
    payload: dict[str, Any] = Field(default_factory=dict)

    def citation(self) -> Citation:
        page_number = _int_or_none(self.payload.get("page_number"))
        page_range = self.payload.get("page_range")
        source_url_with_page = _string_or_none(self.payload.get("source_url_with_page")) or _pdf_page_url(
            self.source_url,
            page_number,
        )
        return Citation(
            title=self.title,
            source_url=self.source_url,
            source_url_with_page=source_url_with_page,
            page_number=page_number,
            page_range=str(page_range) if page_range else None,
            collection=self.collection,
            chunk_id=self.chunk_id,
            score=round(self.score, 4),
            excerpt=self.text[:1200],
        )


def _int_or_none(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _string_or_none(value: Any) -> str | None:
    text = str(value).strip() if value is not None else ""
    return text or None


def _pdf_page_url(source_url: str | None, page_number: int | None) -> str | None:
    if not source_url or not page_number or ".pdf" not in source_url.lower():
        return None
    return f"{source_url.split('#', 1)[0]}#page={page_number}"
