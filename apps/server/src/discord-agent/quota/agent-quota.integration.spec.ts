import { afterAll, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import { createQuotaTestDatabase } from '../../../test/agent-quota-db';
import { AgentQuotaService } from './agent-quota.service';
import { PrismaService } from '../../prisma/prisma.service';
import { Lease, ReserveInput } from './agent-quota.types';

describe('PostgreSQL quota atomicity', () => {
  let db: Awaited<ReturnType<typeof createQuotaTestDatabase>>;
  let services: AgentQuotaService[];
  const guildId = 'quota-test-guild';
  const input = (lease: Lease, tokens: number, overrides: Partial<ReserveInput> = {}): ReserveInput => ({
    attemptId: randomUUID(), lease, capability: 'CHAT', policyRevision: 1n,
    memberLimit: 100, guildLimit: 100, tokens, images: 0, runTokensUsed: 0, runTokenLimit: 1000, ...overrides,
  });

  beforeAll(async () => {
    db = await createQuotaTestDatabase();
    services = db.clients.map((client) => new AgentQuotaService(client as PrismaService));
  }, 180000);
  afterAll(async () => { if (db) await db.close(); });
  beforeEach(async () => {
    const client = db.clients[0];
    await client.agentQuotaAttempt.deleteMany();
    await client.agentQuotaBucket.deleteMany();
    await client.agentMemberLease.deleteMany();
    await client.discordAgentSettings.upsert({ where: { guildId },
      create: { guildId, enabled: true, accessMode: 'ROLE_QUOTAS', policyRevision: 1n },
      update: { enabled: true, accessMode: 'ROLE_QUOTAS', policyRevision: 1n },
    });
  });

  it('admits only one of two simultaneous guild reservations of 70 out of 100', async () => {
    const leases = await Promise.all(services.map((service, i) => service.acquireLease(guildId, `user-${i}`, randomUUID())));
    const results = await Promise.allSettled(services.map((service, i) => service.reserve(input(leases[i], 70))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const buckets = await db.clients[0].agentQuotaBucket.findMany({ where: { guildId, subject: 'GUILD' } });
    expect(buckets).toHaveLength(1);
    expect(buckets[0].reservedTokens).toBe(70n);
  });

  it('cannot reserve the same member allowance twice through separate clients', async () => {
    const lease = await services[0].acquireLease(guildId, 'user', randomUUID());
    const results = await Promise.allSettled(services.map((service) => service.reserve(input(lease, 60, { guildLimit: 1000 }))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('finalizes reported 30 exactly once after reserving 70', async () => {
    const lease = await services[0].acquireLease(guildId, 'user', randomUUID());
    const attempt = await services[0].reserve(input(lease, 70));
    await services[0].markDispatched(attempt.id, lease);
    await Promise.all(services.map((service) => service.finalize(attempt.id, { kind: 'REPORTED', tokens: 30, code: 'OK' })));
    const buckets = await db.clients[0].agentQuotaBucket.findMany({ where: { guildId } });
    expect(buckets.every((b) => b.committedTokens === 30n && b.reservedTokens === 0n)).toBe(true);
  });

  it('records actual overrun in full and blocks further reservations', async () => {
    const lease = await services[0].acquireLease(guildId, 'user', randomUUID());
    const attempt = await services[0].reserve(input(lease, 70));
    await services[0].markDispatched(attempt.id, lease);
    const result = await services[0].finalize(attempt.id, { kind: 'REPORTED', tokens: 120, code: 'OK' });
    expect(result).toMatchObject({ chargedTokens: 120n, overrun: true });
    await expect(services[1].reserve(input(lease, 1))).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
  });

  it('rejects dispatch by a stale fence after reacquisition', async () => {
    const lease = await services[0].acquireLease(guildId, 'user', randomUUID());
    const attempt = await services[0].reserve(input(lease, 70));
    await services[0].releaseLease(lease);
    const next = await services[1].acquireLease(guildId, 'user', randomUUID());
    expect(next.fence).toBeGreaterThan(lease.fence);
    await expect(services[0].markDispatched(attempt.id, lease)).rejects.toMatchObject({ code: 'LEASE_LOST' });
    await services[0].releaseLease(lease);
    await services[1].heartbeat(next);
  });

  it('races recovery and finalization without charging twice or refunding a dispatched call', async () => {
    const lease = await services[0].acquireLease(guildId, 'user', randomUUID());
    const attempt = await services[0].reserve(input(lease, 70));
    await services[0].markDispatched(attempt.id, lease);
    await db.clients[0].agentQuotaAttempt.update({ where: { id: attempt.id }, data: { expiresAt: new Date(0) } });
    await Promise.all([services[0].recoverExpired(), services[1].finalize(attempt.id, { kind: 'REPORTED', tokens: 30, code: 'OK' })]);
    const result = await db.clients[0].agentQuotaAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    expect([30n, 70n]).toContain(result.chargedTokens);
    const buckets = await db.clients[0].agentQuotaBucket.findMany({ where: { guildId } });
    expect(buckets.every((b) => b.reservedTokens === 0n && b.committedTokens === result.chargedTokens)).toBe(true);
  });

  it('keeps finalization in the original UTC bucket across midnight', async () => {
    const lease = await services[0].acquireLease(guildId, 'user', randomUUID());
    const attempt = await services[0].reserve(input(lease, 70));
    const yesterday = new Date(attempt.periodStart.getTime() - 86400000);
    await db.clients[0].agentQuotaBucket.updateMany({ where: { guildId }, data: { periodStart: yesterday } });
    await db.clients[0].agentQuotaAttempt.update({ where: { id: attempt.id }, data: { periodStart: yesterday } });
    await services[0].finalize(attempt.id, { kind: 'REPORTED', tokens: 30, code: 'OK' });
    expect((await db.clients[0].agentQuotaBucket.findMany({ where: { guildId } })).every((b) => b.periodStart.getTime() === yesterday.getTime() && b.committedTokens === 30n)).toBe(true);
  });

  it('deduplicates image message reservations durably without spending chat tokens', async () => {
    const lease = await services[0].acquireLease(guildId, 'user', randomUUID());
    const image = input(lease, 0, { capability: 'IMAGE', images: 1, requestKey: 'discord:image:message' });
    await services[0].reserve(image);
    await expect(services[1].reserve({ ...image, attemptId: randomUUID() })).rejects.toMatchObject({ code: 'P2002' });
    const buckets = await db.clients[0].agentQuotaBucket.findMany({ where: { guildId } });
    expect(buckets.every((b) => b.reservedImages === 1n && b.reservedTokens === 0n)).toBe(true);
  });

  it('retains old periods with pending attempts during cleanup', async () => {
    const lease = await services[0].acquireLease(guildId, 'user', randomUUID());
    const attempt = await services[0].reserve(input(lease, 70));
    const oldPeriod = new Date('2000-01-01T00:00:00Z');
    await db.clients[0].agentQuotaBucket.updateMany({ where: { guildId }, data: { periodStart: oldPeriod } });
    await db.clients[0].agentQuotaAttempt.update({ where: { id: attempt.id }, data: { periodStart: oldPeriod } });
    await services[1].cleanup();
    expect(await db.clients[0].agentQuotaBucket.count({ where: { guildId } })).toBe(2);
    expect(await db.clients[0].agentQuotaAttempt.count({ where: { id: attempt.id } })).toBe(1);
  });

  it('does not erase usage on policy revision or mode change', async () => {
    const lease = await services[0].acquireLease(guildId, 'user', randomUUID());
    await services[0].reserve(input(lease, 70));
    await db.clients[0].discordAgentSettings.update({ where: { guildId }, data: { policyRevision: 2n, accessMode: 'LEGACY_USERS' } });
    await expect(services[1].reserve(input(lease, 1))).rejects.toMatchObject({ code: 'POLICY_CHANGED' });
    expect((await db.clients[0].agentQuotaBucket.findFirstOrThrow({ where: { guildId, subject: 'GUILD' } })).reservedTokens).toBe(70n);
  });
});
