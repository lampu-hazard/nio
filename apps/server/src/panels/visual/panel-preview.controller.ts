import { Body, Controller, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IsInt, IsObject, IsOptional, Min } from 'class-validator';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../../guilds/guards/guild-access.guard';
import { CurrentUser, SessionUser } from '../../common/decorators/current-user.decorator';
import { AppError } from '../../common/errors/app-error';
import { PanelsService } from '../panels.service';
import { PanelImageRendererService } from './panel-image-renderer.service';
import { PanelPreviewLimitService } from './panel-preview-limit.service';
import { validatePanelVisualDocument } from './panel-visual.validation';

class PreviewDto {
  @IsObject() visualDocument!: object;
  @IsOptional() @IsInt() @Min(0) expectedRevision?: number;
}

@UseGuards(SessionAuthGuard, GuildAccessGuard)
@Controller('guilds/:guildId/panels')
export class PanelPreviewController {
  constructor(
    private readonly panels: PanelsService,
    private readonly renderer: PanelImageRendererService,
    private readonly limits: PanelPreviewLimitService,
  ) {}

  @Post('visual-preview')
  unsaved(@Param('guildId') guildId: string, @CurrentUser() user: SessionUser, @Body() body: PreviewDto, @Req() req: Request, @Res() res: Response) {
    return this.preview(guildId, undefined, user, body, req, res);
  }

  @Post(':panelId/visual-preview')
  async preview(@Param('guildId') guildId: string, @Param('panelId') panelId: string | undefined, @CurrentUser() user: SessionUser, @Body() body: PreviewDto, @Req() req: Request, @Res() res: Response) {
    this.limits.consume(guildId, user.id);
    if (panelId) {
      const panel = await this.panels.get(guildId, panelId);
      if (body.expectedRevision === undefined || panel.revision !== body.expectedRevision) throw new AppError('PANEL_REVISION_CONFLICT', 'Panel changed. Reload before previewing.', 409);
      if (panel.type === 'LEADERBOARD') throw new AppError('PANEL_VISUAL_INVALID', 'Leaderboard uses its dynamic renderer.', 400);
    }
    let document;
    try { document = validatePanelVisualDocument(body.visualDocument); }
    catch { throw new AppError('PANEL_VISUAL_INVALID', 'Invalid visual document.', 400); }
    const scene = document.editorMode === 'CANVAS' ? document.canvas : document.simpleCrop ? {
      width: document.simpleCrop.width, height: document.simpleCrop.height, description: document.simpleCrop.description,
      background: '#000000', elements: [{ id: 'banner', type: 'image' as const, x: 0, y: 0, width: document.simpleCrop.width, height: document.simpleCrop.height, assetKey: document.simpleCrop.assetKey, crop: document.simpleCrop.crop }],
    } : undefined;
    if (!scene) throw new AppError('PANEL_VISUAL_INVALID', 'There is no image to preview.', 400);
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.once('aborted', abort);
    res.once('close', abort);
    try {
      const png = await this.renderer.render(guildId, scene, controller.signal);
      if (!controller.signal.aborted) res.setHeader('Cache-Control', 'no-store').type('image/png').send(png);
    } finally {
      req.removeListener('aborted', abort);
      res.removeListener('close', abort);
    }
  }
}
