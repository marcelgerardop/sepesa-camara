import { stampLabel } from './time';

const STAMP_FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';

function pillPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function drawStamp(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  logo: CanvasImageSource & { width: number; height: number },
  date: Date,
  map: (CanvasImageSource & { width: number; height: number }) | null = null,
): void {
  const short = Math.min(width, height);
  const pad = Math.round(short * 0.035);
  const label = stampLabel(date);
  const fontSize = Math.max(22, Math.round(short * 0.034));
  ctx.save();
  ctx.font = `600 ${fontSize}px ${STAMP_FONT}`;
  ctx.textBaseline = 'middle';
  const textWidth = ctx.measureText(label).width;
  const padX = fontSize * 0.72;
  const padY = fontSize * 0.46;
  const pillW = textWidth + padX * 2;
  const pillH = fontSize + padY * 2;
  const gap = Math.round(fontSize * 0.38);
  const mapW = map ? Math.round(short * 0.5) : 0;
  const mapH = map ? Math.round(mapW * (map.height / Math.max(1, map.width))) : 0;
  const logoW = short * 0.52;
  const logoH = logoW * (logo.height / Math.max(1, logo.width));
  const logoX = width - pad - logoW;
  const logoY = pad;
  const blockW = Math.max(pillW, mapW);
  const blockX = width - pad - blockW;
  const blockBottom = height - pad;
  const blockH = pillH + (map ? gap + mapH : 0);
  const pillX = blockX + blockW - pillW;
  const pillY = blockBottom - blockH;
  const mapX = blockX + blockW - mapW;
  const mapY = pillY + pillH + gap;
  const radius = Math.max(10, fontSize * 0.4);

  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = Math.max(10, width * 0.012);
  ctx.shadowOffsetY = Math.max(2, width * 0.003);
  ctx.drawImage(logo, logoX, logoY, logoW, logoH);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (map) {
    ctx.save();
    ctx.beginPath();
    pillPath(ctx, mapX, mapY, mapW, mapH, radius);
    ctx.clip();
    ctx.drawImage(map, mapX, mapY, mapW, mapH);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = Math.max(3, fontSize * 0.12);
    ctx.beginPath();
    pillPath(ctx, mapX, mapY, mapW, mapH, radius);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
  ctx.beginPath();
  pillPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.fillText(label, pillX + padX, pillY + pillH / 2);
  ctx.restore();
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('logo'));
    image.src = src;
  });
}
