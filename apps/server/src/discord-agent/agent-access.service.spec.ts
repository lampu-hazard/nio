import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PermissionFlagsBits } from 'discord.js';
import { AgentAccessService } from './agent-access.service';
import { AgentRequestScope } from './agent-profile.types';

const scope: AgentRequestScope = { guildId: '10000', channelId: '30000', userId: '40000', profile: 'PUBLIC' };
const rule = { roleId: '20000', chatEnabled: true, imageEnabled: true, dailyTokenLimit: 100000, dailyImageLimit: 5 };

describe('AgentAccessService profile admission', () => {
  let settings: any;
  let guild: any;
  let channel: any;
  let member: any;
  let service: AgentAccessService;
  let prisma: any;

  beforeEach(() => {
    settings = { profile: 'PUBLIC', tokenQuotaMode: 'LIMITED', enabled: true, accessMode: 'ROLE_QUOTAS', policyRevision: 1n,
      allowedUserIds: ['*'], allowedChannelIds: ['30000'], excludedChannelIds: [], userTokenRules: [], imageEnabled: true, roleRules: [rule] };
    member = { guild: { id: '10000' }, roles: { cache: new Map([['20000', {}]]) } };
    channel = { guildId: '10000', isTextBased: () => true, isThread: () => false,
      permissionsFor: jest.fn<any>(() => ({ has: () => true })) };
    guild = { id: '10000', roles: { fetch: jest.fn<any>(async () => new Map([['20000', {}], ['10000', {}]])) },
      channels: { fetch: jest.fn<any>(async () => channel) },
      members: { fetch: jest.fn<any>(async () => member), fetchMe: jest.fn<any>(async () => ({ id: 'bot' })) } };
    prisma = { discordAgentSettings: { findUnique: jest.fn<any>(async () => settings) } };
    service = new AgentAccessService(prisma);
    service.setClient({ guilds: { cache: new Map([['10000', guild]]) } } as any);
  });

  it('refreshes membership and reads exactly the requested profile', async () => {
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: true, allowance: { dailyTokenLimit: 100000 } });
    expect(prisma.discordAgentSettings.findUnique).toHaveBeenCalledWith({ where: { guildId_profile: { guildId: '10000', profile: 'PUBLIC' } }, include: { roleRules: true } });
    expect(guild.members.fetch).toHaveBeenCalledWith({ user: '40000', force: true });
  });
  it('does not let a personal override or owner permissions bypass role admission', async () => {
    member.roles.cache.clear();
    member.permissions = { has: () => true };
    settings.userTokenRules = [{ userId: '40000', dailyTokenLimit: null }];
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'ROLE_DENIED' });
  });
  it('applies personal limits only after a matching chat role grants entry', async () => {
    settings.userTokenRules = [{ userId: '40000', dailyTokenLimit: 50 }];
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: true, allowance: { dailyTokenLimit: 50, dailyImageLimit: 5 } });
    settings.userTokenRules[0].dailyTokenLimit = null;
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: true, allowance: { dailyTokenLimit: null } });
  });
  it('admits ADMIN with a null role cap but never uses personal rules', async () => {
    settings = { ...settings, profile: 'ADMIN', tokenQuotaMode: 'UNLIMITED', roleRules: [{ ...rule, dailyTokenLimit: null }], userTokenRules: [] };
    expect(await service.resolve({ ...scope, profile: 'ADMIN' }, 'CHAT')).toMatchObject({ allowed: true, allowance: { dailyTokenLimit: null } });
    settings.roleRules = [];
    settings.userTokenRules = [{ userId: '40000', dailyTokenLimit: null }];
    expect(await service.resolve({ ...scope, profile: 'ADMIN' }, 'CHAT')).toMatchObject({ allowed: false, code: 'ROLE_DENIED' });
  });
  it('denies legacy and environment grants', async () => {
    settings.accessMode = 'LEGACY_USERS';
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'POLICY_INVALID' });
    settings = null;
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'DISABLED' });
  });
  it('requires a configured channel and rejects exclusions before member lookup', async () => {
    settings.allowedChannelIds = ['other'];
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'CHANNEL_DENIED' });
    settings.excludedChannelIds = ['30000'];
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'CHANNEL_EXCLUDED' });
    expect(guild.members.fetch).not.toHaveBeenCalled();
  });
  it('inherits thread routing but parent exclusions override explicit thread grants', async () => {
    channel.isThread = () => true;
    channel.parentId = 'parent';
    settings.allowedChannelIds = ['parent'];
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: true });
    settings.allowedChannelIds = ['30000'];
    settings.excludedChannelIds = ['parent'];
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'CHANNEL_EXCLUDED' });
  });
  it('denies missing requester or bot channel permissions', async () => {
    channel.permissionsFor.mockReturnValue({ has: (permission: bigint) => permission !== PermissionFlagsBits.SendMessages });
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'CHANNEL_PERMISSIONS' });
    channel.isThread = () => true;
    channel.permissionsFor.mockReturnValue({ has: (permission: bigint) => permission !== PermissionFlagsBits.SendMessagesInThreads });
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'CHANNEL_PERMISSIONS' });
  });
  it('denies unavailable channels or membership without importing cached grants', async () => {
    guild.channels.fetch.mockResolvedValue(null);
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'CHANNEL_UNAVAILABLE' });
    guild.channels.fetch.mockResolvedValue(channel);
    guild.members.fetch.mockRejectedValue(new Error('offline'));
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'MEMBERSHIP_UNAVAILABLE' });
  });
  it('excludes deleted roles and respects capability enablement', async () => {
    guild.roles.fetch.mockResolvedValue(new Map());
    expect(await service.resolve(scope, 'CHAT')).toMatchObject({ allowed: false, code: 'ROLE_DENIED' });
    settings.imageEnabled = false;
    expect(await service.resolve(scope, 'IMAGE')).toMatchObject({ allowed: false, code: 'IMAGES_DISABLED' });
  });
  it('reports unavailable policy separately from finite or unlimited allowance', async () => {
    const rules = [{ ...rule, dailyTokenLimit: null }];
    expect((await service.getAllowances({ guildId: '10000', profile: 'ADMIN' }, rules, ['40000'], [])).get('40000'))
      .toMatchObject({ chatAllowed: true, dailyTokenLimit: null, dailyImageLimit: 5 });
    guild.members.fetch.mockRejectedValue(new Error('offline'));
    expect((await service.getAllowances({ guildId: '10000', profile: 'PUBLIC' }, [rule], ['40000'], [])).get('40000')).toBeNull();
  });
});
