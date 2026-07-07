export type AgentActionType = 'WARN' | 'TIMEOUT' | 'UPDATE_SETTINGS' | 'KICK' | 'BAN' | 'PURGE' | 'ADD_ROLE' | 'REMOVE_ROLE' | 'REMOVE_TIMEOUT' | 'REVOKE_WARNING' | 'LOCKDOWN' | 'UNLOCK' | 'SET_SLOWMODE' | 'SEND_ANNOUNCEMENT' | 'MASS_TIMEOUT' | 'MASS_KICK' | 'MASS_BAN' | 'MANAGE_STICKER';

export type AgentActionStatus = 'PENDING' | 'APPROVED' | 'CANCELLED' | 'EXECUTED' | 'FAILED' | 'EXPIRED';

export type AgentSettingsUpdate = {
  logChannelId?: string | null;
  messageDeleteLogChannelId?: string | null;
  stickerEnabled?: boolean;
  slowmodeEnabled?: boolean;
  slowmodeChannels?: string[];
  slowmodeIntervalQuiet?: number;
  slowmodeIntervalNormal?: number;
  slowmodeIntervalBusy?: number;
  anomalyEnabled?: boolean;
  phishingDetectionEnabled?: boolean;
  contentAnomalyEnabled?: boolean;
  userAnomalyEnabled?: boolean;
  guildBaselineEnabled?: boolean;
  anomalyEnforcementMode?: string;
  warnLimitEnabled?: boolean;
  warnLimitThreshold?: number;
  warnTimeoutDurationMin?: number;
  warnExpiryDays?: number;
};

export type AgentActionRecommendation = {
  type: AgentActionType;
  reason: string;
  durationMinutes?: number;
  settings?: AgentSettingsUpdate;
  deleteMessageSeconds?: number;
  purgeLimit?: number;
  purgeChannelId?: string;
  purgeTargetUserId?: string;
  roleId?: string;
  warningId?: string;
  channelId?: string;
  content?: string;
  title?: string;
  slowmodeSeconds?: number;
  targetUserIds?: string[];
  stickerName?: string;
  stickerUrl?: string;
  stickerId?: string;
  stickerAction?: 'ADD' | 'DELETE';
};

export type CreateAgentActionProposalInput = {
  guildId: string;
  channelId: string;
  requestedById: string;
  targetUserId?: string | null;
  recommendation: AgentActionRecommendation;
};
