import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { PlayCircle, Settings } from 'lucide-react';

export default memo(({ data }: any) => {
  return (
    <div className="group relative px-4 py-2 shadow-md rounded-md bg-green-50 border-2 border-green-500 min-w-[150px]">
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (data.onEditClick && data.node) {
            data.onEditClick(data.node);
          }
        }}
        className="absolute -right-2 -top-2 p-1.5 bg-white border border-gray-200 text-gray-400 hover:text-green-600 hover:border-green-300 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-all z-10"
        title="Start Node Settings"
      >
        <Settings className="w-3.5 h-3.5" />
      </button>

      <div className="flex items-center">
        <div className="rounded-full p-1 bg-green-100 mr-2">
          <PlayCircle className="w-4 h-4 text-green-600" />
        </div>
        <div className="ml-2">
          <div className="text-xs font-bold text-gray-800">{data.label || 'Start'}</div>
          <div className="text-[10px] text-gray-500">Entry Point</div>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-green-500" data-testid="start-handle" />
    </div>
  );
});
