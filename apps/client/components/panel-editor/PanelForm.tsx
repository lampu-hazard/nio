'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import type { Panel } from '@/lib/types';
import type { PanelVisualDocument } from '@/lib/panel-visual/generated/panel-visual.document';
import { mediaPayload, switchEditorMode, uploadedAssetKey, updateBanner } from '@/lib/panel-visual/workspace-state';
import { CanvasEditor } from './canvas/CanvasEditor';
import { DiscordPanelPreview } from './canvas/DiscordPanelPreview';
import { PresentationSettings } from './PresentationSettings';
import { PanelMediaCrop } from './PanelMediaCrop';
import { PanelEditorNavigation } from './PanelEditorNavigation';

type ChannelOption = { id: string; name: string };
type PanelType = 'SELF_ROLE' | 'RULES' | 'ANNOUNCEMENT' | 'LEADERBOARD';

type Draft = {
  name: string;
  title: string;
  accentText: string;
  description: string;
  type: PanelType;
  mode: 'BUTTONS' | 'MENU';
  style: 'PREMIUM' | 'MINIMAL' | 'COLORFUL' | 'NEON';
  color: string;
  imageUrl: string;
  thumbnailUrl: string;
  maxRoles: number;
};

type FormState = {
  error?: string;
  success?: string;
  loading: boolean;
  publishing?: boolean;
  uploading?: 'banner' | 'thumbnail';
};

const TEMPLATES: Record<string, Partial<Draft>> = {
  rules: {
    type: 'RULES',
    name: 'Server Rules',
    title: 'Server Rules',
    accentText: 'Please read before participating',
    description: '**1. BASICS**\n• Respect every member and staff member.\n• No spam, toxicity, hate speech, scams, phishing, or harmful content.\n• Keep each conversation in the right channel.\n\n**2. COMMUNITY**\n• Do not mention staff without a clear reason.\n• Never share another person\'s private information.\n• Follow moderator direction.\n\n**3. SAFETY**\n• Avoid suspicious links.\n• Report issues to the staff team.',
    color: '#18181B',
    style: 'PREMIUM',
  },
  selfRole: {
    type: 'SELF_ROLE',
    name: 'Self Roles',
    title: 'Self Roles',
    accentText: 'Customize your profile',
    description: 'Select roles below to customize your profile.',
    color: '#18181B',
    style: 'PREMIUM',
  },
  announcement: {
    type: 'ANNOUNCEMENT',
    name: 'Announcement',
    title: 'Announcement',
    accentText: 'Official server update',
    description: '**New update**\n\nWrite your server announcement here. You can add a banner, thumbnail, and Discord markdown formatting.',
    color: '#18181B',
    style: 'MINIMAL',
  },
  leaderboard: {
    type: 'LEADERBOARD',
    name: 'Leaderboard Panel',
    title: '✦ Server Leaderboard',
    accentText: 'Most active members',
    description: 'Pesan ini akan otomatis ter-update setiap 5 menit dengan data keaktifan member server terbaru.',
    color: '#18181B',
    style: 'PREMIUM',
  },
};

