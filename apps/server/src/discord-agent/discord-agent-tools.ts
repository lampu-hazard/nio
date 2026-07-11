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
        limit: { type: 'INTEGER', description: 'Maximum messages to return. Backend clamps this to a safe limit of 100.' },
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
        limit: { type: 'INTEGER', description: 'Maximum deleted messages to return. Backend clamps this to a safe limit of 100.' },
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
        messageDeleteLogChannelId: { type: 'STRING', description: 'Message delete log channel ID, or empty/null to clear.' },
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
  {
    name: 'lockdown_channel',
    description: 'Create a proposal to lock down a channel by disabling Send Messages permission for the @everyone role. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        channelId: { type: 'STRING', description: 'Discord channel ID to lock down. Defaults to current channel if omitted.' },
        reason: { type: 'STRING', description: 'Reason for the lockdown.' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'unlock_channel',
    description: 'Create a proposal to unlock a locked channel by resetting Send Messages permission for the @everyone role. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        channelId: { type: 'STRING', description: 'Discord channel ID to unlock. Defaults to current channel if omitted.' },
        reason: { type: 'STRING', description: 'Reason for the unlock.' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'set_channel_slowmode',
    description: 'Create a proposal to set slowmode interval on a channel. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        channelId: { type: 'STRING', description: 'Discord channel ID. Defaults to current channel if omitted.' },
        slowmodeSeconds: { type: 'INTEGER', description: 'Slowmode interval in seconds (0 to 21600). 0 disables slowmode.' },
        reason: { type: 'STRING', description: 'Reason for changing slowmode.' },
      },
      required: ['slowmodeSeconds', 'reason'],
    },
  },
  {
    name: 'send_channel_announcement',
    description: 'Create a proposal to send a rich announcement message to a channel. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        channelId: { type: 'STRING', description: 'Discord channel ID to send the announcement to. Defaults to current channel if omitted.' },
        content: { type: 'STRING', description: 'Main markdown-supported announcement text.' },
        title: { type: 'STRING', description: 'Optional announcement embed title.' },
        color: { type: 'STRING', description: 'Optional embed accent color in hex code (e.g. #ffaa00).' },
        imageUrl: { type: 'STRING', description: 'Optional large image URL to embed.' },
        thumbnailUrl: { type: 'STRING', description: 'Optional small thumbnail URL to embed.' },
        footer: { type: 'STRING', description: 'Optional embed footer text.' },
        ping: { type: 'STRING', enum: ['none', 'here', 'everyone'], description: 'Optional role mention to ping when sending. Defaults to none.' },
        reason: { type: 'STRING', description: 'Reason for sending this announcement.' },
      },
      required: ['content', 'reason'],
    },
  },
  {
    name: 'purge_user_messages',
    description: 'Create a proposal to delete all recent messages from a specific user across server text channels. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID.' },
        limit: { type: 'INTEGER', description: 'Maximum messages to delete per channel (1-100, defaults to 50).' },
        channels: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Optional channel IDs. Purges all text channels if omitted.' },
        reason: { type: 'STRING', description: 'Reason for the mass purge.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'get_message_context',
    description: 'Fetch the surrounding chat context (recent messages before and after) of a specific message ID in the channel. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        messageId: { type: 'STRING', description: 'Discord message ID.' },
        channelId: { type: 'STRING', description: 'Optional Discord channel ID. Defaults to current channel if omitted.' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'find_duplicate_messages',
    description: 'Search for identical or highly similar messages sent by users across different channels to detect spam. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Maximum duplicate entries to return (1-50, defaults to 15).' },
        hours: { type: 'INTEGER', description: 'Time window in hours (1-24, defaults to 1).' },
      },
    },
  },
  {
    name: 'get_server_stats',
    description: 'Fetch server statistics including total members, active warnings, pending proposals, and recent slowmode/anomaly incidents. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'get_discord_audit_logs',
    description: 'Fetch official Discord audit logs for security analysis. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Maximum log entries to return (1-50, defaults to 15).' },
        targetUserId: { type: 'STRING', description: 'Optional user ID to filter by executor or target user.' },
        actionType: { type: 'STRING', description: 'Optional action type to filter logs.' },
      },
    },
  },
  {
    name: 'get_audit_logs',
    description: 'Fetch general normalized Discord audit logs with optional filters. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        category: { type: 'STRING', enum: ['role', 'timeout', 'ban', 'kick', 'channel', 'server', 'other'], description: 'Filter events by category.' },
        actionType: { type: 'STRING', description: 'Raw action type code or name to filter by.' },
        targetUserId: { type: 'STRING', description: 'Optional user ID to filter by action target.' },
        executorId: { type: 'STRING', description: 'Optional moderator user ID who executed the action.' },
        limit: { type: 'INTEGER', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
    },
  },
  {
    name: 'get_member_audit_trail',
    description: 'Fetch normalized audit log history specifically targeting a single user ID (role additions/removals, timeouts, bans). Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID of the target member.' },
        limit: { type: 'INTEGER', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'get_moderator_actions',
    description: 'Fetch normalized audit log history of actions performed by a specific moderator user ID. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        moderatorId: { type: 'STRING', description: 'Discord user ID of the moderator/executor.' },
        limit: { type: 'INTEGER', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
      required: ['moderatorId'],
    },
  },
  {
    name: 'search_audit_events',
    description: 'Perform a search query match over recent normalized audit events (matches text in labels, targets, executors, roles, or reasons). Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'Search term to match (e.g., username, role name, or action name).' },
        limit: { type: 'INTEGER', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_user_activity_score',
    description: 'Assess user activity index by aggregating message logs over recent days. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID to calculate score for.' },
        days: { type: 'INTEGER', description: 'Aggregating window size in days (1-30, defaults to 7).' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'get_recent_joins',
    description: 'Get list of members who recently joined the guild. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Maximum users to return (1-100, defaults to 15).' },
        hours: { type: 'INTEGER', description: 'Time window in hours (1-168, defaults to 24).' },
      },
    },
  },
  {
    name: 'mass_moderation_action',
    description: 'Create a proposal to apply a moderation action to multiple users at once. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserIds: { type: 'ARRAY', items: { type: 'STRING' }, description: 'List of Discord user IDs.' },
        actionType: { type: 'STRING', description: 'Action to perform: TIMEOUT, KICK, or BAN.' },
        durationMinutes: { type: 'INTEGER', description: 'Timeout duration in minutes (only for TIMEOUT).' },
        reason: { type: 'STRING', description: 'Reason for the mass moderation.' },
      },
      required: ['targetUserIds', 'actionType', 'reason'],
    },
  },
  {
    name: 'get_invite_links',
    description: 'Get active invite links for the server. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {},
    },
  },
  {
    name: 'add_user_note',
    description: 'Add an internal moderation note about a user. Direct write; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID.' },
        content: { type: 'STRING', description: 'Internal note details.' },
      },
      required: ['targetUserId', 'content'],
    },
  },
  {
    name: 'get_user_notes',
    description: 'Retrieve internal moderation notes about a user. Read-only; executed immediately.',
    parameters: {
      type: 'OBJECT',
      properties: {
        targetUserId: { type: 'STRING', description: 'Discord user ID.' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'manage_server_sticker',
    description: 'Create a proposal to add or delete a keyword-triggered sticker. Creates an action card before execution.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: { type: 'STRING', description: 'Action to perform: ADD or DELETE.' },
        name: { type: 'STRING', description: 'Keyword trigger name.' },
        url: { type: 'STRING', description: 'Sticker file URL (required for ADD).' },
        stickerId: { type: 'STRING', description: 'Sticker database ID (required for DELETE).' },
        reason: { type: 'STRING', description: 'Reason for modifying stickers.' },
      },
      required: ['action', 'name', 'reason'],
    },
  },
  {
    name: 'execute_godmode_script',
    description: 'EXCLUSIVELY FOR BOT OWNER: Write and execute dynamic JavaScript code on the server using Node VM. Owner means the bot owner configured by OWNER_DISCORD_ID, not the Discord server owner. Authorization is enforced by backend using the requesting Discord user ID. Sandbox has access to `prisma` (database client) and `client` (Discord client). Code must return a value or set a variable.',
    parameters: {
      type: 'OBJECT',
      properties: {
        code: { type: 'STRING', description: 'The JavaScript code to execute inside the sandbox.' },
      },
      required: ['code'],
    },
  },
];
