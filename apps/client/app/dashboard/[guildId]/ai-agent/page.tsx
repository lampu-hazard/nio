'use client';

import React, { useEffect, useState, use } from 'react';
import { api } from '@/lib/api';
import { DashboardNav } from '@/components/dashboard/DashboardNav';

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
        allowedUserIds: settings.allowedUserIds, allowedChannelIds: settings.allowedChannelIds,
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

  function toggleChannel(field: 'allowedChannelIds' | 'excludedChannelIds', id: string) {
    setSettings((current) => ({
      ...current,
      [field]: current[field].includes(id) ? current[field].filter((value) => value !== id && value !== '*') : [...current[field].filter((value) => value !== '*'), id],
    }));
  }

  function setAllChannels(field: 'allowedChannelIds' | 'excludedChannelIds', checked: boolean) {
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
    <main className="px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">Automations</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-[var(--text)]">AI Agent</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">Pilih provider, batasi siapa dan channel yang dapat mengakses AI, lalu pantau pemakaian token per anggota.</p>
        </header>
        <DashboardNav guildId={guildId} activeTab="ai-agent" />
        {error && <div role="alert" className="notice notice-error">{error}</div>}
        {success && <div role="status" className="notice notice-success">{success}</div>}
        {loading ? <div className="card p-8 text-center text-[var(--muted)]">Memuat konfigurasi AI Agent…</div> : <>
          <form onSubmit={save} className="max-w-4xl space-y-6">
            <section className="card space-y-5 p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><h2 className="text-lg font-bold text-[var(--text)]">Provider & model</h2><p className="mt-1 text-sm text-[var(--muted)]">Credential dienkripsi dan tidak pernah ditampilkan kembali.</p></div>
                <label className="flex items-center gap-3 text-sm font-semibold text-[var(--text)]"><input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} className="h-4 w-4" />Aktifkan AI Agent</label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="field-label">Provider</span><select className="input" value={settings.provider} onChange={(e) => setSettings({ ...settings, provider: e.target.value as Settings['provider'] })}><option value="gemini">Google Gemini</option><option value="openai-compatible">OpenAI-compatible</option></select></label>
                <label><span className="field-label">Model</span><input className="input" value={settings.model} maxLength={120} onChange={(e) => setSettings({ ...settings, model: e.target.value })} placeholder="gemini-2.5-flash" /></label>
              </div>
              {settings.provider === 'openai-compatible' && <label className="block"><span className="field-label">API base URL</span><input className="input" type="url" value={settings.baseUrl || ''} maxLength={500} onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value || null })} placeholder="http://localhost:11434/v1" /><span className="mt-1 block text-xs text-[var(--muted)]">HTTP dan HTTPS didukung. Gunakan base URL provider yang tepercaya.</span></label>}
              <div className="space-y-3">
                <label className="block"><span className="field-label">API key {settings.hasCredential ? '· sudah dikonfigurasi' : '· belum dikonfigurasi'}</span><input className="input" type="password" autoComplete="new-password" value={apiKey} onChange={(e) => { setApiKey(e.target.value); if (e.target.value) setClearKey(false); }} placeholder={settings.hasCredential ? 'Masukkan key baru untuk mengganti' : 'Masukkan API key'} /></label>
                {settings.hasCredential && <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><input type="checkbox" checked={clearKey} onChange={(e) => { setClearKey(e.target.checked); if (e.target.checked) setApiKey(''); }} />Hapus API key tersimpan</label>}
              </div>
              <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs leading-5 text-[var(--muted)]">MCP adalah integrasi tools, bukan provider model. Hak aksi tetap mengikuti izin Discord dan mekanisme persetujuan bot.</p>
            </section>

            <section className="card space-y-5 p-5 sm:p-6">
              <div><h2 className="text-lg font-bold text-[var(--text)]">Akses anggota</h2><p className="mt-1 text-sm text-[var(--muted)]">Allowlist kosong berarti tidak ada anggota yang diizinkan.</p></div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><label className="min-w-0 flex-1"><span className="field-label">Cari anggota</span><input className="input" type="search" value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Nama atau username" /></label><label className="flex items-center gap-2 pb-2 text-sm text-[var(--text)]"><input type="checkbox" checked={settings.allowedUserIds.includes('*')} onChange={(e) => setAllMembers(e.target.checked)} className="h-4 w-4" />Pilih semua anggota</label></div>
              <div className="grid max-h-80 gap-2 overflow-y-auto sm:grid-cols-2">{filteredMembers.map((member) => <label key={member.id} className="flex min-w-0 items-center gap-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--text)]"><input type="checkbox" checked={settings.allowedUserIds.includes(member.id)} onChange={() => toggleMember(member.id)} className="h-4 w-4 shrink-0" /><img src={member.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full" /><span className="min-w-0"><span className="block truncate font-semibold">{member.displayName}</span><span className="block truncate text-xs text-[var(--muted)]">@{member.username}</span></span></label>)}{!filteredMembers.length && <p className="text-sm text-[var(--muted)]">Anggota tidak ditemukan.</p>}</div>
              <p className="text-xs text-[var(--muted)]">Dipilih: {settings.allowedUserIds.length} anggota</p>
            </section>

            <section className="card space-y-5 p-5 sm:p-6">
              <div><h2 className="text-lg font-bold text-[var(--text)]">Batas channel</h2><p className="mt-1 text-sm text-[var(--muted)]">Jika channel yang diizinkan dipilih, agent hanya merespons di channel tersebut.</p></div>
              {(['allowedChannelIds', 'excludedChannelIds'] as const).map((field) => <fieldset key={field} className="space-y-2"><legend className="mb-2 text-sm font-semibold text-[var(--text)]">{field === 'allowedChannelIds' ? 'Channel yang diizinkan' : 'Channel yang dikecualikan'}</legend>{channels.length ? <><label className="mb-2 inline-flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={settings[field].includes('*')} onChange={(e) => setAllChannels(field, e.target.checked)} className="h-4 w-4" />Pilih semua channel</label><div className="grid gap-2 sm:grid-cols-2">{channels.map((channel) => <label key={`${field}-${channel.id}`} className="flex min-w-0 items-center gap-3 rounded-md border border-[var(--border)] px-3 py-2 text-sm text-[var(--text)]"><input type="checkbox" checked={settings[field].includes(channel.id)} onChange={() => toggleChannel(field, channel.id)} className="h-4 w-4 shrink-0" /><span className="min-w-0 break-all">#{channel.name}</span></label>)}</div></> : <p className="text-sm text-[var(--muted)]">Daftar channel tidak tersedia.</p>}</fieldset>)}
            </section>
            <div className="flex justify-end"><button type="submit" disabled={saving} className="btn btn-primary px-6 py-3">{saving ? 'Menyimpan…' : 'Simpan pengaturan'}</button></div>
          </form>

          <section className="card space-y-4 p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-[var(--text)]">Pemakaian token</h2><p className="mt-1 text-sm text-[var(--muted)]">Agregat per anggota; isi prompt dan jawaban tidak ditampilkan.</p></div><label><span className="field-label">Periode</span><select className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 hari</option><option value={30}>30 hari</option><option value={90}>90 hari</option></select></label></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-[var(--muted)]"><tr><th className="py-3 pr-4">Anggota</th><th className="py-3 pr-4 text-right">Permintaan</th><th className="py-3 pr-4 text-right">Gagal</th><th className="py-3 pr-4 text-right">Prompt tokens</th><th className="py-3 pr-4 text-right">Completion tokens</th><th className="py-3 text-right">Total tokens</th></tr></thead><tbody className="divide-y divide-[var(--border)]">{usage.map((row) => <tr key={row.userId} className="text-[var(--text)]"><td className="py-3 pr-4"><span className="block font-semibold">{members.find((member) => member.id === row.userId)?.displayName || 'Anggota tidak ditemukan'}</span><span className="block text-xs text-[var(--muted)]">@{members.find((member) => member.id === row.userId)?.username || 'unknown'}</span></td><td className="py-3 pr-4 text-right tabular-nums">{row.requests.toLocaleString()}</td><td className="py-3 pr-4 text-right tabular-nums">{row.failures.toLocaleString()}</td><td className="py-3 pr-4 text-right tabular-nums">{row.promptTokens.toLocaleString()}</td><td className="py-3 pr-4 text-right tabular-nums">{row.completionTokens.toLocaleString()}</td><td className="py-3 text-right font-semibold tabular-nums">{row.totalTokens.toLocaleString()}</td></tr>)}</tbody></table></div>
            {!usage.length && <p className="py-4 text-center text-sm text-[var(--muted)]">Belum ada pemakaian AI pada periode ini.</p>}
          </section>
        </>}
      </div>
    </main>
  );
}
