import { useState, useEffect } from "react";
import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import {
  Check,
  Loader2,
  AlertCircle,
  X,
  Edit3,
  Settings,
  Layers,
  Maximize2,
} from "lucide-react";
import type { WorkflowNode, NodeRunData } from "../../types/workflow";
import { NodeDataModal } from "../NodeDataModal";
import { PuppyImage } from "../PuppyImage";

const PuppyNode = ({ data }: NodeProps) => {
  const { node, runData, globalRunStatus, onResume, onEditClick, agentAvatarUrl } = data as {
    node: WorkflowNode;
    runData?: NodeRunData;
    globalRunStatus?: string;
    onResume: (nodeId: string, action: string, modifiedOutputs?: any) => void;
    onEditClick: (node: WorkflowNode) => void;
    agentAvatarUrl?: string;
  };

  const status = runData?.status || "pending";
  const [editMode, setEditMode] = useState(false);
  const [editedOutputs, setEditedOutputs] = useState("");
  const [showDataModal, setShowDataModal] = useState(false);

  const statusConfig = {
    pending: {
      bg: "bg-gray-50",
      border: "border-gray-200",
      text: "text-gray-500",
      icon:
        globalRunStatus === "running" ? (
          <Loader2 className="w-4 h-4 animate-spin opacity-50" />
        ) : null,
    },
    running: {
      bg: "bg-blue-50",
      border: "border-blue-300",
      text: "text-blue-600",
      icon: <Loader2 className="w-4 h-4 animate-spin" />,
    },
    paused: {
      bg: "bg-amber-50",
      border: "border-amber-400",
      text: "text-amber-700",
      icon: <AlertCircle className="w-4 h-4" />,
    },
    completed: {
      bg: "bg-green-50",
      border: "border-green-300",
      text: "text-green-600",
      icon: <Check className="w-4 h-4" />,
    },
    error: {
      bg: "bg-red-50",
      border: "border-red-300",
      text: "text-red-600",
      icon: <X className="w-4 h-4" />,
    },
  };

  const conf = statusConfig[status];

  useEffect(() => {
    if (status === "paused" && runData?.outputs) {
      setEditedOutputs(JSON.stringify(runData.outputs, null, 2));
    }
  }, [status, runData?.outputs]);

  const handleApprove = () => onResume(node.id, "approve");
  const handleReject = () => onResume(node.id, "reject");
  const handleEditSubmit = () => {
    try {
      const parsed = JSON.parse(editedOutputs);
      onResume(node.id, "edit", parsed);
      setEditMode(false);
    } catch (e) {
      alert("Invalid JSON format");
    }
  };

  const isBatchMode = node.batch_mode === true;
  const borderClass = isBatchMode ? "border-rose-500" : conf.border;
  const bgClass = isBatchMode ? "bg-rose-50/30" : "bg-white";
  const hasRunData = !!(runData?.inputs || runData?.outputs || runData?.error_msg);

  return (
    <>
      <div
        className={`shadow-md rounded-xl ${bgClass} border-2 ${borderClass} transition-colors transition-shadow`}
        style={{ width: hasRunData ? 260 : 140 }}
      >
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 bg-gray-400"
          data-testid="puppy-handle-target"
        />

        {/* Header */}
        <div className="relative px-3 pt-3 pb-3 flex flex-col items-center text-center">
          {(status === "pending" || status === "completed") && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditClick(node);
              }}
              className="absolute right-1.5 top-1.5 p-1 text-gray-300 hover:text-blue-500 transition-colors rounded focus-visible:ring-2 focus-visible:ring-blue-400"
              title="Node Settings"
              aria-label="Node Settings"
            >
              <Settings className="w-3 h-3" />
            </button>
          )}

          <PuppyImage size="md" src={agentAvatarUrl} className="mb-1.5" />

          <div className="flex items-center justify-center gap-1 w-full">
            <h3 className="text-xs font-bold text-gray-800 leading-snug break-words">
              {node.name}
            </h3>
            {isBatchMode && (
              <span className="shrink-0 inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded-full bg-rose-100 text-rose-700">
                <Layers className="w-2.5 h-2.5" />
              </span>
            )}
          </div>

          <div
            className={`mt-1.5 inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full ${conf.bg} ${conf.text}`}
          >
            {conf.icon} {status.toUpperCase()}
          </div>
        </div>

        {/* Body / Data view */}
        <div className={`text-xs text-gray-600 space-y-2 w-full px-3 ${hasRunData ? "pb-3" : ""}`}>
          {runData?.error_msg && (
            <div className="text-red-600 bg-red-50 p-2 rounded text-[10px] font-mono whitespace-pre-wrap break-words max-w-full">
              {runData.error_msg}
            </div>
          )}

          {runData?.inputs && Object.keys(runData.inputs).length > 0 && (
            <div className="flex flex-col">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold">Inputs:</span>
              </div>
              <pre className="bg-gray-100 p-2 rounded text-[10px] overflow-auto max-h-24 max-w-full whitespace-pre-wrap break-words">
                {JSON.stringify(runData.inputs, null, 2)}
              </pre>
            </div>
          )}

          {runData?.outputs && !editMode && (
            <button
              className="flex flex-col text-left w-full cursor-pointer group/output focus-visible:ring-2 focus-visible:ring-rose-400 rounded"
              onClick={(e) => {
                e.stopPropagation();
                setShowDataModal(true);
              }}
              aria-label="View outputs"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold">Outputs:</span>
                <Maximize2 className="w-3 h-3 text-gray-400 group-hover/output:text-rose-500 transition-colors" />
              </div>
              <pre className="bg-green-50 p-2 rounded text-[10px] overflow-auto max-h-32 border border-green-100 max-w-full whitespace-pre-wrap break-words group-hover/output:border-green-300 transition-colors">
                {JSON.stringify(runData.outputs, null, 2)}
              </pre>
            </button>
          )}

          {/* Human-in-the-Loop Interventions */}
          {status === "paused" && (
            <div className="mt-3 pt-3 border-t border-amber-200 flex flex-col items-center">
              {editMode ? (
                <div className="space-y-2 w-full">
                  <textarea
                    className="w-full h-32 p-2 border border-amber-300 rounded text-[10px] font-mono bg-amber-50"
                    value={editedOutputs}
                    onChange={(e) => setEditedOutputs(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleEditSubmit}
                      className="flex-1 bg-amber-500 text-white py-1 rounded shadow text-xs font-bold hover:bg-amber-600 cursor-pointer"
                    >
                      Save & Resume
                    </button>
                    <button
                      onClick={() => setEditMode(false)}
                      className="px-3 bg-gray-200 py-1 rounded shadow text-xs hover:bg-gray-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-1 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded shadow text-xs font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-green-400"
                  >
                    <Check className="w-3 h-3" /> Approve
                  </button>
                  <button
                    onClick={() => setEditMode(true)}
                    className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded shadow text-xs font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-amber-400"
                  >
                    <Edit3 className="w-3 h-3" /> Edit
                  </button>
                  <button
                    onClick={handleReject}
                    className="flex items-center gap-1 bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded shadow text-xs font-medium transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    <X className="w-3 h-3" /> Reject
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <Handle
          type="source"
          position={Position.Right}
          id="a"
          className="w-3 h-3 bg-gray-400"
        />
      </div>

      <NodeDataModal
        isOpen={showDataModal}
        onClose={() => setShowDataModal(false)}
        nodeName={node.name}
        inputs={runData?.inputs}
        outputs={runData?.outputs}
      />
    </>
  );
};

export default PuppyNode;
