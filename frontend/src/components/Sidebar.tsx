import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Loader2, Sparkles, PlayCircle, Pencil, Trash2 } from 'lucide-react';
import { CreateSkillModal } from './CreateSkillModal';
import { EditSkillModal } from './EditSkillModal';

interface Skill {
  _id?: string;
  id?: string;
  name: string;
  type: string;
  description: string;
  implementation: Record<string, any>;
}

export const Sidebar = () => {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createSkillOpen, setCreateSkillOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/skills');
      setSkills(res.data);
    } catch (err: any) {
      console.error('Failed to fetch skills', err);
      setError('Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/skills/${id}`);
      setConfirmDeleteId(null);
      fetchSkills();
    } catch (err) {
      console.error('Failed to delete skill', err);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, [fetchSkills]);

  const onDragStart = (event: React.DragEvent, skill: Skill) => {
    const skillData = JSON.stringify(skill);
    event.dataTransfer.setData('application/reactflow/skill', skillData);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-64 bg-white border-r h-full flex flex-col shadow-sm z-10">
      <div className="p-4 border-b bg-gray-50 space-y-3">
        <h2 className="font-bold text-gray-800 text-sm flex items-center gap-2">
          🛠️ Skills Library
        </h2>

        <button
          onClick={() => setCreateSkillOpen(true)}
          className="w-full px-3 py-2 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <Sparkles className="w-3.5 h-3.5" /> Create Skill with AI
        </button>

        <p className="text-[10px] text-gray-500 leading-tight">
          Drag and drop skills onto the canvas to create new nodes.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-white">
        {/* Core System Nodes */}
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-2 mb-1 px-1">System Nodes</div>

        <div
          className="p-3 bg-white border border-green-200 rounded-lg cursor-grab hover:border-green-500 hover:shadow-md transition-all group active:cursor-grabbing"
          onDragStart={(event) => onDragStart(event, {
            name: "Start",
            type: "system",
            description: "Entry point for the workflow. Define trigger rules.",
            implementation: "start-node"
          } as any)}
          draggable
        >
          <div className="flex justify-between items-start mb-1">
            <div className="font-bold text-xs text-gray-800 flex items-center gap-1">
              <PlayCircle className="w-3.5 h-3.5 text-green-600" /> Start Node
            </div>
            <div className="bg-green-50 text-green-700 text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold border border-green-100">
              SYSTEM
            </div>
          </div>
          <div className="text-[10px] text-gray-500 leading-tight">
            Required entry point for all workflows.
          </div>
        </div>

        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mt-4 mb-1 px-1">AI Skills</div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          </div>
        )}

        {error && <div className="text-xs text-red-500 bg-red-50 p-2 rounded">{error}</div>}

        {!loading && skills.length === 0 && !error && (
          <div className="text-xs text-gray-500 text-center py-8">No skills available. Create one first!</div>
        )}

        {skills.map((skill) => {
          const id = skill._id || skill.id || '';
          const isConfirming = confirmDeleteId === id;
          return (
            <div
              key={id}
              className="relative p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-400 hover:shadow-md transition-all group"
              onDragStart={(event) => !isConfirming && onDragStart(event, skill)}
              draggable={!isConfirming}
            >
              {/* Top row: name + action icons */}
              <div className="flex justify-between items-center mb-1">
                <div className="font-bold text-xs text-gray-800 truncate pr-1">{skill.name}</div>
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingSkill(skill); }}
                    title="Edit skill"
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(id); }}
                    title="Delete skill"
                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Type badge */}
              <div className="mb-1.5">
                <span className="bg-blue-50 text-blue-700 text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-bold border border-blue-100">
                  {skill.type}
                </span>
              </div>

              <div className="text-[10px] text-gray-500 line-clamp-2 leading-tight">
                {skill.description || 'No description provided.'}
              </div>

              {/* Inline delete confirmation */}
              {isConfirming && (
                <div className="mt-2 pt-2 border-t border-red-100 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-red-600 font-medium">Delete this skill?</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2 py-0.5 text-[10px] rounded border border-gray-300 text-gray-600 hover:bg-gray-50 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(id)}
                      className="px-2 py-0.5 text-[10px] rounded bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CreateSkillModal
        isOpen={createSkillOpen}
        onClose={() => setCreateSkillOpen(false)}
        onSuccess={fetchSkills}
      />

      <EditSkillModal
        skill={editingSkill}
        onClose={() => setEditingSkill(null)}
        onSuccess={fetchSkills}
      />
    </aside>
  );
};
