from __future__ import annotations

from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.config import get_settings  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.services.shop_docs import run_shop_docs_import  # noqa: E402
from app.services.source_index import SourceIndex  # noqa: E402


class ConsoleJobContext:
    def set_step(self, step: str) -> None:
        print(f"Step: {step}")

    def log(self, message: str) -> None:
        print(message)


def main() -> int:
    settings = get_settings()
    configure_logging(settings)
    inbox = settings.shop_docs_inbox_path

    print("Importing shop documents into Qdrant")
    print(f"Inbox: {inbox}")
    print(f"Qdrant URL: {settings.qdrant_url}")

    if not inbox.exists():
        print("No shop-doc inbox exists yet. Nothing to import.")
        return 0

    has_files = any(path.is_file() for path in inbox.rglob("*"))
    if not has_files:
        print("Shop-doc inbox is empty. Nothing to import.")
        return 0

    result = run_shop_docs_import(
        settings=settings,
        source_index=SourceIndex(settings.source_index_path),
        context=ConsoleJobContext(),  # type: ignore[arg-type]
    )

    print("")
    print("Shop-doc import complete.")
    for key, value in result.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
