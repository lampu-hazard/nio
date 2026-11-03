'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CanvasElement, CanvasScene } from '@/lib/panel-visual/generated/panel-visual.document';
import { layoutCanvas, cropSourceRect } from '@/lib/panel-visual/generated/panel-visual.layout';
import { ensurePanelFonts } from '@/lib/panel-visual/panel-fonts';
import { moveElement, resizeElement } from '@/lib/panel-visual/workspace-state';
import { snapCoordinate } from '@/lib/panel-visual/editor-state';

type Props = {
  scene: CanvasScene;
  selected?: string;
  select: (id?: string) => void;
  patch: (id: string, patch: Partial<CanvasElement>) => void;
  begin: () => void;
  commit: () => void;
  cancel: () => void;
  assetUrl: (key: string) => string | undefined;
  zoom: number;
};

function SceneImage({ element, url }: { element: Extract<CanvasElement, { type: 'image' }>; url?: string }) {
  const [size, setSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    if (!url) return;
    const image = new Image();
    image.onload = () => setSize({ width: image.naturalWidth, height: image.naturalHeight });
    image.src = url;
    return () => { image.onload = null; };
  }, [url]);
  const crop = cropSourceRect(size.width, size.height, element.crop);
  return <svg x={element.x} y={element.y} width={element.width} height={element.height} viewBox={`${crop.x} ${crop.y} ${crop.width} ${crop.height}`} preserveAspectRatio="none">
    <rect width={size.width} height={size.height} fill="#3f3f46" />
    {url && <image href={url} width={size.width} height={size.height} />}
  </svg>;
}

export function CanvasStage({ scene, selected, select, patch, begin, commit, cancel, assetUrl, zoom }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const gesture = useRef<{ element: CanvasElement; x: number; y: number; resize: boolean } | null>(null);
  const [measure, setMeasure] = useState<CanvasRenderingContext2D | null>(null);
  const [fontError, setFontError] = useState('');
  useEffect(() => {
    let active = true;
    ensurePanelFonts().then(() => { if (active) setMeasure(document.createElement('canvas').getContext('2d')); }).catch(error => { if (active) setFontError(error.message); });
    return () => { active = false; };
  }, []);
  const layout = layoutCanvas(scene, (text, style) => {
    if (!measure) return { width: text.length * style.fontSize * 0.6, supported: true };
    measure.font = `${style.weight === 'bold' ? 700 : 400} ${style.fontSize}px "Panel DejaVu Sans"`;
    return { width: measure.measureText(text).width, supported: true };
  });
  const current = scene.elements.find(element => element.id === selected);
  const box = current?.type === 'line' ? { x: Math.min(current.x1, current.x2), y: Math.min(current.y1, current.y2), width: Math.abs(current.x2 - current.x1), height: Math.abs(current.y2 - current.y1) } : current;
  function point(event: React.PointerEvent) {
    const bounds = svg.current!.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * scene.width / bounds.width, y: (event.clientY - bounds.top) * scene.height / bounds.height };
  }
  function start(event: React.PointerEvent, element: CanvasElement, resize = false) {
    if (event.button !== 0) return;
    event.stopPropagation(); event.preventDefault();
    select(element.id); begin();
    gesture.current = { element: structuredClone(element), ...point(event), resize };
    svg.current!.setPointerCapture(event.pointerId);
  }
  return <div>
    {fontError && <p role="alert" className="notice notice-error">{fontError}</p>}
    <div className="panel-canvas-scroll">
      <svg ref={svg} role="group" aria-label="Design artboard" tabIndex={0} viewBox={`0 0 ${scene.width} ${scene.height}`} width={scene.width * zoom} height={scene.height * zoom}
        style={{ background: scene.background, touchAction: 'none', flexShrink: 0 }}
        onPointerDown={() => select(undefined)}
        onPointerMove={event => {
          const drag = gesture.current; if (!drag) return;
          const next = point(event); let dx = next.x - drag.x; let dy = next.y - drag.y;
          if (!drag.resize && drag.element.type !== 'line' && !event.altKey) {
            dx = snapCoordinate(drag.element.x + dx, [0, scene.width / 2 - drag.element.width / 2, scene.width - drag.element.width], 6 / zoom) - drag.element.x;
            dy = snapCoordinate(drag.element.y + dy, [0, scene.height / 2 - drag.element.height / 2, scene.height - drag.element.height], 6 / zoom) - drag.element.y;
          }
          patch(drag.element.id, drag.resize ? resizeElement(drag.element, dx, dy) : moveElement(drag.element, dx, dy));
        }}
        onPointerUp={event => { if (!gesture.current) return; gesture.current = null; commit(); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
        onPointerCancel={() => { gesture.current = null; cancel(); }}
        onKeyDown={event => {
          if (!current || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault(); const step = event.shiftKey ? 10 : 1;
          patch(current.id, moveElement(current, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0));
        }}>
        {layout.elements.map(({ element, lines }) => <g key={element.id} onPointerDown={event => start(event, element)} style={{ cursor: 'move' }}>
          {element.type === 'rectangle' && <rect x={element.x} y={element.y} width={element.width} height={element.height} fill={element.fill} rx={element.radius} />}
          {element.type === 'line' && <line x1={element.x1} y1={element.y1} x2={element.x2} y2={element.y2} stroke={element.color} strokeWidth={element.strokeWidth} pointerEvents="stroke" />}
          {element.type === 'image' && <SceneImage element={element} url={assetUrl(element.assetKey)} />}
          {element.type === 'text' && <>
            <rect x={element.x} y={element.y} width={element.width} height={element.height} fill="transparent" />
            {(lines ?? []).map((line, index) => <text key={index} x={line.x} y={line.y} dominantBaseline="text-before-edge" fill={element.color} fontSize={element.fontSize} fontFamily="Panel DejaVu Sans" fontWeight={element.weight === 'bold' ? 700 : 400} pointerEvents="none">{line.text}</text>)}
          </>}
        </g>)}
        {box && current && <g>
          <rect x={box.x} y={box.y} width={box.width} height={box.height} fill="none" stroke="#818cf8" strokeWidth={2 / zoom} pointerEvents="none" />
          <rect aria-label="Resize selected element" x={box.x + box.width - 6 / zoom} y={box.y + box.height - 6 / zoom} width={12 / zoom} height={12 / zoom} fill="#818cf8" style={{ cursor: 'nwse-resize' }} onPointerDown={event => start(event, current, true)} />
        </g>}
      </svg>
    </div>
    <p className="panel-canvas-hint">Drag to move. Use the corner to resize, arrow keys to nudge, Shift for 10px, Alt to bypass snapping. Local text layout is approximate; server preview is authoritative.</p>
    {layout.diagnostics.length > 0 && <ul className="notice notice-error" aria-label="Layout warnings">{layout.diagnostics.map((item, index) => <li key={index}>{item.elementId}: {item.message}</li>)}</ul>}
  </div>;
}
