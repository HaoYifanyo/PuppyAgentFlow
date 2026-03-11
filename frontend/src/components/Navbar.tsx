import React from 'react';
import { Play, Loader2, FolderOpen, Save } from 'lucide-react';

interface NavbarProps {
  workflowName: string;
  setWorkflowName: (name: string) => void;
  runStatus: string;
  nodesLength: number;
  onOpenDashboard: () => void;
  onSaveWorkflow: (showAlert?: boolean) => void;
  onCreateNewFlow: () => void;
  onClearCanvas: () => void;
  onPrepareRun: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  workflowName,
  setWorkflowName,
  runStatus,
  nodesLength,
  onOpenDashboard,
  onSaveWorkflow,
  onCreateNewFlow,
  onClearCanvas,
  onPrepareRun
}) => {
  return (
    <header className="h-14 bg-white border-b px-6 flex items-center justify-between shadow-sm z-10">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl pb-1">🐶</div>
        <h1 className="font-bold text-xl text-gray-800 tracking-tight">Puppy<span className="text-blue-600">Flow</span></h1>
      </div>

      <div className="flex gap-4 items-center">
        <div className="flex items-center text-sm font-medium text-gray-700 border-r pr-4 border-gray-200">
          Flow:
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            onBlur={() => {
              if (nodesLength > 0) {
                onSaveWorkflow(false);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
              }
            }}
            className="ml-2 font-bold bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none transition-colors w-48 px-1"
            placeholder="Untitled Flow"
          />
        </div>

        <div className="text-xs font-mono bg-gray-100 px-3 py-1.5 rounded text-gray-600 border border-gray-200">
          Engine: <span className={`font-bold uppercase ${
            runStatus === 'paused' ? 'text-amber-600' :
            runStatus === 'completed' ? 'text-green-600' :
            runStatus === 'error' ? 'text-red-600' :
            'text-blue-600'
          }`}>{runStatus}</span>
        </div>

        <button
          onClick={onOpenDashboard}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded shadow-sm transition-colors cursor-pointer flex items-center gap-1"
        >
          <FolderOpen className="w-4 h-4 text-blue-600" /> My Workflows
        </button>

        <button
          onClick={() => onSaveWorkflow(true)}
          className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded shadow-sm transition-colors cursor-pointer flex items-center gap-1"
        >
          <Save className="w-4 h-4 text-green-600" /> Save
        </button>

        <button
          onClick={onCreateNewFlow}
          className="px-4 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded shadow-sm transition-colors cursor-pointer"
        >
          Create a New Flow
        </button>

        <button
          onClick={onClearCanvas}
          className="px-4 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded shadow-sm transition-colors cursor-pointer"
        >
          Clear Canvas
        </button>

        <button
          onClick={onPrepareRun}
          disabled={nodesLength === 0 || ['running', 'paused'].includes(runStatus)}
          className={`flex items-center gap-1 px-4 py-1.5 text-sm font-semibold rounded shadow transition-all ${
            nodesLength === 0 || ['running', 'paused'].includes(runStatus)
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
          }`}
        >
          {runStatus === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          Run Workflow
        </button>
      </div>
    </header>
  );
};
