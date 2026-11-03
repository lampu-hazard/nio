import { describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { R2Service } from './r2.service';

function service(url: string) {
  return new R2Service(new ConfigService({ R2_PUBLIC_URL: url, R2_BUCKET_NAME: 'test', R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test' }));
}
describe('R2 panel assets', () => {
  it.each(['cdn.example.com', 'http://cdn.example.com', 'https://user:pass@cdn.example.com', 'https://cdn.example.com/?token=x'])('rejects invalid public URL %s', url => {
    expect(() => service(url)).toThrow();
  });
  it('uses an absolute HTTPS public URL without doubled slashes', () => {
    expect(service('https://cdn.example.com/').getPublicUrl('panels/123/a.png')).toBe('https://cdn.example.com/panels/123/a.png');
  });
  it('rejects foreign assets before SDK calls and bounds streamed bytes', async () => {
    const r2 = service('https://cdn.example.com');
    const destroy = jest.fn();
    const send = jest.fn<any>().mockResolvedValue({ ContentType: 'image/png', Body: { async *[Symbol.asyncIterator]() { yield Buffer.alloc(5 * 1024 * 1024); yield Buffer.alloc(1); }, destroy } });
    (r2 as any).client = { send };
    await expect(r2.readPanelAsset('123', 'panels/456/a.png')).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
    await expect(r2.readPanelAsset('123', 'panels/123/a.png')).rejects.toThrow(/size limit/);
    expect(destroy).toHaveBeenCalled();
  });
});
