import { BurnUnsupported, VideoRecorder, replaceCamera, setTorch, stopStream, takePhoto, torchAvailable, videoTrack, type Facing } from './capture';
import { loadImage } from './stamp';
import './style.css';

type Mode = 'photo' | 'video';

const gate = document.querySelector<HTMLElement>('#gate')!;
const view = document.querySelector<HTMLElement>('#view')!;
const review = document.querySelector<HTMLElement>('#review')!;
const openButton = document.querySelector<HTMLButtonElement>('#open')!;
const gateError = document.querySelector<HTMLElement>('#gate-error')!;
const preview = document.querySelector<HTMLVideoElement>('#preview')!;
const shutter = document.querySelector<HTMLButtonElement>('#shutter')!;
const flipButton = document.querySelector<HTMLButtonElement>('#flip')!;
const torchButton = document.querySelector<HTMLButtonElement>('#torch')!;
const photoMode = document.querySelector<HTMLButtonElement>('#mode-photo')!;
const videoMode = document.querySelector<HTMLButtonElement>('#mode-video')!;
const recBadge = document.querySelector<HTMLElement>('#rec')!;
const elapsed = document.querySelector<HTMLElement>('#elapsed')!;
const viewError = document.querySelector<HTMLElement>('#view-error')!;
const reviewImg = document.querySelector<HTMLImageElement>('#review-img')!;
const reviewVideo = document.querySelector<HTMLVideoElement>('#review-video')!;
const downloadButton = document.querySelector<HTMLButtonElement>('#download')!;
const shareButton = document.querySelector<HTMLButtonElement>('#share')!;
const retakeButton = document.querySelector<HTMLButtonElement>('#retake')!;
const reviewNote = document.querySelector<HTMLElement>('#review-note')!;

let facing: Facing = 'environment';
let mode: Mode = 'photo';
let stream: MediaStream | null = null;
let logo: HTMLImageElement | null = null;
let recorder: VideoRecorder | null = null;
let torchOn = false;
let busy = false;
let tick = 0;
let current: { blob: Blob; name: string; url: string } | null = null;

function show(screen: HTMLElement): void {
  for (const item of [gate, view, review]) item.hidden = item !== screen;
}

function cameraMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'El navegador bloqueó la cámara. En el candado de la dirección, permite la cámara y vuelve a tocar el botón.';
  }
  if (error instanceof DOMException && error.name === 'SecurityError') {
    return 'La cámara solo abre en una página https.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'Este dispositivo no tiene una cámara que el navegador pueda usar.';
  }
  return 'No se pudo abrir la cámara. Vuelve a intentarlo.';
}

async function ensureLogo(): Promise<HTMLImageElement> {
  if (logo) return logo;
  logo = await loadImage('/brand/sepesa-logo-white.png');
  return logo;
}

function applyFacing(): void {
  preview.classList.toggle('mirror', facing === 'user');
}

async function startCamera(): Promise<void> {
  stream = await replaceCamera(stream, facing);
  preview.srcObject = stream;
  applyFacing();
  await preview.play();
  torchOn = false;
  const track = videoTrack(stream);
  torchButton.hidden = !torchAvailable(track);
  torchButton.setAttribute('aria-pressed', 'false');
}

async function openView(): Promise<void> {
  gateError.hidden = true;
  openButton.disabled = true;
  try {
    await Promise.all([ensureLogo(), startCamera()]);
    show(view);
  } catch (error) {
    gateError.textContent = cameraMessage(error);
    gateError.hidden = false;
  } finally {
    openButton.disabled = false;
  }
}

