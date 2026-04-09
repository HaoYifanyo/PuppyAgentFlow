import { useCallback } from "react";
import { MarkerType } from "@xyflow/react";
import type { Node as RFNode, Edge } from "@xyflow/react";
type Node = RFNode<any>;
import { extractId } from "../utils/id";

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
      const offsetX = parseFloat(event.dataTransfer.getData('application/reactflow/offset-x') || '0');
      const offsetY = parseFloat(event.dataTransfer.getData('application/reactflow/offset-y') || '0');
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - offsetX,
        y: event.clientY - offsetY,
      });

      const newNodeId = `node_${Date.now()}`;

      const isStartNode =
        skillData.type === "system" &&
        skillData.implementation === "start-node";

      const isConditionNode =
        skillData.type === "system" &&
        skillData.implementation === "condition-node";

      if (isStartNode) {
        if (nodes.some((n) => n.data?.node?.node_type === "start" || n.data?.node?.is_start_node)) {
          alert("A workflow can only have one Start Node.");
          return;
        }
      }

      let newNode;

      if (isStartNode) {
        newNode = {
          id: newNodeId,
          type: "startNode",
          position,
          data: {
            label: "Start",
            node: {
              id: newNodeId,
              name: "Start",
              node_type: "start",
              skill_id: null,
              require_approval: false,
              is_start_node: true,
              config: { trigger_type: "manual", manual_input_text: "" },
            },
            onEditClick: handleEditNodeClick,
            globalRunStatus: "idle",
          },
        };
      } else if (isConditionNode) {
        newNode = {
          id: newNodeId,
          type: "ifElseNode",
          position,
          data: {
            node: {
              id: newNodeId,
              name: "Condition",
              node_type: "condition",
              skill_id: null,
              require_approval: false,
              config: { condition_field: "result" },
            },
            runData: undefined,
            onEditClick: handleEditNodeClick,
            globalRunStatus: "idle",
          },
        };
      } else {
        newNode = {
          id: newNodeId,
          type: "puppyNode",
          position,
          data: {
            node: {
              id: newNodeId,
              name: skillData.name,
              node_type: "normal",
              skill_id: extractId(skillData._id || skillData.id),
              require_approval: true,
              input_schema: skillData.input_schema,
              output_schema: skillData.output_schema,
            },
            runData: undefined,
            onResume: handleResume,
            onEditClick: handleEditNodeClick,
            globalRunStatus: "idle",
          },
        };
      }

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, handleResume, setNodes, nodes, handleEditNodeClick]
  );

  const onConnect = useCallback(
    (params: any) => {
      const newEdgeId = `e-${params.source}-${params.target}`;

      let conditionLabel: string | null = null;
      if (params.sourceHandle === "handle-true") {
        conditionLabel = "true";
      } else if (params.sourceHandle === "handle-false") {
        conditionLabel = "false";
      }

      const newEdge = {
        ...params,
        id: newEdgeId,
        data_mapping: { "*": "*" },
        data: { condition_label: conditionLabel },
        markerEnd: { type: MarkerType.ArrowClosed },
        style: conditionLabel === "true" ? { stroke: '#22c55e' } :
               conditionLabel === "false" ? { stroke: '#ef4444' } : undefined,
        label: conditionLabel === "true" ? "True" :
               conditionLabel === "false" ? "False" : undefined,
        labelStyle: conditionLabel ? { fill: conditionLabel === "true" ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: 10 } : undefined,
      };

      setEdges((eds) => eds.concat(newEdge));
    },
    [setEdges]
  );

  return { onDragOver, onDrop, onConnect };
};
