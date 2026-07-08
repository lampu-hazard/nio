import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class LeaderboardService {
  constructor(private readonly prisma: PrismaService) {}

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
        const user = await this.prisma.user.findUnique({
          where: { id: row.authorId },
        });
        return {
          rank: idx + 1,
          userId: row.authorId,
          username: user?.username || `User#${row.authorId.slice(0, 4)}`,
          displayName: user?.globalName || user?.username || `User#${row.authorId.slice(0, 4)}`,
          avatar: user?.avatar || null,
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
        const user = await this.prisma.user.findUnique({
          where: { id: row.userId },
        });
        return {
          rank: idx + 1,
          userId: row.userId,
          username: user?.username || `User#${row.userId.slice(0, 4)}`,
          displayName: user?.globalName || user?.username || `User#${row.userId.slice(0, 4)}`,
          avatar: user?.avatar || null,
          score: row._sum.duration || 0, // duration in seconds
        };
      })
    );

    return leaderboards;
  }
}
