import { describe, expect, it, jest } from '@jest/globals';
import { PanelAssetService } from './panel-asset.service';
import { createCanvas } from '@napi-rs/canvas';

const png = () => createCanvas(10, 10).toBuffer('image/png');
function fixture(bytes = png(), contentType = 'image/png') {
  const readPanelAsset = jest.fn(async () => ({ bytes, contentType }));
  return { service: new PanelAssetService({ readPanelAsset } as any), readPanelAsset };
}
describe('panel asset safety', () => {
  it('accepts a current guild raster with matching signature and metadata', async () => {
    const result = await fixture().service.load('123', 'panels/123/a.png');
    expect(result.width).toBe(10);
    expect(result.height).toBe(10);
  });
  it.each(['panels/456/a.png', 'panels/123/../a.png', 'https://example.com/a.png', 'panels/123/a.svg'])('rejects unsafe key %s without storage I/O', async key => {
    const f = fixture();
    await expect(f.service.load('123', key)).rejects.toThrow();
    expect(f.readPanelAsset).not.toHaveBeenCalled();
  });
  it('rejects signature and header mismatch', async () => {
    await expect(fixture(png(), 'image/jpeg').service.load('123', 'panels/123/a.png')).rejects.toThrow(/type|signature/i);
  });
  it('rejects animated rasters and oversized decoded dimensions', async () => {
    const sharp = (await import('sharp')).default;
    const large = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: '#ffffff' } }).png().toBuffer();
    await expect(fixture(large).service.load('123', 'panels/123/a.png')).rejects.toThrow();
    const frames = Buffer.alloc(10 * 20 * 4);
    frames.fill(255, 0, 10 * 10 * 4);
    const animated = await sharp(frames, { raw: { width: 10, height: 20, channels: 4, pageHeight: 10 } }).webp({ loop: 0 }).toBuffer();
    expect((await sharp(animated, { animated: true }).metadata()).pages).toBe(2);
    await expect(fixture(animated, 'image/webp').service.load('123', 'panels/123/a.webp')).rejects.toThrow(/animated/);
  });

  it('rejects oversized input and SVG bytes', async () => {
    await expect(fixture(Buffer.alloc(5 * 1024 * 1024 + 1)).service.load('123', 'panels/123/a.png')).rejects.toThrow(/size|limit/i);
    await expect(fixture(Buffer.from('<svg/>')).service.load('123', 'panels/123/a.png')).rejects.toThrow();
  });
});
