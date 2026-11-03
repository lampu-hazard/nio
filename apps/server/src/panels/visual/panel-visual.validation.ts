import type { PanelVisualDocument } from './panel-visual.document';

export class PanelVisualValidationError extends Error {
  readonly code = 'PANEL_VISUAL_INVALID';
  constructor(readonly path: string, reason: string) { super(`${path}: ${reason}`); }
}

function fail(path: string, reason: string): never { throw new PanelVisualValidationError(path, reason); }
function object(value: unknown, path: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'Expected an object');
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) if (!keys.includes(key)) fail(`${path}.${key}`, 'Unknown property');
  return result;
}
function string(value: unknown, path: string, max: number, empty = false): string {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(path, `Expected text of ${empty ? 0 : 1}–${max} characters`);
  return value;
}
function number(value: unknown, path: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(path, `Expected ${integer ? 'integer' : 'number'} from ${min} to ${max}`);
  return value;
}
function choice(value: unknown, path: string, choices: readonly unknown[]) {
  if (!choices.includes(value)) fail(path, `Expected ${choices.join(', ')}`);
}
function array(value: unknown, path: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail(path, `Expected at most ${max} entries`);
  return value;
}
function color(value: unknown, path: string) {
  if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) fail(path, 'Expected a six-digit hex color');
}
function asset(value: unknown, path: string) {
  if (typeof value !== 'string' || !/^panels\/\d+\/[\w-]+\.(?:png|jpe?g|webp)$/i.test(value)) fail(path, 'Expected a panel raster asset key');
}
function crop(value: unknown, path: string) {
  const c = object(value, path, ['x', 'y', 'width', 'height']);
  const x = number(c.x, `${path}.x`, 0, 1), y = number(c.y, `${path}.y`, 0, 1);
  const w = number(c.width, `${path}.width`, Number.EPSILON, 1), h = number(c.height, `${path}.height`, Number.EPSILON, 1);
  if (x + w > 1 || y + h > 1) fail(path, 'Crop exceeds source bounds');
}
function dimensions(o: Record<string, unknown>, path: string) {
  const w = number(o.width, `${path}.width`, 320, 1600, true), h = number(o.height, `${path}.height`, 320, 1600, true);
  if (w * h > 2000000) fail(path, 'Artboard exceeds 2,000,000 pixels');
}
function unique(value: unknown, path: string, seen: Set<string>) {
  const id = string(value, path, 100);
  if (!/^[\w-]+$/.test(id) || seen.has(id)) fail(path, 'Expected a unique stable ID');
  seen.add(id);
}

