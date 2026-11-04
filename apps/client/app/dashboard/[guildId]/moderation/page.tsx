'use client';

import React, { useEffect, useRef, useState, use } from 'react';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { api } from '@/lib/api';

type DiscordProfile = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

type WarningLog = {
  id: string;
  userId: string;
  moderatorId: string;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  user?: DiscordProfile;
  moderator?: DiscordProfile;
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
  return <ModerationSettingsForm key={guildId} guildId={guildId} />;
}

function ModerationSettingsForm({ guildId }: { guildId: string }) {
  const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');
  const [settings, setSettings] = useState<ModerationSettings>({
    warnLimitEnabled: false,
    warnLimitThreshold: 3,
    warnTimeoutDurationMin: 60,
    warnExpiryDays: 30,
  });

  const [warnings, setWarnings] = useState<WarningLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedGuild, setLoadedGuild] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters state
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | 'active' | 'expired'>('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');

  const [baseline, setBaseline] = useState<ModerationSettings | null>(null);
  const [retry, setRetry] = useState(0);
  const [warningsError, setWarningsError] = useState('');
  const [warningsLoading, setWarningsLoading] = useState(true);
  const lifetime = useRef<AbortController | null>(null);
  const pending = useRef(false);
  const dirty = !!baseline && JSON.stringify(settings) !== JSON.stringify(baseline);
  useUnsavedChanges(dirty);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [guildId, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setWarningsLoading(true); setWarningsError('');
    const query = new URLSearchParams({ search, status, sort });
    void api<{ ok: boolean; warnings: WarningLog[] }>(`/guilds/${guildId}/moderation/warnings?${query}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setWarnings(result.warnings); })
      .catch(reason => { if (!controller.signal.aborted) setWarningsError(reason instanceof Error ? reason.message : 'Warnings unavailable.'); })
      .finally(() => { if (!controller.signal.aborted) setWarningsLoading(false); });
    return () => controller.abort();
  }, [guildId, search, status, sort, retry]);

  const fetchData = async (signal: AbortSignal) => {
    try {
      setLoading(true); setLoadedGuild('');
      const result = await api<{ ok: boolean; settings: ModerationSettings }>(`/guilds/${guildId}/moderation/settings`, { signal });
      if (signal.aborted) return;
      if (!result.ok || !result.settings) throw new Error('Moderation settings unavailable.');
      setSettings(result.settings); setBaseline(result.settings); setLoadedGuild(guildId); setError('');
    } catch (err: any) {
      if (!signal.aborted) setError(err?.message || 'Failed to load moderation data');
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading || pending.current || loadedGuild !== guildId || !dirty) return;
    pending.current = true;
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const payload = {
        ...settings,
        warnLimitThreshold: Number.isFinite(settings.warnLimitThreshold) ? settings.warnLimitThreshold : 3,
        warnTimeoutDurationMin: Number.isFinite(settings.warnTimeoutDurationMin) ? settings.warnTimeoutDurationMin : 60,
      };
      const res = await api<{ ok: boolean; settings: ModerationSettings }>(`/guilds/${guildId}/moderation/settings`, {
        method: 'PATCH',
        body: JSON.stringify(payload), signal: lifetime.current?.signal,
      });
      if (lifetime.current?.signal.aborted) return;
      if (!res.ok || !res.settings) throw new Error('Settings could not be saved.');
      setSettings(res.settings);
      setBaseline(res.settings);
      setSuccess('Settings updated successfully.');
    } catch (err: any) {
      if (!lifetime.current?.signal.aborted) setError(err?.message || 'Failed to save settings');
    } finally {
      pending.current = false;
      if (!lifetime.current?.signal.aborted) setSaving(false);
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

  const renderProfile = (profile: DiscordProfile | undefined, fallbackId: string) => {
    const displayName = profile?.displayName || profile?.username || 'Unknown user';
    const username = profile?.username ? `@${profile.username}` : fallbackId;
    const avatarInitial = displayName.charAt(0).toUpperCase();

    return (
      <div className="flex min-w-36 items-center gap-2">
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt=""
            className="h-6 w-6 rounded-full border border-[var(--border)] bg-[var(--panel-strong)] object-cover shrink-0"
          />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-strong)] text-[10px] font-bold text-[var(--muted)] shrink-0">
            {avatarInitial}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate font-semibold text-xs text-[var(--text)]">{displayName}</div>
          <div className="truncate text-[10px] text-[var(--muted)]">{username}</div>
        </div>
      </div>
    );
  };

  return (
    <main className="dashboard-page dashboard-page--wide dashboard-legacy">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Action & Tab Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <h1>Moderation</h1>
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('config')}
                className={`rounded-md px-3 py-1 font-semibold transition-all ${
                  activeTab === 'config'
                    ? 'bg-[var(--panel-strong)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Configuration
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('logs')}
                className={`rounded-md px-3 py-1 font-semibold transition-all ${
                  activeTab === 'logs'
                    ? 'bg-[var(--panel-strong)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Warning Logs ({warnings.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {error && <span className="text-xs font-semibold text-[var(--danger)]">{error}</span>}
            {success && <span className="text-xs font-semibold text-[var(--ok)]">{success}</span>}
            {activeTab === 'config' && (
              <button
                type="button"
                onClick={(e) => void handleSaveSettings(e as any)}
                disabled={saving || loading || loadedGuild !== guildId || !dirty}
                className="btn btn-primary text-xs font-bold py-1.5 px-4"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            )}
          </div>
        </div>

        {loading && warnings.length === 0 ? (
          <div className="card p-8 text-center text-xs text-[var(--muted)]">Loading moderation tools...</div>
        ) : loadedGuild !== guildId ? <div className="dashboard-notice" role="alert">Moderation data is unavailable. <button type="button" className="btn" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : activeTab === 'config' ? (
          <form onSubmit={handleSaveSettings} className="space-y-4 max-w-3xl">
            <fieldset disabled={saving} className="min-w-0"><section className="card p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Auto Timeout Threshold</h3>
                  <p className="text-[11px] text-[var(--muted)]">Mute members automatically when warning limits are reached.</p>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={settings.warnLimitEnabled}
                    onChange={(e) => setSettings(prev => ({ ...prev, warnLimitEnabled: e.target.checked }))}
                    className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  Enable Auto Timeout
                </label>
              </div>

              {settings.warnLimitEnabled && (
                <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-[var(--border)]">
                  <label className="block">
                    <span className="field-label">Warning Limit (Strikes)</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      required
                      value={Number.isNaN(settings.warnLimitThreshold) ? '' : settings.warnLimitThreshold}
                      onChange={(e) => setSettings(prev => ({ ...prev, warnLimitThreshold: e.target.value === '' ? Number.NaN : parseInt(e.target.value, 10) }))}
                      className="input py-1.5 text-xs"
                    />
                  </label>

                  <label className="block">
                    <span className="field-label">Timeout Duration (Minutes)</span>
                    <input
                      type="number"
                      min="1"
                      required
                      value={Number.isNaN(settings.warnTimeoutDurationMin) ? '' : settings.warnTimeoutDurationMin}
                      onChange={(e) => setSettings(prev => ({ ...prev, warnTimeoutDurationMin: e.target.value === '' ? Number.NaN : parseInt(e.target.value, 10) }))}
                      className="input py-1.5 text-xs"
                    />
                  </label>
                </div>
              )}

              <div className="pt-2 border-t border-[var(--border)]">
                <label className="block max-w-xs">
                  <span className="field-label">Warning Expiry Window</span>
                  <select
                    value={settings.warnExpiryDays}
                    onChange={(e) => setSettings(prev => ({ ...prev, warnExpiryDays: parseInt(e.target.value) || 0 }))}
                    className="input py-1.5 text-xs"
                  >
                    <option value={7}>7 Days</option>
                    <option value={30}>30 Days</option>
                    <option value={90}>90 Days</option>
                    <option value={0}>Never Expire</option>
                  </select>
                </label>
              </div>
            </section></fieldset><p role="status">{success || (dirty ? 'Unsaved changes' : 'No unsaved changes')}</p>
          </form>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 text-xs">
              <label htmlFor="warning-search">Member</label><input
                id="warning-search" type="text"
                placeholder="Search user ID or name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input py-1 text-xs flex-1 min-w-[180px]"
              />

              <label htmlFor="warning-status">Status</label><select id="warning-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="input py-1 text-xs w-32"
              >
                <option value="all">All Warnings</option>
                <option value="active">Active</option>
                <option value="expired">Expired</option>
              </select>

              <label htmlFor="warning-sort">Sort</label><select id="warning-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as any)}
                className="input py-1 text-xs w-32"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
              </select>
            </div>

            <div className="card overflow-hidden">
              {warningsLoading ? <p role="status" className="p-8">Loading warnings…</p> : warningsError ? <div className="dashboard-notice" role="alert">{warningsError} <button type="button" className="btn" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : warnings.length === 0 ? (
                <div className="p-8 text-center text-xs text-[var(--muted)]">No warnings found matching the criteria.</div>
              ) : (
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-[var(--panel)] border-b border-[var(--border)] text-[var(--muted)] uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">Offender</th>
                        <th className="py-2.5 px-3">Issued By</th>
                        <th className="py-2.5 px-3">Reason</th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)] text-[var(--text)]">
                      {warnings.map((w) => {
                        const expired = isExpired(w.expiresAt);
                        return (
                          <tr key={w.id} className="hover:bg-[var(--surface)]/50">
                            <td className="py-2 px-3">{renderProfile(w.user, w.userId)}</td>
                            <td className="py-2 px-3">{renderProfile(w.moderator, w.moderatorId)}</td>
                            <td className="py-2 px-3 max-w-xs truncate" title={w.reason}>{w.reason}</td>
                            <td className="py-2 px-3 whitespace-nowrap text-[11px] text-[var(--muted)]">
                              {new Date(w.createdAt).toLocaleDateString(undefined, {
                                dateStyle: 'medium',
                              })}
                            </td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                !expired ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]'
                              }`}>
                                {!expired ? 'Active' : 'Expired'}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-right whitespace-nowrap">
                              <button
                                onClick={() => handleRevoke(w.id)}
                                className="rounded px-2.5 py-1 text-[11px] font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
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
        )}
      </div>
    </main>
  );
}
