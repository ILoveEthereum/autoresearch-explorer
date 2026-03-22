import type { CanvasNode, CanvasEdge } from '../../types/canvas';
import { runDagreLayout } from './dagreLayout';
import { runForceLayout } from './forceLayout';

export type LayoutMode = 'left_to_right' | 'top_to_bottom' | 'radial' | 'freeform';

/**
 * Run layout based on the template's primary_axis setting.
 */
export function runLayout(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  mode: LayoutMode
): Map<string, { x: number; y: number }> {
  switch (mode) {
    case 'left_to_right':
      return runDagreLayout(nodes, edges, 'LR');
    case 'top_to_bottom':
      return runDagreLayout(nodes, edges, 'TB');
    case 'radial':
      return runForceLayout(nodes, edges);
    case 'freeform':
      // No auto-layout
      return new Map();
    default:
      return runDagreLayout(nodes, edges, 'LR');
  }
}
