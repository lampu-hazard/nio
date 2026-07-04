'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type ExistingRole = {
  roleId: string;
  name: string;
  color: string;
  primaryColor: string;
  secondaryColor: string | null;
  tertiaryColor: string | null;
  iconUrl: string | null;
};

type ValidationResponse = {
  ok: boolean;
  validation: {
    guildId: string;
    userId: string;
    expiresAt: string;
    existingRole: ExistingRole | null;
  };
};

type ClaimResponse = {
  ok: boolean;
  role: ExistingRole;
};

type StyleMode = 'solid' | 'gradient' | 'holographic';
type ColorHandle = 'primary' | 'secondary';

const MAX_ICON_BYTES = 256 * 1024;
const HOLOGRAPHIC = {
  primaryColor: '#a9ffff',
  secondaryColor: '#ffcccc',
  tertiaryColor: '#ffe0a0',
};

export function ClaimForm({ guildId: initialGuildId, token }: { guildId: string; token: string }) {
  const [guildId, setGuildId] = useState(initialGuildId);
  const [name, setName] = useState('');
  const [styleMode, setStyleMode] = useState<StyleMode>('solid');
  const [primaryColor, setPrimaryColor] = useState('#ffffff');
  const [secondaryColor, setSecondaryColor] = useState('#a1a1aa');
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [iconDataUrl, setIconDataUrl] = useState<string | null>(null);
  const [removeIcon, setRemoveIcon] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ token });
      const res = await api<ValidationResponse>(`/guilds/${initialGuildId}/booster-role/validate-token?${params.toString()}`);
      const existing = res.validation.existingRole;
      setGuildId(res.validation.guildId);
      setName(existing?.name || '');
      setPrimaryColor(existing?.primaryColor || existing?.color || '#ffffff');
      setSecondaryColor(existing?.secondaryColor || '#a1a1aa');
      setStyleMode(existing?.tertiaryColor ? 'holographic' : existing?.secondaryColor ? 'gradient' : 'solid');
      setIconUrl(existing?.iconUrl || null);
    } catch (err: any) {
      const message = err?.message || 'This booster role link is invalid or expired.';
      if (message.toLowerCase().includes('login')) {
        window.location.href = `/api/auth/discord`;
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const selectedColors = styleMode === 'holographic'
    ? HOLOGRAPHIC
    : {
        primaryColor,
        secondaryColor: styleMode === 'gradient' ? secondaryColor : undefined,
        tertiaryColor: undefined,
      };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const res = await api<ClaimResponse>(`/guilds/${guildId}/booster-role/claim`, {
        method: 'POST',
        body: JSON.stringify({
          token,
          name,
          ...selectedColors,
          iconDataUrl: iconDataUrl || undefined,
          removeIcon,
        }),
      });
      setName(res.role.name);
      setPrimaryColor(res.role.primaryColor || res.role.color);
      setSecondaryColor(res.role.secondaryColor || '#a1a1aa');
      setStyleMode(res.role.tertiaryColor ? 'holographic' : res.role.secondaryColor ? 'gradient' : 'solid');
      setIconUrl(res.role.iconUrl || null);
      setIconDataUrl(null);
      setRemoveIcon(false);
      setSuccess('Your custom booster role has been saved and assigned.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save your custom booster role.');
    } finally {
      setSaving(false);
    }
  };

  const handleIconChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Role icon must be a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setError('Role icon must be 256 KB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setIconDataUrl(String(reader.result));
      setRemoveIcon(false);
    };
    reader.readAsDataURL(file);
  };

  const previewBackground = styleMode === 'holographic'
    ? `linear-gradient(135deg, ${HOLOGRAPHIC.primaryColor}, ${HOLOGRAPHIC.secondaryColor}, ${HOLOGRAPHIC.tertiaryColor})`
    : styleMode === 'gradient'
      ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
      : primaryColor;
  const previewIcon = iconDataUrl || (!removeIcon ? iconUrl : null);

  if (loading) {
    return <div className="card p-6 text-sm text-[var(--muted)]">Validating booster role link...</div>;
  }

  if (error && !guildId) {
    return <div className="notice notice-error">{error}</div>;
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="card p-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)]">Custom Booster Role</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Choose a role name, Discord-supported role style, and an optional icon.</p>
        </div>

        {error && <div className="notice notice-error">{error}</div>}
        {success && <div className="notice notice-success">{success}</div>}

        <label className="block">
          <span className="field-label">Role name</span>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            maxLength={32}
            required
            placeholder="e.g. midnight supporter"
          />
        </label>

        <div>
          <span className="field-label">Role style</span>
          <div className="grid gap-3 sm:grid-cols-3">
            <StyleButton active={styleMode === 'solid'} label="Default" description="Discord's standard single color" onClick={() => setStyleMode('solid')} />
            <StyleButton active={styleMode === 'gradient'} label="Gradient" description="Discord's two-color role style" onClick={() => setStyleMode('gradient')} />
            <StyleButton active={styleMode === 'holographic'} label="Holographic" description="Discord's official holographic preset" onClick={() => setStyleMode('holographic')} />
          </div>
        </div>

        {styleMode !== 'holographic' ? (
          <RoleColorSlider
            mode={styleMode}
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            onPrimaryColor={setPrimaryColor}
            onSecondaryColor={setSecondaryColor}
          />
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            <div className="h-10 rounded-lg border border-[var(--border)]" style={{ background: `linear-gradient(135deg, ${HOLOGRAPHIC.primaryColor}, ${HOLOGRAPHIC.secondaryColor}, ${HOLOGRAPHIC.tertiaryColor})` }} />
            <p className="mt-3">Holographic uses Discord's required color set: #a9ffff / #ffcccc / #ffe0a0. Discord rejects arbitrary third colors.</p>
          </div>
        )}

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <label className="block">
            <span className="field-label">Role icon</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleIconChange}
              className="block w-full text-sm text-[var(--muted)] file:mr-4 file:rounded-md file:border-0 file:bg-zinc-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white dark:file:bg-zinc-50 dark:file:text-zinc-950"
            />
          </label>
          <p className="mt-2 text-xs text-[var(--muted)]">PNG, JPG, or WebP. Max 256 KB. Discord may require the server to have role icons unlocked.</p>
          {(previewIcon || iconDataUrl) && (
            <button
              type="button"
              onClick={() => {
                setIconDataUrl(null);
                setIconUrl(null);
                setRemoveIcon(true);
              }}
              className="btn btn-secondary mt-3 h-9 px-3 text-xs"
            >
              Remove icon
            </button>
          )}
        </div>

        <button type="submit" disabled={saving} className="btn btn-primary px-5 py-3">
          {saving ? 'Saving role...' : 'Save custom role'}
        </button>
      </section>

      <aside className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Preview</p>
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--panel-strong)]">
              {previewIcon ? <img src={previewIcon} alt="" className="h-full w-full object-cover" /> : <span className="text-lg font-black text-[var(--muted)]">✦</span>}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--text)]">Your Discord profile</div>
              <div
                className="mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-bold text-white shadow-sm"
                style={{ background: previewBackground }}
              >
                {name || 'Custom role'}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </form>
  );
}

