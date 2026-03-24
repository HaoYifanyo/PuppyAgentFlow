import React, { useState } from "react";
import axios from "axios";
import { Loader2, Sparkles, Plus } from "lucide-react";
import { Modal } from "./ui/Modal";
import { Button } from "./ui/Button";
import { Input, Label, Textarea } from "./ui/Input";

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
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AI mode state
  const [instruction, setInstruction] = useState("");

  // Manual mode state
  const [name, setName] = useState("");
  const [type, setType] = useState("llm");
  const [description, setDescription] = useState("");
  const [implText, setImplText] = useState("");

  // Browser Use specific state
  const [browserTask, setBrowserTask] = useState("");
  const [browserMaxSteps, setBrowserMaxSteps] = useState(20);
  const [browserHeadless, setBrowserHeadless] = useState(false);
  const [browserProfile, setBrowserProfile] = useState("");

  if (!isOpen) return null;

  const resetForm = () => {
    setInstruction("");
    setName("");
    setType("llm");
    setDescription("");
    setImplText("");
    setBrowserTask("");
    setBrowserMaxSteps(20);
    setBrowserHeadless(false);
    setBrowserProfile("");
    setError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const buildImplementation = (): Record<string, any> | null => {
    if (type === "llm") {
      return { prompt_template: implText };
    }
    if (type === "browser_use") {
      const impl: Record<string, any> = {
        executor_type: "browser_use",
        task_template: browserTask,
        max_steps: browserMaxSteps,
        browser_config: {
          headless: browserHeadless,
        },
      };
      if (browserProfile.trim()) {
        impl.browser_config.profile_name = browserProfile.trim();
      }
      return impl;
    }
    try {
      return JSON.parse(implText);
    } catch {
      setError("Implementation must be valid JSON for non-LLM skills.");
      return null;
    }
  };

  const handleAiCreate = async () => {
    if (!instruction.trim()) {
      setError("Please enter what you want the skill to do");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/skills/generate", { instruction });
      onSuccess();
      handleClose();
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

  const handleManualCreate = async () => {
    if (!name.trim()) {
      setError("Skill name is required.");
      return;
    }

    const implementation = buildImplementation();
    if (implementation === null) return;

    setLoading(true);
    setError(null);
    try {
      await axios.post("/api/skills", { name, type, description, implementation });
      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.response?.data?.detail ?? "Failed to create skill.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <Modal.Container width="w-[520px]">
        <Modal.Header
          title="Create Skill"
          icon={<Plus className="w-4 h-4 text-rose-500" />}
          onClose={handleClose}
        />

        <Modal.Body className="max-h-[70vh] overflow-y-auto">
          {/* Mode Selector */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("ai")}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                mode === "ai"
                  ? "bg-rose-500 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              <Sparkles className="w-4 h-4 inline mr-1" />
              AI Generate
            </button>
            <button
              onClick={() => setMode("manual")}
              className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                mode === "manual"
                  ? "bg-rose-500 text-white"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200"
              }`}
            >
              <Plus className="w-4 h-4 inline mr-1" />
              Manual Create
            </button>
          </div>

          {mode === "ai" ? (
            /* AI Generate Mode */
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
            </div>
          ) : (
            /* Manual Create Mode */
            <div className="space-y-3">
              {/* Name */}
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="E.g. LinkedIn Job Search"
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
                  <option value="browser_use">Browser Use</option>
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <Label>Description</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="resize-none"
                  placeholder="Brief description of what this skill does"
                  disabled={loading}
                />
              </div>

              {/* Implementation - conditional rendering based on type */}
              {type === "browser_use" ? (
                <>
                  {/* Browser Use Task Description */}
                  <div className="space-y-1">
                    <Label>Task Description</Label>
                    <p className="text-xs text-stone-500">
                      Describe what the browser should do. Use {"{{variable}}"} for dynamic values.
                    </p>
                    <Textarea
                      value={browserTask}
                      onChange={(e) => setBrowserTask(e.target.value)}
                      rows={4}
                      placeholder="E.g. Search for {{keyword}} jobs in {{location}} and extract the top 5 results"
                      disabled={loading}
                    />
                  </div>

                  {/* Browser Use Config */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Max Steps</Label>
                      <Input
                        type="number"
                        value={browserMaxSteps}
                        onChange={(e) => setBrowserMaxSteps(parseInt(e.target.value) || 20)}
                        min={1}
                        max={100}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Browser Profile (Optional)</Label>
                      <Input
                        type="text"
                        value={browserProfile}
                        onChange={(e) => setBrowserProfile(e.target.value)}
                        placeholder="e.g. linkedin_profile"
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {/* Headless Toggle */}
                  <div className="flex items-center justify-between py-2">
                    <Label className="mb-0">Headless Mode</Label>
                    <button
                      type="button"
                      onClick={() => setBrowserHeadless(!browserHeadless)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        browserHeadless ? "bg-rose-500" : "bg-stone-300"
                      }`}
                      disabled={loading}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          browserHeadless ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <Label>
                    {type === "llm" ? "Prompt Template" : "Implementation (JSON)"}
                  </Label>
                  <Textarea
                    value={implText}
                    onChange={(e) => setImplText(e.target.value)}
                    rows={6}
                    className="font-mono resize-y"
                    placeholder={type === "llm" ? "Enter prompt template..." : '{ "key": "value" }'}
                    disabled={loading}
                  />
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-red-500 bg-red-50 p-2 rounded-xl border border-red-100 mt-3">
              {error}
            </div>
          )}
        </Modal.Body>

        <Modal.Footer className="justify-end gap-2">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={mode === "ai" ? handleAiCreate : handleManualCreate}
            disabled={loading}
            icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (mode === "ai" ? <Sparkles className="w-4 h-4" /> : <Plus className="w-4 h-4" />)}
          >
            {mode === "ai" ? "Generate Skill" : "Create Skill"}
          </Button>
        </Modal.Footer>
      </Modal.Container>
    </Modal>
  );
};
