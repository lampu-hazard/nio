import { Injectable, Inject, Optional, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DiscordBotService } from '../discord/discord-bot.service';
import { RustAnalyticsClientService } from '../discord/rust-analytics-client.service';

@Injectable()
export class LeaderboardService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DiscordBotService))
    private readonly bot: DiscordBotService,
    @Optional() private readonly rustAnalytics?: RustAnalyticsClientService,
  ) {}

  async getChatLeaderboard(guildId: string, days: string, limit: number) {
    const candidateLimit = Math.max(limit * 2, 50);

    if (this.rustAnalytics) {
      try {
        const entries = await this.rustAnalytics.getChatLeaderboard(guildId, days, candidateLimit);
        if (entries && entries.length > 0) {
          const candidates = entries.map((row) => ({
            userId: row.userId,
            score: row.score,
          }));
          return await this.resolveAndFilterLeaderboard(guildId, candidates, limit);
        }
      } catch {
        // Fall back to Prisma DB aggregate if Rust client fails
      }
    }

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
      take: candidateLimit,
    });

    const candidates = aggregates.map((row) => ({
      userId: row.authorId,
      score: row._count.id,
    }));

    return await this.resolveAndFilterLeaderboard(guildId, candidates, limit);
  }

  async getVoiceLeaderboard(guildId: string, days: string, limit: number) {
    const candidateLimit = Math.max(limit * 2, 50);

    if (this.rustAnalytics) {
      try {
        const entries = await this.rustAnalytics.getVoiceLeaderboard(guildId, days, candidateLimit);
        if (entries && entries.length > 0) {
          const candidates = entries.map((row) => ({
            userId: row.userId,
            score: row.score,
          }));
          return await this.resolveAndFilterLeaderboard(guildId, candidates, limit);
        }
      } catch {
        // Fall back to Prisma DB aggregate if Rust client fails
      }
    }

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
      take: candidateLimit,
    });

    const candidates = aggregates.map((row) => ({
      userId: row.userId,
      score: row._sum.duration || 0,
    }));

    return await this.resolveAndFilterLeaderboard(guildId, candidates, limit);
  }

  private async resolveAndFilterLeaderboard(
    guildId: string,
    candidates: Array<{ userId: string; score: number }>,
    limit: number,
  ) {
    let guild: any = null;
    try {
      guild =
        this.bot?.client?.guilds?.cache?.get(guildId) ||
        (await this.bot?.client?.guilds?.fetch(guildId).catch(() => null));
    } catch {
      guild = null;
    }

    const resolvedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const resolved = await this.resolveMemberOrUser(guild, candidate.userId);
        return { candidate, resolved };
      }),
    );

    const filtered = guild
      ? resolvedCandidates.filter((item) => item.resolved.isMember)
      : resolvedCandidates;

    return filtered.slice(0, limit).map((item, idx) => ({
      rank: idx + 1,
      userId: item.candidate.userId,
      username: item.resolved.username,
      displayName: item.resolved.displayName,
      avatar: item.resolved.avatar,
      score: item.candidate.score,
    }));
  }

  private async resolveMemberOrUser(
    guild: any,
    userId: string,
  ): Promise<{
    username: string;
    displayName: string;
    avatar: string | null;
    isMember: boolean;
  }> {
    if (guild?.members) {
      try {
        let member = guild.members.cache?.get(userId);
        let checkedGuild = false;

        if (!member && typeof guild.members.fetch === 'function') {
          try {
            member = await guild.members.fetch(userId);
            checkedGuild = true;
          } catch (err: any) {
            const isNotFound =
              err?.status === 404 ||
              err?.code === 10007 ||
              /not found|unknown member/i.test(err?.message || '');
            if (isNotFound) {
              checkedGuild = true;
              member = null;
            } else {
              checkedGuild = false;
            }
          }
        } else if (member) {
          checkedGuild = true;
        }

        if (member) {
          const username = member.user?.username || member.displayName || `User#${userId.slice(0, 4)}`;
          const displayName = member.displayName || member.user?.globalName || username;
          const avatar =
            typeof member.displayAvatarURL === 'function'
              ? member.displayAvatarURL({ size: 128 })
              : typeof member.user?.displayAvatarURL === 'function'
                ? member.user.displayAvatarURL({ size: 128 })
                : null;
          return {
            username,
            displayName,
            avatar,
            isMember: true,
          };
        } else if (checkedGuild) {
          const fallback = await this.resolveLiveUser(userId);
          return {
            ...fallback,
            isMember: false,
          };
        }
      } catch {
        // Ignored, proceed to fallback
      }
    }

    const liveUser = await this.resolveLiveUser(userId);
    return {
      ...liveUser,
      isMember: true,
    };
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
