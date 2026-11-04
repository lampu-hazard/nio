'use client';

import { use, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import {
  AgentProfile,
  AgentToolCatalogItem,
  AiSettings,
  QuotaPage,
  profileQuotasUrl,
  profileSettingsUrl,
  profileToolsUrl,
  profileUsageUrl,
  settingsPayload,
  validateSettings,
} from '@/lib/ai-agent';
import {
  applyProfileLoadResponse,
  applyProfileSaveFailure,
  applyProfileSaveSuccess,
  beginProfileRequest,
  createProfileDrafts,
  updateProfileKeys,
  updateProfileSettings,
} from '@/lib/ai-agent-profile-state';
import { AgentQuotaUsage } from '@/components/ai-agent/AgentSections';
import { AgentProfileForm } from '@/components/ai-agent/AgentProfileForm';

type Channel = { id: string; name: string; everyoneVisible?: boolean };
type Member = { id: string; displayName: string; username: string; avatarUrl: string };
type Settings = AiSettings;
type Usage = {
  userId: string;
  displayName?: string;
  username?: string;
  avatarUrl?: string | null;
  requests: number;
  failures: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

const PROFILES: { key: AgentProfile; label: string }[] = [
  { key: 'PUBLIC', label: 'Agent Umum (PUBLIC)' },
  { key: 'ADMIN', label: 'Agent Admin (ADMIN)' },
];

export default function AiAgentPage({ params }: { params: Promise<{ guildId: string }> }) {
  const { guildId } = use(params);
  return <AgentSettings key={guildId} guildId={guildId} />;
}

function AgentSettings({ guildId }: { guildId: string }) {
  const [profile, setProfile] = useState<AgentProfile>('PUBLIC');
  const [tab, setTab] = useState<'config' | 'access' | 'images' | 'usage'>('config');
  const [profileState, setProfileState] = useState(createProfileDrafts);
  const stateRef = useRef(profileState);
  stateRef.current = profileState;

  const [toolsByProfile, setToolsByProfile] = useState<Record<AgentProfile, AgentToolCatalogItem[]>>({
    PUBLIC: [],
    ADMIN: [],
  });
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
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
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingByProfile, setSavingByProfile] = useState<Record<AgentProfile, boolean>>({
    PUBLIC: false,
    ADMIN: false,
  });
  const [errorByProfile, setErrorByProfile] = useState<Record<AgentProfile, string>>({
    PUBLIC: '',
    ADMIN: '',
  });
  const [noticeByProfile, setNoticeByProfile] = useState<Record<AgentProfile, string>>({
    PUBLIC: '',
    ADMIN: '',
  });
  const [adminReadOnlyNotice, setAdminReadOnlyNotice] = useState('');
  const pendingByProfile = useRef<Record<AgentProfile, boolean>>({ PUBLIC: false, ADMIN: false });
  const lifetime = useRef<AbortController | null>(null);

  const anyDirty = profileState.drafts.PUBLIC.dirty || profileState.drafts.ADMIN.dirty;
  useUnsavedChanges(anyDirty);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    setLoading(true);
    setErrorByProfile({ PUBLIC: '', ADMIN: '' });

    let nextState = stateRef.current;
    const pubReq = beginProfileRequest(nextState, 'PUBLIC');
    nextState = pubReq.state;
    const admReq = beginProfileRequest(nextState, 'ADMIN');
    nextState = admReq.state;
    stateRef.current = nextState;
    setProfileState(nextState);

    void Promise.all([
      api<{ settings: Settings }>(profileSettingsUrl(guildId, 'PUBLIC'), { signal: controller.signal }),
      api<{ settings: Settings }>(profileSettingsUrl(guildId, 'ADMIN'), { signal: controller.signal }),
      api<{ tools: AgentToolCatalogItem[] }>(profileToolsUrl(guildId, 'PUBLIC'), { signal: controller.signal }).catch(
        () => ({ tools: [] }),
      ),
      api<{ tools: AgentToolCatalogItem[] }>(profileToolsUrl(guildId, 'ADMIN'), { signal: controller.signal }).catch(
        () => ({ tools: [] }),
      ),
      api<{ channels: Channel[] }>(`/guilds/${guildId}/channels`, { signal: controller.signal }),
      api<{ members: Member[] }>(`/guilds/${guildId}/members`, { signal: controller.signal }),
      api<{ roles: { id: string; name: string }[] }>(`/guilds/${guildId}/roles`, { signal: controller.signal }),
    ])
      .then(([pubConfig, admConfig, pubTools, admTools, channelData, memberData, roleData]) => {
        if (controller.signal.aborted) return;
        if (
          !pubConfig.settings
          || !admConfig.settings
          || !Array.isArray(channelData.channels)
          || !Array.isArray(memberData.members)
        ) {
          throw new Error('AI Agent data unavailable.');
        }
        setProfileState((current) => {
          const withPub = applyProfileLoadResponse(current, 'PUBLIC', pubReq.requestId, pubConfig.settings);
          return applyProfileLoadResponse(withPub, 'ADMIN', admReq.requestId, admConfig.settings);
        });
        setToolsByProfile({
          PUBLIC: Array.isArray(pubTools.tools) ? pubTools.tools : [],
          ADMIN: Array.isArray(admTools.tools) ? admTools.tools : [],
        });
        setChannels(channelData.channels);
        setMembers(memberData.members);
        setRoles([{ id: guildId, name: '@everyone (all members)' }, ...roleData.roles.filter((role) => role.id !== guildId)]);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          const msg = reason instanceof Error ? reason.message : 'Failed to load AI Agent settings.';
          setErrorByProfile({ PUBLIC: msg, ADMIN: msg });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [guildId, retry]);

  useEffect(() => {
    const controller = new AbortController();
    const targetProfile = profile;
    setUsage(null);
    setUsageError('');
    void api<{ usage: { users: Usage[] } }>(profileUsageUrl(guildId, targetProfile, days), {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setUsage(result.usage.users);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setUsageError(reason instanceof Error ? reason.message : 'Usage unavailable.');
        }
      });
    return () => controller.abort();
  }, [guildId, profile, days, usageRetry]);

  useEffect(() => {
    if (focusIssue) {
      sectionHeading.current?.focus();
      setFocusIssue(false);
    }
  }, [tab, focusIssue]);

  useEffect(() => {
    const controller = new AbortController();
    const targetProfile = profile;
    setQuota(null);
    setQuotaError('');
    void api<{ quotas: QuotaPage }>(profileQuotasUrl(guildId, targetProfile, quotaCursor), {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setQuota(result.quotas);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setQuotaError(reason instanceof Error ? reason.message : 'Quota ledger unavailable.');
        }
      });
    return () => controller.abort();
  }, [guildId, profile, quotaCursor, quotaRetry]);

  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api<{ members: Member[] }>(`/guilds/${guildId}/members?query=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) {
            setMembers((current) => [
              ...new Map([...current, ...result.members].map((member) => [member.id, member])).values(),
            ]);
          }
        })
        .catch((reason) => {
          if (!controller.signal.aborted) {
            setErrorByProfile((prev) => ({
              ...prev,
              [profile]: reason instanceof Error ? reason.message : 'Member search unavailable.',
            }));
          }
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [guildId, profile, query]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const targetProfile = profile;
    const activeDraft = stateRef.current.drafts[targetProfile];
    const otherProfile: AgentProfile = targetProfile === 'PUBLIC' ? 'ADMIN' : 'PUBLIC';
    const otherChannels = stateRef.current.drafts[otherProfile].settings?.allowedChannelIds ?? [];

    if (!activeDraft.settings || loading || pendingByProfile.current[targetProfile] || !activeDraft.dirty) return;
    const issue = validateSettings(activeDraft.settings, otherChannels);
    if (issue) {
      setTab(issue.section);
      setErrorByProfile((prev) => ({ ...prev, [targetProfile]: issue.message }));
      setFocusIssue(true);
      return;
    }

    pendingByProfile.current[targetProfile] = true;
    setSavingByProfile((prev) => ({ ...prev, [targetProfile]: true }));
    setErrorByProfile((prev) => ({ ...prev, [targetProfile]: '' }));
    setNoticeByProfile((prev) => ({ ...prev, [targetProfile]: '' }));

    const req = beginProfileRequest(stateRef.current, targetProfile);
    stateRef.current = req.state;
    setProfileState(req.state);

    try {
      const payload = settingsPayload(
        {
          ...activeDraft.settings,
          profile: targetProfile,
          model: activeDraft.settings.model.trim(),
          baseUrl: activeDraft.settings.provider === 'openai-compatible' ? activeDraft.settings.baseUrl : null,
        },
        activeDraft.keys,
      );
      const result = await api<{ settings: Settings }>(profileSettingsUrl(guildId, targetProfile), {
        method: 'PATCH',
        body: JSON.stringify(payload),
        signal: lifetime.current?.signal,
      });
      if (lifetime.current?.signal.aborted) return;
      if (!result.settings) throw new Error('AI Agent settings could not be saved.');

      setProfileState((current) => applyProfileSaveSuccess(current, targetProfile, req.requestId, result.settings));
      setNoticeByProfile((prev) => ({ ...prev, [targetProfile]: `${targetProfile} changes saved.` }));
      setQuotaCursor(null);
      setQuotaRetry((value) => value + 1);
    } catch (reason) {
      if (!lifetime.current?.signal.aborted) {
        const message = reason instanceof Error ? reason.message : 'Failed to save settings.';
        setProfileState((current) => applyProfileSaveFailure(current, targetProfile, req.requestId));
        setErrorByProfile((prev) => ({ ...prev, [targetProfile]: message }));
        if (targetProfile === 'ADMIN' && /guild management permission/i.test(message)) {
          setAdminReadOnlyNotice(
            'Current guild management permission (Server Owner, Administrator, or Manage Server) is required to configure the ADMIN profile. Server authorization remains authoritative.',
          );
        }
      }
    } finally {
      if (!lifetime.current?.signal.aborted) {
        pendingByProfile.current[targetProfile] = false;
        setSavingByProfile((prev) => ({ ...prev, [targetProfile]: false }));
      }
    }
  }

  const activeDraft = profileState.drafts[profile];
  const otherProfile: AgentProfile = profile === 'PUBLIC' ? 'ADMIN' : 'PUBLIC';
  const otherProfileChannelIds = profileState.drafts[otherProfile].settings?.allowedChannelIds ?? [];
  const activeError = errorByProfile[profile];
  const activeNotice = noticeByProfile[profile];
  const activeSaving = savingByProfile[profile];

  return (
    <main className="dashboard-page dashboard-page--wide">
      <h1>AI Agent</h1>
      <p className="dashboard-description">
        Configure separate PUBLIC (Agent Umum) and ADMIN (Agent Admin) profiles with isolated credentials, channels, roles, tools, and usage accounting.
      </p>
      <div className="mb-4 flex flex-wrap gap-2" aria-label="AI Agent profiles">
        {PROFILES.map((item) => {
          const isDirty = profileState.drafts[item.key].dirty;
          return (
            <button
              key={item.key}
              type="button"
              className={`btn ${profile === item.key ? 'btn-primary' : ''}`}
              aria-pressed={profile === item.key}
              onClick={() => {
                setProfile(item.key);
                setQuotaCursor(null);
              }}
            >
              {item.label}
              {isDirty ? ' *' : ''}
            </button>
          );
        })}
      </div>
      <div className="mb-6 flex flex-wrap gap-2" aria-label="AI Agent sections">
        {(
          [
            ['config', 'Model, Prompt & Tools'],
            ['access', 'Access, Channels & Quotas'],
            ['images', 'Images'],
            ['usage', 'Usage'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`btn ${tab === key ? 'btn-primary' : ''}`}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <h2 ref={sectionHeading} tabIndex={-1} className="sr-only">
        {tab === 'config'
          ? `${profile} model, prompt, key and tool settings`
          : tab === 'access'
            ? `${profile} access, channel and quota settings`
            : tab === 'images'
              ? `${profile} image settings`
              : `${profile} usage`}
      </h2>
      {activeError && (
        <div className="dashboard-notice" role="alert">
          {activeError}
        </div>
      )}
      {loading ? (
        <p role="status">Loading AI Agent settings…</p>
      ) : !activeDraft.settings ? (
        <div className="dashboard-notice">
          AI Agent settings unavailable.{' '}
          <button type="button" className="btn" onClick={() => setRetry((value) => value + 1)}>
            Retry
          </button>
        </div>
      ) : tab === 'usage' ? (
        <div className="space-y-6">
          {quotaError ? (
            <section className="dashboard-section" role="alert">
              <p>{quotaError}</p>
              <button type="button" className="btn mt-3" onClick={() => setQuotaRetry((value) => value + 1)}>
                Retry quota ledger
              </button>
            </section>
          ) : !quota ? (
            <section className="dashboard-section">
              <p role="status">Loading today’s quota ledger…</p>
            </section>
          ) : (
            <AgentQuotaUsage
              page={{
                ...quota,
                profile,
                members: quota.members.map((row) => ({
                  ...row,
                  userId: members.find((member) => member.id === row.userId)?.displayName || row.userId,
                })),
              }}
              onRefresh={() => {
                setQuotaCursor(null);
                setQuotaRetry((value) => value + 1);
              }}
              onNext={() => {
                if (quota.nextCursor) setQuotaCursor(quota.nextCursor);
              }}
            />
          )}
          <section className="dashboard-section">
            <h2>Historical token usage by member ({profile})</h2>
            <p className="mb-3 text-[var(--muted)]">
              Historical interaction logs aggregate completed requests over the selected window separately from today’s live quota ledger above.
            </p>
            <label className="dashboard-field">
              <span>Period</span>
              <select className="input" value={days} onChange={(event) => setDays(Number(event.target.value))}>
                {[7, 30, 90].map((value) => (
                  <option key={value} value={value}>
                    {value} days
                  </option>
                ))}
              </select>
            </label>
            {usageError ? (
              <div role="alert">
                {usageError}{' '}
                <button type="button" className="btn" onClick={() => setUsageRetry((value) => value + 1)}>
                  Retry
                </button>
              </div>
            ) : !usage ? (
              <p role="status">Loading usage…</p>
            ) : !usage.length ? (
              <p>No AI usage recorded for {profile} in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left">
                  <thead>
                    <tr>
                      {['Member', 'Requests', 'Failures', 'Prompt', 'Completion', 'Total'].map((label) => (
                        <th key={label} className="p-3">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usage.map((row) => (
                      <tr key={row.userId}>
                        <th className="p-3 font-normal">
                          {row.displayName
                            || members.find((member) => member.id === row.userId)?.displayName
                            || row.userId}
                        </th>
                        {[row.requests, row.failures, row.promptTokens, row.completionTokens, row.totalTokens].map(
                          (value, index) => (
                            <td key={index} className="p-3 tabular-nums">
                              {value.toLocaleString()}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <AgentProfileForm
          profile={profile}
          tab={tab}
          settings={activeDraft.settings}
          keys={activeDraft.keys}
          channels={channels}
          otherProfileChannelIds={otherProfileChannelIds}
          members={members}
          roles={roles}
          tools={toolsByProfile[profile]}
          readOnly={profile === 'ADMIN' && Boolean(adminReadOnlyNotice)}
          permissionNotice={profile === 'ADMIN' ? adminReadOnlyNotice : undefined}
          saving={activeSaving}
          dirty={activeDraft.dirty}
          notice={activeNotice}
          query={query}
          onQueryChange={setQuery}
          onChange={(nextSettings) => {
            setProfileState((current) => updateProfileSettings(current, profile, nextSettings));
            setNoticeByProfile((prev) => ({ ...prev, [profile]: '' }));
          }}
          onKeysChange={(patch) => {
            setProfileState((current) => updateProfileKeys(current, profile, patch));
            setNoticeByProfile((prev) => ({ ...prev, [profile]: '' }));
          }}
          onSubmit={save}
        />
      )}
    </main>
  );
}
