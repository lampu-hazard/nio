'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import type { Panel } from '@/lib/types';

type ChannelOption = { id: string; name: string };
type PanelType = 'SELF_ROLE' | 'RULES' | 'ANNOUNCEMENT';

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
};

type FormState = {
  error?: string;
  success?: string;
  loading: boolean;
  uploading?: 'banner' | 'thumbnail';
};

const TEMPLATES: Record<string, Partial<Draft>> = {
  rules: {
    type: 'RULES',
    name: 'Server Rules',
    title: 'Server Rules',
    accentText: 'Please read before participating',
    description: '**1. BASIC**\n• Hormati semua member dan staff.\n• Dilarang spam, toxic, SARA, scam, phishing, atau konten berbahaya.\n• Gunakan channel sesuai topik.\n\n**2. GENERAL**\n• Jangan mention staff tanpa alasan penting.\n• Dilarang menyebarkan data pribadi orang lain.\n• Ikuti arahan moderator.\n\n**3. SAFETY**\n• Jangan klik link mencurigakan.\n• Laporkan masalah ke staff.',
    color: '#ff2f7d',
    style: 'PREMIUM',
  },
  selfRole: {
    type: 'SELF_ROLE',
    name: 'Self Roles',
    title: '✦ Self Roles',
    accentText: 'Customize your profile',
    description: 'Pilih role di bawah untuk mengatur profil kamu.',
    color: '#5865F2',
    style: 'PREMIUM',
  },
  announcement: {
    type: 'ANNOUNCEMENT',
    name: 'Announcement',
    title: 'Announcement',
    accentText: 'Official server update',
    description: '**Update baru!**\n\nTulis pengumuman server kamu di sini. Kamu bisa pakai banner, thumbnail, dan markdown Discord.',
    color: '#34d399',
    style: 'COLORFUL',
  },
};

function initialDraft(panel?: Panel | null): Draft {
  return {
    name: panel?.name || '',
    title: panel?.title || '✦ Self Roles',
    accentText: panel?.accentText || '',
    description: panel?.description || 'Pilih role di bawah untuk mengatur profil kamu.',
    type: panel?.type || 'SELF_ROLE',
    mode: panel?.mode || 'BUTTONS',
    style: panel?.style || 'PREMIUM',
    color: panel?.color || '#5865F2',
    imageUrl: panel?.imageUrl || '',
    thumbnailUrl: panel?.thumbnailUrl || '',
  };
}

function optional(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function publicUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) return `${window.location.origin}${trimmed}`;
  return trimmed;
}

