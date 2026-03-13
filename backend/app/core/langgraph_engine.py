from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.mongodb import MongoDBSaver
from pymongo import MongoClient
import os

from app.core.state import WorkflowState
from app.services.llm_executor import make_langgraph_node

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
