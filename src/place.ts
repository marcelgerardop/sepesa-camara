import { worldPoint } from './frame';
import { loadImage } from './stamp';

const TILE = 256;
const ZOOM = 16;
const MAP_W = 520;
const MAP_H = 300;

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-size * 0.72, -size * 0.15, -size * 0.78, -size * 1.55, 0, -size * 1.72);
  ctx.bezierCurveTo(size * 0.78, -size * 1.55, size * 0.72, -size * 0.15, 0, 0);
  ctx.closePath();
  ctx.fillStyle = '#e05a14';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(0, -size * 1.18, size * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

export async function buildMap(lat: number, lon: number): Promise<HTMLCanvasElement> {
  const point = worldPoint(lat, lon, ZOOM);
  const centerX = point.x * TILE;
  const centerY = point.y * TILE;
  const left = centerX - MAP_W / 2;
  const top = centerY - MAP_H / 2;
  const minTileX = Math.floor(left / TILE);
  const maxTileX = Math.floor((left + MAP_W - 1) / TILE);
  const minTileY = Math.floor(top / TILE);
  const maxTileY = Math.floor((top + MAP_H - 1) / TILE);
  const n = 2 ** ZOOM;
  const canvas = document.createElement('canvas');
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');

  const tiles: Promise<void>[] = [];
  for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
      if (tileY < 0 || tileY >= n) continue;
      const wrappedX = ((tileX % n) + n) % n;
      const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${ZOOM}/${tileY}/${wrappedX}`;
      tiles.push(loadImage(url).then((image) => {
        ctx.drawImage(image, tileX * TILE - left, tileY * TILE - top);
      }));
    }
  }
  await Promise.all(tiles);
  drawPin(ctx, MAP_W / 2, MAP_H / 2, 34);
  ctx.save();
  ctx.font = '14px "Segoe UI", Arial, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.fillText('Esri', 12, MAP_H - 16);
  ctx.restore();
  return canvas;
}
