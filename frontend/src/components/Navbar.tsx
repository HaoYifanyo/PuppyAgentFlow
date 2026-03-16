import React, { useState, useRef, useEffect } from 'react';
import { Play, Loader2, FolderOpen, Save, History, FilePlus, Trash2, MoreHorizontal, Dog } from 'lucide-react';

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
    className="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
    'text-blue-500';

  const statusDot =
    runStatus === 'paused' ? 'bg-amber-400' :
    runStatus === 'completed' ? 'bg-green-400' :
    runStatus === 'error' ? 'bg-red-400' :
    'bg-blue-400';

  return (
    <header className="h-12 bg-white border-b px-4 flex items-center justify-between shadow-sm z-10">
      {/* Left: Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 bg-blue-600 rounded-md flex items-center justify-center text-white text-base leading-none">🐶</div>
        <h1 className="font-bold text-lg text-gray-800 tracking-tight">Puppy<span className="text-blue-600">Flow</span></h1>
      </div>

      {/* Center: Flow name */}
      <div className="flex items-center gap-2 mx-4 min-w-0">
        <span className="text-xs text-gray-400 shrink-0">Flow:</span>
        <input
          type="text"
          value={workflowName}
          onChange={(e) => setWorkflowName(e.target.value)}
          onBlur={() => { if (nodesLength > 0) onSaveWorkflow(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
          className="font-semibold text-sm bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none transition-colors w-40 px-1 truncate"
          placeholder="Untitled Flow"
        />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Engine status */}
        <div className="flex items-center gap-1.5 mr-2 px-2 py-1 bg-gray-50 rounded border border-gray-200">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          <span className={`text-xs font-mono font-semibold uppercase ${statusColor}`}>{runStatus}</span>
        </div>

        {/* Icon buttons */}
        <IconButton onClick={onOpenDashboard} title="My Workflows">
          <FolderOpen className="w-4 h-4 text-blue-500" />
        </IconButton>

        <IconButton onClick={onOpenAgentLibrary} title="Puppy Agents">
          <Dog className="w-4 h-4 text-orange-500" />
        </IconButton>

        {workflowId && (
          <IconButton onClick={onOpenRunHistory} title="Run History">
            <History className="w-4 h-4 text-purple-500" />
          </IconButton>
        )}

        <IconButton onClick={() => onSaveWorkflow(true)} title="Save">
          <Save className="w-4 h-4 text-green-600" />
        </IconButton>

        {/* Divider */}
        <div className="w-px h-5 bg-gray-200 mx-1" />

        {/* More menu */}
        <div className="relative" ref={menuRef}>
          <IconButton onClick={() => setMenuOpen(v => !v)} title="More actions">
            <MoreHorizontal className="w-4 h-4" />
          </IconButton>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50">
              <button
                onClick={() => { onCreateNewFlow(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <FilePlus className="w-4 h-4 text-blue-500" /> Create New Flow
              </button>
              <button
                onClick={() => { onClearCanvas(); setMenuOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Clear Canvas
              </button>
            </div>
          )}
        </div>

        {/* Primary action */}
        <button
          onClick={onPrepareRun}
          disabled={nodesLength === 0 || ['running', 'paused'].includes(runStatus)}
          className={`ml-2 flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md shadow-sm transition-all ${
            nodesLength === 0 || ['running', 'paused'].includes(runStatus)
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
          }`}
        >
          {runStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          Run
        </button>
      </div>
    </header>
  );
};
