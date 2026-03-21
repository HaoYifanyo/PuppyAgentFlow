import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Loader2, Sparkles, PlayCircle, Pencil, Trash2 } from 'lucide-react';
import { CreateSkillModal } from './CreateSkillModal';
import { EditSkillModal } from './EditSkillModal';
import { extractId } from '../utils/id';

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
    <aside className="w-64 bg-stone-50 border-r border-rose-100 flex flex-col h-full shadow-sm shadow-rose-900/5 z-10 shrink-0">
      <div className="p-4 border-b border-rose-100 bg-white">
        <h2 className="font-bold text-sm text-stone-800 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-rose-500" /> AI Skills
        </h2>
        <button
          onClick={() => setCreateSkillOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-400 to-pink-500 hover:from-rose-500 hover:to-pink-600 text-white rounded-xl shadow-sm text-xs font-bold transition-all duration-200 cursor-pointer shadow-rose-200 hover:shadow-rose-300"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Create Skill
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Core System Nodes */}
        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mt-2 mb-1 px-1">System Nodes</div>

        <div
          className="p-3 bg-white border border-green-200 rounded-2xl cursor-grab hover:border-green-400 hover:shadow-md hover:shadow-green-900/5 transition-all duration-200 group active:cursor-grabbing"
          onDragStart={(event) => onDragStart(event, {
            name: "Start",
            type: "system",
            description: "Entry point for the workflow. Define trigger rules.",
            implementation: "start-node"
          } as any)}
          draggable
        >
          <div className="flex justify-between items-start mb-1">
            <div className="font-bold text-xs text-stone-800 flex items-center gap-1.5">
              <PlayCircle className="w-4 h-4 text-green-500" /> Start Node
            </div>
            <div className="bg-green-50 text-green-600 text-[9px] px-2 py-0.5 rounded-full font-mono uppercase font-bold border border-green-100 tracking-wider">
              SYSTEM
            </div>
          </div>
          <div className="text-[10px] text-stone-500 leading-relaxed mt-1.5">
            Required entry point for all workflows.
          </div>
        </div>

        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mt-5 mb-1 px-1">AI Skills</div>

        {loading && (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 text-rose-400 animate-spin" />
          </div>
        )}

        {error && (
          <div className="text-xs text-red-500 bg-red-50 p-2 rounded-xl border border-red-100">
            {error}
          </div>
        )}

        {!loading && skills.length === 0 && !error && (
          <div className="text-center py-10 px-4 bg-white rounded-2xl border border-rose-100 border-dashed">
            <div className="w-10 h-10 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-2">
              <PlayCircle className="w-5 h-5 text-rose-300" />
            </div>
            <p className="text-sm font-semibold text-stone-700 mb-1">No skills yet</p>
            <p className="text-xs text-stone-500">Create one above to get started.</p>
          </div>
        )}

        {skills.map((skill) => {
          const id = extractId(skill._id || skill.id);
          const isConfirming = confirmDeleteId === id;
          return (
            <div
              key={id}
              className="relative p-3 bg-white border border-rose-100 rounded-2xl hover:border-rose-300 hover:shadow-md hover:shadow-rose-900/5 transition-all duration-200 group cursor-grab active:cursor-grabbing"
              onDragStart={(event) => !isConfirming && onDragStart(event, skill)}
              draggable={!isConfirming}
            >
              {/* Top row: name + action icons */}
              <div className="flex justify-between items-start mb-1 gap-2">
                <div className="font-bold text-xs text-stone-800 break-words leading-tight flex-1 pt-0.5">{skill.name}</div>
                <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingSkill(skill); }}
                    title="Edit skill"
                    className="w-6 h-6 flex items-center justify-center rounded-xl hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(id); }}
                    title="Delete skill"
                    className="w-6 h-6 flex items-center justify-center rounded-xl hover:bg-red-50 text-stone-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Type badge */}
              <div className="mb-2">
                <span className="bg-rose-50 text-rose-600 text-[9px] px-2 py-0.5 rounded-full font-mono uppercase font-bold border border-rose-100 tracking-wider inline-flex items-center">
                  <span className="w-1 h-1 rounded-full bg-rose-400 mr-1.5"></span>
                  {skill.type}
                </span>
              </div>

              <div className="text-[10px] text-stone-500 line-clamp-2 leading-relaxed">
                {skill.description || 'No description provided.'}
              </div>

              {/* Inline delete confirmation */}
              {isConfirming && (
                <div className="mt-3 pt-3 border-t border-rose-100/50 flex flex-col gap-2 bg-rose-50/50 -mx-3 -mb-3 p-3 rounded-b-2xl">
                  <span className="text-[10px] text-red-500 font-medium">Delete this skill permanently?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 py-1.5 text-[10px] rounded-lg border border-stone-200 text-stone-600 hover:bg-white bg-stone-50 transition-colors font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleDelete(id)}
                      data-testid="skill-delete-confirm"
                      className="flex-1 py-1.5 text-[10px] rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors shadow-sm font-medium cursor-pointer"
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