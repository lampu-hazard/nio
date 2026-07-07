import { BadRequestException, Injectable, ServiceUnavailableException, ForbiddenException } from '@nestjs/common';
import { Client, PermissionFlagsBits } from 'discord.js';
import { ModerationService } from '../moderation/moderation.service';
import { PrismaService } from '../prisma/prisma.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordMessageLogService } from './discord-message-log.service';
import { AgentSettingsUpdate } from './agent-action.types';

const MAX_READ_LIMIT = 50;

@Injectable()
export class DiscordAgentToolExecutorService {
  private client?: Client;

  constructor(
    private readonly moderation: ModerationService,
    private readonly prisma: PrismaService,
    private readonly proposals: AgentActionProposalService,
    private readonly messageLogs: DiscordMessageLogService,
    private readonly contextService: DiscordAgentContextService,
  ) {}

  setClient(client: Client) {
    this.client = client;
  }

  async execute(
    name: string,
    args: any,
    context: { guildId: string; channelId: string; requestedById: string },
  ): Promise<any> {
    switch (name) {
      case 'get_user_warnings':
        return this.moderation.listWarnings(context.guildId, { search: this.requireString(args.targetUserId, 'targetUserId') });

      case 'get_member_info':
        return this.contextService.buildModContext(context.guildId, this.requireString(args.targetUserId, 'targetUserId'));

      case 'get_server_settings':
        return this.getServerSettings(context.guildId);

      case 'get_channel_recent_messages':
        return this.getChannelRecentMessages(context.guildId, args.channelId || context.channelId, args.targetUserId, args.limit);

      case 'get_deleted_message_history':
        return this.getDeletedMessageHistory(context.guildId, args.channelId, args.targetUserId, args.limit);

      case 'get_server_channels':
        return this.getServerChannels(context.guildId);

      case 'get_server_roles':
        return this.getServerRoles(context.guildId);

      case 'get_channel_slowmode':
        return this.getChannelSlowmode(context.guildId, args.channelId || context.channelId);

      case 'warn_user': {
        const warnProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: this.requireString(args.targetUserId, 'targetUserId'),
          recommendation: { type: 'WARN', reason: this.requireString(args.reason, 'reason') },
        });
        return { proposalCreated: true, proposalId: warnProposal.id, actionType: 'WARN' };
      }

