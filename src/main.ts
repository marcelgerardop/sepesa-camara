import { BurnUnsupported, VideoRecorder, replaceCamera, setTorch, stopStream, takePhoto, torchAvailable, videoTrack, type Facing } from './capture';
import { FORMATS, fitFrame, formatAspect, zoomCrop, type Format } from './frame';
import { buildMap } from './place';
import { loadImage } from './stamp';
import './style.css';

type Mode = 'photo' | 'video';

interface Shot {
  blob: Blob;
  name: string;
  url: string;
  thumb: string;
  note: string;
  isVideo: boolean;
}

const gate = document.querySelector<HTMLElement>('#gate')!;
const view = document.querySelector<HTMLElement>('#view')!;
const review = document.querySelector<HTMLElement>('#review')!;
const openButton = document.querySelector<HTMLButtonElement>('#open')!;
const gateError = document.querySelector<HTMLElement>('#gate-error')!;
const frame = document.querySelector<HTMLElement>('#frame')!;
const flash = document.querySelector<HTMLElement>('#flash')!;
const preview = document.querySelector<HTMLVideoElement>('#preview')!;
const shutter = document.querySelector<HTMLButtonElement>('#shutter')!;
const flipButton = document.querySelector<HTMLButtonElement>('#flip')!;
const torchButton = document.querySelector<HTMLButtonElement>('#torch')!;
const formatButton = document.querySelector<HTMLButtonElement>('#format')!;
const formatLabel = document.querySelector<HTMLElement>('#format-label')!;
const formatsRoot = document.querySelector<HTMLElement>('#formats')!;
const formatChips = [...formatsRoot.querySelectorAll<HTMLButtonElement>('.format-chip')];
const photoMode = document.querySelector<HTMLButtonElement>('#mode-photo')!;
const videoMode = document.querySelector<HTMLButtonElement>('#mode-video')!;
const recBadge = document.querySelector<HTMLElement>('#rec')!;
const elapsed = document.querySelector<HTMLElement>('#elapsed')!;
const viewError = document.querySelector<HTMLElement>('#view-error')!;
const thumbButton = document.querySelector<HTMLButtonElement>('#thumb')!;
const thumbImg = document.querySelector<HTMLImageElement>('#thumb-img')!;
const thumbCount = document.querySelector<HTMLElement>('#thumb-count')!;
const reviewStage = document.querySelector<HTMLElement>('#review-stage')!;
const reviewImg = document.querySelector<HTMLImageElement>('#review-img')!;
const reviewVideo = document.querySelector<HTMLVideoElement>('#review-video')!;
const reviewCount = document.querySelector<HTMLElement>('#review-count')!;
const strip = document.querySelector<HTMLElement>('#strip')!;
const downloadButton = document.querySelector<HTMLButtonElement>('#download')!;
const shareButton = document.querySelector<HTMLButtonElement>('#share')!;
const retakeButton = document.querySelector<HTMLButtonElement>('#retake')!;
const deleteButton = document.querySelector<HTMLButtonElement>('#delete')!;
const reviewNote = document.querySelector<HTMLElement>('#review-note')!;
const zoomRoot = document.querySelector<HTMLElement>('#zoom')!;
const zoomButtons = [...zoomRoot.querySelectorAll<HTMLButtonElement>('.zoom-btn')];

const PLACE_NOTE = 'Sin ubicación. Permite la ubicación si quieres el mapa.';
const SILENT_NOTE = 'Sin sonido. Permite el micrófono si quieres audio en el video.';
const SWIPE_MIN = 72;
const FORMAT_KEY = 'sepesa.formato';
const FORMAT_LABELS: Record<Format, string> = {
  full: 'Completa',
  '3:4': '3:4',
  '1:1': '1:1',
  '16:9': '16:9',
  pano: 'Pano',
};
const calm = window.matchMedia('(prefers-reduced-motion: reduce)');

