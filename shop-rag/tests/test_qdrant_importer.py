import json

from app.qdrant.importer import QdrantChunkImporter, build_qdrant_payload, load_chunk_records


class FakeEmbeddingProvider:
    model_name = "fake-embedding-model"

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        return [[float(index), 0.5, 1.0] for index, _ in enumerate(texts, start=1)]


class FakeQdrantClient:
    def __init__(self) -> None:
        self.exists = False
        self.created: list[object] = []
        self.deleted: list[str] = []
        self.upserts: list[tuple[str, list[object], bool]] = []

    def collection_exists(self, collection_name: str) -> bool:
        return self.exists

    def create_collection(self, collection_name: str, vectors_config: object) -> None:
        self.exists = True
        self.created.append(vectors_config)

    def delete_collection(self, collection_name: str) -> None:
        self.exists = False
        self.deleted.append(collection_name)

    def upsert(self, collection_name: str, points: list[object], wait: bool) -> None:
        self.upserts.append((collection_name, points, wait))


def test_load_chunk_records_reads_jsonl_chunks(tmp_path) -> None:
    chunks_path = tmp_path / "chunks.jsonl"
    chunks_path.write_text(
        json.dumps(
            {
                "id": "ATS_chunk_0",
                "text": "ATS applies when policy conditions are met.",
                "metadata": {
                    "title": "ATS policy",
                    "category": "Claims > Policies",
                    "source_url": "https://example.test/ats",
                },
            }
        )
        + "\n",
        encoding="utf-8",
    )

    records = load_chunk_records(chunks_path)

    assert len(records) == 1
    assert records[0].chunk_id == "ATS_chunk_0"
    assert records[0].text == "ATS applies when policy conditions are met."
    assert records[0].metadata["title"] == "ATS policy"


def test_build_qdrant_payload_keeps_searchable_fields(tmp_path) -> None:
    chunks_path = tmp_path / "chunks.jsonl"
    chunks_path.write_text(
        json.dumps(
            {
                "id": "paint_chunk_0",
                "text": "Paint policy excerpt.",
                "metadata": {
                    "title": "Paint policy",
                    "category": "Paint > Policies",
                    "source_url": "https://example.test/paint",
                    "date_modified": "2026-01-01",
                },
            }
        ),
        encoding="utf-8",
    )
    record = load_chunk_records(chunks_path)[0]

    payload = build_qdrant_payload(record, embedding_model="fake-model")

    assert payload["id"] == "paint_chunk_0"
    assert payload["text"] == "Paint policy excerpt."
    assert payload["title"] == "Paint policy"
    assert payload["category"] == "Paint > Policies"
    assert payload["source_url"] == "https://example.test/paint"
    assert payload["date_modified"] == "2026-01-01"
    assert payload["metadata"]["title"] == "Paint policy"
    assert payload["embedding_model"] == "fake-model"


def test_build_qdrant_payload_promotes_pdf_page_metadata(tmp_path) -> None:
    chunks_path = tmp_path / "chunks.jsonl"
    chunks_path.write_text(
        json.dumps(
            {
                "id": "pdf_page_12",
                "text": "PDF page evidence.",
                "metadata": {
                    "source_url": "https://example.test/file.pdf",
                    "source_url_with_page": "https://example.test/file.pdf#page=12",
                    "file_type": "pdf",
                    "page_number": 12,
                    "page_start": 12,
                    "page_end": 12,
                    "page_range": "12",
                },
            }
        ),
        encoding="utf-8",
    )
    record = load_chunk_records(chunks_path)[0]

    payload = build_qdrant_payload(record, embedding_model="fake-model")

    assert payload["source_url_with_page"] == "https://example.test/file.pdf#page=12"
    assert payload["file_type"] == "pdf"
    assert payload["page_number"] == 12
    assert payload["page_start"] == 12
    assert payload["page_end"] == 12
    assert payload["page_range"] == "12"


def test_importer_creates_collection_and_upserts_batches(tmp_path) -> None:
    chunks_path = tmp_path / "chunks.jsonl"
    chunks = [
        {"id": "chunk_a", "text": "First searchable excerpt.", "metadata": {"title": "First"}},
        {"id": "chunk_b", "text": "Second searchable excerpt.", "metadata": {"title": "Second"}},
    ]
    chunks_path.write_text("\n".join(json.dumps(chunk) for chunk in chunks), encoding="utf-8")
    client = FakeQdrantClient()

    importer = QdrantChunkImporter(
        client=client,
        embedding_provider=FakeEmbeddingProvider(),
        collection_name="icbc_test",
        batch_size=1,
    )
    result = importer.import_file(chunks_path)

    assert result.collection_name == "icbc_test"
    assert result.imported_points == 2
    assert result.vector_size == 3
    assert result.embedding_model == "fake-embedding-model"
    assert len(client.created) == 1
    assert len(client.upserts) == 2
    first_point = client.upserts[0][1][0]
    assert first_point.payload["id"] == "chunk_a"
    assert first_point.payload["title"] == "First"
    assert isinstance(first_point.id, str)
    assert first_point.id != "chunk_a"
