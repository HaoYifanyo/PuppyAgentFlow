import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input, Label } from './ui/Input';

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
    <Modal isOpen={isOpen} onClose={onClose}>
      <Modal.Container width="w-[450px]">
        <Modal.Header title="Start Workflow" onClose={onClose} />

        <Modal.Body>
          <p className="text-xs text-stone-600 leading-relaxed">
            Provide initial inputs for the starting node <strong>{rootNode.name}</strong>.
          </p>

          <div className="space-y-3">
            {schemaKeys.length > 0 ? (
              schemaKeys.map(key => (
                <div key={key} className="space-y-1">
                  <Label className="capitalize">
                    {key.replace('_', ' ')}
                  </Label>
                  <Input
                    type="text"
                    value={inputs[key] || ''}
                    onChange={(e) => setInputs({ ...inputs, [key]: e.target.value })}
                    placeholder={`Enter ${key}...`}
                  />
                </div>
              ))
            ) : (
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-amber-800 text-xs">
                No specific input schema defined for this node. You can start the workflow directly.
              </div>
            )}
          </div>
        </Modal.Body>

        <Modal.Footer className="justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleStart}
            icon={<Play className="w-4 h-4 fill-current" />}
          >
            Run Now
          </Button>
        </Modal.Footer>
      </Modal.Container>
    </Modal>
  );
};