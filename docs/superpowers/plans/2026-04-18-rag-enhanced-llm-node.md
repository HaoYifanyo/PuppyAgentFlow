# RAG-Enhanced LLM Node Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional knowledge base retrieval to LLM nodes — when a knowledge base is selected in node config, relevant chunks are automatically retrieved and injected into the system prompt before calling the LLM.

**Architecture:** Extract RAG service singletons to a shared module (`rag_instances.py`), add RAG injection logic to `execute_llm_node`, add collapsible KB selector to `NodeConfigModal`.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript (frontend), existing RAG services from Phase 1

**Spec:** `docs/superpowers/specs/2026-04-18-rag-enhanced-llm-node-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `backend/app/services/rag_instances.py` | Shared RAG service singletons (used by API router + LLM executor) |
| `backend/tests/test_llm_rag_integration.py` | Tests for RAG context injection in execute_llm_node |

### Modified Files

| File | Change |
|------|--------|
| `backend/app/services/llm_executor.py` | Add `_extract_query`, `_build_rag_context`, RAG injection block |
| `backend/app/api/knowledge_bases.py` | Import singletons from `rag_instances` instead of creating locally |
| `frontend/src/components/NodeConfigModal.tsx` | Add collapsible KB selector + top_k input |

---

## Task 1: Extract RAG Service Singletons

**Files:**
- Create: `backend/app/services/rag_instances.py`
- Modify: `backend/app/api/knowledge_bases.py`

- [ ] **Step 1: Create rag_instances.py**

Create `backend/app/services/rag_instances.py`:

```python
import os

from app.services.document_processor import DocumentProcessor
from app.services.embedding_service import EmbeddingService
from app.services.vector_store import ChromaVectorStore
from app.services.rag_service import RAGService

_persist_dir = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "chroma_data",
)

doc_processor = DocumentProcessor()
embedding_service = EmbeddingService()
vector_store = ChromaVectorStore(persist_dir=_persist_dir)
rag_service = RAGService(doc_processor, embedding_service, vector_store)
```

- [ ] **Step 2: Update knowledge_bases.py to use shared singletons**

In `backend/app/api/knowledge_bases.py`, replace the local service instantiation block (lines 9-23):

Change from:
```python
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
```

To:
```python
from app.services.rag_instances import rag_service as _rag_service


router = APIRouter(prefix="/knowledge-bases", tags=["knowledge-bases"])
```

Also remove `os` from the imports at the top (no longer needed). Remove `DocumentProcessor`, `EmbeddingService`, `ChromaVectorStore`, `RAGService` imports.

The final imports should be:
```python
from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from beanie import PydanticObjectId

from app.models.knowledge_base import KnowledgeBase, KBDocument
from app.models.workflow import Agent
from app.services.rag_instances import rag_service as _rag_service
```

- [ ] **Step 3: Verify existing tests still pass**

Run:
```bash
cd backend && python -m pytest tests/test_document_processor.py tests/test_vector_store.py tests/test_embedding_service.py tests/test_rag_service.py -v
```
Expected: 25 passed.

- [ ] **Step 4: Verify server loads**

Run:
```bash
cd backend && python -c "from app.main import app; print('OK')"
```
Expected: `OK`

---

## Task 2: Add RAG Injection to LLM Executor

**Files:**
- Modify: `backend/app/services/llm_executor.py`
- Create: `backend/tests/test_llm_rag_integration.py`

- [ ] **Step 1: Write tests for RAG integration**

Create `backend/tests/test_llm_rag_integration.py`:

```python
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
        # Should still have the header but no chunk content
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
cd backend && python -m pytest tests/test_llm_rag_integration.py -v
```
Expected: FAIL — `ImportError: cannot import name '_extract_query' from 'app.services.llm_executor'`

- [ ] **Step 3: Add helper functions to llm_executor.py**

In `backend/app/services/llm_executor.py`, add these two functions before `execute_llm_node`:

```python
def _extract_query(inputs: Dict[str, Any]) -> str:
    """Extract a query string from inputs for RAG retrieval.

    Priority: keys named prompt/query/input/question/text,
    then first string value found.
    """
    for key in ("prompt", "query", "input", "question", "text"):
        if key in inputs and isinstance(inputs[key], str) and inputs[key].strip():
            return inputs[key].strip()

    for value in inputs.values():
        if isinstance(value, str) and value.strip():
            return value.strip()

    return ""


