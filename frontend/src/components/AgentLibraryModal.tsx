import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, Dog } from 'lucide-react';
import type { Agent, AgentProvider } from '../types/workflow';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Label, Textarea } from './ui/Input';

interface AgentLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAgentsChange: () => void;
}

const PROVIDER_OPTIONS: { value: AgentProvider; label: string; defaultModel: string }[] = [
  { value: 'gemini', label: 'Google Gemini', defaultModel: 'gemini-2.5-flash' },
  { value: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o' },
  { value: 'anthropic', label: 'Anthropic', defaultModel: 'claude-3-5-sonnet-20241022' },
  { value: 'custom', label: 'Custom (OpenAI-compatible)', defaultModel: '' },
];

const EMPTY_FORM: Omit<Agent, '_id' | 'id'> = {
  name: '',
  provider: 'gemini',
  model_id: 'gemini-2.5-flash',
  api_key: '',
  system_prompt: '',
  base_url: '',
};

export const AgentLibraryModal: React.FC<AgentLibraryModalProps> = ({
  isOpen,
  onClose,
  onAgentsChange,
}) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<Agent, '_id' | 'id'>>(EMPTY_FORM);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [apiKeyModified, setApiKeyModified] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchAgents = async () => {
    try {
      const res = await axios.get('/api/agents');
      setAgents(res.data);
    } catch {
      setError('Failed to load agents');
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAgents();
      setSelectedId(null);
      setIsNew(false);
      setForm(EMPTY_FORM);
      setError(null);
    }
  }, [isOpen]);

  const handleSelect = (agent: Agent) => {
    const id = agent._id || agent.id || '';
    setSelectedId(id);
    setIsNew(false);
    setShowApiKey(false);
    setApiKeyModified(false);
    setSaveSuccess(false);
    setForm({
      name: agent.name,
      provider: agent.provider,
      model_id: agent.model_id,
      // Never preload API key; users can only overwrite
      api_key: '',
      system_prompt: agent.system_prompt || '',
      base_url: agent.base_url || '',
    });
    setError(null);
  };

  const handleNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setForm(EMPTY_FORM);
    setShowApiKey(false);
    setApiKeyModified(false);
    setSaveSuccess(false);
    setError(null);
  };

  const handleProviderChange = (provider: AgentProvider) => {
    const opt = PROVIDER_OPTIONS.find(p => p.value === provider);
    setForm(f => ({
      ...f,
      provider,
      model_id: opt?.defaultModel || f.model_id,
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.model_id.trim()) { setError('Model ID is required'); return; }
    if (isNew && (!form.api_key || !form.api_key.trim())) { setError('API key is required for new agents'); return; }

    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const payload: Record<string, any> = {
        name: form.name.trim(),
        provider: form.provider,
        model_id: form.model_id.trim(),
      };
      // For update, only send api_key when user typed something (overwrite). Blank means keep existing.
      if (isNew && form.api_key) {
        payload.api_key = form.api_key.trim();
      } else if (apiKeyModified && form.api_key) {
        payload.api_key = form.api_key.trim();
      }
      if (form.system_prompt?.trim()) payload.system_prompt = form.system_prompt.trim();
      if (form.base_url?.trim()) payload.base_url = form.base_url.trim();

      if (isNew) {
        await axios.post('/api/agents', payload);
      } else if (selectedId) {
        await axios.put(`/api/agents/${selectedId}`, payload);
      }
      await fetchAgents();
      onAgentsChange();
      setIsNew(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteClick = () => {
    if (selectedId) setConfirmDeleteId(selectedId);
  };

  const handleDeleteConfirm = async () => {
    if (!confirmDeleteId) return;
    try {
      await axios.delete(`/api/agents/${confirmDeleteId}`);
      setSelectedId(null);
      setForm(EMPTY_FORM);
      setConfirmDeleteId(null);
      await fetchAgents();
      onAgentsChange();
    } catch {
      setError('Delete failed');
    }
  };

  if (!isOpen) return null;

  const hasForm = isNew || selectedId !== null;

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Container width="w-[720px]">
        <Modal.Header
          title="Puppy Agents"
          icon={<Dog className="w-4 h-4 text-rose-500" />}
          onClose={onClose}
        />

        <div className="flex h-[600px] overflow-hidden rounded-b-2xl">
          {/* Left: Agent list */}
          <div className="w-56 border-r border-rose-100 flex flex-col bg-rose-50/30">
            <div className="p-3 border-b border-rose-100">
              <Button
                className="w-full"
                onClick={handleNew}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                New Agent
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {agents.length === 0 && (
                <p className="text-[11px] text-stone-400 text-center mt-4 px-2">
                  No agents yet. Create one to assign a model to your LLM nodes.
                </p>
              )}
              {agents.map((agent) => {
                const id = agent._id || agent.id || '';
                const providerLabel = PROVIDER_OPTIONS.find(p => p.value === agent.provider)?.label ?? agent.provider;
                const isSelected = selectedId === id;
                return (
                  <button
                    key={id}
                    onClick={() => handleSelect(agent)}
                    className={`w-full text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isSelected
                        ? 'bg-white border-rose-200 shadow-sm shadow-rose-900/5 ring-1 ring-rose-400/20'
                        : 'bg-transparent border-transparent hover:bg-white hover:border-rose-100'
                    }`}
                  >
                    <div className="font-semibold text-xs text-stone-800 truncate">{agent.name}</div>
                    <div className="text-[10px] text-stone-500 mt-1 truncate">{providerLabel}</div>
                    <div className="text-[10px] font-mono text-stone-400 truncate mt-0.5">{agent.model_id}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Form */}
          <div className="flex-1 flex flex-col overflow-hidden bg-white">
            {!hasForm ? (
              <div className="flex-1 flex items-center justify-center text-sm text-stone-400">
                Select an agent or create a new one
              </div>
            ) : (
              <>
                <Modal.Body className="flex-1 overflow-y-auto">
                  <div className="space-y-1">
                    <Label>Name <span className="text-rose-500">*</span></Label>
                    <Input
                      type="text"
                      data-testid="agent-name-input"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Flash Puppy"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Provider <span className="text-rose-500">*</span></Label>
                      <select
                        value={form.provider}
                        onChange={e => handleProviderChange(e.target.value as AgentProvider)}
                        className="w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none bg-stone-50 hover:bg-white transition-colors cursor-pointer"
                      >
                        {PROVIDER_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label>Model ID <span className="text-rose-500">*</span></Label>
                      <Input
                        type="text"
                        value={form.model_id}
                        onChange={e => setForm(f => ({ ...f, model_id: e.target.value }))}
                        className="font-mono"
                        placeholder="e.g. gemini-2.5-flash"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label>API Key <span className="text-rose-500">{isNew ? '*' : ''}</span></Label>
                      <span className="text-[10px] text-stone-400">{isNew ? 'Required once' : 'Leave blank to keep existing'}</span>
                    </div>
                    <div className="relative">
                      <Input
                        type={showApiKey ? 'text' : 'password'}
                        data-testid="agent-api-key-input"
                        value={form.api_key}
                        onChange={e => {
                          setApiKeyModified(true);
                          setForm(f => ({ ...f, api_key: e.target.value }));
                        }}
                        className="font-mono pr-16"
                        placeholder="sk-..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-stone-400 hover:text-rose-500 font-medium px-1 transition-colors cursor-pointer"
                      >
                        {showApiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  {form.provider === 'custom' && (
                    <div className="space-y-1">
                      <Label>Base URL</Label>
                      <Input
                        type="text"
                        value={form.base_url}
                        onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                        className="font-mono"
                        placeholder="https://your-endpoint/v1"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label>System Prompt Override</Label>
                      <span className="text-[10px] text-stone-400">Prepended to node prompt</span>
                    </div>
                    <Textarea
                      value={form.system_prompt}
                      onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                      className="h-28"
                      placeholder="Optional: override the default system persona for this agent..."
                    />
                  </div>

                  {error && <p className="text-xs text-red-500 font-medium bg-red-50 p-2 rounded-xl border border-red-100">{error}</p>}
                </Modal.Body>

                <Modal.Footer>
                  {!isNew ? (
                    confirmDeleteId ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-600 font-medium">Delete this agent?</span>
                        <Button variant="secondary" size="sm" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                        <Button variant="danger" size="sm" onClick={handleDeleteConfirm} data-testid="agent-delete-confirm">Confirm</Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={handleDeleteClick}
                        data-testid="agent-delete-btn"
                        icon={<Trash2 className="w-4 h-4" />}
                      >
                        Delete
                      </Button>
                    )
                  ) : <div />}
                  <div className="flex items-center gap-3">
                    {saveSuccess && <span className="text-xs text-green-600 font-medium flex items-center gap-1 bg-green-50 px-2 py-1 rounded-md">✓ Saved successfully</span>}
                    <Button
                      variant="primary"
                      onClick={handleSave}
                      disabled={saving}
                      data-testid="agent-save-btn"
                      icon={<Save className="w-4 h-4" />}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                </Modal.Footer>
              </>
            )}
          </div>
        </div>
      </Modal.Container>
    </Modal>
  );
};