function StyleButton({ active, label, description, onClick }: { active: boolean; label: string; description: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-colors ${
        active ? 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--panel-strong)]'
      }`}
    >
      <span className="block text-sm font-bold">{label}</span>
      <span className={`mt-1 block text-xs ${active ? 'opacity-80' : 'text-[var(--muted)]'}`}>{description}</span>
    </button>
  );
}

function RoleColorSlider({
  mode,
  primaryColor,
  secondaryColor,
  onPrimaryColor,
  onSecondaryColor,
}: {
  mode: 'solid' | 'gradient';
  primaryColor: string;
  secondaryColor: string;
  onPrimaryColor: (value: string) => void;
  onSecondaryColor: (value: string) => void;
}) {
  const [activeHandle, setActiveHandle] = useState<ColorHandle>('primary');
  const primaryHue = hexToHue(primaryColor);
  const secondaryHue = hexToHue(secondaryColor);

  const updateFromPointer = (event: React.PointerEvent<HTMLDivElement>, handle: ColorHandle) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const color = hueToHex(Math.round(percent * 360));
    if (handle === 'primary') onPrimaryColor(color);
    else onSecondaryColor(color);
  };

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const handle = mode === 'gradient'
      ? nearestHandle(event, event.currentTarget, primaryHue, secondaryHue)
      : 'primary';
    setActiveHandle(handle);
    updateFromPointer(event, handle);
  };

  const onTrackPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    updateFromPointer(event, activeHandle);
  };

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="field-label mb-0">Role color</span>
        <span className="text-xs text-[var(--muted)]">Drag {mode === 'gradient' ? 'the handles' : 'the handle'} to pick color</span>
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Role color hue slider"
        className="relative mt-4 h-12 cursor-pointer rounded-xl border border-[var(--border)] shadow-sm"
        style={{ background: 'linear-gradient(90deg, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onTrackPointerMove}
      >
        <ColorHandleMarker label="1" hue={primaryHue} color={primaryColor} />
        {mode === 'gradient' && <ColorHandleMarker label="2" hue={secondaryHue} color={secondaryColor} />}
      </div>

      <div className="mt-4 rounded-lg border border-[var(--border)] p-3" style={{ background: mode === 'gradient' ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` : primaryColor }}>
        <div className="inline-flex rounded-full bg-black/45 px-2 py-1 font-mono text-xs font-semibold text-white backdrop-blur-sm">
          {mode === 'gradient' ? `${primaryColor} → ${secondaryColor}` : primaryColor}
        </div>
      </div>
    </div>
  );
}

function ColorHandleMarker({ label, hue, color }: { label: string; hue: number; color: string }) {
  return (
    <div
      className="absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-black text-white shadow-lg ring-2 ring-zinc-950/40"
      style={{ left: `${(hue / 360) * 100}%`, background: color }}
    >
      {label}
    </div>
  );
}

function nearestHandle(event: React.PointerEvent<HTMLDivElement>, element: HTMLDivElement, primaryHue: number, secondaryHue: number): ColorHandle {
  const rect = element.getBoundingClientRect();
  const hue = clamp((event.clientX - rect.left) / rect.width, 0, 1) * 360;
  return Math.abs(hue - primaryHue) <= Math.abs(hue - secondaryHue) ? 'primary' : 'secondary';
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hexToHue(hex: string) {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : '#ffffff';
  const r = Number.parseInt(normalized.slice(1, 3), 16) / 255;
  const g = Number.parseInt(normalized.slice(3, 5), 16) / 255;
  const b = Number.parseInt(normalized.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  else if (max === g) hue = (b - r) / delta + 2;
  else hue = (r - g) / delta + 4;
  return Math.round((hue * 60 + 360) % 360);
}

function hueToHex(hue: number) {
  const c = 1;
  const x = 1 - Math.abs(((hue / 60) % 2) - 1);
  const m = 0;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return `#${toHex((r + m) * 255)}${toHex((g + m) * 255)}${toHex((b + m) * 255)}`;
}

function toHex(value: number) {
  return Math.round(value).toString(16).padStart(2, '0');
}
