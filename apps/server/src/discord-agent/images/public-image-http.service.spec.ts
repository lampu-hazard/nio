import { afterEach, describe, expect, it, jest } from '@jest/globals';
import https = require('node:https');
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { PublicImageHttpService } from './public-image-http.service';

function fixture(responses: { status?: number; headers?: Record<string, string>; chunks?: Buffer[] }[] = [{}]) {
  const service = new PublicImageHttpService();
  const resolve = jest.spyOn(service as any, 'resolve').mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  const connections: any[] = [];
  const connector = jest.spyOn(https, 'request').mockImplementation(((options: any, callback: any) => {
    connections.push(options);
    const request = new EventEmitter() as any;
    request.destroy = () => request;
    request.end = () => {
      const response = responses.shift() ?? {};
      const body = Readable.from(response.chunks ?? [Buffer.from('ok')]) as any;
      body.statusCode = response.status ?? 200;
      body.headers = response.headers ?? {};
      queueMicrotask(() => callback(body));
    };
    return request;
  }) as any);
  return { service, resolve, connections, connector };
}
const input = { url: 'https://images.example/v1/images/generations', method: 'POST' as const, headers: { Authorization: 'Bearer secret' }, body: Buffer.from('{}'), maxBytes: 100, redirects: 0, signal: new AbortController().signal };

describe('public pinned image HTTP', () => {
  afterEach(() => { jest.restoreAllMocks(); });
  it.each(['http://example.com', 'https://u:p@example.com', 'https://example.com:8443', 'https://example.com/#fragment',
    'https://127.0.0.1', 'https://10.0.0.1', 'https://169.254.169.254', 'https://192.0.0.1', 'https://224.0.0.1',
    'https://[::1]', 'https://[fd00::1]', 'https://[fe80::1]', 'https://[::ffff:127.0.0.1]', 'https://[2001:db8::1]'])('rejects unsafe URL %s without connecting', async (url) => {
    const f = fixture();
    await expect(f.service.request({ ...input, url })).rejects.toThrow('IMAGE_DESTINATION_DENIED');
    expect(f.connections).toHaveLength(0);
  });
  it('rejects mixed DNS answers rather than choosing only the public answer', async () => {
    const f = fixture();
    f.resolve.mockResolvedValue([{ address: '93.184.216.34', family: 4 }, { address: '10.1.1.1', family: 4 }]);
    await expect(f.service.request(input)).rejects.toThrow('IMAGE_DESTINATION_DENIED');
    expect(f.connections).toHaveLength(0);
  });
  it('pins the validated address at the actual connection while retaining Host and TLS name', async () => {
    const f = fixture();
    const result = await f.service.request(input);
    expect(result.body.toString()).toBe('ok');
    expect(f.resolve).toHaveBeenCalledTimes(1);
    const options = f.connections[0];
    expect(options.hostname).toBe('images.example');
    expect(options.servername).toBe('images.example');
    const answer = await new Promise((resolve, reject) => options.lookup('images.example', {}, (error: any, address: any, family: any) => error ? reject(error) : resolve({ address, family })));
    expect(answer).toEqual({ address: '93.184.216.34', family: 4 });
    expect(options.headers.Authorization).toBe('Bearer secret');
  });
  it('does not follow API redirects', async () => {
    const f = fixture([{ status: 302, headers: { location: 'https://other.example/image' } }]);
    expect((await f.service.request(input)).status).toBe(302);
    expect(f.connections).toHaveLength(1);
  });
  it('revalidates each download hop and strips credentials on redirects', async () => {
    const f = fixture([{ status: 302, headers: { location: 'https://cdn.example/signed?token=private' } }, {}]);
    await f.service.request({ ...input, method: 'GET', redirects: 2 });
    expect(f.resolve).toHaveBeenCalledTimes(2);
    expect(f.connections[1].headers.Authorization).toBeUndefined();
    expect(f.connections[1].headers.Cookie).toBeUndefined();
  });
  it('denies a redirect into a private network', async () => {
    const f = fixture([{ status: 302, headers: { location: 'https://127.0.0.1/secret' } }]);
    await expect(f.service.request({ ...input, method: 'GET', redirects: 2 })).rejects.toThrow('IMAGE_DESTINATION_DENIED');
    expect(f.connections).toHaveLength(1);
  });
  it('stops after two redirects', async () => {
    const f = fixture(Array.from({ length: 3 }, () => ({ status: 302, headers: { location: 'https://cdn.example/next' } })));
    await expect(f.service.request({ ...input, method: 'GET', redirects: 2 })).rejects.toThrow('IMAGE_REDIRECT_LIMIT');
    expect(f.connections).toHaveLength(3);
  });
  it.each([{ headers: { 'content-encoding': 'gzip' }, chunks: [Buffer.from('ok')], code: 'IMAGE_ENCODING_UNSUPPORTED' },
    { headers: {}, chunks: [Buffer.alloc(60), Buffer.alloc(60)], code: 'IMAGE_BODY_TOO_LARGE' }])('bounds response streams: $code', async ({ code, ...response }) => {
    const f = fixture([{ ...response, headers: response.headers as Record<string, string> }]);
    await expect(f.service.request(input)).rejects.toThrow(code);
  });
  it('aborts stalled DNS without making a connection or leaking the signed URL', async () => {
    const f = fixture();
    f.resolve.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const pending = f.service.request({ ...input, url: 'https://cdn.example/?secret=hidden', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow('IMAGE_ABORTED');
    expect(f.connections).toHaveLength(0);
  });
  it('runs a pre-dispatch hook after destination validation and before opening the connection', async () => {
    const f = fixture();
    const order: string[] = [];
    f.resolve.mockImplementation(async () => { order.push('resolve'); return [{ address: '93.184.216.34', family: 4 }]; });
    await f.service.request({ ...input, beforeSend: async () => { expect(f.connections).toHaveLength(0); order.push('beforeSend'); } } as any);
    expect(order).toEqual(['resolve', 'beforeSend']);
    expect(f.connections).toHaveLength(1);
  });
});
