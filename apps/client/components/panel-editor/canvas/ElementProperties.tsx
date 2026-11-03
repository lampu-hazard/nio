'use client';

import React from 'react';
import type { CanvasElement } from '@/lib/panel-visual/generated/panel-visual.document';

export function ElementProperties({ element, patch }: { element?: CanvasElement; patch: (patch: Partial<CanvasElement>) => void }) {
  if (!element) return <p className="panel-canvas-hint">Select a layer to edit its position, size and appearance.</p>;
  function number(key: string, value: number, min = -1600, max = 3200) {
    return <label key={key}><span className="field-label">{key}</span><input aria-label={key} className="input" type="number" min={min} max={max} step="any" value={value} onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next)) patch({ [key]: Math.max(min, Math.min(max, next)) }); }} /></label>;
  }
  return <div className="space-y-4">
    <h3 className="font-bold">{element.type} properties</h3>
    <div className="grid grid-cols-2 gap-2">
      {element.type === 'line' ? <>{number('x1', element.x1)}{number('y1', element.y1)}{number('x2', element.x2)}{number('y2', element.y2)}{number('strokeWidth', element.strokeWidth, 1, 100)}</> : <>{number('x', element.x)}{number('y', element.y)}{number('width', element.width, 1, 3200)}{number('height', element.height, 1, 3200)}</>}
    </div>
    {element.type === 'text' && <>
      <label className="block"><span className="field-label">Text</span><textarea className="input" rows={5} value={element.text} maxLength={5000} onChange={event => patch({ text: event.target.value })} /></label>
      <div className="grid grid-cols-2 gap-2">{number('fontSize', element.fontSize, 8, 200)}{number('lineHeight', element.lineHeight, 1, 3)}</div>
      <label className="block"><span className="field-label">Weight</span><select className="input" value={element.weight} onChange={event => patch({ weight: event.target.value as 'regular' | 'bold' })}><option value="regular">Regular</option><option value="bold">Bold</option></select></label>
      <label className="block"><span className="field-label">Alignment</span><select className="input" value={element.align} onChange={event => patch({ align: event.target.value as 'left' | 'center' | 'right' })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    </>}
    {(element.type === 'text' || element.type === 'line') && <label className="block"><span className="field-label">Color</span><input aria-label="Element color" type="color" value={element.color} onChange={event => patch({ color: event.target.value })} /></label>}
    {element.type === 'rectangle' && <><label className="block"><span className="field-label">Fill</span><input aria-label="Rectangle fill" type="color" value={element.fill} onChange={event => patch({ fill: event.target.value })} /></label>{number('radius', element.radius, 0, 800)}</>}
    {element.type === 'image' && <fieldset><legend className="font-bold">Image crop</legend><p className="panel-canvas-hint">Normalized source coordinates (0–1). The cropped region fills this layer.</p><div className="grid grid-cols-2 gap-2">{(['x', 'y', 'width', 'height'] as const).map(key => {
      const crop = element.crop ?? { x: 0, y: 0, width: 1, height: 1 };
      return <label key={key}><span className="field-label">Crop {key}</span><input className="input" type="number" step="0.01" min={key === 'width' || key === 'height' ? 0.01 : 0} max={1} value={crop[key]} onChange={event => {
        const next = { ...crop, [key]: Math.max(key === 'width' || key === 'height' ? 0.01 : 0, Math.min(1, Number(event.target.value))) };
        next.x = Math.min(0.99, next.x); next.y = Math.min(0.99, next.y);
        next.width = Math.min(next.width, 1 - next.x); next.height = Math.min(next.height, 1 - next.y);
        patch({ crop: next });
      }} /></label>;
    })}</div><button type="button" className="btn mt-2" onClick={() => patch({ crop: { x: 0, y: 0, width: 1, height: 1 } })}>Reset crop</button></fieldset>}
  </div>;
}