let facing: Facing = 'environment';
let mode: Mode = 'photo';
let format: Format = 'full';
let zoom = 1;
let stream: MediaStream | null = null;
let logo: HTMLImageElement | null = null;
let recorder: VideoRecorder | null = null;
let torchOn = false;
let busy = false;
let tick = 0;
let toastTimer = 0;
let armTimer = 0;
let swapToken = 0;
let placeTold = false;
let active: HTMLElement = gate;
const shots: Shot[] = [];
let index = 0;
let mapImage: HTMLCanvasElement | null = null;
let mapKey = '';
let placeDenied = false;
let swipeX = 0;
let swipeY = 0;
let swiping = false;

function locate(): Promise<HTMLCanvasElement | null> {
  if (placeDenied || !navigator.geolocation) {
    placeDenied = true;
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: HTMLCanvasElement | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    window.setTimeout(() => finish(mapImage), 2500);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextKey = `${position.coords.latitude.toFixed(4)},${position.coords.longitude.toFixed(4)}`;
        if (mapImage && nextKey === mapKey) {
          finish(mapImage);
          return;
        }
        void buildMap(position.coords.latitude, position.coords.longitude)
          .then((canvas) => {
            mapImage = canvas;
            mapKey = nextKey;
            finish(canvas);
          })
          .catch(() => finish(mapImage));
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) placeDenied = true;
        finish(mapImage);
      },
      { enableHighAccuracy: true, maximumAge: 20000, timeout: 8000 },
    );
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** The new screen fades in over the old one. */
function show(screen: HTMLElement): void {
  for (const item of [gate, view, review]) item.classList.toggle('is-active', item === screen);
  active = screen;
}

function toast(text: string): void {
  viewError.textContent = text;
  viewError.classList.add('is-on');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(hideToast, 5000);
}

function hideToast(): void {
  window.clearTimeout(toastTimer);
  viewError.classList.remove('is-on');
}

function cameraMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'El navegador bloqueó la cámara. En el candado de la dirección, permite la cámara y vuelve a tocar Continuar.';
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

function applyPreviewTransform(): void {
  const scale = Math.max(1, zoom);
  const mirror = facing === 'user' ? 'scaleX(-1) ' : '';
  preview.style.transform = `${mirror}scale(${scale})`;
}

function setZoom(next: number): void {
  if (recorder?.running) return;
  zoom = next;
  for (const button of zoomButtons) {
    const value = Number(button.dataset.zoom);
    button.setAttribute('aria-pressed', String(value === next));
  }
  applyPreviewTransform();
}

/** The preview box takes the shape of the format, so the photo is what you see. */
function layoutFrame(): void {
  const stageW = view.clientWidth;
  const stageH = view.clientHeight;
  if (!stageW || !stageH) return;
  const box = fitFrame(formatAspect(format, stageW, stageH), stageW, stageH);
  frame.style.left = `${box.left}px`;
  frame.style.top = `${box.top}px`;
  frame.style.width = `${box.width}px`;
  frame.style.height = `${box.height}px`;
  frame.classList.toggle('is-inset', format !== 'full');
}

function toggleFormats(open: boolean): void {
  formatsRoot.classList.toggle('is-open', open);
  formatButton.setAttribute('aria-expanded', String(open));
}

function setFormat(next: Format): void {
  if (recorder?.running) return;
  format = next;
  formatLabel.textContent = FORMAT_LABELS[next];
  for (const chip of formatChips) {
    chip.setAttribute('aria-pressed', String(chip.dataset.format === next));
  }
  layoutFrame();
  try {
    window.localStorage.setItem(FORMAT_KEY, next);
  } catch {
    /* private mode: the choice lasts for this visit */
  }
}

function savedFormat(): Format {
  try {
    const value = window.localStorage.getItem(FORMAT_KEY);
    const match = FORMATS.find((item) => item === value);
    if (match) return match;
  } catch {
    /* no storage */
  }
  return 'full';
}

async function startCamera(): Promise<void> {
  stream = await replaceCamera(stream, facing);
  preview.srcObject = stream;
  applyPreviewTransform();
  await preview.play();
  torchOn = false;
  const track = videoTrack(stream);
  torchButton.hidden = !torchAvailable(track);
  torchButton.setAttribute('aria-pressed', 'false');
}

