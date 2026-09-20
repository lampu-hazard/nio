import { AiToolDefinition } from './interfaces/ai-provider.interface';

const RAW_AGENT_TOOLS = [
  {
    name: 'get_user_warnings',
    description: 'Get active and expired warning history for a Discord user.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to inspect.' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'get_member_info',
    description: 'Get a moderation context summary for a guild member, including profile, roles, warnings, and recent messages.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to inspect.' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'get_channel_recent_messages',
    description: 'Get recent non-deleted messages from a channel to understand conversation context.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Discord channel ID. Defaults to the current channel when omitted.' },
        targetUserId: { type: 'string', description: 'Optional Discord user ID to filter messages by author.' },
        limit: { type: 'integer', description: 'Maximum messages to return. Backend clamps this to a safe limit of 100.' },
      },
    },
  },
  {
    name: 'get_deleted_message_history',
    description: 'Get deleted message records from stored logs for a channel or user. Read-only; only messages logged before deletion can be returned.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Optional Discord channel ID to filter deleted messages.' },
        targetUserId: { type: 'string', description: 'Optional Discord user ID to filter deleted messages by author.' },
        limit: { type: 'integer', description: 'Maximum deleted messages to return. Backend clamps this to a safe limit of 100.' },
      },
    },
  },
  {
    name: 'get_server_channels',
    description: 'List text-based guild channels with IDs and names for configuration and moderation context.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_server_roles',
    description: 'List guild roles with IDs, names, positions, managed status, and bot manageability hints.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_channel_slowmode',
    description: 'Read the current Discord slowmode seconds for a text channel.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Discord channel ID. Defaults to the current channel when omitted.' },
      },
    },
  },
  {
    name: 'warn_user',
    description: 'Create a proposal to warn a user. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to warn.' },
        reason: { type: 'string', description: 'Reason for the warning.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'timeout_user',
    description: 'Create a proposal to timeout a user. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to timeout.' },
        durationMinutes: { type: 'integer', description: 'Timeout duration in minutes. Backend clamps this to the allowed range.' },
        reason: { type: 'string', description: 'Reason for the timeout.' },
      },
      required: ['targetUserId', 'durationMinutes', 'reason'],
    },
  },
  {
    name: 'kick_user',
    description: 'Create a proposal to kick a user. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to kick.' },
        reason: { type: 'string', description: 'Reason for the kick.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'ban_user',
    description: 'Create a proposal to ban a user. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to ban.' },
        reason: { type: 'string', description: 'Reason for the ban.' },
        deleteMessageSeconds: { type: 'integer', description: 'Optional message history deletion window in seconds. Backend clamps to Discord limits.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'purge_channel_messages',
    description: 'Create a proposal to bulk delete recent channel messages. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Discord channel ID. Defaults to the current channel when omitted.' },
        targetUserId: { type: 'string', description: 'Optional Discord user ID. When provided, purge only this user\'s messages.' },
        limit: { type: 'integer', description: 'Maximum messages to consider. Backend clamps this to 1-100.' },
        reason: { type: 'string', description: 'Reason for the purge.' },
      },
      required: ['limit', 'reason'],
    },
  },
  {
    name: 'add_role_to_user',
    description: 'Create a proposal to add a role to a user. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to receive the role.' },
        roleId: { type: 'string', description: 'Discord role ID to add.' },
        reason: { type: 'string', description: 'Reason for adding the role.' },
      },
      required: ['targetUserId', 'roleId', 'reason'],
    },
  },
  {
    name: 'remove_role_from_user',
    description: 'Create a proposal to remove a role from a user. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to remove the role from.' },
        roleId: { type: 'string', description: 'Discord role ID to remove.' },
        reason: { type: 'string', description: 'Reason for removing the role.' },
      },
      required: ['targetUserId', 'roleId', 'reason'],
    },
  },
  {
    name: 'remove_timeout_user',
    description: 'Create a proposal to remove an active timeout from a user. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to remove timeout from.' },
        reason: { type: 'string', description: 'Reason for removing the timeout.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'revoke_warning',
    description: 'Create a proposal to delete a warning record by warning ID. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        warningId: { type: 'string', description: 'Warning record ID to revoke.' },
        reason: { type: 'string', description: 'Reason for revoking the warning.' },
      },
      required: ['warningId', 'reason'],
    },
  },
  {
    name: 'get_server_settings',
    description: 'Read guild settings for logging, stickers, slowmode, anomaly detection, phishing detection, and warning limits.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'update_server_settings',
    description: 'Create a proposal to update guild settings. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Reason for the recommended settings change.' },
        logChannelId: { type: 'string', description: 'Moderation log channel ID, or empty/null to clear.' },
        messageDeleteLogChannelId: { type: 'string', description: 'Message delete log channel ID, or empty/null to clear.' },
        stickerEnabled: { type: 'boolean', description: 'Enable custom sticker responses.' },
        slowmodeEnabled: { type: 'boolean', description: 'Enable automatic slowmode.' },
        slowmodeChannels: { type: 'array', items: { type: 'string' }, description: 'Channel IDs where automatic slowmode may run.' },
        slowmodeIntervalQuiet: { type: 'integer', description: 'Slowmode seconds for quiet channels.' },
        slowmodeIntervalNormal: { type: 'integer', description: 'Slowmode seconds for normal activity.' },
        slowmodeIntervalBusy: { type: 'integer', description: 'Slowmode seconds for busy activity.' },
        anomalyEnabled: { type: 'boolean', description: 'Enable anomaly detection.' },
        phishingDetectionEnabled: { type: 'boolean', description: 'Enable phishing detection.' },
        contentAnomalyEnabled: { type: 'boolean', description: 'Enable content anomaly detection.' },
        userAnomalyEnabled: { type: 'boolean', description: 'Enable user behavior anomaly detection.' },
        guildBaselineEnabled: { type: 'boolean', description: 'Enable guild baseline anomaly detection.' },
        anomalyEnforcementMode: { type: 'string', description: 'Anomaly mode: AUDIT_ONLY, DELETE_HIGH_CONFIDENCE, or DELETE_AND_TIMEOUT_CRITICAL.' },
        warnLimitEnabled: { type: 'boolean', description: 'Enable automatic warning threshold penalties.' },
        warnLimitThreshold: { type: 'integer', description: 'Active warning count required before automatic penalty.' },
        warnTimeoutDurationMin: { type: 'integer', description: 'Automatic timeout duration in minutes after warning threshold.' },
        warnExpiryDays: { type: 'integer', description: 'Warning expiry days. 0 means warnings never expire.' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'lockdown_channel',
    description: 'Create a proposal to lock down a channel by disabling Send Messages permission for the @everyone role. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Discord channel ID to lock down. Defaults to current channel if omitted.' },
        reason: { type: 'string', description: 'Reason for the lockdown.' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'unlock_channel',
    description: 'Create a proposal to unlock a locked channel by resetting Send Messages permission for the @everyone role. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Discord channel ID to unlock. Defaults to current channel if omitted.' },
        reason: { type: 'string', description: 'Reason for the unlock.' },
      },
      required: ['reason'],
    },
  },
  {
    name: 'set_channel_slowmode',
    description: 'Create a proposal to set slowmode interval on a channel. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Discord channel ID. Defaults to current channel if omitted.' },
        slowmodeSeconds: { type: 'integer', description: 'Slowmode interval in seconds (0 to 21600). 0 disables slowmode.' },
        reason: { type: 'string', description: 'Reason for changing slowmode.' },
      },
      required: ['slowmodeSeconds', 'reason'],
    },
  },
  {
    name: 'send_channel_announcement',
    description: 'Create a proposal to send a rich announcement message to a channel. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        channelId: { type: 'string', description: 'Discord channel ID to send the announcement to. Defaults to current channel if omitted.' },
        content: { type: 'string', description: 'Main markdown-supported announcement text.' },
        title: { type: 'string', description: 'Optional announcement embed title.' },
        color: { type: 'string', description: 'Optional embed accent color in hex code (e.g. #ffaa00).' },
        imageUrl: { type: 'string', description: 'Optional large image URL to embed.' },
        thumbnailUrl: { type: 'string', description: 'Optional small thumbnail URL to embed.' },
        footer: { type: 'string', description: 'Optional embed footer text.' },
        ping: { type: 'string', enum: ['none', 'here', 'everyone'], description: 'Optional role mention to ping when sending. Defaults to none.' },
        reason: { type: 'string', description: 'Reason for sending this announcement.' },
      },
      required: ['content', 'reason'],
    },
  },
  {
    name: 'purge_user_messages',
    description: 'Create a proposal to delete all recent messages from a specific user across server text channels. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID.' },
        limit: { type: 'integer', description: 'Maximum messages to delete per channel (1-100, defaults to 50).' },
        channels: { type: 'array', items: { type: 'string' }, description: 'Optional channel IDs. Purges all text channels if omitted.' },
        reason: { type: 'string', description: 'Reason for the mass purge.' },
      },
      required: ['targetUserId', 'reason'],
    },
  },
  {
    name: 'get_message_context',
    description: 'Fetch the surrounding chat context (recent messages before and after) of a specific message ID in the channel. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Discord message ID.' },
        channelId: { type: 'string', description: 'Optional Discord channel ID. Defaults to current channel if omitted.' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'find_duplicate_messages',
    description: 'Search for identical or highly similar messages sent by users across different channels to detect spam. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Maximum duplicate entries to return (1-50, defaults to 15).' },
        hours: { type: 'integer', description: 'Time window in hours (1-24, defaults to 1).' },
      },
    },
  },
  {
    name: 'get_server_stats',
    description: 'Fetch server statistics including total members, active warnings, pending proposals, and recent slowmode/anomaly incidents. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_discord_audit_logs',
    description: 'Fetch official Discord audit logs for security analysis. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Maximum log entries to return (1-50, defaults to 15).' },
        targetUserId: { type: 'string', description: 'Optional user ID to filter by executor or target user.' },
        actionType: { type: 'string', description: 'Optional action type to filter logs.' },
      },
    },
  },
  {
    name: 'get_audit_logs',
    description: 'Fetch general normalized Discord audit logs with optional filters. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['role', 'timeout', 'ban', 'kick', 'channel', 'server', 'other'], description: 'Filter events by category.' },
        actionType: { type: 'string', description: 'Raw action type code or name to filter by.' },
        targetUserId: { type: 'string', description: 'Optional user ID to filter by action target.' },
        executorId: { type: 'string', description: 'Optional moderator user ID who executed the action.' },
        limit: { type: 'integer', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
    },
  },
  {
    name: 'get_member_audit_trail',
    description: 'Fetch normalized audit log history specifically targeting a single user ID (role additions/removals, timeouts, bans). Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID of the target member.' },
        limit: { type: 'integer', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'get_moderator_actions',
    description: 'Fetch normalized audit log history of actions performed by a specific moderator user ID. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        moderatorId: { type: 'string', description: 'Discord user ID of the moderator/executor.' },
        limit: { type: 'integer', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
      required: ['moderatorId'],
    },
  },
  {
    name: 'search_audit_events',
    description: 'Perform a search query match over recent normalized audit events (matches text in labels, targets, executors, roles, or reasons). Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term to match (e.g., username, role name, or action name).' },
        limit: { type: 'integer', description: 'Maximum log entries to return (1-50, defaults to 15).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'check_user_activity_score',
    description: 'Assess user activity index by aggregating message logs over recent days. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID to calculate score for.' },
        days: { type: 'integer', description: 'Aggregating window size in days (1-30, defaults to 7).' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'get_recent_joins',
    description: 'Get list of members who recently joined the guild. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', description: 'Maximum users to return (1-100, defaults to 15).' },
        hours: { type: 'integer', description: 'Time window in hours (1-168, defaults to 24).' },
      },
    },
  },
  {
    name: 'mass_moderation_action',
    description: 'Create a proposal to apply a moderation action to multiple users at once. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        targetUserIds: { type: 'array', items: { type: 'string' }, description: 'List of Discord user IDs.' },
        actionType: { type: 'string', description: 'Action to perform: TIMEOUT, KICK, or BAN.' },
        durationMinutes: { type: 'integer', description: 'Timeout duration in minutes (only for TIMEOUT).' },
        reason: { type: 'string', description: 'Reason for the mass moderation.' },
      },
      required: ['targetUserIds', 'actionType', 'reason'],
    },
  },
  {
    name: 'get_invite_links',
    description: 'Get active invite links for the server. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_user_notes',
    description: 'Retrieve internal moderation notes about a user. Read-only; executed immediately.',
    parameters: {
      type: 'object',
      properties: {
        targetUserId: { type: 'string', description: 'Discord user ID.' },
      },
      required: ['targetUserId'],
    },
  },
  {
    name: 'manage_server_sticker',
    description: 'Create a proposal to add or delete a keyword-triggered sticker. Creates an action card before execution.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action to perform: ADD or DELETE.' },
        name: { type: 'string', description: 'Keyword trigger name.' },
        url: { type: 'string', description: 'Sticker file URL (required for ADD).' },
        stickerId: { type: 'string', description: 'Sticker database ID (required for DELETE).' },
        reason: { type: 'string', description: 'Reason for modifying stickers.' },
      },
      required: ['action', 'name', 'reason'],
    },
  },
  {
    name: 'get_guild_overview',
    description: 'Read Discord guild overview: member count, boost data, channel/role counts, owner ID, and bot summary. Read-only; executed immediately.',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'get_channel_info',
    description: 'Read detailed Discord channel information including type, category, slowmode, topic, position, and permission overwrites. Read-only; executed immediately.',
    parameters: { type: 'object', properties: { channelId: { type: 'string', description: 'Discord channel ID. Defaults to current channel.' } } },
  },
  {
    name: 'get_member_permissions',
    description: 'Read member roles, guild permissions, effective channel permissions, and role hierarchy manageability. Read-only; executed immediately.',
    parameters: { type: 'object', properties: { targetUserId: { type: 'string', description: 'Discord member ID.' }, channelId: { type: 'string', description: 'Optional channel ID for channel-specific permissions.' } }, required: ['targetUserId'] },
  },
  {
    name: 'get_bot_permissions',
    description: 'Read bot guild/channel permissions and whether bot can manage a target member or role. Read-only; executed immediately.',
    parameters: { type: 'object', properties: { channelId: { type: 'string', description: 'Optional channel ID.' }, targetUserId: { type: 'string', description: 'Optional member ID to check hierarchy.' }, roleId: { type: 'string', description: 'Optional role ID to check hierarchy.' } } },
  },
  {
    name: 'get_role_info',
    description: 'Read role details including permissions, position, managed status, member count, and bot manageability. Read-only; executed immediately.',
    parameters: { type: 'object', properties: { roleId: { type: 'string', description: 'Discord role ID.' } }, required: ['roleId'] },
  },
  {
    name: 'get_voice_state',
    description: 'Read a member voice state: channel, mute/deaf/stream/suppress status. Read-only; executed immediately.',
    parameters: { type: 'object', properties: { targetUserId: { type: 'string', description: 'Discord member ID.' } }, required: ['targetUserId'] },
  },
  {
    name: 'preview_embed_message',
    description: 'Validate an embed-like message payload against Discord limits without sending it. Read-only; executed immediately.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' }, fields: { type: 'array', items: { type: 'object' } }, footer: { type: 'string' }, color: { type: 'string' }, imageUrl: { type: 'string' }, thumbnailUrl: { type: 'string' } } },
  },
  {
    name: 'create_channel',
    description: 'Create a proposal to create a Discord channel/category. Creates an action card before execution.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, type: { type: 'string', description: 'text, announcement, voice, forum, category, or stage.' }, parentId: { type: 'string' }, topic: { type: 'string' }, nsfw: { type: 'boolean' }, slowmodeSeconds: { type: 'integer' }, reason: { type: 'string' } }, required: ['name', 'reason'] },
  },
  {
    name: 'edit_channel',
    description: 'Create a proposal to edit a Discord channel name/topic/category/nsfw/slowmode. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, name: { type: 'string' }, parentId: { type: 'string' }, topic: { type: 'string' }, nsfw: { type: 'boolean' }, slowmodeSeconds: { type: 'integer' }, reason: { type: 'string' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'delete_channel',
    description: 'Create a proposal to delete a Discord channel. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, reason: { type: 'string' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'move_channel',
    description: 'Create a proposal to move a channel position or parent category. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, parentId: { type: 'string' }, position: { type: 'integer' }, reason: { type: 'string' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'set_channel_permissions',
    description: 'Create a proposal to edit channel permission overwrites for a role or user. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, targetId: { type: 'string' }, targetType: { type: 'string', enum: ['role', 'user'] }, overwrites: { type: 'object', description: 'Permission overwrite map, e.g. SendMessages false, ViewChannel true, Connect null.' }, reason: { type: 'string' } }, required: ['channelId', 'targetId', 'targetType', 'overwrites', 'reason'] },
  },
  {
    name: 'create_category_with_channels',
    description: 'Create a proposal to create a category and child channels from a small template. Creates an action card before execution.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, channels: { type: 'array', items: { type: 'object' } }, reason: { type: 'string' } }, required: ['name', 'channels', 'reason'] },
  },
  {
    name: 'clone_channel_permissions',
    description: 'Create a proposal to copy permission overwrites from one channel to another. Creates an action card before execution.',
    parameters: { type: 'object', properties: { sourceChannelId: { type: 'string' }, targetChannelId: { type: 'string' }, reason: { type: 'string' } }, required: ['sourceChannelId', 'targetChannelId', 'reason'] },
  },
  {
    name: 'sync_category_permissions',
    description: 'Create a proposal to sync permission overwrites for every child channel in a category. Creates an action card before execution.',
    parameters: { type: 'object', properties: { categoryId: { type: 'string' }, reason: { type: 'string' } }, required: ['categoryId', 'reason'] },
  },
  {
    name: 'rename_channel_batch',
    description: 'Create a proposal to rename multiple channels. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channels: { type: 'array', items: { type: 'object', description: '{ id, name }' } }, reason: { type: 'string' } }, required: ['channels', 'reason'] },
  },
  {
    name: 'cleanup_empty_channels',
    description: 'Create a proposal to delete empty channels from a provided list or category. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channels: { type: 'array', items: { type: 'string' } }, categoryId: { type: 'string' }, reason: { type: 'string' } }, required: ['reason'] },
  },
  {
    name: 'create_role',
    description: 'Create a proposal to create a Discord role. Creates an action card before execution.',
    parameters: { type: 'object', properties: { name: { type: 'string' }, color: { type: 'string' }, hoist: { type: 'boolean' }, mentionable: { type: 'boolean' }, reason: { type: 'string' } }, required: ['name', 'reason'] },
  },
  {
    name: 'edit_role',
    description: 'Create a proposal to edit a Discord role. Creates an action card before execution.',
    parameters: { type: 'object', properties: { roleId: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' }, hoist: { type: 'boolean' }, mentionable: { type: 'boolean' }, reason: { type: 'string' } }, required: ['roleId', 'reason'] },
  },
  {
    name: 'delete_role',
    description: 'Create a proposal to delete a Discord role. Creates an action card before execution.',
    parameters: { type: 'object', properties: { roleId: { type: 'string' }, reason: { type: 'string' } }, required: ['roleId', 'reason'] },
  },
  {
    name: 'move_role',
    description: 'Create a proposal to move a Discord role position. Creates an action card before execution.',
    parameters: { type: 'object', properties: { roleId: { type: 'string' }, position: { type: 'integer' }, reason: { type: 'string' } }, required: ['roleId', 'position', 'reason'] },
  },
  {
    name: 'snapshot_member_roles',
    description: 'Create a proposal to save a member role snapshot for later restore. Creates an action card before execution.',
    parameters: { type: 'object', properties: { targetUserId: { type: 'string' }, reason: { type: 'string' } }, required: ['targetUserId', 'reason'] },
  },
  {
    name: 'restore_member_roles',
    description: 'Create a proposal to restore a member roles from the latest saved snapshot. Creates an action card before execution.',
    parameters: { type: 'object', properties: { targetUserId: { type: 'string' }, quarantineRoleId: { type: 'string' }, reason: { type: 'string' } }, required: ['targetUserId', 'reason'] },
  },
  {
    name: 'quarantine_member',
    description: 'Create a proposal to snapshot a member, remove manageable roles, add a quarantine role, and optionally timeout. Creates an action card before execution.',
    parameters: { type: 'object', properties: { targetUserId: { type: 'string' }, quarantineRoleId: { type: 'string' }, durationMinutes: { type: 'integer' }, removeOtherRoles: { type: 'boolean' }, reason: { type: 'string' } }, required: ['targetUserId', 'quarantineRoleId', 'reason'] },
  },
  {
    name: 'send_plain_message',
    description: 'Create a proposal to send a plain message to a Discord channel. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, content: { type: 'string' }, reason: { type: 'string' } }, required: ['content', 'reason'] },
  },
  {
    name: 'send_embed_message',
    description: 'Create a proposal to send an embed message to a Discord channel. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, content: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, fields: { type: 'array', items: { type: 'object' } }, color: { type: 'string' }, imageUrl: { type: 'string' }, thumbnailUrl: { type: 'string' }, footer: { type: 'string' }, reason: { type: 'string' } }, required: ['reason'] },
  },
  {
    name: 'edit_bot_message',
    description: 'Create a proposal to edit a bot-owned message. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, content: { type: 'string' }, reason: { type: 'string' } }, required: ['messageId', 'content', 'reason'] },
  },
  {
    name: 'delete_bot_message',
    description: 'Create a proposal to delete a bot-owned message. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, reason: { type: 'string' } }, required: ['messageId', 'reason'] },
  },
  {
    name: 'create_thread',
    description: 'Create a proposal to create a Discord thread. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, name: { type: 'string' }, reason: { type: 'string' } }, required: ['name', 'reason'] },
  },
  {
    name: 'archive_thread',
    description: 'Create a proposal to archive or unarchive a thread. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, archived: { type: 'boolean' }, reason: { type: 'string' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'lock_thread',
    description: 'Create a proposal to lock or unlock a thread. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, locked: { type: 'boolean' }, reason: { type: 'string' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'pin_message',
    description: 'Create a proposal to pin a message. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, reason: { type: 'string' } }, required: ['messageId', 'reason'] },
  },
  {
    name: 'unpin_message',
    description: 'Create a proposal to unpin a message. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, reason: { type: 'string' } }, required: ['messageId', 'reason'] },
  },
  {
    name: 'react_to_message',
    description: 'Create a proposal to add a reaction to a message. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, emoji: { type: 'string' }, reason: { type: 'string' } }, required: ['messageId', 'emoji', 'reason'] },
  },
  {
    name: 'remove_reaction',
    description: 'Create a proposal to remove the bot reaction from a message. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, messageId: { type: 'string' }, emoji: { type: 'string' }, reason: { type: 'string' } }, required: ['messageId', 'emoji', 'reason'] },
  },
  {
    name: 'move_member_voice',
    description: 'Create a proposal to move a member to a voice channel. Creates an action card before execution.',
    parameters: { type: 'object', properties: { targetUserId: { type: 'string' }, voiceChannelId: { type: 'string' }, reason: { type: 'string' } }, required: ['targetUserId', 'voiceChannelId', 'reason'] },
  },
  {
    name: 'disconnect_member_voice',
    description: 'Create a proposal to disconnect a member from voice. Creates an action card before execution.',
    parameters: { type: 'object', properties: { targetUserId: { type: 'string' }, reason: { type: 'string' } }, required: ['targetUserId', 'reason'] },
  },
  {
    name: 'set_voice_channel_status',
    description: 'Create a proposal to update voice channel name/user limit/bitrate. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, name: { type: 'string' }, userLimit: { type: 'integer' }, bitrate: { type: 'integer' }, reason: { type: 'string' } }, required: ['channelId', 'reason'] },
  },
  {
    name: 'bot_join_voice',
    description: 'Create a proposal for the bot to join voice. If voiceChannelId is omitted, the backend uses the requesting user current voice channel. If the requester is not in voice, ask them to join voice or provide a specific voiceChannelId. Creates an action card before execution.',
    parameters: { type: 'object', properties: { voiceChannelId: { type: 'string', description: 'Optional voice channel ID. Omit to use the requester current voice channel.' }, reason: { type: 'string' } }, required: ['reason'] },
  },
  {
    name: 'bot_leave_voice',
    description: 'Create a proposal for the bot to leave its active voice connection in this server. Creates an action card before execution.',
    parameters: { type: 'object', properties: { reason: { type: 'string' } }, required: ['reason'] },
  },
  {
    name: 'create_invite',
    description: 'Create a proposal to create an invite link. Creates an action card before execution.',
    parameters: { type: 'object', properties: { channelId: { type: 'string' }, maxAgeSeconds: { type: 'integer' }, maxUses: { type: 'integer' }, temporary: { type: 'boolean' }, unique: { type: 'boolean' }, reason: { type: 'string' } }, required: ['reason'] },
  },
  {
    name: 'delete_invite',
    description: 'Create a proposal to delete an invite code. Creates an action card before execution.',
    parameters: { type: 'object', properties: { code: { type: 'string' }, reason: { type: 'string' } }, required: ['code', 'reason'] },
  },
];
const READ_TOOL_PREFIXES = ['get_', 'find_', 'search_', 'check_', 'preview_'];

export const AGENT_TOOLS: AiToolDefinition[] = RAW_AGENT_TOOLS.map((tool) => {
  const readOnly = READ_TOOL_PREFIXES.some((prefix) => tool.name.startsWith(prefix));
  return {
    ...tool,
    safety: { mode: readOnly ? 'read' : 'write', proposalRequired: !readOnly },
  } as AiToolDefinition;
});