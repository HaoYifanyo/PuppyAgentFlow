import { useState, useCallback, useRef } from "react";
import { useNodesState, useEdgesState, MarkerType } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import type { WorkflowNode } from "../types/workflow";
import { extractId } from "../utils/id";

export const useWorkflowState = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState<string>(
    `Custom Flow ${new Date().toLocaleTimeString()}`
  );
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Node Editing State
  const [editingNode, setEditingNode] = useState<WorkflowNode | null>(null);

  const handleEditNodeClick = useCallback((nodeToEdit: WorkflowNode) => {
    setEditingNode(nodeToEdit);
  }, []);

  const handleSaveNodeConfig = useCallback(
    (nodeId: string, updatedData: Partial<WorkflowNode>, agentAvatarUrl?: string) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                node: { ...n.data.node, ...updatedData },
                agentAvatarUrl,
              },
            };
          }
          return n;
        })
      );
      setEditingNode(null);
    },
    [setNodes]
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      const nodeToDelete = nodes.find((n) => n.id === nodeId);
      if (nodeToDelete?.data?.node?.node_type === "start" || nodeToDelete?.data?.node?.is_start_node) {
        alert("The Start Node cannot be deleted.");
        return;
      }
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) =>
        eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
      );
      setEditingNode(null);
    },
    [nodes, setNodes, setEdges]
  );

  // Handle Load
  const handleLoadWorkflow = useCallback(
    (wf: any, handleResume: any) => {
      setWorkflowId(extractId(wf._id || wf.id));
      setWorkflowName(wf.name);

      const getReactFlowType = (n: any) => {
        const nodeType = n.node_type || (n.is_start_node ? "start" : "normal");
        if (nodeType === "start") return "startNode";
        if (nodeType === "condition") return "ifElseNode";
        return "puppyNode";
      };

      const getNodeData = (n: any) => {
        const nodeType = n.node_type || (n.is_start_node ? "start" : "normal");
        if (nodeType === "start") {
          return {
            label: n.name,
            node: { ...n, node_type: "start" },
            onEditClick: handleEditNodeClick,
            globalRunStatus: "idle",
          };
        }
        return {
          node: { ...n, node_type: nodeType },
          runData: undefined,
          onResume: nodeType === "condition" ? undefined : handleResume,
          onEditClick: handleEditNodeClick,
          globalRunStatus: "idle",
        };
      };

      const loadedNodes = wf.nodes.map((n: any, idx: number) => ({
        id: n.id,
        type: getReactFlowType(n),
        position: n.position || { x: 100 + idx * 300, y: 150 },
        data: getNodeData(n),
      }));

      const loadedEdges = wf.edges.map((e: any, idx: number) => {
        const conditionLabel = e.condition_label || null;
        return {
          id: `e-${idx}`,
          source: e.source,
          target: e.target,
          data_mapping: (e as any).data_mapping,
          data: { condition_label: conditionLabel },
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: conditionLabel === "true" ? { stroke: '#22c55e' } :
                 conditionLabel === "false" ? { stroke: '#ef4444' } : undefined,
          label: conditionLabel === "true" ? "True" :
                 conditionLabel === "false" ? "False" : undefined,
          labelStyle: conditionLabel ? { fill: conditionLabel === "true" ? '#22c55e' : '#ef4444', fontWeight: 700, fontSize: 10 } : undefined,
        };
      });

      setNodes(loadedNodes);
      setEdges(loadedEdges);
      setDashboardOpen(false);
    },
    [handleEditNodeClick, setNodes, setEdges]
  );

  return {
    nodes,
    setNodes,
    onNodesChange,
    edges,
    setEdges,
    onEdgesChange,
    workflowId,
    setWorkflowId,
    workflowName,
    setWorkflowName,
    dashboardOpen,
    setDashboardOpen,
    reactFlowWrapper,
    reactFlowInstance,
    setReactFlowInstance,
    editingNode,
    setEditingNode,
    handleEditNodeClick,
    handleSaveNodeConfig,
    handleDeleteNode,
    handleLoadWorkflow,
  };
};
