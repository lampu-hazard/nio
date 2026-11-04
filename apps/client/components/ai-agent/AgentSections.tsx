import React from 'react';
import { AiSettings, QuotaPage, RoleRule, quotaText } from '../../lib/ai-agent';
type Edit = { settings: AiSettings; onChange: (settings: AiSettings) => void };
export function AgentRoleQuotas({ settings, roles, onChange }: Edit & { roles: { id: string; name: string }[] }) {
  const update = (index: number, patch: Partial<RoleRule>) => onChange({ ...settings, roleRules: settings.roleRules.map((rule, i) => i === index ? { ...rule, ...patch } : rule) });
  return <section className="dashboard-section"><h2>Access & role quotas</h2>
    <label className="dashboard-field"><span>Access mode</span><select className="input" value={settings.accessMode} onChange={e => onChange({ ...settings, accessMode: e.target.value as AiSettings['accessMode'], ...(e.target.value === 'LEGACY_USERS' ? { imageEnabled: false } : {}) })}><option value="ROLE_QUOTAS">Role quotas</option><option value="LEGACY_USERS">Legacy users</option></select></label>
    {settings.accessMode === 'LEGACY_USERS' ? <p role="note">Legacy mode uses the member allowlist below. Daily quota protection and images are disabled.</p> : <>
    <p className="mb-4 text-[var(--muted)]">Each member receives the highest matching allowance for each capability, never the sum. Daily quotas reset at 00:00 UTC. Owners and administrators have no automatic bypass.</p>
    <div className="dashboard-grid"><NumberField label="Server tokens / day" value={settings.dailyGuildTokenLimit} min={1} max={1000000000} onChange={value => onChange({ ...settings, dailyGuildTokenLimit: value })} /><NumberField label="Server images / day" value={settings.dailyGuildImageLimit} min={0} max={10000} onChange={value => onChange({ ...settings, dailyGuildImageLimit: value })} /></div>
    {settings.roleRules.map((rule, index) => <fieldset key={rule.roleId} className="mt-5 border border-[var(--border)] p-4"><legend>{roles.find(role => role.id === rule.roleId)?.name || `Unavailable role (${rule.roleId})`}</legend>
      <label className="dashboard-toggle"><span>Allow chat</span><input type="checkbox" checked={rule.chatEnabled} onChange={e => update(index, { chatEnabled: e.target.checked, ...(e.target.checked && !rule.dailyTokenLimit ? { dailyTokenLimit: 10000 } : {}) })} /></label>
      <label className="dashboard-toggle"><span>Use maximum role allowance (100,000,000 tokens / day)</span><input type="checkbox" disabled={!rule.chatEnabled} checked={rule.chatEnabled && rule.dailyTokenLimit === 100000000} onChange={e => update(index, { dailyTokenLimit: e.target.checked ? 100000000 : 10000 })} /></label>
      <NumberField label="Member tokens / day" value={rule.dailyTokenLimit} min={rule.chatEnabled ? 1 : 0} max={100000000} onChange={value => update(index, { dailyTokenLimit: value })} />
      <label className="dashboard-toggle"><span>Allow images</span><input type="checkbox" checked={rule.imageEnabled} onChange={e => update(index, { imageEnabled: e.target.checked, ...(e.target.checked && !rule.dailyImageLimit ? { dailyImageLimit: 5 } : {}) })} /></label>
      <label className="dashboard-toggle"><span>Use maximum role allowance (1,000 images / day)</span><input type="checkbox" disabled={!rule.imageEnabled} checked={rule.imageEnabled && rule.dailyImageLimit === 1000} onChange={e => update(index, { dailyImageLimit: e.target.checked ? 1000 : 5 })} /></label>
      <NumberField label="Member images / day" value={rule.dailyImageLimit} min={rule.imageEnabled ? 1 : 0} max={1000} onChange={value => update(index, { dailyImageLimit: value })} />
      <button type="button" className="btn mt-3" onClick={() => onChange({ ...settings, roleRules: settings.roleRules.filter((_, i) => i !== index) })}>Remove rule</button>
    </fieldset>)}
    {!settings.roleRules.length && <p className="my-4">No roles granted. Add a role rule or a personal token rule to grant chat access. Images require a role rule.</p>}
    <label className="dashboard-field mt-4"><span>Add role rule ({settings.roleRules.length}/100)</span><select className="input" value="" disabled={settings.roleRules.length >= 100} onChange={e => { if (e.target.value) onChange({ ...settings, roleRules: [...settings.roleRules, { roleId: e.target.value, chatEnabled: true, imageEnabled: false, dailyTokenLimit: 10000, dailyImageLimit: 0 }] }); }}><option value="">Choose a role</option>{roles.filter(role => !settings.roleRules.some(rule => rule.roleId === role.id)).map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></label>
    </>}
  </section>;
}
export function AgentMemberTokens({ settings, onChange, userId, name }: Edit & { userId: string; name: string }) {
  const rules = settings.userTokenRules ?? [];
  const rule = rules.find(rule => rule.userId === userId);
  const mode = !rule ? 'role' : rule.dailyTokenLimit === null ? 'unlimited' : 'custom';
  const setLimit = (dailyTokenLimit: number | null | undefined) => onChange({ ...settings,
    userTokenRules: [...rules.filter(rule => rule.userId !== userId), ...(dailyTokenLimit === undefined ? [] : [{ userId, dailyTokenLimit }])],
  });
  return <div className="my-3 border-b border-[var(--border)] pb-3">
    <label className="dashboard-field"><span>{name}</span><select className="input" aria-label={`Token policy for ${name}`} value={mode} disabled={!rule && rules.length >= 500}
      onChange={event => setLimit(event.target.value === 'role' ? undefined : event.target.value === 'unlimited' ? null : 10000)}>
      <option value="role">Follow role</option><option value="custom">Custom daily limit</option><option value="unlimited">Unlimited</option>
    </select></label>
    {mode === 'custom' && <NumberField label={`Tokens / day for ${name}`} value={rule!.dailyTokenLimit!} min={1} max={100000000} onChange={setLimit} />}
  </div>;
}
export function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return <label className="dashboard-field"><span>{label}</span><input className="input" type="number" required step={1} min={min} max={max} value={Number.isNaN(value) ? '' : value} onChange={e => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))} /></label>;
}
export function AgentImages({ settings, onChange, imageApiKey, clearImageApiKey, onKey, onClear }: Edit & { imageApiKey: string; clearImageApiKey: boolean; onKey: (value: string) => void; onClear: (value: boolean) => void }) {
  return <section className="dashboard-section max-w-3xl"><h2>Image generation</h2><p>Use an explicit command for one 1024 × 1024 image. Images use a separate daily count, not chat tokens.</p>
    <pre className="my-4 overflow-x-auto">{'@nio gambar <prompt>\n@nio buat gambar <prompt>\n@nio generate image <prompt>'}</pre>
    {settings.accessMode !== 'ROLE_QUOTAS' && <p role="note">Select Role quotas in Access & quotas before enabling images.</p>}
    <label className="dashboard-toggle"><span>Enable image generation</span><input type="checkbox" disabled={settings.accessMode !== 'ROLE_QUOTAS'} checked={settings.imageEnabled} onChange={e => onChange({ ...settings, imageEnabled: e.target.checked })} /></label>
    <label className="dashboard-field"><span>Image API base URL (public HTTPS only)</span><input className="input" type="url" maxLength={500} value={settings.imageBaseUrl || ''} onChange={e => onChange({ ...settings, imageBaseUrl: e.target.value || null })} placeholder="https://provider.example/v1" /></label>
    <label className="dashboard-field"><span>Image model</span><input className="input" maxLength={120} value={settings.imageModel || ''} onChange={e => onChange({ ...settings, imageModel: e.target.value || null })} /></label>
    <label className="dashboard-field"><span>Image credentials</span><select className="input" value={settings.imageCredentialSource} onChange={e => onChange({ ...settings, imageCredentialSource: e.target.value as AiSettings['imageCredentialSource'] })}><option value="SEPARATE">Separate image key</option><option value="CHAT">Reuse saved chat key (same origin only)</option></select></label>
    <p className="text-[var(--muted)]">Chat key reuse requires an OpenAI-compatible provider and exactly the same API origin. Saving never generates a paid test image.</p>
    {settings.imageCredentialSource === 'SEPARATE' && <><label className="dashboard-field"><span>Image key ({settings.hasImageCredential ? 'saved' : 'not configured'})</span><input className="input" type="password" autoComplete="new-password" value={imageApiKey} onChange={e => onKey(e.target.value)} /></label>{settings.hasImageCredential && <label className="dashboard-toggle"><span>Remove saved image key</span><input type="checkbox" checked={clearImageApiKey} onChange={e => onClear(e.target.checked)} /></label>}</>}
  </section>;
}
export function AgentQuotaUsage({ page, onNext, onRefresh }: { page: QuotaPage; onNext: () => void; onRefresh: () => void }) {
  return <section className="dashboard-section"><h2>Today’s quota ledger</h2><p>Reset: {page.resetAt} (UTC). Local: {new Date(page.resetAt).toLocaleString()}. Committed and reserved amounts both reduce remaining allowance.</p>
    {page.accessMode !== 'ROLE_QUOTAS' && <p role="note">Legacy mode has no daily quota protection. Counters are retained; remaining allowance is unavailable.</p>}
    <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left"><thead><tr>{['Member / server', 'Chat tokens', 'Images', 'Accounting sources'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{[{ ...page.guild, userId: 'Server total' }, ...page.members].map(row => <tr key={row.userId}><th className="p-3 font-normal">{row.userId}{row.allowanceStatus === 'UNAVAILABLE' && <small className="block">Current allowance unavailable</small>}</th><td className="p-3">{quotaText(row.tokens)}</td><td className="p-3">{quotaText(row.images)}</td><td className="p-3">{Object.entries(row.usageSources).map(([source, count]) => `${source}: ${count}`).join(', ') || 'No finalized attempts'}<br />Overruns: {row.overruns}</td></tr>)}</tbody></table></div>
    <p className="my-3 text-[var(--muted)]">REPORTED: provider usage; ESTIMATED: conservative estimate; UNCERTAIN: a dispatched attempt may have been billed. Image counts measure attempts, not guaranteed deliveries.</p>
    <div className="flex gap-3"><button type="button" className="btn" onClick={onRefresh}>Refresh from first page</button>{page.nextCursor && <button type="button" className="btn" onClick={onNext}>Next page</button>}</div>
  </section>;
}
