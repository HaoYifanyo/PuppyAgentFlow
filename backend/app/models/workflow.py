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
    type: str = Field(..., description="e.g., 'tool' or 'llm'")
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

class Node(BaseModel):
    id: str
    name: str
    skill_id: str
    require_approval: bool = False
    is_start_node: bool = False
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

class NodeRun(BaseModel):
    node_id: str
    status: NodeStatus = NodeStatus.PENDING
    inputs: Dict[str, Any] = {}
    outputs: Any = None
    error_msg: Optional[str] = None

class WorkflowRun(Document):
    workflow_id: str
    workflow: Workflow # Embed for demo simplicity
    status: WorkflowStatus = WorkflowStatus.PENDING
    global_context: Dict[str, Any] = {}
    node_runs: Dict[str, NodeRun] = {}
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    class Settings:
        name = "workflow_runs"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = get_utc_now()
