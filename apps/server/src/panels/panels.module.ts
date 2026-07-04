import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module';
import { DiscordPublisherService } from './discord-publisher.service';
import { PanelRendererService } from './panel-renderer.service';
import { PanelsController } from './panels.controller';
import { PanelsService } from './panels.service';

@Module({
  imports: [DiscordModule],
  controllers: [PanelsController],
  providers: [PanelsService, PanelRendererService, DiscordPublisherService],
  exports: [PanelsService, PanelRendererService],
})
export class PanelsModule {}
