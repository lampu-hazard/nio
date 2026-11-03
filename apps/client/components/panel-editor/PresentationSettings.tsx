'use client';

import React from 'react';
import type { PanelVisualDocument } from '@/lib/panel-visual/generated/panel-visual.document';
import { resolvePresentation } from '@/lib/panel-visual/generated/panel-visual.document';

export function PresentationSettings({ document, style, onChange }: { document: PanelVisualDocument; style: string; onChange: (document: PanelVisualDocument) => void }) {
  const resolved = resolvePresentation(style, document.presentation);
  return <fieldset className="card-flat p-4"><legend className="font-bold px-1">Embed appearance</legend><div className="flex flex-wrap gap-5">{(['author', 'thumbnail', 'footer', 'timestamp'] as const).map(key => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={resolved[key]} onChange={event => onChange({ ...document, presentation: { ...document.presentation, [key]: event.target.checked } })} />{key}</label>)}</div><button type="button" className="btn mt-3" onClick={() => onChange({ ...document, presentation: undefined })}>Use style defaults</button></fieldset>;
}
