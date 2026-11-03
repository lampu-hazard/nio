import { describe, expect, it, jest } from '@jest/globals';
import { Prisma } from '@prisma/client';
import { PanelsService } from './panels.service';
import { PanelPublishLockService } from './visual/panel-publish-lock.service';

function fixture() {
  let panel: any = { id: 'p', guildId: '123', name: 'Panel', title: 'Title', type: 'SELF_ROLE', revision: 0, status: 'DRAFT', roles: [], visualDocument: null, imageUrl: 'https://example.com/a.png' };
  const prisma: any = {
    panel: {
      findFirst: jest.fn(async ({ where }: any) => where.guildId === panel.guildId && where.id === panel.id ? { ...panel, roles: [...panel.roles] } : null),
      create: jest.fn(async ({ data }: any) => {
        for (const [key, value] of Object.entries(data)) if (value !== undefined) panel[key] = value === Prisma.DbNull ? null : value;
        return { ...panel, roles: [...panel.roles] };
      }),
      update: jest.fn(async ({ data }: any) => {
        for (const [key, value] of Object.entries(data)) if (value !== undefined) panel[key] = value === Prisma.DbNull ? null : value;
        return { ...panel, roles: [...panel.roles] };
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (where.id !== panel.id || where.guildId !== panel.guildId || (where.revision !== undefined && where.revision !== panel.revision)) return { count: 0 };
        for (const [key, value] of Object.entries(data)) if (value !== undefined) panel[key] = key === 'revision' ? panel.revision + (value as any).increment : value;
        return { count: 1 };
      }),
    },
    panelRole: {
      create: jest.fn(async ({ data }: any) => { const role = { id: `r${panel.roles.length}`, ...data }; panel.roles.push(role); return role; }),
      findFirst: jest.fn(async ({ where }: any) => panel.roles.find((r: any) => r.id === where.id && r.panelId === where.panelId) ?? null),
      update: jest.fn(async ({ where, data }: any) => { const role = panel.roles.find((r: any) => r.id === where.id); Object.assign(role, data); return role; }),
      delete: jest.fn(async ({ where }: any) => { const role = panel.roles.find((r: any) => r.id === where.id); panel.roles = panel.roles.filter((r: any) => r !== role); return role; }),
    },
    guild: { upsert: jest.fn(async () => ({})) },
    auditLog: { create: jest.fn(async () => ({})) },
    $transaction: jest.fn(async (work: any) => {
      const before = structuredClone(panel);
      try { return await work(prisma); } catch (err) { panel = before; throw err; }
    }),
  };
  const bot: any = { client: { guilds: { cache: new Map([['123', { id: '123', name: 'Guild', icon: null }]]) } } };
  const service = new PanelsService(prisma, bot, new PanelPublishLockService());
  return { service, prisma, current: () => panel };
}
const visual = { version: 1, editorMode: 'SIMPLE', presentation: { footer: false } };

