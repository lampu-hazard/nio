import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { ChannelType } from 'discord.js';
import { Prisma } from '@prisma/client';
import { PanelsService } from '../panels.service';
import { PanelRendererService } from '../panel-renderer.service';
import { DiscordPublisherService } from '../discord-publisher.service';
import { PanelImageRendererService, resolvePanelVisualRuntimePaths } from './panel-image-renderer.service';
import { PanelPublishCoordinatorService } from './panel-publish-coordinator.service';
import { PanelPublishLockService } from './panel-publish-lock.service';

function fixture() {
  let revision = 0;
  let release!: () => void;
  const rendering = new Promise<void>(resolve => { release = resolve; });
  const panels = { get: jest.fn(async () => ({ id: 'p', guildId: '123', revision })), markPublished: jest.fn(async (..._args: any[]) => ({ revision: ++revision })), markUnpublished: jest.fn(async () => ({ revision: ++revision })) };
  const publisher = { prepare: jest.fn(async () => { await rendering; return {}; }), sendPrepared: jest.fn(async () => ({ id: 'message' })), deletePublishedMessage: jest.fn(async () => {}) };
  const locks = new PanelPublishLockService();
  return { coordinator: new PanelPublishCoordinatorService(panels as any, publisher as any, locks), publisher, panels, release, mutate: () => locks.run('123', 'p', async () => { revision++; }) };
}
describe('panel publish revision coordination', () => {
  it('rejects changed snapshots after rendering without sending to Discord', async () => {
    const f = fixture();
    const pending = f.coordinator.publish('123', 'p', 'u', 0);
    await f.mutate();
    f.release();
    await expect(pending).rejects.toMatchObject({ status: 409 });
    expect(f.publisher.sendPrepared).not.toHaveBeenCalled();
  });
  it('publishes and stores status under the shared panel lock', async () => {
    const f = fixture(); f.release();
    const result = await f.coordinator.publish('123', 'p', 'u', 0);
    expect(result).toMatchObject({ messageId: 'message', panel: { revision: 1 } });
    expect(f.panels.markPublished).toHaveBeenCalledWith('123', 'p', 'message', 'u', true);
  });
  it('rejects an initially stale request before rendering', async () => {
    const f = fixture();
    await expect(f.coordinator.publish('123', 'p', 'u', 5)).rejects.toMatchObject({ status: 409 });
    expect(f.publisher.prepare).not.toHaveBeenCalled();
  });
});

