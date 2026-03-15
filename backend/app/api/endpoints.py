from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any, Optional, Dict, List
from beanie import PydanticObjectId
from beanie.operators import In
import uuid

from app.models.workflow import Workflow, Skill, WorkflowRun, WorkflowStatus, NodeStatus
from app.core.langgraph_engine import build_workflow_graph
from app.database import get_mongo_client
from app.services.skill_service import SkillFileService

router = APIRouter()

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

from datetime import datetime, timezone

async def build_graph_for_workflow(workflow: Workflow):
    """Fetch skills and build LangGraph for a given workflow."""
    skill_ids = []
    for node in workflow.nodes:
        if node.skill_id and not node.is_start_node:
            try:
                skill_ids.append(PydanticObjectId(node.skill_id))
            except Exception:
                pass
    skills = await Skill.find(In(Skill.id, skill_ids)).to_list() if skill_ids else []
    skills_map = {str(s.id): s for s in skills}
    return build_workflow_graph(workflow, skills_map, get_mongo_client())

async def format_run_response(run_id: str, workflow: Workflow, graph, config: dict, override_status: WorkflowStatus = None):
    state_snapshot = await graph.aget_state(config)
    is_paused = len(state_snapshot.next) > 0

    if override_status is not None:
        status = override_status
    else:
        status = WorkflowStatus.PAUSED if is_paused else WorkflowStatus.COMPLETED

    values = state_snapshot.values or {}
    executed_nodes = values.get("executed_nodes", [])
    node_inputs_map = values.get("node_inputs", {})
    node_outputs_map = values.get("node_outputs", {})

    # The node awaiting approval is the last executed node (current_node_id)
    current_node_id = values.get("current_node_id")
    awaiting_approval_nodes: set[str] = set()
    if is_paused and current_node_id:
        current_node = next((n for n in workflow.nodes if n.id == current_node_id), None)
        if current_node and getattr(current_node, 'require_approval', False):
            awaiting_approval_nodes.add(current_node_id)

    node_runs = {}
    for node in workflow.nodes:
        if override_status == WorkflowStatus.ERROR and node.id in awaiting_approval_nodes:
            node_runs[node.id] = {
                "node_id": node.id,
                "status": NodeStatus.ERROR,
                "inputs": node_inputs_map.get(node.id),
                "outputs": node_outputs_map.get(node.id),
            }
        elif node.id in awaiting_approval_nodes:
            node_runs[node.id] = {
                "node_id": node.id,
                "status": NodeStatus.PAUSED,
                "inputs": node_inputs_map.get(node.id),
                "outputs": node_outputs_map.get(node.id),
            }
        elif node.id in executed_nodes:
            node_runs[node.id] = {
                "node_id": node.id,
                "status": NodeStatus.COMPLETED,
                "inputs": node_inputs_map.get(node.id),
                "outputs": node_outputs_map.get(node.id),
            }
        else:
            node_runs[node.id] = {"node_id": node.id, "status": NodeStatus.PENDING}

    now = datetime.now(timezone.utc)

    return {
        "_id": run_id,
        "id": run_id,
        "workflow_id": str(workflow.id),
        "workflow": workflow,
        "status": status,
        "node_runs": node_runs,
        "created_at": now,
        "updated_at": now
    }

@router.get("/workflows/{id}/runs")
async def list_workflow_runs(id: str):
    runs = await WorkflowRun.find({"workflow_id": id}).sort("-created_at").to_list()
    return runs

