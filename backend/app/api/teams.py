"""
Team mode API. Isolated from workflow/runs.
No imports from langgraph_engine or workflow helpers.
"""
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from beanie import PydanticObjectId
from pydantic import BaseModel

from app.models.team import Team, TeamRun, TeamMessage, TeamMember, TeamEdge

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamMemberCreate(BaseModel):
    id: str
    name: str
    agent_id: str
    skill_ids: List[str] = []
    is_lead: bool = False
    role_name: Optional[str] = None
    position: Optional[dict] = None
    config: dict = {}


class TeamEdgeCreate(BaseModel):
    source: str
    target: str


class TeamCreate(BaseModel):
    name: str
    members: List[TeamMemberCreate] = []
    edges: List[TeamEdgeCreate] = []


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    members: Optional[List[TeamMemberCreate]] = None
    edges: Optional[List[TeamEdgeCreate]] = None


class TeamRunStart(BaseModel):
    user_input: str
    max_rounds: int = 1


@router.get("", response_model=List[Team])
async def list_teams():
    return await Team.find_all().to_list()


@router.post("", response_model=Team)
async def create_team(data: TeamCreate):
    members = [TeamMember(**m.model_dump()) for m in data.members]
    edges = [TeamEdge(**e.model_dump()) for e in data.edges]
    team = Team(name=data.name, members=members, edges=edges)
    await team.insert()
    return team


@router.get("/{id}", response_model=Team)
async def get_team(id: PydanticObjectId):
    team = await Team.get(id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.put("/{id}", response_model=Team)
async def update_team(id: PydanticObjectId, data: TeamUpdate):
    team = await Team.get(id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    if data.name is not None:
        team.name = data.name
    if data.members is not None:
        team.members = [TeamMember(**m.model_dump()) for m in data.members]
    if data.edges is not None:
        team.edges = [TeamEdge(**e.model_dump()) for e in data.edges]
    await team.save()
    return team


@router.delete("/{id}")
async def delete_team(id: PydanticObjectId):
    team = await Team.get(id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    await team.delete()
    return {"message": "Team deleted"}


@router.post("/{id}/run")
async def start_team_run(id: PydanticObjectId, data: TeamRunStart):
    team = await Team.get(id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    run = TeamRun(
        team_id=str(team.id),
        user_input=data.user_input,
        max_rounds=data.max_rounds,
        status="pending",
    )
    await run.insert()
    return {
        "run_id": str(run.id),
        "team_id": run.team_id,
        "user_input": run.user_input,
        "max_rounds": run.max_rounds,
        "status": run.status,
        "message": "Team run created. Full orchestration not yet implemented.",
    }


@router.get("/{id}/runs")
async def list_team_runs(id: str):
    return await TeamRun.find(TeamRun.team_id == id).sort("-created_at").to_list()


@router.post("/{id}/runs/{run_id}/stop")
async def stop_team_run(id: str, run_id: PydanticObjectId):
    run = await TeamRun.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="TeamRun not found")
    if run.team_id != id:
        raise HTTPException(status_code=404, detail="TeamRun does not belong to this team")
    if run.status not in ("pending", "running"):
        raise HTTPException(status_code=400, detail=f"Cannot stop run with status '{run.status}'")
    run.status = "error"
    await run.save()
    return {"run_id": str(run.id), "status": run.status, "message": "Team run stopped"}


@router.get("/{id}/runs/{run_id}/messages")
async def list_run_messages(id: str, run_id: PydanticObjectId):
    run = await TeamRun.get(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="TeamRun not found")
    if run.team_id != id:
        raise HTTPException(status_code=404, detail="TeamRun does not belong to this team")
    messages = await TeamMessage.find(
        TeamMessage.team_run_id == str(run_id)
    ).sort("+timestamp").to_list()
    return messages
