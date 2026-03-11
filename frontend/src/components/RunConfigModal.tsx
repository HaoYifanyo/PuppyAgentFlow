import React, { useState, useEffect } from 'react';
import { X, Play } from 'lucide-react';

interface RunConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (inputs: Record<string, any>) => void;
  rootNode: { id: string; name: string; input_schema?: Record<string, any> } | null;
}

export const RunConfigModal: React.FC<RunConfigModalProps> = ({
  isOpen,
  onClose,
  onStart,
  rootNode
}) => {
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen && rootNode?.input_schema) {
      // Initialize inputs based on schema keys
      const initialInputs: Record<string, string> = {};
      Object.keys(rootNode.input_schema).forEach(key => {
        initialInputs[key] = '';
      });
      setInputs(initialInputs);
    }
  }, [isOpen, rootNode]);

  if (!isOpen || !rootNode) return null;

  const handleStart = () => {
    onStart(inputs);
  };

  const schemaKeys = rootNode.input_schema ? Object.keys(rootNode.input_schema) : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[450px] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800 text-sm">Start Workflow</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-600 leading-relaxed">
            Provide initial inputs for the starting node <strong>{rootNode.name}</strong>.
          </p>

          <div className="space-y-3">
            {schemaKeys.length > 0 ? (
              schemaKeys.map(key => (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-semibold text-gray-700 block capitalize">
                    {key.replace('_', ' ')}
                  </label>
                  <input
                    type="text"
                    value={inputs[key] || ''}
                    onChange={(e) => setInputs({ ...inputs, [key]: e.target.value })}
                    placeholder={`Enter ${key}...`}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              ))
            ) : (
              <div className="bg-amber-50 p-3 rounded border border-amber-200 text-amber-800 text-xs">
                No specific input schema defined for this node. You can start the workflow directly.
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
          >
            <Play className="w-4 h-4" />
            Run Now
          </button>
        </div>
      </div>
    </div>
  );
};
