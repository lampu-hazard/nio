import type { CanvasElement, PanelVisualDocument } from './generated/panel-visual.document';
import { normalizePanelMediaUrl } from './generated/panel-media-url';
import { createCanvasFromSimple } from './editor-state';

export function mediaPayload(imageUrl: string, thumbnailUrl: string, origin = 'https://localhost') {
  return { imageUrl: normalizePanelMediaUrl(imageUrl, origin), thumbnailUrl: normalizePanelMediaUrl(thumbnailUrl, origin) };
}

export function uploadedAssetKey(url: string, guildId: string): string | null {
  try {
    const path = new URL(url).pathname.slice(1);
    return new RegExp(`^panels/${guildId}/[\\w-]+\\.(png|jpe?g|webp)$`).test(path) ? path : null;
  } catch { return null; }
}

export function switchEditorMode(document: PanelVisualDocument | null | undefined, mode: 'SIMPLE' | 'CANVAS', panel: { title: string; description?: string | null; accentText?: string | null; roles?: { id: string }[] }): PanelVisualDocument {
  if (mode === 'SIMPLE') return { ...(document ?? { version: 1 }), editorMode: mode };
  if (document?.canvas) return { ...document, editorMode: mode };
  const converted = createCanvasFromSimple(panel);
  return { ...document, ...converted, presentation: document?.presentation, native: { blocks: [], controls: (panel.roles ?? []).map(role => ({ kind: 'role', panelRoleId: role.id })) } };
}

export function moveElement(element: CanvasElement, dx: number, dy: number): Partial<CanvasElement> {
  return element.type === 'line' ? { x1: element.x1 + dx, y1: element.y1 + dy, x2: element.x2 + dx, y2: element.y2 + dy } : { x: element.x + dx, y: element.y + dy };
}

export function resizeElement(element: CanvasElement, dx: number, dy: number): Partial<CanvasElement> {
  return element.type === 'line' ? { x2: element.x2 + dx, y2: element.y2 + dy } : { width: Math.max(1, element.width + dx), height: Math.max(1, element.height + dy) };
}
