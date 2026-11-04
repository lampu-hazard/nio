import { Injectable } from '@nestjs/common';
import https = require('node:https');
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import * as ipaddr from 'ipaddr.js';
import { IncomingMessage } from 'node:http';

export type PublicImageRequest = {
  url: string; method: 'GET' | 'POST'; headers?: Record<string, string>; body?: Buffer;
  maxBytes: number; redirects: number; signal: AbortSignal; beforeSend?: () => Promise<void>;
};
export class ImageHttpError extends Error {
  constructor(readonly code: string, readonly dispatched = false) { super(code); }
}
function publicAddress(address: string): boolean {
  try { return ipaddr.parse(address).range() === 'unicast'; } catch { return false; }
}

@Injectable()
export class PublicImageHttpService {
  async request(input: PublicImageRequest): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
    if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes < 1 || !Number.isInteger(input.redirects) || input.redirects < 0 || input.redirects > 2) {
      throw new ImageHttpError('IMAGE_REQUEST_INVALID');
    }
    let url = input.url;
    for (let hop = 0; ; hop++) {
      const target = await this.destination(url, input.signal);
      if (hop === 0 && input.beforeSend) {
        await input.beforeSend();
        if (input.signal.aborted) throw new ImageHttpError('IMAGE_ABORTED');
      }
      const result = await this.send(target, { ...input, headers: hop === 0 ? input.headers : {}, body: hop === 0 ? input.body : undefined });
      if (![301, 302, 303, 307, 308].includes(result.status) || input.redirects === 0) return result;
      if (hop >= input.redirects) throw new ImageHttpError('IMAGE_REDIRECT_LIMIT', true);
      try { url = new URL(result.headers.location, target.url).toString(); }
      catch { throw new ImageHttpError('IMAGE_DESTINATION_DENIED', true); }
    }
  }

  private async destination(raw: string, signal: AbortSignal) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new ImageHttpError('IMAGE_DESTINATION_DENIED'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) throw new ImageHttpError('IMAGE_DESTINATION_DENIED');
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }]
      : await this.abortable(this.resolve(hostname), signal);
    if (signal.aborted) throw new ImageHttpError('IMAGE_ABORTED');
    if (!addresses.length || addresses.some(({ address, family }) => !publicAddress(address) || isIP(address) !== family)) throw new ImageHttpError('IMAGE_DESTINATION_DENIED');
    return { url, hostname, address: addresses[0] };
  }

  private resolve(hostname: string): Promise<{ address: string; family: number }[]> {
    return lookup(hostname, { all: true, verbatim: true });
  }

  private abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      const abort = () => { signal.removeEventListener('abort', abort); reject(new ImageHttpError('IMAGE_ABORTED')); };
      signal.addEventListener('abort', abort, { once: true });
      promise.then((value) => { signal.removeEventListener('abort', abort); resolve(value); }, () => {
        signal.removeEventListener('abort', abort); reject(new ImageHttpError('IMAGE_DESTINATION_DENIED'));
      });
      if (signal.aborted) abort();
    });
  }

  private send(target: { url: URL; hostname: string; address: { address: string; family: number } }, input: PublicImageRequest): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
    return new Promise((resolve, reject) => {
      let response: IncomingMessage | undefined;
      let settled = false;
      let dispatched = false;
      const finish = (error?: ImageHttpError, result?: { status: number; headers: Record<string, string>; body: Buffer }) => {
        if (settled) return;
        settled = true;
        input.signal.removeEventListener('abort', abort);
        if (error) { response?.destroy(); request.destroy(); reject(error); }
        else resolve(result!);
      };
      const abort = () => finish(new ImageHttpError('IMAGE_ABORTED', dispatched));
      const headers = Object.fromEntries(Object.entries(input.headers ?? {}).filter(([key]) => !['host', 'connection', 'transfer-encoding', 'accept-encoding'].includes(key.toLowerCase())));
      const request = https.request({
        protocol: 'https:', hostname: target.hostname, servername: isIP(target.hostname) ? undefined : target.hostname,
        port: 443, method: input.method, path: `${target.url.pathname}${target.url.search}`, agent: false,
        headers: { ...headers, 'Accept-Encoding': 'identity' },
        // No second resolver: TLS still verifies the original hostname, not the pinned address.
        lookup: ((_host: string, options: any, callback: any) => options?.all
          ? callback(null, [target.address]) : callback(null, target.address.address, target.address.family)) as any,
      }, (incoming) => {
        response = incoming;
        const responseHeaders: Record<string, string> = {};
        for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) responseHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
        if (responseHeaders['content-encoding'] && responseHeaders['content-encoding'].toLowerCase() !== 'identity') {
          finish(new ImageHttpError('IMAGE_ENCODING_UNSUPPORTED', dispatched)); return;
        }
        const length = responseHeaders['content-length'];
        if (length && (!/^\d+$/.test(length) || Number(length) > input.maxBytes)) { finish(new ImageHttpError('IMAGE_BODY_TOO_LARGE', dispatched)); return; }
        const chunks: Buffer[] = [];
        let bytes = 0;
        incoming.on('data', (chunk: Buffer) => {
          if (settled) return;
          const buffer = Buffer.from(chunk);
          bytes += buffer.length;
          if (bytes > input.maxBytes) { finish(new ImageHttpError('IMAGE_BODY_TOO_LARGE', dispatched)); return; }
          chunks.push(buffer);
        });
        incoming.on('end', () => finish(undefined, { status: incoming.statusCode ?? 0, headers: responseHeaders, body: Buffer.concat(chunks, bytes) }));
        incoming.on('error', () => finish(new ImageHttpError('IMAGE_NETWORK_ERROR', dispatched)));
        incoming.on('aborted', () => finish(new ImageHttpError('IMAGE_NETWORK_ERROR', dispatched)));
      });
      request.on('error', () => finish(new ImageHttpError('IMAGE_NETWORK_ERROR', dispatched)));
      input.signal.addEventListener('abort', abort, { once: true });
      if (input.signal.aborted) { abort(); return; }
      dispatched = true;
      request.end(input.body);
    });
  }
}
