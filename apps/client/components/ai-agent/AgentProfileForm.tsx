import React from 'react';
import {
  AgentProfile,
  AgentToolCatalogItem,
  AiSettings,
  KeyDraft,
  isAdminProfile,
  usesBaselineFitFallback,
} from '../../lib/ai-agent';
import {
  AgentChannelAccess,
  AgentImages,
  AgentMemberTokens,
  AgentRoleQuotas,
  AgentToolCatalog,
  NumberField,
} from './AgentSections';

export type AgentProfileFormProps = {
  profile: AgentProfile;
  tab: 'config' | 'access' | 'images';
  settings: AiSettings;
  keys: KeyDraft;
  channels: { id: string; name: string; everyoneVisible?: boolean }[];
  otherProfileChannelIds?: string[];
  members: { id: string; displayName: string; username: string; avatarUrl?: string }[];
  roles: { id: string; name: string }[];
  tools: AgentToolCatalogItem[];
  readOnly?: boolean;
  permissionNotice?: string;
  saving?: boolean;
  dirty?: boolean;
  notice?: string;
  query?: string;
  onQueryChange?: (query: string) => void;
  onChange: (settings: AiSettings) => void;
  onKeysChange: (patch: Partial<KeyDraft>) => void;
  onSubmit?: (event: React.FormEvent) => void;
};

