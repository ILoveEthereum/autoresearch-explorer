import type { CanvasNode, CanvasEdge, Viewport } from '../types/canvas';
import { CANVAS_BG } from './nodes/nodeColors';
import { renderNode } from './nodes/renderNode';
import { renderEdge } from './edges/renderEdge';

export function render(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  viewport: Viewport,
  focusNodeId: string | null,
  selectedNodeId: string | null
) {
  const dpr = window.devicePixelRatio || 1;

  // Clear
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = CANVAS_BG;
  ctx.fillRect(0, 0, width, height);

  // Apply viewport transform
  ctx.translate(width / 2, height / 2);
  ctx.scale(viewport.zoom, viewport.zoom);
  ctx.translate(-viewport.x, -viewport.y);

  // Draw grid dots
  drawGrid(ctx, viewport, width, height);

  // Draw edges
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (fromNode && toNode) {
      renderEdge(ctx, edge, fromNode, toNode);
    }
  }

  // Draw nodes
  for (const node of nodes) {
    renderNode(ctx, node, node.id === focusNodeId, node.id === selectedNodeId);
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  viewport: Viewport,
  screenWidth: number,
  screenHeight: number
) {
  const spacing = 40;
  const halfW = screenWidth / 2 / viewport.zoom;
  const halfH = screenHeight / 2 / viewport.zoom;

  const left = viewport.x - halfW;
  const right = viewport.x + halfW;
  const top = viewport.y - halfH;
  const bottom = viewport.y + halfH;

  const startX = Math.floor(left / spacing) * spacing;
  const startY = Math.floor(top / spacing) * spacing;

  ctx.fillStyle = '#e5e7eb';
  for (let x = startX; x <= right; x += spacing) {
    for (let y = startY; y <= bottom; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
