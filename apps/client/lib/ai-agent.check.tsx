import assert from 'node:assert/strict';
import { AiSettings, settingsPayload, quotaText, maximumAllowance, validateSettings } from './ai-agent';
const valid: AiSettings = {
  enabled: true, provider: 'openai-compatible', model: 'chat-model', baseUrl: 'https://provider.example/v1',
  allowedUserIds: [], allowedChannelIds: [], excludedChannelIds: [], hasCredential: true,
  accessMode: 'ROLE_QUOTAS', policyRevision: '1', roleRules: [], dailyGuildTokenLimit: 10000,
  dailyGuildImageLimit: 10, maxOutputTokens: 2048, maxRunTokens: 32768,
  imageEnabled: false, imageBaseUrl: null, imageModel: null, imageCredentialSource: 'SEPARATE', hasImageCredential: false,
};
assert.equal(validateSettings(valid), null);
assert.equal(validateSettings({ ...valid, model: ' ' })?.section, 'config');
assert.equal(validateSettings({ ...valid, maxRunTokens: 2048 })?.section, 'config');
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
const payload = settingsPayload({ enabled: true, roleRules: rules, policyRevision: '10', hasCredential: true, encryptedApiKey: 'never', dailyGuildTokenLimit: 100 } as any, { apiKey: ' new ', clearApiKey: false, imageApiKey: '', clearImageApiKey: false });
assert.equal(payload.apiKey, 'new');
assert.equal(payload.dailyGuildTokenLimit, 100);
assert.deepEqual(payload.roleRules, rules);
assert.ok(!('policyRevision' in payload) && !('hasCredential' in payload) && !('encryptedApiKey' in payload));
assert.throws(() => settingsPayload({} as any, { apiKey: 'new', clearApiKey: true, imageApiKey: '', clearImageApiKey: false }));
console.log('AI settings payload and quota data checks passed (not browser interaction acceptance).');
