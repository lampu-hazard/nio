import { afterEach, describe, expect, it, jest } from '@jest/globals';
import * as workerThreads from 'node:worker_threads';
import { PanelImageRendererService } from './panel-image-renderer.service';
import type { CanvasScene } from './panel-visual.document';

const scene: CanvasScene = { width: 600, height: 400, background: '#123456', description: 'Fixture', elements: [] };
const instances: PanelImageRendererService[] = [];
afterEach(async () => { for (const instance of instances.splice(0)) await instance.onModuleDestroy(); });
function renderer(load: (...args: any[]) => Promise<any> = async () => { throw new Error('Unexpected asset'); }) {
  const instance = new PanelImageRendererService({ load } as any);
  instances.push(instance);
  return instance;
}

describe('panel image workers', () => {
  it('awaits physical termination of a CPU-hung worker on shutdown', async () => {
    const RealWorker = workerThreads.Worker;
    let worker: workerThreads.Worker | undefined;
    const spy = jest.spyOn(require('node:worker_threads') as typeof workerThreads, 'Worker').mockImplementation((() => {
      worker = new RealWorker('while (true) {}', { eval: true });
      return worker;
    }) as any);
    try {
      const instance = renderer();
      const result = instance.render('123', scene).catch(error => error);
      await instance.onModuleDestroy();
      expect((await result).message).toMatch(/shutting down/);
      expect(worker!.threadId).toBe(-1);
    } finally { spy.mockRestore(); if (worker) await worker.terminate(); }
  });

  it('starts a source worker and produces a bounded PNG', async () => {
    const png = await renderer().render('123', scene);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    expect(png.readUInt32BE(16)).toBe(600);
    expect(png.readUInt32BE(20)).toBe(400);
    const { loadImage, createCanvas } = await import('@napi-rs/canvas');
    const image = await loadImage(png);
    const canvas = createCanvas(600, 400);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    expect([...context.getImageData(0, 0, 1, 1).data]).toEqual([18,52,86,255]);
  }, 10000);

  it('enforces the real end-to-end deadline and accepts later jobs', async () => {
    const instance = renderer(async () => new Promise(() => {}));
    const start = Date.now();
    await expect(instance.render('123', { ...scene, elements: [{ id: 'i', type: 'image', x: 0, y: 0, width: 100, height: 100, assetKey: 'panels/123/a.png' }] })).rejects.toThrow(/deadline/);
    expect(Date.now() - start).toBeGreaterThanOrEqual(4900);
    expect(Date.now() - start).toBeLessThan(6500);
    expect((await instance.render('123', scene)).length).toBeGreaterThan(0);
  }, 15000);

  it('blocks text overflow instead of clipping the published image', async () => {
    await expect(renderer().render('123', { ...scene, elements: [{ id: 't', type: 'text', x: 0, y: 0, width: 10, height: 10, text: 'too much text', font: 'dejavu-sans', fontSize: 24, weight: 'regular', color: '#ffffff', align: 'left', lineHeight: 1.2 }] })).rejects.toThrow(/overflow|text/i);
  }, 10000);

  it('renders layer order and a normalized crop from a real raster', async () => {
    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const source = createCanvas(20, 10);
    const sourceContext = source.getContext('2d');
    sourceContext.fillStyle = '#ff0000'; sourceContext.fillRect(0, 0, 10, 10);
    sourceContext.fillStyle = '#00ff00'; sourceContext.fillRect(10, 0, 10, 10);
    const png = await renderer(async () => ({ bytes: source.toBuffer('image/png'), width: 20, height: 10 })).render('123', { ...scene, elements: [
      { id: 'image', type: 'image', x: 0, y: 0, width: 100, height: 100, assetKey: 'panels/123/a.png', crop: { x: 0.5, y: 0, width: 0.5, height: 1 } },
      { id: 'rect', type: 'rectangle', x: 10, y: 10, width: 20, height: 20, fill: '#ffffff', radius: 0 },
    ] });
    const canvas = createCanvas(600, 400); const context = canvas.getContext('2d');
    context.drawImage(await loadImage(png), 0, 0);
    expect([...context.getImageData(5, 5, 1, 1).data]).toEqual([0,255,0,255]);
    expect([...context.getImageData(15, 15, 1, 1).data]).toEqual([255,255,255,255]);
  }, 10000);

  it('checks guild ownership before loading assets', async () => {
    await expect(renderer().render('123', { ...scene, elements: [{ id: 'i', type: 'image', x: 0, y: 0, width: 100, height: 100, assetKey: 'panels/456/a.png' }] })).rejects.toThrow(/server|guild/i);
  });

  it('bounds running and queued jobs and cancels queued requests', async () => {
    const instance = renderer(async (_guild, _key, signal: AbortSignal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
    const imageScene: CanvasScene = { ...scene, elements: [{ id: 'i', type: 'image', x: 0, y: 0, width: 100, height: 100, assetKey: 'panels/123/a.png' }] };
    const controller = new AbortController();
    const jobs = Array.from({ length: 10 }, () => instance.render('123', imageScene, controller.signal).catch(error => error));
    await expect(instance.render('123', imageScene)).rejects.toThrow(/busy|queue/i);
    controller.abort();
    await Promise.all(jobs);
    expect((await instance.render('123', scene)).length).toBeGreaterThan(0);
  }, 15000);
});
