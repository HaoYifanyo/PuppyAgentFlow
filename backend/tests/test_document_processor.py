import pytest
from app.services.document_processor import DocumentProcessor, DocumentChunk


@pytest.fixture
def processor():
    return DocumentProcessor()


class TestParse:
    def test_parse_txt(self, processor):
        content = "Hello world".encode("utf-8")
        result = processor.parse(content, "txt")
        assert result == "Hello world"

    def test_parse_md(self, processor):
        content = "# Title\n\nSome text".encode("utf-8")
        result = processor.parse(content, "md")
        assert "Title" in result
        assert "Some text" in result

    def test_parse_csv(self, processor):
        content = "name,age\nAlice,30\nBob,25".encode("utf-8")
        result = processor.parse(content, "csv")
        assert "Alice" in result
        assert "Bob" in result

    def test_parse_html(self, processor):
        content = "<html><body><p>Hello</p><script>evil()</script></body></html>".encode("utf-8")
        result = processor.parse(content, "html")
        assert "Hello" in result
        assert "evil" not in result

    def test_parse_pdf(self, processor, tmp_path):
        """Test PDF parsing with a real tiny PDF created by pymupdf."""
        import fitz
        pdf_path = tmp_path / "test.pdf"
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 72), "PDF test content")
        doc.save(str(pdf_path))
        doc.close()

        with open(pdf_path, "rb") as f:
            result = processor.parse(f.read(), "pdf")
        assert "PDF test content" in result

    def test_parse_unsupported_type(self, processor):
        with pytest.raises(ValueError, match="Unsupported file type"):
            processor.parse(b"data", "docx")


class TestChunk:
    def test_short_text_single_chunk(self, processor):
        text = "Short text"
        chunks = processor.chunk(text)
        assert len(chunks) == 1
        assert chunks[0].text == "Short text"
        assert chunks[0].index == 0

    def test_long_text_multiple_chunks(self, processor):
        # Create text longer than CHUNK_SIZE (1000)
        text = "word " * 300  # 1500 chars
        chunks = processor.chunk(text)
        assert len(chunks) > 1
        # Verify ordering
        for i, chunk in enumerate(chunks):
            assert chunk.index == i

    def test_overlap_exists(self, processor):
        text = "A" * 500 + "B" * 500 + "C" * 500  # 1500 chars
        chunks = processor.chunk(text)
        assert len(chunks) >= 2
        # The end of chunk 0 should overlap with the start of chunk 1
        overlap_text = chunks[0].text[-200:]
        assert overlap_text in chunks[1].text

    def test_empty_text_returns_empty(self, processor):
        chunks = processor.chunk("")
        assert chunks == []

    def test_whitespace_only_returns_empty(self, processor):
        chunks = processor.chunk("   \n\n  ")
        assert chunks == []
