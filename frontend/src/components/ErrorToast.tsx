import React, { useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface ErrorToastProps {
  message: string | null;
  onDismiss: () => void;
  duration?: number;
}

export const ErrorToast: React.FC<ErrorToastProps> = ({ message, onDismiss, duration = 8000 }) => {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  if (!message) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[480px] max-w-[90vw]">
      <div className="flex items-start gap-3 bg-white border border-red-200 rounded-xl shadow-lg px-4 py-3">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <p className="flex-1 text-sm text-gray-800 leading-snug">{message}</p>
        <button
          onClick={onDismiss}
          className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
