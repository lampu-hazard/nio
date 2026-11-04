import React from 'react';
import {
  AgentProfile,
  AgentToolCatalogItem,
  AiSettings,
  QuotaPage,
  RoleRule,
  isAdminProfile,
  quotaText,
} from '../../lib/ai-agent';

type Edit = { settings: AiSettings; onChange: (settings: AiSettings) => void };

export function AgentRoleQuotas({ settings, roles, onChange }: Edit & { roles: { id: string; name: string }[] }) {
  const admin = isAdminProfile(settings);
  const update = (index: number, patch: Partial<RoleRule>) =>
    onChange({
      ...settings,
      roleRules: settings.roleRules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)),
    });

  return (
    <section className="dashboard-section">
      <h2>Access &amp; role quotas</h2>
      <p className="mb-4 text-[var(--muted)]">
        Each member receives the highest matching allowance for each capability, never the sum. Daily quotas reset at 00:00 UTC. Owners and administrators have no automatic bypass.
      </p>
      {admin ? (
        <p role="note" className="mb-4">
          Chat token policy: <strong>Unlimited — usage tracked, no NIO token quota</strong>. Provider context/rate limits, per-call output caps, and finite daily image quotas remain enforced.
        </p>
      ) : null}
      {settings.allowedUserIds?.length > 0 && (
        <p role="note" className="mb-4 text-[var(--muted)]">
          Legacy member allowlist entries ({settings.allowedUserIds.length}) are preserved as read-only migration data. Active profile access uses explicit channels and role rules below.
        </p>
      )}
      <div className="dashboard-grid">
        {!admin && (
          <NumberField
            label="Server tokens / day"
            value={settings.dailyGuildTokenLimit ?? 1000000}
            min={1}
            max={1000000000}
            onChange={(value) => onChange({ ...settings, dailyGuildTokenLimit: value })}
          />
        )}
        <NumberField
          label="Server images / day"
          value={settings.dailyGuildImageLimit}
          min={0}
          max={10000}
          onChange={(value) => onChange({ ...settings, dailyGuildImageLimit: value })}
        />
      </div>
      {settings.roleRules.map((rule, index) => (
        <fieldset key={rule.roleId} className="mt-5 border border-[var(--border)] p-4">
          <legend>{roles.find((role) => role.id === rule.roleId)?.name || `Unavailable role (${rule.roleId})`}</legend>
          <label className="dashboard-toggle">
            <span>Allow chat</span>
            <input
              type="checkbox"
              checked={rule.chatEnabled}
              onChange={(e) =>
                update(index, {
                  chatEnabled: e.target.checked,
                  ...(!admin && e.target.checked && !rule.dailyTokenLimit ? { dailyTokenLimit: 10000 } : {}),
                  ...(admin ? { dailyTokenLimit: null } : {}),
                })
              }
            />
          </label>
          {!admin && (
            <>
              <label className="dashboard-toggle">
                <span>Use maximum role allowance (100,000,000 tokens / day)</span>
                <input
                  type="checkbox"
                  disabled={!rule.chatEnabled}
                  checked={rule.chatEnabled && rule.dailyTokenLimit === 100000000}
                  onChange={(e) => update(index, { dailyTokenLimit: e.target.checked ? 100000000 : 10000 })}
                />
              </label>
              <NumberField
                label="Member tokens / day"
                value={rule.dailyTokenLimit ?? 0}
                min={rule.chatEnabled ? 1 : 0}
                max={100000000}
                onChange={(value) => update(index, { dailyTokenLimit: value })}
              />
            </>
          )}
          <label className="dashboard-toggle">
            <span>Allow images</span>
            <input
              type="checkbox"
              checked={rule.imageEnabled}
              onChange={(e) =>
                update(index, {
                  imageEnabled: e.target.checked,
                  ...(e.target.checked && !rule.dailyImageLimit ? { dailyImageLimit: 5 } : {}),
                })
              }
            />
          </label>
          <label className="dashboard-toggle">
            <span>Use maximum role allowance (1,000 images / day)</span>
            <input
              type="checkbox"
              disabled={!rule.imageEnabled}
              checked={rule.imageEnabled && rule.dailyImageLimit === 1000}
              onChange={(e) => update(index, { dailyImageLimit: e.target.checked ? 1000 : 5 })}
            />
          </label>
          <NumberField
            label="Member images / day"
            value={rule.dailyImageLimit}
            min={rule.imageEnabled ? 1 : 0}
            max={1000}
            onChange={(value) => update(index, { dailyImageLimit: value })}
          />
          <button
            type="button"
            className="btn mt-3"
            onClick={() => onChange({ ...settings, roleRules: settings.roleRules.filter((_, i) => i !== index) })}
          >
            Remove rule
          </button>
        </fieldset>
      ))}
      {!settings.roleRules.length && (
        <p className="my-4">
          {admin
            ? 'No roles granted. Add an admin/moderator role rule to grant chat or image access.'
            : 'No roles granted. Add a role rule or a personal token rule to grant chat access. Images require a role rule.'}
        </p>
      )}
      <label className="dashboard-field mt-4">
        <span>Add role rule ({settings.roleRules.length}/100)</span>
        <select
          className="input"
          value=""
          disabled={settings.roleRules.length >= 100}
          onChange={(e) => {
            if (e.target.value) {
              onChange({
                ...settings,
                roleRules: [
                  ...settings.roleRules,
                  {
                    roleId: e.target.value,
                    chatEnabled: true,
                    imageEnabled: false,
                    dailyTokenLimit: admin ? null : 10000,
                    dailyImageLimit: 0,
                  },
                ],
              });
            }
          }}
        >
          <option value="">Choose a role</option>
          {roles
            .filter((role) => !settings.roleRules.some((rule) => rule.roleId === role.id))
            .map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
        </select>
      </label>
    </section>
  );
}

