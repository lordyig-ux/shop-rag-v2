from app.services.icbc_maintenance import compare_icbc_nav_entries
from app.services.source_index import SourceRecord


def test_compare_icbc_nav_entries_reports_new_removed_and_changed() -> None:
    current_sources = [
        SourceRecord(
            source_id="old-id",
            collection="icbc_procedures",
            knowledge_type="icbc",
            title="Old removed topic",
            source_ref="old-id",
            file_type="url",
            category="Old",
        ),
        SourceRecord(
            source_id="same-id",
            collection="icbc_procedures",
            knowledge_type="icbc",
            title="Old title",
            source_ref="same-id",
            file_type="url",
            category="Old category",
        ),
    ]
    latest_entries = [
        {"id": "same-id", "title": "New title", "category": "New category"},
        {"id": "new-id", "title": "Brand new topic", "category": "New"},
    ]

    summary = compare_icbc_nav_entries(latest_entries, current_sources)

    assert summary.new_count == 1
    assert summary.removed_count == 1
    assert summary.changed_count == 1
    assert summary.new_topics[0]["id"] == "new-id"
    assert summary.removed_topics[0]["id"] == "old-id"
    assert summary.changed_topics[0]["id"] == "same-id"
