import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentQuotaBucket, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentAccessService } from '../agent-access.service';
import { quotaPeriod, remainingQuota } from './agent-quota-accounting';

type Counter = { committed: string; reserved: string; limit: number | null; remaining: number | null; unlimited?: boolean };
type BucketView = {
  allowanceStatus: 'KNOWN' | 'UNAVAILABLE'; tokens: Counter; images: Counter;
  usageSources: Record<string, number>; overruns: number;
};
export type QuotaPage = {
  accessMode: string; periodStart: string; resetAt: string;
  guild: BucketView; members: (BucketView & { userId: string })[]; nextCursor: string | null;
};
type Counters = Pick<AgentQuotaBucket, 'committedTokens' | 'reservedTokens' | 'committedImages' | 'reservedImages'>;

@Injectable()
export class AgentQuotaQueryService {
  constructor(private readonly prisma: PrismaService, private readonly access: AgentAccessService) {}

  async getToday(guildId: string, cursor?: string, size?: string): Promise<QuotaPage> {
    const take = size === undefined ? 50 : Number(size);
    if (!Number.isInteger(take) || take < 1 || take > 100 || (size !== undefined && !/^\d+$/.test(size))) {
      throw new BadRequestException('Invalid page size (1–100).');
    }
    const { periodStart, resetAt } = quotaPeriod(new Date());
    let after: string | undefined;
    if (cursor !== undefined) {
      try {
        if (cursor.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (decoded.guildId !== guildId || decoded.periodStart !== periodStart.toISOString()
          || typeof decoded.subject !== 'string' || !/^USER:.{1,100}$/.test(decoded.subject)) throw new Error();
        after = decoded.subject;
      } catch { throw new BadRequestException('Invalid quota cursor for this guild and UTC day.'); }
    }
    const snapshot = await this.prisma.$transaction(async (tx) => {
      const settings = await tx.discordAgentSettings.findUnique({ where: { guildId }, include: { roleRules: true } });
      const guild = await tx.agentQuotaBucket.findUnique({ where: { guildId_periodStart_subject: { guildId, periodStart, subject: 'GUILD' } } });
      const rows = await tx.agentQuotaBucket.findMany({ where: { guildId, periodStart, subject: { startsWith: 'USER:', ...(after ? { gt: after } : {}) } },
        orderBy: { subject: 'asc' }, take: take + 1 });
      const members = rows.slice(0, take);
      const userIds = members.map((row) => row.subject.slice(5));
      const guildSources = await tx.agentQuotaAttempt.groupBy({ by: ['usageSource', 'overrun'],
        where: { guildId, periodStart, state: 'FINALIZED' }, _count: { _all: true } });
      const memberSources = await tx.agentQuotaAttempt.groupBy({ by: ['userId', 'usageSource', 'overrun'],
        where: { guildId, periodStart, state: 'FINALIZED', userId: { in: userIds } }, _count: { _all: true } });
      return { settings, guild, rows, members, userIds, guildSources, memberSources };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const roleMode = snapshot.settings?.accessMode === 'ROLE_QUOTAS';
    const allowances = roleMode
      ? await this.access.getAllowances(guildId, snapshot.settings!.roleRules, snapshot.userIds, snapshot.settings!.userTokenRules)
      : new Map();
    const summary = (sources: typeof snapshot.guildSources) => {
      const usageSources: Record<string, number> = {};
      let overruns = 0;
      for (const source of sources) {
        const key = source.usageSource || 'UNCERTAIN';
        usageSources[key] = (usageSources[key] || 0) + source._count._all;
        if (source.overrun) overruns += source._count._all;
      }
      return { usageSources, overruns };
    };
    return {
      accessMode: snapshot.settings?.accessMode ?? 'LEGACY_USERS', periodStart: periodStart.toISOString(), resetAt: resetAt.toISOString(),
      guild: { ...this.view(snapshot.guild, roleMode ? snapshot.settings!.dailyGuildTokenLimit : null, roleMode ? snapshot.settings!.dailyGuildImageLimit : null),
        ...summary(snapshot.guildSources) },
      members: snapshot.members.map((row) => {
        const userId = row.subject.slice(5);
        const allowance = allowances.get(userId);
        return { userId, ...this.view(row, allowance?.dailyTokenLimit ?? null, allowance?.dailyImageLimit ?? null, allowance?.dailyTokenLimit === null),
          ...summary(snapshot.memberSources.filter((source) => source.userId === userId)) };
      }),
      nextCursor: snapshot.rows.length > take ? Buffer.from(JSON.stringify({ guildId, periodStart: periodStart.toISOString(),
        subject: snapshot.members[snapshot.members.length - 1].subject })).toString('base64url') : null,
    };
  }

  private view(bucket: Counters | null, tokens: number | null, images: number | null, unlimitedTokens = false): BucketView {
    const counter = (committed: bigint, reserved: bigint, limit: number | null): Counter => ({
      committed: committed.toString(), reserved: reserved.toString(), limit,
      remaining: limit === null ? null : remainingQuota(limit, committed, reserved),
    });
    return { allowanceStatus: (tokens === null && !unlimitedTokens) || images === null ? 'UNAVAILABLE' : 'KNOWN',
      tokens: { ...counter(bucket?.committedTokens ?? 0n, bucket?.reservedTokens ?? 0n, tokens), ...(unlimitedTokens ? { unlimited: true } : {}) },
      images: counter(bucket?.committedImages ?? 0n, bucket?.reservedImages ?? 0n, images), usageSources: {}, overruns: 0 };
  }
}
