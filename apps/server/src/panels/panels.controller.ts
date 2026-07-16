import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser, SessionUser } from '../common/decorators/current-user.decorator';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { DiscordPublisherService } from './discord-publisher.service';
import { PanelsService } from './panels.service';
import { CreatePanelDto } from './dto/create-panel.dto';
import { UpdatePanelDto } from './dto/update-panel.dto';
import { CreatePanelRoleDto } from './dto/create-panel-role.dto';
import { UpdatePanelRoleDto } from './dto/update-panel-role.dto';
import { ReorderPanelRolesDto } from './dto/reorder-panel-roles.dto';
import { UploadUrlDto } from './dto/upload-url.dto';
import { R2Service } from '../r2/r2.service';
import { randomUUID } from 'crypto';

const MAX_PANEL_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

@UseGuards(SessionAuthGuard, GuildAccessGuard)
@Controller('guilds/:guildId')
export class PanelsController {
  constructor(
    private readonly panels: PanelsService,
    private readonly publisher: DiscordPublisherService,
    private readonly r2: R2Service,
  ) {}

  @Post('panels/upload-url')
  async uploadUrl(@Param('guildId') guildId: string, @Body() dto: UploadUrlDto) {
    const ext = dto.fileName.split('.').pop() || 'png';
    const key = `panels/${guildId}/${randomUUID()}.${ext}`;
    const uploadUrl = await this.r2.getPresignedUploadUrl(key, dto.contentType, MAX_PANEL_IMAGE_SIZE);
    return { ok: true, uploadUrl, key, url: this.r2.getPublicUrl(key) };
  }

  @Get('panels')
  async list(@Param('guildId') guildId: string) {
    return { ok: true, panels: await this.panels.list(guildId) };
  }

  @Post('panels')
  async create(@Param('guildId') guildId: string, @CurrentUser() user: SessionUser, @Body() dto: CreatePanelDto) {
    return { ok: true, panel: await this.panels.create(guildId, user.id, dto) };
  }

  @Get('panels/:panelId')
  async get(@Param('guildId') guildId: string, @Param('panelId') panelId: string) {
    return { ok: true, panel: await this.panels.get(guildId, panelId) };
  }

  @Patch('panels/:panelId')
  async update(
    @Param('guildId') guildId: string,
    @Param('panelId') panelId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdatePanelDto,
  ) {
    return { ok: true, panel: await this.panels.update(guildId, panelId, user.id, dto) };
  }

  @Delete('panels/:panelId')
  async archive(
    @Param('guildId') guildId: string,
    @Param('panelId') panelId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return { ok: true, panel: await this.panels.archive(guildId, panelId, user.id) };
  }

  @Post('panels/:panelId/roles')
  async addRole(
    @Param('guildId') guildId: string,
    @Param('panelId') panelId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: CreatePanelRoleDto,
  ) {
    return { ok: true, role: await this.panels.addRole(guildId, panelId, user.id, dto) };
  }

  @Patch('panels/:panelId/roles/reorder')
  async reorderRoles(
    @Param('guildId') guildId: string,
    @Param('panelId') panelId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: ReorderPanelRolesDto,
  ) {
    return { ok: true, panel: await this.panels.reorderRoles(guildId, panelId, user.id, dto) };
  }

  @Patch('panels/:panelId/roles/:roleOptionId')
  async updateRole(
    @Param('guildId') guildId: string,
    @Param('panelId') panelId: string,
    @Param('roleOptionId') roleOptionId: string,
    @CurrentUser() user: SessionUser,
    @Body() dto: UpdatePanelRoleDto,
  ) {
    return { ok: true, role: await this.panels.updateRole(guildId, panelId, roleOptionId, user.id, dto) };
  }

  @Delete('panels/:panelId/roles/:roleOptionId')
  async removeRole(
    @Param('guildId') guildId: string,
    @Param('panelId') panelId: string,
    @Param('roleOptionId') roleOptionId: string,
    @CurrentUser() user: SessionUser,
  ) {
    return { ok: true, role: await this.panels.removeRole(guildId, panelId, roleOptionId, user.id) };
  }

  @Post('panels/:panelId/publish')
  async publish(
    @Param('guildId') guildId: string,
    @Param('panelId') panelId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const panel = await this.panels.get(guildId, panelId);
    const message = await this.publisher.publish(panel);
    const updated = await this.panels.markPublished(guildId, panelId, message.id, user.id);
    return { ok: true, messageId: message.id, panel: updated };
  }

  @Delete('panels/:panelId/publish')
  async unpublish(
    @Param('guildId') guildId: string,
    @Param('panelId') panelId: string,
    @CurrentUser() user: SessionUser,
  ) {
    const panel = await this.panels.get(guildId, panelId);
    await this.publisher.deletePublishedMessage(panel);
    const updated = await this.panels.markUnpublished(guildId, panelId, user.id);
    return { ok: true, panel: updated };
  }

  @Get('analytics')
  async analytics(@Param('guildId') guildId: string, @Query('days') days?: string) {
    return { ok: true, analytics: await this.panels.analytics(guildId, days) };
  }

  @Get('analytics/chart-data')
  async chartData(@Param('guildId') guildId: string) {
    return { ok: true, ...(await this.panels.chartData(guildId)) };
  }
}
