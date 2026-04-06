import React, { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { GitBranch, Settings } from 'lucide-react';

export default memo(({ data }: any) => {
  const runData = data.runData;
  const status = runData?.status;

  const borderColor =
    status === 'completed' ? 'border-green-400' :
    status === 'running' ? 'border-blue-400' :
    status === 'error' ? 'border-red-400' :
    'border-amber-400';

  const bgColor =
    status === 'completed' ? 'bg-green-50' :
    status === 'running' ? 'bg-blue-50' :
    status === 'error' ? 'bg-red-50' :
    'bg-amber-50';

  return (
    <div className="relative" style={{ width: 120, height: 120 }}>
      {/* Diamond shape */}
      <div
        className={`absolute border-2 ${borderColor} ${bgColor} shadow-md`}
        style={{ transform: 'rotate(45deg)', borderRadius: 8, top: 10, left: 10, width: 100, height: 100 }}
      />

      {/* Content (not rotated) */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none">
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (data.onEditClick && data.node) {
              data.onEditClick(data.node);
            }
          }}
          className="absolute right-1 top-1 p-1 text-amber-300 hover:text-amber-600 transition-colors rounded focus-visible:ring-2 focus-visible:ring-amber-400 pointer-events-auto"
          title="Condition Node Settings"
          aria-label="Condition Node Settings"
        >
          <Settings className="w-3 h-3" />
        </button>

        <GitBranch className="w-4 h-4 text-amber-600 mb-1" />
        <div className="text-[10px] font-bold text-gray-800 leading-snug text-center px-2 max-w-[100px] truncate">
          {data.node?.name || 'Condition'}
        </div>
      </div>

      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 !bg-amber-500"
        style={{ top: '50%', left: 0 }}
      />

      {/* Source handle: True (top-right area) */}
      <Handle
        type="source"
        position={Position.Right}
        id="handle-true"
        className="w-2 h-2 !bg-green-500"
        style={{ top: '30%', right: 0 }}
      />
      <span
        className="absolute text-[8px] font-bold text-green-600 pointer-events-none"
        style={{ top: '24%', right: -18 }}
      >
        T
      </span>

      {/* Source handle: False (bottom-right area) */}
      <Handle
        type="source"
        position={Position.Right}
        id="handle-false"
        className="w-2 h-2 !bg-red-500"
        style={{ top: '70%', right: 0 }}
      />
      <span
        className="absolute text-[8px] font-bold text-red-600 pointer-events-none"
        style={{ top: '64%', right: -16 }}
      >
        F
      </span>
    </div>
  );
});
