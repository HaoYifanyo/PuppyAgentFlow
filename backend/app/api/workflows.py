import uuid
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from beanie import PydanticObjectId
import json

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


async def _prepare_run(workflow: Workflow, inputs: Dict[str, Any]):
    """Shared initialization: create run record, build graph, prepare initial state."""
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
    return run_id, run_record, graph, config, initial_state


@router.post("/{id}/run")
async def start_run(id: PydanticObjectId, inputs: Dict[str, Any] = None):
    workflow = await Workflow.get(id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    run_id, run_record, graph, config, initial_state = await _prepare_run(workflow, inputs or {})

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


async def _handle_stream(graph, config, workflow, run_id, run_record):
    """Shared SSE streaming core for both initial run and resume."""
    try:
        async for chunk in graph.astream(
            None,
            config=config,
            stream_mode=["messages", "updates", "values"],
            version="v2",
        ):
            mode = chunk["type"]
            data = chunk.get("data")

            if mode == "messages":
                msg_chunk, metadata = data
                serializable_data = [
                    {
                        "content": msg_chunk.content,
                        "type": getattr(msg_chunk, "type", None),
                        "id": getattr(msg_chunk, "id", None),
                    },
                    metadata,
                ]
            else:
                serializable_data = data

            # Detect interrupt (v2: interrupts on values chunk; v1: __interrupt__ in updates data)
            is_interrupt = (
                (mode == "values" and chunk.get("interrupts"))
                or (mode == "updates" and isinstance(data, dict) and "__interrupt__" in data)
            )
            if is_interrupt:
                interrupts = chunk.get("interrupts") or (data.get("__interrupt__") if isinstance(data, dict) else None) or ()
                yield f"data: {json.dumps({'type': 'paused', 'run_id': run_id, 'workflow_id': str(workflow.id), 'final_status': 'paused', 'data': {'reason': 'approval_required', 'interrupts': list(interrupts)}})}\n\n"
                run_record.status = WorkflowStatus.PAUSED
                await run_record.save()
                return

            yield f"data: {json.dumps({'type': mode, 'data': serializable_data})}\n\n"

        yield f"data: {json.dumps({'type': 'done', 'run_id': run_id, 'workflow_id': str(workflow.id), 'final_status': 'completed'})}\n\n"
        run_record.status = WorkflowStatus.COMPLETED
        await run_record.save()

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'run_id': run_id, 'workflow_id': str(workflow.id), 'final_status': 'error', 'message': str(e)})}\n\n"
        run_record.status = WorkflowStatus.ERROR
        await run_record.save()


@router.post("/{id}/execute/stream")
async def execute_workflow_stream(id: PydanticObjectId, inputs: Dict[str, Any] = None):
    """Stream workflow execution endpoint, returns SSE formatted data."""
    workflow = await Workflow.get(id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")

    async def stream():
        run_id, run_record, graph, config, initial_state = await _prepare_run(workflow, inputs or {})
        await graph.aupdate_state(config, initial_state, as_node="__start__")
        async for item in _handle_stream(graph, config, workflow, run_id, run_record):
            yield item

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
