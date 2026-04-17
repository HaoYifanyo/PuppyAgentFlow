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
                    score=1 - results["distances"][0][i],
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
            pass
