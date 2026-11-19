import { evenSize, zoomCrop } from './frame';
import { drawStamp } from './stamp';
import { fileName } from './time';

export type Facing = 'environment' | 'user';

const PHOTO_MAX = 4096;
const VIDEO_MAX = 1920;

export class BurnUnsupported extends Error {
  constructor() {
    super('burn-unsupported');
    this.name = 'BurnUnsupported';
  }
}

type TorchCapabilities = MediaTrackCapabilities & { torch?: boolean };
type TorchConstraint = MediaTrackConstraintSet & { torch?: boolean };

async function replaceCamera(current: MediaStream | null, facing: Facing): Promise<MediaStream> {
  const next = await openCamera(facing);
  stopStream(current);
  return next;
}

export { replaceCamera };

export async function openCamera(facing: Facing): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new DOMException('insecure', 'SecurityError');
  }
  const attempts: MediaStreamConstraints[] = [
    {
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    },
    { audio: false, video: { facingMode: facing } },
    { audio: false, video: true },
  ];
  let last: unknown;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      last = error;
      if (error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')) {
        throw error;
      }
    }
  }
  throw last instanceof Error ? last : new Error('camera');
}

export function videoTrack(stream: MediaStream | null): MediaStreamTrack | null {
  return stream?.getVideoTracks()[0] ?? null;
}

export function torchAvailable(track: MediaStreamTrack | null): boolean {
  if (!track || typeof track.getCapabilities !== 'function') return false;
  const caps = track.getCapabilities() as TorchCapabilities;
  return Boolean(caps.torch);
}

export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<void> {
  await track.applyConstraints({ advanced: [{ torch: on } as TorchConstraint] });
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

function mimeChoice(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const candidates: Array<[string, 'mp4' | 'webm']> = [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [mime, ext] of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

export function canBurnVideo(): boolean {
  return typeof HTMLCanvasElement !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    && mimeChoice() !== null;
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  logo: HTMLImageElement,
  facing: Facing,
  when: Date,
  map: HTMLCanvasElement | null,
  zoom: number,
): void {
  const viewW = video.clientWidth || video.videoWidth;
  const viewH = video.clientHeight || video.videoHeight;
  const crop = zoomCrop(video.videoWidth, video.videoHeight, viewW, viewH, zoom);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.save();
  if (facing === 'user') {
    ctx.translate(ctx.canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
  drawStamp(ctx, ctx.canvas.width, ctx.canvas.height, logo, when, map);
}

export async function takePhoto(
  video: HTMLVideoElement,
  logo: HTMLImageElement,
  facing: Facing,
  map: HTMLCanvasElement | null,
  zoom: number,
): Promise<{ blob: Blob; name: string }> {
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('camera-not-ready');
  }
  const viewW = video.clientWidth || video.videoWidth;
  const viewH = video.clientHeight || video.videoHeight;
  const crop = zoomCrop(video.videoWidth, video.videoHeight, viewW, viewH, zoom);
  const size = evenSize(crop.sw * zoom, crop.sh * zoom, PHOTO_MAX);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const when = new Date();
  paintFrame(ctx, video, logo, facing, when, map, zoom);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('jpeg'))), 'image/jpeg', 0.92);
  });
  return { blob, name: fileName(when, 'jpg') };
}

export interface Recording {
  blob: Blob;
  name: string;
  silent: boolean;
  mapped: boolean;
}

export class VideoRecorder {
  private recorder: MediaRecorder | null = null;
  private mic: MediaStream | null = null;
  private raf = 0;
  private chunks: Blob[] = [];
  private silent = false;
  private ext: 'mp4' | 'webm' = 'webm';
  private startedAt = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private facing: Facing = 'environment';
  private map: HTMLCanvasElement | null = null;
  private zoom = 1;

  constructor(
    private video: HTMLVideoElement,
    private logo: HTMLImageElement,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'burn-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    this.ctx = ctx;
    document.body.append(this.canvas);
  }

  get running(): boolean {
    return this.recorder?.state === 'recording';
  }

  elapsedMs(): number {
    return this.startedAt ? Date.now() - this.startedAt : 0;
  }

  async start(facing: Facing, map: HTMLCanvasElement | null, zoom: number): Promise<{ silent: boolean }> {
    if (!this.video.videoWidth) throw new Error('camera-not-ready');
    const choice = mimeChoice();
    if (!canBurnVideo() || !choice) throw new BurnUnsupported();

    this.facing = facing;
    this.map = map;
    this.zoom = Math.max(1, zoom);
    this.ext = choice.ext;
    this.chunks = [];
    this.silent = false;

    const viewW = this.video.clientWidth || this.video.videoWidth;
    const viewH = this.video.clientHeight || this.video.videoHeight;
    const crop = zoomCrop(this.video.videoWidth, this.video.videoHeight, viewW, viewH, this.zoom);
    const size = evenSize(crop.sw * this.zoom, crop.sh * this.zoom, VIDEO_MAX);
    this.canvas.width = size.width;
    this.canvas.height = size.height;
    paintFrame(this.ctx, this.video, this.logo, facing, new Date(), this.map, this.zoom);

    let stream: MediaStream;
    try {
      stream = this.canvas.captureStream(30);
    } catch {
      throw new BurnUnsupported();
    }

    try {
      this.mic = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      for (const track of this.mic.getAudioTracks()) stream.addTrack(track);
    } catch {
      this.silent = true;
      stopStream(this.mic);
      this.mic = null;
    }

    const options: MediaRecorderOptions = {
      mimeType: choice.mime,
      videoBitsPerSecond: 2_500_000,
    };
    if (!this.silent) options.audioBitsPerSecond = 128_000;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, options);
    } catch {
      this.finish();
      throw new BurnUnsupported();
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    };
    this.recorder = recorder;
    this.startedAt = Date.now();
    const loop = () => {
      paintFrame(this.ctx, this.video, this.logo, this.facing, new Date(), this.map, this.zoom);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
    try {
      recorder.start(1000);
    } catch {
      this.finish();
      throw new BurnUnsupported();
    }
    return { silent: this.silent };
  }

  async stop(): Promise<Recording> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      throw new Error('not-recording');
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onerror = () => reject(new Error('recorder'));
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType || 'video/webm' }));
      recorder.stop();
    });
    this.finish();
    const when = new Date();
    return { blob, name: fileName(when, this.ext), silent: this.silent, mapped: this.map !== null };
  }

  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.ondataavailable = null;
      try {
        this.recorder.stop();
      } catch {
        /* already stopped */
      }
    }
    this.finish();
  }

  private finish(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.recorder = null;
    this.startedAt = 0;
    stopStream(this.mic);
    this.mic = null;
  }
}
