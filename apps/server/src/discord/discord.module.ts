import { Module } from '@nestjs/common';
import { SelfRolesModule } from '../self-roles/self-roles.module';
import { StickersModule } from '../stickers/stickers.module';
import { ModerationModule } from '../moderation/moderation.module';
import { DiscordBotService } from './discord-bot.service';
import { DiscordInteractionService } from './discord-interaction.service';
import { DiscordPermissionService } from './discord-permission.service';
import { DiscordSlowmodeService } from './discord-slowmode.service';
import { RustSlowmodeClientService } from './rust-slowmode-client.service';
import { RustAnomalyClientService } from './rust-anomaly-client.service';
import { DiscordAnomalyService } from './discord-anomaly.service';

@Module({
  imports: [SelfRolesModule, StickersModule, ModerationModule],
  providers: [
    DiscordBotService,
    DiscordInteractionService,
    DiscordPermissionService,
    DiscordSlowmodeService,
    RustSlowmodeClientService,
    RustAnomalyClientService,
    DiscordAnomalyService,
  ],
  exports: [
    DiscordBotService,
    DiscordPermissionService,
    DiscordSlowmodeService,
    RustSlowmodeClientService,
    RustAnomalyClientService,
    DiscordAnomalyService,
  ],
})
export class DiscordModule {}
