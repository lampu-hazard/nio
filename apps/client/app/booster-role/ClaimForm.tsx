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
            <StyleButton active={styleMode === 'solid'} label="Solid" description="One standard role color" onClick={() => setStyleMode('solid')} />
            <StyleButton active={styleMode === 'gradient'} label="Gradient" description="Two-color Discord gradient" onClick={() => setStyleMode('gradient')} />
            <StyleButton active={styleMode === 'holographic'} label="Holographic" description="Official Discord holographic style" onClick={() => setStyleMode('holographic')} />
          </div>
        </div>

        {styleMode !== 'holographic' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField label="Primary color" value={primaryColor} onChange={setPrimaryColor} required />
            {styleMode === 'gradient' && <ColorField label="Secondary color" value={secondaryColor} onChange={setSecondaryColor} required />}
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]">
            Holographic uses Discord's required color set: #a9ffff / #ffcccc / #ffe0a0. Discord rejects arbitrary third colors.
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

function ColorField({ label, value, onChange, required = false }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <div className="flex gap-2">
        <input
          type="color"
          value={value || '#ffffff'}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-14 rounded-md border border-[var(--border)] bg-[var(--surface)]"
        />
        <input
          className="input min-w-0"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          pattern="#[0-9a-fA-F]{6}"
          required={required}
          placeholder="#ffffff"
        />
      </div>
    </label>
  );
}
