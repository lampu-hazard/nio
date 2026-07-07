import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { StickersModule } from '../stickers/stickers.module';
import { DiscordAgentService } from './discord-agent.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordMessageLogService } from './discord-message-log.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { ConversationMemoryService } from './conversation-memory.service';

@Module({
  imports: [PrismaModule, ModerationModule, forwardRef(() => StickersModule)],
  providers: [
    DiscordAgentService,
    DiscordAgentContextService,
    DiscordMessageLogService,
    AgentActionProposalService,
    AgentActionRendererService,
    DiscordAgentToolExecutorService,
    ConversationMemoryService,
  ],
  exports: [
    DiscordAgentService,
    DiscordAgentContextService,
    DiscordMessageLogService,
    AgentActionProposalService,
    AgentActionRendererService,
    DiscordAgentToolExecutorService,
    ConversationMemoryService,
  ],
})
export class DiscordAgentModule {}
