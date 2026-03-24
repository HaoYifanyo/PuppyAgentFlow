from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from typing import Optional
import os
from beanie import init_beanie
from app.models.workflow import Workflow, Skill, WorkflowRun, Agent
from app.services.skill_service import SkillFileService

# LangGraph Checkpointer - MongoClient (singleton to avoid per-request connection leaks)
_mongo_client: Optional[MongoClient] = None

def get_mongo_client() -> MongoClient:
    global _mongo_client
    if _mongo_client is None:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        _mongo_client = MongoClient(uri)
    return _mongo_client

# beanie - AsyncIOMotorClient
async def init_db(uri: str = "mongodb://localhost:27017", db_name: str = os.getenv("MONGO_DB_NAME", "puppy_agent_flow")):
    client = AsyncIOMotorClient(uri)
    db = client[db_name]
    await init_beanie(database=db, document_models=[Workflow, Skill, WorkflowRun, Agent])

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