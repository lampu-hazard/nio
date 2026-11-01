import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { loadImage } from '@napi-rs/canvas';
import { renderVoiceLevelCard } from './voice-level-card';

const input = { name: 'Othinus', previousLevel: 1, level: 2, xp: 400n, avatarUrl: null };

describe('voice level card', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  it('renders a real PNG with graphite background and purple accent', async () => {
    const png = await renderVoiceLevelCard(input);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const image = await loadImage(png);
    expect([image.width, image.height]).toEqual([900, 320]);
    const { createCanvas } = await import('@napi-rs/canvas');
    const canvas = createCanvas(900, 320);
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    expect([...context.getImageData(20, 20, 1, 1).data]).toEqual([20, 23, 25, 255]);
    expect([...context.getImageData(2, 160, 1, 1).data]).toEqual([81, 69, 238, 255]);
  });

  it('uses actual name, previous level and committed XP rather than a fixed image', async () => {
    const original = await renderVoiceLevelCard(input);
    for (const change of [{ name: 'Other Member' }, { previousLevel: 0 }, { level: 3 }, { xp: 450n }]) {
      expect((await renderVoiceLevelCard({ ...input, ...change })).equals(original)).toBe(false);
    }
  });

  it('renders long Unicode names and large XP without failing', async () => {
    const image = await loadImage(await renderVoiceLevelCard({ ...input, name: '名前 <@everyone> '.repeat(100), xp: 1000000000000000000n, level: 100000000 }));
    expect(image.width).toBe(900);
  });

  it('never fetches arbitrary avatar hosts or redirects', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch');
    for (const avatarUrl of ['http://127.0.0.1/avatar.png', 'https://example.com/a.png', 'https://cdn.discordapp.com.evil.test/a.png', 'https://cdn.discordapp.com/not-an-avatar']) {
      await renderVoiceLevelCard({ ...input, avatarUrl });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uses a placeholder if the Discord avatar download fails', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const image = await loadImage(await renderVoiceLevelCard({ ...input, avatarUrl: 'https://cdn.discordapp.com/avatars/123/hash.png?size=128' }));
    expect(image.width).toBe(900);
  });

  it('draws an avatar from a bounded Discord CDN response', async () => {
    const { createCanvas } = await import('@napi-rs/canvas');
    const avatar = createCanvas(128, 128);
    const context = avatar.getContext('2d');
    context.fillStyle = '#ff0000'; context.fillRect(0, 0, 128, 128);
    const png = await avatar.encode('png');
    const fetch = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } }));
    const card = await loadImage(await renderVoiceLevelCard({ ...input, avatarUrl: 'https://cdn.discordapp.com/avatars/123/hash.png?size=128' }));
    const canvas = createCanvas(900, 320); const cardContext = canvas.getContext('2d'); cardContext.drawImage(card, 0, 0);
    expect([...cardContext.getImageData(96, 96, 1, 1).data]).toEqual([255, 0, 0, 255]);
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error' });
  });

  it('cancels oversized streamed avatar bodies and keeps the card usable', async () => {
    const cancel = jest.fn<any>();
    const body = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(300000)); }, cancel });
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(body, { headers: { 'content-type': 'image/png' } }));
    await renderVoiceLevelCard({ ...input, avatarUrl: 'https://cdn.discordapp.com/avatars/123/hash.png?size=128' });
    expect(cancel).toHaveBeenCalled();
  });
});