export function AgentProfileForm({
  profile,
  tab,
  settings,
  keys,
  channels,
  otherProfileChannelIds = [],
  members,
  roles,
  tools,
  readOnly = false,
  permissionNotice,
  saving = false,
  dirty = false,
  notice = '',
  query = '',
  onQueryChange,
  onChange,
  onKeysChange,
  onSubmit,
}: AgentProfileFormProps) {
  const admin = profile === 'ADMIN' || isAdminProfile(settings);
  const profileLabel = admin ? 'Agent Admin (ADMIN)' : 'Agent Umum (PUBLIC)';
  const fallbackWarning = !admin && usesBaselineFitFallback(settings);

  return (
    <form onSubmit={onSubmit}>
      {permissionNotice && (
        <div className="dashboard-notice" role="alert">
          {permissionNotice}
        </div>
      )}
      <fieldset disabled={saving || readOnly} className="min-w-0">
        {tab === 'config' ? (
          <div className="space-y-6">
            <section className="dashboard-section max-w-3xl">
              <h2>Provider and model · {profileLabel}</h2>
              <p className="mb-4 text-[var(--muted)]">
                {admin
                  ? 'Administrative profile for server management and moderation (/admin-ai and assigned staff channels). Slash command responses are always ephemeral.'
                  : 'Public member profile (/ai and assigned member channels) with natural conversational style and strict read-only public safety boundaries.'}
              </p>
              <label className="dashboard-toggle">
                <span>Enable {profileLabel}</span>
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(event) => onChange({ ...settings, enabled: event.target.checked })}
                />
              </label>
              <div className="dashboard-grid mt-5">
                <label className="dashboard-field">
                  <span>Provider</span>
                  <select
                    className="input"
                    value={settings.provider}
                    onChange={(event) => onChange({ ...settings, provider: event.target.value })}
                  >
                    <option value="gemini">Google Gemini</option>
                    <option value="openai-compatible">OpenAI-compatible</option>
                  </select>
                </label>
                <label className="dashboard-field">
                  <span>Model</span>
                  <input
                    className="input"
                    required
                    maxLength={120}
                    value={settings.model}
                    placeholder="gemini-2.5-flash"
                    onChange={(event) => onChange({ ...settings, model: event.target.value })}
                  />
                </label>
              </div>
              {settings.provider === 'openai-compatible' && (
                <label className="dashboard-field">
                  <span>API base URL</span>
                  <input
                    className="input"
                    type="url"
                    maxLength={500}
                    value={settings.baseUrl || ''}
                    onChange={(event) => onChange({ ...settings, baseUrl: event.target.value || null })}
                  />
                </label>
              )}
              {fallbackWarning && (
                <p role="note" className="my-3 text-[var(--muted)]">
                  Baseline token estimate fallback: this OpenAI-compatible model uses conservative character-based estimation for pre-dispatch context fitting when exact tokenizer metadata is unavailable.
                </p>
              )}
              <div className="dashboard-grid mt-5">
                <NumberField
                  label="Max output tokens / call (128–8,192)"
                  value={settings.maxOutputTokens}
                  min={128}
                  max={8192}
                  onChange={(value) => onChange({ ...settings, maxOutputTokens: value })}
                />
                {admin ? (
                  <div className="dashboard-field">
                    <span>Token quota mode</span>
                    <p role="note" className="text-[var(--muted)]">
                      Unlimited — usage tracked, no NIO token quota
                    </p>
                  </div>
                ) : (
                  <NumberField
                    label="Max tokens / run (1,024–262,144)"
                    value={settings.maxRunTokens ?? 32768}
                    min={1024}
                    max={262144}
                    onChange={(value) => onChange({ ...settings, maxRunTokens: value })}
                  />
                )}
              </div>
              <div className="dashboard-grid mt-5">
                <NumberField
                  label="Conversation retention days (1–90)"
                  value={settings.messageRetentionDays ?? 30}
                  min={1}
                  max={90}
                  onChange={(value) => onChange({ ...settings, messageRetentionDays: value })}
                />
              </div>
              <label className="dashboard-field mt-4">
                <span>Custom system instructions (optional, appended before immutable server safety rules)</span>
                <textarea
                  className="input"
                  rows={4}
                  maxLength={32000}
                  value={settings.systemPrompt || ''}
                  placeholder={
                    admin
                      ? 'Optional instructions for administrative analysis and moderation workflows…'
                      : 'Optional tone or community context for public conversations…'
                  }
                  onChange={(event) => onChange({ ...settings, systemPrompt: event.target.value || null })}
                />
              </label>
              <label className="dashboard-field mt-4">
                <span>API key ({settings.hasCredential ? 'saved' : 'not configured'})</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={keys.apiKey}
                  onChange={(event) =>
                    onKeysChange({
                      apiKey: event.target.value,
                      ...(event.target.value ? { clearApiKey: false } : {}),
                    })
                  }
                />
                <small>Credentials are encrypted per profile and never displayed again.</small>
              </label>
              {settings.hasCredential && (
                <label className="dashboard-toggle">
                  <span>Remove saved API key</span>
                  <input
                    type="checkbox"
                    checked={keys.clearApiKey}
                    onChange={(event) =>
                      onKeysChange({
                        clearApiKey: event.target.checked,
                        ...(event.target.checked ? { apiKey: '' } : {}),
                      })
                    }
                  />
                </label>
              )}
            </section>
            <AgentToolCatalog settings={settings} tools={tools} onChange={onChange} />
          </div>
        ) : tab === 'images' ? (
          <AgentImages
            settings={settings}
            onChange={onChange}
            imageApiKey={keys.imageApiKey}
            clearImageApiKey={keys.clearImageApiKey}
            onKey={(value) =>
              onKeysChange({
                imageApiKey: value,
                ...(value ? { clearImageApiKey: false } : {}),
              })
            }
            onClear={(value) =>
              onKeysChange({
                clearImageApiKey: value,
                ...(value ? { imageApiKey: '' } : {}),
              })
            }
          />
        ) : (
          <div className="space-y-6">
            <AgentRoleQuotas settings={settings} roles={roles} onChange={onChange} />
            <AgentChannelAccess
              settings={settings}
              channels={channels}
              otherProfileChannelIds={otherProfileChannelIds}
              onChange={onChange}
            />
            {!admin && (
              <section className="dashboard-section">
                <h2>Personal token quotas</h2>
                <p className="mb-3 text-[var(--muted)]">
                  Choose Follow role, a custom daily token limit, or Unlimited per member. Personal settings override role token quotas. Server and per-run caps still apply; image access still follows roles.
                </p>
                <label className="dashboard-field mt-4">
                  <span>Search members</span>
                  <input
                    className="input"
                    type="search"
                    value={query}
                    onChange={(event) => onQueryChange?.(event.target.value)}
                  />
                </label>
                <div className="max-h-96 overflow-y-auto">
                  {members
                    .filter((member) =>
                      `${member.displayName} ${member.username} ${member.id}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((member) => (
                      <AgentMemberTokens
                        key={member.id}
                        settings={settings}
                        onChange={onChange}
                        userId={member.id}
                        name={`${member.displayName} (@${member.username})`}
                      />
                    ))}
                </div>
                {(settings.userTokenRules ?? [])
                  .filter((rule) => !members.some((member) => member.id === rule.userId))
                  .map((rule) => (
                    <AgentMemberTokens
                      key={rule.userId}
                      settings={settings}
                      onChange={onChange}
                      userId={rule.userId}
                      name={`Unavailable member (${rule.userId})`}
                    />
                  ))}
              </section>
            )}
          </div>
        )}
      </fieldset>
      <div className="dashboard-actions">
        <button type="submit" className="btn btn-primary" disabled={saving || readOnly || !dirty}>
          {saving ? `Saving ${profile}…` : `Save ${profile} changes`}
        </button>
        <span role="status">{notice || (dirty ? `Unsaved ${profile} changes` : `No unsaved ${profile} changes`)}</span>
      </div>
    </form>
  );
}
