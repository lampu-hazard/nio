import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateModerationSettingsDto } from './dto/update-moderation-settings.dto';

type WarningFilters = {
  search?: string;
  moderator?: string;
  status?: 'all' | 'active' | 'expired';
  sort?: 'newest' | 'oldest';
};

type DiscordProfile = {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

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
    filters: WarningFilters,
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

  async listWarningsWithProfiles(guildId: string, filters: WarningFilters) {
    const warnings = await this.listWarnings(guildId, filters);
    const profileIds = Array.from(new Set(warnings.flatMap((warning) => [warning.userId, warning.moderatorId])));
    const profiles = new Map(await Promise.all(profileIds.map(async (id) => [id, await this.fetchDiscordProfile(id)] as const)));

    return warnings.map((warning) => ({
      ...warning,
      user: profiles.get(warning.userId) ?? this.fallbackProfile(warning.userId),
      moderator: profiles.get(warning.moderatorId) ?? this.fallbackProfile(warning.moderatorId),
    }));
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

  private async fetchDiscordProfile(id: string): Promise<DiscordProfile> {
    const token = process.env.DISCORD_BOT_TOKEN;
    if (!token) return this.fallbackProfile(id);

    try {
      const response = await fetch(`https://discord.com/api/v10/users/${id}`, {
        headers: { Authorization: `Bot ${token}` },
      });
      if (!response.ok) return this.fallbackProfile(id);

      const user = await response.json() as {
        username?: string;
        global_name?: string | null;
        avatar?: string | null;
      };

      return {
        id,
        username: user.username ?? null,
        displayName: user.global_name ?? user.username ?? null,
        avatarUrl: user.avatar ? this.avatarUrl(id, user.avatar) : null,
      };
    } catch {
      return this.fallbackProfile(id);
    }
  }

  private avatarUrl(id: string, avatar: string) {
    const extension = avatar.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${extension}?size=64`;
  }

  private fallbackProfile(id: string): DiscordProfile {
    return {
      id,
      username: null,
      displayName: null,
      avatarUrl: null,
    };
  }
}
