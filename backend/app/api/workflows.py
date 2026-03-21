import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from beanie import PydanticObjectId

from app.models.workflow import Workflow, WorkflowRun, WorkflowStatus
from app.api.helpers import build_graph_for_workflow, format_run_response

router = APIRouter(prefix="/workflows", tags=["workflows"])


@router.get("", response_model=List[Workflow])
async def list_workflows():
    return await Workflow.find_all().to_list()


@router.post("", response_model=Workflow)
async def create_workflow(workflow: Workflow):
    await workflow.insert()
    return workflow


@router.put("/{id}", response_model=Workflow)
async def update_workflow(id: PydanticObjectId, workflow_data: Workflow):
    existing = await Workflow.get(id)
    if not existing:
        raise HTTPException(status_code=404, detail="Workflow not found")

    existing.name = workflow_data.name
    existing.nodes = workflow_data.nodes
    existing.edges = workflow_data.edges
    await existing.save()
    return existing


@router.delete("/{id}")
async def delete_workflow(id: PydanticObjectId):
    workflow = await Workflow.get(id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await workflow.delete()
    return {"message": "Workflow deleted"}


@router.get("/{id}/runs")
async def list_workflow_runs(id: str):
    return await WorkflowRun.find({"workflow_id": id}).sort("-created_at").to_list()


@router.post("/{id}/run")
async def start_run(id: PydanticObjectId, inputs: Dict[str, Any] = None):
    workflow = await Workflow.get(id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    run_id = str(uuid.uuid4())
    run_record = WorkflowRun(id=run_id, workflow_id=str(workflow.id), status=WorkflowStatus.RUNNING)
    await run_record.insert()

    graph = await build_graph_for_workflow(workflow)
    config = {"configurable": {"thread_id": run_id}}

    start_node = next((n for n in workflow.nodes if getattr(n, "is_start_node", False)), None)
    initial_context = {}
    if start_node and hasattr(start_node, "config"):
        initial_context["manual_input_text"] = start_node.config.get("manual_input_text", "")
    if inputs:
        initial_context.update(inputs)

    initial_state = {"context": initial_context, "executed_nodes": [], "batch_collector": []}

    try:
        await graph.ainvoke(initial_state, config=config)
    except Exception as e:
        run_record.status = WorkflowStatus.ERROR
        await run_record.save()
        raise HTTPException(status_code=500, detail=str(e))

    response_data = await format_run_response(run_id, workflow, graph, config)
    run_record.status = WorkflowStatus(response_data["status"])
    await run_record.save()

    return response_data
