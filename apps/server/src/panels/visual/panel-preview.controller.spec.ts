import { describe, expect, it, jest } from '@jest/globals';
import { Test } from '@nestjs/testing';
import { PanelsService } from '../panels.service';
import { PanelImageRendererService } from './panel-image-renderer.service';
import { PanelPreviewLimitService } from './panel-preview-limit.service';
import { ApiExceptionFilter } from '../../common/filters/api-exception.filter';
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
  it('enforces real HTTP session and guild guards before returning a PNG', async () => {
    const render = jest.fn(async () => Buffer.from([137,80,78,71,13,10,26,10]));
    const module = await Test.createTestingModule({ controllers: [PanelPreviewController], providers: [
      SessionAuthGuard, GuildAccessGuard,
      { provide: PanelsService, useValue: {} },
      { provide: PanelImageRendererService, useValue: { render } },
      { provide: PanelPreviewLimitService, useValue: new PanelPreviewLimitService() },
    ] }).compile();
    const app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      const fixture = req.headers['x-test-session'];
      req.session = fixture ? { user: { id: 'u' }, guilds: fixture === 'allowed' ? [{ id: '123', permissions: '32' }] : [] } : {};
      next();
    });
    app.useGlobalFilters(new ApiExceptionFilter({ warn() {}, error() {} } as any));
    try {
      await app.listen(0, '127.0.0.1');
      const url = `${await app.getUrl()}/guilds/123/panels/visual-preview`;
      for (const [session, status] of [['', 401], ['foreign', 403], ['allowed', 201]] as const) {
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-test-session': session }, body: JSON.stringify({ visualDocument: doc }) });
        expect(response.status).toBe(status);
        if (status === 201) {
          expect(response.headers.get('content-type')).toContain('image/png');
          expect(response.headers.get('cache-control')).toBe('no-store');
          expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
        }
      }
      expect(render).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });

  it('rejects stale preview before starting work', async () => {
    const render = jest.fn<any>();
    const controller = new PanelPreviewController({ get: async () => ({ revision: 2 }) } as any, { render } as any, { consume: () => {} } as any);
    await expect(controller.preview('123', 'p', { id: 'u' } as any, { visualDocument: doc, expectedRevision: 1 } as any, new EventEmitter() as any, new EventEmitter() as any)).rejects.toMatchObject({ status: 409 });
    expect(render).not.toHaveBeenCalled();
  });
});
