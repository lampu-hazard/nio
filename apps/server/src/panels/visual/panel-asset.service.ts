import { Injectable } from '@nestjs/common';
import { R2Service } from '../../r2/r2.service';
import { inspectPanelRaster, type ValidatedRasterAsset } from './panel-raster';

export { inspectPanelRaster } from './panel-raster';
export type { ValidatedRasterAsset } from './panel-raster';

@Injectable()
export class PanelAssetService {
  constructor(private readonly r2: R2Service) {}

  async load(guildId: string, assetKey: string, signal?: AbortSignal): Promise<ValidatedRasterAsset> {
    if (!/^\d+$/.test(guildId) || !new RegExp(`^panels/${guildId}/[\\w-]+\\.(?:png|jpe?g|webp)$`, 'i').test(assetKey)) {
      throw new Error('Panel asset must belong to this server.');
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 2000);
    try {
      controller.signal.throwIfAborted();
      const result = await this.r2.readPanelAsset(guildId, assetKey, controller.signal);
      controller.signal.throwIfAborted();
      return await inspectPanelRaster(result.bytes, result.contentType);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}