async function openView(): Promise<void> {
  gateError.hidden = true;
  openButton.disabled = true;
  gate.classList.add('is-opening');
  void locate();
  try {
    await Promise.all([ensureLogo(), startCamera()]);
    layoutFrame();
    gate.classList.add('is-leaving');
    if (!calm.matches) await wait(300);
    show(view);
    await wait(400);
    gate.classList.remove('is-leaving');
  } catch (error) {
    gateError.textContent = cameraMessage(error);
    gateError.hidden = false;
  } finally {
    gate.classList.remove('is-opening');
    openButton.disabled = false;
  }
}

function setMode(next: Mode): void {
  if (recorder?.running) return;
  mode = next;
  photoMode.setAttribute('aria-pressed', String(next === 'photo'));
  videoMode.setAttribute('aria-pressed', String(next === 'video'));
  shutter.classList.toggle('is-video', next === 'video');
  shutter.setAttribute('aria-label', next === 'photo' ? 'Tomar foto' : 'Grabar');
  hideToast();
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
  formatButton.disabled = on;
  thumbButton.disabled = on || shots.length === 0;
  for (const button of zoomButtons) button.disabled = on;
  if (on) {
    toggleFormats(false);
    elapsed.textContent = '0:00';
    tick = window.setInterval(() => {
      elapsed.textContent = formatElapsed(recorder?.elapsedMs() ?? 0);
    }, 200);
  } else {
    window.clearInterval(tick);
  }
}

function replay(element: HTMLElement, name: string): void {
  element.classList.remove(name);
  void element.offsetWidth;
  element.classList.add(name);
}

/** Small square picture of what the camera sees now, for the corner and the strip. */
function previewThumb(burnZoom: number): string {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx || !preview.videoWidth) return '';
  const crop = zoomCrop(preview.videoWidth, preview.videoHeight, 1, 1, burnZoom);
  if (facing === 'user') {
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(preview, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.7);
}

function updateThumb(): void {
  const last = shots[shots.length - 1];
  thumbButton.classList.toggle('is-empty', !last);
  thumbButton.disabled = !last || Boolean(recorder?.running);
  thumbCount.textContent = shots.length > 1 ? String(shots.length) : '';
  if (last) thumbImg.src = last.thumb;
  else thumbImg.removeAttribute('src');
}

function addShot(blob: Blob, name: string, note: string, thumb: string): void {
  shots.push({ blob, name, note, thumb, url: URL.createObjectURL(blob), isVideo: blob.type.startsWith('video/') });
  updateThumb();
  replay(thumbButton, 'is-new');
}

function disarmDelete(): void {
  window.clearTimeout(armTimer);
  deleteButton.classList.remove('is-armed');
  deleteButton.setAttribute('aria-label', 'Borrar');
}

function renderStrip(): void {
  strip.replaceChildren(
    ...shots.map((shot, at) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'strip-item';
      button.dataset.at = String(at);
      button.setAttribute('aria-label', `${shot.isVideo ? 'Video' : 'Foto'} ${at + 1} de ${shots.length}`);
      if (at === index) button.setAttribute('aria-current', 'true');
      if (shot.isVideo) button.classList.add('is-video');
      const img = document.createElement('img');
      img.alt = '';
      img.src = shot.thumb;
      button.append(img);
      return button;
    }),
  );
  strip.hidden = shots.length < 2;
  strip.querySelector<HTMLElement>('[aria-current]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function renderShot(): void {
  const shot = shots[index];
  if (!shot) return;
  disarmDelete();
  const token = ++swapToken;
  const reveal = () => {
    if (token === swapToken) reviewStage.classList.remove('is-swapping');
  };
  reviewStage.classList.add('is-swapping');
  reviewVideo.pause();
  reviewImg.hidden = shot.isVideo;
  reviewVideo.hidden = !shot.isVideo;
  if (shot.isVideo) {
    reviewVideo.addEventListener('loadeddata', reveal, { once: true });
    reviewVideo.src = shot.url;
  } else {
    reviewVideo.removeAttribute('src');
    reviewVideo.load();
    reviewImg.src = shot.url;
    reviewImg.alt = `Foto SEPESA ${shot.name}`;
    void reviewImg.decode().then(reveal, reveal);
  }
  window.setTimeout(reveal, 500);
  reviewCount.textContent = `${index + 1} de ${shots.length}`;
  reviewNote.textContent = shot.note;
  reviewNote.hidden = shot.note.length === 0;
  shareButton.hidden = typeof navigator.share !== 'function';
  renderStrip();
}

