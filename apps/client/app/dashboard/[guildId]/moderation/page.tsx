'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

type WarningLog = {
  id: string;
  userId: string;
  moderatorId: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
};

type ModerationSettings = {
  warnLimitEnabled: boolean;
  warnLimitThreshold: number;
  warnTimeoutDurationMin: number;
  warnExpiryDays: number;
};

type PageProps = {
  params: Promise<{ guildId: string }>;
};

export default function ModerationPage({ params }: PageProps) {
  const { guildId } = use(params);
  const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');
  const [settings, setSettings] = useState<ModerationSettings>({
    warnLimitEnabled: false,
    warnLimitThreshold: 3,
    warnTimeoutDurationMin: 60,
    warnExpiryDays: 30,
  });

  const [warnings, setWarnings] = useState<WarningLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters state
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'expired'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    fetchData();
  }, [guildId, search, status, sort]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const settingsRes = await api<{ ok: boolean; settings: ModerationSettings }>(`/guilds/${guildId}/moderation/settings`);
      setSettings(settingsRes.settings);

      const queryParams = new URLSearchParams({
        search,
        status,
        sort,
      });
      const warningsRes = await api<{ ok: boolean; warnings: WarningLog[] }>(`/guilds/[guildId]/moderation/warnings?${queryParams.toString()}`.replace('[guildId]', guildId));
      setWarnings(warningsRes.warnings || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load moderation data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const res = await api<{ ok: boolean; settings: ModerationSettings }>(`/guilds/${guildId}/moderation/settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setSettings(res.settings);
      setSuccess('Settings updated successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Are you sure you want to revoke this warning?')) return;
    try {
      setError('');
      await api(`/guilds/${guildId}/moderation/warnings/${id}`, { method: 'DELETE' });
      setWarnings((prev) => prev.filter((w) => w.id !== id));
      setSuccess('Warning revoked successfully.');
    } catch (err: any) {
      setError(err?.message || 'Failed to revoke warning');
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() < Date.now();
  };

  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Security</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">Warnings & Penalties</h1>
          <p className="mt-1 text-[var(--muted)]">Manage server warnings, active points, auto-timeouts, and infraction logs.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="moderation" />

        {error && <div className="notice notice-error mb-6">{error}</div>}
        {success && <div className="notice notice-success mb-6">{success}</div>}

        <div className="flex gap-4 border-b border-[var(--border)] pb-px mb-6">
          <button
            onClick={() => setActiveTab('config')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'config' ? 'border-indigo-600 text-[var(--text)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            Configuration
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors ${
              activeTab === 'logs' ? 'border-indigo-600 text-[var(--text)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--text)]'
            }`}
          >
            Warning Logs
          </button>
        </div>

        {loading && warnings.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-[var(--muted)]">Loading moderation tools...</div>
        ) : activeTab === 'config' ? (
          <form onSubmit={handleSaveSettings} className="space-y-6 max-w-3xl">
            <section className="card p-6">
              <h2 className="text-lg font-bold text-[var(--text)]">Auto Timeout</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Mute members automatically when warning limits are reached.</p>

              <div className="mt-5 space-y-4">
                <label className="flex items-center justify-between gap-4 p-4 border border-[var(--border)] rounded-lg bg-[var(--surface)]">
                  <span>
                    <span className="block text-sm font-semibold text-[var(--text)]">Enable Timeout threshold</span>
                    <span className="block text-xs text-[var(--muted)]">Mute members automatically when threshold limit is reached.</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.warnLimitEnabled}
                    onChange={(e) => setSettings(prev => ({ ...prev, warnLimitEnabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-50"
                  />
                </label>

                {settings.warnLimitEnabled && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="field-label">Warning Limit</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={settings.warnLimitThreshold}
                        onChange={(e) => setSettings(prev => ({ ...prev, warnLimitThreshold: parseInt(e.target.value) || 3 }))}
                        className="input"
                      />
                    </label>

                    <label className="block">
                      <span className="field-label">Timeout Duration (Minutes)</span>
                      <input
                        type="number"
                        min="1"
                        value={settings.warnTimeoutDurationMin}
                        onChange={(e) => setSettings(prev => ({ ...prev, warnTimeoutDurationMin: parseInt(e.target.value) || 60 }))}
                        className="input"
                      />
                    </label>
                  </div>
                )}

                <label className="block">
                  <span className="field-label">Warning Expiry Days</span>
                  <select
                    value={settings.warnExpiryDays}
                    onChange={(e) => setSettings(prev => ({ ...prev, warnExpiryDays: parseInt(e.target.value) || 0 }))}
                    className="input"
                  >
                    <option value={7}>7 Days</option>
                    <option value={30}>30 Days</option>
                    <option value={90}>90 Days</option>
                    <option value={0}>Never Expire</option>
                  </select>
                </label>
              </div>
            </section>

            <button type="submit" disabled={saving} className="btn btn-primary px-6 py-3">
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4 items-end bg-[var(--surface)] p-4 rounded-xl border border-[var(--border)]">
              <label className="block md:col-span-2">
                <span className="field-label">Search user</span>
                <input
                  type="text"
                  placeholder="Search by User ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="input"
                />
              </label>

              <label className="block">
                <span className="field-label">Status</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="input"
                >
                  <option value="all">All Warnings</option>
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                </select>
              </label>

              <label className="block">
                <span className="field-label">Sort</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as any)}
                  className="input"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </label>
            </div>

            <div className="card overflow-hidden">
              <div className="p-6">
                {warnings.length === 0 ? (
                  <div className="py-12 text-center text-sm text-[var(--muted)]">No warnings found matching the criteria.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--muted)] font-semibold">
                          <th className="pb-3">Offender (User ID)</th>
                          <th className="pb-3">Issued By</th>
                          <th className="pb-3">Reason</th>
                          <th className="pb-3">Date</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {warnings.map((w) => {
                          const expired = isExpired(w.expiresAt);
                          return (
                            <tr key={w.id} className="text-[var(--text-secondary)]">
                              <td className="py-4 font-mono">{w.userId}</td>
                              <td className="py-4 font-mono">{w.moderatorId}</td>
                              <td className="py-4 max-w-xs truncate" title={w.reason}>{w.reason}</td>
                              <td className="py-4">
                                {new Date(w.createdAt).toLocaleDateString(undefined, {
                                  dateStyle: 'medium',
                                })}
                              </td>
                              <td className="py-4">
                                <span className={`badge ${!expired ? 'badge-live' : ''}`}>
                                  {!expired ? 'Active' : 'Expired'}
                                </span>
                              </td>
                              <td className="py-4 text-right">
                                <button
                                  onClick={() => handleRevoke(w.id)}
                                  className="btn btn-danger h-8 px-3 text-xs"
                                >
                                  Revoke
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
