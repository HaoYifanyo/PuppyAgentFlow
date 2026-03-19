"""
Team mode models. Isolated from workflow models.
Reuses Agent and Skill by reference (agent_id, skill_ids).
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field
from beanie import Document, before_event, Replace, Insert


def get_utc_now():
    return datetime.now(timezone.utc)


class TeamMember(BaseModel):
    id: str
    name: str
    agent_id: str
    skill_ids: List[str] = Field(default_factory=list)
    is_lead: bool = False
    role_name: Optional[str] = None
    position: Optional[Dict[str, float]] = None
    config: Dict[str, Any] = Field(default_factory=dict)


class TeamEdge(BaseModel):
    source: str
    target: str


class Team(Document):
    name: str
    members: List[TeamMember] = Field(default_factory=list)
    edges: List[TeamEdge] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    class Settings:
        name = "teams"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = get_utc_now()


class TeamRun(Document):
    team_id: str
    user_input: str = ""
    status: str = "pending"  # pending, running, completed, error
    max_rounds: int = 1
    current_round: int = 0
    initiated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)

    class Settings:
        name = "team_runs"

    @before_event(Replace, Insert)
    def update_updated_at(self):
        self.updated_at = get_utc_now()


class TeamMessage(Document):
    team_run_id: str
    round: int = 1
    sender: str  # member id, or "user" for user input
    message_type: str  # "user_input" | "task_assignment" | "work_result" | "coordination"
    content: str
    target: Optional[str] = None  # specific member id, None = broadcast
    timestamp: datetime = Field(default_factory=get_utc_now)

    class Settings:
        name = "team_messages"
