import { Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { ImageHttpError, PublicImageHttpService } from './public-image-http.service';
export type ImageGenerationInput = { baseUrl: string; model: string; apiKey: string; prompt: string; signal: AbortSignal; maxImageBytes: number; onBeforeDispatch?: () => Promise<void> };
export class ImageProviderError extends Error {
  constructor(readonly code: string, readonly dispatched: boolean, readonly definiteRejection = false) { super(code); }
}

@Injectable()
export class OpenAiImageProvider {
  constructor(private readonly http: PublicImageHttpService) {}

  async generate(input: ImageGenerationInput): Promise<{ buffer: Buffer; extension: 'png' | 'jpg' | 'webp' }> {
    let base: URL;
    try { base = new URL(input.baseUrl); } catch { throw new ImageProviderError('IMAGE_CONFIGURATION_INVALID', false); }
    const host = base.hostname.toLowerCase();
    const isPollinations = host === 'pollinations.ai' || host.endsWith('.pollinations.ai');
    if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || (base.port && base.port !== '443')
      || (!input.apiKey && !isPollinations) || !input.model.trim() || input.model.length > 120 || input.prompt.trim().length < 1 || input.prompt.length > 4000
      || !Number.isSafeInteger(input.maxImageBytes) || input.maxImageBytes < 1) throw new ImageProviderError('IMAGE_CONFIGURATION_INVALID', false);
    const maxBytes = Math.min(8388608, input.maxImageBytes);
    const controller = new AbortController();
    const abort = () => controller.abort();
    input.signal.addEventListener('abort', abort, { once: true });
    if (input.signal.aborted) abort();
    const timer = setTimeout(abort, 120000);
    timer.unref?.();
    let dispatched = false;
    let apiCompleted = false;
    let hookError: unknown;
    try {
      if (controller.signal.aborted) throw new ImageProviderError('IMAGE_ABORTED', false);
      if (!input.onBeforeDispatch) dispatched = true;
      const directPromptEndpoint = host === 'image.pollinations.ai' || base.pathname.replace(/\/$/, '') === '/prompt';
      const authHeader: Record<string, string> = input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {};
      const response = await this.http.request(directPromptEndpoint ? {
        url: `${base.origin}/prompt/${encodeURIComponent(input.prompt)}?model=${encodeURIComponent(input.model.trim())}&width=1024&height=1024&nologo=true`,
        method: 'GET', redirects: 2, headers: authHeader, maxBytes, signal: controller.signal,
        beforeSend: input.onBeforeDispatch ? async () => {
          try { await input.onBeforeDispatch!(); dispatched = true; }
          catch (error) { hookError = error; throw error; }
        } : undefined,
      } : {
        url: `${base.toString().replace(/\/$/, '')}/images/generations`, method: 'POST', redirects: 0,
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: Buffer.from(JSON.stringify({ model: input.model, prompt: input.prompt, n: 1, size: '1024x1024' })),
        maxBytes: 12582912, signal: controller.signal,
        beforeSend: input.onBeforeDispatch ? async () => {
          try { await input.onBeforeDispatch!(); dispatched = true; }
          catch (error) { hookError = error; throw error; }
        } : undefined,
      });
      apiCompleted = true;
      if (response.status < 200 || response.status >= 300) throw new ImageProviderError(`IMAGE_HTTP_${response.status}`, true, [400, 401, 403, 404, 413, 422, 429].includes(response.status));
      let buffer: Buffer;
      let mime: string | undefined;
      const responseMime = response.headers['content-type']?.split(';')[0].trim().toLowerCase();
      if (directPromptEndpoint || (responseMime && responseMime.startsWith('image/'))) {
        buffer = response.body;
        mime = responseMime;
      } else {
        if (response.body.length > 12582912) throw new ImageProviderError('IMAGE_BODY_TOO_LARGE', true);
        let json: any;
        try { json = JSON.parse(response.body.toString('utf8')); } catch { throw new ImageProviderError('IMAGE_RESPONSE_INVALID', true); }
        if (!Array.isArray(json?.data) || json.data.length !== 1 || !json.data[0] || typeof json.data[0] !== 'object') throw new ImageProviderError('IMAGE_RESPONSE_INVALID', true);
        const result = json.data[0];
        const hasBase64 = typeof result.b64_json === 'string' && result.b64_json.length > 0;
        const hasUrl = typeof result.url === 'string' && result.url.length > 0;
        if (hasBase64 === hasUrl || (result.b64_json != null && !hasBase64) || (result.url != null && !hasUrl)) throw new ImageProviderError('IMAGE_RESPONSE_INVALID', true);
        if (hasBase64) {
          if (result.b64_json.length > 4 * Math.ceil(maxBytes / 3)) throw new ImageProviderError('IMAGE_BODY_TOO_LARGE', true);
          if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(result.b64_json)) throw new ImageProviderError('IMAGE_RESPONSE_INVALID', true);
          buffer = Buffer.from(result.b64_json, 'base64');
          if (buffer.toString('base64') !== result.b64_json) throw new ImageProviderError('IMAGE_RESPONSE_INVALID', true);
        } else {
          const download = await this.http.request({ url: result.url, method: 'GET', redirects: 2, maxBytes, signal: controller.signal });
          if (download.status < 200 || download.status >= 300) throw new ImageProviderError('IMAGE_DOWNLOAD_FAILED', true);
          buffer = download.body;
          mime = download.headers['content-type']?.split(';')[0].trim().toLowerCase();
        }
      }
      if (buffer.length > maxBytes) throw new ImageProviderError('IMAGE_BODY_TOO_LARGE', true);
      let extension: 'png' | 'jpg' | 'webp';
      try {
        const image = sharp(buffer, { failOn: 'warning', limitInputPixels: 16000000, animated: true });
        const metadata = await image.metadata();
        const validDimensions = isPollinations
          ? (metadata.width ?? 0) >= 64 && (metadata.width ?? 0) <= 2048 && (metadata.height ?? 0) >= 64 && (metadata.height ?? 0) <= 2048
          : metadata.width === 1024 && metadata.height === 1024;
        if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '') || !validDimensions || (metadata.pages ?? 1) !== 1) throw new Error();
        extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format as 'png' | 'webp';
        if (mime && mime !== `image/${metadata.format}` && mime !== 'application/octet-stream') throw new Error();
        // Metadata alone accepts some truncated rasters. Decode all pixels before delivery.
        await image.raw().toBuffer();
      } catch { throw new ImageProviderError('IMAGE_RASTER_INVALID', true); }
      if (controller.signal.aborted) throw new ImageProviderError('IMAGE_ABORTED', true);
      return { buffer, extension };
    } catch (error) {
      if (hookError) throw hookError;
      if (error instanceof ImageProviderError) throw error;
      if (error instanceof ImageHttpError) throw new ImageProviderError(error.code, apiCompleted || error.dispatched);
      throw new ImageProviderError('IMAGE_PROVIDER_ERROR', dispatched);
    } finally {
      clearTimeout(timer);
      input.signal.removeEventListener('abort', abort);
    }
  }
}