function initialDraft(panel?: Panel | null): Draft {
  return {
    name: panel?.name || '',
    title: panel?.title || 'Self Roles',
    accentText: panel?.accentText || '',
    description: panel?.description || 'Select roles below to customize your profile.',
    type: panel?.type || 'SELF_ROLE',
    mode: panel?.mode || 'BUTTONS',
    style: panel?.style || 'PREMIUM',
    color: panel?.color || '#18181B',
    imageUrl: panel?.imageUrl || '',
    thumbnailUrl: panel?.thumbnailUrl || '',
    maxRoles: panel?.maxRoles ?? 0,
  };
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function PanelForm({
  guildId,
  panel,
  channels = [],
  onPreviewChange,
  onSaved,
  onDirtyChange,
  initialValues,
}: {
  guildId: string;
  panel?: Panel | null;
  channels?: ChannelOption[];
  onPreviewChange?: (draft: Partial<Panel>) => void;
  onSaved?: (panel: Panel) => void;
  onDirtyChange?: (dirty: boolean) => void;
  initialValues?: Partial<Draft>;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({ loading: false });
  const [section, setSection] = useState('content');
  const [draft, setDraft] = useState<Draft>(() => ({ ...initialDraft(panel), ...initialValues }));
  const [channelId, setChannelId] = useState(panel?.channelId || '');
  const isPublished = panel?.status === 'PUBLISHED';
  const [visual, setVisual] = useState<PanelVisualDocument | null>(panel?.visualDocument ?? null);
  const [revision, setRevision] = useState(panel?.revision ?? 0);
  const [dirty, setDirty] = useState(false);
  const [assets, setAssets] = useState<{ key: string; url: string }[]>([]);
  useEffect(() => {
    if (!panel?.id) return;
    const controller = new AbortController();
    fetch(`/api/guilds/${guildId}/panels/${panel.id}/visual-assets`, { signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Saved images could not be loaded. Reload to retry.'); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setAssets(previous => [...previous, ...data.assets]); })
      .catch(error => { if (!controller.signal.aborted) setState({ loading: false, error: error.message }); });
    return () => controller.abort();
  }, [guildId, panel?.id]);
  useEffect(() => { setRevision(panel?.revision ?? 0); }, [panel?.revision]);
  useEffect(() => {
    if (!dirty && panel) { setDraft(initialDraft(panel)); setChannelId(panel.channelId || ''); setVisual(panel.visualDocument ?? null); }
  }, [panel, dirty]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    const guardLink = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest('a');
      if (link?.href && link.href !== window.location.href && !window.confirm('Discard unsaved panel changes?')) { event.preventDefault(); event.stopPropagation(); }
    };
    document.addEventListener('click', guardLink, true);
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('click', guardLink, true); };
  }, [dirty, onDirtyChange]);
  function changeVisual(next: PanelVisualDocument) {
    setVisual(next); setDirty(true);
    onPreviewChange?.({ ...draft, visualDocument: next });
  }

  function patchDraft(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    const nextVisual = patch.imageUrl === undefined ? visual : updateBanner(visual, draft.imageUrl, patch.imageUrl);
    setDraft(next); setVisual(nextVisual); setDirty(true);
    onPreviewChange?.({ ...panel, ...next, visualDocument: nextVisual, channelId, roles: panel?.roles || [] });
  }

  function applyTemplate(key: keyof typeof TEMPLATES) {
    patchDraft(TEMPLATES[key]);
  }

  async function uploadImage(kind: 'banner' | 'thumbnail', file?: File) {
    if (!file) return;
    setState({ loading: false, uploading: kind });

    if (file.size > 5 * 1024 * 1024) {
      setState({ loading: false, error: 'Image size must be 5 MB or less.' });
      return;
    }

    try {
      const res = await fetch(`/api/guilds/${guildId}/panels/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to get upload URL');

      const { uploadUrl, url, key } = data;
      setAssets(previous => [...previous, { key, url }]);

      let uploadSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          });
          if (!uploadRes.ok) throw new Error(`Storage upload status: ${uploadRes.status}`);
          uploadSuccess = true;
          break;
        } catch (err) {
          if (attempt === 3) throw err;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }

      if (!uploadSuccess) throw new Error('Failed to upload file to storage');

      patchDraft(kind === 'banner' ? { imageUrl: url } : { thumbnailUrl: url });
      setState({
        loading: false,
        success: `${kind === 'banner' ? 'Banner' : 'Thumbnail'} uploaded successfully. Remember to save changes.`,
      });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'Failed to upload image' });
    }
  }

  async function publishPanel() {
    if (!panel || dirty) return;
    setState({ loading: false, publishing: true });
    try {
      const response = await fetch(`/api/guilds/${guildId}/panels/${panel.id}/publish`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedRevision: revision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Failed to publish panel');
      if (data.panel) { setRevision(data.panel.revision); onSaved?.(data.panel); }
      setState({ loading: false, success: isPublished ? 'Discord message updated.' : `Panel published. Message ID: ${data.messageId}` });
      router.refresh();
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'Failed to publish panel' });
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const invalid = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input:invalid, select:invalid, textarea:invalid');
    if (invalid) {
      const destination = invalid.closest<HTMLElement>('[data-panel-section]')?.dataset.panelSection;
      if (destination) setSection(destination);
      requestAnimationFrame(() => { invalid.focus(); invalid.reportValidity(); });
      return;
    }
    setState({ loading: true });

    const name = draft.name.trim();
    const title = draft.title.trim();
    const accentText = optional(draft.accentText);
    const description = optional(draft.description);

    if (name.length > 100 || title.length > 256 || (accentText?.length ?? 0) > 256 || (description?.length ?? 0) > 4000) {
      setState({ loading: false, error: 'Panel name, title, accent text, or description is too long for Discord publishing.' });
      return;
    }

    try {
    const payload = {
      channelId: optional(channelId),
      name,
      title,
      accentText,
      description,
      type: draft.type,
      mode: draft.mode,
      style: draft.style,
      color: draft.color,
      ...mediaPayload(draft.imageUrl, draft.thumbnailUrl, window.location.origin),
      maxRoles: draft.maxRoles,
      visualDocument: visual,
      expectedRevision: panel ? revision : undefined,
    };

      const response = await fetch(panel ? `/api/guilds/${guildId}/panels/${panel.id}` : `/api/guilds/${guildId}/panels`, {
        method: panel ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Failed to save panel');

      if (data.panel) { setRevision(data.panel.revision); onSaved?.(data.panel); }
      setDirty(false);

      setState({
        loading: false,
        success: isPublished ? 'Changes saved. Click Update Discord Message to sync with Discord.' : panel ? 'Panel saved.' : 'Panel created.',
      });
      if (!panel && data.panel?.id) router.push(`/dashboard/${guildId}/panels/${data.panel.id}`);
      router.refresh();
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'Failed to save panel' });
    }
  }

  function sectionProps(id: string, simpleOnly = false) {
    return {
      'data-panel-section': id,
      style: section !== id || (simpleOnly && visual?.editorMode === 'CANVAS') ? { display: 'none' } : undefined,
    };
  }

  return (
    <form noValidate onSubmit={onSubmit} onInvalidCapture={event => {
      const target = event.target as HTMLElement;
      const destination = target.closest<HTMLElement>('[data-panel-section]')?.dataset.panelSection;
      if (destination) setSection(destination);
    }} className="card min-w-0">
      <div className="border-b border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-5 md:px-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Edit panel</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">Edit the design, save your changes, then publish to Discord.</p>
          </div>
          {panel?.status && <span className={`badge ${isPublished ? 'badge-live' : ''}`}>{isPublished ? 'Live' : panel.status}</span>}
        </div>
      </div>

      <fieldset disabled={state.loading || state.publishing || Boolean(state.uploading)} className="px-6 py-6 md:px-7 min-w-0">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <button type="button" className={`btn ${visual?.editorMode !== 'CANVAS' ? 'btn-primary' : ''}`} onClick={() => changeVisual(switchEditorMode(visual, 'SIMPLE', { ...draft, roles: panel?.roles }))}>Simple</button>
          <button type="button" className={`btn ${visual?.editorMode === 'CANVAS' ? 'btn-primary' : ''}`} disabled={draft.type === 'LEADERBOARD'} onClick={() => changeVisual(switchEditorMode(visual, 'CANVAS', { ...draft, roles: panel?.roles }))}>Canvas</button>
          <span className="text-sm text-[var(--muted)]">{dirty ? 'Unsaved changes — save before publishing' : `Saved revision ${revision}`}</span>
          {draft.type === 'LEADERBOARD' && <p className="text-sm text-[var(--muted)]">Leaderboard content stays dynamic; Canvas mode is unavailable.</p>}
        </div>
        {state.error && <div className="notice notice-error mb-4">{state.error}</div>}
        {state.success && <div className="notice notice-success mb-4">{state.success}</div>}

        <PanelEditorNavigation label="Panel settings" active={section} onChange={setSection} items={[{ id: 'content', label: 'Content' }, { id: 'appearance', label: 'Appearance' }, { id: 'settings', label: 'Settings' }]} />
        <details {...sectionProps('content', true)} className="my-4 rounded-lg border border-[var(--border)] p-3">
          <summary className="cursor-pointer text-sm font-semibold">Start from a template</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button type="button" onClick={() => applyTemplate('rules')} className="btn border-transparent bg-[var(--panel)]">Rules Template</button>
          <button type="button" onClick={() => applyTemplate('selfRole')} className="btn border-transparent bg-[var(--panel)]">Self Role Template</button>
          <button type="button" onClick={() => applyTemplate('announcement')} className="btn border-transparent bg-[var(--panel)]">Announcement Template</button>
          <button type="button" disabled={visual?.editorMode === 'CANVAS'} onClick={() => applyTemplate('leaderboard')} className="btn border-transparent bg-[var(--panel)]">Leaderboard Template</button>
        </div>

        </details>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label {...sectionProps('settings')} className="block">
            <span className="field-label">Panel type</span>
            <select value={draft.type} onChange={(event) => patchDraft({ type: event.target.value as PanelType })} className="input">
              <option value="RULES">Rules / Info</option>
              <option value="SELF_ROLE">Self Role</option>
              <option value="ANNOUNCEMENT">Announcement</option>
              <option value="LEADERBOARD" disabled={visual?.editorMode === 'CANVAS'}>Leaderboard</option>
            </select>
          </label>

          <label {...sectionProps('settings')} className="block">
            <span className="field-label">Target channel</span>
            <select value={channelId} onChange={(event) => { setChannelId(event.target.value); setDirty(true); onPreviewChange?.({ channelId: event.target.value }); }} className="input" required>
              <option value="" disabled>Select channel</option>
              {channels.map((ch) => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
            </select>
            {!channels.length && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">No channels were found. Make sure the bot is in the server and can access channels.</p>}
          </label>

          <label {...sectionProps('settings')} className="block">
            <span className="field-label">Internal name</span>
            <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} className="input" placeholder="Server Rules" maxLength={100} required />
          </label>

          <label {...sectionProps('appearance')} className="block">
            <span className="field-label">Visual style</span>
            <select value={draft.style} onChange={(event) => patchDraft({ style: event.target.value as Draft['style'] })} className="input">
              <option value="PREMIUM">Premium</option>
              <option value="MINIMAL">Minimal</option>
              <option value="COLORFUL">Colorful</option>
              <option value="NEON">Neon</option>
            </select>
          </label>

          <label {...sectionProps('content')} className="block md:col-span-2">
            <span className="field-label">Embed title</span>
            <input value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} className="input text-lg font-bold" maxLength={256} required />
          </label>

          <label {...sectionProps('content', true)} className="block md:col-span-2">
            <span className="field-label">Accent text</span>
            <input value={draft.accentText} onChange={(event) => patchDraft({ accentText: event.target.value })} placeholder="Optional subtitle or server identity line" className="input" maxLength={256} />
          </label>

          <label {...sectionProps('content', true)} className="block md:col-span-2">
            <span className="field-label">Description / content body</span>
            <textarea value={draft.description} onChange={(event) => patchDraft({ description: event.target.value })} rows={6} className="input resize-y leading-7" maxLength={4000} />
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Discord markdown is supported: **bold**, bullets, section headings, and blank lines.</p>
          </label>

          <label {...sectionProps('settings')} className="block">
            <span className="field-label">Interaction mode</span>
            <select value={draft.mode} onChange={(event) => patchDraft({ mode: event.target.value as Draft['mode'] })} className="input" disabled={draft.type !== 'SELF_ROLE'}>
              <option value="BUTTONS">Buttons</option>
              <option value="MENU">Dropdown Menu</option>
            </select>
            {draft.type !== 'SELF_ROLE' && <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Rules and announcements do not send role components.</p>}
          </label>

          {draft.type === 'SELF_ROLE' && (
            <label {...sectionProps('settings')} className="block">
              <span className="field-label">Role selection</span>
              <select value={draft.maxRoles === 0 ? 'unlimited' : draft.maxRoles === 1 ? 'exclusive' : 'capped'} onChange={(event) => patchDraft({ maxRoles: event.target.value === 'unlimited' ? 0 : event.target.value === 'exclusive' ? 1 : Math.max(2, draft.maxRoles) })} className="input">
                <option value="unlimited">Unlimited</option>
                <option value="exclusive">Exclusive (one role)</option>
                <option value="capped">Capped</option>
              </select>
              {draft.maxRoles > 1 && (
                <input type="number" min={2} max={25} value={draft.maxRoles} onChange={(event) => patchDraft({ maxRoles: Math.min(25, Math.max(2, Number(event.target.value) || 2)) })} className="input mt-2" aria-label="Maximum roles" />
              )}
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Exclusive swaps roles within this panel. Capped allows 2–25 roles.</p>
            </label>
          )}

          <label {...sectionProps('appearance')} className="block">
            <span className="field-label">Accent color</span>
            <div className="card-flat flex items-center gap-4 p-3">
              <input type="color" value={draft.color} onChange={(event) => patchDraft({ color: event.target.value })} className="h-12 w-16 cursor-pointer rounded-md border border-[var(--border)] bg-white p-1" />
              <div>
                <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Embed accent</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">Used for the embed border and preview accent.</p>
              </div>
            </div>
          </label>

          <div {...sectionProps('appearance', true)} className="md:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-black">Media & banner</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">Use public HTTPS image URLs. Local files must be uploaded first before Discord can render them.</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="field-label">Banner image</span>
                <input value={draft.imageUrl} onChange={(event) => patchDraft({ imageUrl: event.target.value })} placeholder="https://.../server-rules-banner.png" className="input" />
                <div className="mt-3 flex items-center gap-3">
                  <label className="btn cursor-pointer px-4 py-2 text-sm">
                    {state.uploading === 'banner' ? 'Uploading...' : 'Upload Banner'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => void uploadImage('banner', event.target.files?.[0])} />
                  </label>
                  {draft.imageUrl && <button type="button" onClick={() => patchDraft({ imageUrl: '' })} className="btn btn-danger px-4 py-2 text-sm">Remove</button>}
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Recommended: 1200×420 or 1600×600.</span>
                </div>
              </label>
              <label className="block">
                <span className="field-label">Thumbnail / logo</span>
                <input value={draft.thumbnailUrl} onChange={(event) => patchDraft({ thumbnailUrl: event.target.value })} placeholder="https://.../logo.png" className="input" />
                <div className="mt-3 flex items-center gap-3">
                  <label className="btn cursor-pointer px-4 py-2 text-sm">
                    {state.uploading === 'thumbnail' ? 'Uploading...' : 'Upload Logo'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => void uploadImage('thumbnail', event.target.files?.[0])} />
                  </label>
                  {draft.thumbnailUrl && <button type="button" onClick={() => patchDraft({ thumbnailUrl: '' })} className="btn btn-danger px-4 py-2 text-sm">Remove</button>}
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Small logo displayed inside the embed.</span>
                </div>
              </label>
            </div>
          </div>
        </div>
        <div {...sectionProps('appearance')} className="mt-5 space-y-5">
          <PresentationSettings document={visual ?? { version: 1, editorMode: 'SIMPLE' }} style={draft.style} onChange={changeVisual} />
          {visual?.editorMode !== 'CANVAS' && draft.type !== 'LEADERBOARD' && <PanelMediaCrop document={visual ?? { version: 1, editorMode: 'SIMPLE' }} assetKey={uploadedAssetKey(draft.imageUrl, guildId)} title={draft.title} onChange={changeVisual} />}
          {visual?.editorMode === 'CANVAS' && <label className="block"><span className="field-label">Thumbnail / logo URL</span><input className="input" value={draft.thumbnailUrl} onChange={event => patchDraft({ thumbnailUrl: event.target.value })} placeholder="https://.../logo.png" /></label>}
        </div>
        <div {...sectionProps('content')} className="mt-5 space-y-5">
          {visual?.editorMode === 'CANVAS' && <CanvasEditor document={visual} guildId={guildId} roles={draft.type === 'SELF_ROLE' ? panel?.roles ?? [] : []} initialAssets={assets} onChange={changeVisual} />}
          {visual && <details className="rounded-lg border border-[var(--border)] p-3"><summary className="cursor-pointer text-sm font-semibold">Server-rendered image preview</summary><div className="mt-3"><DiscordPanelPreview guildId={guildId} document={visual} /></div></details>}
        </div>
        <div {...sectionProps('settings')} className="mt-5">
          {visual && <details className="rounded-lg border border-[var(--border)] p-3"><summary className="cursor-pointer text-sm font-semibold">Advanced rendering</summary><p className="my-3 text-sm text-[var(--muted)]">Remove the visual design and return to the existing panel or guild template.</p><button type="button" className="btn" onClick={() => { if (!window.confirm('Remove the visual design and restore legacy rendering?')) return; setVisual(null); setDirty(true); onPreviewChange?.({ visualDocument: null }); }}>Restore legacy rendering</button></details>}
        </div>
      </fieldset>

      <div className="sticky bottom-0 z-20 flex flex-col gap-3 rounded-b-xl border-t border-[var(--border)] bg-[var(--panel)] px-5 py-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Save stores the dashboard draft. Publish or update to sync with Discord.</p>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {panel && (
            <button type="button" onClick={publishPanel} disabled={state.publishing || state.loading || dirty} className="btn btn-primary">
              {state.publishing ? 'Publishing...' : isPublished ? 'Update Discord Message' : 'Publish Panel'}
            </button>
          )}
          <button disabled={state.loading || state.publishing || Boolean(state.uploading)} className="btn btn-primary">
            {state.loading ? 'Saving...' : panel ? 'Save Changes' : 'Create Panel Draft'}
          </button>
        </div>
      </div>
    </form>
  );
}
