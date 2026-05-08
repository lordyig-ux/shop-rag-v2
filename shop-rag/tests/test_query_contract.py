from app.rag.models import Citation, QueryResponse, RetrievalInfo, RetrievedChunk


def test_query_response_shape_matches_frontend_contract() -> None:
    response = QueryResponse(
        answer="Based on the indexed knowledge base content, ATS is discussed in the supplied source.",
        citations=[
            Citation(
                title="ATS policy",
                source_url="https://example.test/ats",
                source_url_with_page="https://example.test/ats.pdf#page=4",
                page_number=4,
                page_range="4",
                collection="icbc",
                chunk_id="ats_chunk_0",
                score=0.82,
                excerpt="ATS source excerpt",
            )
        ],
        retrieval=RetrievalInfo(
            collection="icbc",
            top_k=12,
            used_chunks=1,
            score_range=(0.82, 0.82),
            retrieval_mode="keyword_fallback",
        ),
        warnings=[],
    )

    data = response.model_dump(mode="json")

    assert data["citations"][0]["source_url"] == "https://example.test/ats"
    assert data["citations"][0]["source_url_with_page"] == "https://example.test/ats.pdf#page=4"
    assert data["citations"][0]["page_number"] == 4
    assert data["citations"][0]["page_range"] == "4"
    assert data["retrieval"]["retrieval_mode"] == "keyword_fallback"
    assert data["retrieval"]["score_range"] == [0.82, 0.82]


def test_low_confidence_response_has_required_message_and_warning() -> None:
    response = QueryResponse.insufficient_evidence(
        collection="icbc",
        top_k=12,
        retrieval_mode="keyword_fallback",
    )

    assert response.answer == "I could not find enough evidence in the indexed ICBC policy data to answer that reliably."
    assert response.citations == []
    assert response.retrieval.used_chunks == 0
    assert response.warnings == ["low_retrieval_confidence"]


def test_retrieved_pdf_chunk_citation_uses_page_metadata() -> None:
    chunk = RetrievedChunk(
        collection="shop_docs_v1",
        chunk_id="chunk-1",
        text="Evidence from page 12",
        title="collision-program-guide",
        source_url="https://example.test/collision-program-guide.pdf",
        score=0.91,
        payload={"page_number": 12, "page_range": "12"},
    )

    citation = chunk.citation()

    assert citation.source_url == "https://example.test/collision-program-guide.pdf"
    assert citation.source_url_with_page == "https://example.test/collision-program-guide.pdf#page=12"
    assert citation.page_number == 12
    assert citation.page_range == "12"
