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

export interface PixelSize {
  width: number;
  height: number;
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
