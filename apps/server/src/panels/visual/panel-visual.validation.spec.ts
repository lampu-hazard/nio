import { describe, expect, it } from '@jest/globals';
import { validatePanelVisualDocument } from './panel-visual.validation';
import { resolvePresentation } from './panel-visual.document';

const rectangle = (id = 'rect') => ({ id, type: 'rectangle', x: 0, y: 0, width: 100, height: 100, fill: '#5145ee', radius: 4 });
const image = (id = 'image') => ({ id, type: 'image', x: 0, y: 0, width: 100, height: 100, assetKey: 'panels/123/a.png', crop: { x: 0, y: 0, width: 1, height: 1 } });
const text = (value = 'Hello') => ({ id: 'text', type: 'text', x: 20, y: 20, width: 300, height: 100, text: value, font: 'dejavu-sans', fontSize: 24, weight: 'regular', color: '#ffffff', align: 'left', lineHeight: 1.2 });
const document = () => ({ version: 1, editorMode: 'CANVAS', canvas: { width: 1200, height: 600, background: '#141719', description: 'Server role guide', elements: [rectangle(), image(), text(), { id: 'line', type: 'line', x1: 10, y1: 10, x2: 100, y2: 10, color: '#ffffff', strokeWidth: 2 }] }, native: { blocks: [{ id: 'intro', text: 'Choose <@&123>' }], controls: [{ kind: 'role', panelRoleId: 'role-a' }, { kind: 'link', id: 'site', label: 'Website', url: 'https://example.com' }] } });

describe('panel visual document', () => {
  it('round-trips all supported element and native control types', () => {
    expect(validatePanelVisualDocument(document())).toEqual(document());
  });

  it('accepts a simple document without a canvas and explicit empty native regions', () => {
    const value = { version: 1, editorMode: 'SIMPLE', presentation: { author: false }, native: { blocks: [], controls: [] } };
    expect(validatePanelVisualDocument(value)).toEqual(value);
  });

  it.each([
    ['version', (d: any) => { d.version = 2; }],
    ['unknown root key', (d: any) => { d.script = 'eval()'; }],
    ['unknown scene key', (d: any) => { d.canvas.html = '<b>test</b>'; }],
    ['missing scene', (d: any) => { delete d.canvas; }],
    ['duplicate IDs', (d: any) => { d.canvas.elements.push(rectangle()); }],
    ['NaN coordinate', (d: any) => { d.canvas.elements[0].x = NaN; }],
    ['unknown type', (d: any) => { d.canvas.elements[0].type = 'html'; }],
    ['unknown element key', (d: any) => { d.canvas.elements[0].onclick = 'run'; }],
    ['invalid color', (d: any) => { d.canvas.background = 'url(remote)'; }],
    ['invalid font', (d: any) => { d.canvas.elements[2].font = 'remote'; }],
    ['small artboard', (d: any) => { d.canvas.width = 319; }],
    ['large axis', (d: any) => { d.canvas.height = 1601; }],
    ['pixel budget', (d: any) => { d.canvas.width = d.canvas.height = 1600; }],
    ['51 elements', (d: any) => { d.canvas.elements = Array.from({ length: 51 }, (_, i) => rectangle(`r${i}`)); }],
    ['11 images', (d: any) => { d.canvas.elements = Array.from({ length: 11 }, (_, i) => image(`i${i}`)); }],
    ['5001 text characters', (d: any) => { d.canvas.elements = [text('a'.repeat(5001))]; }],
    ['empty description', (d: any) => { d.canvas.description = ''; }],
    ['zero crop', (d: any) => { d.canvas.elements[1].crop.width = 0; }],
    ['outside crop', (d: any) => { d.canvas.elements[1].crop.x = 0.5; }],
    ['traversal asset', (d: any) => { d.canvas.elements[1].assetKey = 'panels/123/../secret.png'; }],
    ['URL asset', (d: any) => { d.canvas.elements[1].assetKey = 'https://example.com/a.png'; }],
    ['long native text', (d: any) => { d.native.blocks[0].text = 'a'.repeat(4097); }],
    ['too many controls', (d: any) => { d.native.controls = Array.from({ length: 26 }, (_, i) => ({ kind: 'role', panelRoleId: `r${i}` })); }],
    ['duplicate native ID', (d: any) => { d.native.blocks.push({ id: 'intro', text: 'Other' }); }],
    ['duplicate role reference', (d: any) => { d.native.controls.push({ kind: 'role', panelRoleId: 'role-a' }); }],
    ['unsafe link', (d: any) => { d.native.controls[1].url = 'javascript:alert(1)'; }],
    ['link credentials', (d: any) => { d.native.controls[1].url = 'https://user@example.com'; }],
    ['unknown visibility', (d: any) => { d.presentation = { width: 1200 }; }],
    ['nonboolean visibility', (d: any) => { d.presentation = { author: 'yes' }; }],
  ])('rejects %s', (_name, mutate) => {
    const value = document(); mutate(value);
    expect(() => validatePanelVisualDocument(value)).toThrow();
  });

  it('accepts exact element, image, text and dimension boundaries', () => {
    const value = document();
    value.canvas.width = 1600; value.canvas.height = 1250;
    value.canvas.elements = [text('a'.repeat(5000)), ...Array.from({ length: 10 }, (_, i) => image(`i${i}`)), ...Array.from({ length: 39 }, (_, i) => rectangle(`r${i}`))] as any;
    expect(validatePanelVisualDocument(value)).toEqual(value);
  });

  it('rejects oversized UTF-8 documents before parsing their elements', () => {
    const value = { ...document(), oversized: 'é'.repeat(140000) };
    expect(() => validatePanelVisualDocument(value)).toThrow(/size/i);
  });

  it('reports an actionable validation path', () => {
    const value = document(); value.canvas.width = 0;
    expect(() => validatePanelVisualDocument(value)).toThrow(/canvas.width/);
  });

  it('resolves legacy style defaults and explicit overrides', () => {
    expect(resolvePresentation('MINIMAL')).toEqual({ author: false, thumbnail: false, footer: false, timestamp: false });
    expect(resolvePresentation('PREMIUM')).toEqual({ author: true, thumbnail: true, footer: true, timestamp: true });
    expect(resolvePresentation('MINIMAL', { author: true, footer: true })).toEqual({ author: true, thumbnail: false, footer: true, timestamp: false });
  });
});
