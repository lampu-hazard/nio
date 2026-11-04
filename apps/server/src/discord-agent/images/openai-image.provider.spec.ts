import { beforeAll, describe, expect, it } from '@jest/globals';
import sharp from 'sharp';
import { OpenAiImageProvider } from './openai-image.provider';

let png: Buffer;
beforeAll(async () => { png = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#334455' } }).png().toBuffer(); });
const config = { baseUrl: 'https://provider.example/v1', model: 'configured-image-model', apiKey: 'private-api-key', prompt: 'a blue bird', signal: new AbortController().signal, maxImageBytes: 8388608 };
function fixture(data: any, download = png) {
  const calls: any[] = [];
  const http: any = { request: async (input: any) => {
    calls.push(input);
    return input.method === 'POST' ? { status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ data })) }
      : { status: 200, headers: { 'content-type': 'image/png' }, body: download };
  } };
  return { calls, provider: new OpenAiImageProvider(http), http };
}
describe('OpenAI-compatible image adapter', () => {
  it('sends the exact single-image endpoint contract and decodes a real PNG', async () => {
    const f = fixture([{ b64_json: png.toString('base64') }]);
    const result = await f.provider.generate(config);
    expect(result.extension).toBe('png');
    expect(result.buffer).toEqual(png);
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]).toMatchObject({ url: 'https://provider.example/v1/images/generations', method: 'POST', redirects: 0, maxBytes: 12582912, headers: { Authorization: 'Bearer private-api-key' } });
    expect(JSON.parse(f.calls[0].body.toString())).toEqual({ model: config.model, prompt: config.prompt, n: 1, size: '1024x1024' });
  });
  it('downloads a signed image without provider credentials and allows two validated redirects', async () => {
    const f = fixture([{ url: 'https://cdn.example/result.png?signature=private' }]);
    expect((await f.provider.generate(config)).buffer).toEqual(png);
    expect(f.calls[1]).toMatchObject({ method: 'GET', redirects: 2, maxBytes: 8388608 });
    expect(f.calls[1].headers?.Authorization).toBeUndefined();
    expect(f.calls[1].headers?.Cookie).toBeUndefined();
  });
  it.each([[], [{}, {}], [{}], [{ b64_json: '!!!' }], [{ b64_json: 'aGVsbG8' }], [{ b64_json: 'aGVsbG8=', url: 'https://cdn.example/x' }]].map((data) => ({ data })))('rejects ambiguous or invalid image data $data', async ({ data }) => {
    const f = fixture(data);
    await expect(f.provider.generate(config)).rejects.toMatchObject({ code: 'IMAGE_RESPONSE_INVALID', dispatched: true });
    expect(f.calls).toHaveLength(1);
  });
  it('rejects valid base64 containing HTML rather than a raster', async () => {
    const f = fixture([{ b64_json: Buffer.from('<html>not an image</html>').toString('base64') }]);
    await expect(f.provider.generate(config)).rejects.toMatchObject({ code: 'IMAGE_RASTER_INVALID', dispatched: true });
  });
  it('rejects wrong dimensions', async () => {
    const small = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'red' } }).png().toBuffer();
    await expect(fixture([{ b64_json: small.toString('base64') }]).provider.generate(config)).rejects.toMatchObject({ code: 'IMAGE_RASTER_INVALID' });
  });
  it('honors lower Discord attachment limits without a second generation', async () => {
    const f = fixture([{ b64_json: png.toString('base64') }]);
    await expect(f.provider.generate({ ...config, maxImageBytes: 100 })).rejects.toMatchObject({ code: 'IMAGE_BODY_TOO_LARGE', dispatched: true });
    expect(f.calls).toHaveLength(1);
  });
  it.each(['https://provider.example/v1?secret=x', 'http://provider.example', 'https://user:secret@provider.example/v1', 'https://provider.example/v1#x'])('denies invalid API base %s before dispatch', async (baseUrl) => {
    const f = fixture([]);
    await expect(f.provider.generate({ ...config, baseUrl })).rejects.toMatchObject({ dispatched: false });
    expect(f.calls).toHaveLength(0);
  });
  it('reports a definitive rejection without raw response, URL, or key', async () => {
    const f = fixture([]);
    f.http.request = async () => ({ status: 401, headers: {}, body: Buffer.from('private-api-key secret signed-url') });
    await expect(f.provider.generate(config)).rejects.toMatchObject({ code: 'IMAGE_HTTP_401', dispatched: true, definiteRejection: true });
  });
  it('does not classify 503 as a refundable rejection or retry it', async () => {
    const f = fixture([]);
    let requests = 0;
    f.http.request = async () => { requests++; return { status: 503, headers: {}, body: Buffer.from('secret') }; };
    await expect(f.provider.generate(config)).rejects.toMatchObject({ code: 'IMAGE_HTTP_503', definiteRejection: false });
    expect(requests).toBe(1);
  });
  it('accepts valid 1024x1024 JPEG and WebP rasters and maps their extensions', async () => {
    const jpeg = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#112233' } }).jpeg().toBuffer();
    const webp = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#223344' } }).webp().toBuffer();
    expect((await fixture([{ b64_json: jpeg.toString('base64') }]).provider.generate(config)).extension).toBe('jpg');
    expect((await fixture([{ b64_json: webp.toString('base64') }]).provider.generate(config)).extension).toBe('webp');
  });
  it('rejects animated GIF/WebP, >16MP images, truncated PNGs, and mismatched download Content-Type', async () => {
    const gif = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } } }).gif().toBuffer();
    await expect(fixture([{ b64_json: gif.toString('base64') }]).provider.generate(config)).rejects.toMatchObject({ code: 'IMAGE_RASTER_INVALID' });
    const truncated = png.subarray(0, Math.floor(png.length / 2));
    await expect(fixture([{ b64_json: truncated.toString('base64') }]).provider.generate(config)).rejects.toMatchObject({ code: 'IMAGE_RASTER_INVALID' });
    const mismatch = fixture([{ url: 'https://cdn.example/result.png' }], png);
    mismatch.http.request = async (input: any) => input.method === 'POST'
      ? { status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify({ data: [{ url: 'https://cdn.example/result.png' }] })) }
      : { status: 200, headers: { 'content-type': 'image/jpeg' }, body: png };
    await expect(mismatch.provider.generate(config)).rejects.toMatchObject({ code: 'IMAGE_RASTER_INVALID', dispatched: true });
  });
  it('propagates cancellation during DNS/API as a safe uncertain error', async () => {
    const f = fixture([]);
    f.http.request = async (input: any) => new Promise((_resolve, reject) => input.signal.addEventListener('abort', () => reject(new Error('signed-url secret')), { once: true }));
    const controller = new AbortController();
    const pending = f.provider.generate({ ...config, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: 'IMAGE_PROVIDER_ERROR', dispatched: true });
  });
});
