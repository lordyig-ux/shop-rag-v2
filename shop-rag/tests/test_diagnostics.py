from app.core.config import Settings
from app.services import diagnostics


def test_ollama_health_uses_api_key_without_exposing_it(monkeypatch) -> None:
    captured = {}

    class FakeResponse:
        status_code = 200

    def fake_get(url, timeout, headers=None):
        captured["url"] = url
        captured["timeout"] = timeout
        captured["headers"] = headers
        return FakeResponse()

    monkeypatch.setattr(diagnostics.httpx, "get", fake_get)
    settings = Settings(
        answer_provider="ollama",
        ollama_base_url="https://ollama.com",
        ollama_model="gpt-oss:120b",
        ollama_api_key="ollama-secret-key",
    )

    assert diagnostics.check_ollama(settings) is True
    health = diagnostics.system_health(settings)

    assert captured["url"] == "https://ollama.com/api/tags"
    assert captured["headers"] == {"Authorization": "Bearer ollama-secret-key"}
    assert health["ollama"]["api_key_present"] is True
    assert "ollama-secret-key" not in str(health)
