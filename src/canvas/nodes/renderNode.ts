import type { CanvasNode } from '../../types/canvas';
import { NODE_COLORS, TEXT_PRIMARY, TEXT_SECONDARY, FOCUS_COLOR, SELECTION_COLOR } from './nodeColors';
import { drawRoundedRect, drawDiamond, drawHighlightedBox, drawDashedBox } from './shapes';

export const NODE_WIDTH = 240;
export const NODE_BASE_HEIGHT = 60;
const DIAMOND_SIZE = 140;
const RADIUS = 6;

export function getNodeBounds(node: CanvasNode): { x: number; y: number; w: number; h: number } {
  if (node.type === 'question' || node.fields?.shape === 'diamond') {
    return {
      x: node.position.x - DIAMOND_SIZE / 2,
      y: node.position.y - DIAMOND_SIZE / 2,
      w: DIAMOND_SIZE,
      h: DIAMOND_SIZE,
    };
  }
  const h = NODE_BASE_HEIGHT + (node.summary ? 20 : 0);
  return {
    x: node.position.x - NODE_WIDTH / 2,
    y: node.position.y - h / 2,
    w: NODE_WIDTH,
    h,
  };
}

export function renderNode(
  ctx: CanvasRenderingContext2D,
  node: CanvasNode,
  isFocused: boolean,
  isSelected: boolean
) {
  const colors = NODE_COLORS[node.status] || NODE_COLORS.queued;
  const bounds = getNodeBounds(node);

  // Focus glow
  if (isFocused) {
    ctx.save();
    ctx.shadowColor = FOCUS_COLOR;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    if (node.type === 'question') {
      ctx.arc(node.position.x, node.position.y, DIAMOND_SIZE / 2, 0, Math.PI * 2);
    } else {
      ctx.roundRect(bounds.x - 4, bounds.y - 4, bounds.w + 8, bounds.h + 8, RADIUS + 2);
    }
    ctx.fillStyle = FOCUS_COLOR;
    ctx.fill();
    ctx.restore();
  }

  // Draw shape based on type
  const shape = getShape(node);

  switch (shape) {
    case 'diamond':
      drawDiamond(ctx, node.position.x, node.position.y, DIAMOND_SIZE, DIAMOND_SIZE, colors.fill, colors.border);
      break;
    case 'highlighted_box':
      drawHighlightedBox(ctx, bounds.x, bounds.y, bounds.w, bounds.h, RADIUS, colors.fill, colors.border);
      break;
    case 'dashed_box':
      drawDashedBox(ctx, bounds.x, bounds.y, bounds.w, bounds.h, RADIUS, '#fffbeb', '#f59e0b');
      break;
    default:
      drawRoundedRect(ctx, bounds.x, bounds.y, bounds.w, bounds.h, RADIUS, colors.fill, colors.border);
  }

  // Selection outline
  if (isSelected) {
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = SELECTION_COLOR;
    ctx.beginPath();
    if (shape === 'diamond') {
      ctx.moveTo(node.position.x, node.position.y - DIAMOND_SIZE / 2 - 4);
      ctx.lineTo(node.position.x + DIAMOND_SIZE / 2 + 4, node.position.y);
      ctx.lineTo(node.position.x, node.position.y + DIAMOND_SIZE / 2 + 4);
      ctx.lineTo(node.position.x - DIAMOND_SIZE / 2 - 4, node.position.y);
      ctx.closePath();
    } else {
      ctx.roundRect(bounds.x - 3, bounds.y - 3, bounds.w + 6, bounds.h + 6, RADIUS + 2);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Text
  drawNodeText(ctx, node, bounds, shape);
}

function getShape(node: CanvasNode): string {
  switch (node.type) {
    case 'question': return 'diamond';
    case 'finding':  return 'highlighted_box';
    case 'gap':      return 'dashed_box';
    default:         return 'box';
  }
}

function drawNodeText(
  ctx: CanvasRenderingContext2D,
  node: CanvasNode,
  bounds: { x: number; y: number; w: number; h: number },
  shape: string
) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (shape === 'diamond') {
    // Title only, centered
    ctx.font = '600 12px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = TEXT_PRIMARY;
    const maxWidth = DIAMOND_SIZE * 0.6;
    wrapText(ctx, node.title, node.position.x, node.position.y, maxWidth, 14);
  } else {
    // Title
    ctx.font = '600 13px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = TEXT_PRIMARY;
    const titleY = bounds.y + 20;
    ctx.fillText(truncate(node.title, 30), bounds.x + bounds.w / 2, titleY);

    // Summary (if room)
    if (node.summary && bounds.h > NODE_BASE_HEIGHT) {
      ctx.font = '400 11px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = TEXT_SECONDARY;
      ctx.fillText(truncate(node.summary, 40), bounds.x + bounds.w / 2, titleY + 20);
    }

    // Status badge
    ctx.font = '500 9px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = TEXT_SECONDARY;
    ctx.textAlign = 'right';
    ctx.fillText(node.status.toUpperCase(), bounds.x + bounds.w - 8, bounds.y + bounds.h - 8);
  }

  ctx.restore();
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string, x: number, y: number,
  maxWidth: number, lineHeight: number
) {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const test = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = test;
    }
  }
  if (currentLine) lines.push(currentLine);

  const totalHeight = lines.length * lineHeight;
  const startY = y - totalHeight / 2 + lineHeight / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, startY + i * lineHeight);
  }
}
