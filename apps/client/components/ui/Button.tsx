import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

export function Button({ children, className = '', ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`rounded-xl bg-indigo-500 px-5 py-3 font-bold hover:bg-indigo-400 ${className}`} {...props}>{children}</button>;
}
