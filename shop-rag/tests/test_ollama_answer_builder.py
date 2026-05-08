from types import SimpleNamespace

from app.core.config import Settings
from app.rag.answer_builder import OllamaAnswerBuilder
from app.rag.models import RetrievedChunk


def test_ollama_answer_builder_posts_evidence_prompt(monkeypatch) -> None:
    captured = {}

    def fake_post(url, json, timeout, headers=None):
        captured["url"] = url
        captured["json"] = json
        captured["timeout"] = timeout
        captured["headers"] = headers
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"message": {"content": "Based on the indexed knowledge base content, test answer [1]."}},
        )

    monkeypatch.setattr("app.rag.answer_builder.httpx.post", fake_post)
    settings = Settings(
        answer_provider="ollama",
        ollama_base_url="http://127.0.0.1:11434",
        ollama_model="llama3.2:3b",
        ollama_api_key="",
    )
    builder = OllamaAnswerBuilder(settings)
    chunks = [
        RetrievedChunk(
            collection="icbc",
            chunk_id="chunk-1",
            text="Relevant ICBC excerpt",
            title="ATS policy",
            source_url="https://example.test",
            score=0.87,
        )
    ]

    answer, warnings = builder.build_answer("What does ICBC policy say about ATS?", chunks)

    assert answer == "Based on the indexed knowledge base content, test answer [1]."
    assert warnings == []
    assert captured["url"] == "http://127.0.0.1:11434/api/chat"
    assert captured["headers"] is None
    assert captured["json"]["model"] == "llama3.2:3b"
    assert captured["json"]["stream"] is False
    assert captured["json"]["keep_alive"] == "30m"
    assert captured["json"]["messages"][0]["role"] == "system"
    assert "Relevant ICBC excerpt" in captured["json"]["messages"][1]["content"]


def test_ollama_answer_builder_sends_bearer_key_for_cloud_api(monkeypatch) -> None:
    captured = {}

    def fake_post(url, json, timeout, headers=None):
        captured["url"] = url
        captured["json"] = json
        captured["timeout"] = timeout
        captured["headers"] = headers
        return SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"message": {"content": "Based on the indexed knowledge base content, cloud answer [1]."}},
        )

    monkeypatch.setattr("app.rag.answer_builder.httpx.post", fake_post)
    settings = Settings(
        answer_provider="ollama",
        ollama_base_url="https://ollama.com",
        ollama_model="gpt-oss:120b",
        ollama_api_key="ollama-secret-key",
    )
    builder = OllamaAnswerBuilder(settings)
    chunks = [
        RetrievedChunk(
            collection="icbc",
            chunk_id="chunk-1",
            text="Relevant ICBC excerpt",
            title="ATS policy",
            score=0.87,
        )
    ]

    answer, warnings = builder.build_answer("Question?", chunks)

    assert answer == "Based on the indexed knowledge base content, cloud answer [1]."
    assert warnings == []
    assert captured["url"] == "https://ollama.com/api/chat"
    assert captured["headers"] == {"Authorization": "Bearer ollama-secret-key"}
    assert captured["json"]["model"] == "gpt-oss:120b"


def test_ollama_answer_builder_falls_back_when_unavailable(monkeypatch) -> None:
    def fake_post(url, json, timeout, headers=None):
        del url, json, timeout, headers
        raise TimeoutError("ollama unavailable")

    monkeypatch.setattr("app.rag.answer_builder.httpx.post", fake_post)
    settings = Settings(answer_provider="ollama")
    builder = OllamaAnswerBuilder(settings)
    chunks = [
        RetrievedChunk(
            collection="icbc",
            chunk_id="chunk-1",
            text="Relevant ICBC excerpt",
            title="ATS policy",
            score=0.87,
        )
    ]

    answer, warnings = builder.build_answer("Question?", chunks)

    assert "Based on the indexed knowledge base content" in answer
    assert warnings == ["ollama_answer_generation_error:TimeoutError"]
