import { Injectable } from '@nestjs/common';
import { AgentQuotaAttempt, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentQuotaError, AttemptOutcome, Lease, ReserveInput } from './agent-quota.types';
import { chargeAttempt, quotaPeriod, remainingQuota } from './agent-quota-accounting';
import { AgentProfile, AgentScope, parseAgentProfile } from '../agent-profile.types';

type RemainingLimits = {
  memberTokens: number | null;
  guildTokens: number | null;
  memberImages: number;
  guildImages: number;
};

@Injectable()
export class AgentQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (attempt >= 2 || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2034') throw error;
      }
    }
  }

  private async lockSettings(tx: Prisma.TransactionClient, guildId: string, profile: AgentProfile = 'PUBLIC') {
    await tx.$queryRaw`SELECT "guildId" FROM "DiscordAgentSettings" WHERE "guildId" = ${guildId} AND "profile" = ${profile} FOR UPDATE`;
    return tx.discordAgentSettings.findUnique({ where: { guildId_profile: { guildId, profile } } });
  }

  private async requireLease(tx: Prisma.TransactionClient, lease: Lease) {
    await tx.$queryRaw`SELECT "guildId" FROM "AgentMemberLease" WHERE "guildId" = ${lease.guildId} AND "userId" = ${lease.userId} FOR UPDATE`;
    const current = await tx.agentMemberLease.findUnique({
      where: { guildId_userId: { guildId: lease.guildId, userId: lease.userId } },
    });
    if (!current || current.requestId !== lease.requestId || current.fence !== lease.fence || current.expiresAt.getTime() <= Date.now()) {
      throw new AgentQuotaError('LEASE_LOST');
    }
    return current;
  }

  async remaining(
    scopeOrLease: AgentScope | Lease,
    leaseOrRevision: Lease | bigint,
    revisionOrLimits: bigint | RemainingLimits,
    maybeLimits?: RemainingLimits,
  ): Promise<{ tokens: number | null; images: number }> {
    const hasScope = typeof leaseOrRevision === 'object' && leaseOrRevision !== null;
    const scope: AgentScope = hasScope
      ? { guildId: (scopeOrLease as AgentScope).guildId, profile: parseAgentProfile((scopeOrLease as AgentScope).profile) }
      : { guildId: (scopeOrLease as Lease).guildId, profile: 'PUBLIC' };
    const lease = (hasScope ? leaseOrRevision : scopeOrLease) as Lease;
    const revision = (hasScope ? revisionOrLimits : leaseOrRevision) as bigint;
    const limits = (hasScope ? maybeLimits : revisionOrLimits) as RemainingLimits;

    return this.transaction(async (tx) => {
      const settings = await this.lockSettings(tx, scope.guildId, scope.profile);
      if (!settings?.enabled || settings.accessMode !== 'ROLE_QUOTAS' || settings.policyRevision !== revision) {
        throw new AgentQuotaError('POLICY_CHANGED');
      }
      await this.requireLease(tx, lease);
      const { periodStart } = quotaPeriod(new Date());
      const buckets = [];
      for (const subject of ['GUILD', `USER:${lease.userId}`]) {
        const key = { guildId: scope.guildId, profile: scope.profile, periodStart, subject };
        buckets.push(
          tx.agentQuotaBucket.findUnique
            ? await tx.agentQuotaBucket.findUnique({
                where: { guildId_profile_periodStart_subject: key },
              })
            : null,
        );
      }

      const unlimitedTokens =
        scope.profile === 'ADMIN' ||
        (settings as any).tokenQuotaMode === 'UNLIMITED' ||
        limits.guildTokens === null;

      const tokens = unlimitedTokens
        ? null
        : Math.min(
            ...buckets.map((b, i) =>
              i === 1 && limits.memberTokens === null
                ? Infinity
                : remainingQuota(
                    i === 0 ? limits.guildTokens! : limits.memberTokens!,
                    b?.committedTokens ?? 0n,
                    b?.reservedTokens ?? 0n,
                  ),
            ),
          );

      return {
        tokens: tokens !== null && Number.isFinite(tokens) ? tokens : null,
        images: Math.min(
          ...buckets.map((b, i) =>
            remainingQuota(
              i === 0 ? limits.guildImages : limits.memberImages,
              b?.committedImages ?? 0n,
              b?.reservedImages ?? 0n,
            ),
          ),
        ),
      };
    });
  }

  async reserve(input: ReserveInput) {
    const profile = parseAgentProfile(input.profile ?? 'PUBLIC');
    const isChat = input.capability === 'CHAT';
    const isImage = input.capability === 'IMAGE';
    if (!isChat && !isImage) {
      throw new AgentQuotaError('INVALID_RESERVATION');
    }

    const isUnlimitedChat =
      isChat &&
      (input.tokenPolicy?.mode === 'UNLIMITED' ||
        profile === 'ADMIN' ||
        (input.guildLimit === null && input.runTokenLimit === null));

    const guildLimit = isChat && input.tokenPolicy ? input.tokenPolicy.guildLimit : input.guildLimit;
    const memberLimit = isChat && input.tokenPolicy ? input.tokenPolicy.memberLimit : input.memberLimit;
    const runTokenLimit = isChat && input.tokenPolicy ? input.tokenPolicy.runTokenLimit : input.runTokenLimit;

    const validInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

    if (isChat) {
      if (!validInt(input.tokens) || input.tokens <= 0 || input.images !== 0 || !validInt(input.runTokensUsed)) {
        throw new AgentQuotaError('INVALID_RESERVATION');
      }
      if (!isUnlimitedChat) {
        if (!validInt(guildLimit) || !validInt(runTokenLimit) || (memberLimit !== null && !validInt(memberLimit))) {
          throw new AgentQuotaError('INVALID_RESERVATION');
        }
        if (input.tokens + input.runTokensUsed > runTokenLimit) {
          throw new AgentQuotaError('RUN_BUDGET_EXHAUSTED', undefined, {
            profile,
            limitingScope: 'RUN',
            remaining: Math.max(0, runTokenLimit - input.runTokensUsed),
            required: input.tokens,
            countSource: input.estimate?.source,
          });
        }
      }
    } else {
      if (input.images !== 1 || input.tokens !== 0 || !validInt(guildLimit) || !validInt(memberLimit)) {
        throw new AgentQuotaError('INVALID_RESERVATION');
      }
    }

    return this.transaction(async (tx) => {
      const settings = await this.lockSettings(tx, input.lease.guildId, profile);
      if (!settings?.enabled || settings.accessMode !== 'ROLE_QUOTAS' || settings.policyRevision !== input.policyRevision) {
        throw new AgentQuotaError('POLICY_CHANGED');
      }
      const lease = await this.requireLease(tx, input.lease);
      const { periodStart, resetAt } = quotaPeriod(new Date());
      const tokens = BigInt(input.tokens);
      const images = BigInt(input.images);
      const bucketKeys = ['GUILD', `USER:${lease.userId}`].map((subject) => ({
        guildId: lease.guildId,
        profile,
        periodStart,
        subject,
      }));

      for (const [index, key] of bucketKeys.entries()) {
        const bucket = await tx.agentQuotaBucket.upsert({
          where: { guildId_profile_periodStart_subject: key },
          create: key,
          update: {},
        });
        if (isChat && isUnlimitedChat) continue;
        if (isChat && index === 1 && memberLimit === null) continue;
        const limitNum = index === 0 ? guildLimit! : memberLimit!;
        const limit = BigInt(limitNum);
        const used = isChat
          ? bucket.committedTokens + bucket.reservedTokens + tokens
          : bucket.committedImages + bucket.reservedImages + images;
        if (used > limit) {
          const currentUsed = isChat ? bucket.committedTokens + bucket.reservedTokens : bucket.committedImages + bucket.reservedImages;
          const rem = limit > currentUsed ? Number(limit - currentUsed) : 0;
          throw new AgentQuotaError('QUOTA_EXHAUSTED', resetAt, {
            profile,
            limitingScope: index === 0 ? 'GUILD' : 'MEMBER',
            remaining: rem,
            required: isChat ? input.tokens : input.images,
            countSource: input.estimate?.source,
            resetAt,
          });
        }
      }

      for (const key of bucketKeys) {
        await tx.agentQuotaBucket.update({
          where: { guildId_profile_periodStart_subject: key },
          data: {
            reservedTokens: { increment: tokens },
            reservedImages: { increment: images },
          },
        });
      }

      return tx.agentQuotaAttempt.create({
        data: {
          id: input.attemptId,
          requestKey: input.requestKey,
          guildId: lease.guildId,
          profile,
          userId: lease.userId,
          requestId: lease.requestId,
          fence: lease.fence,
          runId: input.runId,
          capability: input.capability,
          policyRevision: input.policyRevision,
          periodStart,
          reservedTokens: tokens,
          reservedImages: images,
          ...(input.estimate
            ? {
                tokenCountSource: input.estimate.source,
                tokenCounterVersion: input.estimate.counterVersion,
                inputTokenEstimate: BigInt(input.estimate.inputTokens),
              }
            : {}),
          state: 'RESERVED',
          expiresAt: new Date(Date.now() + 150000),
        },
      });
    });
  }

  async markDispatched(id: string, lease: Lease): Promise<void> {
    await this.transaction(async (tx) => {
      const existing = await tx.agentQuotaAttempt.findUnique({ where: { id } });
      const profile = parseAgentProfile((existing as any)?.profile ?? 'PUBLIC');
      const settings = await this.lockSettings(tx, lease.guildId, profile);
      await this.requireLease(tx, lease);
      const attempt = await tx.agentQuotaAttempt.findUnique({ where: { id } });
      if (
        !attempt ||
        attempt.guildId !== lease.guildId ||
        attempt.userId !== lease.userId ||
        attempt.requestId !== lease.requestId ||
        attempt.fence !== lease.fence ||
        attempt.state !== 'RESERVED' ||
        attempt.expiresAt.getTime() <= Date.now()
      ) {
        throw new AgentQuotaError('ATTEMPT_UNAVAILABLE');
      }
      if (!settings?.enabled || settings.accessMode !== 'ROLE_QUOTAS' || settings.policyRevision !== attempt.policyRevision) {
        throw new AgentQuotaError('POLICY_CHANGED');
      }
      await tx.agentQuotaAttempt.update({ where: { id }, data: { state: 'DISPATCHED', dispatchedAt: new Date() } });
    });
  }

  async finalize(id: string, outcome: AttemptOutcome) {
    const snapshot = await this.prisma.agentQuotaAttempt.findUnique({ where: { id } });
    if (!snapshot) throw new AgentQuotaError('ATTEMPT_UNAVAILABLE');
    const profile = parseAgentProfile((snapshot as any).profile ?? 'PUBLIC');
    return this.transaction(async (tx) => {
      await this.lockSettings(tx, snapshot.guildId, profile);
      const attempt = await tx.agentQuotaAttempt.findUnique({ where: { id } });
      if (!attempt) throw new AgentQuotaError('ATTEMPT_UNAVAILABLE');
      if (attempt.state === 'FINALIZED') return attempt;
      return this.finalizeLocked(tx, attempt, outcome);
    });
  }

  private async finalizeLocked(tx: Prisma.TransactionClient, attempt: AgentQuotaAttempt, outcome: AttemptOutcome) {
    const profile = parseAgentProfile((attempt as any).profile ?? 'PUBLIC');
    const charge = chargeAttempt(attempt, outcome);
    for (const subject of ['GUILD', `USER:${attempt.userId}`]) {
      const key = { guildId: attempt.guildId, profile, periodStart: attempt.periodStart, subject };
      await tx.agentQuotaBucket.update({
        where: { guildId_profile_periodStart_subject: key },
        data: {
          reservedTokens: { decrement: attempt.reservedTokens },
          reservedImages: { decrement: attempt.reservedImages },
          committedTokens: { increment: charge.tokens },
          committedImages: { increment: charge.images },
        },
      });
    }
    return tx.agentQuotaAttempt.update({
      where: { id: attempt.id },
      data: {
        state: 'FINALIZED',
        finalizedAt: new Date(),
        chargedTokens: charge.tokens,
        chargedImages: charge.images,
        usageSource: charge.source,
        overrun: charge.overrun,
        ...(outcome.kind === 'LOCAL_FAILURE' && !attempt.dispatchedAt ? { requestKey: null } : {}),
        outcomeCode: /^[A-Z0-9_:-]{1,80}$/.test(outcome.code) ? outcome.code : 'PROVIDER_ERROR',
      },
    });
  }

  async cleanup(): Promise<void> {
    const cutoff = quotaPeriod(new Date(Date.now() - 90 * 86400000)).periodStart;
    const guilds = await this.prisma.agentQuotaBucket.findMany({
      where: { periodStart: { lt: cutoff } },
      distinct: ['guildId'],
      select: { guildId: true },
      orderBy: { guildId: 'asc' },
      take: 100,
    });
    for (const { guildId } of guilds) {
      await this.transaction(async (tx) => {
        await this.lockSettings(tx, guildId, 'PUBLIC');
        await this.lockSettings(tx, guildId, 'ADMIN');
        const pending = await tx.agentQuotaAttempt.findMany({
          where: { guildId, periodStart: { lt: cutoff }, state: { not: 'FINALIZED' } },
          distinct: ['periodStart'],
          select: { periodStart: true },
        });
        const periodStart = { lt: cutoff, notIn: pending.map((attempt) => attempt.periodStart) };
        await tx.agentQuotaAttempt.deleteMany({ where: { guildId, state: 'FINALIZED', periodStart, finalizedAt: { lt: cutoff } } });
        await tx.agentQuotaBucket.deleteMany({ where: { guildId, periodStart, reservedTokens: 0n, reservedImages: 0n } });
      });
    }
  }

  async recoverExpired(): Promise<number> {
    const candidates = await this.prisma.agentQuotaAttempt.findMany({
      where: { state: { in: ['RESERVED', 'DISPATCHED'] }, expiresAt: { lte: new Date() } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
      take: 100,
      select: { id: true, guildId: true, profile: true } as any,
    });
    let recovered = 0;
    for (const candidate of candidates as any[]) {
      const profile = parseAgentProfile(candidate.profile ?? 'PUBLIC');
      const changed = await this.transaction(async (tx) => {
        await this.lockSettings(tx, candidate.guildId, profile);
        const attempt = await tx.agentQuotaAttempt.findUnique({ where: { id: candidate.id } });
        if (!attempt || attempt.state === 'FINALIZED' || attempt.expiresAt.getTime() > Date.now()) return false;
        const undispatched = attempt.state === 'RESERVED' && !attempt.dispatchedAt;
        await this.finalizeLocked(tx, attempt, { kind: undispatched ? 'LOCAL_FAILURE' : 'UNCERTAIN', code: 'RECOVERED_EXPIRED' });
        return true;
      });
      if (changed) recovered++;
    }
    return recovered;
  }

  async acquireLease(scopeOrGuildId: AgentScope | string, userId: string, requestId: string, maybeProfile?: AgentProfile): Promise<Lease> {
    const guildId = typeof scopeOrGuildId === 'string' ? scopeOrGuildId : scopeOrGuildId.guildId;
    const profile = typeof scopeOrGuildId === 'string'
      ? parseAgentProfile(maybeProfile ?? 'PUBLIC')
      : parseAgentProfile(scopeOrGuildId.profile);
    return this.transaction(async (tx) => {
      const settings = await this.lockSettings(tx, guildId, profile);
      if (!settings?.enabled || settings.accessMode !== 'ROLE_QUOTAS') throw new AgentQuotaError('POLICY_CHANGED');
      const current = await tx.agentMemberLease.findUnique({ where: { guildId_userId: { guildId, userId } } });
      if (current && current.expiresAt.getTime() > Date.now()) throw new AgentQuotaError('BUSY');
      const expiresAt = new Date(Date.now() + 60000);
      return tx.agentMemberLease.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, requestId, fence: 1n, expiresAt },
        update: { requestId, fence: { increment: 1n }, expiresAt },
      });
    });
  }

  async heartbeat(lease: Lease): Promise<void> {
    const result = await this.prisma.agentMemberLease.updateMany({
      where: {
        guildId: lease.guildId,
        userId: lease.userId,
        requestId: lease.requestId,
        fence: lease.fence,
        expiresAt: { gt: new Date() },
      },
      data: { expiresAt: new Date(Date.now() + 60000) },
    });
    if (result.count !== 1) throw new AgentQuotaError('LEASE_LOST');
  }

  async releaseLease(lease: Lease): Promise<void> {
    // Keep the row so reacquisition cannot reuse an earlier fencing token.
    await this.prisma.agentMemberLease.updateMany({
      where: {
        guildId: lease.guildId,
        userId: lease.userId,
        requestId: lease.requestId,
        fence: lease.fence,
      },
      data: { expiresAt: new Date(0) },
    });
  }
}
