export type AgentProfile = 'PUBLIC' | 'ADMIN';
export type AgentToolCatalogItem = {
  id: string;
  name: string;
  description: string;
  source: 'BUILTIN' | 'PLUGIN' | 'MCP';
  mode: 'read' | 'write';
  available: boolean;
  unavailableReason?: string | null;
};
export type RoleRule = {
  roleId: string;
  chatEnabled: boolean;
  imageEnabled: boolean;
  dailyTokenLimit: number | null;
  dailyImageLimit: number;
};
export type UserTokenRule = { userId: string; dailyTokenLimit: number | null };

type BaseAiSettings = {
  profile?: AgentProfile;
  tokenQuotaMode?: 'LIMITED' | 'UNLIMITED';
  systemPrompt?: string | null;
  messageRetentionDays?: number;
  allowedToolIds?: string[];
  userTokenRules?: UserTokenRule[];
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string | null;
  allowedUserIds: string[];
  allowedChannelIds: string[];
  excludedChannelIds: string[];
  hasCredential: boolean;
  accessMode: 'LEGACY_USERS' | 'ROLE_QUOTAS';
  policyRevision: string;
  roleRules: RoleRule[];
  dailyGuildTokenLimit: number | null;
  dailyGuildImageLimit: number;
  maxOutputTokens: number;
  maxRunTokens: number | null;
  imageEnabled: boolean;
  imageBaseUrl: string | null;
  imageModel: string | null;
  imageCredentialSource: 'SEPARATE' | 'CHAT';
  hasImageCredential: boolean;
};

export type PublicAiSettings = BaseAiSettings & {
  profile?: 'PUBLIC';
  tokenQuotaMode?: 'LIMITED';
  dailyGuildTokenLimit: number;
  maxRunTokens: number;
};

export type AdminAiSettings = BaseAiSettings & {
  profile: 'ADMIN';
  tokenQuotaMode: 'UNLIMITED';
  dailyGuildTokenLimit: null;
  maxRunTokens: null;
};

export type AiSettings = BaseAiSettings;

export type QuotaCounter = { committed: string; reserved: string; limit: number | null; remaining: number | null; unlimited?: boolean };
export type QuotaBucket = {
  tokens: QuotaCounter;
  images: QuotaCounter;
  allowanceStatus: string;
  usageSources: Record<string, number>;
  usageSourceAmounts?: Record<string, string>;
  overruns: number;
};
export type QuotaPage = {
  profile?: AgentProfile;
  tokenQuotaMode?: 'LIMITED' | 'UNLIMITED';
  accessMode: string;
  periodStart: string;
  resetAt: string;
  guild: QuotaBucket;
  members: (QuotaBucket & { userId: string })[];
  nextCursor: string | null;
};
export type KeyDraft = { apiKey: string; clearApiKey: boolean; imageApiKey: string; clearImageApiKey: boolean };
export type SettingsIssue = { section: 'config' | 'access' | 'images'; message: string };

export function assertAgentProfile(profile: string): AgentProfile {
  if (profile !== 'PUBLIC' && profile !== 'ADMIN') {
    throw new Error(`Invalid agent profile: ${String(profile)}`);
  }
  return profile;
}

export function isAdminProfile(settings: Pick<AiSettings, 'profile' | 'tokenQuotaMode'>): boolean {
  return settings.profile === 'ADMIN' || settings.tokenQuotaMode === 'UNLIMITED';
}

export function usesBaselineFitFallback(settings: Pick<AiSettings, 'profile' | 'tokenQuotaMode' | 'provider' | 'model'>): boolean {
  if (isAdminProfile(settings)) return false;
  if (settings.provider === 'gemini') return false;
  return !/^(gpt-4o|gpt-4\.1|o1|o3|o4|chatgpt-4o|gpt-4|gpt-3\.5-turbo)/i.test(settings.model.trim());
}

export function profileSettingsUrl(guildId: string, profile: AgentProfile): string {
  const validProfile = assertAgentProfile(profile);
  return `/guilds/${guildId}/ai-agent/profiles/${validProfile}/settings`;
}

export function profileQuotasUrl(guildId: string, profile: AgentProfile, cursor?: string | null): string {
  const validProfile = assertAgentProfile(profile);
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return `/guilds/${guildId}/ai-agent/profiles/${validProfile}/quotas${query}`;
}

export function profileUsageUrl(guildId: string, profile: AgentProfile, days = 30): string {
  const validProfile = assertAgentProfile(profile);
  return `/guilds/${guildId}/ai-agent/profiles/${validProfile}/usage?days=${days}`;
}

export function profileToolsUrl(guildId: string, profile: AgentProfile): string {
  const validProfile = assertAgentProfile(profile);
  return `/guilds/${guildId}/ai-agent/profiles/${validProfile}/tools`;
}

