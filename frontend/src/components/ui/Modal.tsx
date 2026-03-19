import type { ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
}

export const Modal = ({ isOpen, onClose, children }: ModalProps) => {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      {children}
    </div>
  );
};

Modal.Container = ({ children, width = 'w-[500px]' }: { children: ReactNode; width?: string }) => (
  <div className={`modal-container ${width} flex flex-col`} onClick={e => e.stopPropagation()}>
    {children}
  </div>
);

Modal.Header = ({ title, icon, onClose }: { title: ReactNode; icon?: ReactNode; onClose?: () => void }) => (
  <div className="flex justify-between items-center p-4 border-b border-rose-100 bg-rose-50/50">
    <h3 className="font-bold text-stone-800 text-sm flex items-center gap-2">
      {icon}
      {title}
    </h3>
    {onClose && (
      <button onClick={onClose} className="text-stone-400 hover:text-rose-600 transition-colors p-1 rounded-full hover:bg-rose-100 cursor-pointer">
        <X className="w-5 h-5" />
      </button>
    )}
  </div>
);

Modal.Body = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`p-5 space-y-4 ${className}`}>{children}</div>
);

Modal.Footer = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <div className={`p-4 border-t border-rose-100 bg-stone-50/50 flex justify-between items-center ${className}`}>
    {children}
  </div>
);
