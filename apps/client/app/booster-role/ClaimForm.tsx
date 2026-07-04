'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

type ValidationResponse = {
  ok: boolean;
  validation: {
    guildId: string;
    userId: string;
    expiresAt: string;
    existingRole: {
      roleId: string;
      name: string;
      color: string;
    } | null;
  };
};

type ClaimResponse = {
  ok: boolean;
  role: {
    roleId: string;
    name: string;
    color: string;
  };
};

export function ClaimForm({ guildId: initialGuildId, token }: { guildId: string; token: string }) {
  const [guildId, setGuildId] = useState(initialGuildId);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#ffffff');
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
      setGuildId(res.validation.guildId);
      setName(res.validation.existingRole?.name || '');
      setColor(res.validation.existingRole?.color || '#ffffff');
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

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const res = await api<ClaimResponse>(`/guilds/${guildId}/booster-role/claim`, {
        method: 'POST',
        body: JSON.stringify({ token, name, color }),
      });
      setName(res.role.name);
      setColor(res.role.color);
      setSuccess('Your custom booster role has been saved and assigned.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save your custom booster role.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="card p-6 text-sm text-[var(--muted)]">Validating booster role link...</div>;
  }

  if (error && !guildId) {
    return <div className="notice notice-error">{error}</div>;
  }

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <section className="card p-6 space-y-5">
        <div>
          <h2 className="text-xl font-bold text-[var(--text)]">Custom Booster Role</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">Choose a role name and color. Your booster status is checked before every save.</p>
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

        <label className="block">
          <span className="field-label">Role color</span>
          <div className="flex gap-3">
            <input
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-11 w-16 rounded-md border border-[var(--border)] bg-[var(--surface)]"
            />
            <input
              className="input"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              pattern="#[0-9a-fA-F]{6}"
              required
            />
          </div>
        </label>

        <button type="submit" disabled={saving} className="btn btn-primary px-5 py-3">
          {saving ? 'Saving role...' : 'Save custom role'}
        </button>
      </section>

      <aside className="card p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Preview</p>
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-[var(--panel-strong)]" />
            <div>
              <div className="text-sm font-semibold text-[var(--text)]">Your Discord profile</div>
              <div className="mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={{ color, border: `1px solid ${color}` }}>
                {name || 'Custom role'}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </form>
  );
}
