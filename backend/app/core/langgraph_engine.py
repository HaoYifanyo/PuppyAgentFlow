from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.mongodb import MongoDBSaver
from pymongo import MongoClient
import os

from app.core.state import WorkflowState
from app.services.llm_executor import execute_llm_node, execute_tool_node

def build_workflow_graph(workflow_model, skills_map, mongo_client: MongoClient):
    """
    Builds and compiles a LangGraph StateGraph from a Workflow model.
    skills_map: Dict[str, Skill] mapping skill_id to Skill object.
    """
    builder = StateGraph(WorkflowState)

    # Configure MongoDBSaver using standard pymongo client
    db_name = os.getenv("MONGO_DB_NAME", "puppy_agent_flow")
    saver = MongoDBSaver(mongo_client, db_name=db_name)

    approval_nodes = []

    # Add Nodes
    def make_start_executor(nid):
        def start_executor(state):
            return {"executed_nodes": [nid]}
        return start_executor

    for node in workflow_model.nodes:
        if getattr(node, 'is_start_node', False):
            # Start node is a pass-through, no skill needed
            builder.add_node(node.id, make_start_executor(node.id))
            continue

        skill = skills_map.get(node.skill_id)
        if not skill:
            raise ValueError(f"Skill {node.skill_id} not found in skills_map")

        builder.add_node(node.id, make_langgraph_node(node, skill))

        if getattr(node, 'require_approval', False):
            approval_nodes.append(node.id)

    # Add the edge from "START" to first node
    start_node = next((n for n in workflow_model.nodes if n.is_start_node), None)
    if start_node:
        builder.add_edge(START, start_node.id)

    # Add explicit edges
    for edge in workflow_model.edges:
        builder.add_edge(edge.source, edge.target)

    # Compile
    graph = builder.compile(
        checkpointer=saver,
        interrupt_after=approval_nodes
    )

    return graph

def _build_node_inputs(context: dict, skill_model) -> dict:
    """
    Build inputs for a node execution by mapping context keys to the skill's input_schema.

    Strategy:
    - Always include all context keys so skills can access the full accumulated state.
    - For schema keys not present in context, try positional mapping from context keys
      that are not already covered by the schema. This handles the common case where
      a Start Node provides a value under one key (e.g. 'manual_input_text') and the
      downstream skill expects a different key (e.g. 'query').
    """
    inputs = dict(context)

    input_schema: dict = getattr(skill_model, "input_schema", {}) or {}
    if not input_schema:
        return inputs

    unmatched_schema_keys = [k for k in input_schema if k not in context]
    unmatched_context_values = [v for k, v in context.items() if k not in input_schema]

    for i, schema_key in enumerate(unmatched_schema_keys):
        if i < len(unmatched_context_values):
            inputs[schema_key] = unmatched_context_values[i]

    return inputs


def make_langgraph_node(node_model, skill_model):
    """
    Creates an async LangGraph compatible node executor function.
    """
    async def executor(state: WorkflowState) -> dict:
        print(f"Executing node: {node_model.name} ({node_model.id})")
        current_context = state.get("context", {})

        # Map context keys to skill's expected input_schema keys
        node_inputs = _build_node_inputs(current_context, skill_model)

        try:
            if skill_model.type == "llm":
                output = await execute_llm_node(node_model, node_inputs, skill_model)
            else:
                output = await execute_tool_node(node_model, node_inputs, skill_model)
        except Exception as e:
            return {
                "error": str(e),
                "executed_nodes": [node_model.id]
            }

        context_update = output if isinstance(output, dict) else {"result": output}

        return {
            "context": context_update,
            "executed_nodes": [node_model.id],
            "node_inputs": {node_model.id: node_inputs},
            "node_outputs": {node_model.id: context_update},
        }
    return executor