export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  radius: number,
  fillColor: string, strokeColor: string, strokeWidth = 1
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.restore();
}

export function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, w: number, h: number,
  fillColor: string, strokeColor: string, strokeWidth = 1
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.moveTo(cx, cy - h / 2);
  ctx.lineTo(cx + w / 2, cy);
  ctx.lineTo(cx, cy + h / 2);
  ctx.lineTo(cx - w / 2, cy);
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.restore();
}

export function drawHighlightedBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  radius: number,
  fillColor: string, strokeColor: string
) {
  drawRoundedRect(ctx, x, y, w, h, radius, fillColor, strokeColor, 2.5);

  ctx.save();
  ctx.shadowColor = strokeColor;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.strokeStyle = 'transparent';
  ctx.stroke();
  ctx.restore();
}

export function drawDashedBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  radius: number,
  fillColor: string, strokeColor: string
) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.05)';
  ctx.shadowBlur = 2;

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fillColor;
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
