import { describe, expect, it } from '@jest/globals';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { cropSourceRect, layoutCanvas, type TextMeasurer } from './panel-visual.layout';
import type { CanvasScene } from './panel-visual.document';

const measure: TextMeasurer = (text, style) => ({ width: [...text].length * style.fontSize / 2, supported: !text.includes('🧪') });
const scene: CanvasScene = { width: 600, height: 400, background: '#141719', description: 'Test', elements: [] };
const text = { id: 'text', type: 'text' as const, x: 0, y: 0, width: 40, height: 100, text: 'Halo dunia\n日本語', font: 'dejavu-sans' as const, fontSize: 20, weight: 'regular' as const, color: '#ffffff', align: 'left' as const, lineHeight: 1 };

describe('canvas layout', () => {
  it('bundles regular and bold fonts beside source and compiled modules', () => {
    for (const name of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'LICENSE']) {
      expect(existsSync(join(__dirname, 'fonts', name))).toBe(true);
      expect(existsSync(join(process.cwd(), 'dist/panels/visual/fonts', name))).toBe(true);
    }
  });
  it('retains layer order and wraps Unicode text with explicit newlines', () => {
    const result = layoutCanvas({ ...scene, elements: [{ id: 'box', type: 'rectangle', x: 0, y: 0, width: 100, height: 100, fill: '#ffffff', radius: 0 }, text] }, measure);
    expect(result.elements.map(e => e.element.id)).toEqual(['box', 'text']);
    expect(result.elements[1].lines?.map(line => line.text)).toEqual(['Halo', 'duni', 'a', '日本語']);
    expect(result.diagnostics).toEqual([]);
  });

  it('reports exact text overflow without truncating content', () => {
    const result = layoutCanvas({ ...scene, elements: [{ ...text, height: 20, text: 'abcdef' }] }, measure);
    expect(result.elements[0].lines?.map(line => line.text).join('')).toBe('abcdef');
    expect(result.diagnostics).toContainEqual({ elementId: 'text', code: 'TEXT_OVERFLOW', message: 'Text needs 40px height; box has 20px.' });
  });

  it('reports out-of-artboard geometry and unsupported glyphs', () => {
    const result = layoutCanvas({ ...scene, elements: [{ ...text, x: 590, text: '🧪' }] }, measure);
    expect(result.diagnostics.map(d => d.code)).toEqual(['OUTSIDE_ARTBOARD', 'UNSUPPORTED_GLYPH']);
  });

  it('keeps blank lines and trailing newlines', () => {
    const result = layoutCanvas({ ...scene, elements: [{ ...text, text: 'a\n\nb\n' }] }, measure);
    expect(result.elements[0].lines?.map(line => line.text)).toEqual(['a', '', 'b', '']);
  });

  it('maps normalized crops into source image pixels', () => {
    expect(cropSourceRect(1000, 500, { x: 0.1, y: 0.2, width: 0.5, height: 0.6 })).toEqual({ x: 100, y: 100, width: 500, height: 300 });
    expect(cropSourceRect(1000, 500)).toEqual({ x: 0, y: 0, width: 1000, height: 500 });
  });
});
