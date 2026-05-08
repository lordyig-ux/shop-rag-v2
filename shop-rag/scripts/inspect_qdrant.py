from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core.config import get_settings  # noqa: E402
from app.core.logging import configure_logging  # noqa: E402
from app.qdrant.inspector import write_inspection_report  # noqa: E402


def main() -> int:
    settings = get_settings()
    configure_logging(settings)
    report = write_inspection_report(settings)
    print(f"Wrote {settings.inspection_report_path}")
    print(f"Connected: {report.connected}")
    print(f"Collections: {len(report.collections)}")
    if report.errors:
        print("Errors:")
        for error in report.errors:
            print(f"  - {error}")
    return 0 if report.connected else 1


if __name__ == "__main__":
    raise SystemExit(main())
