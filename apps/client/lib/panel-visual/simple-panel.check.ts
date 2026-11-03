import assert from 'node:assert/strict';
import { mediaPayload, switchEditorMode, moveElement, resizeElement, uploadedAssetKey } from './workspace-state';
import { resolvePresentation } from './generated/panel-visual.document';

assert.equal(resolvePresentation('MINIMAL').footer, false);
assert.equal(resolvePresentation('MINIMAL', { footer: true }).footer, true);
assert.deepEqual(mediaPayload('', '//cdn.example.com/a.png'), { imageUrl: null, thumbnailUrl: 'https://cdn.example.com/a.png' });
assert.equal(mediaPayload('cdn.example.com/a.png', '').imageUrl, 'https://cdn.example.com/a.png');
assert.equal(mediaPayload('/a.png', '', 'https://cdn.example.com').imageUrl, 'https://cdn.example.com/a.png');
assert.equal(uploadedAssetKey('https://cdn.example.com/panels/123/a.png', '123'), 'panels/123/a.png');
assert.equal(uploadedAssetKey('https://external.example.com/a.png', '123'), null);
assert.equal(uploadedAssetKey('https://cdn.example.com/panels/456/a.png', '123'), null);
const canvas = switchEditorMode(null, 'CANVAS', { title: 'Welcome', description: 'Hello', roles: [{ id: 'role-option' }] });
assert.equal(canvas.native?.controls[0].kind, 'role');
assert.deepEqual(switchEditorMode(switchEditorMode(canvas, 'SIMPLE', { title: 'Welcome' }), 'CANVAS', { title: 'Welcome' }).canvas, canvas.canvas);
assert.deepEqual(moveElement({ id: 'l', type: 'line', x1: 10, y1: 20, x2: 100, y2: 40, color: '#ffffff', strokeWidth: 2 }, 5, 8), { x1: 15, y1: 28, x2: 105, y2: 48 });
assert.deepEqual(resizeElement({ id: 'r', type: 'rectangle', x: 0, y: 0, width: 100, height: 50, fill: '#ffffff', radius: 0 }, -200, 20), { width: 1, height: 70 });
console.log('Panel workspace/media/mode/geometry checks passed.');
