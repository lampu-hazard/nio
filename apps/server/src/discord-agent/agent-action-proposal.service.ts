import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Client, PermissionFlagsBits } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { CreateAgentActionProposalInput, AgentActionType, AgentSettingsUpdate } from './agent-action.types';

const PROPOSAL_TTL_MS = 10 * 60 * 1000;
const MAX_TIMEOUT_MINUTES = 1440;
const MAX_BAN_DELETE_MESSAGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_PURGE_LIMIT = 100;
const BULK_DELETE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const ANOMALY_ENFORCEMENT_MODES = new Set(['AUDIT_ONLY', 'DELETE_HIGH_CONFIDENCE', 'DELETE_AND_TIMEOUT_CRITICAL']);

type SlowmodeCacheUpdater = {
  updateGuildCache: (guildId: string, settings: {
    slowmodeEnabled: boolean;
    slowmodeChannels: string[];
    slowmodeIntervalQuiet: number;
    slowmodeIntervalNormal: number;
    slowmodeIntervalBusy: number;
  }) => void;
};

type AnomalyCacheUpdater = {
  updateGuildCache: (guildId: string, settings: {
    enabled: boolean;
    phishingEnabled: boolean;
    contentAnomalyEnabled: boolean;
    userAnomalyEnabled: boolean;
    guildBaselineEnabled: boolean;
    enforcementMode: 'AUDIT_ONLY' | 'DELETE_HIGH_CONFIDENCE' | 'DELETE_AND_TIMEOUT_CRITICAL';
  }) => void;
};

