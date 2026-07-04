'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

type ChannelOption = { id: string; name: string };

type Settings = {
  logChannelId: string | null;
  stickerEnabled: boolean;
  slowmodeEnabled: boolean;
  slowmodeChannels: string[];
  slowmodeIntervalQuiet: number;
  slowmodeIntervalNormal: number;
  slowmodeIntervalBusy: number;
  anomalyEnabled: boolean;
  phishingDetectionEnabled: boolean;
  contentAnomalyEnabled: boolean;
  userAnomalyEnabled: boolean;
  guildBaselineEnabled: boolean;
  anomalyEnforcementMode: string;
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

function CheckboxRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <span>
        <span className="block text-sm font-semibold text-zinc-950 dark:text-zinc-50">{title}</span>
        <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:ring-zinc-50"
      />
    </label>
  );
}

export default function SettingsPage({ params }: PageProps) {
  const { guildId } = use(params);

  const [settings, setSettings] = useState<Settings>({
    logChannelId: null,
    stickerEnabled: false,
    slowmodeEnabled: false,
    slowmodeChannels: [],
    slowmodeIntervalQuiet: 5,
    slowmodeIntervalNormal: 5,
    slowmodeIntervalBusy: 10,
    anomalyEnabled: false,
    phishingDetectionEnabled: true,
    contentAnomalyEnabled: true,
    userAnomalyEnabled: true,
    guildBaselineEnabled: true,
    anomalyEnforcementMode: 'AUDIT_ONLY',
  });
  const [channels, setChannels] = useState<ChannelOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchData();
  }, [guildId]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [settingsRes, channelsRes] = await Promise.all([
        api<{ ok: boolean; settings: Settings }>(`/guilds/${guildId}/settings`),
        api<{ ok: boolean; channels: ChannelOption[] }>(`/guilds/${guildId}/channels`),
      ]);
      setSettings(settingsRes.settings);
      setChannels(channelsRes.channels || []);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Failed to load settings data');
    } finally {
      setLoading(false);
    }
  };

  const toggleSlowmodeChannel = (channelId: string) => {
    setSettings((prev) => {
      const selected = prev.slowmodeChannels.includes(channelId);
      return {
        ...prev,
        slowmodeChannels: selected
          ? prev.slowmodeChannels.filter((id) => id !== channelId)
          : [...prev.slowmodeChannels, channelId],
      };
    });
  };

  const handleIntervalChange = (
    field: 'slowmodeIntervalQuiet' | 'slowmodeIntervalNormal' | 'slowmodeIntervalBusy',
    val: string
  ) => {
    const num = parseInt(val, 10);
    if (!isNaN(num) && num >= 0) {
      setSettings((prev) => ({ ...prev, [field]: num }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const res = await api<{ ok: boolean; settings: Settings }>(`/guilds/${guildId}/settings`, {
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

  return (
    <main className="px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">Configuration</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">Settings</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Configure moderation, automation, and audit options for this server.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="settings" />

        {error && <div className="notice notice-error mb-6">{error}</div>}
        {success && <div className="notice notice-success mb-6">{success}</div>}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-zinc-500 dark:text-zinc-400">Loading settings...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-6">
            <section className="card p-6">
              <h2 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">Features</h2>
              <div className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
                <div className="flex items-center justify-between gap-4 pb-5">
                  <div>
                    <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Sticker Keywords</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Send configured sticker images when users type exact keywords.</p>
                  </div>
                  <Switch checked={settings.stickerEnabled} label="Toggle sticker keywords" onClick={() => setSettings((prev) => ({ ...prev, stickerEnabled: !prev.stickerEnabled }))} />
                </div>
                <div className="flex items-center justify-between gap-4 py-5">
                  <div>
                    <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Automatic Slowmode</p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Adjust channel slowmode automatically as activity changes.</p>
                  </div>
                  <Switch checked={settings.slowmodeEnabled} label="Toggle automatic slowmode" onClick={() => setSettings((prev) => ({ ...prev, slowmodeEnabled: !prev.slowmodeEnabled }))} />
                </div>
              </div>
            </section>

            {settings.slowmodeEnabled && (
              <section className="card p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">Auto Slowmode</h2>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                      Select channels to protect. The bot increases slowmode during high activity and restores it during quiet periods.
                    </p>
                  </div>
                  <span className="badge">{settings.slowmodeChannels.length}/{channels.length} channels</span>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-semibold text-zinc-950 dark:text-zinc-50">Protected channels</p>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Click a channel to toggle slowmode protection.</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    {channels.map((ch) => {
                      const selected = settings.slowmodeChannels.includes(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => toggleSlowmodeChannel(ch.id)}
                          className={`flex min-h-14 items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                            selected
                              ? 'border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950'
                              : 'border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900'
                          }`}
                        >
                          <span>
                            <span className="block text-sm font-semibold">#{ch.name}</span>
                            <span className={`mt-0.5 block text-xs ${selected ? 'opacity-70' : 'text-zinc-500 dark:text-zinc-400'}`}>slowmode guard</span>
                          </span>
                          <span className={`h-2.5 w-2.5 rounded-full ${selected ? 'bg-current' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[
                    ['Quiet', 'idle', 'slowmodeIntervalQuiet'],
                    ['Moderate', 'normal', 'slowmodeIntervalNormal'],
                    ['Busy', 'high traffic', 'slowmodeIntervalBusy'],
                  ].map(([label, hint, field]) => (
                    <label key={field} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                      <span className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-zinc-500 dark:text-zinc-400">
                        {label}
                        <span className="normal-case tracking-normal">{hint}</span>
                      </span>
                      <div className="mt-3 flex items-end gap-2">
                        <input
                          type="number"
                          min="0"
                          value={settings[field as keyof Pick<Settings, 'slowmodeIntervalQuiet' | 'slowmodeIntervalNormal' | 'slowmodeIntervalBusy'>] as number}
                          onChange={(e) => handleIntervalChange(field as 'slowmodeIntervalQuiet' | 'slowmodeIntervalNormal' | 'slowmodeIntervalBusy', e.target.value)}
                          className="w-full bg-transparent text-3xl font-bold tracking-tight text-zinc-950 outline-none dark:text-zinc-50"
                        />
                        <span className="pb-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">sec</span>
                      </div>
                    </label>
                  ))}
                </div>
              </section>
            )}

            <section className="card p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">Anomaly & Phishing Intelligence</h2>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Analyze messages for malicious links, spam bursts, and unusual server activity.</p>
                </div>
                <Switch checked={settings.anomalyEnabled} label="Toggle anomaly detection" onClick={() => setSettings((prev) => ({ ...prev, anomalyEnabled: !prev.anomalyEnabled }))} />
              </div>

              {settings.anomalyEnabled && (
                <div className="mt-6 grid gap-3">
                  <CheckboxRow title="Phishing Link Blocker" description="Block known malicious URLs and suspicious gift or claim links." checked={settings.phishingDetectionEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, phishingDetectionEnabled: checked }))} />
                  <CheckboxRow title="Content Abuse Shield" description="Detect excessive mentions, floods, and repeated content patterns." checked={settings.contentAnomalyEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, contentAnomalyEnabled: checked }))} />
                  <CheckboxRow title="User Anomaly Shield" description="Detect high message volume and unusual posting behavior from users." checked={settings.userAnomalyEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, userAnomalyEnabled: checked }))} />
                  <CheckboxRow title="Guild Baseline Monitor" description="Detect sudden server-wide spikes in message and link activity." checked={settings.guildBaselineEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, guildBaselineEnabled: checked }))} />

                  <label className="block">
                    <span className="field-label">Enforcement Mode</span>
                    <select
                      value={settings.anomalyEnforcementMode}
                      onChange={(e) => setSettings((prev) => ({ ...prev, anomalyEnforcementMode: e.target.value }))}
                      className="input"
                    >
                      <option value="AUDIT_ONLY">Audit only</option>
                      <option value="DELETE_HIGH_CONFIDENCE">Auto-delete high-confidence messages</option>
                    </select>
                  </label>
                </div>
              )}
            </section>

            <section className="card p-6">
              <h2 className="text-lg font-bold text-zinc-950 dark:text-zinc-50">Logging & Audits</h2>
              <label className="mt-5 block">
                <span className="field-label">Log Channel</span>
                <select
                  value={settings.logChannelId || 'none'}
                  onChange={(event) => setSettings((prev) => ({ ...prev, logChannelId: event.target.value === 'none' ? null : event.target.value }))}
                  className="input"
                >
                  <option value="none">Disabled</option>
                  {channels.map((ch) => (
                    <option key={ch.id} value={ch.id}>#{ch.name}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">Select a text channel where the bot will post moderation and panel audit events.</p>
              </label>
            </section>

            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="btn btn-primary px-6 py-3">
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