export function PanelForm({
  guildId,
  panel,
  channels = [],
  onPreviewChange,
  initialValues,
}: {
  guildId: string;
  panel?: Panel | null;
  channels?: ChannelOption[];
  onPreviewChange?: (draft: Partial<Panel>) => void;
  initialValues?: Partial<Draft>;
}) {
  const router = useRouter();
  const [state, setState] = useState<FormState>({ loading: false });
  const [draft, setDraft] = useState<Draft>(() => ({ ...initialDraft(panel), ...initialValues }));
  const [channelId, setChannelId] = useState(panel?.channelId || '');
  const isPublished = panel?.status === 'PUBLISHED';

  function patchDraft(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    onPreviewChange?.({ ...panel, ...next, channelId, roles: panel?.roles || [] });
  }

  function applyTemplate(key: keyof typeof TEMPLATES) {
    patchDraft(TEMPLATES[key]);
  }

  async function uploadImage(kind: 'banner' | 'thumbnail', file?: File) {
    if (!file) return;
    setState({ loading: false, uploading: kind });

    if (file.size > 5 * 1024 * 1024) {
      setState({ loading: false, error: 'Ukuran gambar maksimal 5 MB' });
      return;
    }

    try {
      // 1. Get presigned upload URL from backend
      const res = await fetch(`/api/guilds/${guildId}/panels/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, contentType: file.type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Gagal mendapatkan upload URL');

      const { uploadUrl, url } = data;

      // 2. Direct upload to R2 with simple retry mechanism (3 attempts)
      let uploadSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
          });
          if (!uploadRes.ok) throw new Error(`R2 upload status: ${uploadRes.status}`);
          uploadSuccess = true;
          break;
        } catch (err) {
          if (attempt === 3) throw err;
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }

      if (!uploadSuccess) throw new Error('Gagal mengupload file ke storage');

      // 3. Update preview & state
      patchDraft(kind === 'banner' ? { imageUrl: url } : { thumbnailUrl: url });
      setState({
        loading: false,
        success: `${kind === 'banner' ? 'Banner' : 'Thumbnail'} berhasil diupload. Jangan lupa Save Changes.`,
      });
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'Gagal upload gambar' });
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ loading: true });

    const payload = {
      channelId: optional(channelId),
      name: draft.name.trim(),
      title: draft.title.trim(),
      accentText: optional(draft.accentText),
      description: optional(draft.description),
      type: draft.type,
      mode: draft.mode,
      style: draft.style,
      color: draft.color,
      imageUrl: optional(publicUrl(draft.imageUrl)),
      thumbnailUrl: optional(publicUrl(draft.thumbnailUrl)),
    };

    try {
      const response = await fetch(panel ? `/api/guilds/${guildId}/panels/${panel.id}` : `/api/guilds/${guildId}/panels`, {
        method: panel ? 'PATCH' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Gagal menyimpan panel');

      setState({
        loading: false,
        success: isPublished ? 'Perubahan tersimpan. Klik Update Discord Message untuk sync ke Discord.' : panel ? 'Panel berhasil disimpan.' : 'Panel berhasil dibuat.',
      });
      if (!panel && data.panel?.id) router.push(`/dashboard/${guildId}/panels/${data.panel.id}`);
      router.refresh();
    } catch (error) {
      setState({ loading: false, error: error instanceof Error ? error.message : 'Gagal menyimpan panel' });
    }
  }

  return (
    <form onSubmit={onSubmit} className="card overflow-hidden">
      <div className="border-b border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-5 md:px-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="badge mb-3">Panel Builder</div>
            <h2 className="text-2xl font-black tracking-tight">Panel identity</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-500">Buat rules, announcement, atau self-role panel dari satu editor.</p>
          </div>
          {panel?.status && <span className={`badge ${isPublished ? 'badge-live' : ''}`}>{isPublished ? 'Live' : panel.status}</span>}
        </div>
      </div>

      <div className="px-6 py-6 md:px-7">
        {state.error && <div className="notice notice-error mb-4">{state.error}</div>}
        {state.success && <div className="notice notice-success mb-4">{state.success}</div>}

        <div className="mb-6 grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-subtle)] p-2 sm:grid-cols-3">
          <button type="button" onClick={() => applyTemplate('rules')} className="btn border-transparent bg-white">Rules Template</button>
          <button type="button" onClick={() => applyTemplate('selfRole')} className="btn border-transparent bg-white">Self Role Template</button>
          <button type="button" onClick={() => applyTemplate('announcement')} className="btn border-transparent bg-white">Announcement Template</button>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
        <label className="block">
          <span className="field-label">Panel type</span>
          <select value={draft.type} onChange={(event) => patchDraft({ type: event.target.value as PanelType })} className="input">
            <option value="RULES">Rules / Info</option>
            <option value="SELF_ROLE">Self Role</option>
            <option value="ANNOUNCEMENT">Announcement</option>
          </select>
        </label>

        <label className="block">
          <span className="field-label">Target channel</span>
          <select value={channelId} onChange={(event) => setChannelId(event.target.value)} className="input" required>
            <option value="" disabled>Pilih channel</option>
            {channels.map((ch) => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
          </select>
          {!channels.length && <p className="mt-2 text-xs text-amber-300">Channel belum kebaca. Pastikan bot ada di server dan punya akses channel.</p>}
        </label>

        <label className="block">
          <span className="field-label">Internal name</span>
          <input value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} className="input" placeholder="Contoh: Server Rules" required />
        </label>

        <label className="block">
          <span className="field-label">Visual style</span>
          <select value={draft.style} onChange={(event) => patchDraft({ style: event.target.value as Draft['style'] })} className="input">
            <option value="PREMIUM">Premium</option>
            <option value="MINIMAL">Minimal</option>
            <option value="COLORFUL">Colorful</option>
            <option value="NEON">Neon</option>
          </select>
        </label>

        <label className="block md:col-span-2">
          <span className="field-label">Embed title</span>
          <input value={draft.title} onChange={(event) => patchDraft({ title: event.target.value })} className="input text-lg font-bold" required />
        </label>

        <label className="block md:col-span-2">
          <span className="field-label">Accent text</span>
          <input value={draft.accentText} onChange={(event) => patchDraft({ accentText: event.target.value })} placeholder="Opsional: pilih identitas server kamu" className="input" />
        </label>

        <label className="block md:col-span-2">
          <span className="field-label">Description / content body</span>
          <textarea value={draft.description} onChange={(event) => patchDraft({ description: event.target.value })} rows={12} className="input resize-y leading-7" />
          <p className="mt-2 text-xs text-slate-500">Markdown Discord didukung: **bold**, bullet •, heading section, dan baris kosong.</p>
        </label>

        <label className="block">
          <span className="field-label">Interaction mode</span>
          <select value={draft.mode} onChange={(event) => patchDraft({ mode: event.target.value as Draft['mode'] })} className="input" disabled={draft.type !== 'SELF_ROLE'}>
            <option value="BUTTONS">Buttons</option>
            <option value="MENU">Dropdown Menu</option>
          </select>
          {draft.type !== 'SELF_ROLE' && <p className="mt-2 text-xs text-slate-500">Rules/announcement tidak menampilkan role components.</p>}
        </label>

        <label className="block">
          <span className="field-label">Accent color</span>
          <div className="card-flat flex items-center gap-4 p-3">
            <input type="color" value={draft.color} onChange={(event) => patchDraft({ color: event.target.value })} className="h-12 w-16 cursor-pointer rounded-xl border border-[var(--border)] bg-white p-1" />
            <div>
              <p className="text-sm font-bold text-slate-700">Embed accent</p>
              <p className="text-xs text-slate-500">Dipakai untuk garis embed dan preview.</p>
            </div>
          </div>
        </label>

        <div className="md:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="font-black">Media & banner</h3>
              <p className="text-sm text-slate-500">Gunakan URL gambar publik HTTPS. File lokal tidak bisa langsung dipakai Discord.</p>
            </div>
            <span className="badge">Banner ready</span>
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
                <span className="text-xs text-slate-500">1200×420 atau 1600×600 direkomendasikan.</span>
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
                <span className="text-xs text-slate-500">Logo kecil di pojok embed.</span>
              </div>
            </label>
          </div>
        </div>
      </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--border)] bg-[var(--bg-subtle)] px-6 py-5 sm:flex-row sm:items-center sm:justify-between md:px-7">
        <p className="text-sm text-slate-500">Save menyimpan dashboard. Publish/update untuk sync ke Discord.</p>
        <button disabled={state.loading} className="btn btn-primary">
          {state.loading ? 'Saving...' : panel ? 'Save Changes' : 'Create Panel'}
        </button>
      </div>
    </form>
  );
}
