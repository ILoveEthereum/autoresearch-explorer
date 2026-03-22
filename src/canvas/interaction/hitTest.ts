import type { CanvasNode, Viewport } from '../../types/canvas';
import { getNodeBounds } from '../nodes/renderNode';

/**
 * Convert screen coordinates to canvas (world) coordinates.
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  canvasEl: HTMLCanvasElement,
  viewport: Viewport
): { x: number; y: number } {
  const rect = canvasEl.getBoundingClientRect();
  const cx = screenX - rect.left;
  const cy = screenY - rect.top;

  const x = (cx - rect.width / 2) / viewport.zoom + viewport.x;
  const y = (cy - rect.height / 2) / viewport.zoom + viewport.y;

  return { x, y };
}

/**
 * Find which node (if any) is at the given world coordinates.
 * Returns the topmost node (last in the array = drawn on top).
 */
export function hitTestNode(
  worldX: number,
  worldY: number,
  nodes: CanvasNode[]
): CanvasNode | null {
  // Iterate in reverse so topmost node wins
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    const bounds = getNodeBounds(node);

    if (
      worldX >= bounds.x &&
      worldX <= bounds.x + bounds.w &&
      worldY >= bounds.y &&
      worldY <= bounds.y + bounds.h
    ) {
      return node;
    }
  }
  return null;
}
