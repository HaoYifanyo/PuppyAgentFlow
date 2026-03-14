from typing import TypedDict, Any
from typing_extensions import Annotated
import operator

def merge_dicts(a: dict, b: dict) -> dict:
    if not isinstance(a, dict):
        a = {}
    if not isinstance(b, dict):
        b = {}
    return {**a, **b}

class WorkflowState(TypedDict):
    # Shared dictionary context merged using the custom reducer
    context: Annotated[dict[str, Any], merge_dicts]
    # List of node IDs executed, appending using operator.add
    executed_nodes: Annotated[list[str], operator.add]
    # Per-node inputs snapshot: {node_id: {key: value}}
    node_inputs: Annotated[dict[str, Any], merge_dicts]
    # Per-node outputs snapshot: {node_id: {key: value}}
    node_outputs: Annotated[dict[str, Any], merge_dicts]
    # The node ID that ran in the current step (non-accumulating, used for history query)
    current_node_id: str
    # Optional error message tracking
    error: str
