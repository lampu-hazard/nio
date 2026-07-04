import { Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppError } from '../common/errors/app-error';
import { AppLogger } from '../logger/logger.service';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../r2/r2.service';
import { CreateStickerDto } from './dto/create-sticker.dto';
import { UploadUrlDto } from './dto/upload-url.dto';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

@Injectable()
export class StickersService implements OnModuleInit {
  // Map<guildId, Map<name, url>>
  private cache = new Map<string, Map<string, string>>();
  private enabledGuilds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly logger: AppLogger,
  ) {}

  async onModuleInit() {
    await this.loadCache();
  }

  async loadCache() {
    const [stickers, settings] = await Promise.all([
      this.prisma.sticker.findMany(),
      this.prisma.guildSettings.findMany({ where: { stickerEnabled: true }, select: { guildId: true } }),
    ]);
    this.cache.clear();
    this.enabledGuilds.clear();
    for (const s of stickers) {
      if (!this.cache.has(s.guildId)) this.cache.set(s.guildId, new Map());
      this.cache.get(s.guildId)!.set(s.name, s.url);
    }
    for (const s of settings) {
      this.enabledGuilds.add(s.guildId);
    }
    this.logger.log(`Sticker cache loaded: ${stickers.length} stickers, ${this.enabledGuilds.size} guilds enabled`, 'StickersService');
  }

  getCachedUrl(guildId: string, name: string): string | undefined {
    if (!this.enabledGuilds.has(guildId)) return undefined;
    return this.cache.get(guildId)?.get(name);
  }

  async setEnabled(guildId: string, enabled: boolean) {
    await this.prisma.guildSettings.upsert({
      where: { guildId },
      update: { stickerEnabled: enabled },
      create: { guildId, stickerEnabled: enabled },
    });
    if (enabled) {
      this.enabledGuilds.add(guildId);
    } else {
      this.enabledGuilds.delete(guildId);
    }
  }

  isEnabled(guildId: string): boolean {
    return this.enabledGuilds.has(guildId);
  }

  async getUploadUrl(guildId: string, dto: UploadUrlDto) {
    const ext = dto.fileName.split('.').pop() || 'png';
    const key = `stickers/${guildId}/${randomUUID()}.${ext}`;
    const uploadUrl = await this.r2.getPresignedUploadUrl(key, dto.contentType, MAX_FILE_SIZE);
    return { uploadUrl, key };
  }

  async create(guildId: string, dto: CreateStickerDto) {
    const exists = await this.r2.headObject(dto.key);
    if (!exists) throw new AppError('FILE_NOT_UPLOADED', 'File not uploaded to storage', 400);

    const url = this.r2.getPublicUrl(dto.key);

    try {
      const sticker = await this.prisma.sticker.create({
        data: { guildId, name: dto.name, url, type: dto.type },
      });

      if (!this.cache.has(guildId)) this.cache.set(guildId, new Map());
      this.cache.get(guildId)!.set(sticker.name, sticker.url);

      return sticker;
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new AppError('STICKER_NAME_EXISTS', `Sticker "${dto.name}" already exists in this guild`, 409);
      }
      throw err;
    }
  }

  async list(guildId: string) {
    return this.prisma.sticker.findMany({
      where: { guildId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async delete(guildId: string, id: string) {
    const sticker = await this.prisma.sticker.findFirst({ where: { id, guildId } });
    if (!sticker) throw new AppError('STICKER_NOT_FOUND', 'Sticker not found', 404);

    await this.prisma.sticker.delete({ where: { id } });

    this.cache.get(guildId)?.delete(sticker.name);

    // Best-effort R2 cleanup
    const key = sticker.url.replace(this.r2.getPublicUrl(''), '');
    this.r2.deleteObject(key).catch((err) =>
      this.logger.error(`Failed to delete R2 object ${key}: ${err?.message}`, err?.stack, 'StickersService'),
    );

    return sticker;
  }
}
