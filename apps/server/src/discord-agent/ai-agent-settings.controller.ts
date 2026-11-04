import { Body, Controller, Get, Optional, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { AiAgentSettingsService } from './ai-agent-settings.service';
import { UpdateAiAgentSettingsDto } from './dto/update-ai-agent-settings.dto';
import { AgentQuotaQueryService } from './quota/agent-quota-query.service';
import { AgentProfileManagerGuard } from './agent-profile-manager.guard';
import { parseAgentProfile } from './agent-profile.types';
import { AgentToolPolicyService } from './agent-tool-policy.service';

@Controller('guilds/:guildId/ai-agent')
@UseGuards(SessionAuthGuard, GuildAccessGuard)
export class AiAgentSettingsController {
  constructor(
    private readonly settings: AiAgentSettingsService,
    private readonly quotas: AgentQuotaQueryService,
    @Optional() private readonly toolPolicy?: AgentToolPolicyService,
  ) {}

  @Get('profiles/:profile/tools')
  async getProfileTools(@Param('guildId') guildId: string, @Param('profile') profile: string) {
    return { ok: true, tools: (await this.toolPolicy?.catalog({ guildId, profile: parseAgentProfile(profile) })) ?? [] };
  }

  @Get('profiles/:profile/quotas')
  async getProfileQuotas(@Param('guildId') guildId: string, @Param('profile') profile: string, @Query('cursor') cursor?: string, @Query('size') size?: string) {
    return { ok: true, quotas: await this.quotas.getToday({ guildId, profile: parseAgentProfile(profile) }, cursor, size) };
  }

  @Get('profiles/:profile/settings')
  async getProfileSettings(@Param('guildId') guildId: string, @Param('profile') profile: string) {
    return { ok: true, settings: await this.settings.getSettings({ guildId, profile: parseAgentProfile(profile) }) };
  }

  @Patch('profiles/:profile/settings')
  @UseGuards(AgentProfileManagerGuard)
  async updateProfileSettings(@Param('guildId') guildId: string, @Param('profile') profile: string, @Body() dto: UpdateAiAgentSettingsDto) {
    return { ok: true, settings: await this.settings.updateSettings({ guildId, profile: parseAgentProfile(profile) }, dto) };
  }

  @Get('profiles/:profile/usage')
  async getProfileUsage(@Param('guildId') guildId: string, @Param('profile') profile: string, @Query('days') days?: string) {
    return { ok: true, usage: await this.settings.getUsage({ guildId, profile: parseAgentProfile(profile) }, Number(days)) };
  }

  @Get('quotas')
  async getQuotas(@Param('guildId') guildId: string, @Query('cursor') cursor?: string, @Query('size') size?: string) {
    return this.getProfileQuotas(guildId, 'ADMIN', cursor, size);
  }

  @Get('settings')
  async getSettings(@Param('guildId') guildId: string) {
    return this.getProfileSettings(guildId, 'ADMIN');
  }

  @Patch('settings')
  @UseGuards(AgentProfileManagerGuard)
  async updateSettings(@Param('guildId') guildId: string, @Body() dto: UpdateAiAgentSettingsDto) {
    return this.updateProfileSettings(guildId, 'ADMIN', dto);
  }

  @Get('usage')
  async getUsage(@Param('guildId') guildId: string, @Query('days') days?: string) {
    return this.getProfileUsage(guildId, 'ADMIN', days);
  }

  @Get('tools')
  async getTools(@Param('guildId') guildId: string) {
    return this.getProfileTools(guildId, 'ADMIN');
  }
}
