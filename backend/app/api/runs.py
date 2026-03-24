from typing import Any, Optional

import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from beanie import PydanticObjectId

from app.models.workflow import Workflow, WorkflowRun, WorkflowStatus
from app.api.helpers import build_graph_for_workflow, format_run_response
from app.api.workflows import _handle_stream

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

    if request.action == "reject":
        async def reject_stream():
            msg = json.dumps({
                "type": "error",
                "run_id": run_id,
                "workflow_id": workflow_id,
                "final_status": "error",
                "message": "Rejected by user",
            })
            yield f"data: {msg}\n\n"

        return StreamingResponse(
            reject_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    run_record = await WorkflowRun.get(run_id)
    if run_record:
        run_record.status = WorkflowStatus.RUNNING
        await run_record.save()

    if request.modified_outputs:
        state_snapshot = await graph.aget_state(config)
        current_node_id = (state_snapshot.values or {}).get("current_node_id")
        update: dict = {"context": request.modified_outputs}
        if current_node_id:
            update["node_outputs"] = {current_node_id: request.modified_outputs}
        await graph.aupdate_state(config, update)

    # Resume graph execution via streaming
    return StreamingResponse(
        _handle_stream(graph, config, workflow, run_id, run_record),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/{run_id}/terminate")
async def terminate_run(run_id: str, workflow_id: str):
    try:
        wf_oid = PydanticObjectId(workflow_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workflow_id")

    workflow = await Workflow.get(wf_oid)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    run_record = await WorkflowRun.find_one(WorkflowRun.id == run_id)
    if not run_record:
        raise HTTPException(status_code=404, detail="Run not found")

    if run_record.status not in [WorkflowStatus.RUNNING, WorkflowStatus.PAUSED]:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot terminate run with status: {run_record.status}"
        )

    run_record.status = WorkflowStatus.TERMINATED
    await run_record.save()

    return {
        "run_id": run_id,
        "status": "terminated",
        "message": "Workflow termination requested"
    }


@router.delete("/{run_id}")
async def reset_run(run_id: str, workflow_id: str):
    try:
        wf_oid = PydanticObjectId(workflow_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid workflow_id")

    workflow = await Workflow.get(wf_oid)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    run_record = await WorkflowRun.find_one(WorkflowRun.id == run_id)
    if not run_record:
        raise HTTPException(status_code=404, detail="Run not found")

    await run_record.delete()

    return {
        "run_id": run_id,
        "status": "deleted",
        "message": "Run record deleted successfully"
    }


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
