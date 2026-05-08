from fastapi.testclient import TestClient

from app.api.query import get_rag_service
from app.main import app
from app.rag.models import QueryResponse


def test_health_endpoint_returns_status() -> None:
    client = TestClient(app)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_staff_page_loads() -> None:
    client = TestClient(app)

    response = client.get("/")

    assert response.status_code == 200
    assert "Terminal Autobody Knowledge Base" in response.text
    assert 'type="search"' in response.text
    assert "What does Mitchell CEG say about quarter panel sectioning?" in response.text
    assert 'name="filter"' not in response.text
    assert "checkbox" not in response.text


def test_admin_page_requires_login() -> None:
    client = TestClient(app)

    response = client.get("/admin")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Basic"


def test_query_endpoint_returns_structured_low_confidence_json() -> None:
    class FakeRagService:
        def answer_question(self, request):
            return QueryResponse.insufficient_evidence(
                collection="test",
                top_k=request.top_k,
                retrieval_mode="vector",
            )

    app.dependency_overrides[get_rag_service] = lambda: FakeRagService()
    client = TestClient(app)
    try:
        response = client.post("/api/query", json={"question": "qzxjkv blorpt fnerp", "top_k": 3})

        assert response.status_code == 200
        data = response.json()
        assert set(data.keys()) == {"answer", "citations", "retrieval", "warnings"}
        assert data["citations"] == []
        assert data["warnings"] == ["low_retrieval_confidence"]
    finally:
        app.dependency_overrides.clear()
