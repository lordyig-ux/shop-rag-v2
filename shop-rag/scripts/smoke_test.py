from pathlib import Path
import sys

from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.api.query import get_rag_service  # noqa: E402
from app.qdrant.inspector import inspect_qdrant  # noqa: E402
from app.rag.models import QueryResponse  # noqa: E402


def check(name: str, passed: bool, detail: str = "") -> bool:
    status = "PASS" if passed else "FAIL"
    suffix = f" - {detail}" if detail else ""
    print(f"{status}: {name}{suffix}")
    return passed


def main() -> int:
    settings = get_settings()
    client = TestClient(app)
    ok = True

    health = client.get("/health")
    ok &= check("FastAPI health endpoint", health.status_code == 200, str(health.json() if health.status_code == 200 else health.text))

    staff = client.get("/")
    staff_ok = (
        staff.status_code == 200
        and "Terminal Autobody Knowledge Base" in staff.text
        and 'type="search"' in staff.text
        and 'name="filter"' not in staff.text
    )
    ok &= check("Staff page loads", staff_ok)

    admin = client.get("/admin")
    ok &= check("Admin route protected", admin.status_code == 401)

    report = inspect_qdrant(settings, sample_size=2)
    ok &= check("Qdrant connection", report.connected, "; ".join(report.errors))
    ok &= check("Collections can be listed", bool(report.collections), f"{len(report.collections)} collections")
    ok &= check("Schema inspector produces output", "# Qdrant Inspection Report" in report.to_markdown())

    query = client.post("/api/query", json={"question": "unlikely low confidence smoke query zzz", "top_k": 3})
    query_ok = query.status_code == 200 and {"answer", "citations", "retrieval", "warnings"}.issubset(query.json())
    ok &= check("Query endpoint returns structured JSON", query_ok)

    class FakeLowConfidenceRagService:
        def answer_question(self, request):
            return QueryResponse.insufficient_evidence(
                collection="smoke-test",
                top_k=request.top_k,
                retrieval_mode="vector",
            )

    app.dependency_overrides[get_rag_service] = lambda: FakeLowConfidenceRagService()
    try:
        low_conf_response = client.post("/api/query", json={"question": "qzxjkv blorpt fnerp", "top_k": 3})
        low_conf = (
            low_conf_response.status_code == 200
            and "low_retrieval_confidence" in low_conf_response.json().get("warnings", [])
        )
        ok &= check("Low-confidence query is flagged", low_conf)
    finally:
        app.dependency_overrides.clear()

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