function openGallery(): void {
  if (shots.length === 0 || recorder?.running) return;
  toggleFormats(false);
  index = shots.length - 1;
  renderShot();
  show(review);
}

function closeGallery(): void {
  disarmDelete();
  reviewVideo.pause();
  show(view);
}

function step(by: number): void {
  const next = index + by;
  if (next < 0 || next >= shots.length) return;
  index = next;
  renderShot();
}

function removeShot(): void {
  if (!deleteButton.classList.contains('is-armed')) {
    deleteButton.classList.add('is-armed');
    deleteButton.setAttribute('aria-label', 'Tocar otra vez para borrar');
    armTimer = window.setTimeout(disarmDelete, 3000);
    return;
  }
  const [gone] = shots.splice(index, 1);
  if (gone) URL.revokeObjectURL(gone.url);
  updateThumb();
  if (shots.length === 0) {
    reviewVideo.removeAttribute('src');
    reviewVideo.load();
    closeGallery();
    return;
  }
  index = Math.min(index, shots.length - 1);
  renderShot();
}

function blink(): void {
  replay(flash, 'is-on');
}

async function shoot(): Promise<void> {
  if (busy || !logo || !stream) return;
  hideToast();
  toggleFormats(false);
  const burnZoom = Math.max(1, zoom);

  if (mode === 'video' && recorder?.running) {
    busy = true;
    shutter.disabled = true;
    try {
      const thumb = previewThumb(burnZoom);
      const result = await recorder.stop();
      setRecording(false);
      const notes = [
        result.silent ? SILENT_NOTE : '',
        result.mapped ? '' : PLACE_NOTE,
      ].filter((line) => line.length > 0);
      addShot(result.blob, result.name, notes.join(' '), thumb);
    } catch {
      setRecording(false);
      toast('No se pudo guardar el video. Vuelve a grabar.');
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
      const map = await locate();
      const started = await recorder.start(facing, map, burnZoom);
      setRecording(true);
      if (started.silent) toast(SILENT_NOTE);
    } catch (error) {
      recorder?.cancel();
      setRecording(false);
      toast(error instanceof BurnUnsupported
        ? 'Este navegador no puede grabar el video con el sello. Toma una foto.'
        : 'No se pudo empezar a grabar. Vuelve a intentarlo.');
    } finally {
      shutter.disabled = false;
      busy = false;
    }
    return;
  }

  busy = true;
  shutter.disabled = true;
  try {
    const map = await locate();
    const thumb = previewThumb(burnZoom);
    blink();
    const shot = await takePhoto(preview, logo, facing, map, burnZoom);
    addShot(shot.blob, shot.name, map ? '' : PLACE_NOTE, thumb);
    if (!map && !placeTold) {
      placeTold = true;
      toast(PLACE_NOTE);
    }
  } catch {
    toast('No se pudo tomar la foto. Espera un momento y vuelve a tocar el botón.');
  } finally {
    shutter.disabled = false;
    busy = false;
  }
}

function downloadFile(): void {
  const shot = shots[index];
  if (!shot) return;
  const link = document.createElement('a');
  link.href = shot.url;
  link.download = shot.name;
  link.click();
}

function downloadedInstead(): void {
  downloadFile();
  reviewNote.textContent = 'Este teléfono no guarda directo en Fotos. El archivo se descargó.';
  reviewNote.hidden = false;
}

