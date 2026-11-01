import assert from 'node:assert/strict';
import { featurePayload, sameFeatureSettings, validateFeature, type FeatureKey, type GuildSettings } from './feature-settings';

const settings: GuildSettings = {
  voiceXpEnabled: false, voiceXpPerMinute: 10, voiceXpRewards: [],
  voiceNotificationChannelId: null, voiceLevelUpChannelId: '123456789012345678',
  logChannelId: null, messageDeleteLogChannelId: null, stickerEnabled: false,
  hallOfFameEnabled: false, hallOfFameChannelId: null, hallOfFameThreshold: 3,
  slowmodeEnabled: false, slowmodeChannels: [], slowmodeIntervalQuiet: 0, slowmodeIntervalNormal: 5, slowmodeIntervalBusy: 10,
  anomalyEnabled: false, phishingDetectionEnabled: true, contentAnomalyEnabled: true,
  userAnomalyEnabled: true, guildBaselineEnabled: true, anomalyEnforcementMode: 'AUDIT_ONLY',
};
assert.deepEqual(Object.keys(featurePayload('logging', settings)).sort(), ['logChannelId', 'messageDeleteLogChannelId']);
assert.deepEqual(featurePayload('voice-notifications', settings), { voiceNotificationChannelId: null, voiceLevelUpChannelId: '123456789012345678' });
assert.deepEqual(featurePayload('voice-notifications', { ...settings, voiceLevelUpChannelId: null }), { voiceNotificationChannelId: null, voiceLevelUpChannelId: null });
assert.equal(featurePayload('slowmode', settings).slowmodeIntervalQuiet, 0);
assert.equal(featurePayload('stickers', settings).stickerEnabled, false);
for (const rate of [1, 1000]) assert.equal(validateFeature('voice-xp', { ...settings, voiceXpPerMinute: rate }), null);
for (const rate of [0, 1001, 1.5, NaN]) assert.ok(validateFeature('voice-xp', { ...settings, voiceXpPerMinute: rate }));
for (const level of [1, 10000]) assert.equal(validateFeature('voice-xp', { ...settings, voiceXpRewards: [{ level, roleId: '123456789012345678' }] }), null);
for (const rewards of [
  [{ level: 1, roleId: '123456789012345678' }, { level: 1, roleId: '223456789012345678' }],
  [{ level: 1, roleId: '123456789012345678' }, { level: 2, roleId: '123456789012345678' }],
  Array.from({ length: 51 }, (_, i) => ({ level: i + 1, roleId: String(123456789012345678n + BigInt(i)) })),
  [{ level: 0, roleId: '' }],
]) assert.ok(validateFeature('voice-xp', { ...settings, voiceXpRewards: rewards }));
assert.equal(validateFeature('security', { ...settings, voiceXpRewards: [{ level: 0, roleId: '' }] }), null);
assert.equal(sameFeatureSettings('logging', settings, { ...settings, voiceXpEnabled: true }), true);
assert.equal(sameFeatureSettings('voice-xp', { ...settings, voiceXpRewards: [{ level: 1, roleId: '123456789012345678' }] }, { ...settings, voiceXpRewards: [{ roleId: '123456789012345678', level: 1 }] }), true);
const copy = featurePayload('voice-xp', settings);
copy.voiceXpRewards!.push({ level: 1, roleId: '123456789012345678' });
assert.equal(settings.voiceXpRewards.length, 0);
const features: FeatureKey[] = ['voice-xp', 'voice-notifications', 'hall-of-fame', 'slowmode', 'security', 'logging', 'stickers'];
const keys = features.flatMap(feature => Object.keys(featurePayload(feature, settings)));
assert.deepEqual(keys.sort(), Object.keys(settings).sort());
assert.equal(new Set(keys).size, keys.length);
console.log('feature settings checks passed');
