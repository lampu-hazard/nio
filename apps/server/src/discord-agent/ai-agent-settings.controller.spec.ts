import 'reflect-metadata';
import { describe, expect, it } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AiAgentSettingsController } from './ai-agent-settings.controller';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../guilds/guards/guild-access.guard';
import { AgentQuotaQueryService } from './quota/agent-quota-query.service';

function httpContext(request: any) {
  return { switchToHttp: () => ({ getRequest: () => request }) } as any;
}

describe('AI settings controller quotas and security guards', () => {
  it('preserves session and guild guards on all AI management routes', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AiAgentSettingsController)).toEqual([SessionAuthGuard, GuildAccessGuard]);
  });
  it('denies unauthenticated requests with 401 and non-manager or wrong-guild members with 403 even if they hold an AI role', () => {
    const sessionGuard = new SessionAuthGuard();
    const guildGuard = new GuildAccessGuard();
    const caught = (fn: () => unknown) => { try { fn(); return null; } catch (error) { return error as any; } };
    expect(caught(() => sessionGuard.canActivate(httpContext({ session: {} })))).toMatchObject({ code: 'AUTH_REQUIRED', status: 401 });
    expect(caught(() => guildGuard.canActivate(httpContext({ params: { guildId: 'guild-1' }, session: { user: { id: 'u1' }, guilds: [{ id: 'guild-2', permissions: '8' }] } })))).toMatchObject({ code: 'GUILD_ACCESS_DENIED', status: 403 });
    expect(caught(() => guildGuard.canActivate(httpContext({ params: { guildId: 'guild-1' }, session: { user: { id: 'u1' }, guilds: [{ id: 'guild-1', permissions: '0', roles: ['ai-enabled-role'] }] } })))).toMatchObject({ code: 'GUILD_ACCESS_DENIED', status: 403 });
    expect(guildGuard.canActivate(httpContext({ params: { guildId: 'guild-1' }, session: { user: { id: 'u1' }, guilds: [{ id: 'guild-1', permissions: String(0x20) }] } }))).toBe(true);
  });
  it('forwards only the scoped guild and paging options and rejects size > 100 or cross-guild cursors', async () => {
    const calls: unknown[][] = [];
    const page = { periodStart: 'today', members: [] };
    const controller = new AiAgentSettingsController({} as any, { getToday: async (...args: unknown[]) => { calls.push(args); return page; } } as any);
    expect(await controller.getQuotas('guild', 'cursor', '50')).toEqual({ ok: true, quotas: page });
    expect(calls).toEqual([['guild', 'cursor', '50']]);
    const realQuotas = new AgentQuotaQueryService({} as any, {} as any);
    const realController = new AiAgentSettingsController({} as any, realQuotas);
    await expect(realController.getQuotas('guild-1', undefined, '101')).rejects.toThrow('Invalid page size');
    const foreignCursor = Buffer.from(JSON.stringify({ guildId: 'guild-2', periodStart: '2026-11-04T00:00:00.000Z', subject: 'USER:1' })).toString('base64url');
    await expect(realController.getQuotas('guild-1', foreignCursor, '50')).rejects.toThrow('Invalid quota cursor');
  });
});
