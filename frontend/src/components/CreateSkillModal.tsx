import React, { useState } from "react";
import axios from "axios";
import { Loader2, Sparkles } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Label, Textarea } from "./ui/Input";

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
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Container>
        <Modal.Header
          title="AI Create Skill"
          icon={<Sparkles className="w-4 h-4 text-rose-500" />}
          onClose={onClose}
        />

        <Modal.Body>
          <div className="space-y-2">
            <Label>What do you want to create?</Label>
            <p className="text-xs text-stone-500 leading-relaxed">
              Describe the skill in natural language (e.g. "Create a node that
              takes an array of URLs and fetches their content", "A node that
              translates text to French").
            </p>
            <Textarea
              className="h-24 shadow-inner"
              placeholder="E.g. summarize the text provided."
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              disabled={loading}
            />
            {error && (
              <div className="text-xs text-red-500 bg-red-50 p-2 rounded-xl border border-red-100">
                {error}
              </div>
            )}
          </div>
        </Modal.Body>

        <Modal.Footer className="justify-end gap-2">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={loading}
            icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          >
            Generate Skill
          </Button>
        </Modal.Footer>
      </Modal.Container>
    </Modal>
  );
};
