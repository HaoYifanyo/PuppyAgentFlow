import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { PlayCircle, Settings } from 'lucide-react';

export default memo(({ data }: any) => {
  return (
    <div className="relative shadow-md rounded-xl bg-green-50 border-2 border-green-400 flex flex-col items-center text-center px-3 pt-3 pb-3" style={{ width: 140 }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (data.onEditClick && data.node) {
            data.onEditClick(data.node);
          }
        }}
        className="absolute right-1.5 top-1.5 p-1 text-green-300 hover:text-green-600 transition-colors rounded focus-visible:ring-2 focus-visible:ring-green-400"
        title="Start Node Settings"
        aria-label="Start Node Settings"
      >
        <Settings className="w-3 h-3" />
      </button>

      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center mb-1.5">
        <PlayCircle className="w-4 h-4 text-green-600" />
      </div>
      <div className="text-xs font-bold text-gray-800 leading-snug">{data.label || 'Start'}</div>
      <div className="mt-1.5 inline-flex items-center text-[9px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        Entry Point
      </div>

      <Handle type="source" position={Position.Right} className="w-2 h-2 !bg-green-500" data-testid="start-handle" />
    </div>
  );
});
