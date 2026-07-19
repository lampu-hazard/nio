import { Module } from '@nestjs/common';
import { SelfRolesModule } from '../self-roles/self-roles.module';
import { StickersModule } from '../stickers/stickers.module';
import { ModerationModule } from '../moderation/moderation.module';
import { BoosterRoleModule } from '../booster-role/booster-role.module';
import { TakoModule } from '../tako/tako.module';
import { EmbedTemplateModule } from '../embed-templates/embed-template.module';
import { DiscordBotService } from './discord-bot.service';
import { DiscordInteractionService } from './discord-interaction.service';
import { DiscordPermissionService } from './discord-permission.service';
import { DiscordSlowmodeService } from './discord-slowmode.service';
import { RustSlowmodeClientService } from './rust-slowmode-client.service';
import { RustAnomalyClientService } from './rust-anomaly-client.service';
import { DiscordAnomalyService } from './discord-anomaly.service';
import { DiscordAgentModule } from '../discord-agent/discord-agent.module';
import { RustAnalyticsClientService } from './rust-analytics-client.service';
import { DiscordVoiceConnectionService } from './discord-voice-connection.service';

@Module({
  imports: [SelfRolesModule, StickersModule, ModerationModule, BoosterRoleModule, TakoModule, DiscordAgentModule, EmbedTemplateModule],
  providers: [
    DiscordBotService,
    DiscordInteractionService,
    DiscordPermissionService,
    DiscordSlowmodeService,
    RustSlowmodeClientService,
    RustAnomalyClientService,
    DiscordAnomalyService,
    RustAnalyticsClientService,
    DiscordVoiceConnectionService,
  ],
  exports: [
    DiscordBotService,
    DiscordPermissionService,
    DiscordSlowmodeService,
    RustSlowmodeClientService,
    RustAnomalyClientService,
    DiscordAnomalyService,
    RustAnalyticsClientService,
    DiscordVoiceConnectionService,
  ],
})
export class DiscordModule {}
