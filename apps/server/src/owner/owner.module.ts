import { Module } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module';
import { DiscordAgentModule } from '../discord-agent/discord-agent.module';
import { GuildsModule } from '../guilds/guilds.module';
import { OwnerController } from './owner.controller';
import { OwnerService } from './owner.service';
import { OwnerAccessGuard } from './owner-access.guard';

@Module({
  imports: [DiscordModule, DiscordAgentModule, GuildsModule],
  controllers: [OwnerController],
  providers: [OwnerService, OwnerAccessGuard],
})
export class OwnerModule {}
