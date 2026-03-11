import React, { useState } from "react";
import axios from "axios";
import { X, Check, Loader2, Sparkles } from "lucide-react";

interface CreateSkillModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateSkillModal: React.FC<CreateSkillModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async () => {
    if (!instruction.trim()) {
      setError("Please enter what you want the skill to do");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/skills/generate", { instruction });
      onSuccess();
      onClose();
      setInstruction("");
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.detail ||
          "Failed to generate skill. Is the backend endpoint implemented?"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[500px] overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            AI Create Skill
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-700 block">
              What do you want to create?
            </label>
            <p className="text-xs text-gray-500 leading-relaxed">
              Describe the skill in natural language (e.g. "Create a node that
              takes an array of URLs and fetches their content", "A node that
              translates text to French").
            </p>
            <textarea
              className="w-full h-24 p-3 border border-gray-300 rounded-lg text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 shadow-inner"
              placeholder="E.g. summarize the text provided."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={loading}
            />
            {error && (
              <div className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Generate Skill
          </button>
        </div>
      </div>
    </div>
  );
};
