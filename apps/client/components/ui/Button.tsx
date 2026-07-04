import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
type ButtonSize = 'sm' | 'md' | 'lg';

type ButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500 shadow-sm shadow-indigo-500/10 dark:bg-indigo-500 dark:hover:bg-indigo-600',
  secondary: 'border-[var(--border)] bg-[var(--panel)] text-[var(--text)] hover:bg-[var(--panel-strong)] backdrop-blur-sm',
  outline: 'border-[var(--border)] bg-transparent text-[var(--text)] hover:bg-[var(--panel)]',
  ghost: 'border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--panel)] hover:text-[var(--text)]',
  destructive: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-950/50 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-950/50',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
};

export function Button({ children, className = '', variant = 'primary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md border font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
