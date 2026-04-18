# RAG-Enhanced LLM Node Design

> Add optional knowledge base retrieval to any LLM node. When configured,
> the node automatically retrieves relevant chunks from a knowledge base
> and injects them as context into the system prompt before calling the LLM.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Integration style | Optional config on existing LLM nodes, not a separate RAG node | 80% of use cases are retrieve+generate; extra node adds friction |
| Context injection | Auto-inject to system_prompt prefix | Zero user config, industry standard (Dify, Coze) |
| Query extraction | Priority keys (prompt/query/input), fallback to first string value | Covers most prompt templates without user config |
| Similarity threshold | None | Score distributions vary across models; top_k is sufficient control |
| Empty results | Skip injection, run LLM normally | No error, no disruption |
| Default top_k | 3 | 3 chunks * ~1000 chars = ~3000 chars context, enough without diluting prompt |
| KB list fetching | NodeConfigModal fetches internally | No App.tsx prop chain changes needed |

---

## 1. Backend Changes

### File: `backend/app/services/llm_executor.py`

Add RAG context injection in `execute_llm_node()`, after system_prompt is assembled but before calling the LLM.

#### New helper functions

```python
def _extract_query(inputs: Dict[str, Any]) -> str:
    """Extract a query string from inputs for RAG retrieval.
    
    Priority: keys named prompt/query/input, then first string value.
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

#### Modified flow in `execute_llm_node()`

After line 121 (`system_prompt = prompt_template`) and after the agent system_prompt override block, insert:

```python
# --- RAG context injection ---
kb_id = getattr(node, "config", {}).get("knowledge_base_id")
if kb_id:
    query = _extract_query(inputs)
    if query:
        from app.models.knowledge_base import KnowledgeBase
        from beanie import PydanticObjectId as _ObjId
        kb = await KnowledgeBase.get(_ObjId(kb_id))
        if kb:
            from app.services.rag_instances import rag_service
            rag_top_k = getattr(node, "config", {}).get("rag_top_k", 3)
            chunks = await rag_service.search(kb, query, top_k=rag_top_k)
            if chunks:
                rag_context = _build_rag_context(chunks)
                system_prompt = rag_context + "\n\n" + system_prompt
```

To avoid duplicating service instantiation, shared singletons live in `rag_instances.py`:

```python
# backend/app/services/rag_instances.py
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

Both `knowledge_bases.py` router and `llm_executor.py` import from `rag_instances`.

---

## 2. Frontend Changes

### File: `frontend/src/components/NodeConfigModal.tsx`

Add a collapsible "Knowledge Base" section, visible only when `skillType === 'llm'`.

#### New state variables

```typescript
const [knowledgeBases, setKnowledgeBases] = useState<{_id?: string; id?: string; name: string}[]>([]);
const [kbId, setKbId] = useState<string>('');
const [ragTopK, setRagTopK] = useState<number>(3);
const [kbExpanded, setKbExpanded] = useState(false);
```

#### Fetch on open

```typescript
useEffect(() => {
  if (isOpen && skillType === 'llm') {
    axios.get("/api/knowledge-bases").then(res => setKnowledgeBases(res.data)).catch(() => {});
  }
}, [isOpen, skillType]);
```

#### Initialize from node.config

In the existing `useEffect` that loads node data, add:

```typescript
setKbId(node.config?.knowledge_base_id || '');
setRagTopK(node.config?.rag_top_k ?? 3);
setKbExpanded(!!node.config?.knowledge_base_id);
```

#### UI placement

Between Agent selector and Require Approval switch. Collapsible via click:

```
▶ Knowledge Base            ← collapsed by default, click to expand
┌──────────────────────────┐
│ KB: [None ▾]             │  ← dropdown from /api/knowledge-bases
│ Top K: [3]               │  ← number input, 1-10
└──────────────────────────┘
```

When `kbId` is empty (None selected), `kbExpanded` auto-collapses.
When `kbId` has a value (from saved config), starts expanded.

#### Save logic

In `handleSave()`, merge KB config into `parsedConfig`:

```typescript
if (kbId) {
  parsedConfig.knowledge_base_id = kbId;
  parsedConfig.rag_top_k = ragTopK;
}
```

When `kbId` is empty, these keys are simply absent from config.

---

## 3. File Summary

| File | Action | Change |
|------|--------|--------|
| `backend/app/services/rag_instances.py` | CREATE | Shared RAG service singletons |
| `backend/app/services/llm_executor.py` | MODIFY | Add `_extract_query`, `_build_rag_context`, RAG injection in `execute_llm_node` |
| `backend/app/api/knowledge_bases.py` | MODIFY | Import singletons from `rag_instances` instead of creating locally |
| `frontend/src/components/NodeConfigModal.tsx` | MODIFY | Add KB dropdown + top_k in collapsible section |

---

## 4. Data Flow

### Execution with RAG enabled

```
Workflow executes LLM node
  → _build_node_inputs() builds inputs from upstream context
  → execute_llm_node() called
    → prompt_template assembled with variable substitution
    → agent system_prompt prepended (if configured)
    → node.config.knowledge_base_id exists?
      → YES:
        → _extract_query(inputs) → query string
        → rag_service.search(kb, query, top_k=3) → chunks
        → chunks not empty?
          → YES: _build_rag_context(chunks) prepended to system_prompt
          → NO: continue without RAG context
      → NO: continue without RAG context
    → LLM called with final system_prompt + user_prompt
    → output returned
```

### Execution without RAG (unchanged)

```
Same as today — no knowledge_base_id in config means zero code path difference
```

---

## Out of Scope

- Standalone RAG skill node type
- Configurable similarity threshold
- Multiple knowledge bases per node
- RAG for tool or browser_use nodes
- Streaming RAG chunks to frontend
