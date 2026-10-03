'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';

type BoosterRole = {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  name: string;
  primaryColor: string;
  secondaryColor: string | null;
  tertiaryColor: string | null;
  iconUrl: string | null;
  roleExists: boolean;
  active: boolean;
  revokedAt: string | null;
  updatedAt: string;
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

type RolesResponse = {
  ok: boolean;
  roles: BoosterRole[];
};

type PageProps = {
  params: Promise<{ guildId: string }>;
};

export default function BoosterRolesPage({ params }: PageProps) {
  const { guildId } = use(params);
  const [roles, setRoles] = useState<BoosterRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadRoles();
  }, [guildId]);

  const loadRoles = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api<RolesResponse>(`/guilds/${guildId}/booster-role/roles`);
      setRoles(res.roles);
    } catch (err: any) {
      setError(err?.message || 'Failed to load booster custom roles.');
    } finally {
      setLoading(false);
    }
  };

  const deleteRole = async (role: BoosterRole) => {
    if (!confirm(`Delete custom booster role "${role.name}"? This removes the Discord role too.`)) return;
    try {
      setError('');
      setSuccess('');
      await api(`/guilds/${guildId}/booster-role/roles/${role.id}`, { method: 'DELETE' });
      setRoles((prev) => prev.filter((item) => item.id !== role.id));
      setSuccess('Custom booster role deleted.');
    } catch (err: any) {
      setError(err?.message || 'Failed to delete custom booster role.');
    }
  };

  return (
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div>
            <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">Custom Booster Roles</h2>
            <p className="text-xs text-[var(--muted)]">Review, audit, and manage personalized roles granted to Nitro server boosters.</p>
          </div>
          <span className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
            {roles.length} roles
          </span>
        </div>

        {error && <div className="notice notice-error" role="alert">{error}</div>}
        {success && <div className="notice notice-success" role="status">{success}</div>}

        <section className="card overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-[var(--muted)]">Loading booster roles...</div>
          ) : roles.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--muted)]">No booster custom roles have been created yet.</div>
          ) : (
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[var(--panel)] border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="py-2.5 px-3">Member</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Style</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Updated</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] text-[var(--text)]">
                  {roles.map((role) => (
                    <tr key={role.id} className="hover:bg-[var(--surface)]/50 transition-colors">
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          {role.user.avatarUrl ? (
                            <img src={role.user.avatarUrl} alt="" className="h-6 w-6 rounded-full border border-[var(--border)] shrink-0" />
                          ) : (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-strong)] text-[10px] font-bold text-[var(--muted)] shrink-0">
                              {(role.user.displayName || role.user.username || role.userId).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-semibold block truncate text-xs">{role.user.displayName || role.user.username || 'Unknown'}</span>
                            <span className="text-[10px] text-[var(--muted)] block truncate">{role.user.username ? `@${role.user.username}` : role.userId}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3">
                        <span className="font-semibold block text-xs truncate">{role.roleName}</span>
                        <span className="font-mono text-[10px] text-[var(--muted)] block truncate">{role.roleId}</span>
                        {!role.roleExists && <span className="rounded bg-rose-500/10 text-rose-500 text-[9px] px-1 py-0.2">Missing</span>}
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)] shrink-0">
                            {role.iconUrl ? <img src={role.iconUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] text-[var(--muted)]">―</span>}
                          </div>
                          <div className="space-y-0.5">
                            <div
                              className="h-3 w-16 rounded border border-[var(--border)]"
                              style={{ background: role.tertiaryColor ? `linear-gradient(135deg, ${role.primaryColor}, ${role.secondaryColor || role.primaryColor}, ${role.tertiaryColor})` : role.secondaryColor ? `linear-gradient(135deg, ${role.primaryColor}, ${role.secondaryColor})` : role.primaryColor }}
                            />
                            <div className="font-mono text-[9px] text-[var(--muted)]">
                              {[role.primaryColor, role.secondaryColor, role.tertiaryColor].filter(Boolean).join(' · ')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          role.active ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]'
                        }`}>
                          {role.active ? 'Active' : 'Revoked'}
                        </span>
                        {role.revokedAt && <div className="text-[10px] text-[var(--muted)] mt-0.5">{new Date(role.revokedAt).toLocaleDateString()}</div>}
                      </td>
                      <td className="py-2 px-3 text-[11px] text-[var(--muted)] whitespace-nowrap">{new Date(role.updatedAt).toLocaleDateString()}</td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => deleteRole(role)}
                          className="rounded px-2.5 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
