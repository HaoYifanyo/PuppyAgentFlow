from beanie import before_event
import logging
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.mongodb import MongoDBSaver
from langgraph.types import Send
from pymongo import MongoClient
import os

from app.core.state import WorkflowState
from app.services.llm_executor import execute_llm_node, execute_tool_node

logger = logging.getLogger(__name__)


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


def _find_list_in_context(context: dict):
    """
    Find the first list value in context. Returns the list or None.
    Also tries to parse string values as lists (JSON format, newline, or comma separated).
    """
    import json
    
    for key, value in context.items():
        if isinstance(value, list) and len(value) > 0:
            return value
    
    # If no list found, try to parse string values
    for key, value in context.items():
        if isinstance(value, str) and value.strip():
            # Try JSON parsing first
            try:
                parsed = json.loads(value)
                if isinstance(parsed, list) and len(parsed) > 0:
                    return parsed
            except (json.JSONDecodeError, TypeError):
                pass
            
            # Try splitting by newline first, then comma
            newline_items = [item.strip() for item in value.split('\n') if item.strip()]
            comma_items = [item.strip() for item in value.split(',') if item.strip()]
            
            # Use the split method that produces more items (if both produce results)
            if len(newline_items) >= len(comma_items) and newline_items:
                return newline_items
            elif comma_items:
                return comma_items
    return None


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
                "executed_nodes": [node_model.id],
                "current_node_id": node_model.id,
                "node_inputs": {node_model.id: node_inputs},
                "node_outputs": {node_model.id: {"error": str(e)}},
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


def make_batch_reader(node_model, skill_model):
    """
    Creates a batch reader node that passes through context for fan-out.
    Does not execute the skill - just prepares for batch processing.
    """
    async def reader(state: WorkflowState) -> dict:
        current_context = state.get("context", {})
        items = _find_list_in_context(current_context)
        logger.info(f"Batch reader '{node_model.name}': found {len(items) if items else 0} items")
        
        return {
            "context": current_context,
            "executed_nodes": [node_model.id],
            "current_node_id": node_model.id,
            "node_outputs": {node_model.id: {"items_count": len(items) if items else 0}},
        }
    
    return reader


def make_batch_worker(node_model, skill_model):
    """
    Creates a batch worker node that processes a single item.
    Receives state with __batch_item__ and __batch_index__.
    """
    async def worker(state: WorkflowState) -> dict:
        item = state.get("__batch_item__")
        index = state.get("__batch_index__", 0)
        
        logger.debug(f"Batch worker '{node_model.name}' [{index}]: processing item")

        # Build inputs using skill's input_schema
        input_schema = getattr(skill_model, 'input_schema', {}) or {}
        if input_schema:
            # Use the first key from input_schema as the parameter name
            first_key = next(iter(input_schema.keys()))
            node_inputs = {first_key: item}
        else:
            node_inputs = {"input": item}

        worker_id = f"{node_model.id}__worker"
        try:
            if skill_model.type == "llm":
                output = await execute_llm_node(node_model, node_inputs, skill_model)
            else:
                output = await execute_tool_node(node_model, node_inputs, skill_model)
        except Exception as e:
            return {
                "executed_nodes": [worker_id],
                "current_node_id": worker_id,
                "batch_collector": [{"index": index, "item": item, "error": str(e)}],
            }

        result = output if isinstance(output, dict) else {"result": output}
        return {
            "executed_nodes": [worker_id],
            "current_node_id": worker_id,
            "batch_collector": [{"index": index, "item": item, "output": result}],
        }
    
    return worker


def make_batch_aggregator(node_model):
    """
    Creates a batch aggregator node that collects all worker results.
    """
    def aggregator(state: WorkflowState) -> dict:
        results = state.get("batch_collector", [])
        # Sort by index to maintain order
        sorted_results = sorted(results, key=lambda x: x.get("index", 0))
        
        logger.info(f"Batch aggregator '{node_model.name}': collected {len(sorted_results)} results")

        # Build inputs from batch items
        batch_inputs = [r.get("item") for r in sorted_results]
        
        return {
            "context": {"results": sorted_results},
            "executed_nodes": [node_model.id],
            "current_node_id": node_model.id,
            "node_inputs": {node_model.id: {"items": batch_inputs}},
            "node_outputs": {node_model.id: {"results": sorted_results}},
        }
    
    return aggregator


def _add_batch_fan_out_edges(builder, edges, batch_node_ids, batch_nodes_with_targets):
    """Add conditional edges for batch fan-out from upstream nodes to batch workers."""
    for edge in edges:
        if edge.target in batch_node_ids:
            builder.add_edge(edge.source, edge.target)
            builder.add_conditional_edges(edge.target, make_batch_fan_out(edge.target))
            batch_nodes_with_targets.add(edge.target)


def _add_batch_to_target_edges(builder, edges, batch_node_ids, batch_nodes_with_targets):
    """Add edges from batch aggregators to downstream nodes."""
    for edge in edges:
        if edge.source in batch_node_ids:
            builder.add_edge(f"{edge.source}__aggregator", edge.target)
            batch_nodes_with_targets.add(edge.source)


