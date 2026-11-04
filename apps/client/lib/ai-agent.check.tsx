import assert from 'node:assert/strict';
import {
  AiSettings,
  settingsPayload,
  quotaText,
  maximumAllowance,
  validateSettings,
  profileSettingsUrl,
  profileQuotasUrl,
  profileUsageUrl,
  profileToolsUrl,
} from './ai-agent';

const valid: AiSettings = {
  enabled: true, provider: 'openai-compatible', model: 'chat-model', baseUrl: 'https://provider.example/v1',
  allowedUserIds: [], allowedChannelIds: [], excludedChannelIds: [], hasCredential: true,
  accessMode: 'ROLE_QUOTAS', policyRevision: '1', roleRules: [], dailyGuildTokenLimit: 10000,
  dailyGuildImageLimit: 10, maxOutputTokens: 2048, maxRunTokens: 32768,
  imageEnabled: false, imageBaseUrl: null, imageModel: null, imageCredentialSource: 'SEPARATE', hasImageCredential: false,
};
const personal = [{ userId: '40000', dailyTokenLimit: 50 }, { userId: '50000', dailyTokenLimit: null }];
assert.equal(validateSettings({ ...valid, userTokenRules: personal } as any), null);
assert.equal(validateSettings({ ...valid, userTokenRules: [{ userId: '40000', dailyTokenLimit: NaN }] } as any)?.section, 'access');
assert.equal(validateSettings({ ...valid, userTokenRules: [personal[0], personal[0]] } as any)?.section, 'access');
assert.deepEqual(settingsPayload({ ...valid, userTokenRules: personal } as any, { apiKey: '', clearApiKey: false, imageApiKey: '', clearImageApiKey: false }).userTokenRules, personal);
assert.ok(quotaText({ committed: '200000000', reserved: '20', limit: null, remaining: null, unlimited: true } as any).includes('Unlimited'));
assert.equal(validateSettings(valid), null);
assert.equal(validateSettings({ ...valid, model: ' ' })?.section, 'config');
assert.equal(validateSettings({ ...valid, maxRunTokens: 2048 }), null);
assert.equal(validateSettings({ ...valid, maxRunTokens: 1024 })?.section, 'config');
assert.equal(validateSettings({ ...valid, maxOutputTokens: Number.NaN })?.section, 'config');
assert.equal(validateSettings({ ...valid, dailyGuildTokenLimit: NaN })?.section, 'access');
assert.equal(validateSettings({ ...valid, roleRules: [{ roleId: 'a', chatEnabled: false, imageEnabled: true, dailyTokenLimit: 0, dailyImageLimit: 0 }] })?.section, 'access');
assert.equal(validateSettings({ ...valid, imageEnabled: true })?.section, 'images');
assert.equal(validateSettings({ ...valid, imageBaseUrl: 'https://127.0.0.1/v1' })?.section, 'images');
assert.equal(validateSettings({ ...valid, imageBaseUrl: 'https://localhost/v1' })?.section, 'images');
assert.equal(validateSettings({ ...valid, imageEnabled: true, imageBaseUrl: 'https://images.example/v1', imageModel: 'image-model', imageCredentialSource: 'CHAT' })?.section, 'images');
assert.equal(validateSettings({ ...valid, imageEnabled: true, imageBaseUrl: 'https://provider.example/images', imageModel: 'image-model', imageCredentialSource: 'CHAT' }), null);

const rules = [
  { roleId: 'a', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 100, dailyImageLimit: 9 },
  { roleId: 'b', chatEnabled: true, imageEnabled: true, dailyTokenLimit: 200, dailyImageLimit: 3 },
];
assert.deepEqual(maximumAllowance(rules), { tokens: 200, images: 3 });
assert.equal(quotaText({ committed: '30', reserved: '20', limit: 100, remaining: 50 }), '30 committed + 20 reserved / 100 · 50 remaining');
assert.ok(quotaText({ committed: '30', reserved: '20', limit: null, remaining: null }).includes('unavailable'));
assert.ok(quotaText({ committed: '5000000', reserved: '100', limit: null, remaining: null, unlimited: true }, 'ADMIN').includes('Unlimited — usage tracked, no NIO token quota'));