async function shareFile(): Promise<void> {
  const shot = shots[index];
  if (!shot) return;
  const file = new File([shot.blob], shot.name, { type: shot.blob.type });
  const shareable = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  if (!shareable) {
    downloadedInstead();
    return;
  }
  try {
    await navigator.share({ files: [file], title: shot.name });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    downloadedInstead();
  }
}

async function flip(): Promise<void> {
  if (recorder?.running || busy) return;
  facing = facing === 'environment' ? 'user' : 'environment';
  flipButton.disabled = true;
  replay(flipButton, 'is-turning');
  frame.classList.add('is-switching');
  try {
    await startCamera();
    hideToast();
  } catch (error) {
    toast(cameraMessage(error));
  } finally {
    frame.classList.remove('is-switching');
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

function onSwipeStart(event: TouchEvent): void {
  swiping = false;
  if (active !== review || event.touches.length !== 1) return;
  const touch = event.touches[0];
  const box = reviewStage.getBoundingClientRect();
  // Leave the bottom of a video to its own play bar.
  if (!reviewVideo.hidden && touch.clientY > box.bottom - 72) return;
  swipeX = touch.clientX;
  swipeY = touch.clientY;
  swiping = true;
}

function onSwipeEnd(event: TouchEvent): void {
  if (!swiping) return;
  swiping = false;
  const touch = event.changedTouches[0];
  if (!touch) return;
  const dx = touch.clientX - swipeX;
  const dy = touch.clientY - swipeY;
  if (Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.4) {
    if (dx < 0) step(1);
    else if (index > 0) step(-1);
    else closeGallery();
    return;
  }
  if (dy > SWIPE_MIN && dy > Math.abs(dx) * 1.4) closeGallery();
}

function onKey(event: KeyboardEvent): void {
  if (active !== review) return;
  if (event.key === 'ArrowLeft') step(-1);
  else if (event.key === 'ArrowRight') step(1);
  else if (event.key === 'Escape') closeGallery();
}

requestAnimationFrame(() => {
  gate.classList.add('is-ready');
});

setZoom(1);
setFormat(savedFormat());

openButton.addEventListener('click', () => void openView());
shutter.addEventListener('click', () => void shoot());
photoMode.addEventListener('click', () => setMode('photo'));
videoMode.addEventListener('click', () => setMode('video'));
flipButton.addEventListener('click', () => void flip());
torchButton.addEventListener('click', () => void toggleTorch());
formatButton.addEventListener('click', () => toggleFormats(!formatsRoot.classList.contains('is-open')));
formatsRoot.addEventListener('click', (event) => {
  const chip = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.format-chip') : null;
  const next = FORMATS.find((item) => item === chip?.dataset.format);
  if (!next) return;
  setFormat(next);
  toggleFormats(false);
});
frame.addEventListener('click', () => toggleFormats(false));
thumbButton.addEventListener('click', openGallery);
downloadButton.addEventListener('click', downloadFile);
shareButton.addEventListener('click', () => void shareFile());
retakeButton.addEventListener('click', closeGallery);
deleteButton.addEventListener('click', removeShot);
strip.addEventListener('click', (event) => {
  const item = event.target instanceof Element ? event.target.closest<HTMLElement>('.strip-item') : null;
  const at = Number(item?.dataset.at);
  if (!item || !Number.isInteger(at) || at === index) return;
  index = at;
  renderShot();
});
zoomRoot.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLButtonElement) || !target.classList.contains('zoom-btn')) return;
  const value = Number(target.dataset.zoom);
  if (!Number.isFinite(value)) return;
  setZoom(value);
});
reviewStage.addEventListener('touchstart', onSwipeStart, { passive: true });
reviewStage.addEventListener('touchend', onSwipeEnd);
reviewStage.addEventListener('touchcancel', () => {
  swiping = false;
});
window.addEventListener('keydown', onKey);
window.addEventListener('resize', layoutFrame);

window.addEventListener('pagehide', () => {
  recorder?.cancel();
  stopStream(stream);
});

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