export function validatePanelVisualDocument(value: unknown): PanelVisualDocument {
  let serialized: string;
  try { serialized = JSON.stringify(value); } catch { return fail('document', 'Must be serializable JSON'); }
  if (!serialized || Buffer.byteLength(serialized, 'utf8') > 256 * 1024) fail('document', 'Document size exceeds 256 KiB');
  const d = object(value, 'document', ['version', 'editorMode', 'presentation', 'simpleCrop', 'canvas', 'native']);
  choice(d.version, 'version', [1]); choice(d.editorMode, 'editorMode', ['SIMPLE', 'CANVAS']);
  if (d.presentation !== undefined) {
    const p = object(d.presentation, 'presentation', ['author', 'thumbnail', 'footer', 'timestamp']);
    for (const [key, entry] of Object.entries(p)) if (typeof entry !== 'boolean') fail(`presentation.${key}`, 'Expected boolean');
  }
  if (d.simpleCrop !== undefined) {
    const c = object(d.simpleCrop, 'simpleCrop', ['assetKey', 'crop', 'width', 'height', 'description']);
    asset(c.assetKey, 'simpleCrop.assetKey'); crop(c.crop, 'simpleCrop.crop'); dimensions(c, 'simpleCrop'); string(c.description, 'simpleCrop.description', 1024);
  }
  if (d.editorMode === 'CANVAS' && !d.canvas) fail('canvas', 'Canvas mode requires a scene');
  if (d.canvas !== undefined) {
    const c = object(d.canvas, 'canvas', ['width', 'height', 'background', 'description', 'elements']);
    dimensions(c, 'canvas'); color(c.background, 'canvas.background'); string(c.description, 'canvas.description', 1024);
    const ids = new Set<string>(); let images = 0, textCharacters = 0;
    for (const [index, entry] of array(c.elements, 'canvas.elements', 50).entries()) {
      const path = `canvas.elements[${index}]`;
      const base = object(entry, path, ['id', 'type', 'x', 'y', 'width', 'height', 'text', 'font', 'fontSize', 'weight', 'color', 'align', 'lineHeight', 'assetKey', 'crop', 'fill', 'radius', 'x1', 'y1', 'x2', 'y2', 'strokeWidth']);
      unique(base.id, `${path}.id`, ids); choice(base.type, `${path}.type`, ['text', 'image', 'rectangle', 'line']);
      const box = ['id', 'type', 'x', 'y', 'width', 'height'];
      const fields = base.type === 'text' ? [...box, 'text', 'font', 'fontSize', 'weight', 'color', 'align', 'lineHeight']
        : base.type === 'image' ? [...box, 'assetKey', 'crop'] : base.type === 'rectangle' ? [...box, 'fill', 'radius']
          : ['id', 'type', 'x1', 'y1', 'x2', 'y2', 'color', 'strokeWidth'];
      object(entry, path, fields);
      if (base.type !== 'line') {
        number(base.x, `${path}.x`, -1600, 3200); number(base.y, `${path}.y`, -1600, 3200);
        number(base.width, `${path}.width`, 1, 3200); number(base.height, `${path}.height`, 1, 3200);
      }
      if (base.type === 'text') {
        textCharacters += string(base.text, `${path}.text`, 5000, true).length;
        choice(base.font, `${path}.font`, ['dejavu-sans']); choice(base.weight, `${path}.weight`, ['regular', 'bold']);
        choice(base.align, `${path}.align`, ['left', 'center', 'right']); color(base.color, `${path}.color`);
        number(base.fontSize, `${path}.fontSize`, 8, 256); number(base.lineHeight, `${path}.lineHeight`, 0.8, 3);
      } else if (base.type === 'image') {
        images++; asset(base.assetKey, `${path}.assetKey`); if (base.crop !== undefined) crop(base.crop, `${path}.crop`);
      } else if (base.type === 'rectangle') {
        color(base.fill, `${path}.fill`); number(base.radius, `${path}.radius`, 0, Math.min(base.width as number, base.height as number) / 2);
      } else {
        for (const key of ['x1', 'y1', 'x2', 'y2']) number(base[key], `${path}.${key}`, -1600, 3200);
        color(base.color, `${path}.color`); number(base.strokeWidth, `${path}.strokeWidth`, 1, 100);
      }
    }
    if (images > 10) fail('canvas.elements', 'Maximum 10 images');
    if (textCharacters > 5000) fail('canvas.elements', 'Maximum 5000 text characters');
  }
  if (d.native !== undefined) {
    const n = object(d.native, 'native', ['blocks', 'controls']);
    const ids = new Set<string>(); let length = 0;
    for (const [i, entry] of array(n.blocks, 'native.blocks', 50).entries()) {
      const path = `native.blocks[${i}]`, b = object(entry, path, ['id', 'text']);
      unique(b.id, `${path}.id`, ids); length += string(b.text, `${path}.text`, 4096, true).length;
    }
    const blocks = n.blocks as unknown[];
    if (length + Math.max(0, blocks.length - 1) * 2 > 4096) fail('native.blocks', 'Combined description exceeds 4096 characters');
    for (const [i, entry] of array(n.controls, 'native.controls', 25).entries()) {
      const path = `native.controls[${i}]`, c = object(entry, path, ['kind', 'panelRoleId', 'id', 'label', 'url']);
      choice(c.kind, `${path}.kind`, ['role', 'link']);
      if (c.kind === 'role') {
        object(entry, path, ['kind', 'panelRoleId']); unique(c.panelRoleId, `${path}.panelRoleId`, ids);
      } else {
        object(entry, path, ['kind', 'id', 'label', 'url']); unique(c.id, `${path}.id`, ids); string(c.label, `${path}.label`, 80);
        const input = string(c.url, `${path}.url`, 512);
        let url: URL; try { url = new URL(input); } catch { return fail(`${path}.url`, 'Expected HTTPS link'); }
        if (url.protocol !== 'https:' || url.username || url.password || /[\u0000- \\]/.test(input)) fail(`${path}.url`, 'Expected HTTPS link without credentials');
      }
    }
  }
  return JSON.parse(serialized) as PanelVisualDocument;
}
