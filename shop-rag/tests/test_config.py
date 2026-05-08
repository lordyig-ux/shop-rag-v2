from app.core.config import Settings


def test_settings_defaults_match_local_lan_app() -> None:
    settings = Settings()

    assert settings.app_name == "shop-rag"
    assert settings.app_host == "0.0.0.0"
    assert settings.app_port == 8000
    assert settings.qdrant_url == "http://127.0.0.1:6333"
    assert settings.default_top_k == 6
    assert settings.max_context_chunks == 3
    assert settings.ollama_keep_alive == "30m"
