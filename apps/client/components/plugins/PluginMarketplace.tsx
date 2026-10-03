'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { GuildPluginStatus, MarketplacePlugin } from '@/lib/types';

const statusLabels: Record<GuildPluginStatus, string> = {
  INSTALLED: 'Enabled',
  DISABLED: 'Disabled',
  SUSPENDED: 'Suspended',
  UNAVAILABLE: 'Unavailable',
};

function statusClass(status: GuildPluginStatus | null) {
  if (status === 'INSTALLED') return 'badge-live';
  if (status === 'UNAVAILABLE' || status === 'SUSPENDED') return 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300';
  return '';
}

export function PluginMarketplace({ guildId }: { guildId: string }) {
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState<'all' | 'installed' | 'free' | 'premium'>('all');
  const [credentialInput, setCredentialInput] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api<MarketplacePlugin[] | { plugins: MarketplacePlugin[] }>(`/guilds/${guildId}/plugins`);
      setPlugins(Array.isArray(data) ? data : data.plugins);
    } catch (err: any) {
      setError(err?.message || 'Failed to load plugins.');
    } finally {
      setLoading(false);
    }
  }, [guildId]);

  useEffect(() => { void load(); }, [load]);

  const visiblePlugins = useMemo(() => plugins.filter((plugin) => {
    if (filter === 'installed') return plugin.installationStatus !== null;
    if (filter === 'free') return plugin.type === 'FREE';
    if (filter === 'premium') return plugin.type === 'PREMIUM';
    return true;
  }), [filter, plugins]);

  const mutate = async (plugin: MarketplacePlugin, action: 'install' | 'enable' | 'disable' | 'uninstall') => {
    if (action === 'uninstall' && !window.confirm(`Uninstall ${plugin.name}? Its commands and saved connection will be removed from this server.`)) return;
    try {
      setPending(`${plugin.id}:${action}`);
      setError('');
      setSuccess('');
      const method = action === 'install' ? 'POST' : action === 'uninstall' ? 'DELETE' : 'PATCH';
      const suffix = action === 'install' ? 'install' : action;
      await api(`/guilds/${guildId}/plugins/${plugin.id}${action === 'uninstall' ? '' : `/${suffix}`}`, {
        method,
        ...(action === 'install' ? { body: '{}' } : {}),
      });
      await load();
      const pastTense = action === 'install' ? 'installed' : action === 'uninstall' ? 'uninstalled' : action === 'disable' ? 'disabled' : 'enabled';
      setSuccess(`${plugin.name} ${pastTense}.`);
    } catch (err: any) {
      setError(err?.message || `Failed to ${action} plugin.`);
    } finally {
      setPending(null);
    }
  };

  const configureKinetic = async (plugin: MarketplacePlugin) => {
    const token = credentialInput.trim();
    if (!token) {
      setError('Enter your Kinetic API key first.');
      return;
    }
    if (token.length > 512) {
      setError('The Kinetic API key is too long.');
      return;
    }
    try {
      setPending(`${plugin.id}:credential`);
      setError('');
      setSuccess('');
      await api(`/guilds/${guildId}/plugins/${plugin.id}/credentials`, {
        method: 'PUT',
        body: JSON.stringify({ token }),
      });
      setCredentialInput('');
      await load();
      setSuccess('Kinetic Hosting connected. Your API key is stored securely and is never shown again.');
    } catch (err: any) {
      setError(err?.message || 'Kinetic could not verify that API key.');
    } finally {
      setPending(null);
    }
  };

  const removeKineticCredential = async (plugin: MarketplacePlugin) => {
    if (!window.confirm('Remove the saved Kinetic API key from this server?')) return;
    try {
      setPending(`${plugin.id}:remove-credential`);
      setError('');
      setSuccess('');
      await api(`/guilds/${guildId}/plugins/${plugin.id}/credentials`, { method: 'DELETE' });
      await load();
      setSuccess('Kinetic API key removed.');
    } catch (err: any) {
      setError(err?.message || 'Failed to remove the Kinetic API key.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="space-y-3">
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {success && <div className="notice notice-success" role="status">{success}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1.5" role="tablist" aria-label="Plugin filters">
        <div className="flex gap-1 text-xs">
          {[
            ['all', 'All plugins'],
            ['installed', 'Installed'],
            ['free', 'Free'],
            ['premium', 'Premium'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value as typeof filter)}
              className={`rounded-md px-3 py-1 font-semibold transition-all ${
                filter === value
                  ? 'bg-[var(--panel-strong)] text-[var(--text)] shadow-sm'
                  : 'text-[var(--muted)] hover:text-[var(--text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-[var(--muted)] pr-2">
          {visiblePlugins.length} {visiblePlugins.length === 1 ? 'plugin' : 'plugins'}
        </span>
      </div>

      {loading ? (
        <div className="card flex min-h-36 items-center justify-center p-8 text-xs text-[var(--muted)]">Loading plugin marketplace...</div>
      ) : visiblePlugins.length === 0 ? (
        <div className="card p-8 text-center text-xs text-[var(--muted)]">No plugins match this filter.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiblePlugins.map((plugin) => {
            const status = plugin.installationStatus;
            const unavailable = !plugin.available || status === 'UNAVAILABLE';
            const premiumLocked = plugin.type === 'PREMIUM' && plugin.entitlementStatus !== 'ACTIVE';
            const busy = pending?.startsWith(`${plugin.id}:`);
            const kinetic = plugin.id === 'kinetic-hosting';
            return (
              <article key={plugin.id} className="card flex flex-col p-4 justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-bold text-[var(--text)]">{plugin.name}</h3>
                      <p className="text-[10px] text-[var(--muted)]">v{plugin.version}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                        {plugin.type}
                      </span>
                      {status && (
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          status === 'INSTALLED'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]'
                        }`}>
                          {statusLabels[status]}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{plugin.description}</p>
                  {kinetic && (
                    <p className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-[11px] leading-4 text-[var(--muted)]">
                      Connect your Kinetic Panel API key. Stored encrypted on the server.
                    </p>
                  )}
                  {kinetic && status === 'INSTALLED' && (
                    <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-[var(--text)]">Kinetic connection</span>
                        <span className={`h-2 w-2 rounded-full ${plugin.credentialConfigured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      </div>
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={credentialInput}
                        onChange={(event) => setCredentialInput(event.target.value)}
                        placeholder={plugin.credentialConfigured ? 'Replace API key...' : 'Paste Kinetic API key...'}
                        className="input py-1 text-xs"
                        disabled={busy}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="btn btn-primary py-1 px-2.5 text-xs font-semibold"
                          disabled={busy || !credentialInput.trim()}
                          onClick={() => void configureKinetic(plugin)}
                        >
                          {busy ? 'Verifying...' : plugin.credentialConfigured ? 'Update key' : 'Connect key'}
                        </button>
                        {plugin.credentialConfigured && (
                          <button
                            type="button"
                            className="btn py-1 px-2 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
                            disabled={busy}
                            onClick={() => void removeKineticCredential(plugin)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3 text-xs">
                  {!status && !unavailable && !premiumLocked && (
                    <button
                      type="button"
                      className="btn btn-primary py-1 px-3 text-xs font-bold"
                      disabled={busy}
                      onClick={() => void mutate(plugin, 'install')}
                    >
                      {busy ? 'Installing...' : 'Install'}
                    </button>
                  )}
                  {premiumLocked && <span className="text-[11px] font-semibold text-[var(--muted)]">Entitlement required</span>}
                  {unavailable && <span className="text-[11px] font-semibold text-[var(--muted)]">Unavailable</span>}
                  {status === 'INSTALLED' && (
                    <button
                      type="button"
                      className="btn py-1 px-2.5 text-xs font-semibold"
                      disabled={busy}
                      onClick={() => void mutate(plugin, 'disable')}
                    >
                      {busy ? '...' : 'Disable'}
                    </button>
                  )}
                  {status === 'DISABLED' && (
                    <button
                      type="button"
                      className="btn btn-primary py-1 px-2.5 text-xs font-semibold"
                      disabled={busy}
                      onClick={() => void mutate(plugin, 'enable')}
                    >
                      {busy ? '...' : 'Enable'}
                    </button>
                  )}
                  {status && status !== 'UNAVAILABLE' && (
                    <button
                      type="button"
                      className="rounded px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors"
                      disabled={busy}
                      onClick={() => void mutate(plugin, 'uninstall')}
                    >
                      Uninstall
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
