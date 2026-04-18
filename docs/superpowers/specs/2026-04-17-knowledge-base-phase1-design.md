# Knowledge Base Infrastructure - Phase 1 Design

> Phase 1 of RAG integration for PuppyAgentFlow. Adds document upload, embedding,
> vector storage, and retrieval search capabilities as a foundation for future
> RAG skill nodes.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Knowledge Base scope | Global (like Skill/Agent) | Consistent with existing management patterns; any workflow node can reference any KB |
| Embedding config | Reuse Agent system | Agent already stores provider + model + key; user creates an embedding-purpose Agent (e.g. model=text-embedding-3-small) |
| Document types | TXT, MD, CSV, PDF, HTML | PDF is the most common KB use case; HTML is free (beautifulsoup4 already in deps) |
| Vector database | ChromaDB embedded (in-process) | Zero ops, pip install, persist to local dir; abstract interface allows future migration |
| Chunking strategy | Fixed defaults (1000/200), not user-configurable | Users won't understand chunk_size/overlap; can add advanced settings later |
| Architecture | Layered services (B) | Matches existing code style; each concern independently swappable |

---

## 1. Data Models

### KnowledgeBase (Beanie Document)

```python
class KnowledgeBase(Document):
    name: str
    description: str = ""
    embedding_agent_id: str          # references Agent doc for embedding provider + key
    document_count: int = 0
    status: str = "active"           # "active" | "error"
    created_at: datetime
    updated_at: datetime

    class Settings:
        name = "knowledge_bases"
```

### KBDocument (Beanie Document)

```python
class KBDocument(Document):
    knowledge_base_id: str
    filename: str
    file_type: str                   # "pdf" | "txt" | "md" | "csv" | "html"
    file_size: int                   # bytes
    chunk_count: int = 0
    status: str = "pending"          # "pending" | "processing" | "ready" | "error"
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Settings:
        name = "kb_documents"
```

### ChromaDB Data Structure

Each knowledge base maps to one ChromaDB collection named `kb_{knowledge_base_id}`.

Each record in the collection:

| Field | Content |
|-------|---------|
| `id` | `{document_id}_{chunk_index}` |
| `embedding` | float vector |
| `document` | chunk text |
| `metadata` | `{"document_id": "xxx", "filename": "guide.pdf", "chunk_index": 3}` |

---

## 2. Service Layer

Four services with single responsibilities:

### 2.1 document_processor.py

Parses files into plain text and splits into chunks.

```python
class DocumentChunk(BaseModel):
    text: str
    index: int
    metadata: dict = {}

class DocumentProcessor:
    CHUNK_SIZE = 1000
    CHUNK_OVERLAP = 200

    def parse(self, file_bytes: bytes, file_type: str) -> str:
        """Parse file to plain text.
        - pdf: pymupdf
        - txt/md/csv: utf-8 decode
        - html: beautifulsoup4 (already in deps)
        """

    def chunk(self, text: str) -> list[DocumentChunk]:
        """Fixed-strategy chunking: size=1000, overlap=200."""
```

### 2.2 embedding_service.py

Unified embedding interface using LangChain Embeddings classes.

```python
class EmbeddingService:
    async def embed_texts(self, texts: list[str], agent: Agent) -> list[list[float]]:
        """Batch embed using Agent's provider + model + key.
        Supported providers:
        - openai -> langchain_openai.OpenAIEmbeddings
        - gemini -> langchain_google_genai.GoogleGenerativeAIEmbeddings
        - openrouter -> OpenAI-compatible (base_url override)
        - custom -> OpenAI-compatible endpoint
        Note: anthropic is NOT supported (no embedding API).
        The UI should guide users to pick a supported provider.
        """

    async def embed_query(self, query: str, agent: Agent) -> list[float]:
        """Single query embedding (for retrieval)."""
```

### 2.3 vector_store.py

Abstract base + ChromaDB implementation.

