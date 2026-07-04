'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

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
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Boosters</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Booster Custom Roles</h1>
          <p className="mt-1 text-[var(--muted)]">Review, audit, and delete custom roles created by active server boosters.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="booster-roles" />

        {error && <div className="notice notice-error mb-6">{error}</div>}
        {success && <div className="notice notice-success mb-6">{success}</div>}

        <section className="card overflow-hidden">
          <div className="border-b border-[var(--border)] p-6">
            <h2 className="text-lg font-bold text-[var(--text)]">Created Roles</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Members create these roles from their private `/booster-role` link.</p>
          </div>

          {loading ? (
            <div className="p-8 text-sm text-[var(--muted)]">Loading booster roles...</div>
          ) : roles.length === 0 ? (
            <div className="p-8 text-sm text-[var(--muted)]">No booster custom roles have been created yet.</div>
          ) : (
            <div className="overflow-x-auto p-6">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="pb-3">Member</th>
                    <th className="pb-3">Role</th>
                    <th className="pb-3">Style</th>
                    <th className="pb-3">Updated</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {roles.map((role) => (
                    <tr key={role.id}>
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          {role.user.avatarUrl ? (
                            <img src={role.user.avatarUrl} alt="" className="h-9 w-9 rounded-full border border-[var(--border)]" />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-strong)] text-xs font-bold text-[var(--muted)]">
                              {(role.user.displayName || role.user.username || role.userId).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-[var(--text)]">{role.user.displayName || role.user.username || 'Unknown user'}</div>
                            <div className="text-xs text-[var(--muted)]">{role.user.username ? `@${role.user.username}` : role.userId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4">
                        <div className="font-semibold text-[var(--text)]">{role.roleName}</div>
                        <div className="font-mono text-xs text-[var(--muted)]">{role.roleId}</div>
                        {!role.roleExists && <span className="badge mt-1">Missing in Discord</span>}
                      </td>
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--panel-strong)]">
                            {role.iconUrl ? <img src={role.iconUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-xs text-[var(--muted)]">No icon</span>}
                          </div>
                          <div className="space-y-1">
                            <div
                              className="h-5 w-24 rounded-full border border-[var(--border)]"
                              style={{ background: role.tertiaryColor ? `linear-gradient(135deg, ${role.primaryColor}, ${role.secondaryColor || role.primaryColor}, ${role.tertiaryColor})` : role.secondaryColor ? `linear-gradient(135deg, ${role.primaryColor}, ${role.secondaryColor})` : role.primaryColor }}
                            />
                            <div className="font-mono text-[11px] text-[var(--muted)]">
                              {[role.primaryColor, role.secondaryColor, role.tertiaryColor].filter(Boolean).join(' / ')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 text-[var(--muted)]">{new Date(role.updatedAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}</td>
                      <td className="py-4 text-right">
                        <button onClick={() => deleteRole(role)} className="btn btn-danger h-9 px-3 text-xs">Delete</button>
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
