from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from beanie import PydanticObjectId

from app.models.workflow import Workflow, WorkflowRun, WorkflowStatus
from app.api.helpers import build_graph_for_workflow, format_run_response

router = APIRouter(prefix="/runs", tags=["runs"])


class ResumeRequest(BaseModel):
    action: str
    modified_outputs: Optional[Any] = None


@router.post("/{run_id}/resume")
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

    run_record = await WorkflowRun.get(run_id)
    if run_record:
        run_record.status = WorkflowStatus.RUNNING
        await run_record.save()

    if request.action == "reject":
        response_data = await format_run_response(
            run_id, workflow, graph, config, override_status=WorkflowStatus.ERROR
        )
        run_record = await WorkflowRun.get(run_id)
        if run_record:
            run_record.status = WorkflowStatus.ERROR
            await run_record.save()
        return response_data

    if request.modified_outputs:
        state_snapshot = await graph.aget_state(config)
        current_node_id = (state_snapshot.values or {}).get("current_node_id")
        update: dict = {"context": request.modified_outputs}
        if current_node_id:
            update["node_outputs"] = {current_node_id: request.modified_outputs}
        await graph.aupdate_state(config, update)

    try:
        await graph.ainvoke(None, config=config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    response_data = await format_run_response(run_id, workflow, graph, config)

    run_record = await WorkflowRun.get(run_id)
    if run_record:
        run_record.status = WorkflowStatus(response_data["status"])
        await run_record.save()

    return response_data


@router.get("/{run_id}")
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

    run_record = await WorkflowRun.find_one(WorkflowRun.id == run_id)
    status_override = None
    if run_record and run_record.status == WorkflowStatus.RUNNING:
        status_override = WorkflowStatus.RUNNING

    state_snapshot = await graph.aget_state(config)
    if not state_snapshot or not hasattr(state_snapshot, "values"):
        raise HTTPException(status_code=404, detail="Run not found in checkpoint state")

    return await format_run_response(run_id, workflow, graph, config, override_status=status_override)
