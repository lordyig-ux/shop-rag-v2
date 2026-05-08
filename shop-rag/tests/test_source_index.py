from types import SimpleNamespace

from app.core.config import Settings
from app.api import sources as sources_module


class FakeScrollClient:
    def __init__(self) -> None:
        self.scroll_calls = 0

    def scroll(self, collection_name, limit, offset, with_payload, with_vectors):
        del collection_name, limit, offset, with_payload, with_vectors
        self.scroll_calls += 1
        if self.scroll_calls > 1:
            return [], None
        return [
            SimpleNamespace(
                id="point-1",
                payload={
                    "id": "ats_chunk_0",
                    "text": "ATS replacement vehicle policy excerpt.",
                    "title": "ATS policy",
                    "source_url": "https://example.test/ats",
                },
            )
        ], None


def test_source_index_reuses_cached_scan(monkeypatch) -> None:
    client = FakeScrollClient()
    settings = Settings(qdrant_collection="icbc")
    monkeypatch.setattr(sources_module, "create_qdrant_client", lambda _: client)
    sources_module._SOURCE_INDEX_CACHE.clear()

    first = sources_module._scan_sources(settings, "icbc", "ATS", 50)
    second = sources_module._scan_sources(settings, "icbc", "ATS", 50)

    assert client.scroll_calls == 1
    assert first == second
    assert first[0]["title"] == "ATS policy"
