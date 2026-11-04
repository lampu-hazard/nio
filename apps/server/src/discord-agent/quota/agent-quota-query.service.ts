import { BadRequestException, Injectable } from '@nestjs/common';
import { AgentQuotaBucket, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentAccessService } from '../agent-access.service';
import { quotaPeriod, remainingQuota } from './agent-quota-accounting';
import { AgentScope, parseAgentProfile } from '../agent-profile.types';

type Counter = { committed: string; reserved: string; limit: number | null; remaining: number | null; unlimited?: boolean };
export type SourceAmount = { tokens: string; images: string };
type BucketView = {
  allowanceStatus: 'KNOWN' | 'UNAVAILABLE';
  tokens: Counter;
  images: Counter;
  usageSources: Record<string, number>;
  usageSourceAmounts: Record<string, SourceAmount>;
  overruns: number;
};
export type QuotaPage = {
  accessMode: string;
  periodStart: string;
  resetAt: string;
  guild: BucketView;
  members: (BucketView & { userId: string })[];
  nextCursor: string | null;
};
type Counters = Pick<AgentQuotaBucket, 'committedTokens' | 'reservedTokens' | 'committedImages' | 'reservedImages'>;

@Injectable()
export class AgentQuotaQueryService {
  constructor(private readonly prisma: PrismaService, private readonly access: AgentAccessService) {}

  async getToday(scope: AgentScope, cursor?: string, size?: string): Promise<QuotaPage> {
    const { guildId } = scope;
    const profile = parseAgentProfile(scope.profile);
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
        if (
          decoded.guildId !== guildId ||
          decoded.profile !== profile ||
          decoded.periodStart !== periodStart.toISOString() ||
          typeof decoded.subject !== 'string' ||
          !/^USER:.{1,100}$/.test(decoded.subject)
        ) {
          throw new Error();
        }
        after = decoded.subject;
      } catch {
        throw new BadRequestException('Invalid quota cursor for this guild and UTC day.');
      }
    }
    const snapshot = await this.prisma.$transaction(
      async (tx) => {
        const settings = await tx.discordAgentSettings.findUnique({
          where: { guildId_profile: { guildId, profile } },
          include: { roleRules: true },
        });
        const guild = await tx.agentQuotaBucket.findUnique({
          where: { guildId_profile_periodStart_subject: { guildId, profile, periodStart, subject: 'GUILD' } },
        });
        const rows = await tx.agentQuotaBucket.findMany({
          where: { guildId, profile, periodStart, subject: { startsWith: 'USER:', ...(after ? { gt: after } : {}) } },
          orderBy: { subject: 'asc' },
          take: take + 1,
        });
        const members = rows.slice(0, take);
        const userIds = members.map((row) => row.subject.slice(5));
        const guildSources = await tx.agentQuotaAttempt.groupBy({
          by: ['usageSource', 'overrun'],
          where: { guildId, profile, periodStart, state: 'FINALIZED' },
          _count: { _all: true },
          _sum: { chargedTokens: true, chargedImages: true },
        });
        const memberSources = await tx.agentQuotaAttempt.groupBy({
          by: ['userId', 'usageSource', 'overrun'],
          where: { guildId, profile, periodStart, state: 'FINALIZED', userId: { in: userIds } },
          _count: { _all: true },
          _sum: { chargedTokens: true, chargedImages: true },
        });
        return { settings, guild, rows, members, userIds, guildSources, memberSources };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const roleMode = snapshot.settings?.accessMode === 'ROLE_QUOTAS';
    const allowances = roleMode
      ? await this.access.getAllowances(scope, snapshot.settings!.roleRules, snapshot.userIds, snapshot.settings!.userTokenRules)
      : new Map();
    const summary = (sources: typeof snapshot.guildSources) => {
      const usageSources: Record<string, number> = {};
      const usageSourceAmounts: Record<string, SourceAmount> = {};
      const sums = new Map<string, { tokens: bigint; images: bigint }>();
      let overruns = 0;
      for (const source of sources as any[]) {
        const key = source.usageSource || 'UNCERTAIN';
        usageSources[key] = (usageSources[key] || 0) + (source._count?._all ?? 0);
        if (source._sum) {
          const prev = sums.get(key) ?? { tokens: 0n, images: 0n };
          prev.tokens += BigInt(source._sum.chargedTokens ?? 0);
          prev.images += BigInt(source._sum.chargedImages ?? 0);
          sums.set(key, prev);
        }
        if (source.overrun) overruns += source._count?._all ?? 0;
      }
      for (const [key, val] of sums.entries()) {
        usageSourceAmounts[key] = { tokens: val.tokens.toString(), images: val.images.toString() };
      }
      return { usageSources, usageSourceAmounts, overruns };
    };
    const unlimitedGuildTokens = roleMode && (profile === 'ADMIN' || snapshot.settings?.tokenQuotaMode === 'UNLIMITED');
    return {
      accessMode: snapshot.settings?.accessMode ?? 'LEGACY_USERS',
      periodStart: periodStart.toISOString(),
      resetAt: resetAt.toISOString(),
      guild: {
        ...this.view(
          snapshot.guild,
          roleMode ? snapshot.settings!.dailyGuildTokenLimit : null,
          roleMode ? snapshot.settings!.dailyGuildImageLimit : null,
          unlimitedGuildTokens,
        ),
        ...summary(snapshot.guildSources),
      },
      members: snapshot.members.map((row) => {
        const userId = row.subject.slice(5);
        const allowance = allowances.get(userId);
        return {
          userId,
          ...this.view(
            row,
            allowance?.dailyTokenLimit ?? null,
            allowance?.dailyImageLimit ?? null,
            Boolean(allowance && allowance.dailyTokenLimit === null),
          ),
          ...summary(snapshot.memberSources.filter((source) => source.userId === userId)),
        };
      }),
      nextCursor:
        snapshot.rows.length > take
          ? Buffer.from(
              JSON.stringify({
                guildId,
                profile,
                periodStart: periodStart.toISOString(),
                subject: snapshot.members[snapshot.members.length - 1].subject,
              }),
            ).toString('base64url')
          : null,
    };
  }

  private view(bucket: Counters | null, tokens: number | null, images: number | null, unlimitedTokens = false): BucketView {
    const counter = (committed: bigint, reserved: bigint, limit: number | null): Counter => ({
      committed: committed.toString(),
      reserved: reserved.toString(),
      limit,
      remaining: limit === null ? null : remainingQuota(limit, committed, reserved),
    });
    return {
      allowanceStatus: (tokens === null && !unlimitedTokens) || images === null ? 'UNAVAILABLE' : 'KNOWN',
      tokens: {
        ...counter(bucket?.committedTokens ?? 0n, bucket?.reservedTokens ?? 0n, tokens),
        ...(unlimitedTokens ? { unlimited: true } : {}),
      },
      images: counter(bucket?.committedImages ?? 0n, bucket?.reservedImages ?? 0n, images),
      usageSources: {},
      usageSourceAmounts: {},
      overruns: 0,
    };
  }
}
