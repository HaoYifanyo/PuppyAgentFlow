import React, { useState, useEffect } from 'react';
import { Trash2, Save, Dog, Layers } from 'lucide-react';
import type { Agent } from '../types/workflow';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Label, Textarea } from './ui/Input';
import { extractId } from '../utils/id';

interface WorkflowNode {
  id: string;
  name: string;
  skill_id: string;
  agent_id?: string;
  require_approval: boolean;
  is_start_node?: boolean;
  batch_mode?: boolean;
  config?: Record<string, any>;
}

interface NodeConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (nodeId: string, updatedData: Partial<WorkflowNode>, agentAvatarUrl?: string) => void;
  onDelete: (nodeId: string) => void;
  node: WorkflowNode | null;
  agents?: Agent[];
  skillType?: string;
  inputSchema?: Record<string, any>;
}

export const NodeConfigModal: React.FC<NodeConfigModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  node,
  agents = [],
  skillType,
  inputSchema,
}) => {
  const [name, setName] = useState('');
  const [requireApproval, setRequireApproval] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [configStr, setConfigStr] = useState('');
  const [staticInputs, setStaticInputs] = useState<Record<string, string>>({});
  const [agentId, setAgentId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const isToolNode = skillType === 'tool' && !node?.is_start_node;

  useEffect(() => {
    if (isOpen && node) {
      setName(node.name || '');
      setRequireApproval(node.require_approval || false);
      setBatchMode(node.batch_mode || false);
      setAgentId(node.agent_id || '');

      if (node.is_start_node) {
        const manualText = node.config?.manual_input_text || '';
        setConfigStr(manualText);
      } else if (isToolNode && inputSchema) {
        // For tool nodes, load existing config values into per-field state
        const existing: Record<string, string> = {};
        Object.keys(inputSchema).forEach(key => {
          existing[key] = node.config?.[key] != null ? String(node.config[key]) : '';
        });
        setStaticInputs(existing);
      } else {
        setConfigStr(node.config ? JSON.stringify(node.config, null, 2) : '{}');
      }
      setError(null);
    }
  }, [isOpen, node]);

  if (!isOpen || !node) return null;

  const needsAgent = skillType === 'llm' || skillType === 'browser_use';

  const handleSave = () => {
    setError(null);
    let parsedConfig = {};

    if (node.is_start_node) {
      parsedConfig = {
        trigger_type: 'manual',
        manual_input_text: configStr,
      };
    } else if (isToolNode && inputSchema) {
      // Save only non-empty static input values
      const filled: Record<string, string> = {};
      Object.keys(inputSchema).forEach(key => {
        if (staticInputs[key]?.trim()) {
          filled[key] = staticInputs[key].trim();
        }
      });
      parsedConfig = filled;
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

    const updatedData: Partial<WorkflowNode> = {
      name,
      require_approval: requireApproval,
      batch_mode: batchMode,
      config: parsedConfig,
      agent_id: agentId || undefined,
    };

    onSave(node.id, updatedData, selectedAgent?.avatar_url);
  };

  const handleDelete = () => {
    if (node.is_start_node) {
      alert('The Start Node cannot be deleted.');
      return;
    }
    if (window.confirm(`Are you sure you want to delete the node "${node.name}"?`)) {
      onDelete(node.id);
    }
  };

  const selectedAgent = agents.find(a => extractId(a._id || a.id) === agentId);

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Container>
        <Modal.Header
          title={
            <div className="flex flex-col">
              <span className="flex items-center gap-2">⚙️ Node Settings</span>
              <p className="text-[10px] text-stone-400 font-mono mt-0.5 font-normal">ID: {node.id} | Skill: {node.skill_id}</p>
            </div>
          }
          onClose={onClose}
        />

        {/* Tab Header (Only for Start Node) */}
        {node.is_start_node && (
          <div className="flex border-b border-rose-100 px-4 pt-2 bg-stone-50/50">
            <button className="px-4 py-2 text-sm font-semibold text-rose-500 border-b-2 border-rose-500">
              Manual Run
            </button>
            <button className="px-4 py-2 text-sm font-semibold text-stone-400 cursor-not-allowed" title="Coming soon">
              Schedule <span className="text-[9px] bg-stone-200 text-stone-600 px-1 py-0.5 rounded ml-1">Soon</span>
            </button>
            <button className="px-4 py-2 text-sm font-semibold text-stone-400 cursor-not-allowed" title="Coming soon">
              Event <span className="text-[9px] bg-stone-200 text-stone-600 px-1 py-0.5 rounded ml-1">Soon</span>
            </button>
          </div>
        )}

        <Modal.Body className="overflow-y-auto max-h-[60vh]">
          {/* Name Field */}
          <div className="space-y-1">
            <Label>Display Name</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. AI Summarizer"
            />
          </div>

          {/* Puppy Agent Selector — for LLM and Browser Use nodes */}
          {!node.is_start_node && needsAgent && (
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <Dog className="w-3.5 h-3.5 text-rose-400" /> Puppy Agent
              </Label>
              <p className="text-xs text-stone-500">
                {skillType === 'browser_use' 
                  ? 'Browser Use requires an Agent to provide LLM capabilities.' 
                  : 'Select the LLM provider for this node.'}
              </p>
              <select
                value={agentId}
                onChange={e => setAgentId(e.target.value)}
                className="w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none bg-stone-50 hover:bg-white transition-colors cursor-pointer"
              >
                <option value="">None (use global default)</option>
                {agents.map(agent => {
                  const id = extractId(agent._id || agent.id);
                  return (
                    <option key={id} value={id}>
                      {agent.name} — {agent.provider} / {agent.model_id}
                    </option>
                  );
                })}
              </select>
              {selectedAgent && (
                <p className="text-[10px] text-rose-600 mt-1">
                  Using: <span className="font-mono">{selectedAgent.model_id}</span> via {selectedAgent.provider}
                </p>
              )}
              {agents.length === 0 && (
                <p className="text-[10px] text-stone-400 mt-1">
                  No agents configured. Open Puppy Agents from the navbar to create one.
                </p>
              )}
            </div>
          )}

          {/* Require Approval Switch */}
          {!node.is_start_node && (
            <div className="flex items-center justify-between p-3 bg-white border border-rose-100 rounded-xl shadow-sm shadow-rose-900/5">
              <div>
                <div className="text-sm font-semibold text-stone-800">Require Approval</div>
                <div className="text-[10px] text-stone-500 mt-0.5">Pause execution after this node finishes for manual review.</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={requireApproval}
                  onChange={(e) => setRequireApproval(e.target.checked)}
                />
                <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-400"></div>
              </label>
            </div>
          )}

          {/* Batch Mode Switch */}
          {!node.is_start_node && (
            <div className="flex items-center justify-between p-3 bg-white border border-rose-100 rounded-xl shadow-sm shadow-rose-900/5">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-rose-400" />
                <div>
                  <div className="text-sm font-semibold text-stone-800">Batch Mode</div>
                  <div className="text-[10px] text-stone-500 mt-0.5">Process list inputs in parallel. Each item is handled by a separate worker.</div>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={batchMode}
                  onChange={(e) => setBatchMode(e.target.checked)}
                />
                <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-rose-400"></div>
              </label>
            </div>
          )}

          {/* Config Field */}
          {node.is_start_node ? (
            <div className="space-y-1">
              <Label>Default Input Text</Label>
              <p className="text-[10px] text-stone-500 mb-2">
                This text will be automatically passed to the first node when you run the workflow.
              </p>
              <Textarea
                value={configStr}
                onChange={(e) => setConfigStr(e.target.value)}
                className="h-32"
                placeholder="Enter the initial prompt or data here..."
              />
            </div>
          ) : isToolNode && inputSchema ? (
            <div className="space-y-3">
              <div>
                <Label>Input Parameters</Label>
                <p className="text-[10px] text-stone-500 mt-0.5">
                  Fill in values you want to fix for this node. Leave empty to receive the value automatically from the previous node.
                </p>
              </div>
              {Object.keys(inputSchema).map(key => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium text-stone-700 font-mono">{key}</label>
                  <Input
                    type="text"
                    value={staticInputs[key] || ''}
                    onChange={(e) => setStaticInputs({ ...staticInputs, [key]: e.target.value })}
                    placeholder="auto from upstream"
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="flex justify-between items-end mb-1">
                <Label>Advanced Config (JSON)</Label>
                <span className="text-[9px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">Expert Use Only</span>
              </div>
              <Textarea
                value={configStr}
                onChange={(e) => setConfigStr(e.target.value)}
                className={`h-48 font-mono ${error ? 'border-red-400 bg-red-50' : ''}`}
                placeholder="{}"
              />
              {error && <p className="text-xs text-red-500 mt-1 font-medium">{error}</p>}
            </div>
          )}
        </Modal.Body>

        <Modal.Footer>
          <Button
            variant="ghost"
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={handleDelete}
            icon={<Trash2 className="w-4 h-4" />}
          >
            Delete Node
          </Button>

          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              data-testid="node-config-save"
              icon={<Save className="w-4 h-4" />}
            >
              Save
            </Button>
          </div>
        </Modal.Footer>
      </Modal.Container>
    </Modal>
  );
};
