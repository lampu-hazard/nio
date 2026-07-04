import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateModerationSettingsDto } from './dto/update-moderation-settings.dto';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(guildId: string) {
    const settings = await this.prisma.guildSettings.findUnique({
      where: { guildId },
    });
    return {
      warnLimitEnabled: settings?.warnLimitEnabled ?? false,
      warnLimitThreshold: settings?.warnLimitThreshold ?? 3,
      warnTimeoutDurationMin: settings?.warnTimeoutDurationMin ?? 60,
      warnExpiryDays: settings?.warnExpiryDays ?? 30,
    };
  }

  async updateSettings(guildId: string, dto: UpdateModerationSettingsDto) {
    return this.prisma.guildSettings.upsert({
      where: { guildId },
      update: {
        warnLimitEnabled: dto.warnLimitEnabled,
        warnLimitThreshold: dto.warnLimitThreshold,
        warnTimeoutDurationMin: dto.warnTimeoutDurationMin,
        warnExpiryDays: dto.warnExpiryDays,
      },
      create: {
        guildId,
        warnLimitEnabled: dto.warnLimitEnabled || false,
        warnLimitThreshold: dto.warnLimitThreshold ?? 3,
        warnTimeoutDurationMin: dto.warnTimeoutDurationMin ?? 60,
        warnExpiryDays: dto.warnExpiryDays ?? 30,
      },
    });
  }

  async listWarnings(
    guildId: string,
    filters: {
      search?: string;
      moderator?: string;
      status?: 'all' | 'active' | 'expired';
      sort?: 'newest' | 'oldest';
    },
  ) {
    const now = new Date();
    const where: any = { guildId };

    if (filters.search) {
      where.OR = [
        { userId: { contains: filters.search } },
        { reason: { contains: filters.search } },
      ];
    }

    if (filters.moderator) {
      where.moderatorId = filters.moderator;
    }

    if (filters.status === 'active') {
      where.OR = [
        { expiresAt: null },
        { expiresAt: { gt: now } },
      ];
    } else if (filters.status === 'expired') {
      where.expiresAt = { lt: now };
    }

    return this.prisma.warning.findMany({
      where,
      orderBy: { createdAt: filters.sort === 'oldest' ? 'asc' : 'desc' },
    });
  }

  async createWarning(guildId: string, userId: string, moderatorId: string, reason: string) {
    const settings = await this.getSettings(guildId);
    const expiresAt =
      settings.warnExpiryDays > 0
        ? new Date(Date.now() + settings.warnExpiryDays * 24 * 60 * 60 * 1000)
        : null;

    return this.prisma.warning.create({
      data: {
        guildId,
        userId,
        moderatorId,
        reason,
        expiresAt,
      },
    });
  }

  async revokeWarning(guildId: string, id: string) {
    return this.prisma.warning.delete({
      where: { id, guildId },
    });
  }

  async countActiveWarnings(guildId: string, userId: string): Promise<number> {
    const now = new Date();
    return this.prisma.warning.count({
      where: {
        guildId,
        userId,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
    });
  }
}
