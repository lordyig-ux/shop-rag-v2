from pathlib import Path

from app.services.mitchell_ceg import MitchellCegCrawler


def test_mitchell_ceg_crawler_stays_inside_ceg_content_folder(tmp_path, monkeypatch) -> None:
    pages = {
        "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020000.htm": """
            <html><head><title>CEG: Procedure Explanations</title></head><body>
            <a href="ceg020100.htm">Front Bumper</a>
            <a href="../outside.htm">Outside</a>
            <a href="https://www.mitchell.com/support/">Support</a>
            <a href="image.png">Image</a>
            </body></html>
        """,
        "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020100.htm": """
            <html><head><title>CEG: 01 Front Bumper</title></head><body>
            <a href="ceg020101.htm">Bumper Assembly R&amp;I</a>
            </body></html>
        """,
        "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020101.htm": """
            <html><head><title>CEG: 01 Front Bumper (Bumper Assembly R&amp;I)</title></head><body>
            Included Operations
            </body></html>
        """,
    }

    class FakeResponse:
        def __init__(self, text: str) -> None:
            self.text = text

        def raise_for_status(self) -> None:
            return None

    def fake_get(url: str, timeout: float, follow_redirects: bool) -> FakeResponse:
        assert timeout == 30
        assert follow_redirects is True
        return FakeResponse(pages[url])

    monkeypatch.setattr("app.services.mitchell_ceg.httpx.get", fake_get)

    result = MitchellCegCrawler(output_dir=tmp_path, delay_seconds=0).crawl()

    assert result.pages_saved == 3
    assert result.start_url.endswith("ceg020000.htm")
    assert (tmp_path / "ceg020000.htm").exists()
    assert (tmp_path / "ceg020100.htm").exists()
    assert (tmp_path / "ceg020101.htm").exists()
    assert not (tmp_path / "outside.htm").exists()
    metadata = (tmp_path / "ceg020101.htm.metadata.json").read_text(encoding="utf-8")
    assert "Bumper Assembly" in metadata
    assert "ceg020101.htm" in metadata


def test_mitchell_ceg_crawler_refuses_unapproved_start_url(tmp_path) -> None:
    crawler = MitchellCegCrawler(
        output_dir=tmp_path,
        start_url="https://example.com/not-mitchell.htm",
        delay_seconds=0,
    )

    try:
        crawler.crawl()
    except ValueError as exc:
        assert "Mitchell CEG content folder" in str(exc)
    else:
        raise AssertionError("Expected invalid Mitchell start URL to be rejected")
