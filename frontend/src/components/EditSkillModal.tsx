import React, { useState, useEffect } from "react";
import axios from "axios";
import { X, Save, Loader2 } from "lucide-react";

interface Skill {
  _id?: string;
  id?: string;
  name: string;
  type: string;
  description: string;
  implementation: Record<string, any>;
  input_schema?: Record<string, any>;
  output_schema?: Record<string, any>;
}

interface EditSkillModalProps {
  skill: Skill | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditSkillModal: React.FC<EditSkillModalProps> = ({ skill, onClose, onSuccess }) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("llm");
  const [description, setDescription] = useState("");
  const [implText, setImplText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!skill) return;
    setName(skill.name);
    setType(skill.type);
    setDescription(skill.description);

    if (skill.type === "llm") {
      setImplText(skill.implementation?.prompt_template ?? "");
    } else {
      try {
        setImplText(JSON.stringify(skill.implementation, null, 2));
      } catch {
        setImplText("");
      }
    }
    setError(null);
  }, [skill]);

  if (!skill) return null;

  const skillId = skill._id || skill.id;

  const buildImplementation = (): Record<string, any> | null => {
    if (type === "llm") {
      return { prompt_template: implText };
    }
    try {
      return JSON.parse(implText);
    } catch {
      setError("Implementation must be valid JSON for non-LLM skills.");
      return null;
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Skill name is required.");
      return;
    }

    const implementation = buildImplementation();
    if (implementation === null) return;

    setLoading(true);
    setError(null);
    try {
      await axios.put(`/api/skills/${skillId}`, { name, type, description, implementation });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to update skill.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[520px] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800 text-sm">Edit Skill</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Name */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 block">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              disabled={loading}
            />
          </div>

          {/* Type */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 block">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none bg-white"
              disabled={loading}
            >
              <option value="llm">LLM</option>
              <option value="tool">Tool</option>
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 block">Description</label>
            <textarea
              data-testid="edit-skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
              disabled={loading}
            />
          </div>

          {/* Implementation */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-gray-600 block">
              {type === "llm" ? "Prompt Template" : "Implementation (JSON)"}
            </label>
            <textarea
              value={implText}
              onChange={(e) => setImplText(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-y"
              placeholder={type === "llm" ? "Enter prompt template..." : '{ "key": "value" }'}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
