from fastapi import APIRouter, HTTPException
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

from beanie import PydanticObjectId

from app.models.workflow import Agent
from app.services.crypto_utils import encrypt_text

router = APIRouter(prefix="/agents", tags=["agents"])

class AgentCreate(BaseModel):
    name: str
    provider: str
    model_id: str
    api_key: Optional[str] = None
    system_prompt: Optional[str] = None
    base_url: Optional[str] = None
    avatar_url: Optional[str] = None

class AgentUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    model_id: Optional[str] = None
    api_key: Optional[str] = None
    system_prompt: Optional[str] = None
    base_url: Optional[str] = None
    avatar_url: Optional[str] = None


@router.get("", response_model=List[Agent], response_model_exclude={"api_key_encrypted"})
async def list_agents():
    return await Agent.find_all().to_list()


@router.post("", response_model=Agent, response_model_exclude={"api_key_encrypted"})
async def create_agent(agent_data: AgentCreate):
    api_key_encrypted = encrypt_text(agent_data.api_key) if agent_data.api_key else None

    agent = Agent(
        name=agent_data.name,
        provider=agent_data.provider,
        model_id=agent_data.model_id,
        api_key_encrypted=api_key_encrypted,
        system_prompt=agent_data.system_prompt,
        base_url=agent_data.base_url,
        avatar_url=agent_data.avatar_url,
    )
    await agent.insert()
    return agent


@router.put("/{id}", response_model=Agent, response_model_exclude={"api_key_encrypted"})
async def update_agent(id: PydanticObjectId, agent_data: AgentUpdate):
    agent = await Agent.get(id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    update_dict = agent_data.model_dump(exclude_unset=True)

    for field in ("name", "provider", "model_id", "system_prompt", "base_url", "avatar_url"):
        if field in update_dict:
            setattr(agent, field, update_dict[field])

    if "api_key" in update_dict:
        api_key = update_dict["api_key"]
        agent.api_key_encrypted = encrypt_text(api_key) if api_key else None

    await agent.save()
    return agent


@router.delete("/{id}")
async def delete_agent(id: PydanticObjectId):
    agent = await Agent.get(id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    await agent.delete()
    return {"message": "Agent deleted"}
