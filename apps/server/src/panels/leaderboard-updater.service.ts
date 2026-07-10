import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordPublisherService } from './discord-publisher.service';
import { PanelsService } from './panels.service';
import { AppLogger } from '../logger/logger.service';

@Injectable()
export class LeaderboardUpdaterService implements OnApplicationBootstrap, OnModuleDestroy {
  private updateInterval?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: DiscordPublisherService,
    private readonly panels: PanelsService,
    private readonly logger: AppLogger,
  ) {}

  onApplicationBootstrap() {
    this.logger.log('Starting Leaderboard background updater (5 minutes interval)...', 'LeaderboardUpdater');

    // Run update every 5 minutes (300,000 ms)
    this.updateInterval = setInterval(() => {
      this.updatePublishedLeaderboards().catch((err) => {
        this.logger.error(`Error in periodic leaderboard update: ${err.message}`, err.stack, 'LeaderboardUpdater');
      });
    }, 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }

  async updatePublishedLeaderboards() {
    const activePanels = await this.prisma.panel.findMany({
      where: {
        type: 'LEADERBOARD',
        status: 'PUBLISHED',
      },
    });

    if (activePanels.length === 0) return;

    this.logger.log(`Found ${activePanels.length} active leaderboard panels. Updating...`, 'LeaderboardUpdater');

    for (const panel of activePanels) {
      try {
        // Fetch panel details along with roles (to match panels.service.get schema)
        const detailedPanel = await this.panels.get(panel.guildId, panel.id);
        const message = await this.publisher.publish(detailedPanel);

        // Update database status and update time
        await this.panels.markPublished(panel.guildId, panel.id, message.id, 'system');
        this.logger.log(`Successfully auto-updated leaderboard panel ${panel.id} in guild ${panel.guildId}`, 'LeaderboardUpdater');
      } catch (error: any) {
        this.logger.error(`Failed to auto-update leaderboard panel ${panel.id}: ${error.message}`, error.stack, 'LeaderboardUpdater');
      }
    }
  }
}
