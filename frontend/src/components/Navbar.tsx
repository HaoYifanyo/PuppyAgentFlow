import React, { useState, useRef, useEffect } from 'react';
import { Play, Loader2, FolderOpen, Save, History, FilePlus, Trash2, MoreHorizontal, Dog } from 'lucide-react';
import { Button } from './ui/Button';

interface NavbarProps {
  workflowName: string;
  setWorkflowName: (name: string) => void;
  runStatus: string;
  nodesLength: number;
  workflowId: string | null;
  onOpenDashboard: () => void;
  onOpenRunHistory: () => void;
  onSaveWorkflow: (showAlert?: boolean) => void;
  onCreateNewFlow: () => void;
  onClearCanvas: () => void;
  onPrepareRun: () => void;
  onOpenAgentLibrary: () => void;
}

const IconButton: React.FC<{
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}> = ({ onClick, title, children, disabled }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-rose-50 text-stone-500 hover:text-rose-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
  >
    {children}
  </button>
);

export const Navbar: React.FC<NavbarProps> = ({
  workflowName,
  setWorkflowName,
  runStatus,
  nodesLength,
  workflowId,
  onOpenDashboard,
  onOpenRunHistory,
  onSaveWorkflow,
  onCreateNewFlow,
  onClearCanvas,
  onPrepareRun,
  onOpenAgentLibrary,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const statusColor =
    runStatus === 'paused' ? 'text-amber-500' :
    runStatus === 'completed' ? 'text-green-500' :
    runStatus === 'error' ? 'text-red-500' :
    'text-rose-500';

  const statusDot =
    runStatus === 'paused' ? 'bg-amber-400' :
    runStatus === 'completed' ? 'bg-green-400' :
    runStatus === 'error' ? 'bg-red-400' :
    'bg-rose-400';

  return (
    <header className="h-14 bg-white border-b border-rose-100 flex items-center justify-between px-4 shrink-0 shadow-sm shadow-rose-900/5 z-10">
      {/* Left: Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-8 h-8 bg-rose-400 rounded-xl flex items-center justify-center text-white text-lg leading-none shadow-sm shadow-rose-200">🐶</div>
        <h1 className="font-bold text-lg text-stone-800 tracking-tight">Puppy<span className="text-rose-500">Flow</span></h1>
      </div>

      {/* Center: Flow name */}
      <div className="flex items-center gap-2 mx-4 min-w-0">
        <span className="text-xs text-stone-400 font-medium shrink-0">Flow:</span>
        <input
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          onBlur={() => { if (nodesLength > 0) onSaveWorkflow(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="font-semibold text-sm bg-transparent border-b border-transparent hover:border-rose-200 focus:border-rose-400 focus:outline-none transition-colors w-40 px-1 truncate text-stone-700"
          placeholder="Untitled Flow"
        />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Engine status */}
        <div className="flex items-center gap-1.5 mr-2 px-2.5 py-1 bg-stone-50 rounded-xl border border-stone-200 shadow-inner shadow-stone-900/5">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot} ${runStatus === 'running' ? 'animate-pulse' : ''}`} />
          <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${statusColor}`}>{runStatus}</span>
        </div>

        {/* Icon buttons */}
        <IconButton onClick={onOpenDashboard} title="My Workflows">
          <FolderOpen className="w-4 h-4 text-blue-400" />
        </IconButton>

        <IconButton onClick={onOpenAgentLibrary} title="Puppy Agents">
          <Dog className="w-4 h-4 text-amber-500" />
        </IconButton>

        {workflowId && (
          <IconButton onClick={onOpenRunHistory} title="Run History">
            <History className="w-4 h-4 text-purple-400" />
          </IconButton>
        )}

        <IconButton onClick={() => onSaveWorkflow(true)} title="Save">
          <Save className="w-4 h-4 text-green-500" />
        </IconButton>

        {/* Divider */}
        <div className="w-px h-5 bg-rose-100 mx-1" />

        {/* More menu */}
        <div className="relative" ref={menuRef}>
          <IconButton onClick={() => setMenuOpen(v => !v)} title="More actions">
            <MoreHorizontal className="w-4 h-4" />
          </IconButton>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-rose-100 rounded-2xl shadow-lg shadow-rose-900/10 py-1 z-50 overflow-hidden">
              <button
                onClick={() => { onCreateNewFlow(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 hover:bg-rose-50 hover:text-rose-600 transition-colors cursor-pointer"
              >
                <FilePlus className="w-4 h-4" /> Create New Flow
              </button>
              <button
                onClick={() => { onClearCanvas(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Clear Canvas
              </button>
            </div>
          )}
        </div>

        {/* Primary action */}
        <Button
          className="ml-2"
          size="sm"
          onClick={onPrepareRun}
          disabled={nodesLength === 0 || ['running', 'paused'].includes(runStatus)}
          icon={runStatus === 'running' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
        >
          Run
        </Button>
      </div>
    </header>
  );
};