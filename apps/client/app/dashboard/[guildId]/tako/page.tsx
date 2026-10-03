'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';

type ChannelOption = { id: string; name: string };
type RoleOption = { id: string; name: string; color: string; manageable: boolean };

type TakoRewardTier = {
  id?: string;
  label: string;
  thresholdAmount: number;
  roleId: string;
  position: number;
};

type TakoSettings = {
  enabled: boolean;
  creatorSlug: string | null;
  rewardRoleId: string | null;
  minimumAmount: number;
  paymentMethods: string[];
  logChannelId: string | null;
  directNotificationsEnabled: boolean;
  directNotificationChannelId: string | null;
  directNotifyMinimumAmount: number;
  rewardTiers: TakoRewardTier[];
  hasApiKey: boolean;
  hasWebhookToken: boolean;
};

type DonationLog = {
  id: string;
  discordUserId: string;
  transactionId: string | null;
  amount: number;
  paymentMethod: string;
  senderName: string;
  email: string;
  message: string | null;
  status: string;
  failureReason: string | null;
  roleAssignedAt: string | null;
  createdAt: string;
  user: {
    id: string;
    username: string | null;
    displayName: string | null;
    avatarUrl: string | null;
  };
};

type PageProps = {
  params: Promise<{ guildId: string }>;
};

