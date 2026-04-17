from beanie import PydanticObjectId
from app.models.workflow import Agent
from app.models.knowledge_base import KBDocument
from app.services.document_processor import DocumentProcessor
from app.services.embedding_service import EmbeddingService
from app.services.vector_store import VectorStoreBase, SearchResult


ALLOWED_FILE_TYPES = {"pdf", "txt", "md", "csv", "html"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


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

        if file_size > MAX_FILE_SIZE:
            raise ValueError(f"File too large ({file_size} bytes). Maximum allowed: {MAX_FILE_SIZE} bytes.")

        doc = KBDocument(
            knowledge_base_id=str(kb.id),
            filename=upload_file.filename,
            file_type=file_type,
            file_size=file_size,
            status="processing",
        )
        await doc.insert()

        try:
            text = self.doc_processor.parse(file_bytes, file_type)
            chunks = self.doc_processor.chunk(text)
            if not chunks:
                doc.status = "ready"
                doc.chunk_count = 0
                await doc.save()
                return doc

            agent = await self._get_agent(kb.embedding_agent_id)
            chunk_texts = [c.text for c in chunks]
            embeddings = await self.embedding_service.embed_texts(chunk_texts, agent)

            collection = _collection_name(kb.id)
            self.vector_store.create_collection(collection)
            self.vector_store.add_chunks(
                collection, chunks, embeddings,
                document_id=str(doc.id),
                filename=upload_file.filename,
            )

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
        collection = _collection_name(kb.id)
        self.vector_store.delete_by_document(collection, str(doc.id))
        await doc.delete()

        kb.document_count = max(0, kb.document_count - 1)
        await kb.save()

    async def delete_knowledge_base(self, kb) -> None:
        collection = _collection_name(kb.id)
        self.vector_store.delete_collection(collection)

        docs = await KBDocument.find(KBDocument.knowledge_base_id == str(kb.id)).to_list()
        for doc in docs:
            await doc.delete()

        await kb.delete()

    async def search(self, kb, query: str, top_k: int = 5) -> list[SearchResult]:
        agent = await self._get_agent(kb.embedding_agent_id)
        query_embedding = await self.embedding_service.embed_query(query, agent)

        collection = _collection_name(kb.id)
        return self.vector_store.search(collection, query_embedding, top_k)