def _add_terminal_batch_edges(builder, batch_node_ids, batch_nodes_with_targets):
    """Add END edges for batch nodes without outgoing connections."""
    for batch_id in batch_node_ids:
        if batch_id not in batch_nodes_with_targets:
            builder.add_edge(f"{batch_id}__aggregator", END)


def _setup_batch_nodes(builder, node, skill, approval_nodes, batch_node_ids):
    """Setup a batch node with its reader, worker, and aggregator components."""
    batch_node_ids.add(node.id)
    builder.add_node(node.id, make_batch_reader(node, skill))
    builder.add_node(f"{node.id}__worker", make_batch_worker(node, skill))
    builder.add_node(f"{node.id}__aggregator", make_batch_aggregator(node))
    
    # Add edge from worker to aggregator
    builder.add_edge(f"{node.id}__worker", f"{node.id}__aggregator")
    
    # For batch nodes, approval should be on aggregator, not reader
    if getattr(node, 'require_approval', False):
        approval_nodes.append(f"{node.id}__aggregator")


def make_batch_fan_out(src_id):
    """Create a fan-out function that distributes items to batch workers."""
    def fan_out(state):
        context = state.get("context", {})
        items = _find_list_in_context(context)
        
        if not items:
            logger.debug(f"Batch fan-out '{src_id}': no list found, treating context as single item")
            items = [context]
        
        logger.info(f"Batch fan-out '{src_id}': dispatching {len(items)} worker(s)")
        sends = [Send(f"{src_id}__worker", {"__batch_item__": item, "__batch_index__": i}) 
                for i, item in enumerate(items)]
        return sends
    return fan_out


def _add_regular_node(builder, node, skill, approval_nodes):
    """Add a regular (non-batch) node to the graph."""
    builder.add_node(node.id, make_langgraph_node(node, skill))
    if getattr(node, 'require_approval', False):
        approval_nodes.append(node.id)


def _add_approval_passthrough_nodes(builder, workflow_model, approval_nodes):
    """Add dummy passthrough nodes for approval nodes that have no outgoing edges."""
    nodes_with_outgoing = {edge.source for edge in workflow_model.edges}
    for node in workflow_model.nodes:
        if node.id in approval_nodes and node.id not in nodes_with_outgoing:
            dummy_id = f"__passthrough_{node.id}"
            builder.add_node(dummy_id, lambda state: {})
            builder.add_edge(node.id, dummy_id)
            builder.add_edge(dummy_id, END)


def build_workflow_graph(workflow_model, skills_map, mongo_client: MongoClient):
    """Builds and compiles a LangGraph StateGraph from a Workflow model.
    
    skills_map: Dict[str, Skill] mapping skill_id to Skill object.
    """
    builder = StateGraph(WorkflowState)

    # Configure MongoDBSaver using standard pymongo client
    db_name = os.getenv("MONGO_DB_NAME", "puppy_agent_flow")
    saver = MongoDBSaver(mongo_client, db_name=db_name)

    approval_nodes = []
    batch_node_ids = set()

    # Add all nodes (start, batch, regular)
    def make_start_executor(nid):
        def start_executor(state):
            return {"executed_nodes": [nid], "current_node_id": nid}
        return start_executor

    for node in workflow_model.nodes:
        if getattr(node, 'is_start_node', False):
            builder.add_node(node.id, make_start_executor(node.id))
            continue

        skill = skills_map.get(node.skill_id)
        if not skill:
            raise ValueError(f"Skill {node.skill_id} not found in skills_map")

        if getattr(node, 'batch_mode', False):
            _setup_batch_nodes(builder, node, skill, approval_nodes, batch_node_ids)
        else:
            _add_regular_node(builder, node, skill, approval_nodes)

    # Add START edge
    start_node = next((n for n in workflow_model.nodes if n.is_start_node), None)
    if start_node:
        builder.add_edge(START, start_node.id)

    # Add all edges (regular and batch-specific)
    batch_nodes_with_targets = set()
    for edge in workflow_model.edges:
        if edge.target in batch_node_ids:
            _add_batch_fan_out_edges(builder, [edge], batch_node_ids, batch_nodes_with_targets)
        elif edge.source in batch_node_ids:
            _add_batch_to_target_edges(builder, [edge], batch_node_ids, batch_nodes_with_targets)
        else:
            builder.add_edge(edge.source, edge.target)

    _add_terminal_batch_edges(builder, batch_node_ids, batch_nodes_with_targets)

    # TODO CHECK: LangGraph limitation: interrupt_after does not fire on nodes that implicitly transition to END. 
    # insert adummy pass-through node so the interrupt can fire before reaching __end__.
    _add_approval_passthrough_nodes(builder, workflow_model, approval_nodes)

    # Compile
    graph = builder.compile(
        checkpointer=saver,
        interrupt_after=approval_nodes
    )

    return graph
