export type ChannelOption = { id: string; name: string };
export type RoleOption = { id: string; name: string; manageable: boolean };
export type GuildSettings = {
  voiceXpEnabled: boolean;
  voiceXpPerMinute: number;
  voiceNotificationChannelId: string | null;
  voiceLevelUpChannelId: string | null;
  voiceXpRewards: { level: number; roleId: string }[];
  logChannelId: string | null;
  messageDeleteLogChannelId: string | null;
  stickerEnabled: boolean;
  hallOfFameEnabled: boolean;
  hallOfFameChannelId: string | null;
  hallOfFameThreshold: number;
  slowmodeEnabled: boolean;
  slowmodeChannels: string[];
  slowmodeIntervalQuiet: number;
  slowmodeIntervalNormal: number;
  slowmodeIntervalBusy: number;
  anomalyEnabled: boolean;
  phishingDetectionEnabled: boolean;
  contentAnomalyEnabled: boolean;
  userAnomalyEnabled: boolean;
  guildBaselineEnabled: boolean;
  anomalyEnforcementMode: string;
};
export type FeatureKey = 'voice-xp' | 'voice-notifications' | 'hall-of-fame' | 'slowmode' | 'security' | 'logging' | 'stickers';
export function featureStatuses(settings: GuildSettings | null): { key: FeatureKey; status: 'enabled' | 'disabled' | 'unavailable' }[] {
  const enabled: Record<FeatureKey, boolean> = {
    'voice-xp': !!settings?.voiceXpEnabled,
    'voice-notifications': !!(settings?.voiceNotificationChannelId || settings?.voiceLevelUpChannelId),
    'hall-of-fame': !!settings?.hallOfFameEnabled,
    slowmode: !!settings?.slowmodeEnabled,
    security: !!settings?.anomalyEnabled,
    logging: !!(settings?.logChannelId || settings?.messageDeleteLogChannelId),
    stickers: !!settings?.stickerEnabled,
  };
  return (Object.keys(enabled) as FeatureKey[]).map(key => ({ key, status: settings === null ? 'unavailable' : enabled[key] ? 'enabled' : 'disabled' }));
}

const fields: Record<FeatureKey, (keyof GuildSettings)[]> = {
  'voice-xp': ['voiceXpEnabled', 'voiceXpPerMinute', 'voiceXpRewards'],
  'voice-notifications': ['voiceNotificationChannelId', 'voiceLevelUpChannelId'],
  'hall-of-fame': ['hallOfFameEnabled', 'hallOfFameChannelId', 'hallOfFameThreshold'],
  slowmode: ['slowmodeEnabled', 'slowmodeChannels', 'slowmodeIntervalQuiet', 'slowmodeIntervalNormal', 'slowmodeIntervalBusy'],
  security: ['anomalyEnabled', 'phishingDetectionEnabled', 'contentAnomalyEnabled', 'userAnomalyEnabled', 'guildBaselineEnabled', 'anomalyEnforcementMode'],
  logging: ['logChannelId', 'messageDeleteLogChannelId'],
  stickers: ['stickerEnabled'],
};

export function featurePayload(feature: FeatureKey, settings: GuildSettings): Partial<GuildSettings> {
  return structuredClone(Object.fromEntries(fields[feature].map(key => [key, settings[key]])));
}

export function validateFeature(feature: FeatureKey, settings: GuildSettings): string | null {
  const integer = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
  const snowflake = (value: string) => /^\d{17,20}$/.test(value);
  if (feature === 'voice-xp') {
    if (!integer(settings.voiceXpPerMinute, 1, 1000)) return 'Use 1–1,000 XP per minute.';
    const rewards = settings.voiceXpRewards;
    if (rewards.length > 50 || rewards.some(reward => !integer(reward.level, 1, 10000) || !snowflake(reward.roleId))
      || new Set(rewards.map(reward => reward.level)).size !== rewards.length
      || new Set(rewards.map(reward => reward.roleId)).size !== rewards.length) return 'Use at most 50 unique levels (1–10,000) and roles.';
  }
  if (feature === 'hall-of-fame' && !integer(settings.hallOfFameThreshold, 1, 100)) return 'Use a reaction threshold from 1 to 100.';
  if (feature === 'slowmode' && [settings.slowmodeIntervalQuiet, settings.slowmodeIntervalNormal, settings.slowmodeIntervalBusy].some(value => !integer(value, 0, 21600))) return 'Use whole slowmode intervals from 0 to 21,600 seconds.';
  if (feature === 'voice-notifications' && [settings.voiceNotificationChannelId, settings.voiceLevelUpChannelId].some(value => value !== null && !snowflake(value))) return 'Choose a valid channel or Disabled.';
  return null;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function sameFeatureSettings(feature: FeatureKey, a: GuildSettings, b: GuildSettings): boolean {
  return canonical(featurePayload(feature, a)) === canonical(featurePayload(feature, b));
}
