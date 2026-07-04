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

  const handleToggleSticker = () => {
    setSettings((prev) => ({
      ...prev,
      stickerEnabled: !prev.stickerEnabled,
    }));
  };

  const handleToggleSlowmode = () => {
    setSettings((prev) => ({
      ...prev,
      slowmodeEnabled: !prev.slowmodeEnabled,
    }));
  };

  const handleChannelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSettings((prev) => ({
      ...prev,
      logChannelId: val === 'none' ? null : val,
    }));
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
      setSettings((prev) => ({
        ...prev,
        [field]: num,
      }));
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
        body: JSON.stringify({
          logChannelId: settings.logChannelId,
          stickerEnabled: settings.stickerEnabled,
          slowmodeEnabled: settings.slowmodeEnabled,
          slowmodeChannels: settings.slowmodeChannels,
          slowmodeIntervalQuiet: settings.slowmodeIntervalQuiet,
          slowmodeIntervalNormal: settings.slowmodeIntervalNormal,
          slowmodeIntervalBusy: settings.slowmodeIntervalBusy,
          anomalyEnabled: settings.anomalyEnabled,
          phishingDetectionEnabled: settings.phishingDetectionEnabled,
          contentAnomalyEnabled: settings.contentAnomalyEnabled,
          userAnomalyEnabled: settings.userAnomalyEnabled,
          guildBaselineEnabled: settings.guildBaselineEnabled,
          anomalyEnforcementMode: settings.anomalyEnforcementMode,
        }),
      });

      setSettings(res.settings);
      setSuccess('Settings updated successfully!');
    } catch (err: any) {
      setError(err?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6">
          <h1 className="text-4xl font-black">Settings</h1>
          <p className="mt-1 text-slate-400">Configure bot options and channel logging.</p>
        </div>

        <DashboardNav guildId={guildId} activeTab="settings" />

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-400">
            {success}
          </div>
        )}

        {loading ? (
          <div className="flex h-64 items-center justify-center text-slate-400">
            Loading settings...
          </div>
        ) : (
          <form onSubmit={handleSave} className="max-w-3xl space-y-6">
            {/* Features Settings */}
            <div className="card p-6">
              <h2 className="text-lg font-bold mb-4">Features Configuration</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-white/5 pb-4">
                  <div>
                    <p className="text-sm font-semibold">Sticker Keywords</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Toggle trigger sticker response when users type keywords in chat.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleSticker}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      settings.stickerEnabled ? 'bg-indigo-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.stickerEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-semibold">Automatic Slowmode</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Dynamically adjusts channel slowmode (10s if busy, 5s if quiet).
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.slowmodeEnabled}
                    aria-label="Toggle automatic slowmode"
                    onClick={handleToggleSlowmode}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      settings.slowmodeEnabled ? 'bg-indigo-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.slowmodeEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Slowmode Detailed Settings */}
            {settings.slowmodeEnabled && (
              <div className="overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 shadow-2xl shadow-black/30">
                <div className="relative border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.92))] p-6">
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.28em] text-emerald-300/80">
                        Traffic Guard
                      </p>
                      <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
                        Auto Slowmode
                      </h2>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                        Pilih channel yang mau dijaga. Bot akan naikin slowmode saat chat rame, lalu turunin lagi waktu suasana sepi.
                      </p>
                    </div>
                    <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-right">
                      <p className="text-2xl font-black text-emerald-200">{settings.slowmodeChannels.length}</p>
                      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300/70">channels</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-6">
                  <div>
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-white">Protected channels</p>
                        <p className="text-xs text-slate-500">Tap channel untuk masuk/keluar dari slowmode guard.</p>
                      </div>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-semibold text-slate-300">
                        {settings.slowmodeChannels.length}/{channels.length}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {channels.map((ch) => {
                        const selected = settings.slowmodeChannels.includes(ch.id);
                        return (
                          <button
                            key={ch.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() => toggleSlowmodeChannel(ch.id)}
                            className={`group flex min-h-14 items-center justify-between rounded-2xl border px-4 py-3 text-left transition duration-200 ${
                              selected
                                ? 'border-emerald-400/40 bg-emerald-400/10 shadow-lg shadow-emerald-950/40'
                                : 'border-white/10 bg-white/[0.03] hover:border-slate-500/50 hover:bg-white/[0.06]'
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-bold text-white">#{ch.name}</span>
                              <span className="mt-0.5 block text-xs text-slate-500">channel guard</span>
                            </span>
                            <span
                              className={`h-3 w-3 rounded-full ring-4 transition ${
                                selected
                                  ? 'bg-emerald-300 ring-emerald-400/20'
                                  : 'bg-slate-700 ring-slate-700/20 group-hover:bg-slate-500'
                              }`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                          Sepi
                        </label>
                        <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-400">idle</span>
                      </div>
                      <div className="flex items-end gap-2">
                        <input
                          type="number"
                          min="0"
                          value={settings.slowmodeIntervalQuiet}
                          onChange={(e) => handleIntervalChange('slowmodeIntervalQuiet', e.target.value)}
                          className="w-full bg-transparent text-4xl font-black tracking-tight text-white outline-none focus:text-emerald-200"
                        />
                        <span className="pb-2 text-sm font-bold text-slate-500">sec</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                          Sedang
                        </label>
                        <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-400">normal</span>
                      </div>
                      <div className="flex items-end gap-2">
                        <input
                          type="number"
                          min="0"
                          value={settings.slowmodeIntervalNormal}
                          onChange={(e) => handleIntervalChange('slowmodeIntervalNormal', e.target.value)}
                          className="w-full bg-transparent text-4xl font-black tracking-tight text-white outline-none focus:text-emerald-200"
                        />
                        <span className="pb-2 text-sm font-bold text-slate-500">sec</span>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 to-cyan-400/5 p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <label className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200/80">
                          Rame
                        </label>
                        <span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-200">busy</span>
                      </div>
                      <div className="flex items-end gap-2">
                        <input
                          type="number"
                          min="0"
                          value={settings.slowmodeIntervalBusy}
                          onChange={(e) => handleIntervalChange('slowmodeIntervalBusy', e.target.value)}
                          className="w-full bg-transparent text-4xl font-black tracking-tight text-white outline-none focus:text-emerald-200"
                        />
                        <span className="pb-2 text-sm font-bold text-emerald-200/70">sec</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Anomaly Detection Settings */}
            <div className="card p-6">
              <h2 className="text-lg font-bold mb-4">Anomaly & Phishing Intelligence</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-2 border-b border-white/5 pb-4">
                  <div>
                    <p className="text-sm font-semibold">Enable Anomaly Detection</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Analyze messages for malicious patterns, phishing, and sudden spam.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, anomalyEnabled: !prev.anomalyEnabled }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      settings.anomalyEnabled ? 'bg-indigo-500' : 'bg-slate-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        settings.anomalyEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {settings.anomalyEnabled && (
                  <div className="space-y-4 pl-4 border-l-2 border-indigo-500/20">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-300">Phishing Link Blocker</p>
                        <p className="text-[10px] text-slate-500">Block known malicious URLs and gifts.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.phishingDetectionEnabled}
                        onChange={(e) => setSettings(prev => ({ ...prev, phishingDetectionEnabled: e.target.checked }))}
                        className="rounded border-white/10 bg-black/20 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-300">Content Abuse Shield</p>
                        <p className="text-[10px] text-slate-500">Scan for excessive mentions or character floods.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.contentAnomalyEnabled}
                        onChange={(e) => setSettings(prev => ({ ...prev, contentAnomalyEnabled: e.target.checked }))}
                        className="rounded border-white/10 bg-black/20 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-300">User Anomaly Shield</p>
                        <p className="text-[10px] text-slate-500">Scan for high message volume and spam from users.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.userAnomalyEnabled}
                        onChange={(e) => setSettings(prev => ({ ...prev, userAnomalyEnabled: e.target.checked }))}
                        className="rounded border-white/10 bg-black/20 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-semibold text-slate-300">Guild Baseline Monitor</p>
                        <p className="text-[10px] text-slate-500">Detect sudden activity bursts across channels.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.guildBaselineEnabled}
                        onChange={(e) => setSettings(prev => ({ ...prev, guildBaselineEnabled: e.target.checked }))}
                        className="rounded border-white/10 bg-black/20 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Enforcement Mode
                      </label>
                      <select
                        value={settings.anomalyEnforcementMode}
                        onChange={(e) => setSettings(prev => ({ ...prev, anomalyEnforcementMode: e.target.value }))}
                        className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs focus:border-indigo-500 focus:outline-none"
                      >
                        <option value="AUDIT_ONLY">Log / Audit Only</option>
                        <option value="DELETE_HIGH_CONFIDENCE">Auto-Delete messages</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Logging Settings */}
            <div className="card p-6">
              <h2 className="text-lg font-bold mb-4">Logging & Audits</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-400 mb-1">
                    Log Channel
                  </label>
                  <select
                    value={settings.logChannelId || 'none'}
                    onChange={handleChannelChange}
                    className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                  >
                    <option value="none">Disabled (No logs)</option>
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        #{ch.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Select a text channel where the bot will post moderation and panel event audit logs.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-indigo-500 px-6 py-3 font-bold hover:bg-indigo-400 disabled:opacity-50 transition shadow-lg shadow-indigo-500/20"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
