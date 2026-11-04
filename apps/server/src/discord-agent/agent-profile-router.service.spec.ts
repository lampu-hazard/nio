import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AgentProfileRouterService } from './agent-profile-router.service';

describe('AgentProfileRouterService', () => {
  let rows: any[];
  let channel: any;
  let service: AgentProfileRouterService;
  beforeEach(() => {
    rows = [{ profile: 'PUBLIC', enabled: true, allowedChannelIds: ['public'], excludedChannelIds: [] },
      { profile: 'ADMIN', enabled: true, allowedChannelIds: ['admin'], excludedChannelIds: [] }];
    channel = { guildId: 'guild', isTextBased: () => true, isThread: () => false };
    service = new AgentProfileRouterService({ discordAgentSettings: { findMany: jest.fn<any>(async () => rows) } } as any);
    service.setClient({ guilds: { cache: new Map([['guild', { channels: { fetch: async () => channel } }]]) } } as any);
  });
  it('routes only assigned channels, never falls back from an explicit profile', async () => {
    expect(await service.resolve('guild', 'public')).toBe('PUBLIC');
    expect(await service.resolve('guild', 'admin')).toBe('ADMIN');
    expect(await service.resolve('guild', 'unassigned')).toBeNull();
    expect(await service.resolve('guild', 'admin', 'PUBLIC')).toBeNull();
  });
  it('fails closed for overlapping, disabled, deleted or foreign channels', async () => {
    rows[0].allowedChannelIds = ['admin'];
    expect(await service.resolve('guild', 'admin')).toBeNull();
    rows[0].enabled = false;
    expect(await service.resolve('guild', 'admin')).toBe('ADMIN');
    channel = null;
    expect(await service.resolve('guild', 'admin')).toBeNull();
    channel = { guildId: 'other', isTextBased: () => true };
    expect(await service.resolve('guild', 'admin')).toBeNull();
  });
  it('inherits parent routes and applies parent exclusions to explicit threads', async () => {
    channel.isThread = () => true;
    channel.parentId = 'public';
    expect(await service.resolve('guild', 'thread')).toBe('PUBLIC');
    rows[1].allowedChannelIds = ['thread'];
    expect(await service.resolve('guild', 'thread')).toBeNull();
    rows[0].excludedChannelIds = ['public'];
    expect(await service.resolve('guild', 'thread')).toBe('ADMIN');
    rows[1].excludedChannelIds = ['public'];
    expect(await service.resolve('guild', 'thread')).toBeNull();
  });
});