def _build_rag_context(chunks: list) -> str:
    """Format retrieved chunks into a context block for the system prompt."""
    lines = [
        "## Reference Context\n",
        "The following information was retrieved from the knowledge base. "
        "Use it to inform your response when relevant.\n",
        "---",
    ]
    for chunk in chunks:
        source = chunk.metadata.get("filename", "unknown")
        index = chunk.metadata.get("chunk_index", 0)
        lines.append(f"[Source: {source}, Chunk {index}]")
        lines.append(chunk.text)
        lines.append("")
    lines.append("---")
    return "\n".join(lines)
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
cd backend && python -m pytest tests/test_llm_rag_integration.py -v
```
Expected: All 14 tests PASS.

- [ ] **Step 5: Add RAG injection block to execute_llm_node**

In `backend/app/services/llm_executor.py`, inside `execute_llm_node`, after the agent system_prompt override block (after line 133 `pass`) and before `input_str = json.dumps(...)` (line 135), insert:

```python
    # --- RAG context injection ---
    kb_id = (getattr(node, "config", None) or {}).get("knowledge_base_id")
    if kb_id:
        query = _extract_query(inputs)
        if query:
            try:
                from app.models.knowledge_base import KnowledgeBase
                from beanie import PydanticObjectId as _ObjId
                kb = await KnowledgeBase.get(_ObjId(kb_id))
                if kb:
                    from app.services.rag_instances import rag_service
                    rag_top_k = (getattr(node, "config", None) or {}).get("rag_top_k", 3)
                    chunks = await rag_service.search(kb, query, top_k=rag_top_k)
                    if chunks:
                        rag_context = _build_rag_context(chunks)
                        system_prompt = rag_context + "\n\n" + system_prompt
            except Exception as e:
                print(f"Warning: RAG retrieval failed for node {node.name}: {e}")
