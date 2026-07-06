import { Injectable } from '@nestjs/common';
import { ModerationService } from '../moderation/moderation.service';
import { GuildsService } from '../guilds/guilds.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { DiscordMessageLogService } from './discord-message-log.service';

@Injectable()
export class DiscordAgentToolExecutorService {
  constructor(
    private readonly moderation: ModerationService,
    private readonly guilds: GuildsService,
    private readonly proposals: AgentActionProposalService,
    private readonly messageLogs: DiscordMessageLogService,
  ) {}

  async execute(
    name: string,
    args: any,
    context: { guildId: string; channelId: string; requestedById: string },
  ): Promise<any> {
    switch (name) {
      case 'get_user_warnings':
        return this.moderation.listWarnings(context.guildId, { search: args.targetUserId });

      case 'get_server_settings':
        return this.guilds.getSettings(context.guildId);

      case 'get_channel_message_logs':
        return this.messageLogs.getUserRecentMessages(context.guildId, args.targetUserId, args.limit || 15);

      case 'warn_user':
        const warnProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: args.targetUserId,
          recommendation: { type: 'WARN', reason: args.reason },
        });
        return { proposalCreated: true, proposalId: warnProposal.id, actionType: 'WARN' };

      case 'timeout_user':
        const timeoutProposal = await this.proposals.createProposal({
          guildId: context.guildId,
          channelId: context.channelId,
          requestedById: context.requestedById,
          targetUserId: args.targetUserId,
          recommendation: { type: 'TIMEOUT', reason: args.reason, durationMinutes: args.durationMinutes || 10 },
        });
        return { proposalCreated: true, proposalId: timeoutProposal.id, actionType: 'TIMEOUT' };

      default:
        throw new Error(`Tool ${name} is not implemented.`);
    }
  }
}
