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


def _make_kb(kb_id="kb1", agent_id="507f1f77bcf86cd799439011"):
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
