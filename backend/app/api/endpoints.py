from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional, Dict, List
from beanie import PydanticObjectId
from app.models.workflow import Workflow, WorkflowRun, Skill
from app.core.engine import WorkflowEngine
from app.services.llm_executor import real_executor_callback
from app.services.skill_service import SkillFileService

router = APIRouter()

# Global engine instance with real LLM executor
engine = WorkflowEngine(executor_callback=real_executor_callback)

@router.get("/skills", response_model=List[Skill])
async def list_skills():
    return await Skill.find_all().to_list()

@router.post("/skills", response_model=Skill)
async def create_skill(skill: Skill):
    await skill.insert()
    try:
        SkillFileService.save(skill)
    except Exception as e:
        print(f"Warning: Failed to save skill to disk: {e}")
    return skill

@router.post("/skills/generate", response_model=Skill)
async def generate_skill(request: Dict[str, str]):
    instruction = request.get("instruction")
    if not instruction:
        raise HTTPException(status_code=400, detail="instruction is required")

    from app.services.llm_executor import generate_skill_with_llm

    try:
        skill_data = generate_skill_with_llm(instruction)
        skill = Skill(**skill_data)
        await skill.insert()
        try:
            SkillFileService.save(skill)
        except Exception as e:
            print(f"Warning: Failed to save generated skill to disk: {e}")
        return skill
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate skill: {str(e)}")

@router.delete("/skills/{id}")
async def delete_skill(id: PydanticObjectId):
    skill = await Skill.get(id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    await skill.delete()
    return {"message": "Skill deleted"}

@router.get("/workflows", response_model=List[Workflow])
async def list_workflows():
    return await Workflow.find_all().to_list()

@router.post("/workflows", response_model=Workflow)
async def create_workflow(workflow: Workflow):
    await workflow.insert()
    return workflow

@router.put("/workflows/{id}", response_model=Workflow)
async def update_workflow(id: PydanticObjectId, workflow_data: Workflow):
    existing_wf = await Workflow.get(id)
    if not existing_wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    # Update fields
    existing_wf.name = workflow_data.name
    existing_wf.nodes = workflow_data.nodes
    existing_wf.edges = workflow_data.edges
    await existing_wf.save()
    return existing_wf

@router.delete("/workflows/{id}")
async def delete_workflow(id: PydanticObjectId):
    workflow = await Workflow.get(id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await workflow.delete()
    return {"message": "Workflow deleted"}

@router.post("/workflows/{id}/run", response_model=WorkflowRun)
async def start_run(id: PydanticObjectId, inputs: Dict[str, Any] = None):
    workflow = await Workflow.get(id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    run = engine.initialize_run(workflow)

    # Fetch all required skills for this workflow
    skill_ids = []
    for node in workflow.nodes:
        if node.skill_id and not node.is_start_node:
            try:
                skill_ids.append(PydanticObjectId(node.skill_id))
            except Exception:
                pass

    from beanie.operators import In
    skills = await Skill.find(In(Skill.id, skill_ids)).to_list() if skill_ids else []
    skills_map = {str(s.id): s for s in skills}

    # Override defaults if explicit inputs provided
    if inputs:
        # Override global context from Start Node if it exists
        start_node = next((n for n in workflow.nodes if n.is_start_node), None)
        if start_node:
            current_defaults = run.global_context.get(start_node.id, {})
            if isinstance(current_defaults, dict):
                current_defaults.update(inputs)
                run.global_context[start_node.id] = current_defaults
                run.node_runs[start_node.id].outputs = current_defaults
        else:
            # Fallback for unexpected cases (should not happen with mandatory start node)
            run.global_context.update(inputs)

    await run.insert()

    # Execute workflow synchronous logic
    engine.run(run, skills_map=skills_map)
    await run.save()
    return run

class ResumeRequest(BaseModel):
    action: str
    modified_outputs: Optional[Any] = None

@router.post("/runs/{id}/nodes/{node_id}/resume", response_model=WorkflowRun)
async def resume_run(id: PydanticObjectId, node_id: str, request: ResumeRequest):
    run = await WorkflowRun.get(id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # Fetch skills
    skill_ids = []
    for node in run.workflow.nodes:
        if node.skill_id and not node.is_start_node:
            try:
                skill_ids.append(PydanticObjectId(node.skill_id))
            except Exception:
                pass
    from beanie.operators import In
    skills = await Skill.find(In(Skill.id, skill_ids)).to_list() if skill_ids else []
    skills_map = {str(s.id): s for s in skills}

    try:
        engine.resume(
            run=run,
            node_id=node_id,
            action=request.action,
            modified_outputs=request.modified_outputs,
            skills_map=skills_map
        )
        await run.save()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return run

@router.get("/runs/{id}", response_model=WorkflowRun)
async def get_run(id: PydanticObjectId):
    run = await WorkflowRun.get(id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run