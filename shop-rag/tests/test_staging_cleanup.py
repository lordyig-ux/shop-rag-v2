from types import SimpleNamespace

from fastapi.testclient import TestClient

from app.main import app
from app.services.staging_cleanup import cleanup_staging_collections


AUTH = ("admin", "change-this-password")


def test_cleanup_staging_collections_deletes_only_staging() -> None:
    deleted: list[str] = []

    class FakeClient:
        def get_collections(self):
            return SimpleNamespace(
                collections=[
                    SimpleNamespace(name="icbc_procedures"),
                    SimpleNamespace(name="icbc_procedures_staging"),
                    SimpleNamespace(name="shop_docs_v1"),
                    SimpleNamespace(name="shop_docs_v1_staging"),
                ]
            )

        def delete_collection(self, collection_name: str) -> None:
            deleted.append(collection_name)

    result = cleanup_staging_collections(FakeClient())

    assert result["deleted"] == ["icbc_procedures_staging", "shop_docs_v1_staging"]
    assert result["skipped"] == ["icbc_procedures", "shop_docs_v1"]
    assert deleted == ["icbc_procedures_staging", "shop_docs_v1_staging"]


def test_cleanup_staging_endpoint_is_admin_protected() -> None:
    client = TestClient(app)

    response = client.post("/api/admin/cleanup/staging-collections")

    assert response.status_code == 401
