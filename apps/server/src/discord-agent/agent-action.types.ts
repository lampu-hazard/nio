export type AgentActionType =
  | 'WARN' | 'TIMEOUT' | 'UPDATE_SETTINGS' | 'KICK' | 'BAN' | 'PURGE'
  | 'ADD_ROLE' | 'REMOVE_ROLE' | 'REMOVE_TIMEOUT' | 'REVOKE_WARNING'
  | 'LOCKDOWN' | 'UNLOCK' | 'SET_SLOWMODE' | 'SEND_ANNOUNCEMENT'
  | 'MASS_TIMEOUT' | 'MASS_KICK' | 'MASS_BAN' | 'MANAGE_STICKER' | 'PURGE_USER_MESSAGES'
  | 'CREATE_CHANNEL' | 'EDIT_CHANNEL' | 'DELETE_CHANNEL' | 'MOVE_CHANNEL' | 'SET_CHANNEL_PERMISSIONS'
  | 'CREATE_CATEGORY_WITH_CHANNELS' | 'CLONE_CHANNEL_PERMISSIONS' | 'SYNC_CATEGORY_PERMISSIONS' | 'RENAME_CHANNEL_BATCH' | 'CLEANUP_EMPTY_CHANNELS'
  | 'CREATE_ROLE' | 'EDIT_ROLE' | 'DELETE_ROLE' | 'MOVE_ROLE' | 'SNAPSHOT_MEMBER_ROLES' | 'RESTORE_MEMBER_ROLES' | 'QUARANTINE_MEMBER'
  | 'SEND_PLAIN_MESSAGE' | 'SEND_EMBED_MESSAGE' | 'EDIT_BOT_MESSAGE' | 'DELETE_BOT_MESSAGE'
  | 'CREATE_THREAD' | 'ARCHIVE_THREAD' | 'LOCK_THREAD' | 'PIN_MESSAGE' | 'UNPIN_MESSAGE' | 'REACT_TO_MESSAGE' | 'REMOVE_REACTION'
  | 'MOVE_MEMBER_VOICE' | 'DISCONNECT_MEMBER_VOICE' | 'SET_VOICE_CHANNEL_STATUS'
  | 'CREATE_INVITE' | 'DELETE_INVITE'
  | 'BOT_JOIN_VOICE' | 'BOT_LEAVE_VOICE';

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
  targetUserId?: string;
  targetUserIds?: string[];
  stickerName?: string;
  stickerUrl?: string;
  stickerId?: string;
  stickerAction?: 'ADD' | 'DELETE';
  announcementColor?: string;
  announcementImageUrl?: string;
  announcementThumbnailUrl?: string;
  announcementFooter?: string;
  announcementPing?: 'none' | 'here' | 'everyone';
  purgeUserChannels?: string[];
  parentId?: string | null;
  channelName?: string;
  channelType?: string;
  topic?: string | null;
  nsfw?: boolean;
  position?: number;
  permissionTargetId?: string;
  permissionTargetType?: 'role' | 'user';
  permissionOverwrites?: Record<string, boolean | null>;
  channels?: Array<string | { id?: string; name?: string; type?: string; topic?: string; parentId?: string | null }>;
  roleName?: string;
  roleColor?: string;
  rolePermissions?: string[];
  hoist?: boolean;
  mentionable?: boolean;
  messageId?: string;
  embedDescription?: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  imageUrl?: string;
  thumbnailUrl?: string;
  footer?: string;
  color?: string;
  emoji?: string;
  voiceChannelId?: string;
  userLimit?: number;
  bitrate?: number;
  maxAgeSeconds?: number;
  maxUses?: number;
  temporary?: boolean;
  unique?: boolean;
  archived?: boolean;
  locked?: boolean;
  quarantineRoleId?: string;
  removeOtherRoles?: boolean;
};

export type CreateAgentActionProposalInput = {
  guildId: string;
  channelId: string;
  requestedById: string;
  targetUserId?: string | null;
  recommendation: AgentActionRecommendation;
};
