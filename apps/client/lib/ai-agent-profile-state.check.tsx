import assert from 'node:assert/strict';
import { AiSettings } from './ai-agent';
import {
  createProfileDrafts,
  beginProfileRequest,
  applyProfileLoadResponse,
  updateProfileSettings,
  updateProfileKeys,
  applyProfileSaveSuccess,
  applyProfileSaveFailure,
} from './ai-agent-profile-state';

const publicInitial: AiSettings = {
  profile: 'PUBLIC',
  tokenQuotaMode: 'LIMITED',
  enabled: true,
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  baseUrl: null,
  allowedUserIds: [],
  allowedChannelIds: ['1001'],
  excludedChannelIds: [],
  hasCredential: true,
  accessMode: 'ROLE_QUOTAS',
  policyRevision: '1',
  roleRules: [{ roleId: '2001', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 25000, dailyImageLimit: 0 }],
  dailyGuildTokenLimit: 500000,
  dailyGuildImageLimit: 20,
  maxOutputTokens: 2048,
  maxRunTokens: 16384,
  imageEnabled: false,
  imageBaseUrl: null,
  imageModel: null,
  imageCredentialSource: 'SEPARATE',
  hasImageCredential: false,
  systemPrompt: 'Santai dan membantu.',
  messageRetentionDays: 30,
  allowedToolIds: ['web_search'],
};

const adminInitial: AiSettings = {
  profile: 'ADMIN',
  tokenQuotaMode: 'UNLIMITED',
  enabled: false,
  provider: 'openai-compatible',
  model: 'gpt-4.1',
  baseUrl: 'https://api.openai.com/v1',
  allowedUserIds: [],
  allowedChannelIds: ['9001'],
  excludedChannelIds: [],
  hasCredential: true,
  accessMode: 'ROLE_QUOTAS',
  policyRevision: '3',
  roleRules: [{ roleId: '8001', chatEnabled: true, imageEnabled: true, dailyTokenLimit: null, dailyImageLimit: 10 }],
  dailyGuildTokenLimit: null,
  dailyGuildImageLimit: 50,
  maxOutputTokens: 4096,
  maxRunTokens: null,
  imageEnabled: true,
  imageBaseUrl: 'https://api.openai.com/v1',
  imageModel: 'gpt-image-1',
  imageCredentialSource: 'CHAT',
  hasImageCredential: false,
  systemPrompt: null,
  messageRetentionDays: 30,
  allowedToolIds: ['get_guild_overview', 'warn_user'],
};

let state = createProfileDrafts();
const pubLoad = beginProfileRequest(state, 'PUBLIC');
state = pubLoad.state;
const admLoad = beginProfileRequest(state, 'ADMIN');
state = admLoad.state;

state = applyProfileLoadResponse(state, 'PUBLIC', pubLoad.requestId, publicInitial);
state = applyProfileLoadResponse(state, 'ADMIN', admLoad.requestId, adminInitial);
assert.equal(state.drafts.PUBLIC.dirty, false);
assert.equal(state.drafts.ADMIN.dirty, false);

// Edit PUBLIC draft and keys, then switch to ADMIN and edit ADMIN independently
state = updateProfileSettings(state, 'PUBLIC', { ...publicInitial, model: 'gemini-2.5-pro' });
state = updateProfileKeys(state, 'PUBLIC', { apiKey: 'pub-secret-key' });
assert.equal(state.drafts.PUBLIC.dirty, true);
assert.equal(state.drafts.ADMIN.dirty, false);

state = updateProfileSettings(state, 'ADMIN', { ...adminInitial, maxOutputTokens: 8192 });
state = updateProfileKeys(state, 'ADMIN', { clearApiKey: true });
assert.equal(state.drafts.PUBLIC.settings?.model, 'gemini-2.5-pro');
assert.equal(state.drafts.PUBLIC.keys.apiKey, 'pub-secret-key');
assert.equal(state.drafts.ADMIN.settings?.maxOutputTokens, 8192);
assert.equal(state.drafts.ADMIN.keys.clearApiKey, true);

// Failed ADMIN save leaves both ADMIN and PUBLIC unsaved drafts intact
const admSave1 = beginProfileRequest(state, 'ADMIN');
state = admSave1.state;
state = applyProfileSaveFailure(state, 'ADMIN', admSave1.requestId);
assert.equal(state.drafts.ADMIN.dirty, true);
assert.equal(state.drafts.ADMIN.settings?.maxOutputTokens, 8192);
assert.equal(state.drafts.ADMIN.keys.clearApiKey, true);
assert.equal(state.drafts.PUBLIC.dirty, true);
assert.equal(state.drafts.PUBLIC.keys.apiKey, 'pub-secret-key');

// Late/stale ADMIN response cannot overwrite PUBLIC or clear PUBLIC's key, nor overwrite newer ADMIN state
const staleAdminReq = admLoad.requestId;
state = applyProfileLoadResponse(state, 'ADMIN', staleAdminReq, { ...adminInitial, maxOutputTokens: 512 });
assert.equal(state.drafts.ADMIN.settings?.maxOutputTokens, 8192);
assert.equal(state.drafts.PUBLIC.settings?.model, 'gemini-2.5-pro');
assert.equal(state.drafts.PUBLIC.keys.apiKey, 'pub-secret-key');

// Successful ADMIN save resets only ADMIN dirty/keys while preserving PUBLIC unsaved draft & key
const admSave2 = beginProfileRequest(state, 'ADMIN');
state = admSave2.state;
state = applyProfileSaveSuccess(state, 'ADMIN', admSave2.requestId, {
  ...adminInitial,
  maxOutputTokens: 8192,
  hasCredential: false,
  policyRevision: '4',
});
assert.equal(state.drafts.ADMIN.dirty, false);
assert.equal(state.drafts.ADMIN.keys.clearApiKey, false);
assert.equal(state.drafts.ADMIN.settings?.maxOutputTokens, 8192);
assert.equal(state.drafts.PUBLIC.dirty, true);
assert.equal(state.drafts.PUBLIC.settings?.model, 'gemini-2.5-pro');
assert.equal(state.drafts.PUBLIC.keys.apiKey, 'pub-secret-key');

console.log('AI profile state isolation checks passed.');
