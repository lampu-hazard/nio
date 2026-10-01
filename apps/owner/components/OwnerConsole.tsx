'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';

type Guild = { id: string; name: string; iconUrl: string | null; memberCount: number; createdAt: string; botPresent: true };
type Usage = { days: number; requests: number; failures: number; promptTokens: number; completionTokens: number; totalTokens: number };
type Overview = { bot: { online: boolean; id: string | null; username: string | null; guildCount: number }; usage: Usage };
type GuildDetail = { guild: Guild; settings: Record<string, unknown>; aiSettings: Record<string, unknown>; usage: Usage };

const number = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;

export function OwnerConsole() {
  const [days, setDays] = useState(30);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selected, setSelected] = useState<GuildDetail | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const refresh = useCallback(async () => {
    setError('');
    try {
      const [summary, inventory] = await Promise.all([
        api<Overview>(`/owner/overview?days=${days}`),
        api<Guild[]>(`/owner/guilds?query=${encodeURIComponent(query)}`),
      ]);
      setOverview(summary);
      setGuilds(inventory);
      if (selected && !inventory.some((guild) => guild.id === selected.guild.id)) setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load owner console.');
    }
  }, [days, query, selected]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!selected) return;
    let current = true;
    api<GuildDetail>(`/owner/guilds/${selected.guild.id}?days=${days}`)
      .then((detail) => { if (current) setSelected(detail); })
      .catch((err) => { if (current) setError(err instanceof Error ? err.message : 'Could not refresh guild details.'); });
    return () => { current = false; };
  }, [days]);

  async function selectGuild(guild: Guild) {
    setError(''); setNotice(''); setConfirmLeave(false);
    try { setSelected(await api<GuildDetail>(`/owner/guilds/${guild.id}?days=${days}`)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load guild details.'); }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const bool = (key: string) => form.get(key) === 'on';
    const payload = {
      stickerEnabled: bool('stickerEnabled'), hallOfFameEnabled: bool('hallOfFameEnabled'), slowmodeEnabled: bool('slowmodeEnabled'),
      anomalyEnabled: bool('anomalyEnabled'), phishingDetectionEnabled: bool('phishingDetectionEnabled'), contentAnomalyEnabled: bool('contentAnomalyEnabled'),
      userAnomalyEnabled: bool('userAnomalyEnabled'), guildBaselineEnabled: bool('guildBaselineEnabled'),
      logChannelId: (form.get('logChannelId') as string) || null,
      messageDeleteLogChannelId: (form.get('messageDeleteLogChannelId') as string) || null,
      hallOfFameChannelId: (form.get('hallOfFameChannelId') as string) || null,
      hallOfFameThreshold: Number(form.get('hallOfFameThreshold') || 3),
      slowmodeIntervalQuiet: Number(form.get('slowmodeIntervalQuiet') || 0), slowmodeIntervalNormal: Number(form.get('slowmodeIntervalNormal') || 5),
      slowmodeIntervalBusy: Number(form.get('slowmodeIntervalBusy') || 10), anomalyEnforcementMode: form.get('anomalyEnforcementMode'),
      slowmodeChannels: String(form.get('slowmodeChannels') || '').split(',').map((id) => id.trim()).filter(Boolean),
    };
    const aiPayload = {
      enabled: bool('aiEnabled'), provider: form.get('provider'), model: form.get('model'), baseUrl: (form.get('baseUrl') as string) || null,
      allowedUserIds: String(form.get('allowedUserIds') || '').split(',').map((id) => id.trim()).filter(Boolean),
      allowedChannelIds: String(form.get('allowedChannelIds') || '').split(',').map((id) => id.trim()).filter(Boolean),
      excludedChannelIds: String(form.get('excludedChannelIds') || '').split(',').map((id) => id.trim()).filter(Boolean),
    };
    setSaving(true); setError(''); setNotice('');
    try {
      await api(`/owner/guilds/${selected.guild.id}/settings`, { method: 'PATCH', body: JSON.stringify(payload) });
      await api(`/owner/guilds/${selected.guild.id}/ai-agent`, { method: 'PATCH', body: JSON.stringify(aiPayload) });
      setSelected(await api<GuildDetail>(`/owner/guilds/${selected.guild.id}?days=${days}`));
      setNotice('Settings saved.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save settings.'); }
    finally { setSaving(false); }
  }

  async function leaveGuild() {
    if (!selected) return;
    setSaving(true); setError(''); setNotice('');
    try {
      await api(`/owner/guilds/${selected.guild.id}/leave`, { method: 'POST' });
      setNotice(`Bot left ${selected.guild.name}.`); setSelected(null); setConfirmLeave(false);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not leave the guild.'); }
    finally { setSaving(false); }
  }

  const checked = (obj: Record<string, unknown> | undefined, key: string, fallback = false) => Boolean(obj?.[key] ?? fallback);
  const text = (obj: Record<string, unknown> | undefined, key: string, fallback = '') => String(obj?.[key] ?? fallback);
  const csv = (obj: Record<string, unknown> | undefined, key: string) => Array.isArray(obj?.[key]) ? (obj[key] as string[]).join(', ') : '';

  return <main className="owner-page" aria-label="Owner operations console">
    <header className="owner-header"><div><p className="owner-eyebrow">NIO · OPERATIONS</p><h1>Owner console</h1><p className="owner-subtitle">Live bot presence, aggregate AI usage, and per-server controls.</p></div><div className="owner-status"><span className={overview?.bot.online ? 'owner-dot online' : 'owner-dot'} />{overview ? (overview.bot.online ? 'Bot online' : 'Bot offline') : 'Connecting'}</div></header>
    {error && <div className="notice notice-error" role="alert">{error}</div>}{notice && <div className="notice notice-success" role="status">{notice}</div>}
    <section className="owner-metrics" aria-label="Bot overview">
      <article className="owner-metric"><span>Servers online</span><strong>{overview?.bot.guildCount ?? '—'}</strong><small>{overview?.bot.username ?? 'Bot status'}</small></article>
      <article className="owner-metric"><span>Total tokens · {days}d</span><strong>{overview ? number(overview.usage.totalTokens).toLocaleString() : '—'}</strong><small>Prompt + completion</small></article>
      <article className="owner-metric"><span>Requests · {days}d</span><strong>{overview ? number(overview.usage.requests).toLocaleString() : '—'}</strong><small>{overview?.usage.failures ?? 0} failures</small></article>
      <article className="owner-metric owner-range"><label htmlFor="owner-days">Usage range</label><select id="owner-days" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select></article>
    </section>
    <section className="owner-layout">
      <aside className="owner-guild-panel"><div className="owner-panel-heading"><div><h2>Bot servers</h2><span>{guilds.length} currently joined</span></div></div>
        <label className="sr-only" htmlFor="guild-search">Search servers</label><input id="guild-search" className="input" placeholder="Search name or server ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="owner-guild-list">{guilds.map((guild) => <button className={`owner-guild-row ${selected?.guild.id === guild.id ? 'active' : ''}`} key={guild.id} onClick={() => void selectGuild(guild)}>{guild.iconUrl ? <img src={guild.iconUrl} alt="" /> : <span className="owner-guild-placeholder">{guild.name.slice(0,1).toUpperCase()}</span>}<span className="owner-guild-name"><strong>{guild.name}</strong><small>{guild.memberCount.toLocaleString()} members · {guild.id}</small></span><span className="owner-presence">LIVE</span></button>)}{!guilds.length && <p className="owner-empty">No currently joined servers match.</p>}</div>
      </aside>
      <section className="owner-detail-panel">{!selected ? <div className="owner-empty-state"><span className="owner-orbit">◎</span><h2>Select a server</h2><p>Only guilds in the bot’s live Discord cache appear here.</p></div> : <>
        <div className="owner-detail-heading"><div className="owner-guild-title">{selected.guild.iconUrl && <img src={selected.guild.iconUrl} alt="" />}<div><p className="owner-eyebrow">SERVER DETAILS</p><h2>{selected.guild.name}</h2><span>{selected.guild.id} · {selected.guild.memberCount.toLocaleString()} members</span></div></div><div className="owner-usage-strip"><div><span>Requests</span><strong>{selected.usage.requests.toLocaleString()}</strong></div><div><span>Prompt tokens</span><strong>{selected.usage.promptTokens.toLocaleString()}</strong></div><div><span>Completion tokens</span><strong>{selected.usage.completionTokens.toLocaleString()}</strong></div></div></div>
        <form className="owner-settings" onSubmit={saveSettings}>
          <div className="owner-section-heading"><div><p className="owner-eyebrow">SERVER CONFIGURATION</p><h3>Feature settings</h3></div></div>
          <div className="owner-field-grid"><Field label="Log channel ID" name="logChannelId" initial={text(selected.settings,'logChannelId')} /><Field label="Delete log channel ID" name="messageDeleteLogChannelId" initial={text(selected.settings,'messageDeleteLogChannelId')} /><Field label="Hall of Fame channel ID" name="hallOfFameChannelId" initial={text(selected.settings,'hallOfFameChannelId')} /><Field label="Hall of Fame threshold" name="hallOfFameThreshold" type="number" initial={text(selected.settings,'hallOfFameThreshold','3')} /><Field label="Slowmode quiet interval" name="slowmodeIntervalQuiet" type="number" initial={text(selected.settings,'slowmodeIntervalQuiet','0')} /><Field label="Slowmode normal interval" name="slowmodeIntervalNormal" type="number" initial={text(selected.settings,'slowmodeIntervalNormal','5')} /><Field label="Slowmode busy interval" name="slowmodeIntervalBusy" type="number" initial={text(selected.settings,'slowmodeIntervalBusy','10')} /><label className="owner-field"><span>Enforcement mode</span><select key={selected.guild.id} className="input" name="anomalyEnforcementMode" defaultValue={text(selected.settings,'anomalyEnforcementMode','AUDIT_ONLY')}><option>AUDIT_ONLY</option><option>DELETE_HIGH_CONFIDENCE</option><option>DELETE_AND_TIMEOUT_CRITICAL</option></select></label><Field label="Slowmode channel IDs (comma separated)" name="slowmodeChannels" initial={csv(selected.settings,'slowmodeChannels')} /></div>
          <div className="owner-toggles">{[['stickerEnabled','Stickers'],['hallOfFameEnabled','Hall of Fame'],['slowmodeEnabled','Slowmode'],['anomalyEnabled','Anomaly protection'],['phishingDetectionEnabled','Phishing detection'],['contentAnomalyEnabled','Content anomaly'],['userAnomalyEnabled','User anomaly'],['guildBaselineEnabled','Guild baseline']].map(([name,label]) => <Toggle key={name} name={name} label={label} initial={checked(selected.settings,name,true)} />)}</div>
          <div className="owner-section-heading owner-ai-heading"><div><p className="owner-eyebrow">AI AGENT</p><h3>Behavior &amp; access</h3><span>{selected.aiSettings.hasCredential ? 'Credential configured · secret hidden' : 'No credential configured'}</span></div></div>
          <div className="owner-field-grid"><label className="owner-field"><span>Provider</span><select key={selected.guild.id} className="input" name="provider" defaultValue={text(selected.aiSettings,'provider','gemini')}><option value="gemini">Gemini</option><option value="openai-compatible">OpenAI-compatible</option></select></label><Field label="Model" name="model" initial={text(selected.aiSettings,'model','gemini-2.5-flash')} /><Field label="Base URL" name="baseUrl" initial={text(selected.aiSettings,'baseUrl')} /><Field label="Allowed user IDs (comma separated)" name="allowedUserIds" initial={csv(selected.aiSettings,'allowedUserIds')} /><Field label="Allowed channel IDs (comma separated)" name="allowedChannelIds" initial={csv(selected.aiSettings,'allowedChannelIds')} /><Field label="Excluded channel IDs (comma separated)" name="excludedChannelIds" initial={csv(selected.aiSettings,'excludedChannelIds')} /></div>
          <div className="owner-actions"><Toggle name="aiEnabled" label="Enable AI agent" initial={checked(selected.aiSettings,'enabled')} /><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button></div>
        </form>
        <div className="owner-leave-area">{confirmLeave ? <div className="owner-confirm"><p><strong>Leave {selected.guild.name}?</strong> The bot will immediately leave this server.</p><button type="button" className="btn btn-danger" disabled={saving} onClick={() => void leaveGuild()}>Confirm leave</button><button type="button" className="btn" disabled={saving} onClick={() => setConfirmLeave(false)}>Cancel</button></div> : <button className="btn btn-danger" disabled={saving} onClick={() => setConfirmLeave(true)}>Remove bot from server…</button>}</div>
      </>}</section>
    </section>
  </main>;
}

function Field({ label, name, initial, type = 'text' }: { label: string; name: string; initial: string; type?: string }) {
  return <label className="owner-field"><span>{label}</span><input key={`${name}-${initial}`} className="input" name={name} type={type} defaultValue={initial} /></label>;
}
function Toggle({ name, label, initial }: { name: string; label: string; initial: boolean }) {
  return <label className="owner-toggle"><input key={`${name}-${initial}`} type="checkbox" name={name} defaultChecked={initial} /><span>{label}</span></label>;
}
