from app.core.config import Settings
from app.rag.models import QueryRequest, RetrievedChunk
from app.rag.retriever import RagService


class FakeSearchService:
    def search(self, question, collection, top_k, filters=None):
        del question, filters
        if collection == "icbc_procedures":
            return [
                RetrievedChunk(
                    collection="icbc_procedures",
                    chunk_id="icbc-1",
                    text="ICBC ATS policy",
                    title="ICBC ATS",
                    score=0.7,
                )
            ], "vector", []
        if collection == "shop_docs_v1":
            return [
                RetrievedChunk(
                    collection="shop_docs_v1",
                    chunk_id="shop-1",
                    text="Shop ATS SOP",
                    title="Shop ATS",
                    score=0.9,
                )
            ], "vector", []
        return [], "vector", []

    def available_collections(self):
        return ["icbc_procedures", "shop_docs_v1"]


class FakeAnswerBuilder:
    def build_answer(self, question, chunks):
        del question
        return f"Answered with {len(chunks)} chunks", []


class FakeQueryLog:
    def log_query(self, question, response):
        del question, response


def test_default_query_searches_icbc_and_shop_docs() -> None:
    service = RagService(Settings(answer_provider="disabled", min_score_threshold=0.1))
    service.search_service = FakeSearchService()
    service.answer_builder = FakeAnswerBuilder()
    service.query_log = FakeQueryLog()

    response = service.answer_question(QueryRequest(question="ATS"))

    assert response.retrieval.collection == "all"
    assert response.retrieval.used_chunks == 2
    assert [citation.collection for citation in response.citations] == ["shop_docs_v1", "icbc_procedures"]
