import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { GuildsModule } from '../guilds/guilds.module';
import { DiscordAgentService } from './discord-agent.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordMessageLogService } from './discord-message-log.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';

@Module({
  imports: [PrismaModule, ModerationModule, GuildsModule],
  providers: [
    DiscordAgentService,
    DiscordAgentContextService,
    DiscordMessageLogService,
    AgentActionProposalService,
    AgentActionRendererService,
    DiscordAgentToolExecutorService,
  ],
  exports: [
    DiscordAgentService,
    DiscordAgentContextService,
    DiscordMessageLogService,
    AgentActionProposalService,
    AgentActionRendererService,
    DiscordAgentToolExecutorService,
  ],
})
export class DiscordAgentModule {}
