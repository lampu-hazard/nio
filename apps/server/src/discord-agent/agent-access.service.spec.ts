import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentAccessService } from './agent-access.service';

const rule = { roleId: '20000', chatEnabled: true, imageEnabled: true, dailyTokenLimit: 100000, dailyImageLimit: 5 };

describe('AgentAccessService', () => {
  let settings: any;
  let guild: any;
  let service: AgentAccessService;
  let prisma: any;

  beforeEach(() => {
    settings = { enabled: true, accessMode: 'ROLE_QUOTAS', policyRevision: 1n,
      allowedUserIds: ['*'], allowedChannelIds: ['other'], excludedChannelIds: [],
      imageEnabled: true, roleRules: [rule] };
    guild = { id: '10000', ownerId: '40000', roles: { fetch: jest.fn<any>(async () => new Map([['20000', {}], ['10000', {}]])) },
      members: { fetch: jest.fn<any>(async () => ({ guild: { id: '10000' }, roles: { cache: new Map([['20000', {}]]) } })) } };
    prisma = { discordAgentSettings: { findUnique: jest.fn<any>(async () => settings) } };
    service = new AgentAccessService(prisma);
    service.setClient({ guilds: { cache: new Map([['10000', guild]]) } } as any);
  });

  it('reports current allowances for quota pages without requiring chat permission', async () => {
    const result = await service.getAllowances('10000', [{ ...rule, chatEnabled: false }], ['40000']);
    expect(result.get('40000')).toMatchObject({ dailyTokenLimit: 0, dailyImageLimit: 5 });
  });
  it('reports an unavailable allowance, not invented zero capacity, when Discord fails', async () => {
    guild.members.fetch.mockRejectedValue(new Error('offline'));
    expect((await service.getAllowances('10000', [rule], ['40000'])).get('40000')).toBeNull();
  });
  it('refreshes authoritative membership and returns a coherent revisioned snapshot', async () => {
    const result = await service.resolve('10000', '30000', '40000', 'CHAT');
    expect(result).toMatchObject({ allowed: true, settings: { policyRevision: 1n }, allowance: { dailyTokenLimit: 100000 } });
    expect(guild.members.fetch).toHaveBeenCalledWith({ user: '40000', force: true });
  });

  it('does not let wildcard, owner, or administrator bypass absent roles', async () => {
    guild.members.fetch.mockResolvedValue({ guild: { id: '10000' }, permissions: { has: () => true }, roles: { cache: new Map() } });
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({ allowed: false, code: 'ROLE_DENIED' });
  });

  it('excludes deleted roles even when a member cache still contains them', async () => {
    guild.roles.fetch.mockResolvedValue(new Map());
    expect(await service.resolve('10000', '30000', '40000', 'IMAGE')).toMatchObject({ allowed: false });
  });

  it('fails closed on membership refresh failure', async () => {
    guild.members.fetch.mockRejectedValue(new Error('unavailable'));
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({ allowed: false, code: 'MEMBERSHIP_UNAVAILABLE' });
  });

  it('uses explicit everyone grants', async () => {
    settings.roleRules = [{ ...rule, roleId: '10000' }];
    guild.members.fetch.mockResolvedValue({ guild: { id: '10000' }, roles: { cache: new Map() } });
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({ allowed: true });
  });

  it('allows image-only roles without granting chat', async () => {
    settings.roleRules = [{ ...rule, chatEnabled: false }];
    expect(await service.resolve('10000', '30000', '40000', 'IMAGE')).toMatchObject({ allowed: true, allowance: { dailyTokenLimit: 0 } });
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({ allowed: false });
  });

  it.each(['CHAT', 'IMAGE'] as const)('applies excluded channels to %s', async (capability) => {
    settings.excludedChannelIds = ['30000'];
    expect(await service.resolve('10000', '30000', '40000', capability)).toMatchObject({ allowed: false, code: 'CHANNEL_EXCLUDED' });
    expect(guild.members.fetch).not.toHaveBeenCalled();
  });

  it('preserves legacy wildcard chat but never legacy images', async () => {
    settings.accessMode = 'LEGACY_USERS';
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({ allowed: true });
    expect(await service.resolve('10000', '30000', '40000', 'IMAGE')).toMatchObject({ allowed: false, code: 'ROLE_MODE_REQUIRED' });
  });

  it('does not turn database failures into environment legacy access', async () => {
    prisma.discordAgentSettings.findUnique.mockRejectedValue(new Error('schema unavailable'));
    await expect(service.resolve('10000', '30000', '40000', 'CHAT')).rejects.toThrow('schema unavailable');
  });

  it('uses a personal token cap even when lower than the matching role', async () => {
    settings.userTokenRules = [{ userId: '40000', dailyTokenLimit: 50 }];
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({
      allowed: true, allowance: { dailyTokenLimit: 50, dailyImageLimit: 5 },
    });
  });

  it('grants truly unlimited personal chat without granting images', async () => {
    settings.userTokenRules = [{ userId: '40000', dailyTokenLimit: null }];
    guild.members.fetch.mockResolvedValue({ guild: { id: '10000' }, roles: { cache: new Map() } });
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({
      allowed: true, allowance: { dailyTokenLimit: null, imageAllowed: false, dailyImageLimit: 0 },
    });
    expect(await service.resolve('10000', '30000', '40000', 'IMAGE')).toMatchObject({ allowed: false });
  });

  it('reports personal overrides in the quota ledger using the same role image policy', async () => {
    const result = await service.getAllowances('10000', [rule], ['40000'], [{ userId: '40000', dailyTokenLimit: null }]);
    expect(result.get('40000')).toMatchObject({ dailyTokenLimit: null, dailyImageLimit: 5 });
  });

  it('restores role policy after removing the personal rule', async () => {
    settings.userTokenRules = [{ userId: '40000', dailyTokenLimit: 50 }];
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({ allowance: { dailyTokenLimit: 50 } });
    settings.userTokenRules = [];
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({ allowance: { dailyTokenLimit: 100000 } });
  });

  it('still verifies membership and excluded channels for unlimited members', async () => {
    settings.userTokenRules = [{ userId: '40000', dailyTokenLimit: null }];
    guild.members.fetch.mockRejectedValue(new Error('offline'));
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({ allowed: false, code: 'MEMBERSHIP_UNAVAILABLE' });
    settings.excludedChannelIds = ['30000'];
    expect(await service.resolve('10000', '30000', '40000', 'CHAT')).toMatchObject({ allowed: false, code: 'CHANNEL_EXCLUDED' });
  });

  it('does not use the legacy member allowlist as an image grant in role mode', async () => {
    settings.allowedUserIds = ['40000'];
    guild.members.fetch.mockResolvedValue({ guild: { id: '10000' }, roles: { cache: new Map() } });
    const result = await service.resolve('10000', '30000', '40000', 'CHAT');
    expect(result).toMatchObject({ allowed: false, code: 'ROLE_DENIED' });
  });
});
