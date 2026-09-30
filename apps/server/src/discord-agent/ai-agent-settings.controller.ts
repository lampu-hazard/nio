import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { AiAgentSettingsService } from './ai-agent-settings.service';
import { UpdateAiAgentSettingsDto } from './dto/update-ai-agent-settings.dto';
import { Body } from '@nestjs/common';

@Controller('guilds/:guildId/ai-agent')
@UseGuards(SessionAuthGuard, GuildAccessGuard)
export class AiAgentSettingsController {
  constructor(private readonly settings: AiAgentSettingsService) {}

  @Get('settings')
  async getSettings(@Param('guildId') guildId: string) {
    return { ok: true, settings: await this.settings.getSettings(guildId) };
  }

  @Patch('settings')
  async updateSettings(@Param('guildId') guildId: string, @Body() dto: UpdateAiAgentSettingsDto) {
    return { ok: true, settings: await this.settings.updateSettings(guildId, dto) };
  }

  @Get('usage')
  async getUsage(@Param('guildId') guildId: string, @Query('days') days?: string) {
    return { ok: true, usage: await this.settings.getUsage(guildId, Number(days)) };
  }
}
