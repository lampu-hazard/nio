import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordBotService } from '../discord/discord-bot.service';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DiscordBotService))
    private readonly bot: DiscordBotService,
  ) {}

  async getChatLeaderboard(guildId: string, days: string, limit: number) {
    const gteDate = days === 'all' ? undefined : new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const aggregates = await this.prisma.discordMessageLog.groupBy({
      by: ['authorId'],
      _count: { id: true },
      where: {
        guildId,
        deletedAt: null,
        createdAt: gteDate ? { gte: gteDate } : undefined,
      },
      orderBy: {
        _count: { id: 'desc' },
      },
      take: limit,
    });

    const leaderboards = await Promise.all(
      aggregates.map(async (row, idx) => {
        const liveUser = await this.resolveLiveUser(row.authorId);
        return {
          rank: idx + 1,
          userId: row.authorId,
          username: liveUser.username,
          displayName: liveUser.displayName,
          avatar: liveUser.avatar,
          score: row._count.id,
        };
      })
    );

    return leaderboards;
  }

  async getVoiceLeaderboard(guildId: string, days: string, limit: number) {
    const gteDate = days === 'all' ? undefined : new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);

    const aggregates = await this.prisma.voiceSession.groupBy({
      by: ['userId'],
      _sum: { duration: true },
      where: {
        guildId,
        joinedAt: gteDate ? { gte: gteDate } : undefined,
        leftAt: { not: null },
      },
      orderBy: {
        _sum: { duration: 'desc' },
      },
      take: limit,
    });

    const leaderboards = await Promise.all(
      aggregates.map(async (row, idx) => {
        const liveUser = await this.resolveLiveUser(row.userId);
        return {
          rank: idx + 1,
          userId: row.userId,
          username: liveUser.username,
          displayName: liveUser.displayName,
          avatar: liveUser.avatar,
          score: row._sum.duration || 0, // duration in seconds
        };
      })
    );

    return leaderboards;
  }

  private async resolveLiveUser(userId: string): Promise<{ username: string; displayName: string; avatar: string | null }> {
    // 1. Try Discord Client Cache
    try {
      const cachedUser = this.bot?.client?.users?.cache?.get(userId);
      if (cachedUser) {
        return {
          username: cachedUser.username,
          displayName: cachedUser.globalName || cachedUser.username,
          avatar: cachedUser.displayAvatarURL({ size: 128 }),
        };
      }
    } catch {
      // Ignored
    }

    // 2. Try Fetching from Discord API
    try {
      const fetchedUser = await this.bot?.client?.users?.fetch(userId).catch(() => null);
      if (fetchedUser) {
        return {
          username: fetchedUser.username,
          displayName: fetchedUser.globalName || fetchedUser.username,
          avatar: fetchedUser.displayAvatarURL({ size: 128 }),
        };
      }
    } catch {
      // Ignored
    }

    // 3. Try Local DB Lookup
    try {
      const localUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (localUser) {
        const avatarUrl = localUser.avatar
          ? (localUser.avatar.startsWith('http')
              ? localUser.avatar
              : `https://cdn.discordapp.com/avatars/${userId}/${localUser.avatar}.png`)
          : null;
        return {
          username: localUser.username,
          displayName: localUser.globalName || localUser.username,
          avatar: avatarUrl,
        };
      }
    } catch {
      // Ignored
    }

    // 4. Fallback values
    let defaultAvatarIndex = 0;
    try {
      defaultAvatarIndex = Number(BigInt(userId) % 5n);
    } catch {
      // Fallback if userId is not a numeric string
      defaultAvatarIndex = userId.charCodeAt(0) % 5;
    }
    const avatar = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`;
    return {
      username: `User#${userId.slice(0, 4)}`,
      displayName: `User#${userId.slice(0, 4)}`,
      avatar,
    };
  }
}
