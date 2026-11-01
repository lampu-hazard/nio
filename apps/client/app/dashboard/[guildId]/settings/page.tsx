'use client';

import React, { useEffect, useRef, useState, use } from 'react';
import { api } from '@/lib/api';

type ChannelOption = { id: string; name: string };

type RoleOption = { id: string; name: string; manageable: boolean };

type Settings = {
  voiceXpEnabled: boolean;
  voiceXpPerMinute: number;
  voiceNotificationChannelId: string | null;
  voiceXpRewards: { level: number; roleId: string }[];
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

  const activeGuild = useRef(guildId);
  activeGuild.current = guildId;
  const [loadedGuild, setLoadedGuild] = useState('');
  const [settings, setSettings] = useState<Settings>({
    voiceXpEnabled: false,
    voiceXpPerMinute: 10,
    voiceNotificationChannelId: null,
    voiceXpRewards: [],
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
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
    try {
      setLoading(true);
      const [settingsRes, channelsRes, rolesRes] = await Promise.all([
        api<{ ok: boolean; settings: Settings }>(`/guilds/${guildId}/settings`),
        api<{ ok: boolean; channels: ChannelOption[] }>(`/guilds/${guildId}/channels`),
        api<{ ok: boolean; roles: RoleOption[] }>(`/guilds/${guildId}/roles`),
      ]);
      if (cancelled) return;
      setSettings(settingsRes.settings);
      setChannels(channelsRes.channels || []);
      setRoles(rolesRes.roles || []);
      setLoadedGuild(guildId);
      setSuccess('');
      setError('');
    } catch (err: any) {
      if (!cancelled) setError(err?.message || 'Failed to load settings data');
    } finally {
      if (!cancelled) setLoading(false);
    }
    };
    void fetchData();
    return () => { cancelled = true; };
  }, [guildId]);

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
    if (loading || saving || loadedGuild !== guildId) return;
    const levels = settings.voiceXpRewards.map((reward) => reward.level);
    const roleIds = settings.voiceXpRewards.map((reward) => reward.roleId);
    if (!Number.isInteger(settings.voiceXpPerMinute) || settings.voiceXpPerMinute < 1 || settings.voiceXpPerMinute > 1000
      || levels.some((level) => !Number.isInteger(level) || level < 1 || level > 10000)
      || roleIds.some((id) => !id) || new Set(levels).size !== levels.length || new Set(roleIds).size !== roleIds.length) {
      setError('Use 1–1,000 XP per minute and unique levels (1–10,000) with a role for each reward.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const res = await api<{ ok: boolean; settings: Settings }>(`/guilds/${guildId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });

      if (activeGuild.current !== guildId) return;
      setSettings(res.settings);
      setSuccess('Settings updated successfully.');
    } catch (err: any) {
      if (activeGuild.current === guildId) setError(err?.message || 'Failed to save settings');
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
                <button type="submit" disabled={saving || loading || loadedGuild !== guildId} className="btn btn-primary text-xs font-bold py-1.5 px-4">
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

                <section className="card p-4 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="text-sm font-semibold text-[var(--text)]">Voice XP</h3>
                    <Switch checked={settings.voiceXpEnabled} label="Enable voice XP" onClick={() => setSettings((prev) => ({ ...prev, voiceXpEnabled: !prev.voiceXpEnabled }))} />
                  </div>
                  <p className="text-xs text-[var(--muted)]">Earn XP with at least two unmuted, undeafened members in voice. Bots, AFK and stage channels do not count.</p>
                  <label className="block">
                    <span className="field-label">XP per minute</span>
                    <input type="number" min={1} max={1000} step={1} required value={Number.isNaN(settings.voiceXpPerMinute) ? '' : settings.voiceXpPerMinute}
                      onChange={(event) => setSettings((prev) => ({ ...prev, voiceXpPerMinute: event.target.valueAsNumber }))} className="input py-1.5 text-xs" />
                  </label>
                  <p className="text-xs text-[var(--muted)]">Level 1 needs 100 XP, level 2 needs 400 XP. Each level needs 100 × level² total XP. Earlier reward roles are kept.</p>
                  <div className="space-y-3">
                    {settings.voiceXpRewards.map((reward, index) => (
                      <div key={index} className="flex flex-wrap items-end gap-2">
                        <label className="block w-24">
                          <span className="field-label">Level {index + 1}</span>
                          <input type="number" min={1} max={10000} step={1} required value={Number.isNaN(reward.level) ? '' : reward.level}
                            onChange={(event) => setSettings((prev) => ({ ...prev, voiceXpRewards: prev.voiceXpRewards.map((row, i) => i === index ? { ...row, level: event.target.valueAsNumber } : row) }))} className="input py-1.5 text-xs" />
                        </label>
                        <label className="block min-w-36 flex-1">
                          <span className="field-label">Reward role {index + 1}</span>
                          <select required value={reward.roleId} onChange={(event) => setSettings((prev) => ({ ...prev, voiceXpRewards: prev.voiceXpRewards.map((row, i) => i === index ? { ...row, roleId: event.target.value } : row) }))} className="input py-1.5 text-xs">
                            <option value="">Select role...</option>
                            {reward.roleId && !roles.some((role) => role.id === reward.roleId) && <option value={reward.roleId} disabled>Unavailable role ({reward.roleId})</option>}
                            {roles.map((role) => <option key={role.id} value={role.id} disabled={!role.manageable || settings.voiceXpRewards.some((row, i) => i !== index && row.roleId === role.id)}>{role.name}{!role.manageable ? ' (not assignable)' : ''}</option>)}
                          </select>
                        </label>
                        <button type="button" aria-label={`Remove reward ${index + 1}`} onClick={() => setSettings((prev) => ({ ...prev, voiceXpRewards: prev.voiceXpRewards.filter((_, i) => i !== index) }))} className="btn text-xs">Remove</button>
                      </div>
                    ))}
                  </div>
                  <button type="button" disabled={settings.voiceXpRewards.length >= 50} onClick={() => setSettings((prev) => ({ ...prev, voiceXpRewards: [...prev.voiceXpRewards, { level: Math.min(10000, Math.max(0, ...prev.voiceXpRewards.map((reward) => Number.isFinite(reward.level) ? reward.level : 0)) + 1), roleId: '' }] }))} className="btn text-xs">Add level reward</button>
                  <p className="text-xs text-[var(--muted)]">Reward roles must be below the bot’s highest role. Changes apply when members next participate in voice; existing roles are not removed.</p>
                </section>

                <section className="card p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-[var(--text)]">Voice notifications</h3>
                  <label className="block">
                    <span className="field-label">Notification channel</span>
                    <select value={settings.voiceNotificationChannelId || ''} onChange={(event) => setSettings((prev) => ({ ...prev, voiceNotificationChannelId: event.target.value || null }))} className="input py-1.5 text-xs">
                      <option value="">Disabled</option>
                      {channels.map((channel) => <option key={channel.id} value={channel.id}>#{channel.name}</option>)}
                    </select>
                  </label>
                  <p className="text-xs text-[var(--muted)]">Plain embeds for joining, leaving and moving channels. Example: Othinus joined voice General. Works independently of voice XP.</p>
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
