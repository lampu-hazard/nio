import { Body, Controller, Get, Param, Patch, Req, UseGuards, Query } from '@nestjs/common';
import { Request } from 'express';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from './guards/guild-access.guard';
import { GuildsService } from './guilds.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@UseGuards(SessionAuthGuard)
@Controller('guilds')
export class GuildsController {
  constructor(private readonly guilds: GuildsService) {}

  @Get()
  list(@Req() req: Request) {
    return { ok: true, guilds: this.guilds.listManageable(req.session.guilds || []) };
  }

  @Get(':guildId/channels')
  async channels(@Param('guildId') guildId: string) {
    return { ok: true, channels: await this.guilds.getChannels(guildId) };
  }

  @Get(':guildId/roles')
  async roles(@Param('guildId') guildId: string) {
    return { ok: true, roles: await this.guilds.getRoles(guildId) };
  }

  @UseGuards(GuildAccessGuard)
  @Get(':guildId/audit-logs')
  async auditLogs(
    @Param('guildId') guildId: string,
    @Query('userId') userId?: string,
    @Query('excludeSystem') excludeSystem?: string,
    @Query('action') action?: string,
  ) {
    return { ok: true, auditLogs: await this.guilds.getAuditLogs(guildId, { userId, excludeSystem, action }) };
  }

  @UseGuards(GuildAccessGuard)
  @Get(':guildId/settings')
  async getSettings(@Param('guildId') guildId: string) {
    return { ok: true, settings: await this.guilds.getSettings(guildId) };
  }

  @UseGuards(GuildAccessGuard)
  @Patch(':guildId/settings')
  async updateSettings(@Param('guildId') guildId: string, @Body() dto: UpdateSettingsDto) {
    return { ok: true, settings: await this.guilds.updateSettings(guildId, dto) };
  }
}
