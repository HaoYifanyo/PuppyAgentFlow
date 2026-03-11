import React, { useState, useEffect } from 'react';
import { X, Check, Plus, Trash2, ArrowRight } from 'lucide-react';

interface EdgeMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (mapping: Record<string, string>) => void;
  initialMapping: Record<string, string>;
  sourceNode: { id: string, name: string, skill_id: string, output_schema?: Record<string, any> } | null;
  targetNode: { id: string, name: string, skill_id: string, input_schema?: Record<string, any> } | null;
}

export const EdgeMappingModal: React.FC<EdgeMappingModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialMapping,
  sourceNode,
  targetNode
}) => {
  // Use an array of tuples for UI state: [targetKey, sourceKey]
  const [pairs, setPairs] = useState<[string, string][]>([]);

  // Extract available keys from schemas
  const sourceKeys = sourceNode?.output_schema ? Object.keys(sourceNode.output_schema) : [];
  const targetKeys = targetNode?.input_schema ? Object.keys(targetNode.input_schema) : [];

  useEffect(() => {
    if (isOpen) {
      if (Object.keys(initialMapping).length === 0) {
        setPairs([['', '']]); // start with one empty pair
      } else {
        setPairs(Object.entries(initialMapping));
      }
    }
  }, [isOpen, initialMapping]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Filter out empty rows and convert back to object
    const finalMapping: Record<string, string> = {};
    pairs.forEach(([targetKey, sourceKey]) => {
      if (targetKey.trim() && sourceKey.trim()) {
        finalMapping[targetKey.trim()] = sourceKey.trim();
      }
    });

    onSave(finalMapping);
  };

  const addRow = () => {
    setPairs([...pairs, ['', '']]);
  };

  const removeRow = (index: number) => {
    setPairs(pairs.filter((_, i) => i !== index));
  };

  const updatePair = (index: number, type: 'target' | 'source', value: string) => {
    const newPairs = [...pairs];
    if (type === 'target') {
      newPairs[index][0] = value;
    } else {
      newPairs[index][1] = value;
    }
    setPairs(newPairs);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[450px] overflow-hidden flex flex-col max-h-[80vh]">
        <div className="flex justify-between items-center p-4 border-b bg-gray-50">
          <h3 className="font-bold text-gray-800 text-sm">Configure Data Mapping</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto">
          <div className="text-xs text-gray-600 mb-4 bg-blue-50/50 p-3 rounded border border-blue-100 flex items-center justify-between gap-2 shadow-inner">
            <div className="flex flex-col flex-1">
              <span className="font-bold text-gray-800">{sourceNode?.name || sourceNode?.id}</span>
              <span className="text-[10px] text-gray-500 truncate">{sourceNode?.skill_id}</span>
            </div>

            <ArrowRight className="w-4 h-4 text-blue-400 shrink-0 mx-2" />

            <div className="flex flex-col flex-1 text-right">
              <span className="font-bold text-gray-800">{targetNode?.name || targetNode?.id}</span>
              <span className="text-[10px] text-gray-500 truncate">{targetNode?.skill_id}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex px-1 mb-1">
              <div className="flex-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Source Output Key</div>
              <div className="w-6"></div>
              <div className="flex-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Target Input Key</div>
              <div className="w-8"></div>
            </div>

            <div className="bg-gray-50 p-2 rounded-md mb-3 text-[10px] text-gray-500 border border-gray-100 italic">
              Tip: Enter the exact field name you want to extract from the source and pass into the target.
            </div>

            {pairs.map((pair, idx) => (
              <div key={idx} className="flex items-center gap-2 group">
                {sourceKeys.length > 0 ? (
                  <select
                    value={pair[1]}
                    onChange={(e) => updatePair(idx, 'source', e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono bg-white"
                  >
                    <option value="" disabled>Select output key</option>
                    {sourceKeys.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. summary"
                    value={pair[1]}
                    onChange={(e) => updatePair(idx, 'source', e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
                  />
                )}

                <ArrowRight className="w-4 h-4 text-gray-300" />

                {targetKeys.length > 0 ? (
                  <select
                    value={pair[0]}
                    onChange={(e) => updatePair(idx, 'target', e.target.value)}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono bg-white"
                  >
                    <option value="" disabled>Select input key</option>
                    {targetKeys.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. text"
                    value={pair[0]}
                    onChange={(e) => updatePair(idx, 'target', e.target.value)}
                    className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-mono"
                  />
                )}

                <button
                  onClick={() => removeRow(idx)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove mapping"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button
              onClick={addRow}
              className="flex items-center gap-1 mt-3 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Field Mapping
            </button>
          </div>
        </div>

        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50 mt-auto">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded border border-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors shadow-sm"
          >
            <Check className="w-3.5 h-3.5" /> Save Mapping
          </button>
        </div>
      </div>
    </div>
  );
};