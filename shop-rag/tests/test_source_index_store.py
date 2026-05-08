from app.services.source_index import SourceIndex, SourceRecord


def test_source_index_upserts_searches_and_paginates(tmp_path) -> None:
    index = SourceIndex(tmp_path / "source_index.sqlite")
    index.upsert_sources(
        [
            SourceRecord(
                source_id="icbc-ats",
                collection="icbc_procedures",
                knowledge_type="icbc",
                title="ATS policy",
                source_ref="https://example.test/ats",
                source_url="https://example.test/ats",
                file_type="url",
                category="Claims > Policies",
                chunk_count=3,
                content_hash="hash-1",
            ),
            SourceRecord(
                source_id="shop-sop",
                collection="shop_docs_v1",
                knowledge_type="shop_docs",
                title="Aluminum SOP",
                source_ref="aluminum.docx",
                file_type="docx",
                category="SOP",
                chunk_count=2,
                content_hash="hash-2",
            ),
        ]
    )

    page = index.search(query="aluminum", limit=10)

    assert page.total == 1
    assert page.items[0].source_id == "shop-sop"
    assert page.items[0].title == "Aluminum SOP"

    filtered = index.search(knowledge_type="icbc", file_type="url", limit=10)
    assert filtered.total == 1
    assert filtered.items[0].source_id == "icbc-ats"


def test_source_index_replaces_collection_source_records(tmp_path) -> None:
    index = SourceIndex(tmp_path / "source_index.sqlite")
    index.upsert_sources(
        [
            SourceRecord(
                source_id="old",
                collection="shop_docs_v1",
                knowledge_type="shop_docs",
                title="Old doc",
                source_ref="old.txt",
                file_type="txt",
            )
        ]
    )

    index.replace_collection_sources(
        "shop_docs_v1",
        [
            SourceRecord(
                source_id="new",
                collection="shop_docs_v1",
                knowledge_type="shop_docs",
                title="New doc",
                source_ref="new.txt",
                file_type="txt",
            )
        ],
    )

    page = index.search(collection="shop_docs_v1", limit=10)
    assert page.total == 1
    assert page.items[0].source_id == "new"
