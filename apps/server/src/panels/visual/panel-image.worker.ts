import { parentPort, workerData } from 'node:worker_threads';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { createCanvas, GlobalFonts, loadImage } from '@napi-rs/canvas';
import type { CanvasScene } from './panel-visual.document';
import { cropSourceRect, layoutCanvas } from './panel-visual.layout';
import { inspectPanelRaster } from './panel-raster';

async function render() {
  for (const name of ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf']) {
    if (!GlobalFonts.registerFromPath(join(__dirname, 'fonts', name), 'Panel DejaVu Sans')) {
      throw new Error('Panel font registration failed.');
    }
  }
  const supported = new Set<number>(JSON.parse(readFileSync(join(__dirname, 'fonts', 'supported-codepoints.json'), 'utf8')));
  const scene = workerData.scene as CanvasScene;
  const canvas = createCanvas(scene.width, scene.height);
  const ctx = canvas.getContext('2d');
  const layout = layoutCanvas(scene, (text, style) => {
    ctx.font = `${style.weight === 'bold' ? '700' : '400'} ${style.fontSize}px "Panel DejaVu Sans"`;
    return { width: ctx.measureText(text).width, supported: [...text].every(character => character === '\n' || supported.has(character.codePointAt(0)!)) };
  });
  if (layout.diagnostics.length) throw new Error(layout.diagnostics.map(d => `${d.elementId}: ${d.message}`).join(' '));
  ctx.fillStyle = scene.background;
  ctx.fillRect(0, 0, scene.width, scene.height);
  for (const { element, lines } of layout.elements) {
    ctx.save();
    if (element.type === 'rectangle') {
      ctx.fillStyle = element.fill;
      ctx.beginPath();
      ctx.roundRect(element.x, element.y, element.width, element.height, element.radius);
      ctx.fill();
    } else if (element.type === 'line') {
      ctx.strokeStyle = element.color;
      ctx.lineWidth = element.strokeWidth;
      ctx.beginPath();
      ctx.moveTo(element.x1, element.y1);
      ctx.lineTo(element.x2, element.y2);
      ctx.stroke();
    } else if (element.type === 'text') {
      ctx.font = `${element.weight === 'bold' ? '700' : '400'} ${element.fontSize}px "Panel DejaVu Sans"`;
      ctx.fillStyle = element.color;
      ctx.textBaseline = 'top';
      for (const line of lines ?? []) ctx.fillText(line.text, line.x, line.y);
    } else {
      const raw = workerData.assets[element.assetKey];
      if (!raw) throw new Error('Panel asset missing.');
      const asset = await inspectPanelRaster(Buffer.from(raw));
      const image = await loadImage(asset.bytes);
      const crop = cropSourceRect(asset.width, asset.height, element.crop);
      ctx.drawImage(image, crop.x, crop.y, crop.width, crop.height, element.x, element.y, element.width, element.height);
    }
    ctx.restore();
  }
  const png = await canvas.encode('png');
  if (png.length > 8 * 1024 * 1024) throw new Error('Panel output exceeds 8 MiB.');
  parentPort!.postMessage({ png });
}

render().catch(() => parentPort!.postMessage({ error: 'Panel rendering failed. Check text overflow, glyphs and image assets.' }));
