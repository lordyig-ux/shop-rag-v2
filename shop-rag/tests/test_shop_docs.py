from app.services.shop_docs import ExtractedDocument, ExtractedPage, ShopDocsService, _chunk_documents


def test_shop_docs_scan_detects_supported_files_and_urls(tmp_path) -> None:
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    (inbox / "aluminum.md").write_text("# Aluminum SOP\nUse dedicated tools.", encoding="utf-8")
    (inbox / "notes.txt").write_text("Parts notes", encoding="utf-8")
    (inbox / "urls.txt").write_text("https://example.test/vendor-page\n", encoding="utf-8")
    (inbox / "ignore.exe").write_text("nope", encoding="utf-8")

    service = ShopDocsService(inbox_path=inbox)
    scan = service.scan()

    refs = {item.source_ref for item in scan.items}
    assert "aluminum.md" in refs
    assert "notes.txt" in refs
    assert "https://example.test/vendor-page" in refs
    assert "ignore.exe" not in refs
    assert scan.supported_count == 3


def test_shop_docs_scan_recurses_and_uses_html_source_metadata(tmp_path) -> None:
    inbox = tmp_path / "inbox"
    mitchell = inbox / "mitchell_ceg"
    mitchell.mkdir(parents=True)
    html_path = mitchell / "ceg020101.htm"
    html_path.write_text(
        "<html><head><title>CEG: 01 Front Bumper</title></head><body>Included Operations</body></html>",
        encoding="utf-8",
    )
    (mitchell / "ceg020101.htm.metadata.json").write_text(
        '{"source_url":"https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020101.htm","title":"CEG: 01 Front Bumper","category":"Mitchell CEG"}',
        encoding="utf-8",
    )

    service = ShopDocsService(inbox_path=inbox)
    scan = service.scan()
    document = service.extract_local_file(html_path)

    assert scan.supported_count == 1
    assert scan.items[0].source_ref == "mitchell_ceg/ceg020101.htm"
    assert document.title == "CEG: 01 Front Bumper"
    assert document.source_url == "https://staticca.mymitchell.com/static/webhelp/ppages/ceg/1033/content/ceg020101.htm"
    assert document.metadata["category"] == "Mitchell CEG"


def test_shop_docs_extracts_markdown_and_plain_text(tmp_path) -> None:
    inbox = tmp_path / "inbox"
    inbox.mkdir()
    md_path = inbox / "aluminum.md"
    txt_path = inbox / "notes.txt"
    md_path.write_text("# Aluminum SOP\nUse dedicated tools.", encoding="utf-8")
    txt_path.write_text("Parts notes", encoding="utf-8")

    service = ShopDocsService(inbox_path=inbox)

    md_doc = service.extract_local_file(md_path)
    txt_doc = service.extract_local_file(txt_path)

    assert md_doc.title == "aluminum"
    assert "Use dedicated tools" in md_doc.text
    assert txt_doc.title == "notes"
    assert "Parts notes" in txt_doc.text


def test_shop_docs_extract_url_handles_pdf_response(monkeypatch, tmp_path) -> None:
    class FakeResponse:
        headers = {"content-type": "application/pdf"}
        content = b"%PDF fake"
        text = ""

        def raise_for_status(self) -> None:
            return None

    captured = {}

    def fake_get(url, timeout, follow_redirects):
        captured["url"] = url
        captured["timeout"] = timeout
        captured["follow_redirects"] = follow_redirects
        return FakeResponse()

    monkeypatch.setattr("app.services.shop_docs.httpx.get", fake_get)
    monkeypatch.setattr("app.services.shop_docs._extract_pdf_pages", lambda path: [ExtractedPage(page_number=7, text="PDF policy text")])
    service = ShopDocsService(inbox_path=tmp_path)

    document = service.extract_url("https://example.test/program-guide.pdf")

    assert document.file_type == "pdf"
    assert document.title == "program-guide"
    assert document.source_url == "https://example.test/program-guide.pdf"
    assert document.text == "PDF policy text"
    assert document.pages[0].page_number == 7
    assert captured["follow_redirects"] is True


def test_pdf_chunks_include_page_links() -> None:
    extracted = ExtractedDocument(
        title="collision-program-guide",
        source_ref="https://example.test/collision-program-guide.pdf",
        source_url="https://example.test/collision-program-guide.pdf",
        file_type="pdf",
        text="Page one text\n\nPage two estimating text",
        content_hash="abc123",
        pages=[
            ExtractedPage(page_number=1, text="Page one text"),
            ExtractedPage(page_number=2, text="Page two estimating text"),
        ],
        metadata={"url": "https://example.test/collision-program-guide.pdf"},
    )

    chunks = _chunk_documents([extracted])

    assert len(chunks) == 2
    assert chunks[0].metadata["page_number"] == 1
    assert chunks[0].metadata["page_range"] == "1"
    assert chunks[0].metadata["source_url_with_page"] == "https://example.test/collision-program-guide.pdf#page=1"
    assert chunks[1].metadata["page_number"] == 2
    assert chunks[1].metadata["source_url_with_page"] == "https://example.test/collision-program-guide.pdf#page=2"
