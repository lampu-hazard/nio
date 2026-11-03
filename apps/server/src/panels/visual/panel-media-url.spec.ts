import { describe, expect, it } from '@jest/globals';
import { normalizePanelMediaUrl } from './panel-media-url';

const origin = 'https://nio.example.com';

describe('panel media URLs', () => {
  it.each([
    ['cdn.example.com/panels/g/a.jpg', 'https://cdn.example.com/panels/g/a.jpg'],
    [' //cdn.example.com/a.png ', 'https://cdn.example.com/a.png'],
    ['/media/a.png', `${origin}/media/a.png`],
    ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/a.jpg'],
  ])('normalizes %s to an absolute HTTPS URL', (input, expected) => {
    expect(normalizePanelMediaUrl(input, origin)).toBe(expected);
  });

  it('preserves omission versus explicit clearing', () => {
    expect(normalizePanelMediaUrl(undefined, origin)).toBeUndefined();
    expect(normalizePanelMediaUrl(null, origin)).toBeNull();
    expect(normalizePanelMediaUrl('  ', origin)).toBeNull();
  });

  it.each(['javascript:alert(1)', 'data:image/png;base64,a', 'file:///a', 'http://cdn.example.com/a', 'not a URL', 'https://user:pass@cdn.example.com/a', '/\\evil.example/a', 'https://cdn.example.com/a\nb'])('rejects unsafe input %s', (input) => {
    expect(() => normalizePanelMediaUrl(input, origin)).toThrow();
  });

  it('requires a trusted HTTPS origin for relative paths', () => {
    expect(() => normalizePanelMediaUrl('/media/a.png', 'http://nio.example.com')).toThrow();
  });
});
