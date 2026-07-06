import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Client, PermissionFlagsBits } from 'discord.js';
import { PrismaService } from '../prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';
import { CreateAgentActionProposalInput } from './agent-action.types';

const PROPOSAL_TTL_MS = 10 * 60 * 1000;
const MAX_TIMEOUT_MINUTES = 1440;

@Injectable()
export class AgentActionProposalService {
  private client?: Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moderation: ModerationService,
  ) {}

  setClient(client: Client) {
    this.client = client;
  }

  async createProposal(input: CreateAgentActionProposalInput) {
    const reason = input.recommendation.reason.trim().slice(0, 512) || 'AI recommended moderation action.';
    const payload: any = { reason };

    if (input.recommendation.type === 'TIMEOUT') {
      const durationMinutes = Math.min(
        Math.max(Number(input.recommendation.durationMinutes || 10), 1),
        MAX_TIMEOUT_MINUTES,
      );
      payload.durationMinutes = durationMinutes;
    }

    return this.prisma.agentActionProposal.create({
      data: {
        guildId: input.guildId,
        channelId: input.channelId,
        requestedById: input.requestedById,
        targetUserId: input.targetUserId,
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

    const settings = await this.prisma.discordAgentSettings.findUnique({ where: { guildId: proposal.guildId } });
    const allowedUsers = settings?.allowedUserIds?.length
      ? settings.allowedUserIds
      : (process.env.DISCORD_AGENT_ALLOWED_USER_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);

    if (proposal.requestedById !== userId && !allowedUsers.includes(userId)) {
      throw new ForbiddenException('You are not allowed to approve this proposal.');
    }

    const guild = await this.client.guilds.fetch(proposal.guildId);
    const approver = await guild.members.fetch(userId);
    const target = proposal.targetUserId ? await guild.members.fetch(proposal.targetUserId).catch(() => null) : null;
    if (!target) throw new BadRequestException('Target member is not available in this server.');

    const hasModeratorPermission = approver.permissions.has(PermissionFlagsBits.ModerateMembers)
      || approver.permissions.has(PermissionFlagsBits.KickMembers)
      || approver.permissions.has(PermissionFlagsBits.BanMembers)
      || approver.permissions.has(PermissionFlagsBits.Administrator);
    if (!hasModeratorPermission) throw new ForbiddenException('You need moderation permissions to approve this proposal.');

    const me = guild.members.me ?? await guild.members.fetchMe();
    if (proposal.actionType === 'TIMEOUT' && !me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      throw new ForbiddenException('Bot needs Moderate Members permission to execute timeout proposals.');
    }

    if (target.roles.highest.position >= me.roles.highest.position && proposal.actionType === 'TIMEOUT') {
      throw new ForbiddenException('Target member is not manageable by the bot.');
    }

    await this.prisma.agentActionProposal.update({ where: { id: proposalId }, data: { status: 'APPROVED' } });

    try {
      const payload = proposal.payload as any;
      if (proposal.actionType === 'WARN') {
        await this.moderation.createWarning(proposal.guildId, target.id, userId, String(payload.reason || 'AI recommended warning.'));
      } else if (proposal.actionType === 'TIMEOUT') {
        const durationMinutes = Math.min(Math.max(Number(payload.durationMinutes || 10), 1), MAX_TIMEOUT_MINUTES);
        await target.timeout(durationMinutes * 60 * 1000, String(payload.reason || 'AI recommended timeout.'));
      } else {
        throw new BadRequestException(`Unsupported proposal action: ${proposal.actionType}`);
      }

      await this.prisma.agentActionProposal.update({
        where: { id: proposalId },
        data: { status: 'EXECUTED', executedAt: new Date(), error: null },
      });

      return { ok: true, message: `${proposal.actionType} proposal executed.` };
    } catch (err: any) {
      await this.prisma.agentActionProposal.update({
        where: { id: proposalId },
        data: { status: 'FAILED', error: err?.message || String(err) },
      });
      throw err;
    }
  }
}