const payload = settingsPayload(
  {
    profile: 'PUBLIC',
    enabled: true,
    roleRules: rules,
    allowedChannelIds: ['111111'],
    allowedUserIds: ['legacy-readonly'],
    systemPrompt: 'Natural Indonesian helper',
    messageRetentionDays: 14,
    allowedToolIds: ['web_search'],
    policyRevision: '10',
    hasCredential: true,
    encryptedApiKey: 'never',
    dailyGuildTokenLimit: 100,
  } as any,
  { apiKey: ' new ', clearApiKey: false, imageApiKey: '', clearImageApiKey: false },
);
assert.equal(payload.apiKey, 'new');
assert.equal(payload.dailyGuildTokenLimit, 100);
assert.deepEqual(payload.allowedChannelIds, ['111111']);
assert.equal(payload.systemPrompt, 'Natural Indonesian helper');
assert.equal(payload.messageRetentionDays, 14);
assert.deepEqual(payload.allowedToolIds, ['web_search']);
assert.deepEqual(payload.roleRules, rules);
assert.ok(!('policyRevision' in payload) && !('hasCredential' in payload) && !('encryptedApiKey' in payload) && !('allowedUserIds' in payload) && !('profile' in payload));
assert.throws(() => settingsPayload({} as any, { apiKey: 'new', clearApiKey: true, imageApiKey: '', clearImageApiKey: false }));

// ADMIN profile validation and payload checks
const adminValid: AiSettings = {
  ...valid,
  profile: 'ADMIN',
  tokenQuotaMode: 'UNLIMITED',
  dailyGuildTokenLimit: null,
  maxRunTokens: null,
  allowedChannelIds: ['222222'],
  roleRules: [{ roleId: '999999', chatEnabled: true, imageEnabled: true, dailyTokenLimit: null, dailyImageLimit: 5 }],
};
assert.equal(validateSettings(adminValid), null);
assert.equal(validateSettings({ ...adminValid, dailyGuildTokenLimit: 1000 })?.section, 'access');
assert.equal(validateSettings({ ...adminValid, maxRunTokens: 4096 })?.section, 'config');
assert.equal(validateSettings({ ...adminValid, maxOutputTokens: 64 })?.section, 'config');
assert.equal(validateSettings({ ...adminValid, dailyGuildImageLimit: -1 })?.section, 'access');
assert.equal(validateSettings({ ...adminValid, userTokenRules: [{ userId: '40000', dailyTokenLimit: 100 }] })?.section, 'access');
assert.equal(validateSettings(adminValid, ['222222'])?.section, 'access');
assert.equal(validateSettings({ ...adminValid, enabled: true, allowedChannelIds: [] })?.section, 'access');

const adminPayload = settingsPayload(
  {
    ...adminValid,
    dailyGuildTokenLimit: null,
    maxRunTokens: null,
    userTokenRules: undefined,
    allowedToolIds: ['get_guild_overview', 'warn_user'],
  },
  { apiKey: '', clearApiKey: true, imageApiKey: 'img-key', clearImageApiKey: false },
);
assert.equal(adminPayload.tokenQuotaMode, 'UNLIMITED');
assert.equal(adminPayload.clearApiKey, true);
assert.equal(adminPayload.imageApiKey, 'img-key');
assert.ok(!('dailyGuildTokenLimit' in adminPayload) && !('maxRunTokens' in adminPayload) && !('userTokenRules' in adminPayload));
assert.deepEqual(adminPayload.roleRules, [{ roleId: '999999', chatEnabled: true, imageEnabled: true, dailyTokenLimit: null, dailyImageLimit: 5 }]);

// Uppercase profile URLs
assert.equal(profileSettingsUrl('guild-1', 'PUBLIC'), '/guilds/guild-1/ai-agent/profiles/PUBLIC/settings');
assert.equal(profileSettingsUrl('guild-1', 'ADMIN'), '/guilds/guild-1/ai-agent/profiles/ADMIN/settings');
assert.equal(profileQuotasUrl('guild-1', 'PUBLIC', 'cur 1'), '/guilds/guild-1/ai-agent/profiles/PUBLIC/quotas?cursor=cur%201');
assert.equal(profileUsageUrl('guild-1', 'ADMIN', 30), '/guilds/guild-1/ai-agent/profiles/ADMIN/usage?days=30');
assert.equal(profileToolsUrl('guild-1', 'PUBLIC'), '/guilds/guild-1/ai-agent/profiles/PUBLIC/tools');
assert.throws(() => profileSettingsUrl('guild-1', 'admin' as any));

console.log('AI settings payload and quota data checks passed (not browser interaction acceptance).');