function Switch({ checked, onClick, label }: { checked: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors ${
        checked ? 'border-zinc-950 bg-zinc-950 dark:border-zinc-50 dark:bg-zinc-50' : 'border-zinc-300 bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform dark:bg-zinc-950 ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  );
}

export default function TakoDashboardPage({ params }: PageProps) {
  const { guildId } = use(params);
  const [activeTab, setActiveTab] = useState<'config' | 'logs'>('config');

  const [settings, setSettings] = useState<TakoSettings>({
    enabled: false,
    creatorSlug: '',
    rewardRoleId: null,
    minimumAmount: 10000,
    paymentMethods: ['qris'],
    logChannelId: null,
    directNotificationsEnabled: true,
    directNotificationChannelId: null,
    directNotifyMinimumAmount: 0,
    rewardTiers: [],
    hasApiKey: false,
    hasWebhookToken: false,
  });

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [webhookTokenInput, setWebhookTokenInput] = useState('');

  const [donations, setDonations] = useState<DonationLog[]>([]);
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingRole, setCreatingRole] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [backendUrl, setBackendUrl] = useState('');

  useEffect(() => {
    // Tentukan backend public URL untuk dicopy user ke Tako
    const url = typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/api`
      : '/api';
    setBackendUrl(url);
    fetchData();
  }, [guildId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const [settingsRes, channelsRes, rolesRes, donationsRes] = await Promise.all([
        api<{ ok: boolean; settings: TakoSettings }>(`/guilds/${guildId}/tako/settings`),
        api<{ ok: boolean; channels: ChannelOption[] }>(`/guilds/${guildId}/channels`),
        api<{ ok: boolean; roles: RoleOption[] }>(`/guilds/${guildId}/roles`),
        api<{ ok: boolean; donations: DonationLog[] }>(`/guilds/${guildId}/tako/donations`),
      ]);

      setSettings(settingsRes.settings);
      setChannels(channelsRes.channels || []);
      setRoles(rolesRes.roles || []);
      setDonations(donationsRes.donations || []);

      if (settingsRes.settings.hasApiKey) setApiKeyInput('__masked__');
      if (settingsRes.settings.hasWebhookToken) setWebhookTokenInput('__masked__');
    } catch (err: any) {
      setError(err?.message || 'Failed to load Tako integration settings');
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

      const payload: any = {
        enabled: settings.enabled,
        creatorSlug: settings.creatorSlug || '',
        rewardRoleId: settings.rewardRoleId || null,
        minimumAmount: settings.minimumAmount,
        paymentMethods: settings.paymentMethods,
        logChannelId: settings.logChannelId || null,
        directNotificationsEnabled: settings.directNotificationsEnabled,
        directNotificationChannelId: settings.directNotificationChannelId || null,
        directNotifyMinimumAmount: settings.directNotifyMinimumAmount,
        rewardTiers: settings.rewardTiers.map((tier, index) => ({
          label: tier.label,
          thresholdAmount: tier.thresholdAmount,
          roleId: tier.roleId,
          position: index,
        })),
      };

      if (apiKeyInput && apiKeyInput !== '__masked__') payload.apiKey = apiKeyInput;
      if (webhookTokenInput && webhookTokenInput !== '__masked__') payload.webhookToken = webhookTokenInput;

      const res = await api<{ ok: boolean; settings: TakoSettings }>(`/guilds/${guildId}/tako/settings`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setSettings(res.settings);
      setSuccess('Settings updated successfully.');
      if (res.settings.hasApiKey) setApiKeyInput('__masked__');
      if (res.settings.hasWebhookToken) setWebhookTokenInput('__masked__');
    } catch (err: any) {
      setError(err?.message || 'Failed to save Tako settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRetryRole = async (donationId: string) => {
    try {
      setError('');
      setSuccess('');
      const res = await api<{ ok: boolean; status: string; reason?: string }>(
        `/guilds/${guildId}/tako/donations/${donationId}/retry-role`,
        { method: 'POST' }
      );

      if (res.ok && res.status === 'role_assigned') {
        setSuccess('Role assigned successfully.');
        // Refresh logs
        const donationsRes = await api<{ ok: boolean; donations: DonationLog[] }>(`/guilds/${guildId}/tako/donations`);
        setDonations(donationsRes.donations || []);
      } else {
        setError(res.reason || 'Failed to assign role. Check bot permissions.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to retry role assignment');
    }
  };

  const togglePaymentMethod = (method: string) => {
    setSettings((prev) => {
      const selected = prev.paymentMethods.includes(method);
      return {
        ...prev,
        paymentMethods: selected
          ? prev.paymentMethods.filter((m) => m !== method)
          : [...prev.paymentMethods, method],
      };
    });
  };

  const updateRewardTier = (index: number, patch: Partial<TakoRewardTier>) => {
    setSettings((prev) => ({
      ...prev,
      rewardTiers: prev.rewardTiers.map((tier, idx) => idx === index ? { ...tier, ...patch } : tier),
    }));
  };

  const addRewardTier = () => {
    setSettings((prev) => ({
      ...prev,
      rewardTiers: [
        ...prev.rewardTiers,
        { label: '', thresholdAmount: prev.minimumAmount, roleId: '', position: prev.rewardTiers.length },
      ],
    }));
  };

  const removeRewardTier = (index: number) => {
    setSettings((prev) => ({
      ...prev,
      rewardTiers: prev.rewardTiers.filter((_, idx) => idx !== index).map((tier, idx) => ({ ...tier, position: idx })),
    }));
  };

  const createCustomRole = async (name: string, apply: (roleId: string) => void, key: string) => {
    try {
      setCreatingRole(key);
      setError('');
      setSuccess('');
      const res = await api<{ ok: boolean; role: RoleOption }>(`/guilds/${guildId}/roles`, {
        method: 'POST',
        body: JSON.stringify({ name, color: '#F59E0B' }),
      });
      setRoles((prev) => [res.role, ...prev.filter((role) => role.id !== res.role.id)]);
      apply(res.role.id);
      setSuccess(`Created role ${res.role.name}. Save settings to use it.`);
    } catch (err: any) {
      setError(err?.message || 'Failed to create custom role. Check bot Manage Roles permission and role hierarchy.');
    } finally {
      setCreatingRole(null);
    }
  };

  const webhookUrl = `${backendUrl}/guilds/${guildId}/tako/webhook`;

  return (
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Action & Tab Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">Tako Donation Gateway</h2>
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
                Donation Logs ({donations.length})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {error && <span className="text-xs font-semibold text-[var(--danger)]">{error}</span>}
            {success && <span className="text-xs font-semibold text-[var(--ok)]">{success}</span>}
            <a href={`/dashboard/${guildId}/embed-templates`} className="btn text-xs font-semibold py-1.5 px-3">
              Embeds →
            </a>
            {activeTab === 'config' && (
              <button
                type="button"
                onClick={(e) => void handleSaveSettings(e as any)}
                disabled={saving}
                className="btn btn-primary text-xs font-bold py-1.5 px-4"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="card p-8 text-center text-xs text-[var(--muted)]">Loading Tako integration...</div>
        ) : activeTab === 'config' ? (
          <form onSubmit={handleSaveSettings} className="space-y-4 max-w-4xl">
            {/* Core Integration Settings */}
            <section className="card p-4 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Tako Service Connection</h3>
                  <p className="text-[11px] text-[var(--muted)]">Enable or disable automatic role rewards from Tako donations.</p>
                </div>
                <Switch
                  checked={settings.enabled}
                  label="Toggle Tako integration"
                  onClick={() => setSettings((prev) => ({ ...prev, enabled: !prev.enabled }))}
                />
              </div>

              {settings.enabled && (
                <div className="space-y-3 pt-2 border-t border-[var(--border)]">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="field-label">Creator Slug</span>
                      <input
                        type="text"
                        className="input py-1.5 text-xs"
                        value={settings.creatorSlug || ''}
                        onChange={(e) => setSettings((prev) => ({ ...prev, creatorSlug: e.target.value }))}
                        placeholder="e.g. wignn"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="field-label">API Key</span>
                      <input
                        type="password"
                        className="input py-1.5 text-xs"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="Paste Tako API key"
                        required
                      />
                    </label>

                    <label className="block">
                      <span className="field-label">Webhook Token</span>
                      <input
                        type="password"
                        className="input py-1.5 text-xs"
                        value={webhookTokenInput}
                        onChange={(e) => setWebhookTokenInput(e.target.value)}
                        placeholder="Paste Webhook Token"
                        required
                      />
                    </label>
                  </div>

                  <label className="block">
                    <span className="field-label">Webhook URL (Paste into Tako Dashboard)</span>
                    <div className="flex gap-2">
                      <input type="text" className="input bg-[var(--panel-strong)] flex-1 font-mono text-xs select-all py-1.5" value={webhookUrl} readOnly />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(webhookUrl);
                        }}
                        className="btn text-xs py-1.5 px-3"
                      >
                        Copy URL
                      </button>
                    </div>
                  </label>
                </div>
              )}
            </section>

            {settings.enabled && (
              <>
                {/* Role Rewards & Tiers */}
                <section className="card p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Role Rewards &amp; Tiers</h3>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="field-label">Default Supporter Role</span>
                      <div className="flex gap-2">
                        <select
                          value={settings.rewardRoleId || ''}
                          onChange={(e) => setSettings((prev) => ({ ...prev, rewardRoleId: e.target.value || null }))}
                          className="input py-1.5 text-xs flex-1"
                          required
                        >
                          <option value="">Select a role...</option>
                          {roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn text-xs py-1.5 px-2.5 shrink-0"
                          disabled={creatingRole === 'base'}
                          onClick={() => createCustomRole('Tako Supporter', (roleId) => setSettings((prev) => ({ ...prev, rewardRoleId: roleId })), 'base')}
                        >
                          {creatingRole === 'base' ? '...' : '＋ Role'}
                        </button>
                      </div>
                    </label>

                    <label className="block">
                      <span className="field-label">Minimum Donation Amount (Rp)</span>
                      <input
                        type="number"
                        min="1000"
                        className="input py-1.5 text-xs"
                        value={settings.minimumAmount}
                        onChange={(e) => setSettings((prev) => ({ ...prev, minimumAmount: parseInt(e.target.value) || 10000 }))}
                        required
                      />
                    </label>
                  </div>

                  <div>
                    <span className="field-label">Allowed Payment Methods</span>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {['qris', 'gopay', 'dana', 'paypal'].map((method) => {
                        const selected = settings.paymentMethods.includes(method);
                        return (
                          <label key={method} className="flex items-center gap-2 rounded-lg border border-[var(--border)] p-2 bg-[var(--surface)] cursor-pointer text-xs">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={() => togglePaymentMethod(method)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="font-semibold uppercase">{method}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Cumulative Reward Tiers */}
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-semibold text-[var(--text)]">Cumulative Reward Tiers</span>
                        <p className="text-[10px] text-[var(--muted)]">Stacked roles when donor reaches total amount.</p>
                      </div>
                      <button type="button" onClick={addRewardTier} className="btn py-1 px-2.5 text-xs font-semibold" disabled={settings.rewardTiers.length >= 10}>
                        ＋ Add Tier
                      </button>
                    </div>

                    {settings.rewardTiers.length === 0 ? (
                      <p className="text-[11px] text-[var(--muted)] py-2">No cumulative tiers configured yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {settings.rewardTiers.map((tier, index) => (
                          <div key={tier.id || index} className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-2 text-xs sm:grid-cols-[1fr_1fr_1.5fr_auto] items-end">
                            <label className="block">
                              <span className="field-label">Threshold (Rp)</span>
                              <input
                                type="number"
                                min="1000"
                                className="input py-1 text-xs"
                                value={tier.thresholdAmount}
                                onChange={(e) => updateRewardTier(index, { thresholdAmount: parseInt(e.target.value) || 1000 })}
                              />
                            </label>
                            <label className="block">
                              <span className="field-label">Tier Label</span>
                              <input
                                type="text"
                                className="input py-1 text-xs"
                                value={tier.label}
                                onChange={(e) => updateRewardTier(index, { label: e.target.value })}
                                placeholder="VIP Donatur"
                              />
                            </label>
                            <label className="block">
                              <span className="field-label">Role</span>
                              <select
                                value={tier.roleId}
                                onChange={(e) => updateRewardTier(index, { roleId: e.target.value })}
                                className="input py-1 text-xs"
                              >
                                <option value="">Select a role...</option>
                                {roles.map((role) => (
                                  <option key={role.id} value={role.id}>
                                    {role.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              onClick={() => removeRewardTier(index)}
                              className="rounded px-2 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 transition-colors h-7"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                {/* Notifications Configuration */}
                <section className="card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Direct Donation Notifications</h3>
                      <p className="text-[11px] text-[var(--muted)]">Send notifications when someone donates via Tako web profile directly.</p>
                    </div>
                    <Switch
                      checked={settings.directNotificationsEnabled}
                      label="Toggle direct donation notifications"
                      onClick={() => setSettings((prev) => ({ ...prev, directNotificationsEnabled: !prev.directNotificationsEnabled }))}
                    />
                  </div>

                  {settings.directNotificationsEnabled && (
                    <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-[var(--border)]">
                      <label className="block">
                        <span className="field-label">Notification Channel</span>
                        <select
                          value={settings.directNotificationChannelId || 'none'}
                          onChange={(e) => setSettings((prev) => ({ ...prev, directNotificationChannelId: e.target.value === 'none' ? null : e.target.value }))}
                          className="input py-1.5 text-xs"
                        >
                          <option value="none">Disabled</option>
                          {channels.map((ch) => (
                            <option key={ch.id} value={ch.id}>
                              #{ch.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block">
                        <span className="field-label">Minimum Notification Amount (Rp)</span>
                        <input
                          type="number"
                          min="0"
                          className="input py-1.5 text-xs"
                          value={settings.directNotifyMinimumAmount}
                          onChange={(e) => setSettings((prev) => ({ ...prev, directNotifyMinimumAmount: parseInt(e.target.value) || 0 }))}
                        />
                      </label>
                    </div>
                  )}
                </section>
              </>
            )}
          </form>
        ) : (
          <section className="card overflow-hidden">
            {donations.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--muted)]">No donation events recorded yet.</div>
            ) : (
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-[var(--panel)] border-b border-[var(--border)] text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    <tr>
                      <th className="py-2.5 px-3">Donor</th>
                      <th className="py-2.5 px-3">Amount</th>
                      <th className="py-2.5 px-3">Transaction</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)] text-[var(--text)]">
                    {donations.map((log) => (
                      <tr key={log.id} className="hover:bg-[var(--surface)]/50 transition-colors">
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            {log.user.avatarUrl ? (
                              <img src={log.user.avatarUrl} alt="" className="h-6 w-6 rounded-full border border-[var(--border)] shrink-0" />
                            ) : (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--panel-strong)] text-[10px] font-bold text-[var(--muted)] shrink-0">
                                {(log.user.displayName || log.user.username || log.discordUserId).charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="font-semibold block truncate text-xs">{log.user.displayName || log.senderName}</span>
                              <span className="text-[10px] text-[var(--muted)] block truncate">{log.user.username ? `@${log.user.username}` : log.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="font-bold text-xs block text-[var(--text)]">Rp{log.amount.toLocaleString('id-ID')}</span>
                          <span className="text-[10px] text-[var(--muted)] uppercase">{log.paymentMethod}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-mono text-[10px] text-[var(--text)] block truncate max-w-[120px]">{log.transactionId || '―'}</span>
                          {log.message && <span className="text-[10px] text-[var(--muted)] block truncate max-w-[160px]">{log.message}</span>}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              log.status === 'ROLE_ASSIGNED'
                                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                                : log.status === 'FAILED'
                                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                  : 'bg-[var(--surface)] text-[var(--muted)] border border-[var(--border)]'
                            }`}
                          >
                            {log.status === 'ROLE_ASSIGNED' ? 'Assigned' : log.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[11px] text-[var(--muted)] whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          {(log.status === 'FAILED' || log.status === 'PAID' || log.status === 'PENDING') && (
                            <button
                              onClick={() => handleRetryRole(log.id)}
                              className="btn py-1 px-2 text-xs font-semibold"
                            >
                              Assign
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
