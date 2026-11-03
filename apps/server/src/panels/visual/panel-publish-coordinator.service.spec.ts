import { describe, expect, it, jest } from '@jest/globals';
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
