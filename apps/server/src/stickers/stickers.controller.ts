import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { StickersService } from './stickers.service';
import { UploadUrlDto } from './dto/upload-url.dto';
import { CreateStickerDto } from './dto/create-sticker.dto';

@UseGuards(SessionAuthGuard, GuildAccessGuard)
@Controller('guilds/:guildId')
export class StickersController {
  constructor(private readonly stickers: StickersService) {}

  @Get('stickers/status')
  status(@Param('guildId') guildId: string) {
    return { ok: true, enabled: this.stickers.isEnabled(guildId) };
  }

  @Patch('stickers/status')
  async toggle(@Param('guildId') guildId: string, @Body('enabled') enabled: boolean) {
    await this.stickers.setEnabled(guildId, enabled);
    return { ok: true, enabled };
  }

  @Post('stickers/upload-url')
  async uploadUrl(@Param('guildId') guildId: string, @Body() dto: UploadUrlDto) {
    return { ok: true, ...(await this.stickers.getUploadUrl(guildId, dto)) };
  }

  @Post('stickers')
  async create(@Param('guildId') guildId: string, @Body() dto: CreateStickerDto) {
    return { ok: true, sticker: await this.stickers.create(guildId, dto) };
  }

  @Get('stickers')
  async list(@Param('guildId') guildId: string) {
    return { ok: true, stickers: await this.stickers.list(guildId) };
  }

  @Delete('stickers/:id')
  async remove(@Param('guildId') guildId: string, @Param('id') id: string) {
    return { ok: true, sticker: await this.stickers.delete(guildId, id) };
  }
}
