from typing import List, Dict, Any
from app.models.workflow import WorkflowRun, WorkflowStatus, NodeStatus, Node, Edge, NodeRun, Skill

class WorkflowEngine:
    def __init__(self, executor_callback=None):
        # executor_callback responsible for executing node logic (taking node, inputs, and skill as inputs, returning outputs)
        self.executor_callback = executor_callback

    def initialize_run(self, workflow) -> WorkflowRun:
        run = WorkflowRun(
            workflow_id=str(workflow.id) if workflow.id else "temp",
            workflow=workflow,
            node_runs={node.id: NodeRun(node_id=node.id) for node in workflow.nodes}
        )

        # Seed global_context from Start Node
        start_node = next((n for n in workflow.nodes if n.is_start_node), None)
        if start_node:
            manual_text = start_node.config.get("manual_input_text", "")
            # We store the manual text in a standard key that downstream nodes can map from
            start_outputs = {"manual_input_text": manual_text}
            run.global_context[start_node.id] = start_outputs
            # Mark start node as completed immediately
            run.node_runs[start_node.id].status = NodeStatus.COMPLETED
            run.node_runs[start_node.id].outputs = start_outputs

        return run

    def run(self, run: WorkflowRun, skills_map: Dict[str, Skill] = None) -> WorkflowStatus:
        """
        Core Execution Loop (Flow Based on Topological Sorting)
        """
        if skills_map is None:
            skills_map = {}
            
        if run.status in [WorkflowStatus.PAUSED, WorkflowStatus.COMPLETED, WorkflowStatus.ERROR]:
            return run.status

        run.status = WorkflowStatus.RUNNING

        while run.status == WorkflowStatus.RUNNING:
            executable_nodes = self._get_executable_nodes(run)

            if not executable_nodes:
                if all(nr.status == NodeStatus.COMPLETED for nr in run.node_runs.values()):
                    run.status = WorkflowStatus.COMPLETED
                break

            for node in executable_nodes:
                node_run = run.node_runs[node.id]

                # 1. Data Mapping 
                try:
                    current_inputs = dict(node_run.inputs) if node_run.inputs else {}
                    skill = skills_map.get(node.skill_id)
                    mapped_inputs = self._map_inputs(node, run.workflow.edges, run.global_context, skill)
                    current_inputs.update(mapped_inputs)
                    node_run.inputs = current_inputs
                except Exception as e:
                    node_run.status = NodeStatus.ERROR
                    node_run.error_msg = f"Data mapping failed: {str(e)}"
                    run.status = WorkflowStatus.ERROR
                    return run.status

                node_run.status = NodeStatus.RUNNING

                # 2. Execution (LLM or Tool)
                try:
                    skill = skills_map.get(node.skill_id)
                    outputs = self._execute_node(node, node_run.inputs, skill)
                    node_run.outputs = outputs
                except Exception as e:
                    node_run.status = NodeStatus.ERROR
                    node_run.error_msg = f"Execution failed: {str(e)}"
                    run.status = WorkflowStatus.ERROR
                    return run.status

                # 3. Handle Human-in-the-Loop 
                if node.require_approval:
                    node_run.status = NodeStatus.PAUSED
                    run.status = WorkflowStatus.PAUSED
                    return run.status
                else:
                    node_run.status = NodeStatus.COMPLETED
                    run.global_context[node.id] = outputs

        return run.status

    def resume(self, run: WorkflowRun, node_id: str, action: str, modified_outputs: Any = None, skills_map: Dict[str, Skill] = None) -> WorkflowStatus:
        """
        Resume Paused Workflows
        """
        if run.status != WorkflowStatus.PAUSED:
            raise ValueError("Workflow is not paused")

        node_run = run.node_runs.get(node_id)
        if not node_run or node_run.status != NodeStatus.PAUSED:
            raise ValueError(f"Node {node_id} is not paused")

        if action == 'edit':
            node_run.outputs = modified_outputs
            node_run.status = NodeStatus.COMPLETED
            run.global_context[node_id] = modified_outputs
            run.status = WorkflowStatus.RUNNING
            return self.run(run, skills_map)

        elif action == 'approve':
            node_run.status = NodeStatus.COMPLETED
            run.global_context[node_id] = node_run.outputs
            run.status = WorkflowStatus.RUNNING
            return self.run(run, skills_map)

        elif action == 'reject':
            node_run.status = NodeStatus.PENDING
            node_run.outputs = None
            run.status = WorkflowStatus.RUNNING
            return self.run(run, skills_map)

        else:
            raise ValueError(f"Unknown action: {action}")

    def _get_executable_nodes(self, run: WorkflowRun) -> List[Node]:
        executable = []
        for node in run.workflow.nodes:
            node_run = run.node_runs[node.id]
            if node_run.status == NodeStatus.PENDING:
                incoming_edges = [e for e in run.workflow.edges if e.target == node.id]
                deps_met = True
                for edge in incoming_edges:
                    source_run = run.node_runs.get(edge.source)
                    if not source_run or source_run.status != NodeStatus.COMPLETED:
                        deps_met = False
                        break

                if deps_met:
                    executable.append(node)
        return executable

    def _map_inputs(self, node: Node, edges: List[Edge], global_context: Dict[str, Any], skill: Skill = None) -> Dict[str, Any]:
        inputs = {}
        incoming_edges = [e for e in edges if e.target == node.id]
        for edge in incoming_edges:
            source_outputs = global_context.get(edge.source, {})
            if not isinstance(source_outputs, dict):
                if not edge.data_mapping:
                    inputs['data'] = source_outputs
                continue

            # Check if this edge uses auto-mapping (* or empty)
            is_auto_map = not edge.data_mapping or edge.data_mapping.get("*") == "*"

            if edge.data_mapping and edge.data_mapping.get("*") == "*":
                inputs.update(source_outputs)

            # Specific mappings
            for target_key, source_key in edge.data_mapping.items():
                if target_key == "*":
                    continue
                if source_key in source_outputs:
                    inputs[target_key] = source_outputs[source_key]

            # Logic for "Users don't care about formats":
            # If auto-mapping is enabled and target skill expects exactly ONE input,
            # and that input hasn't been filled yet, pick the first value from source outputs.
            if is_auto_map and skill and skill.input_schema:
                input_keys = list(skill.input_schema.keys())
                if len(input_keys) == 1:
                    target_key = input_keys[0]
                    if target_key not in inputs and source_outputs:
                        # Grab the first available value from source dictionary
                        first_val = next(iter(source_outputs.values()))
                        inputs[target_key] = first_val

                        # Clean up redundant keys from auto-mapping that aren't in the schema
                        # to keep the UI inputs clean.
                        keys_to_remove = [k for k in inputs.keys() if k not in skill.input_schema]
                        for k in keys_to_remove:
                            del inputs[k]

        return inputs

    def _execute_node(self, node: Node, inputs: Dict[str, Any], skill: Skill = None) -> Any:
        # Merge Logic: Skill Defaults < Node Config < Runtime Inputs
        merged_config = {}
        if skill and isinstance(skill.implementation, dict):
            merged_config.update(skill.implementation.get("config", {}))

        if node.config:
            merged_config.update(node.config)

        # attach the merged_config to the node object temporarily
        # so the executor callback can read it.
        original_node_config = node.config.copy()
        node.config = merged_config

        try:
            if self.executor_callback:
                return self.executor_callback(node, inputs, skill)
            return {"mocked_output": f"Result for {node.name}"}
        finally:
            # Restore original config
            node.config = original_node_config
