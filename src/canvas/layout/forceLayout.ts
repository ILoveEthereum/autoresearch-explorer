import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import type { CanvasNode, CanvasEdge } from '../../types/canvas';
import { NODE_WIDTH, NODE_BASE_HEIGHT } from '../nodes/nodeConstants';

interface SimNode {
  id: string;
  x: number;
  y: number;
  index?: number;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
}

/**
 * Run a force-directed layout for radial/organic layouts.
 */
export function runForceLayout(
  nodes: CanvasNode[],
  edges: CanvasEdge[]
): Map<string, { x: number; y: number }> {
  const simNodes: SimNode[] = nodes
    .filter((n) => !n.pinned)
    .map((n) => ({
      id: n.id,
      x: n.position.x || Math.random() * 400,
      y: n.position.y || Math.random() * 400,
    }));

  const nodeIds = new Set(simNodes.map((n) => n.id));
  const simLinks: SimLink[] = edges
    .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
    .map((e) => ({ source: e.from, target: e.to }));

  const sim = forceSimulation(simNodes)
    .force('link', forceLink<SimNode, SimLink>(simLinks).id((d) => d.id).distance(180))
    .force('charge', forceManyBody().strength(-400))
    .force('center', forceCenter(400, 300))
    .force('collide', forceCollide(NODE_WIDTH / 2 + 20))
    .stop();

  // Run simulation synchronously
  for (let i = 0; i < 120; i++) {
    sim.tick();
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const node of simNodes) {
    positions.set(node.id, { x: node.x, y: node.y });
  }

  return positions;
}