describe('panel cross-layer save -> worker PNG -> publish -> rollback regressions', () => {
  let activeImageRenderer: PanelImageRendererService | null = null;
  afterEach(async () => {
    await activeImageRenderer?.onModuleDestroy();
    activeImageRenderer = null;
  });

  it('round-trips a saved Canvas document through worker PNG rendering into a published payload, rejects role mutation conflicts, and rolls back cleanly to legacy', async () => {
    let state: any = {
      id: 'p1',
      guildId: '123',
      channelId: 'ch-1',
      messageId: null,
      name: 'Roles',
      title: 'Choose Roles',
      accentText: 'Pick below',
      description: 'Legacy description',
      type: 'SELF_ROLE',
      mode: 'BUTTON',
      style: 'NEON',
      color: '#5865F2',
      imageUrl: 'https://cdn.example.com/legacy-banner.png',
      thumbnailUrl: null,
      requireRoleId: null,
      maxRoles: 0,
      revision: 0,
      status: 'DRAFT',
      roles: [{ id: 'role-opt-1', panelId: 'p1', roleId: 'discord-role-1', label: 'Updates', emoji: '🔔', description: 'News', buttonStyle: 'PRIMARY', position: 0 }],
      visualDocument: null,
    };
    const prisma: any = {
      panel: {
        findFirst: jest.fn(async ({ where }: any) => (where.id === state.id && where.guildId === state.guildId ? structuredClone(state) : null)),
        update: jest.fn(async ({ data }: any) => {
          for (const [k, v] of Object.entries(data)) if (v !== undefined) state[k] = v === Prisma.DbNull ? null : v;
          return structuredClone(state);
        }),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (where.id !== state.id || where.guildId !== state.guildId || (where.revision !== undefined && where.revision !== state.revision)) return { count: 0 };
          state.revision += (data.revision as any).increment;
          return { count: 1 };
        }),
      },
      panelRole: {
        create: jest.fn(async ({ data }: any) => {
          const created = { id: `role-opt-${state.roles.length + 1}`, ...data };
          state.roles.push(created);
          return created;
        }),
      },
      guild: { findUnique: jest.fn(async () => null) },
      auditLog: { create: jest.fn(async () => ({})) },
      $transaction: jest.fn(async (work: any) => work(prisma)),
    };
    const sentPayloads: any[] = [];
    const editedPayloads: any[] = [];
    const channelMessage = {
      id: 'msg-100',
      attachments: new Map<string, { id: string; name: string }>(),
      edit: jest.fn(async (payload: any) => {
        editedPayloads.push(payload);
        return channelMessage;
      }),
    };
    const channel = {
      id: 'ch-1',
      name: 'roles',
      type: ChannelType.GuildText,
      isTextBased: () => true,
      permissionsFor: () => ({ has: () => true }),
      send: jest.fn(async (payload: any) => {
        sentPayloads.push(payload);
        channelMessage.attachments.set('att-1', { id: 'att-1', name: 'panel-visual.png' });
        return channelMessage;
      }),
      messages: { fetch: jest.fn(async () => channelMessage) },
    };
    const guildObj = {
      id: '123',
      name: 'NIO Server',
      iconURL: () => null,
      members: { me: { id: 'bot-1' } },
      channels: { fetch: jest.fn(async () => channel) },
    };
    const bot: any = {
      client: {
        user: { id: 'bot-1' },
        guilds: {
          cache: new Map([['123', guildObj]]),
          fetch: jest.fn(async () => guildObj),
        },
      },
    };
    const locks = new PanelPublishLockService();
    const panels = new PanelsService(prisma, bot, locks);
    activeImageRenderer = new PanelImageRendererService({ load: jest.fn() } as any);
    const renderer = new PanelRendererService({} as any, undefined, undefined, activeImageRenderer);
    const publisher = new DiscordPublisherService(bot, renderer, { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any);
    const coordinator = new PanelPublishCoordinatorService(panels, publisher, locks);

    const devPaths = resolvePanelVisualRuntimePaths();
    expect(existsSync(devPaths.workerPath)).toBe(true);
    expect(existsSync(join(devPaths.fontsDir, 'DejaVuSans.ttf'))).toBe(true);
    expect(existsSync(join(devPaths.fontsDir, 'DejaVuSans-Bold.ttf'))).toBe(true);
    expect(existsSync(join(devPaths.fontsDir, 'supported-codepoints.json'))).toBe(true);

    const compiledDir = join(__dirname, '..', '..', '..', '..', 'dist', 'panels', 'visual');
    if (existsSync(compiledDir)) {
      const prodPaths = resolvePanelVisualRuntimePaths(compiledDir, join(compiledDir, 'panel-image-renderer.service.js'));
      expect(prodPaths.workerPath).toMatch(/panel-image\.worker\.js$/);
      expect(existsSync(prodPaths.workerPath)).toBe(true);
      expect(existsSync(join(prodPaths.fontsDir, 'DejaVuSans.ttf'))).toBe(true);
    }

    const canvasDocument = {
      version: 1 as const,
      editorMode: 'CANVAS' as const,
      canvas: {
        width: 800,
        height: 360,
        background: '#141719',
        description: 'Custom role banner',
        elements: [
          { id: 'bg-card', type: 'rectangle' as const, x: 24, y: 24, width: 752, height: 312, fill: '#22262a', radius: 16 },
          { id: 'headline', type: 'text' as const, x: 48, y: 56, width: 704, height: 80, text: 'NIO Role Center', font: 'dejavu-sans' as const, fontSize: 36, lineHeight: 1.25, weight: 'bold' as const, align: 'left' as const, color: '#ffffff' },
        ],
      },
      native: {
        blocks: [{ id: 'blk-1', text: 'Select your notification roles below.' }],
        controls: [
          { kind: 'role' as const, panelRoleId: 'role-opt-1' },
          { kind: 'link' as const, id: 'lnk-1', label: 'Server Guide', url: 'https://example.com/guide' },
        ],
      },
    };

    const saved = await panels.update('123', 'p1', 'u1', { visualDocument: canvasDocument, expectedRevision: 0 } as any);
    expect(saved.revision).toBe(1);

    const published = await coordinator.publish('123', 'p1', 'u1', saved.revision);
    expect(published.messageId).toBe('msg-100');
    expect(published.panel.revision).toBe(2);
    expect(sentPayloads).toHaveLength(1);
    expect(sentPayloads[0].files).toHaveLength(1);
    expect(sentPayloads[0].files[0].name).toBe('panel-visual.png');
    expect((sentPayloads[0].files[0].attachment as Buffer).subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(sentPayloads[0].embeds[0].toJSON()).toMatchObject({
      description: 'Select your notification roles below.',
      image: { url: 'attachment://panel-visual.png' },
    });
    expect(sentPayloads[0].components).toHaveLength(1);

    // Role mutation increments revision and causes stale publish to reject with 409
    await panels.addRole('123', 'p1', 'u1', { roleId: 'discord-role-2', label: 'Events' } as any);
    await expect(coordinator.publish('123', 'p1', 'u1', published.panel.revision)).rejects.toMatchObject({ status: 409 });
    expect(editedPayloads).toHaveLength(0);

    // Visual rollback to null restores legacy embed description, external imageUrl, and clears attachments
    const rolledBack = await panels.update('123', 'p1', 'u1', { visualDocument: null, expectedRevision: 3 } as any);
    await coordinator.publish('123', 'p1', 'u1', rolledBack.revision);
    expect(editedPayloads).toHaveLength(1);
    expect(editedPayloads[0].attachments).toEqual([]);
    expect(editedPayloads[0].files ?? []).toHaveLength(0);
    expect(editedPayloads[0].embeds[0].toJSON()).toMatchObject({
      image: { url: 'https://cdn.example.com/legacy-banner.png' },
    });
    expect(editedPayloads[0].embeds[0].toJSON().description).toContain('Legacy description');
  });
});
