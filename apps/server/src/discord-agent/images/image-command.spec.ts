import { describe, expect, it } from '@jest/globals';
import { isUnsupportedImageIntent, parseImageCommand } from './image-command';
describe('explicit image commands', () => {
  it.each(['<@123> gambar burung biru', '<@!123> BUAT GAMBAR burung biru', '  <@123> generate image   burung biru  '])('parses %s', (raw) => {
    expect(parseImageCommand(raw, '123')).toEqual({ prompt: 'burung biru' });
  });
  it.each(['gambar burung', 'tolong <@123> gambar burung', '> <@123> gambar burung', '<@999> gambar burung', '<@123> halo', '<@123> gambarkan burung', '<@123> kata gambar burung'])('does not authorize from %s', (raw) => {
    expect(parseImageCommand(raw, '123')).toBeNull();
  });
  it.each(['<@123> gambar', '<@123> buat gambar   ', `<@123> gambar ${'x'.repeat(4001)}`])('returns safe validation error for invalid explicit command', (raw) => {
    expect(() => parseImageCommand(raw, '123')).toThrow('IMAGE_PROMPT_INVALID');
  });
  it.each(['<@123> gambarkan burung biru', '<@123> tolong buat gambar kucing', 'tolong <@123> gambar burung', '<@123> generate an image of a cat'])('detects unsupported conversational image phrasing %s', (raw) => {
    expect(isUnsupportedImageIntent(raw, '123')).toBe(true);
  });
  it.each(['<@123> gambar burung biru', '<@123> halo apa kabar', '<@123> kata gambar burung'])('does not flag non-image or valid explicit command %s as unsupported image intent', (raw) => {
    expect(isUnsupportedImageIntent(raw, '123')).toBe(false);
  });
});
