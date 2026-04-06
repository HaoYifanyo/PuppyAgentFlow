import React, { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Check, AlertCircle, Loader2, Clock } from "lucide-react";
import axios from "axios";
import { Modal } from "./ui/Modal";
import { extractId } from "../utils/id";

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
  workflow: { nodes: { id: string; name: string; node_type?: string; is_start_node?: boolean }[] };
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  completed: { label: "COMPLETED", color: "text-green-600 bg-green-50 border-green-200", icon: <Check className="w-3 h-3" /> },
  error:     { label: "ERROR",     color: "text-red-600 bg-red-50 border-red-200",       icon: <AlertCircle className="w-3 h-3" /> },
  paused:    { label: "PAUSED",    color: "text-amber-600 bg-amber-50 border-amber-200",  icon: <Clock className="w-3 h-3" /> },
  running:   { label: "RUNNING",   color: "text-blue-600 bg-blue-50 border-blue-200",     icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  pending:   { label: "PENDING",   color: "text-stone-500 bg-stone-50 border-stone-200",     icon: null },
};

const CollapsibleJson = ({ title, data }: { title: string; data: any }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="text-xs">
      <button
        className="flex items-center gap-1 text-stone-500 hover:text-rose-600 font-medium py-0.5 transition-colors cursor-pointer"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {title}
      </button>
      {open && (
        <pre className="mt-1 p-2 bg-stone-50 rounded-lg text-[11px] overflow-auto max-h-36 border border-stone-200 whitespace-pre-wrap break-words">
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
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Container width="w-[800px]">
        <Modal.Header title="Run History" onClose={onClose} />

        <div className="flex h-[500px] overflow-hidden rounded-b-2xl">
          {/* Left: run list */}
          <div className="w-56 border-r border-rose-100 overflow-y-auto shrink-0 bg-rose-50/30">
            {loadingRuns ? (
              <div className="text-center text-sm text-stone-400 py-8">Loading...</div>
            ) : runs.length === 0 ? (
              <div className="text-center text-sm text-stone-400 py-8">No runs yet.</div>
            ) : (
              runs.map(run => {
                const sc = statusConfig[run.status] ?? statusConfig.pending;
                const runId = extractId(run._id);
                const isSelected = runId === selectedRunId;
                return (
                  <button
                    key={runId}
                    onClick={() => selectRun(runId)}
                    className={`w-full text-left px-4 py-3 border-b border-rose-50 hover:bg-white transition-colors cursor-pointer ${isSelected ? "bg-white border-l-4 border-l-rose-400" : ""}`}
                  >
                    <div className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${sc.color} mb-1`}>
                      {sc.icon} {sc.label}
                    </div>
                    <div className="text-[11px] text-stone-500 font-mono">
                      {new Date(run.created_at).toLocaleString()}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: run detail */}
          <div className="flex-1 overflow-y-auto px-6 py-5 bg-white">
            {!selectedRunId ? (
              <div className="text-center text-sm text-stone-400 mt-16">Select a run to view details</div>
            ) : loadingDetail ? (
              <div className="flex justify-center items-center mt-16 text-stone-400">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : runDetail ? (
              <div className="space-y-4">
                {nodes.filter(n => n.node_type !== "start" && !n.is_start_node).map(node => {
                  const nr = nodeRuns[node.id];
                  const sc = statusConfig[nr?.status ?? "pending"] ?? statusConfig.pending;
                  return (
                    <div key={node.id} className="border border-rose-100 rounded-2xl p-4 space-y-3 shadow-sm shadow-rose-900/5 bg-stone-50/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-stone-800">🐶 {node.name}</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${sc.color}`}>
                          {sc.icon} {sc.label}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {nr?.inputs && <CollapsibleJson title="Inputs" data={nr.inputs} />}
                        {nr?.outputs && <CollapsibleJson title="Outputs" data={nr.outputs} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </Modal.Container>
    </Modal>
  );
};