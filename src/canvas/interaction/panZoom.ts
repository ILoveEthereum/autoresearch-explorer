import type { Viewport } from '../../types/canvas';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;

export function handleWheel(
  e: WheelEvent,
  viewport: Viewport,
  setViewport: (v: Partial<Viewport>) => void
) {
  e.preventDefault();

  if (e.ctrlKey || e.metaKey) {
    // Zoom
    const zoomFactor = e.deltaY > 0 ? 0.93 : 1.07;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * zoomFactor));
    setViewport({ zoom: newZoom });
  } else {
    // Pan
    const dx = e.deltaX / viewport.zoom;
    const dy = e.deltaY / viewport.zoom;
    setViewport({
      x: viewport.x + dx,
      y: viewport.y + dy,
    });
  }
}

export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  startVpX: number;
  startVpY: number;
}

export function createDragState(): DragState {
  return { isDragging: false, startX: 0, startY: 0, startVpX: 0, startVpY: 0 };
}

export function startDrag(
  e: MouseEvent,
  viewport: Viewport,
  _drag: DragState
): DragState {
  return {
    isDragging: true,
    startX: e.clientX,
    startY: e.clientY,
    startVpX: viewport.x,
    startVpY: viewport.y,
  };
}

export function updateDrag(
  e: MouseEvent,
  drag: DragState,
  zoom: number,
  setViewport: (v: Partial<Viewport>) => void
) {
  if (!drag.isDragging) return;

  const dx = (e.clientX - drag.startX) / zoom;
  const dy = (e.clientY - drag.startY) / zoom;
  setViewport({
    x: drag.startVpX - dx,
    y: drag.startVpY - dy,
  });
}

export function endDrag(drag: DragState): DragState {
  return { ...drag, isDragging: false };
}
