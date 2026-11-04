import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentQuotaQueryService } from './agent-quota-query.service';

// Discord and persistence boundaries are isolated; serialization and paging run in the real service.
describe('current quota pages', () => {
  let prisma: any;
  let access: any;
  let service: AgentQuotaQueryService;
  const bucket = { subject: 'USER:member', committedTokens: 30n, reservedTokens: 20n, committedImages: 2n, reservedImages: 1n };
  beforeEach(() => {
    prisma = {
      discordAgentSettings: { findUnique: jest.fn<any>(async () => ({ accessMode: 'ROLE_QUOTAS', dailyGuildTokenLimit: 100, dailyGuildImageLimit: 10, roleRules: [] })) },
      agentQuotaBucket: { findUnique: jest.fn<any>(async () => ({ ...bucket, subject: 'GUILD' })), findMany: jest.fn<any>(async () => [bucket]) },
      agentQuotaAttempt: { groupBy: jest.fn<any>(async () => [{ userId: 'member', usageSource: 'REPORTED', overrun: false, _count: { _all: 1 } }]) },
    };
    prisma.$transaction = async (work: any) => work(prisma);
    access = { getAllowances: jest.fn<any>(async () => new Map([['member', { dailyTokenLimit: 100, dailyImageLimit: 5 }]])) };
    service = new AgentQuotaQueryService(prisma, access);
  });
  it('serializes counters and subtracts both committed and reserved from current allowance', async () => {
    const result = await service.getToday('guild');
    expect(result.members[0]).toMatchObject({ userId: 'member', allowanceStatus: 'KNOWN',
      tokens: { committed: '30', reserved: '20', limit: 100, remaining: 50 },
      images: { committed: '2', reserved: '1', limit: 5, remaining: 2 }, usageSources: { REPORTED: 1 } });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
  it('distinguishes a known unlimited token allowance from unavailable policy', async () => {
    access.getAllowances.mockResolvedValue(new Map([['member', { dailyTokenLimit: null, dailyImageLimit: 0 }]]));
    expect((await service.getToday('guild')).members[0]).toMatchObject({ allowanceStatus: 'KNOWN',
      tokens: { unlimited: true, limit: null, remaining: null }, images: { limit: 0 } });
  });
  it('preserves recorded usage with null allowance when Discord is unavailable', async () => {
    access.getAllowances.mockResolvedValue(new Map([['member', null]]));
    const result = await service.getToday('guild');
    expect(result.members[0]).toMatchObject({ allowanceStatus: 'UNAVAILABLE', tokens: { committed: '30', reserved: '20', limit: null, remaining: null } });
  });
  it('does not label legacy mode as quota protected', async () => {
    prisma.discordAgentSettings.findUnique.mockResolvedValue({ accessMode: 'LEGACY_USERS' });
    expect(await service.getToday('guild')).toMatchObject({ accessMode: 'LEGACY_USERS', guild: { allowanceStatus: 'UNAVAILABLE' } });
  });
  it('paginates using a cursor scoped to guild and UTC day', async () => {
    prisma.agentQuotaBucket.findMany.mockResolvedValue([{ ...bucket, subject: 'USER:a' }, { ...bucket, subject: 'USER:b' }]);
    const first = await service.getToday('guild', undefined, '1');
    expect(first.members).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    await expect(service.getToday('other', first.nextCursor!, '1')).rejects.toThrow('cursor');
    await expect(service.getToday('guild', Buffer.from(JSON.stringify({ guildId: 'guild', periodStart: '2000-01-01T00:00:00.000Z', subject: 'USER:a' })).toString('base64url'), '1')).rejects.toThrow('cursor');
  });
  it.each(['0', '101', '-1', '1.5', 'NaN'])('rejects invalid page size %s', async (size) => {
    await expect(service.getToday('guild', undefined, size)).rejects.toThrow('page size');
  });
  it('rejects malformed or oversized cursors before querying persistence', async () => {
    await expect(service.getToday('guild', '!')).rejects.toThrow('cursor');
    await expect(service.getToday('guild', 'a'.repeat(2049))).rejects.toThrow('cursor');
    expect(prisma.agentQuotaBucket.findMany).not.toHaveBeenCalled();
  });
});
