import { useState, useRef, useCallback, useEffect } from "react";
import axios from "axios";
import type { Node as RFNode, Edge } from "@xyflow/react";
type Node = RFNode<any>;
import type { WorkflowRunData } from "../types/workflow";
import { saveWorkflowApi } from "../utils/workflowActions";
import { extractId } from "../utils/id";

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
  
  // Cache all node updates during streaming
  const nodeUpdatesRef = useRef<Record<string, any>>({});
  // Cache streaming tokens for each node
  const streamingTokensRef = useRef<Record<string, string>>({});

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
        setWorkflowId(extractId(res._id || res.id));
        setWorkflowName(res.name);
      }
      return res;
    },
    [workflowId, workflowName, nodes, edges, setWorkflowId, setWorkflowName]
  );

  // Update visual state of nodes based on Run data
  const updateNodeStates = useCallback(
    (runData: WorkflowRunData) => {
      if (!runData?.node_runs) return;
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

  // Process a ReadableStream of SSE messages, updating node states in real-time
  const processStream = useCallback(
    async (body: ReadableStream<Uint8Array>) => {
      const reader = body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "messages") {
                const [messageChunk, metadata] = data.data || [];
                if (messageChunk?.content) {
                  const nodeId = metadata?.langgraph_node;
                  if (nodeId) {
                    streamingTokensRef.current[nodeId] = (streamingTokensRef.current[nodeId] || "") + messageChunk.content;

                    setNodes((nds) =>
                      nds.map((n) => {
                        if (n.id === nodeId) {
                          return {
                            ...n,
                            data: {
                              ...n.data,
                              runData: {
                                node_id: nodeId,
                                status: "running",
                                inputs: nodeUpdatesRef.current[nodeId]?.node_inputs?.[nodeId] || {},
                                outputs: { streaming: streamingTokensRef.current[nodeId] },
                                error_msg: null,
                              },
                              globalRunStatus: "running",
                            },
                          };
                        }
                        return n;
                      })
                    );
                  }
                }
              } else if (data.type === "updates") {
                const updates = data.data || {};

                for (const [key, value] of Object.entries(updates)) {
                  if (key.startsWith("__")) continue;
                  if (!value || typeof value !== "object") continue;
                  if (!("executed_nodes" in value)) continue;

                  const originalNodeId = key.replace(/__(worker|aggregator)$/, "");
                  nodeUpdatesRef.current[originalNodeId] = value;
                }

                setNodes((nds) =>
                  nds.map((n) => {
                    const update = nodeUpdatesRef.current[n.id];
                    if (update) {
                      const isAggregator = Object.keys(updates).some(k => k === `${n.id}__aggregator`);
                      const isWorker = Object.keys(updates).some(k => k.match(new RegExp(`^${n.id}__worker$`)));

                      let status: "running" | "completed" = "running";
                      if (update.error) {
                        status = "completed";
                      } else if (isAggregator || (!isWorker && !update.executed_nodes?.some((id: string) => id.includes("__worker")))) {
                        status = "completed";
                      }

                      return {
                        ...n,
                        data: {
                          ...n.data,
                          runData: {
                            node_id: n.id,
                            status: update.error ? "error" : status,
                            inputs: update.node_inputs?.[n.id] || {},
                            outputs: update.node_outputs?.[n.id] || update.context || {},
                            error_msg: update.error || null,
                          },
                          globalRunStatus: "running",
                        },
                      };
                    }
                    return n;
                  })
                );

                setEdges((eds) =>
                  eds.map((e) => ({ ...e, animated: !!nodeUpdatesRef.current[e.target] }))
                );
              } else if (data.type === "done") {
                const rid = data.run_id || "";
                setRunId(rid);
                setRunStatus("completed");
                setNodes((nds) =>
                  nds.map((n) => ({
                    ...n,
                    data: { ...n.data, globalRunStatus: "completed" },
                  }))
                );
                setEdges((eds) => eds.map((e) => ({ ...e, animated: false })));
              } else if (data.type === "paused") {
                const rid = data.run_id || "";
                setRunId(rid);
                setRunStatus("paused");

                // Identify which node needs approval
                const interrupts: any[] = data.data?.interrupts || [];
                const interruptNodeIds = interrupts
                  .map((i: any) => i.id)
                  .filter(Boolean);

                // Fallback: find last executed node with require_approval (interrupt_after)
                let fallbackNodeId: string | null = null;
                if (interruptNodeIds.length === 0) {
                  for (const [nodeId, update] of Object.entries(nodeUpdatesRef.current)) {
                    if ((update as any)?.current_node_id === nodeId) {
                      fallbackNodeId = nodeId;
                    }
                  }
                }

                setNodes((nds) =>
                  nds.map((n) => {
                    const isPausedNode =
                      interruptNodeIds.includes(n.id) ||
                      (fallbackNodeId === n.id && n.data?.node?.require_approval);
                    return {
                      ...n,
                      data: {
                        ...n.data,
                        globalRunStatus: "paused",
                        runData: isPausedNode
                          ? { ...n.data.runData, status: "paused" as const }
                          : n.data.runData,
                      },
                    };
                  })
                );
                setEdges((eds) => eds.map((e) => ({ ...e, animated: false })));
              } else if (data.type === "terminated") {
                const rid = data.run_id || "";
                setRunId(rid);
                setRunStatus("terminated");
                setNodes((nds) =>
                  nds.map((n) => ({
                    ...n,
                    data: { ...n.data, globalRunStatus: "terminated" },
                  }))
                );
                setEdges((eds) => eds.map((e) => ({ ...e, animated: false })));
              } else if (data.type === "error") {
                throw new Error(data.message || "Stream error");
              }
            } catch (e) {
              console.error("Failed to parse SSE message:", e, line);
            }
          }
        }
      }
    },
    [setNodes, setEdges]
  );

  // Execute Run with streaming
  const executeRun = useCallback(
    async (initialInputs: Record<string, any>) => {
      setRunConfigOpen(false);

      try {
        let currentWfId = workflowId;
        if (!currentWfId) {
          const savedWf = await saveWorkflow(false);
          if (!savedWf) return;
          currentWfId = extractId(savedWf._id || savedWf.id);
        } else {
          await saveWorkflow(false);
        }

        nodeUpdatesRef.current = {};
        streamingTokensRef.current = {};

        setRunStatus("running");
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, globalRunStatus: "running" },
          }))
        );

        const response = await fetch(
          `/api/workflows/${currentWfId}/execute/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(initialInputs),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        if (!response.body) {
          throw new Error("Response body is null");
        }

        await processStream(response.body);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "Failed to start run.");
        setRunStatus("error");
        setNodes((nds) =>
          nds.map((n) => ({
            ...n,
            data: { ...n.data, globalRunStatus: "error" },
          }))
        );
      }
    },
    [workflowId, saveWorkflow, setNodes, setEdges, processStream]
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

        const response = await fetch(
          `/api/runs/${runId}/resume?workflow_id=${workflowId}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action, modified_outputs: modifiedOutputs }),
          }
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        if (!response.body) {
          throw new Error("Response body is null");
        }

        await processStream(response.body);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "Resume failed.");
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
    [runId, workflowId, setNodes, processStream]
  );

  // Terminate workflow run
  const terminateRun = useCallback(async () => {
    if (!runId || !workflowId) return;
    try {
      const response = await fetch(
        `/api/runs/${runId}/terminate?workflow_id=${workflowId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await response.json();
      setRunStatus("terminated");
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: { ...n.data, globalRunStatus: "terminated" },
        }))
      );
      setIsPolling(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to terminate workflow.");
    }
  }, [runId, workflowId, setNodes]);

  // Reset workflow run (delete run record)
  const resetRun = useCallback(async () => {
    if (!runId || !workflowId) return;
    try {
      const response = await fetch(
        `/api/runs/${runId}?workflow_id=${workflowId}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Reset all state
      setRunId(null);
      setRunStatus("idle");
      setIsPolling(false);
      nodeUpdatesRef.current = {};
      streamingTokensRef.current = {};
      
      // Clear node run data
      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          data: {
            ...n.data,
            runData: undefined,
            globalRunStatus: "idle",
          },
        }))
      );
      setEdges((eds) => eds.map((e) => ({ ...e, animated: false })));
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? "Failed to reset workflow.");
    }
  }, [runId, workflowId, setNodes, setEdges]);

  // Polling loop
  const pollRunStatus = useCallback(async () => {
    if (!runId || !workflowId) return;
    try {
      const res = await axios.get(`/api/runs/${runId}?workflow_id=${workflowId}`);
      if (isResumingRef.current) return; // Prevent overwriting optimistic state during resume

      const currentRun = res.data;
      setRunStatus(currentRun.status);
      updateNodeStates(currentRun);

      if (["completed", "paused", "error", "terminated"].includes(currentRun.status)) {
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

    const startNode = nodes.find((n) => n.data?.node?.node_type === "start" || n.data?.node?.is_start_node);

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
    terminateRun,
    resetRun,
    prepareRun,
    saveWorkflow,
    error,
    setError,
  };
};
