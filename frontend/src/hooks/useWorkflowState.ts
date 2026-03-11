import { useState, useCallback, useRef } from "react";
import { useNodesState, useEdgesState, MarkerType } from "@xyflow/react";
import type { Edge } from "@xyflow/react";
import type { WorkflowNode } from "../types/workflow";

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
    (nodeId: string, updatedData: Partial<WorkflowNode>) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return {
              ...n,
              data: {
                ...n.data,
                node: { ...n.data.node, ...updatedData },
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
      if (nodeToDelete?.data?.node?.is_start_node) {
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
      setWorkflowId(wf._id || wf.id);
      setWorkflowName(wf.name);

      const loadedNodes = wf.nodes.map((n: any, idx: number) => ({
        id: n.id,
        type: n.is_start_node ? "startNode" : "puppyNode",
        position: n.position || { x: 100 + idx * 300, y: 150 }, // Use saved position or default to simple layout
        data: n.is_start_node
          ? {
              label: n.name,
              node: n,
              onEditClick: handleEditNodeClick,
              globalRunStatus: "idle",
            }
          : {
              node: n,
              runData: undefined,
              onResume: handleResume,
              onEditClick: handleEditNodeClick,
              globalRunStatus: "idle",
            },
      }));

      const loadedEdges = wf.edges.map((e: any, idx: number) => ({
        id: `e-${idx}`,
        source: e.source,
        target: e.target,
        data_mapping: (e as any).data_mapping,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed },
      }));

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
