import React, { ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  icon,
  className = '',
  ...props 
}: ButtonProps) => {
  const baseStyle = "flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 outline-none";
  
  const variants = {
    primary: "bg-rose-400 hover:bg-rose-500 text-white shadow-sm shadow-rose-200",
    secondary: "bg-white text-stone-600 border border-rose-200 hover:bg-rose-50",
    danger: "bg-red-500 hover:bg-red-600 text-white shadow-sm shadow-red-200",
    ghost: "text-stone-600 hover:bg-rose-100 hover:text-rose-700"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded-lg",
    md: "px-4 py-2 text-sm rounded-xl",
    lg: "px-6 py-3 text-base rounded-2xl"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
};
