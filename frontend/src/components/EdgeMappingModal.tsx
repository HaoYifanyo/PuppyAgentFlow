import React, { useState, useEffect } from 'react';
import { Check, Plus, Trash2, ArrowRight } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';

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
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Container width="w-[450px]">
        <Modal.Header title="Configure Data Mapping" onClose={onClose} />

        <Modal.Body className="overflow-y-auto max-h-[70vh]">
          <div className="text-xs text-stone-600 mb-4 bg-rose-50/50 p-3 rounded-xl border border-rose-100 flex items-center justify-between gap-2 shadow-inner shadow-rose-900/5">
            <div className="flex flex-col flex-1">
              <span className="font-bold text-stone-800">{sourceNode?.name || sourceNode?.id}</span>
              <span className="text-[10px] text-stone-500 truncate">{sourceNode?.skill_id}</span>
            </div>

            <ArrowRight className="w-4 h-4 text-rose-300 shrink-0 mx-2" />

            <div className="flex flex-col flex-1 text-right">
              <span className="font-bold text-stone-800">{targetNode?.name || targetNode?.id}</span>
              <span className="text-[10px] text-stone-500 truncate">{targetNode?.skill_id}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex px-1 mb-1">
              <div className="flex-1 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Source Output Key</div>
              <div className="w-6"></div>
              <div className="flex-1 text-[10px] font-bold text-stone-500 uppercase tracking-wider">Target Input Key</div>
              <div className="w-8"></div>
            </div>

            <div className="bg-stone-50 p-2 rounded-lg mb-3 text-[10px] text-stone-500 border border-stone-100 italic">
              Tip: Enter the exact field name you want to extract from the source and pass into the target.
            </div>

            {pairs.map((pair, idx) => (
              <div key={idx} className="flex items-center gap-2 group">
                {sourceKeys.length > 0 ? (
                  <select
                    value={pair[1]}
                    onChange={(e) => updatePair(idx, 'source', e.target.value)}
                    className="flex-1 px-3 py-2 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400 font-mono bg-stone-50 hover:bg-white transition-colors cursor-pointer"
                  >
                    <option value="" disabled>Select output key</option>
                    {sourceKeys.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    placeholder="e.g. summary"
                    value={pair[1]}
                    onChange={(e) => updatePair(idx, 'source', e.target.value)}
                    className="font-mono flex-1"
                  />
                )}

                <ArrowRight className="w-4 h-4 text-stone-300" />

                {targetKeys.length > 0 ? (
                  <select
                    value={pair[0]}
                    onChange={(e) => updatePair(idx, 'target', e.target.value)}
                    className="flex-1 px-3 py-2 border border-rose-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400 font-mono bg-stone-50 hover:bg-white transition-colors cursor-pointer"
                  >
                    <option value="" disabled>Select input key</option>
                    {targetKeys.map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                ) : (
                  <Input
                    type="text"
                    placeholder="e.g. text"
                    value={pair[0]}
                    onChange={(e) => updatePair(idx, 'target', e.target.value)}
                    className="font-mono flex-1"
                  />
                )}

                <button
                  onClick={() => removeRow(idx)}
                  className="p-2 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="Remove mapping"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            <Button
              variant="ghost"
              size="sm"
              onClick={addRow}
              icon={<Plus className="w-3.5 h-3.5" />}
              className="mt-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
            >
              Add Field Mapping
            </Button>
          </div>
        </Modal.Body>

        <Modal.Footer className="justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            icon={<Check className="w-3.5 h-3.5" />}
          >
            Save Mapping
          </Button>
        </Modal.Footer>
      </Modal.Container>
    </Modal>
  );
};