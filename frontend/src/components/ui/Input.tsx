import React, { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export const Label = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <label className={`text-sm font-semibold text-stone-700 block ${className}`}>
    {children}
  </label>
);

export const Input = ({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={`input-base ${className}`} {...props} />
);

export const Textarea = ({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={`input-base resize-y ${className}`} {...props} />
);
