import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { UpdateAiAgentSettingsDto } from '../discord-agent/dto/update-ai-agent-settings.dto';
import { UpdateSettingsDto } from '../guilds/dto/update-settings.dto';
import { OwnerAccessGuard } from './owner-access.guard';
import { OwnerService } from './owner.service';

@Controller('owner')
@UseGuards(SessionAuthGuard, OwnerAccessGuard)
export class OwnerController {
  constructor(private readonly owner: OwnerService) {}

  @Get('overview')
  overview(@Query('days') days?: string) {
    return this.owner.overview(this.parseDays(days));
  }

  @Get('guilds')
  guilds(@Query('query') query = '') {
    if (query.length > 100) throw new BadRequestException('Search query is too long.');
    return this.owner.listGuilds(query);
  }

  @Get('guilds/:guildId')
  guild(@Param('guildId') guildId: string, @Query('days') days?: string) {
    return this.owner.getGuild(guildId, this.parseDays(days));
  }

  @Patch('guilds/:guildId/settings')
  updateSettings(@Param('guildId') guildId: string, @Body() dto: UpdateSettingsDto) {
    return this.owner.updateGuildSettings(guildId, dto);
  }

  @Patch('guilds/:guildId/ai-agent')
  updateAiSettings(@Param('guildId') guildId: string, @Body() dto: UpdateAiAgentSettingsDto) {
    return this.owner.updateAiSettings(guildId, dto);
  }

  @Post('guilds/:guildId/leave')
  leaveGuild(@Param('guildId') guildId: string) {
    return this.owner.leaveGuild(guildId);
  }

  private parseDays(value?: string) {
    if (value === undefined) return 30;
    const days = Number(value);
    if (!Number.isInteger(days) || days < 1 || days > 90) {
      throw new BadRequestException('Days must be an integer from 1 to 90.');
    }
    return days;
  }
}
