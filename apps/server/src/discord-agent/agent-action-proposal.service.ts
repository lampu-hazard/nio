import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, Inject, forwardRef } from '@nestjs/common';
import { Client, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { StickersService } from '../stickers/stickers.service';
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
    @Inject(forwardRef(() => StickersService))
    private readonly stickers: StickersService,
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

    if (input.recommendation.type === 'LOCKDOWN' || input.recommendation.type === 'UNLOCK') {
      payload.channelId = input.recommendation.channelId || input.channelId;
    }

    if (input.recommendation.type === 'SET_SLOWMODE') {
      payload.channelId = input.recommendation.channelId || input.channelId;
      payload.slowmodeSeconds = this.clampNumber(input.recommendation.slowmodeSeconds ?? 0, 0, 21600);
    }

    if (input.recommendation.type === 'SEND_ANNOUNCEMENT') {
      payload.channelId = input.recommendation.channelId || input.channelId;
      payload.content = this.requireString(input.recommendation.content, 'content');

      const title = this.normalizeOptionalString(input.recommendation.title, 256);
      if (title) payload.title = title;

      const color = this.normalizeAnnouncementColor(input.recommendation.announcementColor);
      if (color) payload.announcementColor = color;

      const imageUrl = this.normalizeOptionalUrl(input.recommendation.announcementImageUrl, 'announcementImageUrl');
      if (imageUrl) payload.announcementImageUrl = imageUrl;

      const thumbnailUrl = this.normalizeOptionalUrl(input.recommendation.announcementThumbnailUrl, 'announcementThumbnailUrl');
      if (thumbnailUrl) payload.announcementThumbnailUrl = thumbnailUrl;

      const footer = this.normalizeOptionalString(input.recommendation.announcementFooter, 2048);
      if (footer) payload.announcementFooter = footer;

      payload.announcementPing = this.normalizeAnnouncementPing(input.recommendation.announcementPing);
    }

    if (input.recommendation.type === 'PURGE_USER_MESSAGES') {
      payload.targetUserId = this.requireString(input.recommendation.purgeTargetUserId || input.targetUserId, 'targetUserId');
      payload.limit = this.clampNumber(input.recommendation.purgeLimit || 50, 1, 100);
      const channels = this.normalizeChannelIdList(input.recommendation.purgeUserChannels, 'purgeUserChannels');
      if (channels) payload.channels = channels;
    }

    if (['MASS_TIMEOUT', 'MASS_KICK', 'MASS_BAN'].includes(input.recommendation.type)) {
      const targetUserIds = Array.isArray(input.recommendation.targetUserIds)
        ? input.recommendation.targetUserIds.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
        : [];
      if (targetUserIds.length === 0) {
        throw new BadRequestException('targetUserIds array cannot be empty.');
      }
      payload.targetUserIds = targetUserIds.slice(0, 100); // max 100 users
      if (input.recommendation.type === 'MASS_TIMEOUT') {
        payload.durationMinutes = this.clampNumber(input.recommendation.durationMinutes || 10, 1, MAX_TIMEOUT_MINUTES);
      }
    }

    if (input.recommendation.type === 'MANAGE_STICKER') {
      payload.stickerAction = this.requireString(input.recommendation.stickerAction, 'stickerAction');
      payload.stickerName = this.requireString(input.recommendation.stickerName, 'stickerName');
      if (payload.stickerAction === 'ADD') {
        payload.stickerUrl = this.requireString(input.recommendation.stickerUrl, 'stickerUrl');
      } else if (payload.stickerAction === 'DELETE') {
        payload.stickerId = this.requireString(input.recommendation.stickerId, 'stickerId');
      } else {
        throw new BadRequestException('stickerAction must be ADD or DELETE.');
      }
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
      } else if (actionType === 'LOCKDOWN') {
        const channelId = String(payload.channelId || proposal.channelId);
        const channel = await guild.channels.fetch(channelId).catch(() => null) as any;
        if (!channel || !channel.permissionOverwrites) {
          throw new BadRequestException('Channel does not support permission modifications.');
        }
        await channel.permissionOverwrites.edit(guild.roles.everyone, {
          SendMessages: false,
        }, { reason: String(payload.reason || 'AI recommended lockdown.') });
        message = `LOCKDOWN proposal executed for <#${channelId}>.`;
      } else if (actionType === 'UNLOCK') {
        const channelId = String(payload.channelId || proposal.channelId);
        const channel = await guild.channels.fetch(channelId).catch(() => null) as any;
        if (!channel || !channel.permissionOverwrites) {
          throw new BadRequestException('Channel does not support permission modifications.');
        }
        await channel.permissionOverwrites.edit(guild.roles.everyone, {
          SendMessages: null,
        }, { reason: String(payload.reason || 'AI recommended unlock.') });
        message = `UNLOCK proposal executed for <#${channelId}>.`;
      } else if (actionType === 'SET_SLOWMODE') {
        const channelId = String(payload.channelId || proposal.channelId);
        const channel = await guild.channels.fetch(channelId).catch(() => null) as any;
        if (!channel || typeof channel.setRateLimitPerUser !== 'function') {
          throw new BadRequestException('Channel does not support slowmode.');
        }
        const seconds = this.clampNumber(payload.slowmodeSeconds, 0, 21600);
        await channel.setRateLimitPerUser(seconds, String(payload.reason || 'AI recommended slowmode set.'));
        message = `SET_SLOWMODE proposal executed. Slowmode for <#${channelId}> set to ${seconds} seconds.`;
      } else if (actionType === 'SEND_ANNOUNCEMENT') {
        const channelId = String(payload.channelId || proposal.channelId);
        const channel = await guild.channels.fetch(channelId).catch(() => null) as any;
        if (!channel || !channel.isTextBased()) {
          throw new BadRequestException('Channel is not text-based.');
        }
        const content = String(payload.content);
        const title = payload.title ? String(payload.title) : undefined;

        const colorNum = payload.announcementColor
          ? parseInt(String(payload.announcementColor).replace('#', ''), 16)
          : 0x5865f2;

        const announcementEmbed = new EmbedBuilder()
          .setColor(colorNum)
          .setDescription(content)
          .setTimestamp();

        if (title) announcementEmbed.setTitle(title);
        if (payload.announcementImageUrl) announcementEmbed.setImage(payload.announcementImageUrl);
        if (payload.announcementThumbnailUrl) announcementEmbed.setThumbnail(payload.announcementThumbnailUrl);
        if (payload.announcementFooter) announcementEmbed.setFooter({ text: payload.announcementFooter });

        let pingText = '';
        if (payload.announcementPing === 'everyone') {
          pingText = '@everyone';
        } else if (payload.announcementPing === 'here') {
          pingText = '@here';
        }

        await channel.send({
          content: pingText || undefined,
          embeds: [announcementEmbed],
          allowedMentions: { parse: ['everyone'] },
        });

        message = `SEND_ANNOUNCEMENT proposal executed in <#${channelId}>.`;
      } else if (actionType === 'PURGE_USER_MESSAGES') {
        const result = await this.executePurgeUserMessages(guild, payload);
        message = `PURGE_USER_MESSAGES executed. Deleted ${result.deletedCount} message(s) across ${result.channelCount} channel(s).${result.errors.length ? ` Errors: ${result.errors.slice(0, 3).join('; ')}` : ''}`;
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
      } else if (['MASS_TIMEOUT', 'MASS_KICK', 'MASS_BAN'].includes(actionType)) {
        const targetIds = (payload.targetUserIds as string[]) || [];
        const results = { success: 0, failed: 0, errors: [] as string[] };
        const reason = String(payload.reason || 'AI recommended mass action.');

        for (const targetId of targetIds) {
          try {
            const member = await guild.members.fetch(targetId).catch(() => null);
            if (!member) {
              results.failed++;
              results.errors.push(`User ${targetId} not in guild.`);
              continue;
            }
            if (member.roles.highest.position >= me.roles.highest.position) {
              results.failed++;
              results.errors.push(`User ${targetId} is higher/equal role than bot.`);
              continue;
            }
            if (actionType === 'MASS_TIMEOUT') {
              const minutes = this.clampNumber(payload.durationMinutes || 10, 1, MAX_TIMEOUT_MINUTES);
              await member.timeout(minutes * 60 * 1000, reason);
            } else if (actionType === 'MASS_KICK') {
              await member.kick(reason);
            } else if (actionType === 'MASS_BAN') {
              await member.ban({ reason });
            }
            results.success++;
          } catch (e: any) {
            results.failed++;
            results.errors.push(`User ${targetId}: ${e.message || String(e)}`);
          }
        }
        message = `Mass action executed. Success: ${results.success}, Failed: ${results.failed}.${results.errors.length ? ` Errors: ${results.errors.slice(0, 5).join('; ')}` : ''}`;
      } else if (actionType === 'MANAGE_STICKER') {
        const name = String(payload.stickerName);
        const action = String(payload.stickerAction);
        if (action === 'ADD') {
          const stickerUrl = String(payload.stickerUrl);
          const ext = stickerUrl.split('?')[0].split('.').pop()?.toLowerCase();
          const type: 'image/png' | 'image/jpeg' | 'image/gif' =
            ext === 'gif' ? 'image/gif' : (ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png');

          await this.stickers.create(proposal.guildId, {
            name,
            type,
            key: `stickers/${proposal.guildId}/${name}`, // Mock key to bypass headObject if we need it
          }).catch(async (err) => {
            // If key not found or similar, we try to directly insert to DB and update cache since AI adds URL directly
            if (err.message?.includes('not uploaded')) {
              await this.prisma.sticker.upsert({
                where: { guildId_name: { guildId: proposal.guildId, name } },
                update: { url: stickerUrl, type },
                create: { guildId: proposal.guildId, name, url: stickerUrl, type },
              });
              await this.stickers.loadCache();
            } else {
              throw err;
            }
          });
          message = `Sticker keyword "${name}" added successfully.`;
        } else if (action === 'DELETE') {
          const stickerId = String(payload.stickerId);
          await this.stickers.delete(proposal.guildId, stickerId);
          message = `Sticker keyword "${name}" deleted successfully.`;
        }
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
      || (['WARN', 'TIMEOUT', 'REMOVE_TIMEOUT', 'REVOKE_WARNING', 'MASS_TIMEOUT'].includes(actionType) && permissions.has(PermissionFlagsBits.ModerateMembers))
      || (actionType === 'UPDATE_SETTINGS' && permissions.has(PermissionFlagsBits.ManageGuild))
      || (['KICK', 'MASS_KICK'].includes(actionType) && permissions.has(PermissionFlagsBits.KickMembers))
      || (['BAN', 'MASS_BAN'].includes(actionType) && permissions.has(PermissionFlagsBits.BanMembers))
      || (['PURGE', 'LOCKDOWN', 'UNLOCK', 'PURGE_USER_MESSAGES'].includes(actionType) && permissions.has(PermissionFlagsBits.ManageRoles))
      || (actionType === 'SET_SLOWMODE' && (permissions.has(PermissionFlagsBits.ManageChannels) || permissions.has(PermissionFlagsBits.ModerateMembers)))
      || (actionType === 'SEND_ANNOUNCEMENT' && (permissions.has(PermissionFlagsBits.MentionEveryone) || permissions.has(PermissionFlagsBits.ManageMessages)))
      || (['ADD_ROLE', 'REMOVE_ROLE', 'MANAGE_STICKER'].includes(actionType) && permissions.has(PermissionFlagsBits.ManageRoles));

    if (!hasPermission) {
      throw new ForbiddenException(`You do not have permission to approve ${actionType} proposals.`);
    }
  }

  private assertBotCanExecute(actionType: AgentActionType, me: any, target: any, channelId?: string) {
    if (['TIMEOUT', 'REMOVE_TIMEOUT', 'MASS_TIMEOUT'].includes(actionType) && !me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      throw new ForbiddenException('Bot needs Moderate Members permission to execute timeout proposals.');
    }
    if (['KICK', 'MASS_KICK'].includes(actionType) && !me.permissions.has(PermissionFlagsBits.KickMembers)) {
      throw new ForbiddenException('Bot needs Kick Members permission to execute kick proposals.');
    }
    if (['BAN', 'MASS_BAN'].includes(actionType) && !me.permissions.has(PermissionFlagsBits.BanMembers)) {
      throw new ForbiddenException('Bot needs Ban Members permission to execute ban proposals.');
    }
    if (['PURGE', 'PURGE_USER_MESSAGES'].includes(actionType)) {
      const permissions = channelId && typeof me.permissionsIn === 'function' ? me.permissionsIn(channelId) : me.permissions;
      if (!permissions.has(PermissionFlagsBits.ManageMessages)) {
        throw new ForbiddenException('Bot needs Manage Messages permission in that channel to execute purge proposals.');
      }
    }
    if (['LOCKDOWN', 'UNLOCK'].includes(actionType)) {
      const permissions = channelId && typeof me.permissionsIn === 'function' ? me.permissionsIn(channelId) : me.permissions;
      if (!permissions.has(PermissionFlagsBits.ManageRoles) && !permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new ForbiddenException('Bot needs Manage Roles or Manage Channels permission in that channel to execute lockdown/unlock proposals.');
      }
    }
    if (actionType === 'SET_SLOWMODE') {
      const permissions = channelId && typeof me.permissionsIn === 'function' ? me.permissionsIn(channelId) : me.permissions;
      if (!permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new ForbiddenException('Bot needs Manage Channels permission in that channel to execute slowmode proposals.');
      }
    }
    if (actionType === 'SEND_ANNOUNCEMENT') {
      const permissions = channelId && typeof me.permissionsIn === 'function' ? me.permissionsIn(channelId) : me.permissions;
      if (!permissions.has(PermissionFlagsBits.SendMessages)) {
        throw new ForbiddenException('Bot needs Send Messages permission in that channel to send announcements.');
      }
    }
    if (['ADD_ROLE', 'REMOVE_ROLE', 'MANAGE_STICKER'].includes(actionType) && !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
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
    const eligible = this.filterPurgeEligibleMessages(fetched, payload.targetUserId, limit);

    if (!eligible.length) return { deletedCount: 0 };
    const deleted = await channel.bulkDelete(eligible, true);
    return { deletedCount: deleted.size };
  }

  private async executePurgeUserMessages(guild: any, payload: any) {
    const targetUserId = this.requireString(payload.targetUserId, 'targetUserId');
    const limit = this.clampNumber(payload.limit || 50, 1, MAX_PURGE_LIMIT);
    let channelIds = Array.isArray(payload.channels) ? payload.channels : [];

    if (!channelIds.length) {
      await guild.channels.fetch();
      channelIds = guild.channels.cache
        .filter((channel: any) => channel && typeof channel.isTextBased === 'function' && channel.isTextBased() && typeof channel.bulkDelete === 'function')
        .map((channel: any) => channel.id);
    }

    let deletedCount = 0;
    let channelCount = 0;
    const errors: string[] = [];

    for (const channelId of channelIds) {
      try {
        const channel = await guild.channels.fetch(channelId).catch(() => null) as any;
        if (!channel || typeof channel.bulkDelete !== 'function' || !channel.messages?.fetch) continue;

        channelCount++;
        const fetched = await channel.messages.fetch({ limit: MAX_PURGE_LIMIT });
        const eligible = this.filterPurgeEligibleMessages(fetched, targetUserId, limit);
        if (!eligible.length) continue;

        const deleted = await channel.bulkDelete(eligible, true);
        deletedCount += deleted.size;
      } catch (err: any) {
        errors.push(`Channel ${channelId}: ${err?.message || String(err)}`);
      }
    }

    return { deletedCount, channelCount, errors };
  }

  private filterPurgeEligibleMessages(messages: any, targetUserId: string | undefined, limit: number) {
    const cutoff = Date.now() - BULK_DELETE_MAX_AGE_MS;
    const eligible = messages.filter((message: any) => {
      if (message.createdTimestamp <= cutoff) return false;
      if (targetUserId && message.author?.id !== targetUserId) return false;
      return !message.pinned;
    });

    return Array.from(eligible.values()).slice(0, limit);
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

  private normalizeOptionalString(value: unknown, maxLength: number) {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, maxLength) : undefined;
  }

  private normalizeOptionalUrl(value: unknown, field: string) {
    const trimmed = this.normalizeOptionalString(value, 2048);
    if (!trimmed) return undefined;

    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      throw new BadRequestException(`${field} must be a valid HTTP(S) URL.`);
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException(`${field} must be a valid HTTP(S) URL.`);
    }
    return url.toString();
  }

  private normalizeAnnouncementColor(value: unknown) {
    const trimmed = this.normalizeOptionalString(value, 16);
    if (!trimmed) return undefined;
    const normalized = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
    if (!/^#[0-9a-fA-F]{6}$/.test(normalized)) {
      throw new BadRequestException('announcementColor must be a hex color like #ffaa00.');
    }
    return normalized.toLowerCase();
  }

  private normalizeAnnouncementPing(value: unknown): 'none' | 'here' | 'everyone' {
    if (value === undefined || value === null || value === '') return 'none';
    if (value === 'none' || value === 'here' || value === 'everyone') return value;
    throw new BadRequestException('announcementPing must be none, here, or everyone.');
  }

  private normalizeChannelIdList(value: unknown, field: string) {
    if (value === undefined || value === null) return undefined;
    if (!Array.isArray(value)) throw new BadRequestException(`${field} must be an array of channel IDs.`);

    const seen = new Set<string>();
    const channels = value
      .filter((channelId) => typeof channelId === 'string' && channelId.trim())
      .map((channelId) => channelId.trim())
      .filter((channelId) => {
        if (seen.has(channelId)) return false;
        seen.add(channelId);
        return true;
      });

    if (channels.length > 100) throw new BadRequestException(`${field} cannot contain more than 100 channels.`);
    return channels.length ? channels : undefined;
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
