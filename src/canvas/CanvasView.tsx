import { useRef, useEffect, useCallback, useState } from 'react';
import { useCanvasStore } from '../stores/canvasStore';
import { useUiStore } from '../stores/uiStore';
import { render } from './CanvasRenderer';
import { handleWheel, createDragState, startDrag, updateDrag, endDrag } from './interaction/panZoom';
import { screenToWorld, hitTestNode } from './interaction/hitTest';
import { ContextMenu } from './interaction/ContextMenu';

export function CanvasView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef(createDragState());
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; nodeId: string;
  } | null>(null);

  const nodes = useCanvasStore((s) => s.nodes);
  const edges = useCanvasStore((s) => s.edges);
  const viewport = useCanvasStore((s) => s.viewport);
  const focusNodeId = useCanvasStore((s) => s.focusNodeId);
  const setViewport = useCanvasStore((s) => s.setViewport);

  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);

  // Resize canvas to fill container
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    resizeCanvas();

    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);

    render(ctx, w, h, nodes, edges, viewport, focusNodeId, selectedNodeId);
  }, [nodes, edges, viewport, focusNodeId, selectedNodeId, resizeCanvas]);

  // Window resize
  useEffect(() => {
    const onResize = () => {
      resizeCanvas();
      setViewport({});
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeCanvas, setViewport]);

  // Wheel handler
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e: WheelEvent) => {
      handleWheel(e, useCanvasStore.getState().viewport, setViewport);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [setViewport]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (contextMenu) {
        setContextMenu(null);
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas) return;

      const world = screenToWorld(e.clientX, e.clientY, canvas, viewport);
      const hit = hitTestNode(world.x, world.y, nodes);

      if (hit) {
        selectNode(hit.id);
      } else {
        selectNode(null);
        dragRef.current = startDrag(e.nativeEvent, viewport, dragRef.current);
      }
    },
    [viewport, nodes, selectNode, contextMenu]
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const world = screenToWorld(e.clientX, e.clientY, canvas, viewport);
      const hit = hitTestNode(world.x, world.y, nodes);

      if (hit) {
        selectNode(hit.id);
        setContextMenu({ x: e.clientX, y: e.clientY, nodeId: hit.id });
      } else {
        setContextMenu(null);
      }
    },
    [viewport, nodes, selectNode]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      updateDrag(e.nativeEvent, dragRef.current, viewport.zoom, setViewport);
    },
    [viewport.zoom, setViewport]
  );

  const onMouseUp = useCallback(() => {
    dragRef.current = endDrag(dragRef.current);
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        style={{ cursor: dragRef.current.isDragging ? 'grabbing' : 'grab' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onContextMenu={onContextMenu}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          nodeId={contextMenu.nodeId}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
