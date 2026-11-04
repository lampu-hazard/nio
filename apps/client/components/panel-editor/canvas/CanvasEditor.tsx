'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CanvasElement, PanelVisualDocument } from '@/lib/panel-visual/generated/panel-visual.document';
import { createEditorHistory, editorReducer, type EditorAction } from '@/lib/panel-visual/editor-state';
import { CanvasStage } from './CanvasStage';
import { ElementProperties } from './ElementProperties';
import { NativePanelBlocks } from './NativePanelBlocks';
import './panel-editor.css';

type Asset = { key: string; url: string };
export function CanvasEditor({ document, onChange, guildId, roles, initialAssets = [] }: { document: PanelVisualDocument; onChange: (document: PanelVisualDocument) => void; guildId: string; roles: { id: string; label: string }[]; initialAssets?: Asset[] }) {
  const [history, setHistory] = useState(() => createEditorHistory(document.canvas!));
  const currentHistory = useRef(history);
  const [selected, setSelected] = useState<string>();
  const [zoom, setZoom] = useState(0.5);
  const [assets, setAssets] = useState<Asset[]>(initialAssets);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [sizeDraft, setSizeDraft] = useState<{ width: string | null; height: string | null }>({ width: null, height: null });
  useEffect(() => {
    if (JSON.stringify(document.canvas) !== JSON.stringify(currentHistory.current.present)) {
      const next = createEditorHistory(document.canvas!); currentHistory.current = next; setHistory(next);
    }
  }, [document.canvas]);
  function dispatch(action: EditorAction) {
    const next = editorReducer(currentHistory.current, action);
    currentHistory.current = next; setHistory(next);
    if (next.present !== document.canvas) onChange({ ...document, canvas: next.present });
  }
  const scene = history.present;
  const element = scene.elements.find(item => item.id === selected);
  function insert(type: 'text' | 'rectangle' | 'line', asset?: Asset) {
    if (scene.elements.length >= 50) { setError('Maximum 50 layers. Remove a layer before adding another.'); return; }
    const id = crypto.randomUUID();
    const box = { id, x: 50, y: 50, width: Math.min(500, scene.width - 50), height: 120 };
    const item: CanvasElement = asset ? { ...box, type: 'image', assetKey: asset.key, height: 300 } : type === 'text' ? { ...box, type, text: 'Your text', font: 'dejavu-sans', fontSize: 32, weight: 'regular', color: '#ffffff', align: 'left', lineHeight: 1.3 } : type === 'rectangle' ? { ...box, type, fill: '#3730a3', radius: 12 } : { id, type, x1: 50, y1: 50, x2: 450, y2: 50, color: '#ffffff', strokeWidth: 4 };
    dispatch({ type: 'insert', element: item }); setSelected(id);
  }
  async function upload(file?: File) {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Use a static PNG, JPEG or WebP under 5 MB.'); return; }
    if (scene.elements.filter(item => item.type === 'image').length >= 10) { setError('Maximum 10 image layers.'); return; }
    setUploading(true); setError('');
    try {
      const response = await fetch(`/api/guilds/${guildId}/panels/upload-url`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileName: file.name, contentType: file.type }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Upload could not start.');
      const uploaded = await fetch(data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!uploaded.ok) throw new Error('Image upload failed. Try again.');
      const asset = { key: data.key, url: data.url }; setAssets(previous => [...previous, asset]); insert('rectangle', asset);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload failed.'); }
    finally { setUploading(false); }
  }
  function reorder(id: string, direction: number) {
    const ids = scene.elements.map(item => item.id); const from = ids.indexOf(id); const to = from + direction;
    if (to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]]; dispatch({ type: 'reorder', ids });
  }
  return <section className="panel-canvas-editor" aria-label="Canvas editor">
    <div className="panel-canvas-toolbar">
      <button type="button" className="btn" onClick={() => insert('text')}>Add text</button>
      <button type="button" className="btn" onClick={() => insert('rectangle')}>Add rectangle</button>
      <button type="button" className="btn" onClick={() => insert('line')}>Add line</button>
      <label className="btn cursor-pointer">{uploading ? 'Uploading…' : 'Upload image'}<input aria-label="Upload image" type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} /></label>
      <button type="button" className="btn" disabled={!history.past.length} onClick={() => dispatch({ type: 'undo' })}>Undo</button>
      <button type="button" className="btn" disabled={!history.future.length} onClick={() => dispatch({ type: 'redo' })}>Redo</button>
      <label className="flex items-center gap-2 text-sm">Zoom<select aria-label="Canvas zoom" className="input" value={zoom} onChange={event => setZoom(Number(event.target.value))}>{[0.25, 0.5, 0.75, 1, 1.5].map(value => <option key={value} value={value}>{value * 100}%</option>)}</select></label>
    </div>
    {error && <p role="alert" className="notice notice-error">{error}</p>}
    <div className="panel-canvas-layout">
      <aside className="panel-canvas-sidebar">
        <h3 className="font-bold">Artboard</h3>
        <label className="block mt-3"><span className="field-label">Preset</span><select className="input" value="" onChange={event => { const [width, height] = event.target.value.split('x').map(Number); dispatch({ type: 'resize-artboard', width, height }); }}><option value="" disabled>Choose size</option><option value="1200x600">Wide · 1200 × 600</option><option value="1000x1000">Square · 1000 × 1000</option><option value="800x1200">Portrait · 800 × 1200</option></select></label>
        <div className="grid grid-cols-2 gap-2 mt-3">{(['width', 'height'] as const).map(key => <label key={key}><span className="field-label">Canvas {key}</span><input aria-label={`Canvas ${key}`} className="input" type="number" min={320} max={1600} value={sizeDraft[key] ?? scene[key]} onChange={event => { const raw = event.target.value; setSizeDraft(prev => ({ ...prev, [key]: raw })); if (raw.trim() === '') return; const parsed = Math.round(Number(raw)); if (!Number.isFinite(parsed) || parsed < 320 || parsed > 1600) return; if (parsed * scene[key === 'width' ? 'height' : 'width'] > 2_000_000) { setError('Artboard must stay under 2 million pixels.'); return; } setError(''); dispatch({ type: 'scene', patch: { [key]: parsed } }); }} onBlur={() => { const raw = sizeDraft[key]; setSizeDraft(prev => ({ ...prev, [key]: null })); if (raw === null || raw.trim() === '') return; const value = Math.max(320, Math.min(1600, Math.round(Number(raw)))); if (!Number.isFinite(value)) return; if (value * scene[key === 'width' ? 'height' : 'width'] > 2_000_000) { setError('Artboard must stay under 2 million pixels.'); return; } setError(''); dispatch({ type: 'scene', patch: { [key]: value } }); }} /></label>)}</div>
        <label className="block mt-3"><span className="field-label">Background</span><input aria-label="Canvas background" type="color" value={scene.background} onChange={event => dispatch({ type: 'scene', patch: { background: event.target.value } })} /></label>
        <h3 className="font-bold mt-6">Layers</h3>
        <p className="panel-canvas-hint">Top of this list is the front layer.</p>
        <ol className="space-y-2">{[...scene.elements].reverse().map(item => <li key={item.id} className="flex gap-1">
          <button type="button" className={`btn min-w-0 flex-1 truncate ${selected === item.id ? 'btn-primary' : ''}`} aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}>{item.type === 'text' ? item.text.slice(0, 22) || 'Empty text' : item.type}</button>
          <button type="button" className="btn" aria-label={`Bring ${item.id} forward`} disabled={scene.elements.at(-1)?.id === item.id} onClick={() => reorder(item.id, 1)}>↑</button>
          <button type="button" className="btn" aria-label={`Send ${item.id} backward`} disabled={scene.elements[0]?.id === item.id} onClick={() => reorder(item.id, -1)}>↓</button>
        </li>)}</ol>
      </aside>
      <main className="min-w-0"><CanvasStage scene={scene} selected={selected} select={setSelected} patch={(id, patch) => dispatch({ type: 'patch', id, patch })} begin={() => dispatch({ type: 'begin' })} commit={() => dispatch({ type: 'commit' })} cancel={() => dispatch({ type: 'cancel' })} assetUrl={key => assets.find(asset => asset.key === key)?.url ?? initialAssets.find(asset => asset.key === key)?.url} zoom={zoom} /></main>
      <aside className="panel-canvas-sidebar"><ElementProperties element={element} patch={patch => element && dispatch({ type: 'patch', id: element.id, patch })} />
        {element && <div className="flex flex-wrap gap-2 mt-4"><button type="button" className="btn" disabled={scene.elements.length >= 50 || (element.type === 'image' && scene.elements.filter(item => item.type === 'image').length >= 10)} onClick={() => { const id = crypto.randomUUID(); dispatch({ type: 'duplicate', id: element.id, newId: id }); setSelected(id); }}>Duplicate</button><button type="button" className="btn btn-danger" onClick={() => { dispatch({ type: 'delete', id: element.id }); setSelected(undefined); }}>Delete layer</button></div>}
      </aside>
    </div>
    <label className="block px-4 pb-4"><span className="field-label">Image description</span><textarea className="input" required maxLength={1024} rows={2} value={scene.description} onChange={event => dispatch({ type: 'scene', patch: { description: event.target.value } })} /><span className="panel-canvas-hint">Describe the image for members using screen readers.</span></label>
    <div className="px-4 pb-4"><NativePanelBlocks document={document} roles={roles} onChange={onChange} /></div>
  </section>;
}
