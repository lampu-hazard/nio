import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationModule } from '../moderation/moderation.module';
import { StickersModule } from '../stickers/stickers.module';
import { EmbedTemplateModule } from '../embed-templates/embed-template.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { DiscordAgentService } from './discord-agent.service';
import { DiscordAgentContextService } from './discord-agent-context.service';
import { DiscordMessageLogService } from './discord-message-log.service';
import { AgentActionProposalService } from './agent-action-proposal.service';
import { AgentActionRendererService } from './agent-action-renderer.service';
import { DiscordAgentToolExecutorService } from './discord-agent-tool-executor.service';
import { ConversationMemoryService } from './conversation-memory.service';
import { McpToolService } from './mcp-tool.service';
import { AgentRunService } from './agent-run.service';
import { AiAgentSettingsController } from './ai-agent-settings.controller';
import { AiAgentSettingsService } from './ai-agent-settings.service';
import { PluginsModule } from '../plugins/plugins.module';

@Module({
  imports: [
    PrismaModule,
    ModerationModule,
    forwardRef(() => StickersModule),
    EmbedTemplateModule,
    forwardRef(() => LeaderboardModule),
    PluginsModule,
  ],
  controllers: [AiAgentSettingsController],
  providers: [
    DiscordAgentService,
    DiscordAgentContextService,
    DiscordMessageLogService,
    AgentActionProposalService,
    AgentActionRendererService,
    DiscordAgentToolExecutorService,
    ConversationMemoryService,
    McpToolService,
    AgentRunService,
    AiAgentSettingsService,
  ],
  exports: [
    DiscordAgentService,
    DiscordAgentContextService,
    DiscordMessageLogService,
    AgentActionProposalService,
    AgentActionRendererService,
    DiscordAgentToolExecutorService,
    ConversationMemoryService,
    McpToolService,
    AgentRunService,
    AiAgentSettingsService,
  ],
})
export class DiscordAgentModule {}
