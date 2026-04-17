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
        store.create_collection("test_col")  # idempotent

    def test_add_and_search(self, store, sample_chunks, sample_embeddings):
        collection = "test_search"
        store.create_collection(collection)
        store.add_chunks(collection, sample_chunks, sample_embeddings, document_id="doc1")

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

        extra_chunks = [DocumentChunk(text="Extra text", index=0)]
        extra_embeddings = [[0.2, 0.3, 0.4, 0.5]]
        store.add_chunks(collection, extra_chunks, extra_embeddings, document_id="doc2")

        store.delete_by_document(collection, "doc1")

        results = store.search(collection, [0.2, 0.3, 0.4, 0.5], top_k=10)
        assert len(results) == 1
        assert results[0].text == "Extra text"

    def test_delete_collection(self, store, sample_chunks, sample_embeddings):
        collection = "test_delete_col"
        store.create_collection(collection)
        store.add_chunks(collection, sample_chunks, sample_embeddings, document_id="doc1")

        store.delete_collection(collection)

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
