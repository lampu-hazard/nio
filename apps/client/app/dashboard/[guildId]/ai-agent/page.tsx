'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';

type Channel = { id: string; name: string };
type Member = { id: string; displayName: string; username: string; avatarUrl: string };
type Settings = {
  enabled: boolean;
  provider: 'gemini' | 'openai-compatible';
  model: string;
  baseUrl: string | null;
  allowedUserIds: string[];
  allowedChannelIds: string[];
  excludedChannelIds: string[];
  hasCredential: boolean;
};
type Usage = { userId: string; requests: number; failures: number; promptTokens: number; completionTokens: number; totalTokens: number };
type PageProps = { params: Promise<{ guildId: string }> };

const defaults: Settings = {
  enabled: false, provider: 'gemini', model: 'gemini-2.5-flash', baseUrl: null,
  allowedUserIds: [], allowedChannelIds: [], excludedChannelIds: [], hasCredential: false,
};

export default function AiAgentPage({ params }: PageProps) {
  const { guildId } = use(params);
  const [tab, setTab] = useState<'config' | 'access' | 'usage'>('config');
  const [settings, setSettings] = useState<Settings>(defaults);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberQuery, setMemberQuery] = useState('');
  const [usage, setUsage] = useState<Usage[]>([]);
  const [days, setDays] = useState(30);
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    void load();
  }, [guildId, days]);

  useEffect(() => {
    if (!memberQuery.trim()) return;
    const timer = setTimeout(() => {
      const query = memberQuery.trim();
      api<{ members: Member[] }>(`/guilds/${guildId}/members?query=${encodeURIComponent(query)}`)
        .then((result) => setMembers((current) => {
        const merged = new Map(current.map((member) => [member.id, member]));
        for (const member of result.members || []) merged.set(member.id, member);
        return [...merged.values()];
      }))
      .catch((err: any) => setError(err?.message || 'Gagal mencari anggota.'));
    }, 300);
    return () => clearTimeout(timer);
  }, [guildId, memberQuery]);

  async function load() {
    try {
      setLoading(true);
      const [settingsRes, channelsRes, membersRes, usageRes] = await Promise.all([
        api<{ settings: Settings }>(`/guilds/${guildId}/ai-agent/settings`),
        api<{ channels: Channel[] }>(`/guilds/${guildId}/channels`),
        api<{ members: Member[] }>(`/guilds/${guildId}/members`),
        api<{ usage: { users: Usage[] } }>(`/guilds/${guildId}/ai-agent/usage?days=${days}`),
      ]);
      setSettings({ ...defaults, ...settingsRes.settings });
      setChannels(channelsRes.channels || []);
      setMembers(membersRes.members || []);
      setUsage(usageRes.usage?.users || []);
      setError('');
    } catch (err: any) {
      setError(err?.message || 'Gagal memuat pengaturan AI Agent.');
    } finally {
      setLoading(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: Record<string, unknown> = {
        enabled: settings.enabled, provider: settings.provider, model: settings.model.trim(),
        baseUrl: settings.provider === 'openai-compatible' ? settings.baseUrl : null,
        allowedUserIds: settings.allowedUserIds,
        excludedChannelIds: settings.excludedChannelIds,
      };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      if (clearKey) payload.clearApiKey = true;
      const result = await api<{ settings: Settings }>(`/guilds/${guildId}/ai-agent/settings`, {
        method: 'PATCH', body: JSON.stringify(payload),
      });
      setSettings({ ...defaults, ...result.settings });
      setApiKey('');
      setClearKey(false);
      setSuccess('Pengaturan AI Agent tersimpan.');
    } catch (err: any) {
      setError(err?.message || 'Gagal menyimpan pengaturan.');
    } finally {
      setSaving(false);
    }
  }

  function toggleChannel(field: 'excludedChannelIds', id: string) {
    setSettings((current) => {
      const exclusions = current[field];
      if (exclusions.includes('*')) {
        return { ...current, [field]: channels.map((channel) => channel.id).filter((channelId) => channelId !== id) };
      }
      return {
        ...current,
        [field]: exclusions.includes(id) ? exclusions.filter((value) => value !== id) : [...exclusions, id],
      };
    });
  }

  function setAllChannels(field: 'excludedChannelIds', checked: boolean) {
    setSettings((current) => ({ ...current, [field]: checked ? ['*'] : [] }));
  }

  function setAllMembers(checked: boolean) {
    setSettings((current) => ({ ...current, allowedUserIds: checked ? ['*'] : [] }));
  }

  function toggleMember(id: string) {
    setSettings((current) => ({
      ...current,
      allowedUserIds: current.allowedUserIds.includes(id)
        ? current.allowedUserIds.filter((value) => value !== id && value !== '*')
        : [...current.allowedUserIds.filter((value) => value !== '*'), id],
    }));
  }

  const filteredMembers = members.filter((member) =>
    `${member.displayName} ${member.username} ${member.id}`.toLowerCase().includes(memberQuery.toLowerCase()),
  );

  function displayUsageMember(id: string) {
    const member = members.find((candidate) => candidate.id === id);
    return member ? `${member.displayName} (@${member.username})` : `Anggota tidak ditemukan (${id})`;
  }


  return (
    <main className="px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] space-y-4">
        {/* Compact Action & Tab Switcher Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold tracking-tight text-[var(--text)]">AI Agent Control</h2>
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTab('config')}
                className={`rounded-md px-3 py-1 font-semibold transition-all ${
                  tab === 'config'
                    ? 'bg-[var(--panel-strong)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Model &amp; Key
              </button>
              <button
                type="button"
                onClick={() => setTab('access')}
                className={`rounded-md px-3 py-1 font-semibold transition-all ${
                  tab === 'access'
                    ? 'bg-[var(--panel-strong)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Akses &amp; Saluran
              </button>
              <button
                type="button"
                onClick={() => setTab('usage')}
                className={`rounded-md px-3 py-1 font-semibold transition-all ${
                  tab === 'usage'
                    ? 'bg-[var(--panel-strong)] text-[var(--text)] shadow-sm'
                    : 'text-[var(--muted)] hover:text-[var(--text)]'
                }`}
              >
                Pemakaian Token
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {error && <span className="text-xs font-semibold text-[var(--danger)]">{error}</span>}
            {success && <span className="text-xs font-semibold text-[var(--ok)]">{success}</span>}
            {tab !== 'usage' && (
              <button
                type="button"
                onClick={(e) => void save(e as any)}
                disabled={saving}
                className="btn btn-primary text-xs font-bold py-1.5 px-4"
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="card p-8 text-center text-xs text-[var(--muted)]">Memuat konfigurasi AI Agent…</div>
        ) : (
          <div>
            {tab === 'config' && (
              <div className="grid gap-4 max-w-3xl">
                <section className="card space-y-4 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Provider &amp; Model</h3>
                      <p className="text-[11px] text-[var(--muted)]">Credential dienkripsi dan tidak pernah ditampilkan kembali.</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text)]">
                      <input
                        type="checkbox"
                        checked={settings.enabled}
                        onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
                        className="h-4 w-4 rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      Aktifkan AI Agent
                    </label>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label>
                      <span className="field-label">Provider</span>
                      <select
                        className="input py-1.5 text-xs"
                        value={settings.provider}
                        onChange={(e) => setSettings({ ...settings, provider: e.target.value as Settings['provider'] })}
                      >
                        <option value="gemini">Google Gemini</option>
                        <option value="openai-compatible">OpenAI-compatible</option>
                      </select>
                    </label>
                    <label>
                      <span className="field-label">Model</span>
                      <input
                        className="input py-1.5 text-xs"
                        value={settings.model}
                        maxLength={120}
                        onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                        placeholder="gemini-2.5-flash"
                      />
                    </label>
                  </div>

                  {settings.provider === 'openai-compatible' && (
                    <label className="block">
                      <span className="field-label">API base URL</span>
                      <input
                        className="input py-1.5 text-xs"
                        type="url"
                        value={settings.baseUrl || ''}
                        maxLength={500}
                        onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value || null })}
                        placeholder="http://localhost:11434/v1"
                      />
                    </label>
                  )}

                  <div className="space-y-2">
                    <label className="block">
                      <span className="field-label">
                        API Key {settings.hasCredential ? '· tersimpan' : '· belum disetel'}
                      </span>
                      <input
                        className="input py-1.5 text-xs"
                        type="password"
                        autoComplete="new-password"
                        value={apiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          if (e.target.value) setClearKey(false);
                        }}
                        placeholder={settings.hasCredential ? 'Ketik untuk mengganti API key baru' : 'Masukkan API key'}
                      />
                    </label>
                    {settings.hasCredential && (
                      <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
                        <input
                          type="checkbox"
                          checked={clearKey}
                          onChange={(e) => {
                            setClearKey(e.target.checked);
                            if (e.target.checked) setApiKey('');
                          }}
                        />
                        Hapus API key yang tersimpan
                      </label>
                    )}
                  </div>
                </section>
              </div>
            )}

            {tab === 'access' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="card space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Akses Anggota</h3>
                      <p className="text-[11px] text-[var(--muted)]">Allowlist izin berbicara dengan AI.</p>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--text)]">
                      <input
                        type="checkbox"
                        checked={settings.allowedUserIds.includes('*')}
                        onChange={(e) => setAllMembers(e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      Semua anggota
                    </label>
                  </div>
                  <input
                    className="input py-1.5 text-xs"
                    type="search"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder="Cari nama atau username..."
                  />
                  <div className="grid max-h-72 gap-1.5 overflow-y-auto sm:grid-cols-2">
                    {filteredMembers.map((member) => (
                      <label
                        key={member.id}
                        className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 text-xs text-[var(--text)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={settings.allowedUserIds.includes(member.id)}
                          onChange={() => toggleMember(member.id)}
                          className="h-3.5 w-3.5 shrink-0"
                        />
                        <img src={member.avatarUrl} alt="" className="h-6 w-6 shrink-0 rounded-full" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{member.displayName}</span>
                          <span className="block truncate text-[10px] text-[var(--muted)]">@{member.username}</span>
                        </span>
                      </label>
                    ))}
                    {!filteredMembers.length && <p className="text-xs text-[var(--muted)] py-4 text-center col-span-full">Tidak ada anggota cocok.</p>}
                  </div>
                  <p className="text-[11px] text-[var(--muted)]">Dipilih: {settings.allowedUserIds.length} anggota</p>
                </section>

                <section className="card space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Saluran yang Dikecualikan</h3>
                      <p className="text-[11px] text-[var(--muted)]">Centang saluran yang dilarang merespons.</p>
                    </div>
                    {channels.length > 0 && (
                      <label className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--text)]">
                        <input
                          type="checkbox"
                          checked={settings.excludedChannelIds.includes('*')}
                          onChange={(e) => setAllChannels('excludedChannelIds', e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        Semua
                      </label>
                    )}
                  </div>
                  {channels.length ? (
                    <div className="grid max-h-72 gap-1.5 overflow-y-auto sm:grid-cols-2">
                      {channels.map((channel) => (
                        <label
                          key={`excluded-${channel.id}`}
                          className="flex min-w-0 items-center gap-2.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text)] cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={settings.excludedChannelIds.includes(channel.id) || settings.excludedChannelIds.includes('*')}
                            onChange={() => toggleChannel('excludedChannelIds', channel.id)}
                            className="h-3.5 w-3.5 shrink-0"
                          />
                          <span className="min-w-0 truncate">#{channel.name}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--muted)]">Daftar channel tidak tersedia.</p>
                  )}
                </section>
              </div>
            )}

            {tab === 'usage' && (
              <section className="card p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text)]">Agregat Pemakaian Token</h3>
                    <p className="text-[11px] text-[var(--muted)]">Pemakaian token per anggota.</p>
                  </div>
                  <select
                    className="input py-1 text-xs w-28"
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                  >
                    <option value={7}>7 hari</option>
                    <option value={30}>30 hari</option>
                    <option value={90}>90 hari</option>
                  </select>
                </div>
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[var(--border)] uppercase tracking-wider text-[10px] text-[var(--muted)] sticky top-0 bg-[var(--panel)]">
                      <tr>
                        <th className="py-2 pr-3">Anggota</th>
                        <th className="py-2 pr-3 text-right">Permintaan</th>
                        <th className="py-2 pr-3 text-right">Gagal</th>
                        <th className="py-2 pr-3 text-right">Prompt</th>
                        <th className="py-2 pr-3 text-right">Completion</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {usage.map((row) => (
                        <tr key={row.userId} className="text-[var(--text)]">
                          <td className="py-2 pr-3">
                            <span className="font-semibold block truncate max-w-[180px]">
                              {members.find((member) => member.id === row.userId)?.displayName || 'Anggota'}
                            </span>
                            <span className="text-[10px] text-[var(--muted)] block truncate">
                              @{members.find((member) => member.id === row.userId)?.username || row.userId}
                            </span>
                          </td>
                          <td className="py-2 pr-3 text-right tabular-nums">{row.requests.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{row.failures.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{row.promptTokens.toLocaleString()}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{row.completionTokens.toLocaleString()}</td>
                          <td className="py-2 text-right font-bold tabular-nums">{row.totalTokens.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!usage.length && <p className="py-6 text-center text-xs text-[var(--muted)]">Belum ada pemakaian AI pada periode ini.</p>}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
