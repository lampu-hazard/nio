import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentProfileRouterService } from './agent-profile-router.service';

describe('AgentProfileRouterService', () => {
  let rows: any[];
  let channel: any;
  let memberRoles: Map<string, any>;
  let service: AgentProfileRouterService;
  beforeEach(() => {
    memberRoles = new Map([['member-role', {}]]);
    rows = [
      {
        profile: 'PUBLIC',
        enabled: true,
        allowedChannelIds: ['public'],
        excludedChannelIds: [],
        roleRules: [{ roleId: 'member-role', chatEnabled: true, imageEnabled: false, dailyTokenLimit: 1000, dailyImageLimit: 0 }],
      },
      {
        profile: 'ADMIN',
        enabled: true,
        allowedChannelIds: ['admin'],
        excludedChannelIds: [],
        roleRules: [{ roleId: 'admin-role', chatEnabled: true, imageEnabled: true, dailyTokenLimit: null, dailyImageLimit: 5 }],
      },
    ];
    channel = { guildId: 'guild', isTextBased: () => true, isThread: () => false };
    service = new AgentProfileRouterService({ discordAgentSettings: { findMany: jest.fn<any>(async () => rows) } } as any);
    service.setClient({
      guilds: {
        cache: new Map([
          [
            'guild',
            {
              channels: { fetch: async () => channel },
              roles: { fetch: async () => new Map([['member-role', {}], ['admin-role', {}], ['guild', {}]]) },
              members: {
                fetch: async ({ user }: any) => ({
                  id: user,
                  guild: { id: 'guild' },
                  roles: { cache: user === 'admin-user' ? new Map([['admin-role', {}]]) : memberRoles },
                }),
              },
            },
          ],
        ]),
      },
    } as any);
  });
  it('routes assigned and wildcard channels, and never falls back from an explicit profile', async () => {
    expect(await service.resolve('guild', 'public')).toBe('PUBLIC');
    expect(await service.resolve('guild', 'admin')).toBe('ADMIN');
    expect(await service.resolve('guild', 'unassigned')).toBeNull();
    expect(await service.resolve('guild', 'admin', 'PUBLIC')).toBeNull();
    rows[0].allowedChannelIds = ['*'];
    expect(await service.resolve('guild', 'any-channel')).toBe('PUBLIC');
  });
  it('routes shared channels by sender role (ADMIN for admin-role, PUBLIC for regular member) and honors explicit slash profile', async () => {
    rows[0].allowedChannelIds = ['shared'];
    rows[1].allowedChannelIds = ['shared'];
    expect(await service.resolve('guild', 'shared', 'PUBLIC')).toBe('PUBLIC');
    expect(await service.resolve('guild', 'shared', 'ADMIN')).toBe('ADMIN');
    expect(await service.resolve('guild', 'shared', undefined, 'admin-user')).toBe('ADMIN');
    expect(await service.resolve('guild', 'shared', undefined, 'member-user')).toBe('PUBLIC');
    rows[0].enabled = false;
    expect(await service.resolve('guild', 'shared')).toBe('ADMIN');
    channel = null;
    expect(await service.resolve('guild', 'shared')).toBeNull();
    channel = { guildId: 'other', isTextBased: () => true };
    expect(await service.resolve('guild', 'shared')).toBeNull();
  });
  it('inherits parent routes and applies parent exclusions to explicit threads', async () => {
    channel.isThread = () => true;
    channel.parentId = 'public';
    expect(await service.resolve('guild', 'thread')).toBe('PUBLIC');
    rows[1].allowedChannelIds = ['thread'];
    expect(await service.resolve('guild', 'thread', undefined, 'admin-user')).toBe('ADMIN');
    expect(await service.resolve('guild', 'thread', undefined, 'member-user')).toBe('PUBLIC');
    rows[0].excludedChannelIds = ['public'];
    expect(await service.resolve('guild', 'thread')).toBe('ADMIN');
    rows[1].excludedChannelIds = ['public'];
    expect(await service.resolve('guild', 'thread')).toBeNull();
  });
});
