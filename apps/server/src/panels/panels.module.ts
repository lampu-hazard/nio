import { Module, forwardRef } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module';
import { DiscordPublisherService } from './discord-publisher.service';
import { PanelRendererService } from './panel-renderer.service';
import { PanelsController } from './panels.controller';
import { PanelsService } from './panels.service';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';
import { LeaderboardUpdaterService } from './leaderboard-updater.service';

@Module({
  imports: [DiscordModule, forwardRef(() => LeaderboardModule)],
  controllers: [PanelsController],
  providers: [PanelsService, PanelRendererService, DiscordPublisherService, LeaderboardUpdaterService],
  exports: [PanelsService, PanelRendererService, LeaderboardUpdaterService],
})
export class PanelsModule {}
