from types import SimpleNamespace

from app.core.config import Settings
from app.qdrant import search as search_module
from app.qdrant.search import QdrantSearchService


class QueryPointsOnlyClient:
    def __init__(self) -> None:
        self.query_vector: list[float] | None = None

    def query_points(
        self,
        collection_name: str,
        query: list[float],
        limit: int,
        with_payload: bool,
        with_vectors: bool,
    ) -> SimpleNamespace:
        self.query_vector = query
        return SimpleNamespace(
            points=[
                SimpleNamespace(
                    id="point-1",
                    score=0.91,
                    payload={
                        "id": "ats_chunk_0",
                        "text": "ATS applies when the indexed policy conditions are met.",
                        "title": "ATS policy",
                        "source_url": "https://example.test/ats",
                    },
                )
            ]
        )


def test_vector_search_supports_qdrant_query_points_clients(monkeypatch) -> None:
    settings = Settings(qdrant_collection="icbc", query_embedding_model="fake-model")
    client = QueryPointsOnlyClient()
    monkeypatch.setattr(search_module, "create_qdrant_client", lambda _: client)

    service = QdrantSearchService(settings)
    monkeypatch.setattr(service, "_embed_question", lambda _: [0.1, 0.2, 0.3])

    chunks = service._vector_search("What does ICBC say about ATS?", "icbc", 3, None)

    assert client.query_vector == [0.1, 0.2, 0.3]
    assert len(chunks) == 1
    assert chunks[0].chunk_id == "point-1"
    assert chunks[0].title == "ATS policy"
    assert chunks[0].score == 0.91


def test_query_embedding_model_is_cached(monkeypatch) -> None:
    created_models: list[str] = []

    class FakeSentenceTransformer:
        def __init__(self, model_name: str) -> None:
            created_models.append(model_name)

        def encode(self, texts, show_progress_bar=False):
            del texts, show_progress_bar
            return SimpleNamespace(tolist=lambda: [[0.1, 0.2, 0.3]])

    monkeypatch.setattr(search_module, "SentenceTransformer", FakeSentenceTransformer)
    search_module.get_cached_sentence_transformer.cache_clear()
    settings = Settings(query_embedding_model="fake-model")
    service = QdrantSearchService(settings)

    first = service._embed_question("ATS policy?")
    second = service._embed_question("Paint policy?")

    assert first == [0.1, 0.2, 0.3]
    assert second == [0.1, 0.2, 0.3]
    assert created_models == ["fake-model"]
