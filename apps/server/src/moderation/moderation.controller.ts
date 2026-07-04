import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { ModerationService } from './moderation.service';
import { UpdateModerationSettingsDto } from './dto/update-moderation-settings.dto';

@UseGuards(SessionAuthGuard, GuildAccessGuard)
@Controller('guilds/:guildId/moderation')
export class ModerationController {
  constructor(private readonly moderation: ModerationService) {}

  @Get('settings')
  async getSettings(@Param('guildId') guildId: string) {
    return { ok: true, settings: await this.moderation.getSettings(guildId) };
  }

  @Patch('settings')
  async updateSettings(
    @Param('guildId') guildId: string,
    @Body() dto: UpdateModerationSettingsDto,
  ) {
    return { ok: true, settings: await this.moderation.updateSettings(guildId, dto) };
  }

  @Get('warnings')
  async listWarnings(
    @Param('guildId') guildId: string,
    @Query('search') search?: string,
    @Query('moderator') moderator?: string,
    @Query('status') status?: 'all' | 'active' | 'expired',
    @Query('sort') sort?: 'newest' | 'oldest',
  ) {
    const warnings = await this.moderation.listWarningsWithProfiles(guildId, {
      search,
      moderator,
      status,
      sort,
    });
    return { ok: true, warnings };
  }

  @Delete('warnings/:id')
  async revokeWarning(@Param('guildId') guildId: string, @Param('id') id: string) {
    await this.moderation.revokeWarning(guildId, id);
    return { ok: true };
  }
}
