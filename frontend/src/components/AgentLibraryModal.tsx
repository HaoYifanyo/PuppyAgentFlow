import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Plus, Trash2, Save, Dog } from 'lucide-react';
import type { Agent, AgentProvider } from '../types/workflow';

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
    if (isNew && !form.api_key.trim()) { setError('API key is required for new agents'); return; }

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
      if (isNew) {
        payload.api_key = form.api_key.trim();
      } else if (apiKeyModified) {
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

  const handleDelete = async () => {
    if (!selectedId) return;
    if (!window.confirm('Delete this agent?')) return;
    try {
      await axios.delete(`/api/agents/${selectedId}`);
      setSelectedId(null);
      setForm(EMPTY_FORM);
      await fetchAgents();
      onAgentsChange();
    } catch {
      setError('Delete failed');
    }
  };

  if (!isOpen) return null;

  const hasForm = isNew || selectedId !== null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[720px] max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
            <Dog className="w-4 h-4 text-blue-500" /> Puppy Agents
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Agent list */}
          <div className="w-52 border-r flex flex-col bg-gray-50">
            <div className="p-2 border-b">
              <button
                onClick={handleNew}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> New Agent
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {agents.length === 0 && (
                <p className="text-[11px] text-gray-400 text-center mt-4 px-2">
                  No agents yet. Create one to assign a model to your LLM nodes.
                </p>
              )}
              {agents.map((agent) => {
                const id = agent._id || agent.id || '';
                const providerLabel = PROVIDER_OPTIONS.find(p => p.value === agent.provider)?.label ?? agent.provider;
                return (
                  <button
                    key={id}
                    onClick={() => handleSelect(agent)}
                    className={`w-full text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                      selectedId === id
                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                        : 'bg-white border-gray-200 hover:border-blue-200 text-gray-700'
                    }`}
                  >
                    <div className="font-semibold text-xs truncate">{agent.name}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5 truncate">{providerLabel}</div>
                    <div className="text-[10px] font-mono text-gray-400 truncate">{agent.model_id}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Form */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!hasForm ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
                Select an agent or create a new one
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700 block">Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="e.g. Flash Puppy"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700 block">Provider <span className="text-red-500">*</span></label>
                    <select
                      value={form.provider}
                      onChange={e => handleProviderChange(e.target.value as AgentProvider)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
                    >
                      {PROVIDER_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-700 block">Model ID <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={form.model_id}
                      onChange={e => setForm(f => ({ ...f, model_id: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                      placeholder="e.g. gemini-2.5-flash"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-700">API Key <span className="text-red-500">{isNew ? '*' : ''}</span></label>
                      <span className="text-[10px] text-gray-400">{isNew ? 'Required once; never shown again' : 'Leave blank to keep existing key. Clear to remove.'}</span>
                    </div>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        value={form.api_key}
                        onChange={e => {
                          setApiKeyModified(true);
                          setForm(f => ({ ...f, api_key: e.target.value }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none pr-16"
                        placeholder="sk-..."
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(v => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 hover:text-gray-600 px-1"
                      >
                        {showApiKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>

                  {form.provider === 'custom' && (
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-gray-700 block">Base URL</label>
                      <input
                        type="text"
                        value={form.base_url}
                        onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        placeholder="https://your-endpoint/v1"
                      />
                    </div>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-gray-700">System Prompt Override</label>
                      <span className="text-[10px] text-gray-400">Prepended to node prompt</span>
                    </div>
                    <textarea
                      value={form.system_prompt}
                      onChange={e => setForm(f => ({ ...f, system_prompt: e.target.value }))}
                      className="w-full h-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
                      placeholder="Optional: override the default system persona for this agent..."
                    />
                  </div>

                  {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                  {!isNew ? (
                    <button
                      onClick={handleDelete}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  ) : <div />}
                  <div className="flex items-center gap-3">
                    {saveSuccess && <span className="text-xs text-green-600 font-medium flex items-center gap-1">✓ Saved successfully</span>}
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-5 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
