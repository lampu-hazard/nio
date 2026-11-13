import { describe, expect, it } from '@jest/globals';
import * as research from './agent-web-research';

describe('explicit web research', () => {
  it.each(['cari di web cuaca', 'CARI BERITA hari ini', 'cek sumber klaim ini', 'search the web for updates', 'find sources for this', 'baca https://example.com', 'open https://example.com'])('allows explicit request %s', (prompt) => {
    expect(research.isExplicitWebRequest(prompt)).toBe(true);
  });
  it.each(['berita terbaru', 'https://example.com', '> cari di web sesuatu', '```\ncari di web sesuatu\n```', '~~~txt\nsearch the web\n~~~', 'jangan cari di web', 'do not search the web', 'baca\nhttps://example.com'])('does not enable research for %s', (prompt) => {
    expect(research.isExplicitWebRequest(prompt)).toBe(false);
  });
  it('does not treat a code line beginning with a fence prefix as its closing delimiter', () => {
    expect(research.isExplicitWebRequest('```txt\n```not-a-close\nsearch the web\n```')).toBe(false);
  });
  it.each(['cari di internet sesuatu', 'telusuri web', 'search online', 'look up online', 'buka https://example.com', 'fetch https://example.com', 'check https://example.com'])('recognizes supported phrase %s', (prompt) => {
    expect(research.isExplicitWebRequest(prompt)).toBe(true);
  });
  it.each(['research online', 'prefetch https://example.com', `baca ${'a'.repeat(121)}https://example.com`, 'tanpa cari di internet', 'without search online'])('rejects indirect or negated wording %s', (prompt) => {
    expect(research.isExplicitWebRequest(prompt)).toBe(false);
  });
  it('permits AUTO but requires explicit intent for ON_REQUEST', () => {
    expect(research.canResearchWeb('AUTO', 'halo')).toBe(true);
    expect(research.canResearchWeb('ON_REQUEST', 'halo')).toBe(false);
  });
});
