from fastapi.testclient import TestClient

from app.main import app


AUTH = ("admin", "change-this-password")


def test_admin_tools_page_contains_maintenance_instructions() -> None:
    client = TestClient(app)

    response = client.get("/admin", auth=AUTH)

    assert response.status_code == 200
    assert "Knowledge Base Tools" in response.text
    assert response.text.index("Knowledge Base Tools") < response.text.index("Background Jobs")
    assert response.text.index("Background Jobs") < response.text.index("Source Index")
    assert response.text.index("Source Index") < response.text.index("Advanced Diagnostics")
    assert response.text.index("Advanced Diagnostics") < response.text.index("Clean Up Staging Collections")
    assert 'data-admin-tab="icbc"' in response.text
    assert 'data-admin-tab="shop-docs"' in response.text
    assert 'data-admin-tab="mitchell-ceg"' in response.text
    assert 'id="cleanup-staging-collections"' in response.text
    assert "shop_docs" in response.text
    assert "Check ICBC Updates" in response.text
    assert "Refresh Mitchell CEG" in response.text


def test_admin_jobs_endpoint_is_protected() -> None:
    client = TestClient(app)

    response = client.get("/api/admin/jobs/current")

    assert response.status_code == 401


def test_admin_source_index_endpoint_returns_page() -> None:
    client = TestClient(app)

    response = client.get("/api/admin/source-index?limit=5", auth=AUTH)

    assert response.status_code == 200
    data = response.json()
    assert set(data.keys()) == {"total", "limit", "offset", "items"}
    assert data["limit"] == 5


def test_admin_shop_docs_scan_endpoint_returns_inbox_path() -> None:
    client = TestClient(app)

    response = client.get("/api/admin/shop-docs/scan", auth=AUTH)

    assert response.status_code == 200
    data = response.json()
    assert "shop_docs" in data["inbox_path"]
    assert "items" in data
