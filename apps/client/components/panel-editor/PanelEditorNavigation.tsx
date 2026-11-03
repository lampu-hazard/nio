'use client';

import React from 'react';
import type { ReactNode } from 'react';

export function PanelEditorNavigation({ label, active, items, onChange }: {
  label: string;
  active: string;
  items: { id: string; label: string }[];
  onChange: (id: string) => void;
}) {
  return <nav aria-label={label} className="flex flex-wrap gap-2 border-b border-[var(--border)] pb-3">
    {items.map(item => <button key={item.id} type="button" aria-pressed={active === item.id} className={`btn px-4 py-2 text-sm ${active === item.id ? 'btn-primary' : ''}`} onClick={() => onChange(item.id)}>{item.label}</button>)}
  </nav>;
}

export function PanelEditorSection({ id, active, children }: { id: string; active: string; children: ReactNode }) {
  return <section aria-label={id} hidden={id !== active}>{children}</section>;
}
