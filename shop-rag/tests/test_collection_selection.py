from app.core.config import Settings
from app.services.collection_selection import read_selected_collection, write_selected_collection


def test_runtime_collection_selection_is_persisted(tmp_path) -> None:
    settings = Settings()
    path = tmp_path / "selected_collection.txt"

    assert read_selected_collection(settings, path=path) is None

    write_selected_collection(settings, "icbc_procedures", path=path)

    assert read_selected_collection(settings, path=path) == "icbc_procedures"
