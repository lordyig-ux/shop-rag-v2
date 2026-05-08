from app.qdrant.schema_mapper import infer_payload_schema


def test_infer_payload_schema_detects_common_icbc_fields() -> None:
    samples = [
        {
            "title": "Policy on pre-repair and post-repair scanning",
            "category": "Vehicle damage > Policies",
            "source_url": "https://mdp.partners.icbc.com/topic/example",
            "content_url": "https://mdp.partners.icbc.com/topics/example.html",
            "date_modified": "2024-01-15",
            "chunk_index": 2,
            "total_chunks": 5,
            "text": "Scanning policy text",
        }
    ]

    schema = infer_payload_schema(samples)

    assert schema.text_fields == ["text"]
    assert schema.title_fields == ["title"]
    assert schema.source_url_fields == ["source_url", "content_url"]
    assert schema.category_fields == ["category"]
    assert schema.timestamp_fields == ["date_modified"]
    assert "chunk_index" in schema.metadata_fields
