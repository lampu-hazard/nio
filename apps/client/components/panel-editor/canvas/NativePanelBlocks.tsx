'use client';

import React from 'react';
import type { PanelVisualDocument, NativePanelControl } from '@/lib/panel-visual/generated/panel-visual.document';

export function NativePanelBlocks({ document, roles, onChange }: { document: PanelVisualDocument; roles: { id: string; label: string }[]; onChange: (document: PanelVisualDocument) => void }) {
  const native = document.native ?? { blocks: [], controls: roles.map(role => ({ kind: 'role' as const, panelRoleId: role.id })) };
  function controls(next: NativePanelControl[]) { onChange({ ...document, native: { ...native, controls: next } }); }
  return <details className="card-flat p-4" open>
    <summary className="cursor-pointer font-bold">Discord text & controls</summary>
    <p className="panel-canvas-hint">Native text stays selectable and supports Discord markdown. It appears above the image; buttons and role menus appear below it, not at free canvas coordinates.</p>
    <label className="block"><span className="field-label">Native description</span><textarea className="input" rows={4} maxLength={4000} value={native.blocks.map(block => block.text).join('\n\n')} onChange={event => onChange({ ...document, native: { ...native, blocks: event.target.value ? [{ id: 'description', text: event.target.value }] : [] } })} /></label>
    <div className="mt-3 space-y-2">{native.controls.map((control, index) => <div className="flex flex-wrap items-center gap-2 rounded border border-[var(--border)] p-2" key={control.kind === 'role' ? control.panelRoleId : control.id}>
      {control.kind === 'role' ? <span className="grow text-sm">Role: {roles.find(role => role.id === control.panelRoleId)?.label ?? 'Removed role'}</span> : <>
        <input aria-label="Link label" className="input min-w-0 flex-1" maxLength={80} value={control.label} onChange={event => controls(native.controls.map((item, i) => i === index ? { ...control, label: event.target.value } : item))} />
        <input aria-label="Link URL" className="input min-w-0 flex-1" placeholder="https://..." value={control.url} onChange={event => controls(native.controls.map((item, i) => i === index ? { ...control, url: event.target.value } : item))} />
      </>}
      <button type="button" aria-label={`Move control ${index + 1} up`} className="btn" disabled={index === 0} onClick={() => { const next = [...native.controls]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; controls(next); }}>↑</button>
      <button type="button" aria-label={`Move control ${index + 1} down`} className="btn" disabled={index === native.controls.length - 1} onClick={() => { const next = [...native.controls]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; controls(next); }}>↓</button>
      <button type="button" className="btn btn-danger" onClick={() => controls(native.controls.filter((_, i) => i !== index))}>Remove</button>
    </div>)}</div>
    <div className="mt-3 flex flex-wrap gap-2">
      {roles.filter(role => !native.controls.some(control => control.kind === 'role' && control.panelRoleId === role.id)).map(role => <button type="button" className="btn" key={role.id} onClick={() => controls([...native.controls, { kind: 'role', panelRoleId: role.id }])}>Add {role.label}</button>)}
      <button type="button" className="btn" disabled={native.controls.length >= 25} onClick={() => controls([...native.controls, { kind: 'link', id: crypto.randomUUID(), label: 'Open website', url: 'https://example.com' }])}>Add link</button>
    </div>
    {native.controls.length > 25 && <p role="alert">Discord supports at most 25 buttons across five rows.</p>}
  </details>;
}
