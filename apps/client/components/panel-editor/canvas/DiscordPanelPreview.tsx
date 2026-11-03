'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { PanelVisualDocument } from '@/lib/panel-visual/generated/panel-visual.document';
import { PreviewRequest, PreviewTrigger } from '@/lib/panel-visual/preview-request';

export function DiscordPanelPreview({ guildId, document }: { guildId: string; document: PanelVisualDocument }) {
  const request = useRef<PreviewRequest | null>(null);
  const trigger = useRef(new PreviewTrigger());
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [mobile, setMobile] = useState(false);
  const hasImage = document.editorMode === 'CANVAS' || Boolean(document.simpleCrop);
  useEffect(() => {
    const client = new PreviewRequest(); request.current = client;
    return () => { client.dispose(); request.current = null; };
  }, []);
  useEffect(() => {
    const client = request.current;
    if (!client) return;
    client.cancel(); setUrl(''); setError(''); setBusy(false);
    if (!hasImage || !trigger.current.shouldRender(automatic, refresh)) return;
    let active = true;
    const timer = setTimeout(() => {
      setBusy(true);
      client.render(`/api/guilds/${guildId}/panels/visual-preview`, { visualDocument: document }, value => { if (active) setUrl(value); })
        .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Preview failed.'); })
        .finally(() => { if (active) setBusy(false); });
    }, automatic ? 400 : 0);
    return () => { active = false; clearTimeout(timer); client.cancel(); };
  }, [document, guildId, automatic, refresh, hasImage]);
  if (!hasImage) return null;
  return <section className="card-flat p-4 space-y-3">
    <div className="flex flex-wrap items-center gap-3"><h3 className="font-bold grow">Server image preview</h3><button type="button" className="btn" disabled={busy} onClick={() => setRefresh(value => value + 1)}>{busy ? 'Rendering…' : 'Render preview'}</button><button type="button" className="btn" onClick={() => setMobile(value => !value)}>{mobile ? 'Desktop view' : 'Mobile view'}</button></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={automatic} onChange={event => setAutomatic(event.target.checked)} />Auto preview (10 renders/minute maximum)</label>
    <p className="panel-canvas-hint">The exported PNG uses server fonts and layout. Preview width only simulates Discord; Discord controls the actual embed container width.</p>
    {error && <p role="alert" className="notice notice-error">{error}</p>}
    {url ? <div className="panel-visual-preview" style={{ maxWidth: mobile ? 320 : 640 }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt={document.canvas?.description ?? document.simpleCrop?.description ?? 'Panel preview'} /></div> : <p role="status" className="panel-canvas-hint">{busy ? 'Rendering current design…' : 'Render to validate the current design. No image is published by this action.'}</p>}
  </section>;
}
