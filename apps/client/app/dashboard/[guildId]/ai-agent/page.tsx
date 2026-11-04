'use client';

import { use, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { AiSettings, QuotaPage, settingsPayload, validateSettings } from '@/lib/ai-agent';
import { AgentRoleQuotas, AgentImages, AgentQuotaUsage, AgentMemberTokens, NumberField } from '@/components/ai-agent/AgentSections';

type Channel = { id: string; name: string };
type Member = { id: string; displayName: string; username: string; avatarUrl: string };
type Settings = AiSettings;
type Usage = { userId: string; displayName?: string; username?: string; avatarUrl?: string | null; requests: number; failures: number; promptTokens: number; completionTokens: number; totalTokens: number };

export default function AiAgentPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);
  return <AgentSettings key={guildId} guildId={guildId} />;
}

function AgentSettings({ guildId }: { guildId: string }) {
  const [tab, setTab] = useState<'config' | 'access' | 'images' | 'usage'>('config');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [baseline, setBaseline] = useState<Settings | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [imageApiKey, setImageApiKey] = useState('');
  const [clearImageKey, setClearImageKey] = useState(false);
  const [quota, setQuota] = useState<QuotaPage | null>(null);
  const [quotaError, setQuotaError] = useState('');
  const [quotaCursor, setQuotaCursor] = useState<string | null>(null);
  const [quotaRetry, setQuotaRetry] = useState(0);
  const [query, setQuery] = useState('');
  const [usage, setUsage] = useState<Usage[] | null>(null);
  const [usageError, setUsageError] = useState('');
  const [usageRetry, setUsageRetry] = useState(0);
  const [focusIssue, setFocusIssue] = useState(false);
  const sectionHeading = useRef<HTMLHeadingElement>(null);
  const [days, setDays] = useState(30);
  const [apiKey, setApiKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const generation = useRef(0);
  const lifetime = useRef<AbortController | null>(null);
  const dirty = !!settings && (JSON.stringify(settings) !== JSON.stringify(baseline) || !!apiKey || clearKey || !!imageApiKey || clearImageKey);
  useUnsavedChanges(dirty);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    const request = ++generation.current;
    setLoading(true); setError('');
    void Promise.all([
      api<{ settings: Settings }>(`/guilds/${guildId}/ai-agent/settings`, { signal: controller.signal }),
      api<{ channels: Channel[] }>(`/guilds/${guildId}/channels`, { signal: controller.signal }),
      api<{ members: Member[] }>(`/guilds/${guildId}/members`, { signal: controller.signal }),
      api<{ roles: { id: string; name: string }[] }>(`/guilds/${guildId}/roles`, { signal: controller.signal }),
    ]).then(([config, channelData, memberData, roleData]) => {
      if (controller.signal.aborted || request !== generation.current) return;
      if (!config.settings || !Array.isArray(channelData.channels) || !Array.isArray(memberData.members)) throw new Error('AI Agent data unavailable.');
      setSettings(config.settings); setBaseline(config.settings); setChannels(channelData.channels); setMembers(memberData.members);
      setRoles([{ id: guildId, name: '@everyone (all members)' }, ...roleData.roles.filter(role => role.id !== guildId)]);
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Failed to load AI Agent settings.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { ++generation.current; controller.abort(); };
  }, [guildId, retry]);

  useEffect(() => {
    const controller = new AbortController();
    setUsage(null); setUsageError('');
    void api<{ usage: { users: Usage[] } }>(`/guilds/${guildId}/ai-agent/usage?days=${days}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setUsage(result.usage.users); })
      .catch(reason => { if (!controller.signal.aborted) setUsageError(reason instanceof Error ? reason.message : 'Usage unavailable.'); });
    return () => controller.abort();
  }, [guildId, days, usageRetry]);

  useEffect(() => {
    if (focusIssue) { sectionHeading.current?.focus(); setFocusIssue(false); }
  }, [tab, focusIssue]);

  useEffect(() => {
    const controller = new AbortController();
    setQuota(null); setQuotaError('');
    const cursor = quotaCursor ? `?cursor=${encodeURIComponent(quotaCursor)}` : '';
    void api<{ quotas: QuotaPage }>(`/guilds/${guildId}/ai-agent/quotas${cursor}`, { signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setQuota(result.quotas); })
      .catch(reason => { if (!controller.signal.aborted) setQuotaError(reason instanceof Error ? reason.message : 'Quota ledger unavailable.'); });
    return () => controller.abort();
  }, [guildId, quotaCursor, quotaRetry]);

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<{ members: Member[] }>(`/guilds/${guildId}/members?query=${encodeURIComponent(query.trim())}`, { signal: controller.signal })
        .then(result => { if (!controller.signal.aborted) setMembers(current => [...new Map([...current, ...result.members].map(member => [member.id, member])).values()]); })
        .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Member search unavailable.'); });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [guildId, query]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!settings || loading || pending.current || !dirty) return;
    const issue = validateSettings(settings);
    if (issue) { setTab(issue.section); setError(issue.message); setFocusIssue(true); return; }
    pending.current = true; setSaving(true); setError(''); setNotice('');
    const request = ++generation.current;
    try {
      const payload = settingsPayload({ ...settings, model: settings.model.trim(), baseUrl: settings.provider === 'openai-compatible' ? settings.baseUrl : null }, { apiKey, clearApiKey: clearKey, imageApiKey, clearImageApiKey: clearImageKey });
      const result = await api<{ settings: Settings }>(`/guilds/${guildId}/ai-agent/settings`, { method: 'PATCH', body: JSON.stringify(payload), signal: lifetime.current?.signal });
      if (request !== generation.current || lifetime.current?.signal.aborted) return;
      if (!result.settings) throw new Error('AI Agent settings could not be saved.');
      setSettings(result.settings); setBaseline(result.settings); setApiKey(''); setClearKey(false);
      setImageApiKey(''); setClearImageKey(false); setNotice('Changes saved.');
      setQuotaCursor(null); setQuotaRetry(value => value + 1);
    } catch (reason) {
      if (request === generation.current && !lifetime.current?.signal.aborted) setError(reason instanceof Error ? reason.message : 'Failed to save settings.');
    } finally { if (request === generation.current && !lifetime.current?.signal.aborted) { pending.current = false; setSaving(false); } }
  }

  function toggleMember(id: string) {
    setSettings(current => current && ({ ...current, allowedUserIds: current.allowedUserIds.includes(id) ? current.allowedUserIds.filter(value => value !== id && value !== '*') : [...current.allowedUserIds.filter(value => value !== '*'), id] }));
  }
  function toggleChannel(id: string) {
    setSettings(current => current && ({ ...current, excludedChannelIds: current.excludedChannelIds.includes('*') ? channels.map(channel => channel.id).filter(value => value !== id) : current.excludedChannelIds.includes(id) ? current.excludedChannelIds.filter(value => value !== id) : [...current.excludedChannelIds, id] }));
  }

  return <main className="dashboard-page dashboard-page--wide">
    <h1>AI Agent</h1><p className="dashboard-description">Manage chat, role allowances, image generation and recorded usage.</p>
    <div className="mb-6 flex flex-wrap gap-2" aria-label="AI Agent sections">{([['config', 'Model & Key'], ['access', 'Access & quotas'], ['images', 'Images'], ['usage', 'Usage']] as const).map(([key, label]) => <button key={key} type="button" className={`btn ${tab === key ? 'btn-primary' : ''}`} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
    <h2 ref={sectionHeading} tabIndex={-1} className="sr-only">{tab === 'config' ? 'Model and key settings' : tab === 'access' ? 'Access and quota settings' : tab === 'images' ? 'Image settings' : 'Usage'}</h2>
    {error && <div className="dashboard-notice" role="alert">{error}</div>}
    {loading ? <p role="status">Loading AI Agent settings…</p> : !settings ? <div className="dashboard-notice">AI Agent settings unavailable. <button type="button" className="btn" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : tab === 'usage' ? <div className="space-y-6">
      {quotaError ? <section className="dashboard-section" role="alert"><p>{quotaError}</p><button type="button" className="btn mt-3" onClick={() => setQuotaRetry(value => value + 1)}>Retry quota ledger</button></section> : !quota ? <section className="dashboard-section"><p role="status">Loading today’s quota ledger…</p></section> : <AgentQuotaUsage page={{ ...quota, members: quota.members.map(row => ({ ...row, userId: members.find(member => member.id === row.userId)?.displayName || row.userId })) }} onRefresh={() => { setQuotaCursor(null); setQuotaRetry(value => value + 1); }} onNext={() => { if (quota.nextCursor) setQuotaCursor(quota.nextCursor); }} />}
      <section className="dashboard-section">
        <h2>Historical token usage by member</h2><label className="dashboard-field"><span>Period</span><select className="input" value={days} onChange={event => setDays(Number(event.target.value))}>{[7, 30, 90].map(value => <option key={value} value={value}>{value} days</option>)}</select></label>
        {usageError ? <div role="alert">{usageError} <button type="button" className="btn" onClick={() => setUsageRetry(value => value + 1)}>Retry</button></div> : !usage ? <p role="status">Loading usage…</p> : !usage.length ? <p>No AI usage recorded in this period.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left"><thead><tr>{['Member', 'Requests', 'Failures', 'Prompt', 'Completion', 'Total'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead><tbody>{usage.map(row => <tr key={row.userId}><th className="p-3 font-normal">{row.displayName || members.find(member => member.id === row.userId)?.displayName || row.userId}</th>{[row.requests, row.failures, row.promptTokens, row.completionTokens, row.totalTokens].map((value, index) => <td key={index} className="p-3 tabular-nums">{value.toLocaleString()}</td>)}</tr>)}</tbody></table></div>}
      </section>
    </div> : <form onSubmit={save}><fieldset disabled={saving} className="min-w-0">
      {tab === 'config' ? <section className="dashboard-section max-w-3xl"><h2>Provider and model</h2>
        <label className="dashboard-toggle"><span>Enable AI Agent</span><input type="checkbox" checked={settings.enabled} onChange={event => setSettings({ ...settings, enabled: event.target.checked })} /></label>
        <div className="dashboard-grid mt-5"><label className="dashboard-field"><span>Provider</span><select className="input" value={settings.provider} onChange={event => setSettings({ ...settings, provider: event.target.value as Settings['provider'] })}><option value="gemini">Google Gemini</option><option value="openai-compatible">OpenAI-compatible</option></select></label>
        <label className="dashboard-field"><span>Model</span><input className="input" required maxLength={120} value={settings.model} placeholder="gemini-2.5-flash" onChange={event => setSettings({ ...settings, model: event.target.value })} /></label></div>
        {settings.provider === 'openai-compatible' && <label className="dashboard-field"><span>API base URL</span><input className="input" type="url" maxLength={500} value={settings.baseUrl || ''} onChange={event => setSettings({ ...settings, baseUrl: event.target.value || null })} /></label>}
        <div className="dashboard-grid mt-5"><NumberField label="Max output tokens / call (128–8,192)" value={settings.maxOutputTokens} min={128} max={8192} onChange={value => setSettings({ ...settings, maxOutputTokens: value })} /><NumberField label="Max tokens / run (1,024–262,144)" value={settings.maxRunTokens} min={1024} max={262144} onChange={value => setSettings({ ...settings, maxRunTokens: value })} /></div>
        <label className="dashboard-field"><span>API key ({settings.hasCredential ? 'saved' : 'not configured'})</span><input className="input" type="password" autoComplete="new-password" value={apiKey} onChange={event => { setApiKey(event.target.value); if (event.target.value) setClearKey(false); }} /><small>Credentials are encrypted and never displayed again.</small></label>
        {settings.hasCredential && <label className="dashboard-toggle"><span>Remove saved API key</span><input type="checkbox" checked={clearKey} onChange={event => { setClearKey(event.target.checked); if (event.target.checked) setApiKey(''); }} /></label>}
      </section> : tab === 'images' ? <AgentImages settings={settings} onChange={setSettings} imageApiKey={imageApiKey} clearImageApiKey={clearImageKey} onKey={value => { setImageApiKey(value); if (value) setClearImageKey(false); }} onClear={value => { setClearImageKey(value); if (value) setImageApiKey(''); }} /> : <div className="space-y-6">
        <AgentRoleQuotas settings={settings} roles={roles} onChange={setSettings} />
        <div className="dashboard-grid">
          <section className="dashboard-section"><h2>{settings.accessMode === 'LEGACY_USERS' ? 'Legacy member allowlist' : 'Personal token quotas'}</h2>
            <p className="mb-3 text-[var(--muted)]">{settings.accessMode === 'LEGACY_USERS' ? 'Selected members can use AI chat without daily quota limits.' : 'Choose Follow role, a custom daily token limit, or Unlimited per member. Personal settings override role token quotas. Server and per-run caps still apply; image access still follows roles.'}</p>
            {settings.accessMode === 'LEGACY_USERS' && <label className="dashboard-toggle"><span>Allow all members</span><input type="checkbox" checked={settings.allowedUserIds.includes('*')} onChange={event => setSettings({ ...settings, allowedUserIds: event.target.checked ? ['*'] : [] })} /></label>}
            <label className="dashboard-field mt-4"><span>Search members</span><input className="input" type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
            <div className="max-h-96 overflow-y-auto">{members.filter(member => `${member.displayName} ${member.username} ${member.id}`.toLowerCase().includes(query.toLowerCase())).map(member => settings.accessMode === 'ROLE_QUOTAS'
              ? <AgentMemberTokens key={member.id} settings={settings} onChange={setSettings} userId={member.id} name={`${member.displayName} (@${member.username})`} />
              : <label key={member.id} className="dashboard-toggle"><span>{member.displayName} (@{member.username})</span><input type="checkbox" checked={settings.allowedUserIds.includes('*') || settings.allowedUserIds.includes(member.id)} onChange={() => toggleMember(member.id)} /></label>)}</div>
            {settings.accessMode === 'ROLE_QUOTAS' && (settings.userTokenRules ?? []).filter(rule => !members.some(member => member.id === rule.userId)).map(rule => <AgentMemberTokens key={rule.userId} settings={settings} onChange={setSettings} userId={rule.userId} name={`Unavailable member (${rule.userId})`} />)}
            {settings.accessMode === 'LEGACY_USERS' && settings.allowedUserIds.filter(id => id !== '*' && !members.some(member => member.id === id)).map(id => <label key={id} className="dashboard-toggle"><span className="break-all">Unavailable member ({id})</span><input type="checkbox" checked onChange={() => toggleMember(id)} /></label>)}
          </section>
          <section className="dashboard-section"><h2>Excluded channels</h2><p className="mb-4 text-[var(--muted)]">The agent will not respond in selected channels.</p>
            <label className="dashboard-toggle"><span>Exclude all channels</span><input type="checkbox" checked={settings.excludedChannelIds.includes('*')} onChange={event => setSettings({ ...settings, excludedChannelIds: event.target.checked ? ['*'] : [] })} /></label>
            {[...channels, ...settings.excludedChannelIds.filter(id => id !== '*' && !channels.some(channel => channel.id === id)).map(id => ({ id, name: `Unavailable channel (${id})` }))].map(channel => <label key={channel.id} className="dashboard-toggle"><span className="break-all">{channel.name}</span><input type="checkbox" checked={settings.excludedChannelIds.includes('*') || settings.excludedChannelIds.includes(channel.id)} onChange={() => toggleChannel(channel.id)} /></label>)}
          </section>
        </div>
      </div>}
    </fieldset><div className="dashboard-actions"><button type="submit" className="btn btn-primary" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button><span role="status">{notice || (dirty ? 'Unsaved changes' : 'No unsaved changes')}</span></div></form>}
  </main>;
}
