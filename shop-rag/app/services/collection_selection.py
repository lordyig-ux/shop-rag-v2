from pathlib import Path

from app.core.config import Settings


def selection_path(settings: Settings, path: Path | None = None) -> Path:
    return path or (settings.data_dir / "selected_collection.txt")


def read_selected_collection(settings: Settings, path: Path | None = None) -> str | None:
    target = selection_path(settings, path)
    if not target.exists():
        return None
    value = target.read_text(encoding="utf-8").strip()
    return value or None


def write_selected_collection(settings: Settings, collection: str, path: Path | None = None) -> None:
    target = selection_path(settings, path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(collection.strip(), encoding="utf-8")
