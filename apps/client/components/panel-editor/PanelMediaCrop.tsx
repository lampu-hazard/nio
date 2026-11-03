'use client';

import React from 'react';
import type { PanelVisualDocument } from '@/lib/panel-visual/generated/panel-visual.document';

export function PanelMediaCrop({ document, assetKey, title, onChange }: { document: PanelVisualDocument; assetKey: string | null; title: string; onChange: (document: PanelVisualDocument) => void }) {
  const crop = document.simpleCrop;
  return <fieldset className="card-flat p-4 space-y-3"><legend className="font-bold px-1">Banner dimensions & crop</legend>
    <p className="text-sm text-[var(--muted)]">Set the exported image width and height. Discord determines the width of its native embed box.</p>
    {!crop && <button type="button" className="btn" disabled={!assetKey} onClick={() => assetKey && onChange({ ...document, simpleCrop: { assetKey, crop: { x: 0, y: 0, width: 1, height: 1 }, width: 1200, height: 600, description: title || 'Panel banner' } })}>Enable banner crop</button>}
    {!assetKey && !crop && <p className="panel-canvas-hint">Upload a static banner first. External URLs cannot be cropped on the server.</p>}
    {crop && <>
      <div className="grid grid-cols-2 gap-3">{(['width', 'height'] as const).map(key => <label key={key}><span className="field-label">Banner {key} (px)</span><input className="input" type="number" min={320} max={1600} value={crop[key]} onChange={event => { const value = Math.max(320, Math.min(1600, Math.round(Number(event.target.value)))); if (value * crop[key === 'width' ? 'height' : 'width'] <= 2_000_000) onChange({ ...document, simpleCrop: { ...crop, [key]: value } }); }} /></label>)}</div>
      <div className="grid grid-cols-2 gap-3">{(['x', 'y', 'width', 'height'] as const).map(key => <label key={key}><span className="field-label">Crop {key} (0–1)</span><input className="input" type="number" min={key === 'width' || key === 'height' ? 0.01 : 0} max={1} step={0.01} value={crop.crop[key]} onChange={event => { const next = { ...crop.crop, [key]: Math.max(key === 'width' || key === 'height' ? 0.01 : 0, Math.min(1, Number(event.target.value))) }; next.x = Math.min(0.99, next.x); next.y = Math.min(0.99, next.y); next.width = Math.min(next.width, 1 - next.x); next.height = Math.min(next.height, 1 - next.y); onChange({ ...document, simpleCrop: { ...crop, crop: next } }); }} /></label>)}</div>
      <label className="block"><span className="field-label">Banner image description</span><input className="input" required maxLength={1024} value={crop.description} onChange={event => onChange({ ...document, simpleCrop: { ...crop, description: event.target.value } })} /></label>
      <button type="button" className="btn" onClick={() => onChange({ ...document, simpleCrop: undefined })}>Use original banner</button>
    </>}
  </fieldset>;
}
