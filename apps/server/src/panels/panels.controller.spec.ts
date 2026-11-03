import { describe, expect, it, jest } from '@jest/globals';
import { PanelsController } from './panels.controller';

describe('panel uploaded visual assets', () => {
  it('returns only current-guild persisted image keys with configured public URLs', async () => {
    const get = jest.fn(async (..._args: any[]) => ({ visualDocument: { canvas: { elements: [{ type: 'image', assetKey: 'panels/123/one.png' }, { type: 'image', assetKey: 'panels/456/other.png' }, { type: 'image', assetKey: 'panels/123/one.png' }] } } }));
    const controller = new PanelsController({ get } as any, {} as any, { getPublicUrl: (key: string) => `https://cdn.example.com/${key}` } as any);
    expect(await controller.visualAssets('123', 'p')).toEqual({ ok: true, assets: [{ key: 'panels/123/one.png', url: 'https://cdn.example.com/panels/123/one.png' }] });
    expect(get).toHaveBeenCalledWith('123', 'p');
  });
  it('uses MIME-based canonical file extensions for uploaded keys', async () => {
    const upload = jest.fn(async (..._args: any[]) => 'signed');
    const controller = new PanelsController({} as any, {} as any, { getPresignedUploadUrl: upload, getPublicUrl: (key: string) => `https://cdn.example.com/${key}` } as any);
    const result = await controller.uploadUrl('123', { fileName: 'IMAGE.JPEG', contentType: 'image/jpeg' });
    expect(result.key).toMatch(/^panels\/123\/[\w-]+\.jpg$/);
  });
});
