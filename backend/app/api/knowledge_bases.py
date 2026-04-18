from typing import List, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from beanie import PydanticObjectId

from app.models.knowledge_base import KnowledgeBase, KBDocument
from app.models.workflow import Agent
from app.services.rag_instances import rag_service as _rag_service


router = APIRouter(prefix="/knowledge-bases", tags=["knowledge-bases"])


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
    top_k: int = Field(default=5, ge=1, le=100)


class SearchResultResponse(BaseModel):
    text: str
    score: float
    filename: str
    chunk_index: int


# --- Knowledge Base CRUD ---

@router.post("", response_model=KnowledgeBase)
async def create_knowledge_base(data: KBCreate):
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
