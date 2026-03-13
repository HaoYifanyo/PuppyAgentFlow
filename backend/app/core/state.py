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
    # Optional error message tracking
    error: str
