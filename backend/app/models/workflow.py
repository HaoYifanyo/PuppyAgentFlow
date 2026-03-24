from enum import Enum
from typing import Any, Dict, List, Optional
from datetime import datetime, timezone
from pydantic import BaseModel, Field, field_validator
from beanie import Document, before_event, Replace, Insert

def get_utc_now():
    return datetime.now(timezone.utc)

class NodeStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"

class WorkflowStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ERROR = "error"

class Skill(Document):
    name: str
    type: str = Field(..., description="e.g., 'tool', 'llm', or 'browser_use'")
    description: str = ""
    input_schema: Dict[str, Any] = {}
    output_schema: Dict[str, Any] = {}
    implementation: Dict[str, Any] = Field(..., description="Configuration dictionary for tool executor or llm prompt template")
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    class Settings:
        name = "skills"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = get_utc_now()

    def get_slug(self) -> str:
        return self.name.lower().replace(" ", "_").replace("-", "_")

    def get_path(self) -> str:
        import os
        base_dir = os.path.join("skills")
        return os.path.join(base_dir, self.get_slug(), "SKILL.md")

class Agent(Document):
    name: str
    provider: str = Field(..., description="gemini | openai | anthropic | custom")
    model_id: str
    api_key_encrypted: Optional[str] = Field(default=None)
    system_prompt: Optional[str] = None
    base_url: Optional[str] = None
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    class Settings:
        name = "agents"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = get_utc_now()


class Node(BaseModel):
    id: str
    name: str
    skill_id: str
    agent_id: Optional[str] = None
    require_approval: bool = False
    is_start_node: bool = False
    batch_mode: bool = False
    position: Optional[Dict[str, float]] = None
    config: Dict[str, Any] = {} # For prompt instructions and schema definitions

class Edge(BaseModel):
    source: str
    target: str
    data_mapping: Dict[str, str] = {} # e.g. {"target_input_key": "source_output_key"}

class Workflow(Document):
    name: str
    nodes: List[Node]
    edges: List[Edge]
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    @field_validator('nodes')
    @classmethod
    def validate_start_node(cls, v):
        start_nodes = [n for n in v if n.is_start_node]
        if len(start_nodes) != 1:
            raise ValueError("Workflow must have exactly one start node")
        return v

    class Settings:
        name = "workflows"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = get_utc_now()

class WorkflowRun(Document):
    id: str = Field(alias="_id", description="Also serves as the LangGraph thread_id")
    workflow_id: str
    status: WorkflowStatus = WorkflowStatus.PENDING
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    class Settings:
        name = "workflow_runs"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = get_utc_now()
