# Knowledge Base Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add knowledge base infrastructure — document upload, embedding, vector storage, and retrieval search — as a foundation for future RAG workflow nodes.

**Architecture:** Layered services (document_processor, embedding_service, vector_store, rag_service) behind a FastAPI router. ChromaDB embedded for vector storage, MongoDB/Beanie for metadata. Frontend modal for KB management.

**Tech Stack:** FastAPI, Beanie, ChromaDB, pymupdf, LangChain Embeddings, React, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-04-17-knowledge-base-phase1-design.md`

---

## File Structure

### Backend — New Files

| File | Responsibility |
|------|---------------|
| `backend/app/models/knowledge_base.py` | KnowledgeBase + KBDocument Beanie documents |
| `backend/app/services/document_processor.py` | Parse files to text + chunk |
| `backend/app/services/embedding_service.py` | Unified embedding interface (OpenAI, Gemini, custom) |
| `backend/app/services/vector_store.py` | VectorStoreBase ABC + ChromaVectorStore |
| `backend/app/services/rag_service.py` | Orchestration: upload, delete, search |
| `backend/app/api/knowledge_bases.py` | REST API router |
| `backend/tests/test_document_processor.py` | Unit tests for parse + chunk |
| `backend/tests/test_vector_store.py` | Unit tests for ChromaVectorStore |
| `backend/tests/test_embedding_service.py` | Unit tests for embedding service (mocked) |
| `backend/tests/test_rag_service.py` | Unit tests for RAG service (mocked) |

### Backend — Modified Files

| File | Change |
|------|--------|
| `backend/requirements.txt` | Add chromadb, pymupdf, python-multipart |
| `backend/app/database.py` | Register KnowledgeBase, KBDocument with Beanie |
| `backend/app/api/router.py` | Include knowledge_bases router |

### Frontend — New Files

| File | Responsibility |
|------|---------------|
| `frontend/src/types/knowledgeBase.ts` | KB + Document + SearchResult types |
| `frontend/src/hooks/useKnowledgeBases.ts` | KB CRUD + document upload + search hooks |
| `frontend/src/components/KnowledgeBaseModal.tsx` | KB management modal |

### Frontend — Modified Files

| File | Change |
|------|--------|
| `frontend/src/App.tsx` | Add KB modal state + render |
| `frontend/src/components/Navbar.tsx` | Add KB button to navbar |

---

## Task 1: Add Dependencies

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Add new dependencies to requirements.txt**

Append these lines to `backend/requirements.txt`:

```
chromadb>=1.0.0
pymupdf>=1.25.0
python-multipart>=0.0.20
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
cd backend && pip install -r requirements.txt
```

Expected: All packages install successfully. Verify with:
```bash
python -c "import chromadb; import fitz; print('OK')"
```

---

## Task 2: Data Models

**Files:**
- Create: `backend/app/models/knowledge_base.py`
- Modify: `backend/app/database.py`

- [ ] **Step 1: Create knowledge_base.py models**

Create `backend/app/models/knowledge_base.py`:

```python
from typing import Optional
from datetime import datetime, timezone
from pydantic import Field
from beanie import Document, before_event, Replace, Insert


def _utc_now():
    return datetime.now(timezone.utc)


class KnowledgeBase(Document):
    name: str
    description: str = ""
    embedding_agent_id: str
    document_count: int = 0
    status: str = Field(default="active", description="active | error")
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "knowledge_bases"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = _utc_now()


class KBDocument(Document):
    knowledge_base_id: str
    filename: str
    file_type: str = Field(..., description="pdf | txt | md | csv | html")
    file_size: int = Field(..., description="File size in bytes")
    chunk_count: int = 0
    status: str = Field(default="pending", description="pending | processing | ready | error")
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "kb_documents"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = _utc_now()
```

- [ ] **Step 2: Register models in database.py**

In `backend/app/database.py`, add the import and registration:

Change the import line:
```python
from app.models.workflow import Workflow, Skill, WorkflowRun, Agent
```
to:
```python
from app.models.workflow import Workflow, Skill, WorkflowRun, Agent
from app.models.knowledge_base import KnowledgeBase, KBDocument
```

Change the `init_beanie` call:
```python
await init_beanie(database=db, document_models=[Workflow, Skill, WorkflowRun, Agent])
```
to:
```python
await init_beanie(database=db, document_models=[Workflow, Skill, WorkflowRun, Agent, KnowledgeBase, KBDocument])
```

- [ ] **Step 3: Verify models load**

Run:
```bash
cd backend && python -c "from app.models.knowledge_base import KnowledgeBase, KBDocument; print('Models OK')"
```

---

## Task 3: Document Processor

**Files:**
- Create: `backend/app/services/document_processor.py`
- Create: `backend/tests/test_document_processor.py`

- [ ] **Step 1: Write tests for document_processor**

Create `backend/tests/test_document_processor.py`:

```python
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && python -m pytest tests/test_document_processor.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.document_processor'`

- [ ] **Step 3: Implement document_processor.py**

Create `backend/app/services/document_processor.py`:

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd backend && python -m pytest tests/test_document_processor.py -v
```
Expected: All tests PASS.

---

## Task 4: Vector Store

**Files:**
- Create: `backend/app/services/vector_store.py`
- Create: `backend/tests/test_vector_store.py`

- [ ] **Step 1: Write tests for vector_store**

Create `backend/tests/test_vector_store.py`:

```python
import pytest
from app.services.vector_store import ChromaVectorStore, SearchResult
from app.services.document_processor import DocumentChunk


@pytest.fixture
def store(tmp_path):
    """Create a ChromaVectorStore with a temp directory."""
    return ChromaVectorStore(persist_dir=str(tmp_path / "chroma_test"))


@pytest.fixture
def sample_chunks():
    return [
        DocumentChunk(text="The cat sat on the mat", index=0),
        DocumentChunk(text="The dog ran in the park", index=1),
        DocumentChunk(text="Birds fly in the sky", index=2),
    ]


@pytest.fixture
def sample_embeddings():
    """3 fake embeddings of dimension 4."""
    return [
        [0.1, 0.2, 0.3, 0.4],
        [0.5, 0.6, 0.7, 0.8],
        [0.9, 0.1, 0.2, 0.3],
    ]