```python
class SearchResult(BaseModel):
    text: str
    score: float
    metadata: dict

class VectorStoreBase(ABC):
    async def create_collection(self, name: str) -> None: ...
    async def add_chunks(self, collection: str, chunks: list[DocumentChunk], embeddings: list[list[float]]) -> None: ...
    async def search(self, collection: str, query_embedding: list[float], top_k: int) -> list[SearchResult]: ...
    async def delete_by_document(self, collection: str, document_id: str) -> None: ...
    async def delete_collection(self, collection: str) -> None: ...

class ChromaVectorStore(VectorStoreBase):
    def __init__(self, persist_dir: str = "./chroma_data"):
        self.client = chromadb.PersistentClient(path=persist_dir)
```

### 2.4 rag_service.py

Orchestration layer that wires the other three services together.

```python
class RAGService:
    def __init__(self, doc_processor, embedding_service, vector_store): ...

    async def upload_document(self, kb: KnowledgeBase, file: UploadFile) -> KBDocument:
        """Full pipeline: parse -> chunk -> embed -> store -> update MongoDB"""

    async def delete_document(self, kb: KnowledgeBase, doc: KBDocument) -> None:
        """Delete all chunks from vector store + MongoDB record"""

    async def search(self, kb: KnowledgeBase, query: str, top_k: int = 5) -> list[SearchResult]:
        """Query embed -> vector search -> return ranked chunks"""
```

Call chain: `API -> rag_service -> document_processor + embedding_service + vector_store`

---

## 3. API Endpoints

New router: `app/api/knowledge_bases.py`, registered in `app/api/router.py`.

### Knowledge Base CRUD

```
POST   /api/knowledge-bases                              # Create KB
GET    /api/knowledge-bases                              # List all KBs
GET    /api/knowledge-bases/{kb_id}                      # Get KB detail
PUT    /api/knowledge-bases/{kb_id}                      # Update KB (name, description, agent)
DELETE /api/knowledge-bases/{kb_id}                      # Delete KB + all docs + ChromaDB collection
```

Create request body:
```json
{
  "name": "Product Docs",
  "description": "...",
  "embedding_agent_id": "agent_object_id"
}
```

### Document Management

```
POST   /api/knowledge-bases/{kb_id}/documents            # Upload docs (multipart, multi-file)
GET    /api/knowledge-bases/{kb_id}/documents             # List docs (status, chunk_count)
DELETE /api/knowledge-bases/{kb_id}/documents/{doc_id}    # Delete single doc
```

Accepted file types: `.pdf`, `.txt`, `.md`, `.csv`, `.html`

### Search (Debug/Test)

```
POST   /api/knowledge-bases/{kb_id}/search
```

Request:
```json
{ "query": "how to reset password", "top_k": 5 }
```

Response:
```json
{
  "results": [
    {
      "text": "To reset your password, go to...",
      "score": 0.87,
      "filename": "user_guide.pdf",
      "chunk_index": 12
    }
  ]
}
```

---

## 4. Frontend

### New Files

```
frontend/src/components/KnowledgeBaseModal.tsx   # Main modal
frontend/src/hooks/useKnowledgeBases.ts          # KB + Document CRUD + search hooks
```

### Modified Files

```
frontend/src/types/index.ts    # Add KB-related type definitions
frontend/src/App.tsx           # Add KB modal entry button in Navbar
```

### Layout (KnowledgeBaseModal)

```
+-- KnowledgeBaseModal -------------------------------------------+
|                                                                  |
|  [+ New Knowledge Base]                                          |
|                                                                  |
|  +-- KB List (left) ---+  +-- Detail (right) -----------------+ |
|  | * Product Docs      |  | Name: Product Docs                | |
|  |   3 docs, active    |  | Agent: OpenAI Embed               | |
|  | o Finance KB        |  | Status: active                    | |
|  |   1 doc, active     |  |                                   | |
|  |                     |  | [Upload Documents]                | |
|  |                     |  |                                   | |
|  |                     |  | Documents:                        | |
|  |                     |  |  guide.pdf    ready    24 chunks   | |
|  |                     |  |  faq.md       ready    8 chunks    | |
|  |                     |  |  data.csv     processing...        | |
|  |                     |  |                                   | |
|  |                     |  | -- Search Test --                 | |
|  |                     |  | [query input          ] [Search]  | |
|  |                     |  | Result 1: "..." 0.87              | |
|  |                     |  | Result 2: "..." 0.82              | |
|  +---------------------+  +-----------------------------------+ |
+------------------------------------------------------------------+
```