@Injectable()
export class AgentActionProposalService {
  private client?: Client;
  private slowmode?: SlowmodeCacheUpdater;
  private anomaly?: AnomalyCacheUpdater;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
  ) {}

  setClient(client: Client) {
    this.client = client;
  }

  setSlowmodeService(slowmode: SlowmodeCacheUpdater) {
    this.slowmode = slowmode;
  }

  setAnomalyService(anomaly: AnomalyCacheUpdater) {
    this.anomaly = anomaly;
  }

  async createProposal(input: CreateAgentActionProposalInput) {
    const reason = input.recommendation.reason.trim().slice(0, 512) || 'AI recommended moderation action.';
    const payload: any = { reason };

    if (input.recommendation.type === 'TIMEOUT') {
      payload.durationMinutes = this.clampNumber(input.recommendation.durationMinutes || 10, 1, MAX_TIMEOUT_MINUTES);
    }

    if (input.recommendation.type === 'UPDATE_SETTINGS') {
      const settings = this.normalizeSettings(input.recommendation.settings || {});
      if (!Object.keys(settings).length) {
        throw new BadRequestException('At least one supported setting must be provided.');
      }
      payload.settings = settings;
    }

    if (input.recommendation.type === 'BAN') {
      payload.deleteMessageSeconds = this.clampNumber(input.recommendation.deleteMessageSeconds || 0, 0, MAX_BAN_DELETE_MESSAGE_SECONDS);
    }

    if (input.recommendation.type === 'PURGE') {
      payload.channelId = input.recommendation.purgeChannelId || input.channelId;
      payload.limit = this.clampNumber(input.recommendation.purgeLimit || 10, 1, MAX_PURGE_LIMIT);
      if (input.recommendation.purgeTargetUserId) payload.targetUserId = input.recommendation.purgeTargetUserId;
    }

    if (input.recommendation.type === 'ADD_ROLE' || input.recommendation.type === 'REMOVE_ROLE') {
      payload.roleId = this.requireString(input.recommendation.roleId, 'roleId');
    }

    if (input.recommendation.type === 'REVOKE_WARNING') {
      payload.warningId = this.requireString(input.recommendation.warningId, 'warningId');
    }

    return this.prisma.agentActionProposal.create({
      data: {
        guildId: input.guildId,
        channelId: input.channelId,
        requestedById: input.requestedById,
        targetUserId: input.targetUserId || null,
        actionType: input.recommendation.type,
        payload: payload,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + PROPOSAL_TTL_MS),
      },
    });
  }

  async cancelProposal(proposalId: string, userId: string) {
    const proposal = await this.prisma.agentActionProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new BadRequestException('Proposal not found.');
    if (proposal.status !== 'PENDING') throw new BadRequestException('Proposal is no longer pending.');
    if (proposal.requestedById !== userId) throw new ForbiddenException('Only the requester can cancel this proposal.');

    await this.prisma.agentActionProposal.update({
      where: { id: proposalId },
      data: { status: 'CANCELLED' },
    });

    return { ok: true, message: 'Proposal cancelled.' };
  }

  async approveAndExecute(proposalId: string, userId: string) {
    if (!this.client) throw new ServiceUnavailableException('Discord client is not ready yet.');

    const proposal = await this.prisma.agentActionProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw new BadRequestException('Proposal not found.');
    if (proposal.status !== 'PENDING') throw new BadRequestException('Proposal is no longer pending.');
    if (proposal.expiresAt.getTime() < Date.now()) {
      await this.prisma.agentActionProposal.update({ where: { id: proposalId }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('Proposal has expired.');
    }

    const guild = await this.client.guilds.fetch(proposal.guildId);
    const approver = await guild.members.fetch(userId);
    const actionType = proposal.actionType as AgentActionType;
    const payload = proposal.payload as any;
    const targetRequired = ['WARN', 'TIMEOUT', 'KICK', 'ADD_ROLE', 'REMOVE_ROLE', 'REMOVE_TIMEOUT'].includes(actionType);
    const target = proposal.targetUserId ? await guild.members.fetch(proposal.targetUserId).catch(() => null) : null;

    if (targetRequired && !target) {
      throw new BadRequestException('Target member is not available in this server.');
    }

    this.assertApproverCanExecute(actionType, approver, payload.channelId || proposal.channelId);

    const me = guild.members.me ?? await guild.members.fetchMe();
    this.assertBotCanExecute(actionType, me, target, payload.channelId || proposal.channelId);

    await this.prisma.agentActionProposal.update({ where: { id: proposalId }, data: { status: 'APPROVED' } });

    try {
      let message = `${proposal.actionType} proposal executed.`;

      if (actionType === 'WARN') {
        if (!target) throw new BadRequestException('Target member is not available in this server.');
        await this.moderation.createWarning(proposal.guildId, target.id, userId, String(payload.reason || 'AI recommended warning.'));
      } else if (actionType === 'TIMEOUT') {
        if (!target) throw new BadRequestException('Target member is not available in this server.');
        const durationMinutes = this.clampNumber(payload.durationMinutes || 10, 1, MAX_TIMEOUT_MINUTES);
        await target.timeout(durationMinutes * 60 * 1000, String(payload.reason || 'AI recommended timeout.'));
      } else if (actionType === 'KICK') {
        if (!target) throw new BadRequestException('Target member is not available in this server.');
        await target.kick(String(payload.reason || 'AI recommended kick.'));
      } else if (actionType === 'BAN') {
        if (!proposal.targetUserId) throw new BadRequestException('Target user is required for ban proposals.');
        await guild.bans.create(proposal.targetUserId, {
          deleteMessageSeconds: this.clampNumber(payload.deleteMessageSeconds || 0, 0, MAX_BAN_DELETE_MESSAGE_SECONDS),
          reason: String(payload.reason || 'AI recommended ban.'),
        });
      } else if (actionType === 'PURGE') {
        const result = await this.executePurge(guild, payload, proposal.channelId);
        message = `PURGE proposal executed. Deleted ${result.deletedCount} message(s).`;
      } else if (actionType === 'UPDATE_SETTINGS') {
        await this.executeSettingsUpdate(proposal.guildId, payload.settings || {});
      } else if (actionType === 'ADD_ROLE') {
        if (!target) throw new BadRequestException('Target member is not available in this server.');
        const role = await this.resolveManageableRole(guild, payload.roleId);
        await target.roles.add(role, String(payload.reason || 'AI recommended role add.'));
      } else if (actionType === 'REMOVE_ROLE') {
        if (!target) throw new BadRequestException('Target member is not available in this server.');
        const role = await this.resolveManageableRole(guild, payload.roleId);
        await target.roles.remove(role, String(payload.reason || 'AI recommended role removal.'));
      } else if (actionType === 'REMOVE_TIMEOUT') {
        if (!target) throw new BadRequestException('Target member is not available in this server.');
        await target.timeout(null, String(payload.reason || 'AI recommended timeout removal.'));
      } else if (actionType === 'REVOKE_WARNING') {
        await this.moderation.revokeWarning(proposal.guildId, String(payload.warningId));
      } else {
        throw new BadRequestException(`Unsupported proposal action: ${proposal.actionType}`);
      }

      await this.prisma.agentActionProposal.update({
        where: { id: proposalId },
        data: { status: 'EXECUTED', executedAt: new Date(), error: null },
      });

      return { ok: true, message };
    } catch (err: any) {
      await this.prisma.agentActionProposal.update({
        where: { id: proposalId },
        data: { status: 'FAILED', error: err?.message || String(err) },
      });
      throw err;
    }
  }

  private assertApproverCanExecute(actionType: AgentActionType, approver: any, channelId?: string) {
    const permissions = actionType === 'PURGE' && channelId && typeof approver.permissionsIn === 'function'
      ? approver.permissionsIn(channelId)
      : approver.permissions;

    const hasPermission = permissions.has(PermissionFlagsBits.Administrator)
      || (['WARN', 'TIMEOUT', 'REMOVE_TIMEOUT', 'REVOKE_WARNING'].includes(actionType) && permissions.has(PermissionFlagsBits.ModerateMembers))
      || (actionType === 'UPDATE_SETTINGS' && permissions.has(PermissionFlagsBits.ManageGuild))
      || (actionType === 'KICK' && permissions.has(PermissionFlagsBits.KickMembers))
      || (actionType === 'BAN' && permissions.has(PermissionFlagsBits.BanMembers))
      || (actionType === 'PURGE' && permissions.has(PermissionFlagsBits.ManageMessages))
      || (['ADD_ROLE', 'REMOVE_ROLE'].includes(actionType) && permissions.has(PermissionFlagsBits.ManageRoles));

    if (!hasPermission) {
      throw new ForbiddenException(`You do not have permission to approve ${actionType} proposals.`);
    }
  }

  private assertBotCanExecute(actionType: AgentActionType, me: any, target: any, channelId?: string) {
    if (['TIMEOUT', 'REMOVE_TIMEOUT'].includes(actionType) && !me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      throw new ForbiddenException('Bot needs Moderate Members permission to execute timeout proposals.');
    }
    if (actionType === 'KICK' && !me.permissions.has(PermissionFlagsBits.KickMembers)) {
      throw new ForbiddenException('Bot needs Kick Members permission to execute kick proposals.');
    }
    if (actionType === 'BAN' && !me.permissions.has(PermissionFlagsBits.BanMembers)) {
      throw new ForbiddenException('Bot needs Ban Members permission to execute ban proposals.');
    }
    if (actionType === 'PURGE') {
      const permissions = channelId && typeof me.permissionsIn === 'function' ? me.permissionsIn(channelId) : me.permissions;
      if (!permissions.has(PermissionFlagsBits.ManageMessages)) {
        throw new ForbiddenException('Bot needs Manage Messages permission in that channel to execute purge proposals.');
      }
    }
    if (['ADD_ROLE', 'REMOVE_ROLE'].includes(actionType) && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new ForbiddenException('Bot needs Manage Roles permission to execute role proposals.');
    }

    if (target && ['TIMEOUT', 'KICK', 'BAN', 'ADD_ROLE', 'REMOVE_ROLE', 'REMOVE_TIMEOUT'].includes(actionType) && target.roles.highest.position >= me.roles.highest.position) {
      throw new ForbiddenException('Target member is not manageable by the bot.');
    }
  }

  private async resolveManageableRole(guild: any, roleId: string) {
    const role = await guild.roles.fetch(this.requireString(roleId, 'roleId')).catch(() => null);
    if (!role) throw new BadRequestException('Role is not available in this server.');
    if (role.managed) throw new BadRequestException('Managed roles cannot be changed manually.');

    const me = guild.members.me ?? await guild.members.fetchMe();
    if (role.position >= me.roles.highest.position) {
      throw new ForbiddenException('Role is not manageable by the bot.');
    }

    return role;
  }

  private async executePurge(guild: any, payload: any, fallbackChannelId: string) {
    const channelId = String(payload.channelId || fallbackChannelId);
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || typeof channel.bulkDelete !== 'function' || !channel.messages?.fetch) {
      throw new BadRequestException('Channel does not support bulk message deletion.');
    }

    const limit = this.clampNumber(payload.limit || 10, 1, MAX_PURGE_LIMIT);
    const fetched = await channel.messages.fetch({ limit });
    const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
    const eligible = fetched.filter((message: any) => {
      if (message.createdTimestamp <= cutoff) return false;
      if (payload.targetUserId && message.author?.id !== payload.targetUserId) return false;
      return !message.pinned;
    });

    if (!eligible.size) return { deletedCount: 0 };
    const deleted = await channel.bulkDelete(eligible, true);
    return { deletedCount: deleted.size };
  }

  private async executeSettingsUpdate(guildId: string, rawSettings: AgentSettingsUpdate) {
    const settings = this.normalizeSettings(rawSettings);
    if (!Object.keys(settings).length) {
      throw new BadRequestException('At least one supported setting must be provided.');
    }

    const updated = await this.prisma.guildSettings.upsert({
      where: { guildId },
      update: settings,
      create: {
        guildId,
        ...settings,
      },
    });

    this.slowmode?.updateGuildCache(guildId, {
      slowmodeEnabled: updated.slowmodeEnabled,
      slowmodeChannels: updated.slowmodeChannels,
      slowmodeIntervalQuiet: updated.slowmodeIntervalQuiet,
      slowmodeIntervalNormal: updated.slowmodeIntervalNormal,
      slowmodeIntervalBusy: updated.slowmodeIntervalBusy,
    });

    this.anomaly?.updateGuildCache(guildId, {
      enabled: updated.anomalyEnabled,
      phishingEnabled: updated.phishingDetectionEnabled,
      contentAnomalyEnabled: updated.contentAnomalyEnabled,
      userAnomalyEnabled: updated.userAnomalyEnabled,
      guildBaselineEnabled: updated.guildBaselineEnabled,
      enforcementMode: this.normalizeAnomalyMode(updated.anomalyEnforcementMode),
    });
  }

  private normalizeSettings(settings: AgentSettingsUpdate) {
    const normalized: AgentSettingsUpdate = {};
    if ('logChannelId' in settings) normalized.logChannelId = settings.logChannelId || null;
    if ('messageDeleteLogChannelId' in settings) normalized.messageDeleteLogChannelId = settings.messageDeleteLogChannelId || null;
    this.copyBoolean(settings, normalized, 'stickerEnabled');
    this.copyBoolean(settings, normalized, 'slowmodeEnabled');
    if (Array.isArray(settings.slowmodeChannels)) {
      normalized.slowmodeChannels = settings.slowmodeChannels.filter((channelId) => typeof channelId === 'string' && channelId.trim()).map((channelId) => channelId.trim());
    }
    if (settings.slowmodeIntervalQuiet !== undefined) normalized.slowmodeIntervalQuiet = this.clampNumber(settings.slowmodeIntervalQuiet, 0, 21600);
    if (settings.slowmodeIntervalNormal !== undefined) normalized.slowmodeIntervalNormal = this.clampNumber(settings.slowmodeIntervalNormal, 0, 21600);
    if (settings.slowmodeIntervalBusy !== undefined) normalized.slowmodeIntervalBusy = this.clampNumber(settings.slowmodeIntervalBusy, 0, 21600);
    this.copyBoolean(settings, normalized, 'anomalyEnabled');
    this.copyBoolean(settings, normalized, 'phishingDetectionEnabled');
    this.copyBoolean(settings, normalized, 'contentAnomalyEnabled');
    this.copyBoolean(settings, normalized, 'userAnomalyEnabled');
    this.copyBoolean(settings, normalized, 'guildBaselineEnabled');
    if (settings.anomalyEnforcementMode) normalized.anomalyEnforcementMode = this.normalizeAnomalyMode(settings.anomalyEnforcementMode);
    this.copyBoolean(settings, normalized, 'warnLimitEnabled');
    if (settings.warnLimitThreshold !== undefined) normalized.warnLimitThreshold = this.clampNumber(settings.warnLimitThreshold, 1, 25);
    if (settings.warnTimeoutDurationMin !== undefined) normalized.warnTimeoutDurationMin = this.clampNumber(settings.warnTimeoutDurationMin, 1, MAX_TIMEOUT_MINUTES);
    if (settings.warnExpiryDays !== undefined) normalized.warnExpiryDays = this.clampNumber(settings.warnExpiryDays, 0, 3650);
    return normalized;
  }

  private copyBoolean(source: AgentSettingsUpdate, target: AgentSettingsUpdate, key: keyof AgentSettingsUpdate) {
    if (typeof source[key] === 'boolean') (target as any)[key] = source[key];
  }

  private requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required.`);
    }
    return value.trim();
  }

  private normalizeAnomalyMode(value: string): 'AUDIT_ONLY' | 'DELETE_HIGH_CONFIDENCE' | 'DELETE_AND_TIMEOUT_CRITICAL' {
    return ANOMALY_ENFORCEMENT_MODES.has(value) ? value as any : 'AUDIT_ONLY';
  }

  private clampNumber(value: unknown, min: number, max: number) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return min;
    return Math.min(Math.max(Math.floor(numberValue), min), max);
  }
}
