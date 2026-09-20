import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { SelfRolesService } from './self-roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppLogger } from '../logger/logger.service';

describe('SelfRolesService', () => {
  let service: SelfRolesService;
  let prisma: any;
  let logger: any;

  const roles = [
    { id: 'option-a', roleId: 'role-a', position: 0 },
    { id: 'option-b', roleId: 'role-b', position: 1 },
  ];

  beforeEach(() => {
    prisma = {
      panel: { findUnique: jest.fn() },
      roleLog: { create: jest.fn(async () => ({})) },
    };
    logger = { log: jest.fn(), error: jest.fn() };
    service = new SelfRolesService(
      prisma as unknown as PrismaService,
      logger as unknown as AppLogger,
    );
  });

  function interaction(heldRoleIds: string[] = [], addImpl?: (roleId: string | string[]) => Promise<unknown>) {
    const cache = new Map(heldRoleIds.map((id) => [id, { id }]));
    const add = jest.fn<(roleId: string | string[]) => Promise<unknown>>(addImpl ?? (async () => undefined));
    const remove = jest.fn<(roleId: string | string[]) => Promise<void>>(async () => undefined);

    return {
      interaction: {
        deferReply: jest.fn(async () => undefined),
        editReply: jest.fn(async (reply: unknown) => reply),
        user: { id: 'user-1' },
        member: { roles: { cache, add, remove } },
        guild: {
          roles: {
            cache: new Map(roles.map(({ roleId }) => [roleId, { id: roleId }])),
            fetch: jest.fn(),
          },
        },
      } as any,
      add,
      remove,
    };
  }

  function panel(maxRoles: number) {
    prisma.panel.findUnique.mockImplementation(async () => ({
      id: 'panel-1',
      guildId: 'guild-1',
      name: 'Colors',
      requireRoleId: null,
      maxRoles,
      roles,
    }));
  }

  it('toggles off the selected role on an exclusive panel', async () => {
    panel(1);
    const { interaction: mockInteraction, add, remove } = interaction(['role-a']);

    await service.toggleFromInteraction(mockInteraction, 'panel-1', 'role-a');

    expect(remove).toHaveBeenCalledWith('role-a');
    expect(add).not.toHaveBeenCalled();
    expect(prisma.roleLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.roleLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ roleId: 'role-a', action: 'REMOVE' }) });
  });

  it('swaps only roles held from the exclusive panel and logs completed operations', async () => {
    panel(1);
    const { interaction: mockInteraction, add, remove } = interaction(['role-a', 'unrelated-role']);

    await service.toggleFromInteraction(mockInteraction, 'panel-1', 'role-b');

    expect(remove).toHaveBeenCalledWith(['role-a']);
    expect(add).toHaveBeenCalledWith('role-b');
    expect(prisma.roleLog.create).toHaveBeenNthCalledWith(1, { data: expect.objectContaining({ roleId: 'role-a', action: 'REMOVE' }) });
    expect(prisma.roleLog.create).toHaveBeenNthCalledWith(2, { data: expect.objectContaining({ roleId: 'role-b', action: 'ADD' }) });
  });

  it('best-effort restores removed roles and writes no logs when the exclusive add fails', async () => {
    panel(1);
    const addError = new Error('cannot add role');
    const addImpl = jest.fn(async (roleId: string | string[]) => {
      if (roleId === 'role-b') throw addError;
    });
    const { interaction: mockInteraction, add, remove } = interaction(['role-a'], addImpl);

    await expect(service.toggleFromInteraction(mockInteraction, 'panel-1', 'role-b')).rejects.toThrow(addError);

    expect(remove).toHaveBeenCalledWith(['role-a']);
    expect(add).toHaveBeenNthCalledWith(1, 'role-b');
    expect(add).toHaveBeenNthCalledWith(2, ['role-a']);
    expect(prisma.roleLog.create).not.toHaveBeenCalled();
  });

  it('keeps the cap for maxRoles greater than one', async () => {
    panel(2);
    const { interaction: mockInteraction, add, remove } = interaction(['role-a', 'role-b']);
    prisma.panel.findUnique.mockImplementation(async () => ({
      id: 'panel-1', guildId: 'guild-1', name: 'Colors', requireRoleId: null, maxRoles: 2,
      roles: [...roles, { id: 'option-c', roleId: 'role-c', position: 2 }],
    }));
    mockInteraction.guild.roles.cache.set('role-c', { id: 'role-c' });

    await service.toggleFromInteraction(mockInteraction, 'panel-1', 'role-c');

    expect(add).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(prisma.roleLog.create).not.toHaveBeenCalled();
    expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({ embeds: expect.any(Array) }));
  });

  it('allows unlimited roles when maxRoles is zero', async () => {
    panel(0);
    const { interaction: mockInteraction, add, remove } = interaction(['role-a']);

    await service.toggleFromInteraction(mockInteraction, 'panel-1', 'role-b');

    expect(remove).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith('role-b');
    expect(prisma.roleLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ roleId: 'role-b', action: 'ADD' }) });
  });
});
