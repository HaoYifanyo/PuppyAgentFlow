from typing import Optional
from datetime import datetime, timezone
from pydantic import Field
from beanie import Document, before_event, Replace, Insert


def _utc_now():
    return datetime.now(timezone.utc)


class KnowledgeBase(Document):
    name: str
    description: str = ""
    embedding_agent_id: str
    document_count: int = 0
    status: str = Field(default="active", description="active | error")
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "knowledge_bases"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = _utc_now()


class KBDocument(Document):
    knowledge_base_id: str
    filename: str
    file_type: str = Field(..., description="pdf | txt | md | csv | html")
    file_size: int = Field(..., description="File size in bytes")
    chunk_count: int = 0
    status: str = Field(default="pending", description="pending | processing | ready | error")
    error_message: Optional[str] = None
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)

    class Settings:
        name = "kb_documents"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = _utc_now()
