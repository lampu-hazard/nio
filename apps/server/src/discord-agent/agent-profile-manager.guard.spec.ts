import { describe, expect, it } from '@jest/globals';
import { PermissionFlagsBits } from 'discord.js';
import { AgentProfileManagerGuard } from './agent-profile-manager.guard';

const context = (profile?: string, userId = 'user') => ({ switchToHttp: () => ({ getRequest: () => ({ params: { guildId: 'guild', profile }, session: { user: { id: userId } } }) }) }) as any;

describe('AgentProfileManagerGuard', () => {
  it('requires fresh Manage Guild or Administrator for ADMIN, including compatibility PATCH', async () => {
    const guard = new AgentProfileManagerGuard();
    let permission = PermissionFlagsBits.ManageRoles;
    const guild = { ownerId: 'owner', members: { fetch: async () => ({ guild: { id: 'guild' }, permissions: { has: (bit: bigint) => permission === bit } }) } };
    guard.setClient({ guilds: { fetch: async () => guild } } as any);
    await expect(guard.canActivate(context('ADMIN'))).rejects.toThrow();
    await expect(guard.canActivate(context())).rejects.toThrow();
    permission = PermissionFlagsBits.ManageGuild;
    await expect(guard.canActivate(context('ADMIN'))).resolves.toBe(true);
    permission = PermissionFlagsBits.Administrator;
    await expect(guard.canActivate(context())).resolves.toBe(true);
    permission = 0n;
    await expect(guard.canActivate(context('ADMIN', 'owner'))).resolves.toBe(true);
  });
  it('does not add an ADMIN manager requirement to PUBLIC or trust unavailable membership', async () => {
    const guard = new AgentProfileManagerGuard();
    await expect(guard.canActivate(context('PUBLIC'))).resolves.toBe(true);
    await expect(guard.canActivate(context('ADMIN'))).rejects.toThrow();
    await expect(guard.canActivate(context('admin'))).rejects.toThrow();
  });
});
