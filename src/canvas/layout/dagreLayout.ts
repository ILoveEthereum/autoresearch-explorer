import dagre from '@dagrejs/dagre';
import type { CanvasNode, CanvasEdge } from '../../types/canvas';
import { NODE_WIDTH, NODE_BASE_HEIGHT } from '../nodes/renderNode';

/**
 * Run Dagre layout on the given nodes and edges.
 * Returns updated positions for each node.
 */
export function runDagreLayout(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  direction: 'LR' | 'TB' = 'LR'
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();

  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 100,
    marginx: 50,
    marginy: 50,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) {
    if (!node.pinned) {
      const h = NODE_BASE_HEIGHT + (node.summary ? 20 : 0);
      g.setNode(node.id, { width: NODE_WIDTH, height: h });
    }
  }

  for (const edge of edges) {
    if (g.hasNode(edge.from) && g.hasNode(edge.to)) {
      g.setEdge(edge.from, edge.to);
    }
  }

  dagre.layout(g);

  const positions = new Map<string, { x: number; y: number }>();
  for (const nodeId of g.nodes()) {
    const n = g.node(nodeId);
    if (n) {
      positions.set(nodeId, { x: n.x, y: n.y });
    }
  }

  return positions;
}