export function validateSettings(settings: AiSettings, otherProfileChannelIds: string[] = []): SettingsIssue | null {
  const integer = (value: number | null | undefined, min: number, max: number) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
  const url = (value: string | null, publicHttps = false): URL | null => {
    try {
      const parsed = new URL(value || '');
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
      if (publicHttps) {
        const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
        if (
          parsed.protocol !== 'https:'
          || parsed.search
          || parsed.hash
          || (parsed.port && parsed.port !== '443')
          || /\/(?:chat\/completions|images\/generations)\/?$/.test(parsed.pathname)
          || host === 'localhost'
          || host.endsWith('.localhost')
          || host.endsWith('.local')
          || /^(?:127\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|::1$|fe80:|fc|fd)/i.test(host)
        ) {
          return null;
        }
      }
      return parsed;
    } catch {
      return null;
    }
  };

  const admin = isAdminProfile(settings);

  if (!settings.model.trim() || settings.model.length > 120) {
    return { section: 'config', message: 'Enter a model name (up to 120 characters).' };
  }
  if (settings.provider === 'openai-compatible' && !url(settings.baseUrl)) {
    return { section: 'config', message: 'Enter a valid chat API base URL without embedded credentials.' };
  }
  if (settings.systemPrompt != null && settings.systemPrompt.length > 32000) {
    return { section: 'config', message: 'Custom system prompt must be at most 32,000 characters.' };
  }
  if (settings.messageRetentionDays !== undefined && !integer(settings.messageRetentionDays, 1, 90)) {
    return { section: 'config', message: 'Message retention must be between 1 and 90 days.' };
  }
  if (!integer(settings.maxOutputTokens, 128, 8192)) {
    return { section: 'config', message: 'Output cap must be 128–8192.' };
  }
  if (admin) {
    if (settings.maxRunTokens !== null && settings.maxRunTokens !== undefined) {
      return { section: 'config', message: 'ADMIN profile uses unlimited run tokens.' };
    }
  } else if (!integer(settings.maxRunTokens, 1024, 262144) || (settings.maxRunTokens as number) < settings.maxOutputTokens) {
    return { section: 'config', message: 'Output cap must be 128–8192; run cap must be 1024–262144 and at least equal to output cap.' };
  }

  if (!integer(settings.dailyGuildImageLimit, 0, 10000)) {
    return { section: 'access', message: 'Enter valid whole-number server daily limits.' };
  }
  if (admin) {
    if (settings.dailyGuildTokenLimit !== null && settings.dailyGuildTokenLimit !== undefined) {
      return { section: 'access', message: 'ADMIN profile has no daily server token limit.' };
    }
  } else if (!integer(settings.dailyGuildTokenLimit, 1, 1000000000)) {
    return { section: 'access', message: 'Enter valid whole-number server daily limits.' };
  }

  if (settings.allowedChannelIds.includes('*')) {
    return { section: 'access', message: 'Select explicit channels for this profile.' };
  }
  if (otherProfileChannelIds.some((id) => settings.allowedChannelIds.includes(id))) {
    return { section: 'access', message: 'A channel cannot be assigned to both PUBLIC and ADMIN profiles.' };
  }
  if (settings.profile && settings.enabled) {
    const activeChannels = settings.allowedChannelIds.filter(
      (id) => !settings.excludedChannelIds.includes('*') && !settings.excludedChannelIds.includes(id),
    );
    const hasActiveRole = settings.roleRules.some(
      (rule) => rule.chatEnabled || (settings.imageEnabled && rule.imageEnabled),
    );
    if (!activeChannels.length || !hasActiveRole) {
      return { section: 'access', message: 'Enabled profiles require at least one non-excluded allowed channel and one enabled role rule.' };
    }
  }

  if (
    settings.roleRules.length > 100
    || new Set(settings.roleRules.map((rule) => rule.roleId)).size !== settings.roleRules.length
    || settings.roleRules.some((rule) => {
      if (!rule.roleId) return true;
      if (!integer(rule.dailyImageLimit, rule.imageEnabled ? 1 : 0, 1000)) return true;
      if (admin) return rule.dailyTokenLimit !== null;
      return !integer(rule.dailyTokenLimit, rule.chatEnabled ? 1 : 0, 100000000);
    })
  ) {
    return { section: 'access', message: 'Each role must be unique and enabled capabilities need a positive daily allowance.' };
  }

  const personal = settings.userTokenRules ?? [];
  if (admin && personal.length > 0) {
    return { section: 'access', message: 'Personal token quotas are not applicable to the ADMIN profile.' };
  }
  if (
    !admin
    && (personal.length > 500
      || new Set(personal.map((rule) => rule.userId)).size !== personal.length
      || personal.some(
        (rule) => !/^\d{5,25}$/.test(rule.userId) || (rule.dailyTokenLimit !== null && !integer(rule.dailyTokenLimit, 1, 100000000)),
      ))
  ) {
    return { section: 'access', message: 'Choose unique members and a whole-number personal token limit (1–100,000,000), or Unlimited.' };
  }

  if (settings.imageBaseUrl && !url(settings.imageBaseUrl, true)) {
    return { section: 'images', message: 'Image API base URL must use HTTPS on port 443, without credentials, query or fragment.' };
  }
  if (settings.imageEnabled && (settings.accessMode !== 'ROLE_QUOTAS' || !settings.imageBaseUrl || !settings.imageModel?.trim())) {
    return { section: 'images', message: 'Images require Role quotas, an image API URL and a model.' };
  }
  if (
    settings.imageCredentialSource === 'CHAT'
    && settings.imageEnabled
    && (settings.provider !== 'openai-compatible' || url(settings.baseUrl)?.origin !== url(settings.imageBaseUrl, true)?.origin)
  ) {
    return { section: 'images', message: 'Chat key reuse requires an OpenAI-compatible chat provider at the same API origin.' };
  }
  return null;
}

