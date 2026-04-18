import pytest
from app.services.llm_executor import _extract_query, _build_rag_context
from app.services.vector_store import SearchResult


class TestExtractQuery:
    def test_priority_key_prompt(self):
        inputs = {"prompt": "What is RAG?", "other": "ignored"}
        assert _extract_query(inputs) == "What is RAG?"

    def test_priority_key_query(self):
        inputs = {"query": "How to reset password?", "data": "stuff"}
        assert _extract_query(inputs) == "How to reset password?"

    def test_priority_key_input(self):
        inputs = {"input": "Tell me about dogs"}
        assert _extract_query(inputs) == "Tell me about dogs"

    def test_priority_key_question(self):
        inputs = {"question": "What is AI?"}
        assert _extract_query(inputs) == "What is AI?"

    def test_priority_key_text(self):
        inputs = {"text": "Summarize this"}
        assert _extract_query(inputs) == "Summarize this"

    def test_fallback_first_string(self):
        inputs = {"custom_field": "My question", "number": 42}
        assert _extract_query(inputs) == "My question"

    def test_empty_inputs(self):
        assert _extract_query({}) == ""

    def test_no_string_values(self):
        inputs = {"count": 42, "flag": True}
        assert _extract_query(inputs) == ""

    def test_whitespace_only_skipped(self):
        inputs = {"prompt": "   ", "query": "actual question"}
        assert _extract_query(inputs) == "actual question"

    def test_priority_order(self):
        inputs = {"text": "low priority", "prompt": "high priority"}
        assert _extract_query(inputs) == "high priority"


class TestBuildRagContext:
    def test_single_chunk(self):
        chunks = [
            SearchResult(
                text="Password reset steps here.",
                score=0.9,
                metadata={"filename": "guide.pdf", "chunk_index": 3},
            )
        ]
        result = _build_rag_context(chunks)
        assert "## Reference Context" in result
        assert "Password reset steps here." in result
        assert "[Source: guide.pdf, Chunk 3]" in result

    def test_multiple_chunks(self):
        chunks = [
            SearchResult(text="Chunk one.", score=0.9, metadata={"filename": "a.txt", "chunk_index": 0}),
            SearchResult(text="Chunk two.", score=0.8, metadata={"filename": "b.md", "chunk_index": 1}),
        ]
        result = _build_rag_context(chunks)
        assert "Chunk one." in result
        assert "Chunk two." in result
        assert "[Source: a.txt, Chunk 0]" in result
        assert "[Source: b.md, Chunk 1]" in result

    def test_missing_metadata_defaults(self):
        chunks = [
            SearchResult(text="Some text.", score=0.5, metadata={}),
        ]
        result = _build_rag_context(chunks)
        assert "[Source: unknown, Chunk 0]" in result

    def test_empty_chunks(self):
        result = _build_rag_context([])
        assert "## Reference Context" in result
