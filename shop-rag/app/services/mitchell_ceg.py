from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx
from pydantic import BaseModel

from app.core.config import Settings
from app.services.job_manager import JobContext
from app.services.shop_docs import run_shop_docs_import
from app.services.source_index import SourceIndex


MITCHELL_CEG_START_URL = "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020000.htm"
MITCHELL_CEG_CONTENT_PREFIX = "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/"
MITCHELL_CEG_FOLDER = "mitchell_ceg"


class MitchellCegCrawlResult(BaseModel):
    start_url: str
    output_dir: str
    pages_seen: int
    pages_saved: int
    skipped_links: int
    errors: list[str]


@dataclass
class MitchellCegCrawler:
    output_dir: Path
    start_url: str = MITCHELL_CEG_START_URL
    max_pages: int = 150
    max_depth: int = 4
    delay_seconds: float = 0.1

    def crawl(self, context: JobContext | None = None) -> MitchellCegCrawlResult:
        self._validate_start_url()
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._clear_previous_pages()

        queue: list[tuple[str, int]] = [(self.start_url, 0)]
        seen: set[str] = set()
        saved = 0
        skipped = 0
        errors: list[str] = []

        while queue and len(seen) < self.max_pages:
            url, depth = queue.pop(0)
            if url in seen or depth > self.max_depth:
                continue
            seen.add(url)
            if context:
                context.log(f"Crawling Mitchell CEG page {len(seen)}: {url}")
            try:
                response = httpx.get(url, timeout=30, follow_redirects=True)
                response.raise_for_status()
            except Exception as exc:
                errors.append(f"{url}: {type(exc).__name__}: {exc}")
                continue

            title = _title_from_html(response.text) or Path(urlparse(url).path).stem
            self._save_page(url, title, response.text)
            saved += 1

            for link in _extract_links(url, response.text):
                if _is_allowed_ceg_url(link):
                    if link not in seen:
                        queue.append((link, depth + 1))
                else:
                    skipped += 1
            if self.delay_seconds:
                time.sleep(self.delay_seconds)

        return MitchellCegCrawlResult(
            start_url=self.start_url,
            output_dir=str(self.output_dir),
            pages_seen=len(seen),
            pages_saved=saved,
            skipped_links=skipped,
            errors=errors,
        )

    def _validate_start_url(self) -> None:
        if not _is_allowed_ceg_url(self.start_url):
            raise ValueError("Start URL must be a ceg*.htm page in the Mitchell CEG content folder")

    def _clear_previous_pages(self) -> None:
        for path in self.output_dir.glob("ceg*.htm"):
            path.unlink()
        for path in self.output_dir.glob("ceg*.htm.metadata.json"):
            path.unlink()

    def _save_page(self, url: str, title: str, html: str) -> None:
        filename = Path(urlparse(url).path).name
        page_path = self.output_dir / filename
        metadata_path = self.output_dir / f"{filename}.metadata.json"
        page_path.write_text(html, encoding="utf-8")
        metadata_path.write_text(
            json.dumps(
                {
                    "title": title,
                    "source_url": url,
                    "category": "Mitchell CEG",
                    "knowledge_type": "shop_docs",
                    "file_type": "html",
                    "scraped_at": datetime.now(UTC).isoformat(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )


def run_mitchell_ceg_refresh(settings: Settings, source_index: SourceIndex, context: JobContext) -> dict[str, object]:
    output_dir = settings.shop_docs_inbox_path / MITCHELL_CEG_FOLDER
    context.set_step("crawling Mitchell CEG pages")
    crawl_result = MitchellCegCrawler(output_dir=output_dir).crawl(context)
    if crawl_result.pages_saved == 0:
        raise RuntimeError("No Mitchell CEG pages were saved")

    context.set_step("importing shop docs with Mitchell CEG")
    import_result = run_shop_docs_import(settings, source_index, context)
    return {
        "crawl": crawl_result.model_dump(mode="json"),
        "import": import_result,
    }


def _extract_links(base_url: str, html: str) -> list[str]:
    links: list[str] = []
    for match in re.finditer(r"""(?is)<a\b[^>]*\bhref=["']([^"']+)["']""", html):
        href = match.group(1).strip()
        if not href or href.startswith("#"):
            continue
        links.append(urljoin(base_url, href).split("#")[0])
    return links


def _is_allowed_ceg_url(url: str) -> bool:
    parsed = urlparse(url)
    if not url.startswith(MITCHELL_CEG_CONTENT_PREFIX):
        return False
    return re.search(r"/ceg\d+\.htm$", parsed.path) is not None


def _title_from_html(html: str) -> str:
    match = re.search(r"(?is)<title[^>]*>(.*?)</title>", html)
    if not match:
        return ""
    return re.sub(r"\s+", " ", match.group(1)).strip()
