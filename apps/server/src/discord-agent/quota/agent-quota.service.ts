import { Injectable } from '@nestjs/common';
import { AgentQuotaAttempt, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentQuotaError, AttemptOutcome, Lease, ReserveInput } from './agent-quota.types';
import { chargeAttempt, quotaPeriod, remainingQuota } from './agent-quota-accounting';

@Injectable()
export class AgentQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  private async transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try { return await this.prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
      catch (error) {
        if (attempt >= 2 || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2034') throw error;
      }
    }
  }

  private async lockSettings(tx: Prisma.TransactionClient, guildId: string) {
    await tx.$queryRaw`SELECT "guildId" FROM "DiscordAgentSettings" WHERE "guildId" = ${guildId} FOR UPDATE`;
    return tx.discordAgentSettings.findUnique({ where: { guildId } });
  }

  private async requireLease(tx: Prisma.TransactionClient, lease: Lease) {
    await tx.$queryRaw`SELECT "guildId" FROM "AgentMemberLease" WHERE "guildId" = ${lease.guildId} AND "userId" = ${lease.userId} FOR UPDATE`;
    const current = await tx.agentMemberLease.findUnique({ where: { guildId_userId: { guildId: lease.guildId, userId: lease.userId } } });
    if (!current || current.requestId !== lease.requestId || current.fence !== lease.fence || current.expiresAt.getTime() <= Date.now()) {
      throw new AgentQuotaError('LEASE_LOST');
    }
    return current;
  }

  async remaining(lease: Lease, revision: bigint, limits: { memberTokens: number | null; guildTokens: number; memberImages: number; guildImages: number }): Promise<{ tokens: number; images: number }> {
    return this.transaction(async (tx) => {
      const settings = await this.lockSettings(tx, lease.guildId);
      if (!settings?.enabled || settings.accessMode !== 'ROLE_QUOTAS' || settings.policyRevision !== revision) throw new AgentQuotaError('POLICY_CHANGED');
      await this.requireLease(tx, lease);
      const { periodStart } = quotaPeriod(new Date());
      const buckets = [];
      for (const subject of ['GUILD', `USER:${lease.userId}`]) buckets.push(await tx.agentQuotaBucket.findUnique({
        where: { guildId_periodStart_subject: { guildId: lease.guildId, periodStart, subject } },
      }));
      return {
        tokens: Math.min(...buckets.map((b, i) => i === 1 && limits.memberTokens === null ? Infinity
          : remainingQuota(i === 0 ? limits.guildTokens : limits.memberTokens!, b?.committedTokens ?? 0n, b?.reservedTokens ?? 0n))),
        images: Math.min(...buckets.map((b, i) => remainingQuota(i === 0 ? limits.guildImages : limits.memberImages, b?.committedImages ?? 0n, b?.reservedImages ?? 0n))),
      };
    });
  }

  async reserve(input: ReserveInput) {
    const quantities = [input.tokens, input.images, input.guildLimit, input.runTokensUsed, input.runTokenLimit,
      ...(input.memberLimit === null && input.capability === 'CHAT' ? [] : [input.memberLimit ?? NaN])];
    if (quantities.some((n) => !Number.isSafeInteger(n) || n < 0)
      || (input.capability === 'CHAT' ? input.tokens <= 0 || input.images !== 0 : input.capability !== 'IMAGE' || input.images !== 1 || input.tokens !== 0)) {
      throw new AgentQuotaError('INVALID_RESERVATION');
    }
    if (input.tokens + input.runTokensUsed > input.runTokenLimit) throw new AgentQuotaError('RUN_BUDGET_EXHAUSTED');
    return this.transaction(async (tx) => {
      const settings = await this.lockSettings(tx, input.lease.guildId);
      if (!settings?.enabled || settings.accessMode !== 'ROLE_QUOTAS' || settings.policyRevision !== input.policyRevision) throw new AgentQuotaError('POLICY_CHANGED');
      const lease = await this.requireLease(tx, input.lease);
      const { periodStart, resetAt } = quotaPeriod(new Date());
      const tokens = BigInt(input.tokens);
      const images = BigInt(input.images);
      const bucketKeys = ['GUILD', `USER:${lease.userId}`].map((subject) => ({ guildId: lease.guildId, periodStart, subject }));
      // The settings lock serializes a guild's ledger, including bucket creation.
      for (const [index, key] of bucketKeys.entries()) {
        const bucket = await tx.agentQuotaBucket.upsert({ where: { guildId_periodStart_subject: key }, create: key, update: {} });
        if (index === 1 && input.memberLimit === null) continue;
        const limit = BigInt(index === 0 ? input.guildLimit : input.memberLimit!);
        const used = input.capability === 'CHAT' ? bucket.committedTokens + bucket.reservedTokens + tokens : bucket.committedImages + bucket.reservedImages + images;
        if (used > limit) throw new AgentQuotaError('QUOTA_EXHAUSTED', resetAt);
      }
      for (const key of bucketKeys) await tx.agentQuotaBucket.update({ where: { guildId_periodStart_subject: key }, data: {
        reservedTokens: { increment: tokens }, reservedImages: { increment: images },
      } });
      return tx.agentQuotaAttempt.create({ data: {
        id: input.attemptId, requestKey: input.requestKey, guildId: lease.guildId, userId: lease.userId,
        requestId: lease.requestId, fence: lease.fence, runId: input.runId, capability: input.capability,
        policyRevision: input.policyRevision, periodStart, reservedTokens: tokens, reservedImages: images,
        state: 'RESERVED', expiresAt: new Date(Date.now() + 150000),
      } });
    });
  }

  async markDispatched(id: string, lease: Lease): Promise<void> {
    await this.transaction(async (tx) => {
      const settings = await this.lockSettings(tx, lease.guildId);
      await this.requireLease(tx, lease);
      const attempt = await tx.agentQuotaAttempt.findUnique({ where: { id } });
      if (!attempt || attempt.guildId !== lease.guildId || attempt.userId !== lease.userId
        || attempt.requestId !== lease.requestId || attempt.fence !== lease.fence || attempt.state !== 'RESERVED'
        || attempt.expiresAt.getTime() <= Date.now()) throw new AgentQuotaError('ATTEMPT_UNAVAILABLE');
      if (!settings?.enabled || settings.accessMode !== 'ROLE_QUOTAS' || settings.policyRevision !== attempt.policyRevision) throw new AgentQuotaError('POLICY_CHANGED');
      await tx.agentQuotaAttempt.update({ where: { id }, data: { state: 'DISPATCHED', dispatchedAt: new Date() } });
    });
  }

  async finalize(id: string, outcome: AttemptOutcome) {
    const snapshot = await this.prisma.agentQuotaAttempt.findUnique({ where: { id } });
    if (!snapshot) throw new AgentQuotaError('ATTEMPT_UNAVAILABLE');
    return this.transaction(async (tx) => {
      await this.lockSettings(tx, snapshot.guildId);
      const attempt = await tx.agentQuotaAttempt.findUnique({ where: { id } });
      if (!attempt) throw new AgentQuotaError('ATTEMPT_UNAVAILABLE');
      if (attempt.state === 'FINALIZED') return attempt;
      return this.finalizeLocked(tx, attempt, outcome);
    });
  }

  private async finalizeLocked(tx: Prisma.TransactionClient, attempt: AgentQuotaAttempt, outcome: AttemptOutcome) {
      const charge = chargeAttempt(attempt, outcome);
      for (const subject of ['GUILD', `USER:${attempt.userId}`]) {
        const key = { guildId: attempt.guildId, periodStart: attempt.periodStart, subject };
        await tx.agentQuotaBucket.update({ where: { guildId_periodStart_subject: key }, data: {
          reservedTokens: { decrement: attempt.reservedTokens }, reservedImages: { decrement: attempt.reservedImages },
          committedTokens: { increment: charge.tokens }, committedImages: { increment: charge.images },
        } });
      }
      return tx.agentQuotaAttempt.update({ where: { id: attempt.id }, data: {
        state: 'FINALIZED', finalizedAt: new Date(), chargedTokens: charge.tokens, chargedImages: charge.images,
        usageSource: charge.source, overrun: charge.overrun,
        ...(outcome.kind === 'LOCAL_FAILURE' && !attempt.dispatchedAt ? { requestKey: null } : {}),
        outcomeCode: /^[A-Z0-9_:-]{1,80}$/.test(outcome.code) ? outcome.code : 'PROVIDER_ERROR',
      } });
  }

  async cleanup(): Promise<void> {
    const cutoff = quotaPeriod(new Date(Date.now() - 90 * 86400000)).periodStart;
    const guilds = await this.prisma.agentQuotaBucket.findMany({ where: { periodStart: { lt: cutoff } },
      distinct: ['guildId'], select: { guildId: true }, orderBy: { guildId: 'asc' }, take: 100 });
    for (const { guildId } of guilds) await this.transaction(async (tx) => {
      await this.lockSettings(tx, guildId);
      const pending = await tx.agentQuotaAttempt.findMany({ where: { guildId, periodStart: { lt: cutoff }, state: { not: 'FINALIZED' } },
        distinct: ['periodStart'], select: { periodStart: true } });
      const periodStart = { lt: cutoff, notIn: pending.map((attempt) => attempt.periodStart) };
      await tx.agentQuotaAttempt.deleteMany({ where: { guildId, state: 'FINALIZED', periodStart, finalizedAt: { lt: cutoff } } });
      await tx.agentQuotaBucket.deleteMany({ where: { guildId, periodStart, reservedTokens: 0n, reservedImages: 0n } });
    });
  }

  async recoverExpired(): Promise<number> {
    const candidates = await this.prisma.agentQuotaAttempt.findMany({
      where: { state: { in: ['RESERVED', 'DISPATCHED'] }, expiresAt: { lte: new Date() } },
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }], take: 100,
      select: { id: true, guildId: true },
    });
    let recovered = 0;
    for (const candidate of candidates) {
      const changed = await this.transaction(async (tx) => {
        await this.lockSettings(tx, candidate.guildId);
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

  async acquireLease(guildId: string, userId: string, requestId: string): Promise<Lease> {
    return this.transaction(async (tx) => {
      const settings = await this.lockSettings(tx, guildId);
      if (!settings?.enabled || settings.accessMode !== 'ROLE_QUOTAS') throw new AgentQuotaError('POLICY_CHANGED');
      const current = await tx.agentMemberLease.findUnique({ where: { guildId_userId: { guildId, userId } } });
      if (current && current.expiresAt.getTime() > Date.now()) throw new AgentQuotaError('BUSY');
      const expiresAt = new Date(Date.now() + 60000);
      return tx.agentMemberLease.upsert({ where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, requestId, fence: 1n, expiresAt },
        update: { requestId, fence: { increment: 1n }, expiresAt },
      });
    });
  }

  async heartbeat(lease: Lease): Promise<void> {
    const result = await this.prisma.agentMemberLease.updateMany({ where: {
      guildId: lease.guildId, userId: lease.userId, requestId: lease.requestId, fence: lease.fence, expiresAt: { gt: new Date() },
    }, data: { expiresAt: new Date(Date.now() + 60000) } });
    if (result.count !== 1) throw new AgentQuotaError('LEASE_LOST');
  }

  async releaseLease(lease: Lease): Promise<void> {
    // Keep the row so reacquisition cannot reuse an earlier fencing token.
    await this.prisma.agentMemberLease.updateMany({ where: {
      guildId: lease.guildId, userId: lease.userId, requestId: lease.requestId, fence: lease.fence,
    }, data: { expiresAt: new Date(0) } });
  }
}