@router.post("/workflows/{id}/run")
async def start_run(id: PydanticObjectId, inputs: Dict[str, Any] = None):
    workflow = await Workflow.get(id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    run_id = str(uuid.uuid4())
    run_record = WorkflowRun(id=run_id, workflow_id=str(workflow.id), status=WorkflowStatus.RUNNING)
    await run_record.insert()

    graph = await build_graph_for_workflow(workflow)

    config = {"configurable": {"thread_id": run_id}}

    # Initialize the state context using the Start Node config (manual_input_text)
    # merged with any explicit inputs provided
    start_node = next((n for n in workflow.nodes if getattr(n, 'is_start_node', False)), None)
    initial_context = {}
    if start_node and hasattr(start_node, 'config'):
        initial_context["manual_input_text"] = start_node.config.get("manual_input_text", "")
    if inputs:
        initial_context.update(inputs)

    initial_state = {
        "context": initial_context,
        "executed_nodes": []
    }

    try:
        # invoke the graph asynchronously
        await graph.ainvoke(initial_state, config=config)
    except Exception as e:
        run_record.status = WorkflowStatus.ERROR
        await run_record.save()
        raise HTTPException(status_code=500, detail=str(e))

    response_data = await format_run_response(run_id, workflow, graph, config)

    # Update status in WorkflowRun
    run_record.status = WorkflowStatus(response_data["status"])
    await run_record.save()

    return response_data

class ResumeRequest(BaseModel):
    action: str
    modified_outputs: Optional[Any] = None

@router.post("/runs/{run_id}/resume")
async def resume_run(run_id: str, workflow_id: str, request: ResumeRequest):
    try:
        wf_oid = PydanticObjectId(workflow_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workflow_id")

    workflow = await Workflow.get(wf_oid)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    graph = await build_graph_for_workflow(workflow)

    config = {"configurable": {"thread_id": run_id}}

    # Handle reject: terminate the run without resuming the graph
    if request.action == "reject":
        response_data = await format_run_response(run_id, workflow, graph, config, override_status=WorkflowStatus.ERROR)
        run_record = await WorkflowRun.get(run_id)
        if run_record:
            run_record.status = WorkflowStatus.ERROR
            await run_record.save()
        return response_data

    # Inject modified outputs into state before resuming
    if request.modified_outputs:
        await graph.aupdate_state(config, {"context": request.modified_outputs})

    try:
        await graph.ainvoke(None, config=config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    response_data = await format_run_response(run_id, workflow, graph, config)

    # Update status in WorkflowRun
    run_record = await WorkflowRun.get(run_id)
    if run_record:
        run_record.status = WorkflowStatus(response_data["status"])
        await run_record.save()

    return response_data

# @router.get("/runs/{run_id}/nodes/{node_id}/history")
# async def get_node_history(run_id: str, node_id: str, workflow_id: str):
#     try:
#         wf_oid = PydanticObjectId(workflow_id)
#     except Exception:
#         raise HTTPException(status_code=400, detail="Invalid workflow_id")
#
#     workflow = await Workflow.get(wf_oid)
#     if not workflow:
#         raise HTTPException(status_code=404, detail="Workflow not found")
#
#     graph = await build_graph_for_workflow(workflow)
#     config = {"configurable": {"thread_id": run_id}}
#
#     history = []
#     async for snapshot in graph.aget_state_history(config):
#         values = snapshot.values or {}
#         if values.get("current_node_id") != node_id:
#             continue
#         history.append({
#             "checkpoint_id": snapshot.config.get("configurable", {}).get("checkpoint_id"),
#             "created_at": snapshot.created_at,
#             "inputs": (values.get("node_inputs") or {}).get(node_id),
#             "outputs": (values.get("node_outputs") or {}).get(node_id),
#         })
#
#     return history


@router.get("/runs/{run_id}")
async def get_run(run_id: str, workflow_id: str):
    try:
        wf_oid = PydanticObjectId(workflow_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workflow_id")

    workflow = await Workflow.get(wf_oid)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    graph = await build_graph_for_workflow(workflow)
    config = {"configurable": {"thread_id": run_id}}

    # Verify the thread exists in checkpoints
    state_snapshot = await graph.aget_state(config)
    if not state_snapshot or not hasattr(state_snapshot, 'values'):
         raise HTTPException(status_code=404, detail="Run not found in checkpoint state")

    return await format_run_response(run_id, workflow, graph, config)