```

The try/except ensures that a RAG failure does not block the LLM node from executing — it degrades gracefully to running without context.

- [ ] **Step 6: Verify all backend tests pass**

Run:
```bash
cd backend && python -m pytest tests/test_document_processor.py tests/test_vector_store.py tests/test_embedding_service.py tests/test_rag_service.py tests/test_llm_rag_integration.py tests/test_executor.py -v
```
Expected: All pass (25 existing + 14 new = 39 total, plus existing executor tests).

---

## Task 3: Frontend — Add KB Selector to NodeConfigModal

**Files:**
- Modify: `frontend/src/components/NodeConfigModal.tsx`

- [ ] **Step 1: Add imports and state**

In `frontend/src/components/NodeConfigModal.tsx`:

Add `axios` and `Database` / `ChevronDown` / `ChevronRight` imports at the top:
```typescript
import axios from 'axios';
import { Trash2, Save, Dog, Layers, Database, ChevronDown, ChevronRight } from 'lucide-react';
```

Add new state variables inside the component (after the existing `conditionField` state):
```typescript
const [knowledgeBases, setKnowledgeBases] = useState<{_id?: string; id?: string; name: string}[]>([]);
const [kbId, setKbId] = useState<string>('');
const [ragTopK, setRagTopK] = useState<number>(3);
const [kbExpanded, setKbExpanded] = useState(false);
```

- [ ] **Step 2: Add fetch and initialization logic**

Add a new `useEffect` to fetch knowledge bases when the modal opens for an LLM node (after the existing `useEffect`):
```typescript
useEffect(() => {
  if (isOpen && skillType === 'llm') {
    axios.get('/api/knowledge-bases').then(res => setKnowledgeBases(res.data)).catch(() => {});
  }
}, [isOpen, skillType]);
```

In the existing `useEffect` that loads node data (inside the `if (isOpen && node)` block), add these lines after `setAgentId(node.agent_id || '')`:
```typescript
setKbId(node.config?.knowledge_base_id || '');
setRagTopK(node.config?.rag_top_k ?? 3);
setKbExpanded(!!node.config?.knowledge_base_id);
```

- [ ] **Step 3: Add KB config to save logic**

In `handleSave()`, after `parsedConfig` is built (for the non-start, non-condition, non-tool branch that does `JSON.parse(configStr)`), add before the `const updatedData` line:

```typescript
// Merge KB config if selected (LLM nodes only)
if (skillType === 'llm' && kbId) {
  parsedConfig = { ...parsedConfig, knowledge_base_id: kbId, rag_top_k: ragTopK };
}
```

- [ ] **Step 4: Add KB selector UI**

In the JSX, after the Agent Selector block (after the closing `</div>` of `{!isStartNode && !isConditionNode && needsAgent && (...)}`), add:

```tsx
{/* Knowledge Base selector — LLM nodes only */}
{!isStartNode && !isConditionNode && skillType === 'llm' && (
  <div className="border border-indigo-100 rounded-xl overflow-hidden">
    <button
      type="button"
      onClick={() => setKbExpanded(v => !v)}
      className="w-full flex items-center justify-between p-3 bg-indigo-50/30 hover:bg-indigo-50/60 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-1.5">
        <Database className="w-3.5 h-3.5 text-indigo-500" />
        <span className="text-sm font-semibold text-stone-700">Knowledge Base</span>
        {kbId && (
          <span className="text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-md font-medium">Active</span>
        )}
      </div>
      {kbExpanded
        ? <ChevronDown className="w-4 h-4 text-stone-400" />
        : <ChevronRight className="w-4 h-4 text-stone-400" />
      }
    </button>
    {kbExpanded && (
      <div className="p-3 space-y-3 bg-white">
        <div className="space-y-1">
          <label className="text-xs font-medium text-stone-700">Select Knowledge Base</label>
          <select
            value={kbId}
            onChange={e => setKbId(e.target.value)}
            className="w-full px-3 py-2 border border-indigo-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none bg-stone-50 hover:bg-white transition-colors cursor-pointer"
          >
            <option value="">None (no RAG)</option>
            {knowledgeBases.map(kb => {
              const id = extractId(kb._id || kb.id);
              return (
                <option key={id} value={id}>{kb.name}</option>
              );
            })}
          </select>
        </div>
        {kbId && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-stone-700">Top K Results</label>
            <input
              type="number"
              min={1}
              max={10}
              value={ragTopK}
              onChange={e => setRagTopK(Math.max(1, Math.min(10, parseInt(e.target.value) || 3)))}
              className="w-20 px-3 py-2 border border-indigo-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 outline-none bg-stone-50"
            />
            <p className="text-[10px] text-stone-400">Number of relevant chunks to retrieve (1-10)</p>
          </div>
        )}
        {knowledgeBases.length === 0 && (
          <p className="text-[10px] text-stone-400">
            No knowledge bases yet. Create one from the Knowledge Bases panel in the navbar.
          </p>
        )}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Verify frontend compiles**

Run:
```bash
cd frontend && npm run build
```
Expected: Build succeeds with no TypeScript errors.

---

## Task 4: Smoke Test

- [ ] **Step 1: Run all backend tests**

Run:
```bash
cd backend && python -m pytest tests/test_document_processor.py tests/test_vector_store.py tests/test_embedding_service.py tests/test_rag_service.py tests/test_llm_rag_integration.py tests/test_executor.py -v
```
Expected: All pass.

- [ ] **Step 2: Visual verification**

Start backend and frontend:
```bash
cd backend && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev
```

Verify in browser:
1. Create/open a workflow with an LLM node
2. Click the LLM node to open NodeConfigModal
3. Verify "Knowledge Base" collapsible section appears below Agent selector
4. Click to expand — verify KB dropdown is populated (if KBs exist)
5. Select a KB — verify "Top K Results" input appears
6. Save the node config
7. Re-open the node — verify KB selection persists
8. Set KB to "None" — verify it saves without KB config

---

## Summary

| Task | Files | What it does |
|------|-------|-------------|
| 1 | `rag_instances.py` (new), `knowledge_bases.py` (modify) | Extract shared RAG singletons |
| 2 | `llm_executor.py` (modify), `test_llm_rag_integration.py` (new) | RAG injection logic + 14 tests |
| 3 | `NodeConfigModal.tsx` (modify) | Collapsible KB selector UI |
| 4 | — | E2E smoke test |
