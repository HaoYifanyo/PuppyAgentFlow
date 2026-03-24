import { useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import { X, FileJson, Copy, Check } from "lucide-react";

interface NodeDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeName: string;
  inputs?: Record<string, unknown>;
  outputs?: unknown;
}

const extractResult = (data: unknown): string => {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "result" in data) {
    const result = (data as Record<string, unknown>).result;
    if (typeof result === "string") return result;
    return JSON.stringify(result, null, 2);
  }
  return JSON.stringify(data, null, 2);
};

export const NodeDataModal: React.FC<NodeDataModalProps> = ({
  isOpen,
  onClose,
  nodeName,
  inputs,
  outputs,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const hasInputs = inputs && Object.keys(inputs).length > 0;
  const resultText = outputs !== undefined && outputs !== null ? extractResult(outputs) : null;

  const handleCopy = () => {
    if (resultText) {
      navigator.clipboard.writeText(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center z-[9999]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-rose-100 flex flex-col overflow-hidden"
        style={{ width: "90vw", height: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-rose-100 bg-rose-50/50 shrink-0">
          <h3 className="font-bold text-stone-800 text-base flex items-center gap-2">
            <FileJson className="w-5 h-5 text-rose-400" />
            {nodeName}
          </h3>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-rose-600 transition-colors p-1 rounded-full hover:bg-rose-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Inputs */}
          {hasInputs && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  Inputs
                </span>
              </div>
              <pre className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-sm font-mono whitespace-pre-wrap break-words text-stone-600 overflow-auto max-h-48">
                {JSON.stringify(inputs, null, 2)}
              </pre>
            </div>
          )}

          {/* Output */}
          {resultText && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2 py-0.5 rounded">
                  Output
                </span>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 text-[11px] text-stone-500 hover:text-rose-500 transition-colors px-2 py-1 rounded-lg hover:bg-stone-100 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-500" />
                      <span className="text-green-500">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <div className="prose prose-stone max-w-none flex-1
                prose-headings:text-stone-800
                prose-p:text-stone-600 prose-p:leading-relaxed
                prose-code:bg-stone-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-rose-600 prose-code:before:content-[''] prose-code:after:content-['']
                prose-pre:bg-stone-50 prose-pre:border prose-pre:border-stone-200 prose-pre:rounded-xl
                prose-ul:text-stone-600 prose-ol:text-stone-600
                prose-li:marker:text-rose-400
                prose-a:text-rose-500 prose-a:no-underline hover:prose-a:underline
                prose-strong:text-stone-700
              ">
                <ReactMarkdown>{resultText}</ReactMarkdown>
              </div>
            </div>
          )}

          {!hasInputs && !resultText && (
            <div className="text-center py-16 text-stone-400">
              <FileJson className="w-10 h-10 mx-auto mb-3 text-stone-300" />
              <p className="text-sm">No run data available</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