      case 'timeout_user': {
        const timeoutProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: this.requireString(args.targetUserId, 'targetUserId'),
          recommendation: {
            type: 'TIMEOUT',
            reason: this.requireString(args.reason, 'reason'),
            durationMinutes: args.durationMinutes || 10,
          },
        });
        return { proposalCreated: true, proposalId: timeoutProposal.id, actionType: 'TIMEOUT' };
      }

      case 'kick_user': {
        const kickProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: this.requireString(args.targetUserId, 'targetUserId'),
          recommendation: { type: 'KICK', reason: this.requireString(args.reason, 'reason') },
        });
        return { proposalCreated: true, proposalId: kickProposal.id, actionType: 'KICK' };
      }

      case 'ban_user': {
        const banProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: this.requireString(args.targetUserId, 'targetUserId'),
          recommendation: {
            type: 'BAN',
            reason: this.requireString(args.reason, 'reason'),
            deleteMessageSeconds: args.deleteMessageSeconds,
          },
        });
        return { proposalCreated: true, proposalId: banProposal.id, actionType: 'BAN' };
      }

      case 'purge_channel_messages': {
        const purgeProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: args.targetUserId || null,
          recommendation: {
            type: 'PURGE',
            reason: this.requireString(args.reason, 'reason'),
            purgeLimit: args.limit,
            purgeChannelId: args.channelId || context.channelId,
            purgeTargetUserId: args.targetUserId,
          },
        });
        return { proposalCreated: true, proposalId: purgeProposal.id, actionType: 'PURGE' };
      }

      case 'add_role_to_user': {
        const roleProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: this.requireString(args.targetUserId, 'targetUserId'),
          recommendation: {
            type: 'ADD_ROLE',
            reason: this.requireString(args.reason, 'reason'),
            roleId: this.requireString(args.roleId, 'roleId'),
          },
        });
        return { proposalCreated: true, proposalId: roleProposal.id, actionType: 'ADD_ROLE' };
      }

      case 'remove_role_from_user': {
        const roleProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: this.requireString(args.targetUserId, 'targetUserId'),
          recommendation: {
            type: 'REMOVE_ROLE',
            reason: this.requireString(args.reason, 'reason'),
            roleId: this.requireString(args.roleId, 'roleId'),
          },
        });
        return { proposalCreated: true, proposalId: roleProposal.id, actionType: 'REMOVE_ROLE' };
      }

      case 'remove_timeout_user': {
        const timeoutProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: this.requireString(args.targetUserId, 'targetUserId'),
          recommendation: { type: 'REMOVE_TIMEOUT', reason: this.requireString(args.reason, 'reason') },
        });
        return { proposalCreated: true, proposalId: timeoutProposal.id, actionType: 'REMOVE_TIMEOUT' };
      }

      case 'revoke_warning': {
        const warningProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: null,
          recommendation: {
            type: 'REVOKE_WARNING',
            reason: this.requireString(args.reason, 'reason'),
            warningId: this.requireString(args.warningId, 'warningId'),
          },
        });
        return { proposalCreated: true, proposalId: warningProposal.id, actionType: 'REVOKE_WARNING' };
      }

      case 'update_server_settings': {
        const settings = this.extractSettings(args);
        if (!Object.keys(settings).length) {
          throw new BadRequestException('At least one supported setting must be provided.');
        }
        const settingsProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: null,
          recommendation: {
            type: 'UPDATE_SETTINGS',
            reason: this.requireString(args.reason, 'reason'),
            settings,
          },
        });
        return { proposalCreated: true, proposalId: settingsProposal.id, actionType: 'UPDATE_SETTINGS' };
      }

      case 'lockdown_channel': {
        const lockdownProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: null,
          recommendation: {
            type: 'LOCKDOWN',
            reason: this.requireString(args.reason, 'reason'),
            channelId: args.channelId || context.channelId,
          },
        });
        return { proposalCreated: true, proposalId: lockdownProposal.id, actionType: 'LOCKDOWN' };
      }

      case 'unlock_channel': {
        const unlockProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: null,
          recommendation: {
            type: 'UNLOCK',
            reason: this.requireString(args.reason, 'reason'),
            channelId: args.channelId || context.channelId,
          },
        });
        return { proposalCreated: true, proposalId: unlockProposal.id, actionType: 'UNLOCK' };
      }

      case 'set_channel_slowmode': {
        const slowmodeProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: null,
          recommendation: {
            type: 'SET_SLOWMODE',
            reason: this.requireString(args.reason, 'reason'),
            channelId: args.channelId || context.channelId,
            slowmodeSeconds: args.slowmodeSeconds,
          },
        });
        return { proposalCreated: true, proposalId: slowmodeProposal.id, actionType: 'SET_SLOWMODE' };
      }

      case 'send_channel_announcement': {
        const announcementProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: null,
          recommendation: {
            type: 'SEND_ANNOUNCEMENT',
            reason: this.requireString(args.reason, 'reason'),
            channelId: args.channelId || context.channelId,
            content: this.requireString(args.content, 'content'),
            title: args.title || undefined,
          },
        });
        return { proposalCreated: true, proposalId: announcementProposal.id, actionType: 'SEND_ANNOUNCEMENT' };
      }

      case 'get_discord_audit_logs':
        return this.getDiscordAuditLogs(context.guildId, args.limit, args.targetUserId, args.actionType);

      case 'check_user_activity_score':
        return this.checkUserActivityScore(context.guildId, this.requireString(args.targetUserId, 'targetUserId'), args.days);

      case 'get_recent_joins':
        return this.getRecentJoins(context.guildId, args.limit, args.hours);

      case 'mass_moderation_action': {
        const targetIds = Array.isArray(args.targetUserIds)
          ? args.targetUserIds.filter((id: unknown) => typeof id === 'string' && id.trim()).map((id: string) => id.trim())
          : [];
        if (targetIds.length === 0) {
          throw new BadRequestException('targetUserIds array is empty or invalid.');
        }
        const actionType = this.requireString(args.actionType, 'actionType').toUpperCase();
        if (!['TIMEOUT', 'KICK', 'BAN'].includes(actionType)) {
          throw new BadRequestException('Invalid mass actionType. Supported: TIMEOUT, KICK, BAN');
        }
        const recommendationType = `MASS_${actionType}` as any;
        const massProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: null,
          recommendation: {
            type: recommendationType,
            reason: this.requireString(args.reason, 'reason'),
            targetUserIds: targetIds,
            durationMinutes: args.durationMinutes,
          },
        });
        return { proposalCreated: true, proposalId: massProposal.id, actionType: recommendationType };
      }

      case 'get_invite_links':
        return this.getInviteLinks(context.guildId);

      case 'add_user_note':
        return this.addUserNote(
          context.guildId,
          this.requireString(args.targetUserId, 'targetUserId'),
          context.requestedById,
          this.requireString(args.content, 'content'),
        );

      case 'get_user_notes':
        return this.getUserNotes(context.guildId, this.requireString(args.targetUserId, 'targetUserId'));

      case 'manage_server_sticker': {
        const action = this.requireString(args.action, 'action').toUpperCase();
        if (!['ADD', 'DELETE'].includes(action)) {
          throw new BadRequestException('action must be ADD or DELETE.');
        }
        const stickerProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: null,
          recommendation: {
            type: 'MANAGE_STICKER',
            reason: this.requireString(args.reason, 'reason'),
            stickerName: this.requireString(args.name, 'name'),
            stickerUrl: args.url || undefined,
            stickerId: args.stickerId || undefined,
            stickerAction: action as any,
          },
        });
        return { proposalCreated: true, proposalId: stickerProposal.id, actionType: 'MANAGE_STICKER' };
      }

      default:
        throw new Error(`Tool ${name} is not implemented.`);
    }
  }

  private async getServerSettings(guildId: string) {
    const settings = await this.prisma.guildSettings.findUnique({
      where: { guildId },
    });
    return {
      logChannelId: settings?.logChannelId || null,
      messageDeleteLogChannelId: settings?.messageDeleteLogChannelId || null,
      stickerEnabled: settings?.stickerEnabled || false,
      slowmodeEnabled: settings?.slowmodeEnabled || false,
      slowmodeChannels: settings?.slowmodeChannels || [],
      slowmodeIntervalQuiet: settings?.slowmodeIntervalQuiet ?? 0,
      slowmodeIntervalNormal: settings?.slowmodeIntervalNormal ?? 5,
      slowmodeIntervalBusy: settings?.slowmodeIntervalBusy ?? 10,
      anomalyEnabled: settings?.anomalyEnabled || false,
      phishingDetectionEnabled: settings?.phishingDetectionEnabled ?? true,
      contentAnomalyEnabled: settings?.contentAnomalyEnabled ?? true,
      userAnomalyEnabled: settings?.userAnomalyEnabled ?? true,
      guildBaselineEnabled: settings?.guildBaselineEnabled ?? true,
      anomalyEnforcementMode: settings?.anomalyEnforcementMode || 'AUDIT_ONLY',
      warnLimitEnabled: settings?.warnLimitEnabled || false,
      warnLimitThreshold: settings?.warnLimitThreshold ?? 3,
      warnTimeoutDurationMin: settings?.warnTimeoutDurationMin ?? 60,
      warnExpiryDays: settings?.warnExpiryDays ?? 30,
    };
  }

  private async getChannelRecentMessages(guildId: string, channelId: string, targetUserId?: string, rawLimit?: number) {
    const limit = this.clampNumber(rawLimit || 15, 1, MAX_READ_LIMIT);
    const messages = await this.messageLogs.getChannelRecentMessages(guildId, this.requireString(channelId, 'channelId'), limit, targetUserId);
    return messages.map((message) => ({
      id: message.id,
      channelId: message.channelId,
      authorId: message.authorId,
      content: message.content,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      attachments: message.attachments,
    }));
  }

  private async getDeletedMessageHistory(guildId: string, channelId?: string, targetUserId?: string, rawLimit?: number) {
    const limit = this.clampNumber(rawLimit || 15, 1, MAX_READ_LIMIT);
    const messages = await this.messageLogs.getDeletedMessages(guildId, limit, {
      channelId: typeof channelId === 'string' && channelId.trim() ? channelId.trim() : undefined,
      userId: typeof targetUserId === 'string' && targetUserId.trim() ? targetUserId.trim() : undefined,
    });
    return messages.map((message) => ({
      id: message.id,
      channelId: message.channelId,
      authorId: message.authorId,
      content: message.content,
      createdAt: message.createdAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      attachments: message.attachments,
    }));
  }

  private async getServerChannels(guildId: string) {
    const guild = await this.getGuild(guildId);
    await guild.channels.fetch();
    return guild.channels.cache
      .filter((channel: any) => channel && typeof channel.isTextBased === 'function' && channel.isTextBased())
      .map((channel: any) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId || null,
        rateLimitPerUser: typeof channel.rateLimitPerUser === 'number' ? channel.rateLimitPerUser : null,
      }))
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
  }

  private async getServerRoles(guildId: string) {
    const guild = await this.getGuild(guildId);
    await guild.roles.fetch();
    const me = guild.members.me ?? await guild.members.fetchMe();
    return guild.roles.cache
      .filter((role) => role.id !== guild.id)
      .map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
        managed: role.managed,
        mentionable: role.mentionable,
        color: role.hexColor,
        manageableByBot: !role.managed && role.position < me.roles.highest.position,
      }))
      .sort((a, b) => b.position - a.position);
  }

  private async getChannelSlowmode(guildId: string, channelId: string) {
    const guild = await this.getGuild(guildId);
    const channel = await guild.channels.fetch(this.requireString(channelId, 'channelId'));
    if (!channel || typeof (channel as any).rateLimitPerUser !== 'number') {
      throw new BadRequestException('Channel does not support slowmode.');
    }
    return {
      channelId: channel.id,
      rateLimitPerUser: (channel as any).rateLimitPerUser,
    };
  }

  private async getGuild(guildId: string) {
    if (!this.client) throw new ServiceUnavailableException('Discord client is not ready yet.');
    const guild = await this.client.guilds.fetch(guildId).catch(() => null);
    if (!guild) throw new BadRequestException('Guild is not available.');
    return guild;
  }

  private requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required.`);
    }
    return value.trim();
  }

  private clampNumber(value: unknown, min: number, max: number) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return min;
    return Math.min(Math.max(Math.floor(numberValue), min), max);
  }

  private extractSettings(args: any): AgentSettingsUpdate {
    const settings: AgentSettingsUpdate = {};
    this.copyStringOrNull(args, settings, 'logChannelId');
    this.copyStringOrNull(args, settings, 'messageDeleteLogChannelId');
    this.copyBoolean(args, settings, 'stickerEnabled');
    this.copyBoolean(args, settings, 'slowmodeEnabled');
    this.copyStringArray(args, settings, 'slowmodeChannels');
    this.copyInteger(args, settings, 'slowmodeIntervalQuiet');
    this.copyInteger(args, settings, 'slowmodeIntervalNormal');
    this.copyInteger(args, settings, 'slowmodeIntervalBusy');
    this.copyBoolean(args, settings, 'anomalyEnabled');
    this.copyBoolean(args, settings, 'phishingDetectionEnabled');
    this.copyBoolean(args, settings, 'contentAnomalyEnabled');
    this.copyBoolean(args, settings, 'userAnomalyEnabled');
    this.copyBoolean(args, settings, 'guildBaselineEnabled');
    this.copyString(args, settings, 'anomalyEnforcementMode');
    this.copyBoolean(args, settings, 'warnLimitEnabled');
    this.copyInteger(args, settings, 'warnLimitThreshold');
    this.copyInteger(args, settings, 'warnTimeoutDurationMin');
    this.copyInteger(args, settings, 'warnExpiryDays');
    return settings;
  }

  private copyBoolean(source: any, target: Record<string, any>, key: string) {
    if (typeof source[key] === 'boolean') target[key] = source[key];
  }

  private copyInteger(source: any, target: Record<string, any>, key: string) {
    if (source[key] === undefined || source[key] === null || source[key] === '') return;
    const value = Number(source[key]);
    if (Number.isFinite(value)) target[key] = Math.floor(value);
  }

  private copyString(source: any, target: Record<string, any>, key: string) {
    if (typeof source[key] === 'string' && source[key].trim()) target[key] = source[key].trim();
  }

  private copyStringOrNull(source: any, target: Record<string, any>, key: string) {
    if (source[key] === null) {
      target[key] = null;
      return;
    }
    if (typeof source[key] === 'string') target[key] = source[key].trim() || null;
  }

  private copyStringArray(source: any, target: Record<string, any>, key: string) {
    if (Array.isArray(source[key])) {
      target[key] = source[key].filter((value: unknown) => typeof value === 'string' && value.trim()).map((value: string) => value.trim());
    }
  }

  private async getDiscordAuditLogs(guildId: string, limit?: number, targetUserId?: string, actionType?: string) {
    const guild = await this.getGuild(guildId);
    const me = guild.members.me ?? await guild.members.fetchMe();

    if (!me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
      throw new ForbiddenException('Bot lacks View Audit Log permission in this server.');
    }

    const fetchedLogs = await guild.fetchAuditLogs({
      limit: this.clampNumber(limit || 15, 1, MAX_READ_LIMIT),
      user: targetUserId || undefined,
      type: actionType ? (Number.isInteger(Number(actionType)) ? Number(actionType) : actionType as any) : undefined,
    });

    return fetchedLogs.entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      reason: entry.reason || null,
      executorId: entry.executor?.id || null,
      executorTag: entry.executor?.tag || null,
      targetId: entry.targetId || null,
      createdAt: entry.createdAt,
      changes: entry.changes?.map((c) => ({
        key: c.key,
        old: c.old,
        new: c.new,
      })) || [],
    }));
  }

  private async checkUserActivityScore(guildId: string, targetUserId: string, days?: number) {
    const daysClamped = this.clampNumber(days || 7, 1, 30);
    const cutoff = new Date(Date.now() - daysClamped * 24 * 60 * 60 * 1000);

    const logs = await this.prisma.discordMessageLog.findMany({
      where: {
        guildId,
        authorId: targetUserId,
        createdAt: { gte: cutoff },
      },
      select: {
        id: true,
        channelId: true,
        content: true,
        createdAt: true,
        deletedAt: true,
      },
    });

    const totalMessages = logs.length;
    const activeDays = new Set(logs.map((log) => log.createdAt.toDateString())).size;
    const channels = new Set(logs.map((log) => log.channelId));
    const totalDeleted = logs.filter((log) => log.deletedAt !== null).length;

    // Metric: 1 point per message, 10 per active day, 5 per unique channel
    const score = totalMessages * 1 + activeDays * 10 + channels.size * 5;

    return {
      targetUserId,
      days: daysClamped,
      totalMessages,
      activeDays,
      uniqueChannels: channels.size,
      totalDeleted,
      score,
      level: score > 150 ? 'HIGH' : score > 50 ? 'MEDIUM' : 'LOW',
    };
  }

  private async getRecentJoins(guildId: string, limit?: number, hours?: number) {
    const guild = await this.getGuild(guildId);
    const limitClamped = this.clampNumber(limit || 15, 1, 100);
    const hoursClamped = this.clampNumber(hours || 24, 1, 168);
    const cutoff = Date.now() - hoursClamped * 60 * 60 * 1000;

    await guild.members.fetch();
    const members = guild.members.cache
      .filter((m) => m.joinedTimestamp !== null && m.joinedTimestamp >= cutoff)
      .map((m) => {
        const ageMs = Date.now() - m.user.createdTimestamp;
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        const ageDesc = ageDays > 0 ? `${ageDays} days old` : 'new account (today)';
        return {
          id: m.id,
          username: m.user.username,
          displayName: m.user.globalName || m.user.username,
          joinedAt: m.joinedAt,
          createdAt: m.user.createdAt,
          accountAge: ageDesc,
        };
      })
      .sort((a, b) => (b.joinedAt?.getTime() || 0) - (a.joinedAt?.getTime() || 0))
      .slice(0, limitClamped);

    return {
      guildId,
      timeWindowHours: hoursClamped,
      memberCount: members.length,
      members,
    };
  }

  private async getInviteLinks(guildId: string) {
    const guild = await this.getGuild(guildId);
    const invites = await guild.invites.fetch().catch(() => null);
    if (!invites) return { guildId, count: 0, invites: [] };

    return {
      guildId,
      count: invites.size,
      invites: invites.map((inv) => ({
        code: inv.code,
        url: inv.url,
        creator: inv.inviter?.tag || inv.inviter?.id || 'Unknown',
        channel: inv.channel?.name || inv.channel?.id || 'Unknown',
        uses: inv.uses || 0,
        maxUses: inv.maxUses || 0,
        expiresAt: inv.expiresAt || null,
      })),
    };
  }

  private async addUserNote(guildId: string, userId: string, moderatorId: string, content: string) {
    const note = await this.prisma.userNote.create({
      data: {
        guildId,
        userId,
        moderatorId,
        content: content.trim(),
      },
    });

    return {
      success: true,
      note: {
        id: note.id,
        userId: note.userId,
        moderatorId: note.moderatorId,
        content: note.content,
        createdAt: note.createdAt,
      },
    };
  }

  private async getUserNotes(guildId: string, userId: string) {
    const notes = await this.prisma.userNote.findMany({
      where: { guildId, userId },
      orderBy: { createdAt: 'desc' },
    });

    const client = this.client;
    const formattedNotes = await Promise.all(
      notes.map(async (n: any) => {
        let moderatorTag = n.moderatorId;
        if (client) {
          const mod = await client.users.fetch(n.moderatorId).catch(() => null);
          if (mod) moderatorTag = mod.tag;
        }
        return {
          id: n.id,
          content: n.content,
          moderatorId: n.moderatorId,
          moderatorTag,
          createdAt: n.createdAt,
        };
      }),
    );

    return {
      guildId,
      userId,
      count: notes.length,
      notes: formattedNotes,
    };
  }
}
