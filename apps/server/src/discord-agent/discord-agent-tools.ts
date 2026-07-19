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
    name: 'get_guild_overview',
    description: 'Read Discord guild overview: member count, boost data, channel/role counts, owner ID, and bot summary. Read-only; executed immediately.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_channel_info',
    description: 'Read detailed Discord channel information including type, category, slowmode, topic, position, and permission overwrites. Read-only; executed immediately.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING', description: 'Discord channel ID. Defaults to current channel.' } } },
  },
  {
    name: 'get_member_permissions',
    description: 'Read member roles, guild permissions, effective channel permissions, and role hierarchy manageability. Read-only; executed immediately.',
    parameters: { type: 'OBJECT', properties: { targetUserId: { type: 'STRING', description: 'Discord member ID.' }, channelId: { type: 'STRING', description: 'Optional channel ID for channel-specific permissions.' } }, required: ['targetUserId'] },
  },
  {
    name: 'get_bot_permissions',
    description: 'Read bot guild/channel permissions and whether bot can manage a target member or role. Read-only; executed immediately.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING', description: 'Optional channel ID.' }, targetUserId: { type: 'STRING', description: 'Optional member ID to check hierarchy.' }, roleId: { type: 'STRING', description: 'Optional role ID to check hierarchy.' } } },
  },
  {
    name: 'get_role_info',
    description: 'Read role details including permissions, position, managed status, member count, and bot manageability. Read-only; executed immediately.',
    parameters: { type: 'OBJECT', properties: { roleId: { type: 'STRING', description: 'Discord role ID.' } }, required: ['roleId'] },
  },
  {
    name: 'get_voice_state',
    description: 'Read a member voice state: channel, mute/deaf/stream/suppress status. Read-only; executed immediately.',
    parameters: { type: 'OBJECT', properties: { targetUserId: { type: 'STRING', description: 'Discord member ID.' } }, required: ['targetUserId'] },
  },
  {
    name: 'preview_embed_message',
    description: 'Validate an embed-like message payload against Discord limits without sending it. Read-only; executed immediately.',
    parameters: { type: 'OBJECT', properties: { title: { type: 'STRING' }, description: { type: 'STRING' }, fields: { type: 'ARRAY', items: { type: 'OBJECT' } }, footer: { type: 'STRING' }, color: { type: 'STRING' }, imageUrl: { type: 'STRING' }, thumbnailUrl: { type: 'STRING' } } },
  },
  {
    name: 'create_channel',
    description: 'Create a proposal to create a Discord channel/category. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, type: { type: 'STRING', description: 'text, announcement, voice, forum, category, or stage.' }, parentId: { type: 'STRING' }, topic: { type: 'STRING' }, nsfw: { type: 'BOOLEAN' }, slowmodeSeconds: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['name', 'reason'] },
  },
  {
    name: 'edit_channel',
    description: 'Create a proposal to edit a Discord channel name/topic/category/nsfw/slowmode. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, name: { type: 'STRING' }, parentId: { type: 'STRING' }, topic: { type: 'STRING' }, nsfw: { type: 'BOOLEAN' }, slowmodeSeconds: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'delete_channel',
    description: 'Create a proposal to delete a Discord channel. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'move_channel',
    description: 'Create a proposal to move a channel position or parent category. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, parentId: { type: 'STRING' }, position: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'set_channel_permissions',
    description: 'Create a proposal to edit channel permission overwrites for a role or user. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, targetId: { type: 'STRING' }, targetType: { type: 'STRING', enum: ['role', 'user'] }, overwrites: { type: 'OBJECT', description: 'Permission overwrite map, e.g. SendMessages false, ViewChannel true, Connect null.' }, reason: { type: 'STRING' } }, required: ['channelId', 'targetId', 'targetType', 'overwrites', 'reason'] },
  },
  {
    name: 'create_category_with_channels',
    description: 'Create a proposal to create a category and child channels from a small template. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, channels: { type: 'ARRAY', items: { type: 'OBJECT' } }, reason: { type: 'STRING' } }, required: ['name', 'channels', 'reason'] },
  },
  {
    name: 'clone_channel_permissions',
    description: 'Create a proposal to copy permission overwrites from one channel to another. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { sourceChannelId: { type: 'STRING' }, targetChannelId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['sourceChannelId', 'targetChannelId', 'reason'] },
  },
  {
    name: 'sync_category_permissions',
    description: 'Create a proposal to sync permission overwrites for every child channel in a category. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { categoryId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['categoryId', 'reason'] },
  },
  {
    name: 'rename_channel_batch',
    description: 'Create a proposal to rename multiple channels. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channels: { type: 'ARRAY', items: { type: 'OBJECT', description: '{ id, name }' } }, reason: { type: 'STRING' } }, required: ['channels', 'reason'] },
  },
  {
    name: 'cleanup_empty_channels',
    description: 'Create a proposal to delete empty channels from a provided list or category. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channels: { type: 'ARRAY', items: { type: 'STRING' } }, categoryId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['reason'] },
  },
  {
    name: 'create_role',
    description: 'Create a proposal to create a Discord role. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { name: { type: 'STRING' }, color: { type: 'STRING' }, hoist: { type: 'BOOLEAN' }, mentionable: { type: 'BOOLEAN' }, reason: { type: 'STRING' } }, required: ['name', 'reason'] },
  },
  {
    name: 'edit_role',
    description: 'Create a proposal to edit a Discord role. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { roleId: { type: 'STRING' }, name: { type: 'STRING' }, color: { type: 'STRING' }, hoist: { type: 'BOOLEAN' }, mentionable: { type: 'BOOLEAN' }, reason: { type: 'STRING' } }, required: ['roleId', 'reason'] },
  },
  {
    name: 'delete_role',
    description: 'Create a proposal to delete a Discord role. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { roleId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['roleId', 'reason'] },
  },
  {
    name: 'move_role',
    description: 'Create a proposal to move a Discord role position. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { roleId: { type: 'STRING' }, position: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['roleId', 'position', 'reason'] },
  },
  {
    name: 'snapshot_member_roles',
    description: 'Create a proposal to save a member role snapshot for later restore. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { targetUserId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['targetUserId', 'reason'] },
  },
  {
    name: 'restore_member_roles',
    description: 'Create a proposal to restore a member roles from the latest saved snapshot. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { targetUserId: { type: 'STRING' }, quarantineRoleId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['targetUserId', 'reason'] },
  },
  {
    name: 'quarantine_member',
    description: 'Create a proposal to snapshot a member, remove manageable roles, add a quarantine role, and optionally timeout. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { targetUserId: { type: 'STRING' }, quarantineRoleId: { type: 'STRING' }, durationMinutes: { type: 'INTEGER' }, removeOtherRoles: { type: 'BOOLEAN' }, reason: { type: 'STRING' } }, required: ['targetUserId', 'quarantineRoleId', 'reason'] },
  },
  {
    name: 'send_plain_message',
    description: 'Create a proposal to send a plain message to a Discord channel. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, content: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['content', 'reason'] },
  },
  {
    name: 'send_embed_message',
    description: 'Create a proposal to send an embed message to a Discord channel. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, content: { type: 'STRING' }, title: { type: 'STRING' }, description: { type: 'STRING' }, fields: { type: 'ARRAY', items: { type: 'OBJECT' } }, color: { type: 'STRING' }, imageUrl: { type: 'STRING' }, thumbnailUrl: { type: 'STRING' }, footer: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['reason'] },
  },
  {
    name: 'edit_bot_message',
    description: 'Create a proposal to edit a bot-owned message. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, messageId: { type: 'STRING' }, content: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['messageId', 'content', 'reason'] },
  },
  {
    name: 'delete_bot_message',
    description: 'Create a proposal to delete a bot-owned message. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, messageId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['messageId', 'reason'] },
  },
  {
    name: 'create_thread',
    description: 'Create a proposal to create a Discord thread. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, messageId: { type: 'STRING' }, name: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['name', 'reason'] },
  },
  {
    name: 'archive_thread',
    description: 'Create a proposal to archive or unarchive a thread. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, archived: { type: 'BOOLEAN' }, reason: { type: 'STRING' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'lock_thread',
    description: 'Create a proposal to lock or unlock a thread. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, locked: { type: 'BOOLEAN' }, reason: { type: 'STRING' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'pin_message',
    description: 'Create a proposal to pin a message. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, messageId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['messageId', 'reason'] },
  },
  {
    name: 'unpin_message',
    description: 'Create a proposal to unpin a message. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, messageId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['messageId', 'reason'] },
  },
  {
    name: 'react_to_message',
    description: 'Create a proposal to add a reaction to a message. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, messageId: { type: 'STRING' }, emoji: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['messageId', 'emoji', 'reason'] },
  },
  {
    name: 'remove_reaction',
    description: 'Create a proposal to remove the bot reaction from a message. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, messageId: { type: 'STRING' }, emoji: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['messageId', 'emoji', 'reason'] },
  },
  {
    name: 'move_member_voice',
    description: 'Create a proposal to move a member to a voice channel. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { targetUserId: { type: 'STRING' }, voiceChannelId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['targetUserId', 'voiceChannelId', 'reason'] },
  },
  {
    name: 'disconnect_member_voice',
    description: 'Create a proposal to disconnect a member from voice. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { targetUserId: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['targetUserId', 'reason'] },
  },
  {
    name: 'set_voice_channel_status',
    description: 'Create a proposal to update voice channel name/user limit/bitrate. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, name: { type: 'STRING' }, userLimit: { type: 'INTEGER' }, bitrate: { type: 'INTEGER' }, reason: { type: 'STRING' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'bot_join_voice',
    description: 'Create a proposal for the bot to join voice. If voiceChannelId is omitted, the backend uses the requesting user current voice channel. If the requester is not in voice, ask them to join voice or provide a specific voiceChannelId. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { voiceChannelId: { type: 'STRING', description: 'Optional voice channel ID. Omit to use the requester current voice channel.' }, reason: { type: 'STRING' } }, required: ['reason'] },
  },
  {
    name: 'bot_leave_voice',
    description: 'Create a proposal for the bot to leave its active voice connection in this server. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { reason: { type: 'STRING' } }, required: ['reason'] },
  },
  {
    name: 'create_invite',
    description: 'Create a proposal to create an invite link. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { channelId: { type: 'STRING' }, maxAgeSeconds: { type: 'INTEGER' }, maxUses: { type: 'INTEGER' }, temporary: { type: 'BOOLEAN' }, unique: { type: 'BOOLEAN' }, reason: { type: 'STRING' } }, required: ['reason'] },
  },
  {
    name: 'delete_invite',
    description: 'Create a proposal to delete an invite code. Creates an action card before execution.',
    parameters: { type: 'OBJECT', properties: { code: { type: 'STRING' }, reason: { type: 'STRING' } }, required: ['code', 'reason'] },
  },
  {
    name: 'execute_godmode_script',
    description: 'EXCLUSIVELY FOR BOT OWNER: Write and execute dynamic JavaScript code on the server using Node VM for custom Discord.js/Prisma actions not covered by safer standard tools. Prefer explicit Discord tools first. Owner means the bot owner configured by OWNER_DISCORD_ID, not the Discord server owner. Authorization is enforced by backend using the requesting Discord user ID. Sandbox has access to `prisma` (database client) and `client` (Discord client). Code must return a value or set a variable.',
    parameters: {
      type: 'OBJECT',
      properties: {
        code: { type: 'STRING', description: 'The JavaScript code to execute inside the sandbox.' },
      },
      required: ['code'],
    },
  },
];
