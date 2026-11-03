import { describe, expect, it, jest } from '@jest/globals';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { EventEmitter } from 'node:events';
import { PanelPreviewController } from './panel-preview.controller';
import { SessionAuthGuard } from '../../auth/guards/session-auth.guard';
import { GuildAccessGuard } from '../../guilds/guards/guild-access.guard';

const doc = { version: 1, editorMode: 'CANVAS', canvas: { width: 600, height: 400, background: '#000000', description: 'Test', elements: [] } };
describe('panel PNG preview boundary', () => {
  it('retains session and guild authorization guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PanelPreviewController)).toEqual([SessionAuthGuard, GuildAccessGuard]);
  });
  it('rejects stale preview before starting work', async () => {
    const render = jest.fn<any>();
    const controller = new PanelPreviewController({ get: async () => ({ revision: 2 }) } as any, { render } as any, { consume: () => {} } as any);
    await expect(controller.preview('123', 'p', { id: 'u' } as any, { visualDocument: doc, expectedRevision: 1 } as any, new EventEmitter() as any, new EventEmitter() as any)).rejects.toMatchObject({ status: 409 });
    expect(render).not.toHaveBeenCalled();
  });
});