export function AgentMemberTokens({ settings, onChange, userId, name }: Edit & { userId: string; name: string }) {
  const rules = settings.userTokenRules ?? [];
  const rule = rules.find((rule) => rule.userId === userId);
  const mode = !rule ? 'role' : rule.dailyTokenLimit === null ? 'unlimited' : 'custom';
  const setLimit = (dailyTokenLimit: number | null | undefined) =>
    onChange({
      ...settings,
      userTokenRules: [
        ...rules.filter((rule) => rule.userId !== userId),
        ...(dailyTokenLimit === undefined ? [] : [{ userId, dailyTokenLimit }]),
      ],
    });
  return (
    <div className="my-3 border-b border-[var(--border)] pb-3">
      <label className="dashboard-field">
        <span>{name}</span>
        <select
          className="input"
          aria-label={`Token policy for ${name}`}
          value={mode}
          disabled={!rule && rules.length >= 500}
          onChange={(event) =>
            setLimit(event.target.value === 'role' ? undefined : event.target.value === 'unlimited' ? null : 10000)
          }
        >
          <option value="role">Follow role</option>
          <option value="custom">Custom daily limit</option>
          <option value="unlimited">Unlimited</option>
        </select>
      </label>
      {mode === 'custom' && (
        <NumberField
          label={`Tokens / day for ${name}`}
          value={rule!.dailyTokenLimit!}
          min={1}
          max={100000000}
          onChange={setLimit}
        />
      )}
    </div>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="dashboard-field">
      <span>{label}</span>
      <input
        className="input"
        type="number"
        required
        step={1}
        min={min}
        max={max}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
      />
    </label>
  );
}