class TestChromaVectorStore:
    def test_create_collection(self, store):
        store.create_collection("test_col")
        # Should not raise; calling again should also not raise
        store.create_collection("test_col")

    def test_add_and_search(self, store, sample_chunks, sample_embeddings):
        collection = "test_search"
        store.create_collection(collection)
        store.add_chunks(collection, sample_chunks, sample_embeddings, document_id="doc1")

        # Search with a query embedding close to the first chunk's embedding
        results = store.search(collection, [0.1, 0.2, 0.3, 0.4], top_k=2)
        assert len(results) == 2
        assert isinstance(results[0], SearchResult)
        assert results[0].text == "The cat sat on the mat"
        assert results[0].score >= 0

    def test_search_empty_collection(self, store):
        collection = "test_empty"
        store.create_collection(collection)
        results = store.search(collection, [0.1, 0.2, 0.3, 0.4], top_k=5)
        assert results == []

    def test_delete_by_document(self, store, sample_chunks, sample_embeddings):
        collection = "test_delete_doc"
        store.create_collection(collection)
        store.add_chunks(collection, sample_chunks, sample_embeddings, document_id="doc1")

        # Add another document
        extra_chunks = [DocumentChunk(text="Extra text", index=0)]
        extra_embeddings = [[0.2, 0.3, 0.4, 0.5]]
        store.add_chunks(collection, extra_chunks, extra_embeddings, document_id="doc2")

        # Delete doc1
        store.delete_by_document(collection, "doc1")

        # Only doc2 chunks should remain
        results = store.search(collection, [0.2, 0.3, 0.4, 0.5], top_k=10)
        assert len(results) == 1
        assert results[0].text == "Extra text"

    def test_delete_collection(self, store, sample_chunks, sample_embeddings):
        collection = "test_delete_col"
        store.create_collection(collection)
        store.add_chunks(collection, sample_chunks, sample_embeddings, document_id="doc1")

        store.delete_collection(collection)

        # Recreate and verify it's empty
        store.create_collection(collection)
        results = store.search(collection, [0.1, 0.2, 0.3, 0.4], top_k=10)
        assert results == []

    def test_search_result_has_metadata(self, store, sample_chunks, sample_embeddings):
        collection = "test_metadata"
        store.create_collection(collection)
        store.add_chunks(collection, sample_chunks, sample_embeddings, document_id="doc1", filename="test.pdf")

        results = store.search(collection, [0.1, 0.2, 0.3, 0.4], top_k=1)
        assert results[0].metadata["document_id"] == "doc1"
        assert results[0].metadata["filename"] == "test.pdf"
        assert results[0].metadata["chunk_index"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && python -m pytest tests/test_vector_store.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement vector_store.py**

Create `backend/app/services/vector_store.py`:

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from app.services.document_processor import DocumentChunk


@dataclass
class SearchResult:
    text: str
    score: float
    metadata: dict = field(default_factory=dict)


class VectorStoreBase(ABC):
    @abstractmethod
    def create_collection(self, name: str) -> None: ...

    @abstractmethod
    def add_chunks(
        self,
        collection: str,
        chunks: list[DocumentChunk],
        embeddings: list[list[float]],
        document_id: str,
        filename: str = "",
    ) -> None: ...

    @abstractmethod
    def search(
        self, collection: str, query_embedding: list[float], top_k: int = 5
    ) -> list[SearchResult]: ...

    @abstractmethod
    def delete_by_document(self, collection: str, document_id: str) -> None: ...

    @abstractmethod
    def delete_collection(self, collection: str) -> None: ...


class ChromaVectorStore(VectorStoreBase):
    def __init__(self, persist_dir: str = "./chroma_data"):
        import chromadb
        self._client = chromadb.PersistentClient(path=persist_dir)

    def create_collection(self, name: str) -> None:
        self._client.get_or_create_collection(name=name)

    def add_chunks(
        self,
        collection: str,
        chunks: list[DocumentChunk],
        embeddings: list[list[float]],
        document_id: str,
        filename: str = "",
    ) -> None:
        col = self._client.get_or_create_collection(name=collection)
        ids = [f"{document_id}_{chunk.index}" for chunk in chunks]
        documents = [chunk.text for chunk in chunks]
        metadatas = [
            {
                "document_id": document_id,
                "filename": filename,
                "chunk_index": chunk.index,
            }
            for chunk in chunks
        ]
        col.add(ids=ids, embeddings=embeddings, documents=documents, metadatas=metadatas)

    def search(
        self, collection: str, query_embedding: list[float], top_k: int = 5
    ) -> list[SearchResult]:
        col = self._client.get_or_create_collection(name=collection)
        if col.count() == 0:
            return []

        results = col.query(query_embeddings=[query_embedding], n_results=min(top_k, col.count()))

        search_results = []
        for i in range(len(results["ids"][0])):
            search_results.append(
                SearchResult(
                    text=results["documents"][0][i],
                    score=1 - results["distances"][0][i],  # ChromaDB returns distance; convert to similarity
                    metadata=results["metadatas"][0][i],
                )
            )
        return search_results

    def delete_by_document(self, collection: str, document_id: str) -> None:
        col = self._client.get_or_create_collection(name=collection)
        col.delete(where={"document_id": document_id})

    def delete_collection(self, collection: str) -> None:
        try:
            self._client.delete_collection(name=collection)
        except ValueError:
            pass  # Collection doesn't exist, nothing to delete
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd backend && python -m pytest tests/test_vector_store.py -v
```
Expected: All tests PASS.

---

## Task 5: Embedding Service

**Files:**
- Create: `backend/app/services/embedding_service.py`
- Create: `backend/tests/test_embedding_service.py`

- [ ] **Step 1: Write tests for embedding_service**

Create `backend/tests/test_embedding_service.py`:

```python
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from app.services.embedding_service import EmbeddingService


@pytest.fixture
def service():
    return EmbeddingService()


def _make_mock_agent(provider="openai", model_id="text-embedding-3-small", api_key_encrypted="encrypted_key", base_url=None):
    agent = MagicMock()
    agent.provider = provider
    agent.model_id = model_id
    agent.api_key_encrypted = api_key_encrypted
    agent.base_url = base_url
    return agent


class TestEmbeddingService:
    @pytest.mark.asyncio
    @patch("app.services.embedding_service.decrypt_text", return_value="sk-test-key")
    @patch("app.services.embedding_service._build_embeddings_model")
    async def test_embed_texts(self, mock_build, mock_decrypt, service):
        mock_model = MagicMock()
        mock_model.aembed_documents = AsyncMock(return_value=[[0.1, 0.2], [0.3, 0.4]])
        mock_build.return_value = mock_model

        agent = _make_mock_agent()
        result = await service.embed_texts(["hello", "world"], agent)

        assert result == [[0.1, 0.2], [0.3, 0.4]]
        mock_build.assert_called_once_with("openai", "text-embedding-3-small", "sk-test-key", None)

    @pytest.mark.asyncio
    @patch("app.services.embedding_service.decrypt_text", return_value="sk-test-key")
    @patch("app.services.embedding_service._build_embeddings_model")
    async def test_embed_query(self, mock_build, mock_decrypt, service):
        mock_model = MagicMock()
        mock_model.aembed_query = AsyncMock(return_value=[0.5, 0.6])
        mock_build.return_value = mock_model

        agent = _make_mock_agent()
        result = await service.embed_query("hello", agent)

        assert result == [0.5, 0.6]

    @pytest.mark.asyncio
    @patch("app.services.embedding_service.decrypt_text", return_value=None)
    async def test_missing_api_key_raises(self, mock_decrypt, service):
        agent = _make_mock_agent(api_key_encrypted=None)
        with pytest.raises(ValueError, match="API key"):
            await service.embed_texts(["hello"], agent)

    @pytest.mark.asyncio
    @patch("app.services.embedding_service.decrypt_text", return_value="key")
    async def test_unsupported_provider_raises(self, mock_decrypt, service):
        agent = _make_mock_agent(provider="anthropic")
        with pytest.raises(ValueError, match="not supported"):
            await service.embed_texts(["hello"], agent)
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && python -m pytest tests/test_embedding_service.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement embedding_service.py**

Create `backend/app/services/embedding_service.py`:

```python
from typing import Optional
from app.services.crypto_utils import decrypt_text


def _build_embeddings_model(provider: str, model: str, api_key: str, base_url: Optional[str]):
    """Build a LangChain Embeddings instance based on provider."""
    if provider == "openai":
        from langchain_openai import OpenAIEmbeddings
        kwargs = {"model": model, "api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        return OpenAIEmbeddings(**kwargs)

    elif provider == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings
        return GoogleGenerativeAIEmbeddings(model=model, google_api_key=api_key)

    elif provider in ("openrouter", "custom"):
        from langchain_openai import OpenAIEmbeddings
        kwargs = {"model": model, "api_key": api_key}
        if base_url:
            kwargs["base_url"] = base_url
        return OpenAIEmbeddings(**kwargs)

    else:
        raise ValueError(
            f"Embedding provider '{provider}' is not supported. "
            "Use openai, gemini, openrouter, or custom."
        )


class EmbeddingService:
    async def embed_texts(self, texts: list[str], agent) -> list[list[float]]:
        """Batch embed texts using the agent's provider + model + key."""
        api_key = decrypt_text(agent.api_key_encrypted)
        if not api_key:
            raise ValueError("Agent API key is missing. Please configure it in the agent settings.")

        model = _build_embeddings_model(agent.provider, agent.model_id, api_key, agent.base_url)
        return await model.aembed_documents(texts)

    async def embed_query(self, query: str, agent) -> list[float]:
        """Embed a single query string."""
        api_key = decrypt_text(agent.api_key_encrypted)
        if not api_key:
            raise ValueError("Agent API key is missing. Please configure it in the agent settings.")

        model = _build_embeddings_model(agent.provider, agent.model_id, api_key, agent.base_url)
        return await model.aembed_query(query)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd backend && python -m pytest tests/test_embedding_service.py -v
```
Expected: All tests PASS.

---

## Task 6: RAG Service

**Files:**
- Create: `backend/app/services/rag_service.py`
- Create: `backend/tests/test_rag_service.py`

- [ ] **Step 1: Write tests for rag_service**

Create `backend/tests/test_rag_service.py`:

```python
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from app.services.rag_service import RAGService
from app.services.document_processor import DocumentChunk
from app.services.vector_store import SearchResult


@pytest.fixture
def mock_processor():
    p = MagicMock()
    p.parse.return_value = "parsed text content"
    p.chunk.return_value = [
        DocumentChunk(text="chunk 0", index=0),
        DocumentChunk(text="chunk 1", index=1),
    ]
    return p


@pytest.fixture
def mock_embedding():
    e = MagicMock()
    e.embed_texts = AsyncMock(return_value=[[0.1, 0.2], [0.3, 0.4]])
    e.embed_query = AsyncMock(return_value=[0.1, 0.2])
    return e


@pytest.fixture
def mock_vector_store():
    v = MagicMock()
    v.create_collection = MagicMock()
    v.add_chunks = MagicMock()
    v.delete_by_document = MagicMock()
    v.delete_collection = MagicMock()
    v.search = MagicMock(return_value=[
        SearchResult(text="chunk 0", score=0.9, metadata={"document_id": "doc1", "filename": "test.txt", "chunk_index": 0}),
    ])
    return v


@pytest.fixture
def mock_agent():
    agent = MagicMock()
    agent.provider = "openai"
    agent.model_id = "text-embedding-3-small"
    agent.api_key_encrypted = "encrypted"
    agent.base_url = None
    return agent


@pytest.fixture
def service(mock_processor, mock_embedding, mock_vector_store):
    return RAGService(mock_processor, mock_embedding, mock_vector_store)


def _make_kb(kb_id="kb1", agent_id="agent1"):
    kb = MagicMock()
    kb.id = kb_id
    kb.embedding_agent_id = agent_id
    kb.document_count = 0
    kb.save = AsyncMock()
    return kb


def _make_upload_file(filename="test.txt", content=b"hello world"):
    f = MagicMock()
    f.filename = filename
    f.read = AsyncMock(return_value=content)
    f.size = len(content)
    return f


class TestRAGService:
    @pytest.mark.asyncio
    @patch("app.services.rag_service.Agent")
    @patch("app.services.rag_service.KBDocument")
    async def test_upload_document(self, MockKBDoc, MockAgent, service, mock_agent, mock_processor, mock_embedding, mock_vector_store):
        # Setup mocks
        MockAgent.get = AsyncMock(return_value=mock_agent)
        doc_instance = MagicMock()
        doc_instance.id = "doc1"
        doc_instance.save = AsyncMock()
        MockKBDoc.return_value = doc_instance
        MockKBDoc.return_value.insert = AsyncMock(return_value=doc_instance)

        kb = _make_kb()
        upload_file = _make_upload_file()

        result = await service.upload_document(kb, upload_file)

        mock_processor.parse.assert_called_once_with(b"hello world", "txt")
        mock_processor.chunk.assert_called_once_with("parsed text content")
        mock_embedding.embed_texts.assert_called_once()
        mock_vector_store.add_chunks.assert_called_once()
        assert kb.save.called

    @pytest.mark.asyncio
    @patch("app.services.rag_service.Agent")
    async def test_search(self, MockAgent, service, mock_agent, mock_embedding, mock_vector_store):
        MockAgent.get = AsyncMock(return_value=mock_agent)

        kb = _make_kb()
        results = await service.search(kb, "test query", top_k=5)

        mock_embedding.embed_query.assert_called_once()
        mock_vector_store.search.assert_called_once()
        assert len(results) == 1
        assert results[0].text == "chunk 0"

    @pytest.mark.asyncio
    async def test_delete_document(self, service, mock_vector_store):
        kb = _make_kb()
        doc = MagicMock()
        doc.id = "doc1"
        doc.delete = AsyncMock()

        await service.delete_document(kb, doc)

        mock_vector_store.delete_by_document.assert_called_once_with("kb_kb1", "doc1")
        doc.delete.assert_called_once()
        assert kb.save.called

    @pytest.mark.asyncio
    @patch("app.services.rag_service.KBDocument")
    async def test_delete_knowledge_base(self, MockKBDoc, service, mock_vector_store):
        kb = _make_kb()
        kb.delete = AsyncMock()

        mock_doc = MagicMock()
        mock_doc.delete = AsyncMock()
        mock_find = MagicMock()
        mock_find.to_list = AsyncMock(return_value=[mock_doc])
        MockKBDoc.find = MagicMock(return_value=mock_find)

        await service.delete_knowledge_base(kb)

        mock_vector_store.delete_collection.assert_called_once_with("kb_kb1")
        mock_doc.delete.assert_called_once()
        kb.delete.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && python -m pytest tests/test_rag_service.py -v
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement rag_service.py**

Create `backend/app/services/rag_service.py`:

```python
import os
from beanie import PydanticObjectId

from app.models.workflow import Agent
from app.models.knowledge_base import KBDocument
from app.services.document_processor import DocumentProcessor
from app.services.embedding_service import EmbeddingService
from app.services.vector_store import VectorStoreBase, SearchResult


ALLOWED_FILE_TYPES = {"pdf", "txt", "md", "csv", "html"}


def _get_file_type(filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_FILE_TYPES:
        raise ValueError(f"Unsupported file type: .{ext}. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")
    return ext


def _collection_name(kb_id) -> str:
    return f"kb_{kb_id}"


class RAGService:
    def __init__(
        self,
        doc_processor: DocumentProcessor,
        embedding_service: EmbeddingService,
        vector_store: VectorStoreBase,
    ):
        self.doc_processor = doc_processor
        self.embedding_service = embedding_service
        self.vector_store = vector_store

    async def _get_agent(self, agent_id: str) -> Agent:
        agent = await Agent.get(PydanticObjectId(agent_id))
        if not agent:
            raise ValueError(f"Embedding agent not found: {agent_id}")
        return agent

    async def upload_document(self, kb, upload_file) -> KBDocument:
        """Full pipeline: parse -> chunk -> embed -> store -> update MongoDB."""
        file_type = _get_file_type(upload_file.filename)
        file_bytes = await upload_file.read()
        file_size = len(file_bytes)

        # Create document record
        doc = KBDocument(
            knowledge_base_id=str(kb.id),
            filename=upload_file.filename,
            file_type=file_type,
            file_size=file_size,
            status="processing",
        )
        await doc.insert()

        try:
            # Parse
            text = self.doc_processor.parse(file_bytes, file_type)

            # Chunk
            chunks = self.doc_processor.chunk(text)
            if not chunks:
                doc.status = "ready"
                doc.chunk_count = 0
                await doc.save()
                return doc

            # Embed
            agent = await self._get_agent(kb.embedding_agent_id)
            chunk_texts = [c.text for c in chunks]
            embeddings = await self.embedding_service.embed_texts(chunk_texts, agent)

            # Store in vector DB
            collection = _collection_name(kb.id)
            self.vector_store.create_collection(collection)
            self.vector_store.add_chunks(
                collection, chunks, embeddings,
                document_id=str(doc.id),
                filename=upload_file.filename,
            )

            # Update records
            doc.status = "ready"
            doc.chunk_count = len(chunks)
            await doc.save()

            kb.document_count += 1
            await kb.save()

            return doc

        except Exception as e:
            doc.status = "error"
            doc.error_message = str(e)
            await doc.save()
            raise

    async def delete_document(self, kb, doc: KBDocument) -> None:
        """Delete document chunks from vector store and MongoDB record."""
        collection = _collection_name(kb.id)
        self.vector_store.delete_by_document(collection, str(doc.id))
        await doc.delete()

        kb.document_count = max(0, kb.document_count - 1)
        await kb.save()

    async def delete_knowledge_base(self, kb) -> None:
        """Delete entire knowledge base: vector collection + all documents + KB record."""
        collection = _collection_name(kb.id)
        self.vector_store.delete_collection(collection)

        docs = await KBDocument.find(KBDocument.knowledge_base_id == str(kb.id)).to_list()
        for doc in docs:
            await doc.delete()

        await kb.delete()

    async def search(self, kb, query: str, top_k: int = 5) -> list[SearchResult]:
        """Embed query and search vector store."""
        agent = await self._get_agent(kb.embedding_agent_id)
        query_embedding = await self.embedding_service.embed_query(query, agent)

        collection = _collection_name(kb.id)
        return self.vector_store.search(collection, query_embedding, top_k)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd backend && python -m pytest tests/test_rag_service.py -v
```
Expected: All tests PASS.

---

## Task 7: API Router

**Files:**
- Create: `backend/app/api/knowledge_bases.py`
- Modify: `backend/app/api/router.py`

- [ ] **Step 1: Create knowledge_bases.py router**

Create `backend/app/api/knowledge_bases.py`:

```python
import os
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from beanie import PydanticObjectId

from app.models.knowledge_base import KnowledgeBase, KBDocument
from app.models.workflow import Agent
from app.services.document_processor import DocumentProcessor
from app.services.embedding_service import EmbeddingService
from app.services.vector_store import ChromaVectorStore
from app.services.rag_service import RAGService


router = APIRouter(prefix="/knowledge-bases", tags=["knowledge-bases"])

# Service instances (singleton)
_doc_processor = DocumentProcessor()
_embedding_service = EmbeddingService()
_vector_store = ChromaVectorStore(
    persist_dir=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "chroma_data")
)
_rag_service = RAGService(_doc_processor, _embedding_service, _vector_store)


# --- Request/Response schemas ---

class KBCreate(BaseModel):
    name: str
    description: str = ""
    embedding_agent_id: str


class KBUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    embedding_agent_id: Optional[str] = None


class SearchRequest(BaseModel):
    query: str
    top_k: int = 5


class SearchResultResponse(BaseModel):
    text: str
    score: float
    filename: str
    chunk_index: int


# --- Knowledge Base CRUD ---

@router.post("", response_model=KnowledgeBase)
async def create_knowledge_base(data: KBCreate):
    # Validate agent exists
    agent = await Agent.get(PydanticObjectId(data.embedding_agent_id))
    if not agent:
        raise HTTPException(status_code=400, detail="Embedding agent not found")

    kb = KnowledgeBase(
        name=data.name,
        description=data.description,
        embedding_agent_id=data.embedding_agent_id,
    )
    await kb.insert()
    return kb


@router.get("", response_model=List[KnowledgeBase])
async def list_knowledge_bases():
    return await KnowledgeBase.find_all().to_list()


@router.get("/{kb_id}", response_model=KnowledgeBase)
async def get_knowledge_base(kb_id: PydanticObjectId):
    kb = await KnowledgeBase.get(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return kb


@router.put("/{kb_id}", response_model=KnowledgeBase)
async def update_knowledge_base(kb_id: PydanticObjectId, data: KBUpdate):
    kb = await KnowledgeBase.get(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    update_dict = data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(kb, field, value)

    await kb.save()
    return kb


@router.delete("/{kb_id}")
async def delete_knowledge_base(kb_id: PydanticObjectId):
    kb = await KnowledgeBase.get(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    await _rag_service.delete_knowledge_base(kb)
    return {"message": "Knowledge base deleted"}


# --- Document Management ---

@router.post("/{kb_id}/documents")
async def upload_documents(kb_id: PydanticObjectId, files: List[UploadFile] = File(...)):
    kb = await KnowledgeBase.get(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    results = []
    for file in files:
        try:
            doc = await _rag_service.upload_document(kb, file)
            results.append({"filename": file.filename, "status": doc.status, "chunk_count": doc.chunk_count})
        except Exception as e:
            results.append({"filename": file.filename, "status": "error", "error": str(e)})

    return results


@router.get("/{kb_id}/documents", response_model=List[KBDocument])
async def list_documents(kb_id: PydanticObjectId):
    return await KBDocument.find(KBDocument.knowledge_base_id == str(kb_id)).to_list()


@router.delete("/{kb_id}/documents/{doc_id}")
async def delete_document(kb_id: PydanticObjectId, doc_id: PydanticObjectId):
    kb = await KnowledgeBase.get(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    doc = await KBDocument.get(doc_id)
    if not doc or doc.knowledge_base_id != str(kb_id):
        raise HTTPException(status_code=404, detail="Document not found")

    await _rag_service.delete_document(kb, doc)
    return {"message": "Document deleted"}


# --- Search ---

@router.post("/{kb_id}/search")
async def search_knowledge_base(kb_id: PydanticObjectId, request: SearchRequest):
    kb = await KnowledgeBase.get(kb_id)
    if not kb:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    results = await _rag_service.search(kb, request.query, request.top_k)
    return {
        "results": [
            SearchResultResponse(
                text=r.text,
                score=r.score,
                filename=r.metadata.get("filename", ""),
                chunk_index=r.metadata.get("chunk_index", 0),
            )
            for r in results
        ]
    }
```

- [ ] **Step 2: Register router in app/api/router.py**

In `backend/app/api/router.py`, add the import and registration:

Change:
```python
from app.api import skills, workflows, runs, agents
```
to:
```python
from app.api import skills, workflows, runs, agents, knowledge_bases
```

Add after the last `router.include_router` line:
```python
router.include_router(knowledge_bases.router)
```

- [ ] **Step 3: Verify server starts**

Run:
```bash
cd backend && python -c "from app.main import app; print('Server app OK')"
```

---

## Task 8: Frontend Types

**Files:**
- Create: `frontend/src/types/knowledgeBase.ts`

- [ ] **Step 1: Create TypeScript type definitions**

Create `frontend/src/types/knowledgeBase.ts`:

```typescript
export interface KnowledgeBase {
  _id?: string;
  id?: string;
  name: string;
  description: string;
  embedding_agent_id: string;
  document_count: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface KBDocument {
  _id?: string;
  id?: string;
  knowledge_base_id: string;
  filename: string;
  file_type: string;
  file_size: number;
  chunk_count: number;
  status: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface KBSearchResult {
  text: string;
  score: number;
  filename: string;
  chunk_index: number;
}

export interface KBCreate {
  name: string;
  description: string;
  embedding_agent_id: string;
}

export interface KBUpdate {
  name?: string;
  description?: string;
  embedding_agent_id?: string;
}
```

---

## Task 9: Frontend Hook

**Files:**
- Create: `frontend/src/hooks/useKnowledgeBases.ts`

- [ ] **Step 1: Create useKnowledgeBases hook**

Create `frontend/src/hooks/useKnowledgeBases.ts`:

```typescript
import { useState, useCallback } from "react";
import axios from "axios";
import type {
  KnowledgeBase,
  KBDocument,
  KBSearchResult,
  KBCreate,
  KBUpdate,
} from "../types/knowledgeBase";
import { extractId } from "../utils/id";

export function useKnowledgeBases() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [searchResults, setSearchResults] = useState<KBSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKnowledgeBases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/knowledge-bases");
      setKnowledgeBases(res.data);
    } catch {
      setError("Failed to load knowledge bases");
    } finally {
      setLoading(false);
    }
  }, []);

  const createKnowledgeBase = useCallback(async (data: KBCreate) => {
    try {
      const res = await axios.post("/api/knowledge-bases", data);
      setKnowledgeBases((prev) => [...prev, res.data]);
      setError(null);
      return res.data as KnowledgeBase;
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to create knowledge base");
      return null;
    }
  }, []);

  const updateKnowledgeBase = useCallback(
    async (kbId: string, data: KBUpdate) => {
      try {
        const res = await axios.put(`/api/knowledge-bases/${kbId}`, data);
        setKnowledgeBases((prev) =>
          prev.map((kb) =>
            extractId(kb._id || kb.id) === kbId ? res.data : kb
          )
        );
        setError(null);
        return res.data as KnowledgeBase;
      } catch (e: any) {
        setError(
          e?.response?.data?.detail || "Failed to update knowledge base"
        );
        return null;
      }
    },
    []
  );

  const deleteKnowledgeBase = useCallback(async (kbId: string) => {
    try {
      await axios.delete(`/api/knowledge-bases/${kbId}`);
      setKnowledgeBases((prev) =>
        prev.filter((kb) => extractId(kb._id || kb.id) !== kbId)
      );
      setDocuments([]);
      setSearchResults([]);
      setError(null);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to delete knowledge base");
    }
  }, []);

  const fetchDocuments = useCallback(async (kbId: string) => {
    try {
      const res = await axios.get(`/api/knowledge-bases/${kbId}/documents`);
      setDocuments(res.data);
    } catch {
      setError("Failed to load documents");
    }
  }, []);

  const uploadDocuments = useCallback(
    async (kbId: string, files: FileList) => {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
      }
      try {
        const res = await axios.post(
          `/api/knowledge-bases/${kbId}/documents`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        );
        setError(null);
        return res.data;
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Failed to upload documents");
        return null;
      }
    },
    []
  );

  const deleteDocument = useCallback(
    async (kbId: string, docId: string) => {
      try {
        await axios.delete(`/api/knowledge-bases/${kbId}/documents/${docId}`);
        setDocuments((prev) =>
          prev.filter((d) => extractId(d._id || d.id) !== docId)
        );
        setError(null);
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Failed to delete document");
      }
    },
    []
  );

  const searchKnowledgeBase = useCallback(
    async (kbId: string, query: string, topK: number = 5) => {
      try {
        const res = await axios.post(`/api/knowledge-bases/${kbId}/search`, {
          query,
          top_k: topK,
        });
        setSearchResults(res.data.results);
        setError(null);
      } catch (e: any) {
        setError(e?.response?.data?.detail || "Search failed");
      }
    },
    []
  );

  return {
    knowledgeBases,
    documents,
    searchResults,
    loading,
    error,
    setError,
    fetchKnowledgeBases,
    createKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    fetchDocuments,
    uploadDocuments,
    deleteDocument,
    searchKnowledgeBase,
    setSearchResults,
  };
}
```

---

## Task 10: Frontend KnowledgeBaseModal

**Files:**
- Create: `frontend/src/components/KnowledgeBaseModal.tsx`

- [ ] **Step 1: Create KnowledgeBaseModal component**

Create `frontend/src/components/KnowledgeBaseModal.tsx`:

```tsx
import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  Trash2,
  Save,
  Search,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
} from "lucide-react";
import type { Agent } from "../types/workflow";
import type { KnowledgeBase, KBDocument, KBSearchResult } from "../types/knowledgeBase";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input, Label, Textarea } from "./ui/Input";
import { extractId } from "../utils/id";
import { useKnowledgeBases } from "../hooks/useKnowledgeBases";

interface KnowledgeBaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  agents: Agent[];
}

