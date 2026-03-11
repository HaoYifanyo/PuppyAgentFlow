import React, { useState, useEffect } from 'react';
import { X, Trash2, Save } from 'lucide-react';

interface WorkflowNode {
  id: string;
  name: string;
  skill_id: string;
  require_approval: boolean;
  is_start_node?: boolean;
  config?: Record<string, any>;
}

interface NodeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (nodeId: string, updatedData: Partial<WorkflowNode>) => void;
  onDelete: (nodeId: string) => void;
  node: WorkflowNode | null;
}

export const NodeConfigModal: React.FC<NodeConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  node
}) => {
  const [name, setName] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [configStr, setConfigStr] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Load node data when modal opens
  useEffect(() => {
    if (isOpen && node) {
      setName(node.name || '');
      setRequireApproval(node.require_approval || false);

      if (node.is_start_node) {
        // Extract text directly for Start Node
        const manualText = node.config?.manual_input_text || '';
        setConfigStr(manualText);
      } else {
        setConfigStr(node.config ? JSON.stringify(node.config, null, 2) : '{}');
      }
      setError(null);
    }
  }, [isOpen, node]);

  if (!isOpen || !node) return null;

  const handleSave = () => {
    setError(null);
    let parsedConfig = {};

    if (node.is_start_node) {
      parsedConfig = {
        trigger_type: "manual",
        manual_input_text: configStr
      };
    } else {
      try {
        if (configStr.trim() !== '') {
          parsedConfig = JSON.parse(configStr);
        }
      } catch (e) {
        setError('Invalid JSON format in Config');
        return;
      }
    }

    onSave(node.id, {
      name,
      require_approval: requireApproval,
      config: parsedConfig
    });
  };

  const handleDelete = () => {
    if (node.is_start_node) {
      alert("The Start Node cannot be deleted.");
      return;
    }
    if (window.confirm(`Are you sure you want to delete the node "${node.name}"?`)) {
      onDelete(node.id);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[500px] max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <div>
            <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
              ⚙️ Node Settings
            </h3>
            <p className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {node.id} | Skill: {node.skill_id}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Header (Only for Start Node) */}
        {node.is_start_node && (
          <div className="flex border-b border-gray-200 px-4 pt-2 bg-gray-50">
            <button className="px-4 py-2 text-sm font-semibold text-blue-600 border-b-2 border-blue-600">
              Manual Run
            </button>
            <button className="px-4 py-2 text-sm font-semibold text-gray-400 cursor-not-allowed" title="Coming soon">
              Schedule <span className="text-[9px] bg-gray-200 text-gray-600 px-1 py-0.5 rounded ml-1">Soon</span>
            </button>
            <button className="px-4 py-2 text-sm font-semibold text-gray-400 cursor-not-allowed" title="Coming soon">
              Event <span className="text-[9px] bg-gray-200 text-gray-600 px-1 py-0.5 rounded ml-1">Soon</span>
            </button>
          </div>
        )}

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* Name Field */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-700 block">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="e.g. AI Summarizer"
            />
          </div>

          {/* Require Approval Switch */}
          {!node.is_start_node && (
            <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
              <div>
                <div className="text-sm font-semibold text-gray-800">Require Approval</div>
                <div className="text-[10px] text-gray-500 mt-0.5">Pause execution after this node finishes for manual review.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                />
                <div className="w-9 h-5 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>
          )}

          {/* Config Field (Different for Start Node vs Normal Node) */}
          {node.is_start_node ? (
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-700 block">Default Input Text</label>
              <p className="text-[10px] text-gray-500 mb-2">
                This text will be automatically passed to the first node when you run the workflow.
              </p>
              <textarea
                value={configStr}
                onChange={(e) => setConfigStr(e.target.value)}
                className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                placeholder="Enter the initial prompt or data here..."
              />
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between items-end">
                <label className="text-xs font-semibold text-gray-700 block">Advanced Config (JSON)</label>
                <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Expert Use Only</span>
              </div>
              <textarea
                value={configStr}
                onChange={(e) => setConfigStr(e.target.value)}
                className={`w-full h-48 px-3 py-2 border ${error ? 'border-red-400 bg-red-50' : 'border-gray-300'} rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none`}
                placeholder="{}"
              />
              {error && <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete Node
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
            >
              <Save className="w-4 h-4" /> Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