function setMode(next: Mode): void {
  if (recorder?.running) return;
  mode = next;
  photoMode.setAttribute('aria-pressed', String(next === 'photo'));
  videoMode.setAttribute('aria-pressed', String(next === 'video'));
  shutter.setAttribute('aria-label', next === 'photo' ? 'Tomar foto' : 'Grabar');
  viewError.hidden = true;
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function setRecording(on: boolean): void {
  shutter.classList.toggle('is-recording', on);
  shutter.setAttribute('aria-label', on ? 'Detener' : mode === 'photo' ? 'Tomar foto' : 'Grabar');
  recBadge.hidden = !on;
  photoMode.disabled = on;
  videoMode.disabled = on;
  flipButton.disabled = on;
  if (on) {
    elapsed.textContent = '0:00';
    tick = window.setInterval(() => {
      elapsed.textContent = formatElapsed(recorder?.elapsedMs() ?? 0);
    }, 200);
  } else {
    window.clearInterval(tick);
  }
}

function revokeCurrent(): void {
  if (!current) return;
  URL.revokeObjectURL(current.url);
  current = null;
}

function showReview(blob: Blob, name: string, note: string): void {
  revokeCurrent();
  const url = URL.createObjectURL(blob);
  current = { blob, name, url };
  const isVideo = blob.type.startsWith('video/');
  reviewImg.hidden = isVideo;
  reviewVideo.hidden = !isVideo;
  if (isVideo) {
    reviewVideo.src = url;
  } else {
    reviewImg.src = url;
    reviewImg.alt = `Foto SEPESA ${name}`;
  }
  reviewNote.textContent = note;
  reviewNote.hidden = note.length === 0;
  shareButton.hidden = typeof navigator.share !== 'function';
  show(review);
}

async function shoot(): Promise<void> {
  if (busy || !logo || !stream) return;
  viewError.hidden = true;

  if (mode === 'video' && recorder?.running) {
    busy = true;
    shutter.disabled = true;
    try {
      const result = await recorder.stop();
      setRecording(false);
      const note = result.silent ? 'Sin sonido. Permite el micrófono si quieres audio en el video.' : '';
      showReview(result.blob, result.name, note);
    } catch {
      setRecording(false);
      viewError.textContent = 'No se pudo guardar el video. Vuelve a grabar.';
      viewError.hidden = false;
    } finally {
      shutter.disabled = false;
      busy = false;
    }
    return;
  }

  if (mode === 'video') {
    busy = true;
    shutter.disabled = true;
    try {
      recorder ??= new VideoRecorder(preview, logo);
      const started = await recorder.start(facing);
      setRecording(true);
      if (started.silent) {
        viewError.textContent = 'Sin sonido. Permite el micrófono si quieres audio en el video.';
        viewError.hidden = false;
      }
    } catch (error) {
      recorder?.cancel();
      setRecording(false);
      viewError.textContent = error instanceof BurnUnsupported
        ? 'Este navegador no puede grabar el video con el sello. Toma una foto.'
        : 'No se pudo empezar a grabar. Vuelve a intentarlo.';
      viewError.hidden = false;
    } finally {
      shutter.disabled = false;
      busy = false;
    }
    return;
  }

  busy = true;
  shutter.disabled = true;
  try {
    const shot = await takePhoto(preview, logo, facing);
    showReview(shot.blob, shot.name, '');
  } catch {
    viewError.textContent = 'No se pudo tomar la foto. Espera un momento y vuelve a tocar el botón.';
    viewError.hidden = false;
  } finally {
    shutter.disabled = false;
    busy = false;
  }
}

function downloadFile(): void {
  if (!current) return;
  const link = document.createElement('a');
  link.href = current.url;
  link.download = current.name;
  link.click();
}

async function shareFile(): Promise<void> {
  if (!current) return;
  const file = new File([current.blob], current.name, { type: current.blob.type });
  const shareable = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  if (!shareable) {
    downloadFile();
    reviewNote.textContent = 'Este navegador no abre el menú de compartir. El archivo se descargó.';
    reviewNote.hidden = false;
    return;
  }
  try {
    await navigator.share({ files: [file], title: current.name });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    downloadFile();
    reviewNote.textContent = 'Este navegador no abre el menú de compartir. El archivo se descargó.';
    reviewNote.hidden = false;
  }
}

function retake(): void {
  reviewVideo.pause();
  reviewVideo.removeAttribute('src');
  reviewVideo.load();
  show(view);
}

async function flip(): Promise<void> {
  if (recorder?.running || busy) return;
  facing = facing === 'environment' ? 'user' : 'environment';
  flipButton.disabled = true;
  try {
    await startCamera();
    viewError.hidden = true;
  } catch (error) {
    viewError.textContent = cameraMessage(error);
    viewError.hidden = false;
  } finally {
    flipButton.disabled = false;
  }
}

async function toggleTorch(): Promise<void> {
  const track = videoTrack(stream);
  if (!track || !torchAvailable(track)) return;
  torchOn = !torchOn;
  try {
    await setTorch(track, torchOn);
    torchButton.setAttribute('aria-pressed', String(torchOn));
  } catch {
    torchOn = false;
    torchButton.setAttribute('aria-pressed', 'false');
  }
}

openButton.addEventListener('click', () => void openView());
shutter.addEventListener('click', () => void shoot());
photoMode.addEventListener('click', () => setMode('photo'));
videoMode.addEventListener('click', () => setMode('video'));
flipButton.addEventListener('click', () => void flip());
torchButton.addEventListener('click', () => void toggleTorch());
downloadButton.addEventListener('click', downloadFile);
shareButton.addEventListener('click', () => void shareFile());
retakeButton.addEventListener('click', retake);

window.addEventListener('pagehide', () => {
  recorder?.cancel();
  stopStream(stream);
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