const FILE_ACCEPT = ".pdf,.txt,.md,.csv,.html";

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    ready: {
      bg: "bg-green-50 border-green-200",
      text: "text-green-700",
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    processing: {
      bg: "bg-amber-50 border-amber-200",
      text: "text-amber-700",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    error: {
      bg: "bg-red-50 border-red-200",
      text: "text-red-700",
      icon: <AlertCircle className="w-3 h-3" />,
    },
    pending: {
      bg: "bg-stone-50 border-stone-200",
      text: "text-stone-500",
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-md border ${c.bg} ${c.text}`}>
      {c.icon} {status}
    </span>
  );
};

export const KnowledgeBaseModal: React.FC<KnowledgeBaseModalProps> = ({
  isOpen,
  onClose,
  agents,
}) => {
  const {
    knowledgeBases,
    documents,
    searchResults,
    error,
    setError,
    fetchKnowledgeBases,
    createKnowledgeBase,
    updateKnowledgeBase,
    deleteKnowledgeBase,
    fetchDocuments,
    uploadDocuments,
    deleteDocument,
    searchKnowledgeBase,
    setSearchResults,
  } = useKnowledgeBases();

  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDeleteKb, setConfirmDeleteKb] = useState(false);
  const [confirmDeleteDocId, setConfirmDeleteDocId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      fetchKnowledgeBases();
      setSelectedKbId(null);
      setIsNew(false);
      setError(null);
      setSearchResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedKbId) {
      fetchDocuments(selectedKbId);
      setSearchResults([]);
      setSearchQuery("");
    }
  }, [selectedKbId]);

  // Poll documents while any are processing
  useEffect(() => {
    const hasProcessing = documents.some((d) => d.status === "processing" || d.status === "pending");
    if (!hasProcessing || !selectedKbId) return;
    const timer = setInterval(() => {
      fetchDocuments(selectedKbId);
      fetchKnowledgeBases();
    }, 3000);
    return () => clearInterval(timer);
  }, [documents, selectedKbId]);

  const handleSelectKb = (kb: KnowledgeBase) => {
    const id = extractId(kb._id || kb.id);
    setSelectedKbId(id);
    setIsNew(false);
    setFormName(kb.name);
    setFormDescription(kb.description);
    setFormAgentId(kb.embedding_agent_id);
    setError(null);
    setConfirmDeleteKb(false);
    setSaveSuccess(false);
  };

  const handleNew = () => {
    setSelectedKbId(null);
    setIsNew(true);
    setFormName("");
    setFormDescription("");
    setFormAgentId(agents[0] ? extractId(agents[0]._id || agents[0].id) || "" : "");
    setError(null);
    setConfirmDeleteKb(false);
    setSaveSuccess(false);
    setSearchResults([]);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setError("Name is required");
      return;
    }
    if (!formAgentId) {
      setError("Embedding agent is required");
      return;
    }
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      if (isNew) {
        const kb = await createKnowledgeBase({
          name: formName.trim(),
          description: formDescription.trim(),
          embedding_agent_id: formAgentId,
        });
        if (kb) {
          setIsNew(false);
          setSelectedKbId(extractId(kb._id || kb.id));
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 3000);
        }
      } else if (selectedKbId) {
        await updateKnowledgeBase(selectedKbId, {
          name: formName.trim(),
          description: formDescription.trim(),
          embedding_agent_id: formAgentId,
        });
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selectedKbId) return;
    setUploading(true);
    setError(null);
    await uploadDocuments(selectedKbId, files);
    await fetchDocuments(selectedKbId);
    await fetchKnowledgeBases();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDeleteDoc = async (docId: string) => {
    if (!selectedKbId) return;
    await deleteDocument(selectedKbId, docId);
    await fetchKnowledgeBases();
    setConfirmDeleteDocId(null);
  };

  const handleDeleteKb = async () => {
    if (!selectedKbId) return;
    await deleteKnowledgeBase(selectedKbId);
    setSelectedKbId(null);
    setIsNew(false);
    setConfirmDeleteKb(false);
  };

  const handleSearch = async () => {
    if (!selectedKbId || !searchQuery.trim()) return;
    await searchKnowledgeBase(selectedKbId, searchQuery.trim());
  };

  if (!isOpen) return null;

  const hasForm = isNew || selectedKbId !== null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Container width="w-[800px]">
        <Modal.Header
          title={
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center">
                <Database className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg text-stone-800">Knowledge Bases</span>
                <span className="text-[10px] text-stone-500">Manage documents for RAG retrieval</span>
              </div>
            </div>
          }
          icon={null}
          onClose={onClose}
        />

        <div className="flex h-[620px] overflow-hidden rounded-b-2xl">
          {/* Left: KB list */}
          <div className="w-56 border-r border-indigo-100 flex flex-col bg-indigo-50/20">
            <div className="p-3 border-b border-indigo-100">
              <Button className="w-full" onClick={handleNew} icon={<Plus className="w-3.5 h-3.5" />}>
                New Knowledge Base
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {knowledgeBases.length === 0 && (
                <p className="text-[11px] text-stone-400 text-center mt-4 px-2">
                  No knowledge bases yet. Create one to upload documents.
                </p>
              )}
              {knowledgeBases.map((kb) => {
                const id = extractId(kb._id || kb.id);
                const isSelected = selectedKbId === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleSelectKb(kb)}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? "bg-white border-indigo-200 shadow-sm ring-1 ring-indigo-400/20"
                        : "bg-transparent border-transparent hover:bg-white hover:border-indigo-100"
                    }`}
                  >
                    <div className="font-semibold text-xs text-stone-800 truncate">{kb.name}</div>
                    <div className="text-[10px] text-stone-500 mt-0.5">
                      {kb.document_count} doc{kb.document_count !== 1 ? "s" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Detail */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {!hasForm ? (
              <div className="flex-1 flex items-center justify-center text-sm text-stone-400">
                Select a knowledge base or create a new one
              </div>
            ) : (
              <>
                <Modal.Body className="flex-1 overflow-y-auto">
                  {/* KB form fields */}
                  <div className="space-y-1">
                    <Label>Name <span className="text-rose-500">*</span></Label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Product Docs" />
                  </div>
                  <div className="space-y-1">
                    <Label>Description</Label>
                    <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Optional description" />
                  </div>
                  <div className="space-y-1">
                    <Label>Embedding Agent <span className="text-rose-500">*</span></Label>
                    <select
                      value={formAgentId}
                      onChange={(e) => setFormAgentId(e.target.value)}
                      className="w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none bg-stone-50 hover:bg-white transition-colors cursor-pointer"
                    >
                      <option value="">Select an agent...</option>
                      {agents.map((a) => {
                        const aid = extractId(a._id || a.id);
                        return (
                          <option key={aid} value={aid}>
                            {a.name} ({a.provider} / {a.model_id})
                          </option>
                        );
                      })}
                    </select>
                    <p className="text-[10px] text-stone-400">
                      Choose an agent configured with an embedding model (e.g. text-embedding-3-small)
                    </p>
                  </div>

                  {/* Documents section - only for saved KBs */}
                  {selectedKbId && !isNew && (
                    <>
                      <div className="border-t border-stone-100 pt-4 mt-2">
                        <div className="flex items-center justify-between mb-3">
                          <Label>Documents</Label>
                          <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl cursor-pointer transition-colors ${uploading ? "bg-stone-100 text-stone-400" : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"}`}>
                            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                            {uploading ? "Uploading..." : "Upload"}
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              accept={FILE_ACCEPT}
                              onChange={handleUpload}
                              disabled={uploading}
                              className="hidden"
                              aria-label="Upload documents"
                            />
                          </label>
                        </div>

                        {documents.length === 0 ? (
                          <p className="text-[11px] text-stone-400 text-center py-4">
                            No documents yet. Upload PDF, TXT, MD, CSV, or HTML files.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {documents.map((doc) => {
                              const docId = extractId(doc._id || doc.id);
                              return (
                                <div key={docId} className="flex items-center gap-2 p-2 rounded-lg bg-stone-50 border border-stone-100">
                                  <FileText className="w-4 h-4 text-stone-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-stone-700 truncate">{doc.filename}</div>
                                    <div className="text-[10px] text-stone-400">
                                      {doc.chunk_count} chunks &middot; {(doc.file_size / 1024).toFixed(1)}KB
                                    </div>
                                  </div>
                                  <StatusBadge status={doc.status} />
                                  {confirmDeleteDocId === docId ? (
                                    <div className="flex items-center gap-1">
                                      <button onClick={() => setConfirmDeleteDocId(null)} className="text-[10px] text-stone-400 hover:text-stone-600 cursor-pointer">Cancel</button>
                                      <button onClick={() => handleDeleteDoc(docId!)} className="text-[10px] text-red-500 hover:text-red-700 font-medium cursor-pointer">Delete</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setConfirmDeleteDocId(docId!)} className="text-stone-300 hover:text-red-500 transition-colors cursor-pointer" title="Delete document">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Search test */}
                      <div className="border-t border-stone-100 pt-4 mt-2">
                        <Label>Search Test</Label>
                        <div className="flex gap-2 mt-1.5">
                          <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Enter a query to test retrieval..."
                            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
                          />
                          <Button variant="secondary" size="sm" onClick={handleSearch} icon={<Search className="w-3.5 h-3.5" />}>
                            Search
                          </Button>
                        </div>
                        {searchResults.length > 0 && (
                          <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
                            {searchResults.map((r, i) => (
                              <div key={i} className="p-2 rounded-lg bg-indigo-50/50 border border-indigo-100">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-[10px] font-medium text-indigo-600">{r.filename}</span>
                                  <span className="text-[10px] font-mono text-stone-500">score: {r.score.toFixed(3)}</span>
                                </div>
                                <p className="text-xs text-stone-600 line-clamp-3">{r.text}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {error && (
                    <p className="text-xs text-red-500 font-medium bg-red-50 p-2 rounded-xl border border-red-100">
                      {error}
                    </p>
                  )}
                </Modal.Body>

                <Modal.Footer>
                  {selectedKbId && !isNew ? (
                    confirmDeleteKb ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-600 font-medium">Delete this knowledge base?</span>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteKb(false)}>Cancel</Button>
                        <Button variant="danger" size="sm" onClick={handleDeleteKb}>Confirm</Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => setConfirmDeleteKb(true)}
                        icon={<Trash2 className="w-4 h-4" />}
                      >
                        Delete
                      </Button>
                    )
                  ) : (
                    <div />
                  )}
                  <div className="flex items-center gap-3">
                    {saveSuccess && (
                      <span className="text-xs text-green-600 font-medium flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md">
                        Saved
                      </span>
                    )}
                    <Button variant="primary" onClick={handleSave} disabled={saving} icon={<Save className="w-4 h-4" />}>
                      {saving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </Modal.Footer>
              </>
            )}
          </div>
        </div>
      </Modal.Container>
    </Modal>
  );
};
```

---

## Task 11: Frontend Integration

**Files:**
- Modify: `frontend/src/components/Navbar.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add KB button to Navbar**

In `frontend/src/components/Navbar.tsx`:

Add `Database` to the lucide-react import:
```typescript
import { Play, FolderOpen, Save, History, FilePlus, Trash2, MoreHorizontal, Dog, Square, RotateCcw, Database } from 'lucide-react';
```

Add `onOpenKnowledgeBase` to the NavbarProps interface:
```typescript
onOpenKnowledgeBase: () => void;
```

Add it to the component destructuring as well:
```typescript
onOpenKnowledgeBase,
```

Add this KB icon button right after the Agent Library button (after the `<IconButton onClick={onOpenAgentLibrary} ...>` block):
```tsx
<IconButton onClick={onOpenKnowledgeBase} title="Knowledge Bases">
  <Database className="w-4 h-4 text-indigo-500" />
</IconButton>
```

- [ ] **Step 2: Integrate KnowledgeBaseModal into App.tsx**

In `frontend/src/App.tsx`:

Add the import at the top (after AgentLibraryModal import):
```typescript
import { KnowledgeBaseModal } from './components/KnowledgeBaseModal';
```

Add state inside `function App()` (after `agentLibraryOpen` state):
```typescript
const [kbModalOpen, setKbModalOpen] = useState(false);
```

Add the `onOpenKnowledgeBase` prop to the `<Navbar>` component:
```tsx
onOpenKnowledgeBase={() => setKbModalOpen(true)}
```

Add the modal render right after `<AgentLibraryModal>`:
```tsx
<KnowledgeBaseModal
  isOpen={kbModalOpen}
  onClose={() => setKbModalOpen(false)}
  agents={agents}
/>
```

- [ ] **Step 3: Verify frontend compiles**

Run:
```bash
cd frontend && npm run build
```
Expected: Build succeeds with no errors.

---

## Task 12: End-to-End Smoke Test

- [ ] **Step 1: Run all backend tests**

Run:
```bash
cd backend && python -m pytest tests/test_document_processor.py tests/test_vector_store.py tests/test_embedding_service.py tests/test_rag_service.py -v
```
Expected: All tests PASS.

- [ ] **Step 2: Start backend and verify API**

Run:
```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

In another terminal, verify the new endpoints exist:
```bash
curl http://localhost:8000/openapi.json | python -m json.tool | grep knowledge
```
Expected: Should show `/api/knowledge-bases` related endpoints.

- [ ] **Step 3: Start frontend and verify UI**

Run:
```bash
cd frontend && npm run dev
```

Open in browser:
1. Verify the Database icon appears in the Navbar (between Dog icon and History icon)
2. Click it — KnowledgeBaseModal should open
3. Verify "New Knowledge Base" button works
4. Verify Agent dropdown is populated
5. Create a KB, then upload a small .txt file
6. Test search functionality

---

## Summary

| Task | What it builds | Test coverage |
|------|---------------|---------------|
| 1 | Dependencies | pip install verification |
| 2 | Data models + DB registration | Import verification |
| 3 | Document processor | 8 unit tests (parse + chunk) |
| 4 | Vector store | 6 unit tests (CRUD + search) |
| 5 | Embedding service | 4 unit tests (mocked providers) |
| 6 | RAG service | 4 unit tests (mocked pipeline) |
| 7 | API router + wiring | Server start verification |
| 8 | Frontend types | TypeScript compilation |
| 9 | Frontend hook | TypeScript compilation |
| 10 | Frontend modal | TypeScript compilation |
| 11 | Frontend integration | Build + visual verification |
| 12 | E2E smoke test | Manual verification |
