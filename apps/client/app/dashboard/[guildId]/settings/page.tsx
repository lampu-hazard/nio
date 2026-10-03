'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';

type ChannelOption = { id: string; name: string };

type Settings = {
  logChannelId: string | null;
  messageDeleteLogChannelId: string | null;
  stickerEnabled: boolean;
  hallOfFameEnabled: boolean;
  hallOfFameChannelId: string | null;
  hallOfFameThreshold: number;
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
    <label className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 bg-[var(--surface)] cursor-pointer">
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-[var(--text)]">{title}</span>
        <span className="block truncate text-[11px] text-[var(--muted)]">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
      />
    </label>
  );
}

export default function SettingsPage({ params }: PageProps) {
  const { guildId } = use(params);

  const [settings, setSettings] = useState<Settings>({
    logChannelId: null,
    messageDeleteLogChannelId: null,
    stickerEnabled: false,
    hallOfFameEnabled: false,
    hallOfFameChannelId: null,
    hallOfFameThreshold: 3,
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
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px]">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">Loading settings...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            {/* Control Panel Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
              <div>
                <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">Server Configuration</h2>
                <p className="text-xs text-[var(--muted)]">Automations, channels, slowmode, and security options.</p>
              </div>
              <div className="flex items-center gap-3">
                {error && <span className="text-xs font-semibold text-[var(--danger)]">{error}</span>}
                {success && <span className="text-xs font-semibold text-[var(--ok)]">{success}</span>}
                <button type="submit" disabled={saving} className="btn btn-primary text-xs font-bold py-1.5 px-4">
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>

            {/* 2-Column Responsive Control Grid */}
            <div className="grid gap-4 lg:grid-cols-2">
              {/* Left Column: Features & Logging */}
              <div className="space-y-4">
                {/* Core Features */}
                <section className="card p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Core Features</h3>
                  <div className="divide-y divide-[var(--border)]">
                    <div className="flex items-center justify-between gap-4 py-2">
                      <div>
                        <p className="text-xs font-semibold text-[var(--text)]">Sticker Keywords</p>
                        <p className="text-[11px] text-[var(--muted)]">Send stickers when users type matching trigger words.</p>
                      </div>
                      <Switch checked={settings.stickerEnabled} label="Toggle sticker keywords" onClick={() => setSettings((prev) => ({ ...prev, stickerEnabled: !prev.stickerEnabled }))} />
                    </div>

                    <div className="flex items-center justify-between gap-4 py-2">
                      <div>
                        <p className="text-xs font-semibold text-[var(--text)]">⭐ Hall of Fame (Starboard)</p>
                        <p className="text-[11px] text-[var(--muted)]">Mirror starred messages to a showcase channel.</p>
                      </div>
                      <Switch
                        checked={settings.hallOfFameEnabled}
                        label="Toggle Hall of Fame"
                        onClick={() => setSettings((prev) => ({ ...prev, hallOfFameEnabled: !prev.hallOfFameEnabled }))}
                      />
                    </div>
                  </div>

                  {settings.hallOfFameEnabled && (
                    <div className="grid gap-3 pt-2 sm:grid-cols-2">
                      <label className="block">
                        <span className="field-label">Showcase Channel</span>
                        <select
                          value={settings.hallOfFameChannelId || 'none'}
                          onChange={(event) =>
                            setSettings((prev) => ({
                              ...prev,
                              hallOfFameChannelId: event.target.value === 'none' ? null : event.target.value,
                            }))
                          }
                          className="input py-1.5 text-xs"
                        >
                          <option value="none">Select channel...</option>
                          {channels.map((ch) => (
                            <option key={ch.id} value={ch.id}>#{ch.name}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="field-label">Star Threshold</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={settings.hallOfFameThreshold}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            if (!isNaN(val) && val >= 1 && val <= 100) setSettings((prev) => ({ ...prev, hallOfFameThreshold: val }));
                          }}
                          className="input py-1.5 text-xs"
                        />
                      </label>
                    </div>
                  )}
                </section>

                {/* Channel Logging */}
                <section className="card p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Audit & Deletion Logs</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="field-label">Audit Log Channel</span>
                      <select
                        value={settings.logChannelId || 'none'}
                        onChange={(event) => setSettings((prev) => ({ ...prev, logChannelId: event.target.value === 'none' ? null : event.target.value }))}
                        className="input py-1.5 text-xs"
                      >
                        <option value="none">Disabled</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>#{ch.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="field-label">Message Delete Channel</span>
                      <select
                        value={settings.messageDeleteLogChannelId || 'none'}
                        onChange={(event) => setSettings((prev) => ({ ...prev, messageDeleteLogChannelId: event.target.value === 'none' ? null : event.target.value }))}
                        className="input py-1.5 text-xs"
                      >
                        <option value="none">Disabled</option>
                        {channels.map((ch) => (
                          <option key={ch.id} value={ch.id}>#{ch.name}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>
              </div>

              {/* Right Column: Slowmode & Security */}
              <div className="space-y-4">
                {/* Auto Slowmode */}
                <section className="card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Automatic Slowmode Engine</h3>
                      <p className="text-[11px] text-[var(--muted)]">Adjusts slowmode dynamically as chat velocity shifts.</p>
                    </div>
                    <Switch checked={settings.slowmodeEnabled} label="Toggle automatic slowmode" onClick={() => setSettings((prev) => ({ ...prev, slowmodeEnabled: !prev.slowmodeEnabled }))} />
                  </div>

                  {settings.slowmodeEnabled && (
                    <div className="space-y-3 pt-2">
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="font-semibold text-[var(--text)]">Protected Channels</span>
                          <span className="text-[11px] text-[var(--muted)]">{settings.slowmodeChannels.length} selected</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 border border-[var(--border)] rounded-lg bg-[var(--surface)]">
                          {channels.map((ch) => {
                            const selected = settings.slowmodeChannels.includes(ch.id);
                            return (
                              <button
                                key={ch.id}
                                type="button"
                                onClick={() => toggleSlowmodeChannel(ch.id)}
                                className={`rounded-md px-2 py-1 text-xs font-medium transition-all ${
                                  selected
                                    ? 'bg-indigo-600 text-white font-semibold'
                                    : 'border border-[var(--border)] bg-[var(--panel-strong)] text-[var(--muted)] hover:text-[var(--text)]'
                                }`}
                              >
                                #{ch.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {[
                          ['Quiet', 'slowmodeIntervalQuiet'],
                          ['Normal', 'slowmodeIntervalNormal'],
                          ['Busy', 'slowmodeIntervalBusy'],
                        ].map(([label, field]) => (
                          <label key={field} className="rounded-lg border border-[var(--border)] p-2.5 bg-[var(--surface)]">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{label}</span>
                            <div className="mt-1 flex items-baseline gap-1">
                              <input
                                type="number"
                                min="0"
                                value={settings[field as keyof Pick<Settings, 'slowmodeIntervalQuiet' | 'slowmodeIntervalNormal' | 'slowmodeIntervalBusy'>] as number}
                                onChange={(e) => handleIntervalChange(field as 'slowmodeIntervalQuiet' | 'slowmodeIntervalNormal' | 'slowmodeIntervalBusy', e.target.value)}
                                className="w-full bg-transparent text-lg font-bold text-[var(--text)] outline-none"
                              />
                              <span className="text-[10px] text-[var(--muted)]">s</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Security & Anomaly */}
                <section className="card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Anomaly &amp; Phishing Shield</h3>
                      <p className="text-[11px] text-[var(--muted)]">Detects token raids, malicious links, and message floods.</p>
                    </div>
                    <Switch checked={settings.anomalyEnabled} label="Toggle anomaly detection" onClick={() => setSettings((prev) => ({ ...prev, anomalyEnabled: !prev.anomalyEnabled }))} />
                  </div>

                  {settings.anomalyEnabled && (
                    <div className="space-y-2 pt-1">
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        <CheckboxRow title="Phishing Link Blocker" description="Block malicious gifts & scam URLs" checked={settings.phishingDetectionEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, phishingDetectionEnabled: checked }))} />
                        <CheckboxRow title="Content Abuse Shield" description="Mention flood & repeated text" checked={settings.contentAnomalyEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, contentAnomalyEnabled: checked }))} />
                        <CheckboxRow title="User Anomaly Shield" description="Unusual member message spikes" checked={settings.userAnomalyEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, userAnomalyEnabled: checked }))} />
                        <CheckboxRow title="Guild Baseline Monitor" description="Sudden server-wide link activity" checked={settings.guildBaselineEnabled} onChange={(checked) => setSettings((prev) => ({ ...prev, guildBaselineEnabled: checked }))} />
                      </div>

                      <label className="block pt-1">
                        <span className="field-label">Enforcement Mode</span>
                        <select
                          value={settings.anomalyEnforcementMode}
                          onChange={(e) => setSettings((prev) => ({ ...prev, anomalyEnforcementMode: e.target.value }))}
                          className="input py-1.5 text-xs"
                        >
                          <option value="AUDIT_ONLY">Audit only (log detections)</option>
                          <option value="DELETE_HIGH_CONFIDENCE">Auto-delete verified violations</option>
                        </select>
                      </label>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
