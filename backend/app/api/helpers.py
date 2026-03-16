from datetime import datetime, timezone

from beanie import PydanticObjectId
from beanie.operators import In
from fastapi import HTTPException

from app.models.workflow import Skill, Workflow, WorkflowStatus, NodeStatus
from app.core.langgraph_engine import build_workflow_graph
from app.database import get_mongo_client


async def build_graph_for_workflow(workflow: Workflow):
    """Fetch skills and build LangGraph for a given workflow."""
    skill_ids = []
    node_skill_id_map: dict[str, str] = {}  # node.id -> skill_id string
    for node in workflow.nodes:
        if node.skill_id and not node.is_start_node:
            try:
                oid = PydanticObjectId(node.skill_id)
                skill_ids.append(oid)
                node_skill_id_map[node.id] = node.skill_id
            except Exception:
                pass

    skills = await Skill.find(In(Skill.id, skill_ids)).to_list() if skill_ids else []
    skills_map = {str(s.id): s for s in skills}

    missing = [sid for sid in node_skill_id_map.values() if sid not in skills_map]
    if missing:
        raise HTTPException(
            status_code=422,
            detail=f"Workflow references skill(s) that no longer exist: {missing}. "
                   "Please remove or replace those nodes before running.",
        )

    return build_workflow_graph(workflow, skills_map, get_mongo_client())


async def format_run_response(
    run_id: str,
    workflow: Workflow,
    graph,
    config: dict,
    override_status: WorkflowStatus = None,
) -> dict:
    state_snapshot = await graph.aget_state(config)
    is_paused = len(state_snapshot.next) > 0
    values = state_snapshot.values or {}
    has_error = bool(values.get("error"))

    if override_status is not None:
        status = override_status
    elif has_error:
        status = WorkflowStatus.ERROR
    else:
        status = WorkflowStatus.PAUSED if is_paused else WorkflowStatus.COMPLETED

    executed_nodes = values.get("executed_nodes", [])
    node_inputs_map = values.get("node_inputs", {})
    node_outputs_map = values.get("node_outputs", {})

    current_node_id = values.get("current_node_id")
    awaiting_approval_nodes: set[str] = set()
    if is_paused and current_node_id and not has_error:
        current_node = next((n for n in workflow.nodes if n.id == current_node_id), None)
        if current_node and getattr(current_node, "require_approval", False):
            awaiting_approval_nodes.add(current_node_id)

    node_runs = {}
    for node in workflow.nodes:
        if has_error and node.id == current_node_id:
            node_runs[node.id] = {
                "node_id": node.id,
                "status": NodeStatus.ERROR,
                "inputs": node_inputs_map.get(node.id),
                "outputs": node_outputs_map.get(node.id),
                "error": values.get("error")
            }
        elif override_status == WorkflowStatus.ERROR and node.id in awaiting_approval_nodes:
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
        "updated_at": now,
    }
