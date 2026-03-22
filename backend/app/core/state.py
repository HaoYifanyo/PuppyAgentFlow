from typing import TypedDict, Any
from typing_extensions import Annotated
import operator

def merge_dicts(a: dict, b: dict) -> dict:
    if not isinstance(a, dict):
        a = {}
    if not isinstance(b, dict):
        b = {}
    return {**a, **b}

def keep_last(a: str, b: str) -> str:
    """Keep the last value (used for current_node_id in parallel execution)."""
    return b if b else a

class WorkflowState(TypedDict):
    # Each node's output fully replaces this field (no accumulation).
    # Downstream nodes only see the direct predecessor's output, keeping data flow clean.
    context: dict[str, Any]
    # List of node IDs executed, appending using operator.add
    executed_nodes: Annotated[list[str], operator.add]
    # Per-node inputs snapshot: {node_id: {key: value}}
    node_inputs: Annotated[dict[str, Any], merge_dicts]
    # Per-node outputs snapshot: {node_id: {key: value}}
    node_outputs: Annotated[dict[str, Any], merge_dicts]
    # The node ID that ran in the current step (keep last value for parallel execution)
    current_node_id: Annotated[str, keep_last]
    # Optional error message tracking
    error: str
    # Batch execution: collector for parallel worker results (reducer appends)
    batch_collector: Annotated[list[dict[str, Any]], operator.add]
