export interface Crop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Source rectangle that matches an object-fit: cover preview. */
export function coverCrop(videoW: number, videoH: number, viewW: number, viewH: number): Crop {
  const vw = Math.max(1, videoW);
  const vh = Math.max(1, videoH);
  const viewAspect = viewW > 0 && viewH > 0 ? viewW / viewH : vw / vh;
  const videoAspect = vw / vh;
  if (videoAspect > viewAspect) {
    const sw = vh * viewAspect;
    return { sx: (vw - sw) / 2, sy: 0, sw, sh: vh };
  }
  const sh = vw / viewAspect;
  return { sx: 0, sy: (vh - sh) / 2, sw: vw, sh };
}

/** Same cover crop, then zoom into the center. */
export function zoomCrop(
  videoW: number,
  videoH: number,
  viewW: number,
  viewH: number,
  zoom: number,
): Crop {
  const base = coverCrop(videoW, videoH, viewW, viewH);
  const factor = Math.max(1, zoom);
  const sw = base.sw / factor;
  const sh = base.sh / factor;
  return {
    sx: base.sx + (base.sw - sw) / 2,
    sy: base.sy + (base.sh - sh) / 2,
    sw,
    sh,
  };
}

export type Format = 'full' | '3:4' | '1:1' | '16:9' | 'pano';

export const FORMATS: readonly Format[] = ['full', '3:4', '1:1', '16:9', 'pano'];

/** Width over height of the picture for a format, on a stage of this size. */
export function formatAspect(format: Format, stageW: number, stageH: number): number {
  const w = Math.max(1, stageW);
  const h = Math.max(1, stageH);
  if (format === '3:4') return w >= h ? 4 / 3 : 3 / 4;
  if (format === '1:1') return 1;
  if (format === '16:9') return 16 / 9;
  if (format === 'pano') return 3;
  return w / h;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Largest box of this aspect inside the stage, sitting a little above the middle. */
export function fitFrame(aspect: number, stageW: number, stageH: number): Box {
  const w = Math.max(1, stageW);
  const h = Math.max(1, stageH);
  const ratio = aspect > 0 ? aspect : w / h;
  const width = Math.round(Math.min(w, h * ratio));
  const height = Math.min(h, Math.round(width / ratio));
  return {
    left: Math.round((w - width) / 2),
    top: Math.round((h - height) * 0.42),
    width,
    height,
  };
}

export interface PixelSize {
  width: number;
  height: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

/** Tile-space position. 1 unit is one map tile. */
export function worldPoint(lat: number, lon: number, zoom: number): WorldPoint {
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  return {
    x: ((lon + 180) / 360) * n,
    y: (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n,
  };
}

/** Even dimensions, never larger than maxLong on the long edge. */
export function evenSize(width: number, height: number, maxLong: number): PixelSize {
  let w = Math.max(2, width);
  let h = Math.max(2, height);
  const long = Math.max(w, h);
  if (long > maxLong) {
    const scale = maxLong / long;
    w *= scale;
    h *= scale;
  }
  return {
    width: Math.max(2, Math.round(w / 2) * 2),
    height: Math.max(2, Math.round(h / 2) * 2),
  };
}
