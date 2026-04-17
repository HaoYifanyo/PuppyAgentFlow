from dataclasses import dataclass, field


@dataclass
class DocumentChunk:
    text: str
    index: int
    metadata: dict = field(default_factory=dict)


class DocumentProcessor:
    CHUNK_SIZE = 1000
    CHUNK_OVERLAP = 200

    def parse(self, file_bytes: bytes, file_type: str) -> str:
        """Parse file bytes into plain text."""
        parser = {
            "txt": self._parse_text,
            "md": self._parse_text,
            "csv": self._parse_text,
            "html": self._parse_html,
            "pdf": self._parse_pdf,
        }.get(file_type)

        if parser is None:
            raise ValueError(f"Unsupported file type: {file_type}")

        return parser(file_bytes)

    def chunk(self, text: str) -> list[DocumentChunk]:
        """Split text into overlapping chunks with fixed strategy."""
        text = text.strip()
        if not text:
            return []

        chunks = []
        start = 0
        index = 0

        while start < len(text):
            end = start + self.CHUNK_SIZE
            chunk_text = text[start:end]

            if chunk_text.strip():
                chunks.append(DocumentChunk(text=chunk_text, index=index))
                index += 1

            start += self.CHUNK_SIZE - self.CHUNK_OVERLAP

        return chunks

    def _parse_text(self, file_bytes: bytes) -> str:
        return file_bytes.decode("utf-8")

    def _parse_html(self, file_bytes: bytes) -> str:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(file_bytes, "lxml")
        for tag in soup(["script", "style"]):
            tag.decompose()
        return soup.get_text(separator="\n", strip=True)

    def _parse_pdf(self, file_bytes: bytes) -> str:
        import fitz
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text_parts = []
        for page in doc:
            text_parts.append(page.get_text())
        doc.close()
        return "\n".join(text_parts)