export function AgentToolCatalog({
  settings,
  tools,
  onChange,
}: Edit & { tools: AgentToolCatalogItem[] }) {
  const selected = settings.allowedToolIds ?? [];
  const unavailableSelected = tools.filter((tool) => !tool.available && selected.includes(tool.id));

  const toggleTool = (tool: AgentToolCatalogItem, checked: boolean) => {
    if (!tool.available) return;
    const next = checked
      ? Array.from(new Set([...selected.filter((id) => tools.every((t) => t.id !== id || t.available)), tool.id]))
      : selected.filter((id) => id !== tool.id);
    onChange({ ...settings, allowedToolIds: next });
  };

  return (
    <section className="dashboard-section max-w-3xl">
      <h2>Allowed tools</h2>
      <p className="mb-3 text-[var(--muted)]">
        Only explicitly selected and currently available tools are exposed to this profile at runtime.
      </p>
      {unavailableSelected.length > 0 && (
        <p role="note" className="mb-3">
          Warning: One or more previously selected tools ({unavailableSelected.map((t) => t.name).join(', ')}) are unavailable for this profile and remain inactive. Unavailable tools are never silently enabled.
        </p>
      )}
      {!tools.length ? (
        <p className="text-[var(--muted)]">No tools registered in catalog for this profile.</p>
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => {
            const isChecked = tool.available && selected.includes(tool.id);
            return (
              <label key={tool.id} className="dashboard-toggle">
                <span>
                  <strong>{tool.name}</strong> <small>({tool.source} · {tool.mode})</small> — {tool.description}
                  {!tool.available && (
                    <small className="block text-[var(--muted)]">
                      Unavailable: {tool.unavailableReason || 'Not permitted for this profile.'}
                    </small>
                  )}
                </span>
                <input
                  type="checkbox"
                  disabled={!tool.available}
                  checked={isChecked}
                  onChange={(e) => toggleTool(tool, e.target.checked)}
                />
              </label>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AgentChannelAccess({
  settings,
  channels,
  otherProfileChannelIds = [],
  onChange,
}: Edit & {
  channels: { id: string; name: string; everyoneVisible?: boolean }[];
  otherProfileChannelIds?: string[];
}) {
  const admin = isAdminProfile(settings);
  const otherLabel: AgentProfile = admin ? 'PUBLIC' : 'ADMIN';
  const adminEveryoneChannelSelected =
    admin &&
    channels.some(
      (channel) => channel.everyoneVisible && settings.allowedChannelIds.includes(channel.id),
    );

  const toggleAllowed = (id: string) => {
    if (otherProfileChannelIds.includes(id)) return;
    const next = settings.allowedChannelIds.includes(id)
      ? settings.allowedChannelIds.filter((value) => value !== id && value !== '*')
      : [...settings.allowedChannelIds.filter((value) => value !== '*'), id];
    onChange({ ...settings, allowedChannelIds: next });
  };

  const toggleExcluded = (id: string) => {
    const next = settings.excludedChannelIds.includes('*')
      ? channels.map((channel) => channel.id).filter((value) => value !== id)
      : settings.excludedChannelIds.includes(id)
        ? settings.excludedChannelIds.filter((value) => value !== id)
        : [...settings.excludedChannelIds, id];
    onChange({ ...settings, excludedChannelIds: next });
  };

  const allAllowedChannels = [
    ...channels,
    ...settings.allowedChannelIds
      .filter((id) => id !== '*' && !channels.some((channel) => channel.id === id))
      .map((id) => ({ id, name: `Unavailable channel (${id})`, everyoneVisible: false })),
  ];

  const allExcludedChannels = [
    ...channels,
    ...settings.excludedChannelIds
      .filter((id) => id !== '*' && !channels.some((channel) => channel.id === id))
      .map((id) => ({ id, name: `Unavailable channel (${id})`, everyoneVisible: false })),
  ];

  return (
    <div className="dashboard-grid">
      <section className="dashboard-section">
        <h2>Allowed channels</h2>
        <p className="mb-4 text-[var(--muted)]">
          Automatic @nio mentions and replies only activate in channels explicitly assigned to this profile. A channel cannot belong to both PUBLIC and ADMIN.
        </p>
        {adminEveryoneChannelSelected && (
          <p role="note" className="mb-3">
            Warning: One or more selected ADMIN channels are visible to @everyone. Assign dedicated staff channels to prevent exposing administrative workflows in public channels.
          </p>
        )}
        {allAllowedChannels.map((channel) => {
          const assignedToOther = otherProfileChannelIds.includes(channel.id);
          return (
            <label key={channel.id} className="dashboard-toggle">
              <span className="break-all">
                {channel.name}
                {assignedToOther && <small className="block text-[var(--muted)]">Assigned to {otherLabel} profile</small>}
              </span>
              <input
                type="checkbox"
                disabled={assignedToOther && !settings.allowedChannelIds.includes(channel.id)}
                checked={settings.allowedChannelIds.includes(channel.id)}
                onChange={() => toggleAllowed(channel.id)}
              />
            </label>
          );
        })}
      </section>
      <section className="dashboard-section">
        <h2>Excluded channels</h2>
        <p className="mb-4 text-[var(--muted)]">
          Exclusions always override allowed channels and thread inheritance for this profile.
        </p>
        <label className="dashboard-toggle">
          <span>Exclude all channels</span>
          <input
            type="checkbox"
            checked={settings.excludedChannelIds.includes('*')}
            onChange={(event) => onChange({ ...settings, excludedChannelIds: event.target.checked ? ['*'] : [] })}
          />
        </label>
        {allExcludedChannels.map((channel) => (
          <label key={channel.id} className="dashboard-toggle">
            <span className="break-all">{channel.name}</span>
            <input
              type="checkbox"
              checked={settings.excludedChannelIds.includes('*') || settings.excludedChannelIds.includes(channel.id)}
              onChange={() => toggleExcluded(channel.id)}
            />
          </label>
        ))}
      </section>
    </div>
  );
}

export function AgentImages({
  settings,
  onChange,
  imageApiKey,
  clearImageApiKey,
  onKey,
  onClear,
}: Edit & {
  imageApiKey: string;
  clearImageApiKey: boolean;
  onKey: (value: string) => void;
  onClear: (value: boolean) => void;
}) {
  return (
    <section className="dashboard-section max-w-3xl">
      <h2>Image generation</h2>
      <p>
        Use an explicit command for one 1024 × 1024 image. Images use a separate finite daily count under Role quotas, not chat tokens.
      </p>
      <pre className="my-4 overflow-x-auto">{'@nio gambar <prompt>\n@nio buat gambar <prompt>\n@nio generate image <prompt>'}</pre>
      {settings.accessMode !== 'ROLE_QUOTAS' && (
        <p role="note">Select Role quotas in Access &amp; quotas before enabling images.</p>
      )}
      <label className="dashboard-toggle">
        <span>Enable image generation</span>
        <input
          type="checkbox"
          disabled={settings.accessMode !== 'ROLE_QUOTAS'}
          checked={settings.imageEnabled}
          onChange={(e) => onChange({ ...settings, imageEnabled: e.target.checked })}
        />
      </label>
      <label className="dashboard-field">
        <span>Image API base URL (public HTTPS only)</span>
        <input
          className="input"
          type="url"
          maxLength={500}
          value={settings.imageBaseUrl || ''}
          onChange={(e) => onChange({ ...settings, imageBaseUrl: e.target.value || null })}
          placeholder="https://provider.example/v1"
        />
      </label>
      <label className="dashboard-field">
        <span>Image model</span>
        <input
          className="input"
          maxLength={120}
          value={settings.imageModel || ''}
          onChange={(e) => onChange({ ...settings, imageModel: e.target.value || null })}
        />
      </label>
      <label className="dashboard-field">
        <span>Image credentials</span>
        <select
          className="input"
          value={settings.imageCredentialSource}
          onChange={(e) =>
            onChange({ ...settings, imageCredentialSource: e.target.value as AiSettings['imageCredentialSource'] })
          }
        >
          <option value="SEPARATE">Separate image key</option>
          <option value="CHAT">Reuse saved chat key (same origin only)</option>
        </select>
      </label>
      <p className="text-[var(--muted)]">
        Chat key reuse requires an OpenAI-compatible provider and exactly the same API origin. Saving never generates a paid test image.
      </p>
      {settings.imageCredentialSource === 'SEPARATE' && (
        <>
          <label className="dashboard-field">
            <span>Image key ({settings.hasImageCredential ? 'saved' : 'not configured'})</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={imageApiKey}
              onChange={(e) => onKey(e.target.value)}
            />
          </label>
          {settings.hasImageCredential && (
            <label className="dashboard-toggle">
              <span>Remove saved image key</span>
              <input type="checkbox" checked={clearImageApiKey} onChange={(e) => onClear(e.target.checked)} />
            </label>
          )}
        </>
      )}
    </section>
  );
}

export function AgentQuotaUsage({
  page,
  onNext,
  onRefresh,
}: {
  page: QuotaPage;
  onNext: () => void;
  onRefresh: () => void;
}) {
  const effectiveProfile: AgentProfile =
    page.profile === 'ADMIN' || page.tokenQuotaMode === 'UNLIMITED' ? 'ADMIN' : 'PUBLIC';

  return (
    <section className="dashboard-section">
      <h2>Today’s quota ledger ({effectiveProfile})</h2>
      <p>
        Reset: {page.resetAt} (UTC). Local: {new Date(page.resetAt).toLocaleString()}. Today’s ledger tracks current UTC-day reservations and finalized attempts separately from multi-day historical interaction logs.
      </p>
      {page.accessMode !== 'ROLE_QUOTAS' && (
        <p role="note">Legacy mode has no daily quota protection. Counters are retained; remaining allowance is unavailable.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr>
              {['Member / server', 'Chat tokens', 'Images', 'Accounting sources'].map((label) => (
                <th className="p-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[{ ...page.guild, userId: 'Server total' }, ...page.members].map((row) => {
              const sourceSummary =
                Object.entries(row.usageSources)
                  .map(([source, count]) => {
                    const amount = row.usageSourceAmounts?.[source];
                    return amount ? `${source}: ${count} (${amount} tokens)` : `${source}: ${count}`;
                  })
                  .join(', ') || 'No finalized attempts';
              return (
                <tr key={row.userId}>
                  <th className="p-3 font-normal">
                    {row.userId}
                    {row.allowanceStatus === 'UNAVAILABLE' && (
                      <small className="block">Current allowance unavailable</small>
                    )}
                  </th>
                  <td className="p-3">{quotaText(row.tokens, effectiveProfile)}</td>
                  <td className="p-3">{quotaText(row.images)}</td>
                  <td className="p-3">
                    {sourceSummary}
                    <br />
                    Overruns: {row.overruns}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="my-3 text-[var(--muted)]">
        REPORTED: provider-reported usage; ESTIMATED: conservative tokenizer/fallback estimate (not provider-reported actual usage); UNCERTAIN: a dispatched attempt may have been billed (not provider-reported actual usage). Image counts measure attempts, not guaranteed deliveries.
      </p>
      <div className="flex gap-3">
        <button type="button" className="btn" onClick={onRefresh}>
          Refresh from first page
        </button>
        {page.nextCursor && (
          <button type="button" className="btn" onClick={onNext}>
            Next page
          </button>
        )}
      </div>
    </section>
  );
}
