import assert from 'node:assert/strict';
import { ensurePanelFonts } from './panel-fonts';
import { layoutCanvas } from './generated/panel-visual.layout';

let loaded = 0;
const fonts = { load: async () => { loaded++; return [{}]; }, ready: Promise.resolve() };
await ensurePanelFonts(fonts);
assert.equal(loaded, 2);
const result = layoutCanvas({ width: 600, height: 400, background: '#000000', description: 'Test', elements: [] }, () => { throw new Error('No text expected'); });
assert.deepEqual(result.diagnostics, []);
await assert.rejects(ensurePanelFonts({ load: async () => [], ready: Promise.resolve() }), /font/i);
console.log('Panel font readiness checks passed');
