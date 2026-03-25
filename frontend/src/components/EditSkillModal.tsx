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

  // Browser Use specific state
  const [browserTask, setBrowserTask] = useState("");
  const [browserMaxSteps, setBrowserMaxSteps] = useState(20);
  const [browserHeadless, setBrowserHeadless] = useState(false);
  const [browserProfile, setBrowserProfile] = useState("");
  const [browserChannel, setBrowserChannel] = useState("chromium");
  const [browserExecutablePath, setBrowserExecutablePath] = useState("");
  const [browserUserDataDir, setBrowserUserDataDir] = useState("");
  const [browserProfileDirectory, setBrowserProfileDirectory] = useState("");

  useEffect(() => {
    if (!skill) return;
    setName(skill.name);
    setType(skill.type);
    setDescription(skill.description);

    if (skill.type === "llm") {
      setImplText(skill.implementation?.prompt_template ?? "");
    } else if (skill.type === "browser_use") {
      // Load browser_use config
      setBrowserTask(skill.implementation?.task_template ?? "");
      setBrowserMaxSteps(skill.implementation?.max_steps ?? 20);
      setBrowserHeadless(skill.implementation?.browser_config?.headless ?? false);
      setBrowserProfile(skill.implementation?.browser_config?.profile_name ?? "");
      setBrowserChannel(skill.implementation?.browser_config?.channel ?? "chromium");
      setBrowserExecutablePath(skill.implementation?.browser_config?.executable_path ?? "");
      setBrowserUserDataDir(skill.implementation?.browser_config?.user_data_dir ?? "");
      setBrowserProfileDirectory(skill.implementation?.browser_config?.profile_directory ?? "");
      setImplText("");
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
    if (type === "browser_use") {
      const browserConfig: Record<string, any> = {
        headless: browserHeadless,
      };
      if (browserProfile.trim()) browserConfig.profile_name = browserProfile.trim();
      if (browserChannel !== "chromium") browserConfig.channel = browserChannel;
      if (browserExecutablePath.trim()) browserConfig.executable_path = browserExecutablePath.trim();
      if (browserUserDataDir.trim()) browserConfig.user_data_dir = browserUserDataDir.trim();
      if (browserProfileDirectory.trim()) browserConfig.profile_directory = browserProfileDirectory.trim();

      return {
        executor_type: "browser_use",
        task_template: browserTask,
        max_steps: browserMaxSteps,
        browser_config: browserConfig,
      };
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
              <option value="browser_use">Browser Use</option>
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

          {/* Implementation - conditional rendering based on type */}
          {type === "browser_use" ? (
            <>
              {/* Browser Use Task Description */}
              <div className="space-y-1">
                <Label>Task Description</Label>
                <p className="text-xs text-stone-500">
                  Describe what the browser should do. Use {"{{variable}}"} for dynamic values from upstream nodes.
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

              {/* Advanced Browser Settings */}
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer text-sm font-medium text-stone-600 hover:text-stone-800 py-2">
                  <span>Advanced Browser Settings</span>
                  <span className="text-stone-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="space-y-3 pt-2 border-t border-stone-100">
                  {/* Browser Channel */}
                  <div className="space-y-1">
                    <Label>Browser Type</Label>
                    <select
                      value={browserChannel}
                      onChange={(e) => setBrowserChannel(e.target.value)}
                      className="w-full px-3 py-2 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400 outline-none bg-stone-50 hover:bg-white transition-colors cursor-pointer"
                      disabled={loading}
                    >
                      <option value="chromium">Chromium (Default, playwright built-in)</option>
                      <option value="chrome">Chrome (System installed)</option>
                      <option value="chrome-beta">Chrome Beta</option>
                      <option value="msedge">Microsoft Edge</option>
                    </select>
                    <p className="text-xs text-stone-400">
                      {browserChannel === "chromium" 
                        ? "Uses playwright's built-in Chromium browser" 
                        : `Uses system installed ${browserChannel} browser`}
                    </p>
                  </div>

                  {/* Executable Path */}
                  <div className="space-y-1">
                    <Label>Browser Executable Path (Optional)</Label>
                    <Input
                      type="text"
                      value={browserExecutablePath}
                      onChange={(e) => setBrowserExecutablePath(e.target.value)}
                      placeholder="e.g. C:\Program Files\Google\Chrome\Application\chrome.exe"
                      disabled={loading}
                    />
                    <p className="text-xs text-stone-400">
                      Custom browser path. Leave empty to auto-detect.
                    </p>
                  </div>

                  {/* User Data Directory */}
                  <div className="space-y-1">
                    <Label>User Data Directory (Optional)</Label>
                    <Input
                      type="text"
                      value={browserUserDataDir}
                      onChange={(e) => setBrowserUserDataDir(e.target.value)}
                      placeholder="e.g. C:\Users\YourName\AppData\Local\Google\Chrome\User Data"
                      disabled={loading}
                    />
                    <p className="text-xs text-stone-400">
                      Use existing Chrome profile to keep login state. Close Chrome first.
                    </p>
                  </div>

                  {/* Profile Directory */}
                  <div className="space-y-1">
                    <Label>Profile Directory (Optional)</Label>
                    <Input
                      type="text"
                      value={browserProfileDirectory}
                      onChange={(e) => setBrowserProfileDirectory(e.target.value)}
                      placeholder="e.g. Default, Profile 1"
                      disabled={loading}
                    />
                    <p className="text-xs text-stone-400">
                      Chrome profile name. Use with User Data Directory.
                    </p>
                  </div>
                </div>
              </details>
            </>
          ) : (
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
          )}

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