import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentQuotaService } from './agent-quota.service';

// Persistence is mocked only for deterministic boundary/fence failures; concurrency is covered by opt-in PostgreSQL tests.
describe('AgentQuotaService admission boundaries', () => {
  let prisma: any;
  let tx: any;
  let service: AgentQuotaService;
  const lease = { guildId: 'guild', userId: 'user', requestId: 'request', fence: 1n, expiresAt: new Date(Date.now() + 60000) };
  const input = { attemptId: 'attempt', lease, capability: 'CHAT' as const, policyRevision: 1n,
    memberLimit: 100, guildLimit: 100, tokens: 70, images: 0, runTokensUsed: 0, runTokenLimit: 1000 };

  beforeEach(() => {
    tx = {
      $queryRaw: jest.fn<any>(async () => []),
      discordAgentSettings: { findUnique: jest.fn<any>(async () => ({ enabled: true, accessMode: 'ROLE_QUOTAS', policyRevision: 1n })) },
      agentMemberLease: { findUnique: jest.fn<any>(async () => lease), updateMany: jest.fn<any>(async () => ({ count: 0 })) },
      agentQuotaBucket: { upsert: jest.fn<any>(), update: jest.fn<any>() },
      agentQuotaAttempt: { findUnique: jest.fn<any>(), create: jest.fn<any>(), update: jest.fn<any>() },
    };
    prisma = { ...tx, $transaction: jest.fn<any>(async (work: any) => work(tx)) };
    service = new AgentQuotaService(prisma);
  });

  it.each(['RESERVED', 'DISPATCHED'])('recovers expired %s attempts using persisted dispatch evidence', async (state) => {
    let record: any = { id: 'expired', guildId: 'guild', userId: 'user', periodStart: new Date('2026-11-03T00:00:00Z'),
      reservedTokens: 70n, reservedImages: 0n, state, expiresAt: new Date(0), dispatchedAt: state === 'DISPATCHED' ? new Date(1) : null };
    tx.agentQuotaAttempt.findMany = jest.fn<any>(async () => [record]);
    tx.agentQuotaAttempt.findUnique.mockImplementation(async () => record);
    tx.agentQuotaAttempt.update.mockImplementation(async ({ data }: any) => (record = { ...record, ...data }));
    expect(await service.recoverExpired()).toBe(1);
    expect(record).toMatchObject({ state: 'FINALIZED', chargedTokens: state === 'DISPATCHED' ? 70n : 0n,
      usageSource: state === 'DISPATCHED' ? 'UNCERTAIN' : 'LOCAL_FAILURE' });
  });
  it('leaves an already finalized recovery candidate unchanged', async () => {
    tx.agentQuotaAttempt.findMany = jest.fn<any>(async () => [{ id: 'expired', guildId: 'guild' }]);
    tx.agentQuotaAttempt.findUnique.mockResolvedValue({ state: 'FINALIZED' });
    expect(await service.recoverExpired()).toBe(0);
    expect(tx.agentQuotaBucket.update).not.toHaveBeenCalled();
  });
  it('never recovers an attempt whose deadline was extended before the lock', async () => {
    tx.agentQuotaAttempt.findMany = jest.fn<any>(async () => [{ id: 'active', guildId: 'guild' }]);
    tx.agentQuotaAttempt.findUnique.mockResolvedValue({ state: 'DISPATCHED', expiresAt: new Date(Date.now() + 60000) });
    expect(await service.recoverExpired()).toBe(0);
    expect(tx.agentQuotaBucket.update).not.toHaveBeenCalled();
  });
  it('cleans only old finalized rows and empty-reservation buckets under guild serialization', async () => {
    tx.agentQuotaBucket.findMany = jest.fn<any>(async () => [{ guildId: 'guild' }]);
    tx.agentQuotaAttempt.findMany = jest.fn<any>(async () => []);
    tx.agentQuotaAttempt.deleteMany = jest.fn<any>(async () => ({ count: 1 }));
    tx.agentQuotaBucket.deleteMany = jest.fn<any>(async () => ({ count: 2 }));
    await service.cleanup();
    expect(tx.agentQuotaAttempt.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ guildId: 'guild', state: 'FINALIZED' }) }));
    expect(tx.agentQuotaBucket.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      guildId: 'guild', reservedTokens: 0n, reservedImages: 0n, periodStart: { lt: expect.any(Date), notIn: [] },
    }) }));
  });
  it('retains and increments fencing on expired member lease acquisition', async () => {
    tx.agentMemberLease.findUnique.mockResolvedValue({ ...lease, fence: 7n, expiresAt: new Date(0) });
    tx.agentMemberLease.upsert = jest.fn<any>(async ({ update }: any) => ({ ...lease, ...update, fence: 8n }));
    const acquired = await service.acquireLease('guild', 'user', 'next');
    expect(acquired).toMatchObject({ requestId: 'next', fence: 8n });
  });
  it('refuses a second active request across chat and images', async () => {
    await expect(service.acquireLease('guild', 'user', 'other')).rejects.toMatchObject({ code: 'BUSY' });
  });
  it('returns the smallest authoritative token capacity including outstanding reservations', async () => {
    tx.agentQuotaBucket.findUnique = jest.fn<any>(async ({ where }: any) => where.guildId_periodStart_subject.subject === 'GUILD'
      ? { committedTokens: 20n, reservedTokens: 30n, committedImages: 1n, reservedImages: 1n }
      : { committedTokens: 10n, reservedTokens: 5n, committedImages: 0n, reservedImages: 1n });
    expect(await service.remaining(lease, 1n, { memberTokens: 40, guildTokens: 100, memberImages: 5, guildImages: 10 }))
      .toEqual({ tokens: 25, images: 4 });
  });
  it('ignores unlimited personal usage but still reserves and enforces the guild budget', async () => {
    tx.agentQuotaBucket.upsert.mockImplementation(async ({ create }: any) => ({
      committedTokens: create.subject === 'GUILD' ? 0n : 200000000n,
      reservedTokens: 0n, committedImages: 0n, reservedImages: 0n,
    }));
    tx.agentQuotaAttempt.create.mockImplementation(async ({ data }: any) => data);
    expect(await service.reserve({ ...input, memberLimit: null } as any)).toMatchObject({ reservedTokens: 70n });
    await expect(service.reserve({ ...input, memberLimit: null, guildLimit: 60 } as any)).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
  });
  it('limits unlimited personal remaining capacity to the server remainder', async () => {
    tx.agentQuotaBucket.findUnique = jest.fn<any>(async ({ where }: any) => ({
      committedTokens: where.guildId_periodStart_subject.subject === 'GUILD' ? 20n : 200000000n,
      reservedTokens: 5n, committedImages: 0n, reservedImages: 0n,
    }));
    expect(await service.remaining(lease, 1n, { memberTokens: null, guildTokens: 100, memberImages: 0, guildImages: 10 } as any))
      .toEqual({ tokens: 75, images: 0 });
  });
  it('reserves both guild and member amounts before dispatch', async () => {
    tx.agentQuotaBucket.upsert.mockResolvedValue({ committedTokens: 0n, reservedTokens: 0n, committedImages: 0n, reservedImages: 0n });
    tx.agentQuotaAttempt.create.mockImplementation(async ({ data }: any) => data);
    const result = await service.reserve(input);
    expect(result).toMatchObject({ reservedTokens: 70n, reservedImages: 0n, state: 'RESERVED' });
    expect(tx.agentQuotaBucket.update).toHaveBeenCalledTimes(2);
  });
  it('refuses capacity already consumed or reserved', async () => {
    tx.agentQuotaBucket.upsert.mockResolvedValue({ committedTokens: 30n, reservedTokens: 20n, committedImages: 0n, reservedImages: 0n });
    await expect(service.reserve(input)).rejects.toMatchObject({ code: 'QUOTA_EXHAUSTED' });
    expect(tx.agentQuotaAttempt.create).not.toHaveBeenCalled();
  });
  it('finalizes an attempt only once using its original accounting day', async () => {
    const periodStart = new Date('2026-11-03T00:00:00Z');
    let record: any = { id: 'attempt', guildId: 'guild', userId: 'user', periodStart, reservedTokens: 70n, reservedImages: 0n, state: 'DISPATCHED', dispatchedAt: new Date(), finalizedAt: null };
    tx.agentQuotaAttempt.findUnique.mockImplementation(async () => record);
    tx.agentQuotaAttempt.update.mockImplementation(async ({ data }: any) => (record = { ...record, ...data }));
    await service.finalize('attempt', { kind: 'REPORTED', tokens: 30, code: 'OK' });
    await service.finalize('attempt', { kind: 'REPORTED', tokens: 30, code: 'OK' });
    expect(record).toMatchObject({ chargedTokens: 30n, state: 'FINALIZED' });
    expect(tx.agentQuotaBucket.update).toHaveBeenCalledTimes(2);
    expect(tx.agentQuotaBucket.update).toHaveBeenCalledWith(expect.objectContaining({ where: { guildId_periodStart_subject: { guildId: 'guild', periodStart, subject: 'GUILD' } },
      data: expect.objectContaining({ committedTokens: { increment: 30n }, reservedTokens: { decrement: 70n } }) }));
  });

  it('rejects changed policy before mutating buckets', async () => {
    tx.discordAgentSettings.findUnique.mockResolvedValue({ enabled: true, accessMode: 'ROLE_QUOTAS', policyRevision: 2n });
    await expect(service.reserve(input)).rejects.toMatchObject({ code: 'POLICY_CHANGED' });
    expect(tx.agentQuotaBucket.upsert).not.toHaveBeenCalled();
  });
  it('rejects expired fencing before mutating buckets', async () => {
    tx.agentMemberLease.findUnique.mockResolvedValue({ ...lease, fence: 2n });
    await expect(service.reserve(input)).rejects.toMatchObject({ code: 'LEASE_LOST' });
    expect(tx.agentQuotaBucket.upsert).not.toHaveBeenCalled();
  });
  it('never dispatches after lease loss', async () => {
    tx.agentQuotaAttempt.findUnique.mockResolvedValue({ ...input, id: 'attempt', guildId: 'guild', userId: 'user', requestId: 'request', fence: 1n, state: 'RESERVED' });
    tx.agentMemberLease.findUnique.mockResolvedValue({ ...lease, fence: 2n });
    await expect(service.markDispatched('attempt', lease)).rejects.toMatchObject({ code: 'LEASE_LOST' });
    expect(tx.agentQuotaAttempt.update).not.toHaveBeenCalled();
  });
  it('refuses a heartbeat and fenced release when ownership no longer matches', async () => {
    await expect(service.heartbeat(lease)).rejects.toMatchObject({ code: 'LEASE_LOST' });
    await service.releaseLease(lease);
    expect(tx.agentMemberLease.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ fence: 1n, requestId: 'request' }) }));
  });
  it('retries only transaction conflicts and stops after three attempts', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(service.reserve(input)).rejects.toMatchObject({ code: 'P2034' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });
  it('does not retry a database outage', async () => {
    prisma.$transaction.mockRejectedValue(new Error('offline'));
    await expect(service.reserve(input)).rejects.toThrow('offline');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
  it('rejects malformed reservations and cross-capability quantities', async () => {
    await expect(service.reserve({ ...input, tokens: -1 })).rejects.toMatchObject({ code: 'INVALID_RESERVATION' });
    await expect(service.reserve({ ...input, images: 1 })).rejects.toMatchObject({ code: 'INVALID_RESERVATION' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
