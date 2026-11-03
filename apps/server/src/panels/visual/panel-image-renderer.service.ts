import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';
import { AppError } from '../../common/errors/app-error';
import { PanelAssetService } from './panel-asset.service';
import type { CanvasScene } from './panel-visual.document';
import { validatePanelVisualDocument } from './panel-visual.validation';

type Job = {
  guildId: string;
  scene: CanvasScene;
  controller: AbortController;
  resolve: (png: Buffer) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
  worker?: Worker;
  settled: boolean;
};

@Injectable()
export class PanelImageRendererService implements OnModuleDestroy {
  private readonly queue: Job[] = [];
  private readonly running = new Set<Job>();
  private closed = false;
  private readonly terminations = new Set<Promise<void>>();

  constructor(private readonly assets: PanelAssetService) {}

  render(guildId: string, scene: CanvasScene, signal?: AbortSignal): Promise<Buffer> {
    try {
      validatePanelVisualDocument({ version: 1, editorMode: 'CANVAS', canvas: scene });
      if (scene.elements.some(e => e.type === 'image' && !e.assetKey.startsWith(`panels/${guildId}/`))) throw new Error('Images must belong to this server.');
      if (this.closed) throw new Error('Panel renderer is shutting down.');
      signal?.throwIfAborted();
      if (this.running.size >= 2 && this.queue.length >= 8) throw new AppError('PANEL_RENDER_BUSY', 'Panel render queue is busy.', 503);
    } catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const abort = () => this.finish(job, new Error('Panel rendering aborted.'));
      const job: Job = {
        guildId, scene: structuredClone(scene), controller, resolve, reject, settled: false,
        timer: setTimeout(() => this.finish(job, new Error('Panel rendering exceeded the 5-second deadline.')), 5000),
        cleanup: () => signal?.removeEventListener('abort', abort),
      };
      signal?.addEventListener('abort', abort, { once: true });
      this.queue.push(job);
      this.drain();
    });
  }

  private drain() {
    while (!this.closed && this.running.size < 2 && this.queue.length) {
      const job = this.queue.shift()!;
      if (job.settled) continue;
      this.running.add(job);
      void this.start(job).catch(error => this.finish(job, error instanceof Error ? error : new Error('Panel rendering failed.')));
    }
  }

  private async start(job: Job) {
    const keys = [...new Set(job.scene.elements.flatMap(e => e.type === 'image' ? [e.assetKey] : []))];
    const assets: Record<string, Uint8Array> = {};
    for (const key of keys) {
      const asset = await this.assets.load(job.guildId, key, job.controller.signal);
      if (job.settled) return;
      assets[key] = asset.bytes;
    }
    if (job.settled) return;
    const sourceMode = __filename.endsWith('.ts');
    const worker = new Worker(join(__dirname, sourceMode ? 'panel-image.worker.ts' : 'panel-image.worker.js'), {
      workerData: { scene: job.scene, assets },
      ...(sourceMode && !process.versions.bun ? { execArgv: ['-r', 'ts-node/register/transpile-only'] } : {}),
    });
    job.worker = worker;
    worker.once('message', (message: { png?: Uint8Array; error?: string }) => {
      if (message.error || !message.png) this.finish(job, new Error(message.error ?? 'Panel worker returned no image.'));
      else this.finish(job, undefined, Buffer.from(message.png));
    });
    worker.once('error', () => this.finish(job, new Error('Panel worker failed.')));
    worker.once('exit', () => { if (!job.settled) this.finish(job, new Error('Panel worker exited without output.')); });
  }

  private finish(job: Job, error?: Error, png?: Buffer) {
    if (job.settled) return;
    job.settled = true;
    clearTimeout(job.timer);
    job.cleanup();
    job.controller.abort();
    const index = this.queue.indexOf(job);
    if (index >= 0) this.queue.splice(index, 1);
    const release = () => { this.running.delete(job); this.drain(); };
    if (job.worker) {
      const termination = job.worker.terminate().then(release, release);
      this.terminations.add(termination);
      void termination.then(() => this.terminations.delete(termination));
    } else release();
    if (error) job.reject(error);
    else if (!png || png.length > 8 * 1024 * 1024) job.reject(new Error('Invalid panel output size.'));
    else job.resolve(png);
  }

  async onModuleDestroy() {
    this.closed = true;
    const jobs = [...this.queue, ...this.running];
    for (const job of jobs) this.finish(job, new Error('Panel renderer is shutting down.'));
    await Promise.all(this.terminations);
  }
}
