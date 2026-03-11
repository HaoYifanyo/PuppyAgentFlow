import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { X, FolderOpen, Trash2, Calendar, Loader2 } from 'lucide-react';

interface Workflow {
  _id: string;
  name: string;
  created_at: string;
  nodes: any[];
  edges: any[];
}

interface WorkflowDashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoad: (wf: Workflow) => void;
}

export const WorkflowDashboardModal: React.FC<WorkflowDashboardModalProps> = ({
  isOpen,
  onClose,
  onLoad
}) => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkflows = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get('/api/workflows');
      setWorkflows(res.data);
    } catch (err: any) {
      console.error('Failed to fetch workflows', err);
      setError('Failed to load workflows');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchWorkflows();
    }
  }, [isOpen]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this workflow?")) return;

    try {
      await axios.delete(`/api/workflows/${id}`);
      fetchWorkflows();
    } catch (err: any) {
      alert("Failed to delete workflow");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
      <div className="bg-white rounded-xl shadow-xl w-[600px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            📂 My Workflows
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2" />
              <p className="text-sm">Loading workflows...</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg text-sm border border-red-100">
              {error}
            </div>
          )}

          {!loading && workflows.length === 0 && !error && (
            <div className="text-center py-20 text-gray-400">
              <p className="text-sm">No workflows saved yet.</p>
              <p className="text-[10px] mt-1">Create and save your first flow to see it here!</p>
            </div>
          )}

          {!loading && workflows.map((wf) => (
            <div
              key={wf._id}
              className="p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition-all flex justify-between items-center group cursor-default"
            >
              <div className="flex-1">
                <div className="font-bold text-sm text-gray-800 group-hover:text-blue-700 transition-colors">
                  {wf.name}
                </div>
                <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                  <Calendar className="w-3 h-3" />
                  {new Date(wf.created_at).toLocaleString()}
                  <span className="mx-1">•</span>
                  {wf.nodes.length} nodes
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => onLoad(wf)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded shadow-sm hover:bg-blue-700 flex items-center gap-1 text-xs font-bold transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" /> Load
                </button>
                <button
                  onClick={(e) => handleDelete(wf._id, e)}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-all"
                  title="Delete Workflow"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
