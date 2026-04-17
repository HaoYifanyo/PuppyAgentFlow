from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from typing import Optional
import os
import certifi
from urllib.parse import urlparse
from beanie import init_beanie
from app.models.workflow import Workflow, Skill, WorkflowRun, Agent
from app.models.knowledge_base import KnowledgeBase, KBDocument
from app.services.skill_service import SkillFileService

# LangGraph Checkpointer - MongoClient (singleton to avoid per-request connection leaks)
_mongo_client: Optional[MongoClient] = None

def _needs_tls(uri: str) -> bool:
    """Use TLS for remote MongoDB only."""
    parsed = urlparse(uri)
    host = parsed.hostname or ""
    return host not in {"localhost", "127.0.0.1", "::1"}


def _get_mongo_client_kwargs(uri: str) -> dict:
    # Some environments may inject TLS options into URI; force local dev to plain TCP.
    if _needs_tls(uri):
        return {"tlsCAFile": certifi.where(), "tls": True}
    return {"tls": False}

def get_mongo_client() -> MongoClient:
    global _mongo_client
    if _mongo_client is None:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        kwargs = _get_mongo_client_kwargs(uri)
        _mongo_client = MongoClient(uri, **kwargs)
    return _mongo_client

# beanie - AsyncIOMotorClient
async def init_db(uri: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017"), db_name: str = os.getenv("MONGO_DB_NAME", "puppy_agent_flow")):
    kwargs = _get_mongo_client_kwargs(uri)
    client = AsyncIOMotorClient(uri, **kwargs)
    db = client[db_name]
    await init_beanie(database=db, document_models=[Workflow, Skill, WorkflowRun, Agent, KnowledgeBase, KBDocument])

    # Initialize default skills
    existing_skills = {s.name async for s in Skill.find_all()}

    # Built-in LLM skill
    if "LLM Node" not in existing_skills:
        await Skill(
            name="LLM Node",
            type="llm",
            description="Generates text using an LLM based on a prompt template.",
            input_schema={"prompt": "string"},
            output_schema={"result": "string"},
            implementation={"prompt_template": "You are a helpful assistant. Provide an answer based on {{prompt}}."}
        ).insert()

    # Load skills from disk (SKILL.md files)
    disk_skills_data = SkillFileService.load_all_from_disk()
    for skill_data in disk_skills_data:
        if skill_data["name"] not in existing_skills:
            await Skill(**skill_data).insert()