from beanie import before_event
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
            return {"executed_nodes": [nid], "current_node_id": nid}
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

    # TODO CHECK: LangGraph limitation: interrupt_after does not fire on nodes that implicitlytransition to END. 
    # insert adummy pass-through node so the interrupt can fire before reaching __end__.
    nodes_with_outgoing = {edge.source for edge in workflow_model.edges}
    for node in workflow_model.nodes:
        if node.id in approval_nodes and node.id not in nodes_with_outgoing:
            dummy_id = f"__passthrough_{node.id}"
            builder.add_node(dummy_id, lambda state: {})
            builder.add_edge(node.id, dummy_id)
            builder.add_edge(dummy_id, END)

    # Compile
    graph = builder.compile(
        checkpointer=saver,
        interrupt_after=approval_nodes
    )

    return graph

def _build_node_inputs(context: dict, skill_model) -> dict:
    """
    Map the current context (previous node's output) to this skill's input_schema keys.
    For unmatched schema keys, try positional mapping from unmatched context values.
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

        node_inputs = _build_node_inputs(state.get("context", {}), skill_model)

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
            "current_node_id": node_model.id,
            "node_inputs": {node_model.id: node_inputs},
            "node_outputs": {node_model.id: context_update},
        }
    return executor