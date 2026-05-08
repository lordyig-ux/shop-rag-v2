from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "shop-rag"
    app_env: str = "local"
    app_host: str = "0.0.0.0"
    app_port: int = 8000

    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_collection: str = ""
    qdrant_api_key: str = ""

    openai_api_key: str = ""
    openai_model: str = "gpt-5.2"
    answer_provider: Literal["openai", "ollama", "disabled"] = "openai"
    ollama_base_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.2:1b"
    ollama_api_key: str = ""
    ollama_timeout_seconds: float = Field(default=60.0, ge=1.0, le=300.0)
    ollama_keep_alive: str = "30m"

    admin_username: str = "admin"
    admin_password: str = "change-this-password"

    staff_access_mode: Literal["open"] = "open"
    default_top_k: int = Field(default=6, ge=1, le=50)
    max_context_chunks: int = Field(default=3, ge=1, le=20)
    min_score_threshold: float = Field(default=0.25, ge=0.0, le=1.0)
    keyword_fallback_scan_limit: int = Field(default=2500, ge=1, le=50000)
    query_embedding_model: str = ""
    enable_local_chunks_fallback: bool = True
    local_chunks_path: Path = PROJECT_ROOT.parent / "output" / "chunks.jsonl"
    shop_docs_inbox_path: Path = PROJECT_ROOT / "data" / "shop_docs" / "inbox"

    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def data_dir(self) -> Path:
        return PROJECT_ROOT / "data"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def reports_dir(self) -> Path:
        return self.data_dir / "reports"

    @property
    def templates_dir(self) -> Path:
        return PROJECT_ROOT / "app" / "ui" / "templates"

    @property
    def static_dir(self) -> Path:
        return PROJECT_ROOT / "app" / "ui" / "static"

    @property
    def inspection_report_path(self) -> Path:
        return PROJECT_ROOT / "QDRANT_INSPECTION_REPORT.md"

    @property
    def jobs_dir(self) -> Path:
        return self.data_dir / "jobs"

    @property
    def source_index_path(self) -> Path:
        return self.data_dir / "source_index.sqlite"

    @property
    def openai_configured(self) -> bool:
        return bool(self.openai_api_key.strip())

    @property
    def ollama_configured(self) -> bool:
        return bool(self.ollama_base_url.strip() and self.ollama_model.strip())

    @property
    def ollama_api_key_value(self) -> str | None:
        key = self.ollama_api_key.strip()
        return key or None

    @property
    def qdrant_api_key_value(self) -> str | None:
        key = self.qdrant_api_key.strip()
        return key or None

    @property
    def selected_collection(self) -> str | None:
        collection = self.qdrant_collection.strip()
        if collection:
            return collection
        runtime_selection = self.data_dir / "selected_collection.txt"
        if runtime_selection.exists():
            value = runtime_selection.read_text(encoding="utf-8").strip()
            return value or None
        return None

    def ensure_local_dirs(self) -> None:
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        self.jobs_dir.mkdir(parents=True, exist_ok=True)
        self.shop_docs_inbox_path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_local_dirs()
    return settings
