import { ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { BoosterRoleService } from './booster-role.service';

function makeMember({ booster = true, hasRole = false } = {}) {
  return {
    id: 'user-1',
    premiumSince: booster ? new Date('2026-07-04T00:00:00.000Z') : null,
    roles: {
      cache: {
        has: jest.fn((roleId: string) => {
          if (roleId === 'premium-role') return booster;
          if (roleId === 'role-1') return hasRole;
          return false;
        }),
      },
      add: jest.fn(async () => {}),
      remove: jest.fn(async () => {}),
    },
  };
}

describe('BoosterRoleService', () => {
  let prisma: any;
  let bot: any;
  let guild: any;
  let service: BoosterRoleService;

  beforeEach(() => {
    guild = {
      roles: {
        premiumSubscriberRole: { id: 'premium-role' },
        create: jest.fn(async () => ({
          id: 'role-1',
          position: 3,
          edit: jest.fn(async () => ({})),
          setPosition: jest.fn(async () => ({})),
          delete: jest.fn(async () => {}),
        })),
        fetch: jest.fn(async () => ({
          premiumSubscriberRole: { id: 'premium-role' },
        })),
      },
      members: {
        fetch: jest.fn(),
        fetchMe: jest.fn(),
        me: {
          permissions: { has: jest.fn(() => true) },
          roles: { highest: { position: 10 } },
        },
      },
    };

    bot = {
      client: {
        guilds: {
          fetch: jest.fn(async () => guild),
        },
      },
    };

    prisma = {
      boosterRoleClaimToken: {
        upsert: jest.fn(async ({ create, update }: any) => ({ token: create?.token ?? update?.token ?? 'claim-token', ...create, ...update })),
        findUnique: jest.fn(),
        delete: jest.fn(async () => ({})),
      },
      boosterCustomRole: {
        findUnique: jest.fn(),
        update: jest.fn(async ({ data }: any) => ({ id: 'mapping-1', ...data })),
        upsert: jest.fn(async ({ create, update }: any) => ({ id: 'mapping-1', ...create, ...update })),
      },
    };

    service = new BoosterRoleService(prisma);
    service.setClient(bot.client as any);
  });

  it('generates a claim token only for active boosters', async () => {
    guild.members.fetch.mockResolvedValue(makeMember({ booster: true }));

    const result = await service.generateToken('guild-1', 'user-1');

    expect(result.token).toEqual(expect.any(String));
    expect(prisma.boosterRoleClaimToken.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { guildId_userId: { guildId: 'guild-1', userId: 'user-1' } },
      create: expect.objectContaining({ guildId: 'guild-1', userId: 'user-1' }),
    }));
  });

  it('rejects token generation for non-boosters', async () => {
    guild.members.fetch.mockResolvedValue(makeMember({ booster: false, hasRole: false }));

    await expect(service.generateToken('guild-1', 'user-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removes a custom booster role assignment when the member stops boosting', async () => {
    const member = makeMember({ booster: false, hasRole: true });
    guild.members.fetch.mockResolvedValue(member);
    prisma.boosterCustomRole.findUnique.mockResolvedValue({
      id: 'mapping-1',
      guildId: 'guild-1',
      userId: 'user-1',
      roleId: 'role-1',
      name: 'Expired Booster',
      color: '#111111',
    });

    const result = await service.revokeExpiredBoosterRole('guild-1', 'user-1');

    (expect(member.roles.remove) as any).toHaveBeenCalledWith('role-1', 'Removed custom booster role because member is no longer boosting.');
    expect(prisma.boosterCustomRole.update).toHaveBeenCalledWith({
      where: { guildId_userId: { guildId: 'guild-1', userId: 'user-1' } },
      data: expect.objectContaining({ active: false }),
    });
    expect(result.revoked).toBe(true);
  });

  it('updates an existing custom role instead of creating another role', async () => {
    const member = makeMember({ booster: true });
    guild.members.fetch.mockResolvedValue(member);
    prisma.boosterRoleClaimToken.findUnique.mockResolvedValue({
      token: 'claim-token',
      guildId: 'guild-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 10000),
    });
    prisma.boosterCustomRole.findUnique.mockResolvedValue({
      id: 'mapping-1',
      guildId: 'guild-1',
      userId: 'user-1',
      roleId: 'role-1',
      name: 'Old Name',
      color: '#111111',
    });
    const role = {
      id: 'role-1',
      position: 3,
      edit: jest.fn(async () => role),
      setPosition: jest.fn(async () => role),
      iconURL: jest.fn(() => null),
    };
    guild.roles.fetch.mockResolvedValue(role);

    await service.claimRole('guild-1', 'claim-token', 'New Name', { primaryColor: '#abcdef' });

    expect(guild.roles.create).not.toHaveBeenCalled();
    (expect(role.edit) as any).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name', colors: { primaryColor: 0xabcdef } }));
    expect(prisma.boosterCustomRole.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ roleId: 'role-1', name: 'New Name', color: '#abcdef', primaryColor: '#abcdef' }),
    }));
  });

  it('validates a token purely based on database record without session user', async () => {
    prisma.boosterRoleClaimToken.findUnique.mockResolvedValue({
      token: 'claim-token',
      guildId: 'guild-1',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 10000),
    });
    guild.members.fetch.mockResolvedValue(makeMember({ booster: true }));

    const result = await service.validateToken('guild-1', 'claim-token');

    expect(result.userId).toBe('user-1');
  });
});
