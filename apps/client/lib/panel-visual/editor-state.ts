import type { CanvasElement, CanvasScene, PanelVisualDocument } from './generated/panel-visual.document';

export type EditorHistory = { past: CanvasScene[]; present: CanvasScene; future: CanvasScene[]; transaction?: CanvasScene };
export type EditorAction =
  | { type: 'begin' | 'commit' | 'cancel' | 'undo' | 'redo' }
  | { type: 'patch'; id: string; patch: Partial<CanvasElement> }
  | { type: 'insert'; element: CanvasElement }
  | { type: 'duplicate'; id: string; newId: string }
  | { type: 'delete'; id: string }
  | { type: 'reorder'; ids: string[] }
  | { type: 'resize-artboard'; width: number; height: number }
  | { type: 'scene'; patch: Partial<Omit<CanvasScene, 'elements'>> };

export function createEditorHistory(scene: CanvasScene): EditorHistory {
  return { past: [], present: structuredClone(scene), future: [] };
}

export function editorReducer(state: EditorHistory, action: EditorAction): EditorHistory {
  if (action.type === 'begin') return state.transaction ? state : { ...state, transaction: state.present };
  if (action.type === 'cancel') return state.transaction ? { ...state, present: state.transaction, transaction: undefined } : state;
  if (action.type === 'commit') {
    if (!state.transaction) return state;
    if (JSON.stringify(state.transaction) === JSON.stringify(state.present)) return { ...state, transaction: undefined };
    return { past: [...state.past, state.transaction].slice(-50), present: state.present, future: [] };
  }
  if (action.type === 'undo') {
    if (state.transaction) state = editorReducer(state, { type: 'cancel' });
    const previous = state.past.at(-1);
    return previous ? { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] } : state;
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    return next ? { past: [...state.past, state.present].slice(-50), present: next, future: state.future.slice(1) } : state;
  }
  let present = state.present;
  switch (action.type) {
    case 'patch':
      present = { ...present, elements: present.elements.map(e => e.id === action.id ? { ...e, ...action.patch, id: e.id, type: e.type } as CanvasElement : e) };
      break;
    case 'insert':
      if (present.elements.some(e => e.id === action.element.id)) return state;
      present = { ...present, elements: [...present.elements, structuredClone(action.element)] };
      break;
    case 'duplicate': {
      const original = present.elements.find(e => e.id === action.id);
      if (!original || present.elements.some(e => e.id === action.newId)) return state;
      const copy = structuredClone(original);
      copy.id = action.newId;
      if (copy.type === 'line') { copy.x1 += 16; copy.x2 += 16; copy.y1 += 16; copy.y2 += 16; }
      else { copy.x += 16; copy.y += 16; }
      present = { ...present, elements: [...present.elements, copy] };
      break;
    }
    case 'delete': present = { ...present, elements: present.elements.filter(e => e.id !== action.id) }; break;
    case 'reorder': {
      if (new Set(action.ids).size !== present.elements.length || action.ids.length !== present.elements.length) return state;
      const byId = new Map(present.elements.map(e => [e.id, e]));
      if (action.ids.some(id => !byId.has(id))) return state;
      present = { ...present, elements: action.ids.map(id => byId.get(id)!) };
      break;
    }
    case 'resize-artboard': present = { ...present, width: action.width, height: action.height }; break;
    case 'scene': present = { ...present, ...action.patch }; break;
  }
  if (JSON.stringify(present) === JSON.stringify(state.present)) return state;
  return state.transaction ? { ...state, present } : { past: [...state.past, state.present].slice(-50), present, future: [] };
}

export function toScenePoint(point: { x: number; y: number }, bounds: { left: number; top: number }, scale: number) {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('Canvas scale must be positive.');
  return { x: (point.x - bounds.left) / scale, y: (point.y - bounds.top) / scale };
}

export function snapCoordinate(value: number, guides: number[], threshold: number) {
  const nearest = guides.filter(guide => Math.abs(value - guide) <= threshold)
    .sort((a, b) => Math.abs(value - a) - Math.abs(value - b) || a - b)[0];
  return nearest ?? value;
}

export function createCanvasFromSimple(panel: { title: string; description?: string | null; accentText?: string | null; imageUrl?: string | null }): PanelVisualDocument {
  const elements: CanvasElement[] = [];
  if (panel.accentText) elements.push({ id: 'starter-accent', type: 'text', x: 60, y: 50, width: 1080, height: 50, text: panel.accentText, font: 'dejavu-sans', fontSize: 24, weight: 'regular', color: '#a1a1aa', align: 'left', lineHeight: 1.3 });
  if (panel.description) elements.push({ id: 'starter-description', type: 'text', x: 60, y: 130, width: 1080, height: 400, text: panel.description, font: 'dejavu-sans', fontSize: 28, weight: 'regular', color: '#ffffff', align: 'left', lineHeight: 1.4 });
  return { version: 1, editorMode: 'CANVAS', canvas: { width: 1200, height: 600, background: '#18181b', description: panel.title || 'Panel banner', elements }, native: { blocks: [], controls: [] } };
}
