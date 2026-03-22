import type { CanvasEdge, CanvasNode } from '../../types/canvas';
import { EDGE_COLORS, TEXT_META } from '../nodes/nodeColors';
import { getNodeBounds } from '../nodes/renderNode';

const ARROW_SIZE = 8;

export function renderEdge(
  ctx: CanvasRenderingContext2D,
  edge: CanvasEdge,
  fromNode: CanvasNode,
  toNode: CanvasNode
) {
  const style = edge.style || edge.type || 'solid_arrow';
  const color = EDGE_COLORS[style] || EDGE_COLORS.solid_arrow;
  const isDashed = style.includes('dashed') || style.includes('dotted');

  const from = getEdgeAnchor(fromNode, toNode.position);
  const to = getEdgeAnchor(toNode, fromNode.position);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  if (isDashed) {
    ctx.setLineDash(style.includes('dotted') ? [3, 4] : [6, 4]);
  }

  // Draw line
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.setLineDash([]);

  // Arrow head
  if (style.includes('arrow')) {
    drawArrow(ctx, from, to, color);
  }

  // Label
  if (edge.label) {
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    ctx.font = '400 10px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = TEXT_META;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(edge.label, midX, midY - 4);
  }

  ctx.restore();
}

function getEdgeAnchor(
  node: CanvasNode,
  target: { x: number; y: number }
): { x: number; y: number } {
  const bounds = getNodeBounds(node);
  const cx = node.position.x;
  const cy = node.position.y;

  // Simple: find intersection of line from center to target with bounding box
  const dx = target.x - cx;
  const dy = target.y - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const hw = bounds.w / 2;
  const hh = bounds.h / 2;

  // Scale to find the edge intersection
  const scaleX = hw / Math.abs(dx || 1);
  const scaleY = hh / Math.abs(dy || 1);
  const scale = Math.min(scaleX, scaleY);

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  };
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - ARROW_SIZE * Math.cos(angle - Math.PI / 6),
    to.y - ARROW_SIZE * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    to.x - ARROW_SIZE * Math.cos(angle + Math.PI / 6),
    to.y - ARROW_SIZE * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}
