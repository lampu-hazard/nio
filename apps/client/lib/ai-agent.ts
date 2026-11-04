export type RoleRule = { roleId: string; chatEnabled: boolean; imageEnabled: boolean; dailyTokenLimit: number; dailyImageLimit: number };
export type UserTokenRule = { userId: string; dailyTokenLimit: number | null };
export type AiSettings = {
  userTokenRules?: UserTokenRule[];
  enabled: boolean; provider: string; model: string; baseUrl: string | null; allowedUserIds: string[]; allowedChannelIds: string[]; excludedChannelIds: string[];
  hasCredential: boolean; accessMode: 'LEGACY_USERS' | 'ROLE_QUOTAS'; policyRevision: string; roleRules: RoleRule[];
  dailyGuildTokenLimit: number; dailyGuildImageLimit: number; maxOutputTokens: number; maxRunTokens: number;
  imageEnabled: boolean; imageBaseUrl: string | null; imageModel: string | null; imageCredentialSource: 'SEPARATE' | 'CHAT'; hasImageCredential: boolean;
};
export type QuotaCounter = { committed: string; reserved: string; limit: number | null; remaining: number | null; unlimited?: boolean };
export type QuotaBucket = { tokens: QuotaCounter; images: QuotaCounter; allowanceStatus: string; usageSources: Record<string, number>; overruns: number };
export type QuotaPage = { accessMode: string; periodStart: string; resetAt: string; guild: QuotaBucket; members: (QuotaBucket & { userId: string })[]; nextCursor: string | null };
export type KeyDraft = { apiKey: string; clearApiKey: boolean; imageApiKey: string; clearImageApiKey: boolean };
export type SettingsIssue = { section: 'config' | 'access' | 'images'; message: string };
export function validateSettings(settings: AiSettings): SettingsIssue | null {
  const integer = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  const url = (value: string | null, publicHttps = false): URL | null => {
    try {
      const parsed = new URL(value || '');
      if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
      if (publicHttps) {
        const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
        if (parsed.protocol !== 'https:' || parsed.search || parsed.hash || (parsed.port && parsed.port !== '443') || /\/(?:chat\/completions|images\/generations)\/?$/.test(parsed.pathname)
          || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || /^(?:127\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|0\.|::1$|fe80:|fc|fd)/i.test(host)) return null;
      }
      return parsed;
    } catch { return null; }
  };
  if (!settings.model.trim() || settings.model.length > 120) return { section: 'config', message: 'Enter a model name (up to 120 characters).' };
  if (settings.provider === 'openai-compatible' && !url(settings.baseUrl)) return { section: 'config', message: 'Enter a valid chat API base URL without embedded credentials.' };
  if (!integer(settings.maxOutputTokens, 128, 8192) || !integer(settings.maxRunTokens, 1024, 262144) || settings.maxRunTokens < settings.maxOutputTokens) return { section: 'config', message: 'Output cap must be 128–8192; run cap must be 1024–262144 and at least equal to output cap.' };
  if (!integer(settings.dailyGuildTokenLimit, 1, 1000000000) || !integer(settings.dailyGuildImageLimit, 0, 10000)) return { section: 'access', message: 'Enter valid whole-number server daily limits.' };
  if (settings.roleRules.length > 100 || new Set(settings.roleRules.map(rule => rule.roleId)).size !== settings.roleRules.length || settings.roleRules.some(rule => !rule.roleId || !integer(rule.dailyTokenLimit, rule.chatEnabled ? 1 : 0, 100000000) || !integer(rule.dailyImageLimit, rule.imageEnabled ? 1 : 0, 1000))) return { section: 'access', message: 'Each role must be unique and enabled capabilities need a positive daily allowance.' };
  const personal = settings.userTokenRules ?? [];
  if (personal.length > 500 || new Set(personal.map(rule => rule.userId)).size !== personal.length
    || personal.some(rule => !/^\d{5,25}$/.test(rule.userId) || (rule.dailyTokenLimit !== null && !integer(rule.dailyTokenLimit, 1, 100000000)))) {
    return { section: 'access', message: 'Choose unique members and a whole-number personal token limit (1–100,000,000), or Unlimited.' };
  }
  if (settings.imageBaseUrl && !url(settings.imageBaseUrl, true)) return { section: 'images', message: 'Image API base URL must use HTTPS on port 443, without credentials, query or fragment.' };
  if (settings.imageEnabled && (settings.accessMode !== 'ROLE_QUOTAS' || !settings.imageBaseUrl || !settings.imageModel?.trim())) return { section: 'images', message: 'Images require Role quotas, an image API URL and a model.' };
  if (settings.imageCredentialSource === 'CHAT' && settings.imageEnabled && (settings.provider !== 'openai-compatible' || url(settings.baseUrl)?.origin !== url(settings.imageBaseUrl, true)?.origin)) return { section: 'images', message: 'Chat key reuse requires an OpenAI-compatible chat provider at the same API origin.' };
  return null;
}
export function maximumAllowance(rules: RoleRule[]) {
  return { tokens: Math.max(0, ...rules.filter(rule => rule.chatEnabled).map(rule => rule.dailyTokenLimit)), images: Math.max(0, ...rules.filter(rule => rule.imageEnabled).map(rule => rule.dailyImageLimit)) };
}
export function quotaText(counter: QuotaCounter) {
  if (counter.unlimited) return `${counter.committed} committed + ${counter.reserved} reserved / Unlimited (personal; server cap still applies)`;
  return `${counter.committed} committed + ${counter.reserved} reserved / ${counter.limit ?? 'unavailable'} · ${counter.remaining === null ? 'remaining unavailable' : `${counter.remaining} remaining`}`;
}
export function settingsPayload(settings: AiSettings, keys: KeyDraft): Record<string, unknown> {
  if ((keys.apiKey.trim() && keys.clearApiKey) || (keys.imageApiKey.trim() && keys.clearImageApiKey)) throw new Error('Choose replace or remove, not both.');
  const fields = ['enabled', 'provider', 'model', 'baseUrl', 'allowedUserIds', 'excludedChannelIds', 'accessMode', 'roleRules', 'userTokenRules', 'dailyGuildTokenLimit', 'dailyGuildImageLimit', 'maxOutputTokens', 'maxRunTokens', 'imageEnabled', 'imageBaseUrl', 'imageModel', 'imageCredentialSource'] as const;
  const payload: Record<string, unknown> = {};
  for (const field of fields) if (settings[field] !== undefined) payload[field] = settings[field];
  if (keys.apiKey.trim()) payload.apiKey = keys.apiKey.trim();
  if (keys.clearApiKey) payload.clearApiKey = true;
  if (keys.imageApiKey.trim()) payload.imageApiKey = keys.imageApiKey.trim();
  if (keys.clearImageApiKey) payload.clearImageApiKey = true;
  return payload;
}
