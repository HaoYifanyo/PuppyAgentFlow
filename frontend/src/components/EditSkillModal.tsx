import React, { useState, useEffect } from "react";
import axios from "axios";
import { Save, Loader2 } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input, Label, Textarea } from "./ui/Input";
import { extractId } from "../utils/id";

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

  const skillId = extractId(skill._id || skill.id);

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
    <Modal isOpen={!!skill} onClose={onClose}>
      <Modal.Container width="w-[520px]">
        <Modal.Header title="Edit Skill" onClose={onClose} />

        <Modal.Body className="max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div className="space-y-1">
            <Label>Name</Label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Type */}
          <div className="space-y-1">
            <Label>Type</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none bg-stone-50 hover:bg-white transition-colors cursor-pointer"
              disabled={loading}
            >
              <option value="llm">LLM</option>
              <option value="tool">Tool</option>
            </select>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              data-testid="edit-skill-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="resize-none"
              disabled={loading}
            />
          </div>

          {/* Implementation */}
          <div className="space-y-1">
            <Label>
              {type === "llm" ? "Prompt Template" : "Implementation (JSON)"}
            </Label>
            <Textarea
              value={implText}
              onChange={(e) => setImplText(e.target.value)}
              rows={8}
              className="font-mono resize-y"
              placeholder={type === "llm" ? "Enter prompt template..." : '{ "key": "value" }'}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="text-xs text-red-500 bg-red-50 p-2 rounded-xl border border-red-100">{error}</div>
          )}
        </Modal.Body>

        <Modal.Footer className="justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={loading}
            icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          >
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal.Container>
    </Modal>
  );
};