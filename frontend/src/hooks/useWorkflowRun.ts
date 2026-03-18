import { useState, useRef, useCallback, useEffect } from "react";
import axios from "axios";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowRunData } from "../types/workflow";
import { saveWorkflowApi } from "../utils/workflowActions";

export const useWorkflowRun = (
  workflowId: string | null,
  setWorkflowId: (id: string | null) => void,
  workflowName: string,
  setWorkflowName: (name: string) => void,
  nodes: Node[],
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>,
  edges: Edge[],
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>
) => {
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string>("idle");
  const [isPolling, setIsPolling] = useState(false);
  const pollingRef = useRef<number | null>(null);

  const [error, setError] = useState<string | null>(null);
  const isResumingRef = useRef(false);

  const [runConfigOpen, setRunConfigOpen] = useState(false);
  const [rootNodeData, setRootNodeData] = useState<{
    id: string;
    name: string;
    input_schema?: Record<string, any>;
  } | null>(null);

  const saveWorkflow = useCallback(
    async (showAlert = true) => {
      const res = await saveWorkflowApi(
        workflowId,
        workflowName,
        nodes,
        edges,
        showAlert
      );
      if (res && !workflowId) {
        setWorkflowId(res._id || res.id);
        setWorkflowName(res.name);
      }
      return res;
    },
    [workflowId, workflowName, nodes, edges, setWorkflowId, setWorkflowName]
  );

  // Update visual state of nodes based on Run data
  const updateNodeStates = useCallback(
    (runData: WorkflowRunData) => {
      setNodes((nds) =>
        nds.map((n) => {
          const nr = runData.node_runs[n.id];
          if (nr) {
            return {
              ...n,
              data: {
                ...n.data,
                runData: nr,
                globalRunStatus: runData.status,
              },
            };
          }
          return { ...n, data: { ...n.data, globalRunStatus: runData.status } };
        })
      );

      // Animate edges connecting to running nodes
      setEdges((eds) =>
        eds.map((e) => {
          const targetRun = runData.node_runs[e.target];
          return {
            ...e,
            animated:
              targetRun?.status === "running" ||
              (targetRun?.status === "pending" && runData.status === "running"),
          };
        })
      );
    },
    [setNodes, setEdges]
  );

  // Execute Run
  const executeRun = useCallback(
    async (initialInputs: Record<string, any>) => {
      setRunConfigOpen(false);

      try {
        // 1. Ensure workflow is saved
        let currentWfId = workflowId;
        if (!currentWfId) {
          const savedWf = await saveWorkflow(false);
          if (!savedWf) return;
          currentWfId = savedWf._id || savedWf.id;
        } else {
          await saveWorkflow(false); // Auto-save existing
        }

        setRunStatus("running");
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, globalRunStatus: "running" },
          }))
        );

        // 2. Start the run with user provided inputs
        const res = await axios.post(
          `/api/workflows/${currentWfId}/run`,
          initialInputs
        );

        const run = res.data;
        const rid = run._id || run.id;
        setRunId(rid);
        setRunStatus(run.status);
        updateNodeStates(run);
        setIsPolling(true);
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.detail ?? "Failed to start run.");
        setRunStatus("error");
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, globalRunStatus: "error" },
          }))
        );
      }
    },
    [workflowId, saveWorkflow, updateNodeStates, setNodes]
  );

  // Handle Human Intervention (Resume)
  const handleResume = useCallback(
    async (nodeId: string, action: string, modifiedOutputs?: any) => {
      if (!runId) return;
      isResumingRef.current = true;
      try {
        // Optimistic UI update
        setRunStatus("running");
        setIsPolling(false); // pause polling while resuming
        setNodes((nds) =>
          nds.map((n) => {
            if (n.id === nodeId) {
              const newStatus = action === "reject" ? "pending" : "completed";
              return {
                ...n,
                data: {
                  ...n.data,
                  globalRunStatus: "running",
                  runData: { ...n.data.runData, status: newStatus },
                },
              };
            }
            return { ...n, data: { ...n.data, globalRunStatus: "running" } };
          })
        );

        const res = await axios.post(
          `/api/runs/${runId}/resume?workflow_id=${workflowId}`,
          {
            action,
            modified_outputs: modifiedOutputs,
          }
        );
        const updatedRun = res.data;
        setRunStatus(updatedRun.status);
        updateNodeStates(updatedRun);
        setIsPolling(true); // resume polling
      } catch (err: any) {
        console.error(err);
        setError(err.response?.data?.detail ?? err.message ?? "Resume failed.");
        setRunStatus("error");
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, globalRunStatus: "error" },
          }))
        );
      } finally {
        isResumingRef.current = false;
      }
    },
    [runId, workflowId, setNodes, updateNodeStates]
  );

  // Polling loop
  const pollRunStatus = useCallback(async () => {
    if (!runId || !workflowId) return;
    try {
      const res = await axios.get(`/api/runs/${runId}?workflow_id=${workflowId}`);
      if (isResumingRef.current) return; // Prevent overwriting optimistic state during resume

      const currentRun = res.data;
      setRunStatus(currentRun.status);
      updateNodeStates(currentRun);

      if (["completed", "paused", "error"].includes(currentRun.status)) {
        setIsPolling(false);
      }
    } catch (e) {
      console.error("Polling error", e);
      setIsPolling(false);
    }
  }, [runId, workflowId, updateNodeStates]);

  useEffect(() => {
    if (isPolling && runId && ["running", "pending"].includes(runStatus)) {
      pollingRef.current = window.setInterval(
        pollRunStatus,
        1000
      ) as unknown as number;
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isPolling, runId, runStatus, pollRunStatus]);

  // Prepare Run
  const prepareRun = useCallback(() => {
    if (nodes.length === 0) {
      setError("Please add at least one node to the canvas.");
      return;
    }

    const startNode = nodes.find((n) => n.data?.node?.is_start_node);

    if (!startNode) {
      setError("Workflow is missing a Start Node.");
      return;
    }

    const startConfig = startNode.data.node.config || {};
    const manualText = startConfig.manual_input_text || "";

    if (!manualText.trim()) {
      setRootNodeData({
        id: startNode.id,
        name: startNode.data.node.name,
        input_schema: { manual_input_text: "string" },
      });
      setRunConfigOpen(true);
    } else {
      executeRun({});
    }
  }, [nodes, executeRun]);

  return {
    runId,
    setRunId,
    runStatus,
    setRunStatus,
    isPolling,
    setIsPolling,
    runConfigOpen,
    setRunConfigOpen,
    rootNodeData,
    setRootNodeData,
    executeRun,
    handleResume,
    prepareRun,
    saveWorkflow,
    error,
    setError,
  };
};
