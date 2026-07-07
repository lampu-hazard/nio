export type AgentActionType = 'WARN' | 'TIMEOUT' | 'UPDATE_SETTINGS' | 'KICK' | 'BAN' | 'PURGE' | 'ADD_ROLE' | 'REMOVE_ROLE' | 'REMOVE_TIMEOUT' | 'REVOKE_WARNING';

export type AgentActionStatus = 'PENDING' | 'APPROVED' | 'CANCELLED' | 'EXECUTED' | 'FAILED' | 'EXPIRED';

export type AgentSettingsUpdate = {
  logChannelId?: string | null;
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
};

export type CreateAgentActionProposalInput = {
  guildId: string;
  channelId: string;
  requestedById: string;
  targetUserId?: string | null;
  recommendation: AgentActionRecommendation;
};
