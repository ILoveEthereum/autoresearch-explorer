import type { CanvasNode, CanvasEdge, CanvasCluster, Viewport } from '../types/canvas';
import { CANVAS_BG } from './nodes/nodeColors';
import { renderNode } from './nodes/renderNode';
import { renderEdge } from './edges/renderEdge';
import { getDetailLevel } from './semanticZoom';

export function render(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  clusters: CanvasCluster[],
  viewport: Viewport,
  focusNodeId: string | null,
  selectedNodeId: string | null
) {
  const dpr = window.devicePixelRatio || 1;
  const detailLevel = getDetailLevel(viewport.zoom);

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

  // Draw clusters (background)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  for (const cluster of clusters) {
    if (!cluster.collapsed) {
      renderCluster(ctx, cluster, nodeMap, detailLevel);
    }
  }

  // Draw edges (skip at far zoom for cleanliness)
  if (detailLevel !== 'far') {
    for (const edge of edges) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (fromNode && toNode) {
        renderEdge(ctx, edge, fromNode, toNode);
      }
    }
  }

  // Draw nodes
  for (const node of nodes) {
    renderNode(ctx, node, node.id === focusNodeId, node.id === selectedNodeId, detailLevel);
  }
}

function renderCluster(
  ctx: CanvasRenderingContext2D,
  cluster: CanvasCluster,
  nodeMap: Map<string, CanvasNode>,
  detailLevel: string
) {
  const childNodes = cluster.children
    .map((id) => nodeMap.get(id))
    .filter((n): n is CanvasNode => n !== undefined);

  if (childNodes.length === 0) return;

  // Compute bounding box
  const padding = 30;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const node of childNodes) {
    minX = Math.min(minX, node.position.x - 120);
    minY = Math.min(minY, node.position.y - 40);
    maxX = Math.max(maxX, node.position.x + 120);
    maxY = Math.max(maxY, node.position.y + 40);
  }

  const x = minX - padding;
  const y = minY - padding - 20; // extra for label
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2 + 20;

  // Draw background
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fillStyle = 'rgba(248, 250, 252, 0.8)';
  ctx.fill();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);

  // Label
  ctx.font = '600 11px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(cluster.label.toUpperCase(), x + 12, y + 8);

  ctx.restore();
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
