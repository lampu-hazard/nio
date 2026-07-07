export const AGENT_TOOLS = [
  {
    name: 'get_user_warnings',
    description: 'Get active and expired warning history for a Discord user.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to inspect.' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'get_member_info',
    description: 'Get a moderation context summary for a guild member, including profile, roles, warnings, and recent messages.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to inspect.' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'get_channel_recent_messages',
    description: 'Get recent non-deleted messages from a channel to understand conversation context.',
    parameters: {
      type: 'OBJECT',
      properties: {
        channelId: { type: 'STRING', description: 'Discord channel ID. Defaults to the current channel when omitted.' },
        targetUserId: { type: 'STRING', description: 'Optional Discord user ID to filter messages by author.' },
        limit: { type: 'INTEGER', description: 'Maximum messages to return. Backend clamps this to a safe limit.' },
      },
    },
  },
  {
    name: 'get_deleted_message_history',
    description: 'Get deleted message records from stored logs for a channel or user. Read-only; only messages logged before deletion can be returned.',
    parameters: {
      type: 'OBJECT',
      properties: {
        channelId: { type: 'STRING', description: 'Optional Discord channel ID to filter deleted messages.' },
        targetUserId: { type: 'STRING', description: 'Optional Discord user ID to filter deleted messages by author.' },
        limit: { type: 'INTEGER', description: 'Maximum deleted messages to return. Backend clamps this to a safe limit.' },
      },
    },
  },
  {
    name: 'get_server_channels',
    description: 'List text-based guild channels with IDs and names for configuration and moderation context.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_server_roles',
    description: 'List guild roles with IDs, names, positions, managed status, and bot manageability hints.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_channel_slowmode',
    description: 'Read the current Discord slowmode seconds for a text channel.',
    parameters: {
      type: 'OBJECT',
      properties: {
        channelId: { type: 'STRING', description: 'Discord channel ID. Defaults to the current channel when omitted.' },
      },
    },
  },
  {
    name: 'warn_user',
    description: 'Create a proposal to warn a user. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to warn.' },
        reason: { type: 'STRING', description: 'Reason for the warning.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'timeout_user',
    description: 'Create a proposal to timeout a user. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to timeout.' },
        durationMinutes: { type: 'INTEGER', description: 'Timeout duration in minutes. Backend clamps this to the allowed range.' },
        reason: { type: 'STRING', description: 'Reason for the timeout.' },
      },
      required: ['targetUserId', 'durationMinutes', 'reason'],
    },
  },
  {
    name: 'kick_user',
    description: 'Create a proposal to kick a user. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to kick.' },
        reason: { type: 'STRING', description: 'Reason for the kick.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'ban_user',
    description: 'Create a proposal to ban a user. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to ban.' },
        reason: { type: 'STRING', description: 'Reason for the ban.' },
        deleteMessageSeconds: { type: 'INTEGER', description: 'Optional message history deletion window in seconds. Backend clamps to Discord limits.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'purge_channel_messages',
    description: 'Create a proposal to bulk delete recent channel messages. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        channelId: { type: 'STRING', description: 'Discord channel ID. Defaults to the current channel when omitted.' },
        targetUserId: { type: 'STRING', description: 'Optional Discord user ID. When provided, purge only this user\'s messages.' },
        limit: { type: 'INTEGER', description: 'Maximum messages to consider. Backend clamps this to 1-100.' },
        reason: { type: 'STRING', description: 'Reason for the purge.' },
      },
      required: ['limit', 'reason'],
    },
  },
  {
    name: 'add_role_to_user',
    description: 'Create a proposal to add a role to a user. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to receive the role.' },
        roleId: { type: 'STRING', description: 'Discord role ID to add.' },
        reason: { type: 'STRING', description: 'Reason for adding the role.' },
      },
      required: ['targetUserId', 'roleId', 'reason'],
    },
  },
  {
    name: 'remove_role_from_user',
    description: 'Create a proposal to remove a role from a user. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to remove the role from.' },
        roleId: { type: 'STRING', description: 'Discord role ID to remove.' },
        reason: { type: 'STRING', description: 'Reason for removing the role.' },
      },
      required: ['targetUserId', 'roleId', 'reason'],
    },
  },
  {
    name: 'remove_timeout_user',
    description: 'Create a proposal to remove an active timeout from a user. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to remove timeout from.' },
        reason: { type: 'STRING', description: 'Reason for removing the timeout.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'revoke_warning',
    description: 'Create a proposal to delete a warning record by warning ID. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        warningId: { type: 'STRING', description: 'Warning record ID to revoke.' },
        reason: { type: 'STRING', description: 'Reason for revoking the warning.' },
      },
      required: ['warningId', 'reason'],
    },
  },
  {
    name: 'get_server_settings',
    description: 'Read guild settings for logging, stickers, slowmode, anomaly detection, phishing detection, and warning limits.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'update_server_settings',
    description: 'Create a proposal to update guild settings. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        reason: { type: 'STRING', description: 'Reason for the recommended settings change.' },
        logChannelId: { type: 'STRING', description: 'Moderation log channel ID, or empty/null to clear.' },
        stickerEnabled: { type: 'BOOLEAN', description: 'Enable custom sticker responses.' },
        slowmodeEnabled: { type: 'BOOLEAN', description: 'Enable automatic slowmode.' },
        slowmodeChannels: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Channel IDs where automatic slowmode may run.' },
        slowmodeIntervalQuiet: { type: 'INTEGER', description: 'Slowmode seconds for quiet channels.' },
        slowmodeIntervalNormal: { type: 'INTEGER', description: 'Slowmode seconds for normal activity.' },
        slowmodeIntervalBusy: { type: 'INTEGER', description: 'Slowmode seconds for busy activity.' },
        anomalyEnabled: { type: 'BOOLEAN', description: 'Enable anomaly detection.' },
        phishingDetectionEnabled: { type: 'BOOLEAN', description: 'Enable phishing detection.' },
        contentAnomalyEnabled: { type: 'BOOLEAN', description: 'Enable content anomaly detection.' },
        userAnomalyEnabled: { type: 'BOOLEAN', description: 'Enable user behavior anomaly detection.' },
        guildBaselineEnabled: { type: 'BOOLEAN', description: 'Enable guild baseline anomaly detection.' },
        anomalyEnforcementMode: { type: 'STRING', description: 'Anomaly mode: AUDIT_ONLY, DELETE_HIGH_CONFIDENCE, or DELETE_AND_TIMEOUT_CRITICAL.' },
        warnLimitEnabled: { type: 'BOOLEAN', description: 'Enable automatic warning threshold penalties.' },
        warnLimitThreshold: { type: 'INTEGER', description: 'Active warning count required before automatic penalty.' },
        warnTimeoutDurationMin: { type: 'INTEGER', description: 'Automatic timeout duration in minutes after warning threshold.' },
        warnExpiryDays: { type: 'INTEGER', description: 'Warning expiry days. 0 means warnings never expire.' },
      },
      required: ['reason'],
    },
  },
];
