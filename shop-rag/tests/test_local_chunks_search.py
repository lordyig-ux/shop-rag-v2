import json

from app.rag.local_chunks import LocalChunksSearchService


def test_local_chunks_search_returns_cited_icbc_chunks(tmp_path) -> None:
    chunks_path = tmp_path / "chunks.jsonl"
    chunks = [
        {
            "id": "ats_chunk_0",
            "text": "ATS applies when alternate transportation service policy conditions are met.",
            "metadata": {
                "title": "ATS policy",
                "category": "Claims > Policies",
                "source_url": "https://example.test/ats",
            },
        },
        {
            "id": "paint_chunk_0",
            "text": "Paint allowance text unrelated to transportation.",
            "metadata": {"title": "Paint policy"},
        },
    ]
    chunks_path.write_text("\n".join(json.dumps(chunk) for chunk in chunks), encoding="utf-8")

    service = LocalChunksSearchService(chunks_path=chunks_path)
    results = service.search("When does ATS apply?", top_k=3)

    assert len(results) == 1
    assert results[0].chunk_id == "ats_chunk_0"
    assert results[0].title == "ATS policy"
    assert results[0].source_url == "https://example.test/ats"
    assert results[0].collection == "local_chunks"
    assert results[0].score > 0.25


def test_local_chunks_search_ignores_generic_policy_apply_terms(tmp_path) -> None:
    chunks_path = tmp_path / "chunks.jsonl"
    chunks = [
        {
            "id": "ats_chunk_0",
            "text": "ATS replacement vehicle requirements apply during the repair process.",
            "metadata": {"title": "Collision repair program Alternative Transportation Service management policy"},
        },
        {
            "id": "allowance_chunk_0",
            "text": "Steps to apply repair allowance on a vehicle under a general policy.",
            "metadata": {"title": "Allowance policy"},
        },
    ]
    chunks_path.write_text("\n".join(json.dumps(chunk) for chunk in chunks), encoding="utf-8")

    service = LocalChunksSearchService(chunks_path=chunks_path)
    results = service.search("When does ATS policy apply?", top_k=5)

    assert [result.chunk_id for result in results] == ["ats_chunk_0"]
