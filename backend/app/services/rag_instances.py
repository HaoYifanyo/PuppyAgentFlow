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
