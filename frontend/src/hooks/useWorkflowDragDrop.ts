import { useCallback } from "react";
import type { Node, Edge, MarkerType } from "@xyflow/react";

export const useWorkflowDragDrop = (
  nodes: Node[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>,
  reactFlowInstance: any,
  handleEditNodeClick: any,
  handleResume: any
) => {
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowInstance) return;

      const type = event.dataTransfer.getData("application/reactflow/skill");
      if (typeof type === "undefined" || !type) {
        return;
      }

      const skillData = JSON.parse(type);
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = `node_${Date.now()}`;

      const isStartNode =
        skillData.type === "system" &&
        skillData.implementation === "start-node";

      if (isStartNode) {
        // Enforce single start node
        if (nodes.some((n) => n.data?.node?.is_start_node)) {
          alert("A workflow can only have one Start Node.");
          return;
        }
      }

      const newNode = {
        id: newNodeId,
        type: isStartNode ? "startNode" : "puppyNode",
        position,
        data: isStartNode
          ? {
              label: "Start",
              node: {
                id: newNodeId,
                name: "Start",
                skill_id: "start-node",
                require_approval: false,
                is_start_node: true,
                config: { trigger_type: "manual", manual_input_text: "" },
              },
              onEditClick: handleEditNodeClick,
              globalRunStatus: "idle",
            }
          : {
              node: {
                id: newNodeId,
                name: skillData.name,
                skill_id: skillData._id || skillData.id,
                require_approval: true, // Default require approval for manual nodes
                input_schema: skillData.input_schema,
                output_schema: skillData.output_schema,
              },
              runData: undefined,
              onResume: handleResume,
              onEditClick: handleEditNodeClick,
              globalRunStatus: "idle",
            },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, handleResume, setNodes, nodes, handleEditNodeClick]
  );

  const onConnect = useCallback(
    (params: any) => {
      // Demo version: Simplify UX by passing all outputs to inputs automatically.
      // No data mapping configuration needed.
      const newEdgeId = `e-${params.source}-${params.target}`;
      const newEdge = {
        ...params,
        id: newEdgeId,
        data_mapping: { "*": "*" }, // Special marker to pass entire output as input
        markerEnd: { type: MarkerType.ArrowClosed },
      };

      setEdges((eds) => eds.concat(newEdge));
    },
    [setEdges]
  );

  return { onDragOver, onDrop, onConnect };
};