### UX Requirements

- **Empty states**: Guide text + action button when no KBs or no docs
- **Upload feedback**: Spinner during upload, toast on success/error (3-5s auto-dismiss)
- **Document status polling**: Refresh doc list to reflect processing -> ready transition
- **Destructive actions**: Confirm dialog before deleting KB or document, danger-colored delete button
- **Accessibility**: File input with label, modal closes on ESC, scores shown as number + color
- **File type restriction**: File picker limited to .pdf, .txt, .md, .csv, .html

---

## 5. File Structure & Dependencies

### New Backend Files

```
backend/app/models/knowledge_base.py        # KnowledgeBase + KBDocument models
backend/app/services/document_processor.py   # Parse + chunk
backend/app/services/embedding_service.py    # Embedding interface
backend/app/services/vector_store.py         # VectorStoreBase + ChromaVectorStore
backend/app/services/rag_service.py          # Orchestration
backend/app/api/knowledge_bases.py           # API router
backend/chroma_data/                         # ChromaDB persistence directory
```

### Modified Backend Files

```
backend/app/database.py       # Register KnowledgeBase, KBDocument with Beanie
backend/app/api/router.py     # Include knowledge_bases router
backend/requirements.txt      # Add new dependencies
```

### New Frontend Files

```
frontend/src/components/KnowledgeBaseModal.tsx
frontend/src/hooks/useKnowledgeBases.ts
```

### Modified Frontend Files

```
frontend/src/types/index.ts
frontend/src/App.tsx
```

### New Dependencies (requirements.txt)

```
chromadb                  # Vector database (embedded mode)
pymupdf                   # PDF parsing
python-multipart          # File upload support for FastAPI
```

No `langchain-chroma` — using chromadb SDK directly since vector_store.py already provides the abstraction layer.

---

## 6. Key Data Flows

### Upload Document

```
POST /api/knowledge-bases/{kb_id}/documents
  |
  v
rag_service.upload_document()
  |-- 1. Create KBDocument record (status=processing)
  |-- 2. document_processor.parse(file_bytes, file_type) -> plain text
  |-- 3. document_processor.chunk(text) -> list[DocumentChunk]
  |-- 4. embedding_service.embed_texts(chunk_texts, agent) -> list[vector]
  |-- 5. vector_store.add_chunks(collection, chunks, embeddings)
  |-- 6. Update KBDocument (status=ready, chunk_count=N)
  '-- 7. Update KnowledgeBase (document_count += 1)
```

Synchronous execution. Async processing deferred to Phase 2 if needed.

### Search

```
POST /api/knowledge-bases/{kb_id}/search
  |
  v
rag_service.search()
  |-- 1. Get Agent from KnowledgeBase.embedding_agent_id
  |-- 2. embedding_service.embed_query(query, agent) -> query_vector
  |-- 3. vector_store.search(collection, query_vector, top_k) -> results
  '-- 4. Return list[SearchResult] with text, score, filename, chunk_index
```

### Delete Document

```
DELETE /api/knowledge-bases/{kb_id}/documents/{doc_id}
  |-- 1. vector_store.delete_by_document(collection, doc_id)
  |-- 2. Delete KBDocument record
  '-- 3. Update KnowledgeBase (document_count -= 1)
```

### Delete Knowledge Base

```
DELETE /api/knowledge-bases/{kb_id}
  |-- 1. vector_store.delete_collection(collection)
  |-- 2. Delete all KBDocument records for this KB
  '-- 3. Delete KnowledgeBase record
```

---

## Out of Scope (Phase 2+)

- RAG skill node type (workflow integration)
- RAG-enhanced LLM node (auto-retrieve context)
- Async document processing (background tasks)
- Hybrid search (vector + keyword/BM25)
- Reranking (cross-encoder or LLM-based)
- Configurable chunking strategies
- DOCX support
- Document preview/content viewing