describe('panel visual persistence', () => {
  it('creates and round-trips a validated document', async () => {
    const f = fixture();
    const panel = await f.service.create('123', 'user', { name: 'Panel', title: 'Title', visualDocument: visual } as any);
    expect(panel.visualDocument).toEqual(visual);
    expect(panel.revision).toBe(0);
  });

  it('preserves omitted values and clears explicit nullable values', async () => {
    const f = fixture();
    await f.service.update('123', 'p', 'user', { visualDocument: visual, expectedRevision: 0 } as any);
    await f.service.update('123', 'p', 'user', { title: 'Updated', expectedRevision: 1 } as any);
    expect(f.current().visualDocument).toEqual(visual);
    expect(f.current().imageUrl).toBe('https://example.com/a.png');
    await f.service.update('123', 'p', 'user', { visualDocument: null, imageUrl: null, expectedRevision: 2 } as any);
    expect(f.current()).toMatchObject({ visualDocument: null, imageUrl: null, revision: 3 });
  });

  it('requires a revision for visual changes and rejects stale saves without overwriting data', async () => {
    const f = fixture();
    await expect(f.service.update('123', 'p', 'user', { visualDocument: visual } as any)).rejects.toMatchObject({ status: 409 });
    await f.service.update('123', 'p', 'user', { title: 'Saved', expectedRevision: 0 } as any);
    await expect(f.service.update('123', 'p', 'user', { title: 'Stale', expectedRevision: 0 } as any)).rejects.toMatchObject({ status: 409 });
    expect(f.current().title).toBe('Saved');
  });

  it('allows only one of two concurrent writes using the same revision', async () => {
    const f = fixture();
    const result = await Promise.allSettled([f.service.update('123', 'p', 'u', { title: 'A', expectedRevision: 0 } as any), f.service.update('123', 'p', 'u', { title: 'B', expectedRevision: 0 } as any)]);
    expect(result.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(f.current().revision).toBe(1);
  });

  it('increments revisions for role add, edit, reorder and removal', async () => {
    const f = fixture();
    const role = await f.service.addRole('123', 'p', 'u', { roleId: 'role', label: 'Role' } as any);
    expect(f.current().revision).toBe(1);
    await f.service.updateRole('123', 'p', role.id, 'u', { label: 'New' } as any);
    expect(f.current().revision).toBe(2);
    await f.service.reorderRoles('123', 'p', 'u', { roleOptionIds: [role.id] });
    expect(f.current().revision).toBe(3);
    await f.service.removeRole('123', 'p', role.id, 'u');
    expect(f.current().revision).toBe(4);
  });

  it('rejects cross-panel role deletion', async () => {
    const f = fixture();
    await expect(f.service.removeRole('123', 'p', 'foreign-role', 'u')).rejects.toThrow();
    expect(f.prisma.panelRole.delete).not.toHaveBeenCalled();
    expect(f.current().revision).toBe(0);
  });

  it('rejects cross-guild documents and invalid native role references', async () => {
    const f = fixture();
    const doc: any = { ...visual, simpleCrop: { assetKey: 'panels/456/a.png', width: 600, height: 400, description: 'Banner', crop: { x: 0, y: 0, width: 1, height: 1 } } };
    await expect(f.service.update('123', 'p', 'u', { visualDocument: doc, expectedRevision: 0 } as any)).rejects.toThrow();
    await expect(f.service.update('123', 'p', 'u', { visualDocument: { ...visual, native: { blocks: [], controls: [{ kind: 'role', panelRoleId: 'foreign' }] } }, expectedRevision: 0 } as any)).rejects.toThrow();
  });

  it('removes native references atomically when deleting their role', async () => {
    const f = fixture();
    const role = await f.service.addRole('123', 'p', 'u', { roleId: 'role', label: 'Role' } as any);
    await f.service.update('123', 'p', 'u', { expectedRevision: 1, visualDocument: { ...visual, native: { blocks: [], controls: [{ kind: 'role', panelRoleId: role.id }] } } } as any);
    await f.service.removeRole('123', 'p', role.id, 'u');
    expect(f.current().visualDocument.native.controls).toEqual([]);
    expect(f.current().revision).toBe(3);
  });

  it('serializes publish status and archive mutations with content writes', async () => {
    const f = fixture();
    await f.service.markPublished('123', 'p', 'message', 'u');
    expect(f.current()).toMatchObject({ revision: 1, status: 'PUBLISHED', messageId: 'message' });
    await f.service.markUnpublished('123', 'p', 'u');
    expect(f.current()).toMatchObject({ revision: 2, status: 'DRAFT', messageId: null });
    await f.service.archive('123', 'p', 'u');
    expect(f.current()).toMatchObject({ revision: 3, status: 'ARCHIVED' });
  });

  it('rejects malformed documents and Canvas leaderboard mode', async () => {
    const f = fixture();
    await expect(f.service.update('123', 'p', 'u', { visualDocument: { version: 2 }, expectedRevision: 0 } as any)).rejects.toThrow();
    const canvas = { version: 1, editorMode: 'CANVAS', canvas: { width: 600, height: 400, background: '#141719', description: 'Test', elements: [] } };
    await expect(f.service.create('123', 'u', { name: 'L', title: 'L', type: 'LEADERBOARD', visualDocument: canvas } as any)).rejects.toThrow();
  });
});
