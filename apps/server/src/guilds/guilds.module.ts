import { Module, forwardRef } from '@nestjs/common';
import { DiscordModule } from '../discord/discord.module';
import { StickersModule } from '../stickers/stickers.module';
import { GuildsController } from './guilds.controller';
import { GuildsService } from './guilds.service';

@Module({
  imports: [forwardRef(() => DiscordModule), StickersModule],
  controllers: [GuildsController],
  providers: [GuildsService],
  exports: [GuildsService],
})
export class GuildsModule {}
