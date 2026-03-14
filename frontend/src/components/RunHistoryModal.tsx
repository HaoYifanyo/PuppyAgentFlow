import React, { useState, useEffect } from "react";
import { X, ChevronDown, ChevronRight, Check, AlertCircle, Loader2, Clock } from "lucide-react";
import axios from "axios";

interface RunItem {
  _id: string;
  status: string;
  created_at: string;
}

interface NodeRunDetail {
  node_id: string;
  status: string;
  inputs?: Record<string, any>;
  outputs?: Record<string, any>;
}

interface RunDetail {
  node_runs: Record<string, NodeRunDetail>;
  workflow: { nodes: { id: string; name: string; is_start_node?: boolean }[] };
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  completed: { label: "COMPLETED", color: "text-green-600 bg-green-50 border-green-200", icon: <Check className="w-3 h-3" /> },
  error:     { label: "ERROR",     color: "text-red-600 bg-red-50 border-red-200",       icon: <AlertCircle className="w-3 h-3" /> },
  paused:    { label: "PAUSED",    color: "text-amber-600 bg-amber-50 border-amber-200",  icon: <Clock className="w-3 h-3" /> },
  running:   { label: "RUNNING",   color: "text-blue-600 bg-blue-50 border-blue-200",     icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  pending:   { label: "PENDING",   color: "text-gray-500 bg-gray-50 border-gray-200",     icon: null },
};

const CollapsibleJson = ({ title, data }: { title: string; data: any }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        className="flex items-center gap-1 text-gray-500 hover:text-gray-700 font-medium py-0.5"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {title}
      </button>
      {open && (
        <pre className="mt-1 p-2 bg-gray-50 rounded text-[11px] overflow-auto max-h-36 border border-gray-200 whitespace-pre-wrap break-words">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
};

interface RunHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowId: string | null;
}

export const RunHistoryModal = ({ isOpen, onClose, workflowId }: RunHistoryModalProps) => {
  const [runs, setRuns] = useState<RunItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [runDetail, setRunDetail] = useState<RunDetail | null>(null);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!isOpen || !workflowId) return;
    setLoadingRuns(true);
    setSelectedRunId(null);
    setRunDetail(null);
    axios.get(`/api/workflows/${workflowId}/runs`)
      .then(res => setRuns(res.data))
      .finally(() => setLoadingRuns(false));
  }, [isOpen, workflowId]);

  const selectRun = async (runId: string) => {
    setSelectedRunId(runId);
    setRunDetail(null);
    setLoadingDetail(true);
    try {
      const res = await axios.get(`/api/runs/${runId}?workflow_id=${workflowId}`);
      setRunDetail(res.data);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (!isOpen) return null;

  const nodes = runDetail?.workflow?.nodes ?? [];
  const nodeRuns = runDetail?.node_runs ?? {};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[75vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-bold text-gray-800">Run History</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: run list */}
          <div className="w-56 border-r border-gray-100 overflow-y-auto shrink-0">
            {loadingRuns ? (
              <div className="text-center text-sm text-gray-400 py-8">Loading...</div>
            ) : runs.length === 0 ? (
              <div className="text-center text-sm text-gray-400 py-8">No runs yet.</div>
            ) : (
              runs.map(run => {
                const sc = statusConfig[run.status] ?? statusConfig.pending;
                const isSelected = run._id === selectedRunId;
                return (
                  <button
                    key={run._id}
                    onClick={() => selectRun(run._id)}
                    className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""}`}
                  >
                    <div className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${sc.color} mb-1`}>
                      {sc.icon} {sc.label}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {new Date(run.created_at).toLocaleString()}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: run detail */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {!selectedRunId ? (
              <div className="text-center text-sm text-gray-400 mt-16">Select a run to view details</div>
            ) : loadingDetail ? (
              <div className="text-center text-sm text-gray-400 mt-16">Loading...</div>
            ) : runDetail ? (
              <div className="space-y-3">
                {nodes.filter(n => !n.is_start_node).map(node => {
                  const nr = nodeRuns[node.id];
                  const sc = statusConfig[nr?.status ?? "pending"] ?? statusConfig.pending;
                  return (
                    <div key={node.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-gray-700">🐶 {node.name}</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${sc.color}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </div>
                      {nr?.inputs && <CollapsibleJson title="Inputs" data={nr.inputs} />}
                      {nr?.outputs && <CollapsibleJson title="Outputs" data={nr.outputs} />}
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
