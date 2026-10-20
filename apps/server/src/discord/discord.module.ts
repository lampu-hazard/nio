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
import { SlowmodeEngineService } from './slowmode-engine.service';
import { AnomalyEngineService } from './anomaly-engine.service';
import { DiscordAnomalyService } from './discord-anomaly.service';
import { DiscordAgentModule } from '../discord-agent/discord-agent.module';
import { DiscordVoiceConnectionService } from './discord-voice-connection.service';
import { HallOfFameService } from './hall-of-fame.service';

@Module({
  imports: [SelfRolesModule, StickersModule, ModerationModule, BoosterRoleModule, TakoModule, DiscordAgentModule, EmbedTemplateModule],
  providers: [
    DiscordBotService,
    DiscordInteractionService,
    DiscordPermissionService,
    DiscordSlowmodeService,
    SlowmodeEngineService,
    AnomalyEngineService,
    DiscordAnomalyService,
    DiscordVoiceConnectionService,
    HallOfFameService,
  ],
  exports: [
    DiscordBotService,
    DiscordPermissionService,
    DiscordSlowmodeService,
    SlowmodeEngineService,
    AnomalyEngineService,
    DiscordAnomalyService,
    DiscordVoiceConnectionService,
    HallOfFameService,
  ],
})
export class DiscordModule {}
