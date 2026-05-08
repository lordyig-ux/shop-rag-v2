from app.qdrant.inspector import CollectionInspection, QdrantInspectionReport


def test_inspection_report_renders_embedding_risk_when_unknown() -> None:
    report = QdrantInspectionReport(
        qdrant_url="http://127.0.0.1:6333",
        connected=True,
        collections=[
            CollectionInspection(
                name="icbc_procedures",
                point_count=1762,
                vector_dimensions={"default": 384},
                vector_distances={"default": "Cosine"},
                payload_fields=["text", "title", "source_url"],
                likely_text_fields=["text"],
                likely_title_fields=["title"],
                likely_source_url_fields=["source_url"],
                embedding_model=None,
                sample_count=1,
            )
        ],
    )

    markdown = report.to_markdown()

    assert "# Qdrant Inspection Report" in markdown
    assert "icbc_procedures" in markdown
    assert "Embedding model was not detected" in markdown
    assert "keyword/payload fallback" in markdown