export function maximumAllowance(rules: RoleRule[]) {
  return {
    tokens: Math.max(0, ...rules.filter((rule) => rule.chatEnabled && typeof rule.dailyTokenLimit === 'number').map((rule) => rule.dailyTokenLimit as number)),
    images: Math.max(0, ...rules.filter((rule) => rule.imageEnabled).map((rule) => rule.dailyImageLimit)),
  };
}

export function quotaText(counter: QuotaCounter, profile?: AgentProfile) {
  if (counter.unlimited) {
    if (profile === 'ADMIN') {
      return `${counter.committed} committed + ${counter.reserved} reserved · Unlimited — usage tracked, no NIO token quota`;
    }
    return `${counter.committed} committed + ${counter.reserved} reserved / Unlimited (personal; server cap still applies)`;
  }
  return `${counter.committed} committed + ${counter.reserved} reserved / ${counter.limit ?? 'unavailable'} · ${counter.remaining === null ? 'remaining unavailable' : `${counter.remaining} remaining`}`;
}

export function settingsPayload(settings: AiSettings, keys: KeyDraft): Record<string, unknown> {
  if ((keys.apiKey.trim() && keys.clearApiKey) || (keys.imageApiKey.trim() && keys.clearImageApiKey)) {
    throw new Error('Choose replace or remove, not both.');
  }
  const admin = isAdminProfile(settings);
  const commonFields = [
    'enabled',
    'provider',
    'model',
    'baseUrl',
    'allowedChannelIds',
    'excludedChannelIds',
    'dailyGuildImageLimit',
    'maxOutputTokens',
    'imageEnabled',
    'imageBaseUrl',
    'imageModel',
    'imageCredentialSource',
    'systemPrompt',
    'messageRetentionDays',
    'allowedToolIds',
  ] as const;

  const payload: Record<string, unknown> = {};
  for (const field of commonFields) {
    if (settings[field] !== undefined) payload[field] = settings[field];
  }
  if (settings.accessMode !== undefined) {
    payload.accessMode = 'ROLE_QUOTAS';
  }
  if (admin) {
    payload.tokenQuotaMode = 'UNLIMITED';
    if (settings.roleRules !== undefined) {
      payload.roleRules = settings.roleRules.map(({ roleId, chatEnabled, imageEnabled, dailyImageLimit }) => ({
        roleId,
        chatEnabled,
        imageEnabled,
        dailyTokenLimit: null,
        dailyImageLimit,
      }));
    }
  } else {
    if (settings.tokenQuotaMode !== undefined || settings.profile === 'PUBLIC') {
      payload.tokenQuotaMode = 'LIMITED';
    }
    if (settings.dailyGuildTokenLimit !== undefined) payload.dailyGuildTokenLimit = settings.dailyGuildTokenLimit;
    if (settings.maxRunTokens !== undefined) payload.maxRunTokens = settings.maxRunTokens;
    if (settings.userTokenRules !== undefined) payload.userTokenRules = settings.userTokenRules;
    if (settings.roleRules !== undefined) payload.roleRules = settings.roleRules;
  }

  if (keys.apiKey.trim()) payload.apiKey = keys.apiKey.trim();
  if (keys.clearApiKey) payload.clearApiKey = true;
  if (keys.imageApiKey.trim()) payload.imageApiKey = keys.imageApiKey.trim();
  if (keys.clearImageApiKey) payload.clearImageApiKey = true;
  return payload;
}
