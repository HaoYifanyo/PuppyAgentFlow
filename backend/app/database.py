from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from typing import Optional
import os
from beanie import init_beanie
from app.models.workflow import Workflow, Skill, WorkflowRun, Agent
from app.models.team import Team, TeamRun, TeamMessage

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
    await init_beanie(database=db, document_models=[Workflow, Skill, WorkflowRun, Agent, Team, TeamRun, TeamMessage])

    # Initialize default skills if none exist
    if await Skill.find_all().count() == 0:
        default_skills = [
            Skill(
                name="LLM Node",
                type="llm",
                description="Generates text using an LLM based on a prompt template.",
                input_schema={"prompt": "string"},
                output_schema={"result": "string"},
                implementation={"prompt_template": "You are a helpful assistant. Provide an answer based on {{prompt}}."}
            ),
            Skill(
                name='Web Search',
                type='tool',
                description='Search google for current events and information.',
                input_schema={'query': 'string'},
                output_schema={'results': 'array'},
                implementation={
                    "executor": "python_eval",
                    "config": {
                        "code": """
def execute(inputs):
    import requests
    import os

    query = inputs.get("query")
    api_key = os.getenv("SERPAPI_API_KEY")

    if not api_key:
        return {"error": "Missing SERPAPI_API_KEY in environment"}

    url = f"https://serpapi.com/search.json?q={query}&api_key={api_key}"
    response = requests.get(url)
    data = response.json()

    results = []
    for item in data.get("organic_results", []):
        results.append({
            "title": item.get("title"),
            "link": item.get("link")
        })

    return {"results": results[:5]} 
"""
                    }
                }
            )
        ]
        for skill in default_skills:
            await skill.insert()
