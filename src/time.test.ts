import assert from 'node:assert/strict';
import test from 'node:test';
import { FORMATS, coverCrop, evenSize, fitFrame, formatAspect, worldPoint, zoomCrop } from './frame.ts';
import { fileName, stampLabel } from './time.ts';

const afternoon = new Date('2026-11-19T15:09:32Z');
const early = new Date('2026-01-05T04:05:00Z');

test('stamp uses Caracas time and a Spanish month', () => {
  assert.equal(stampLabel(afternoon), '19 nov 2026 · 11:09');
  assert.equal(stampLabel(early), '5 ene 2026 · 00:05');
});

test('file name is SEPESA plus the Caracas clock', () => {
  assert.equal(fileName(afternoon, 'jpg'), 'SEPESA_20261119_110932.jpg');
  assert.equal(fileName(early, 'mp4'), 'SEPESA_20260105_000500.mp4');
});

test('cover crop drops the edges the preview hides', () => {
  const wide = coverCrop(1920, 1080, 390, 844);
  assert.ok(wide.sw < 1920);
  assert.equal(wide.sh, 1080);
  assert.ok(Math.abs(wide.sx - (1920 - wide.sw) / 2) < 0.01);

  const tall = coverCrop(1080, 1920, 844, 390);
  assert.equal(tall.sw, 1080);
  assert.ok(tall.sh < 1920);
});

test('zoom crop tightens into the covered frame', () => {
  const base = coverCrop(1920, 1080, 390, 844);
  const zoomed = zoomCrop(1920, 1080, 390, 844, 2);
  assert.ok(Math.abs(zoomed.sw - base.sw / 2) < 0.01);
  assert.ok(Math.abs(zoomed.sh - base.sh / 2) < 0.01);
  assert.ok(zoomed.sx > base.sx);
  assert.deepEqual(zoomCrop(1920, 1080, 390, 844, 0.5), base);
});

test('each format gives the shape it names', () => {
  assert.equal(formatAspect('full', 390, 844), 390 / 844);
  assert.equal(formatAspect('3:4', 390, 844), 3 / 4);
  assert.equal(formatAspect('3:4', 844, 390), 4 / 3);
  assert.equal(formatAspect('1:1', 390, 844), 1);
  assert.equal(formatAspect('16:9', 390, 844), 16 / 9);
  assert.equal(formatAspect('pano', 390, 844), 3);
});

test('the frame fits the stage and keeps its shape', () => {
  assert.deepEqual(fitFrame(formatAspect('full', 390, 844), 390, 844), { left: 0, top: 0, width: 390, height: 844 });
  for (const format of FORMATS) {
    for (const [w, h] of [[390, 844], [844, 390], [360, 640]]) {
      const aspect = formatAspect(format, w, h);
      const box = fitFrame(aspect, w, h);
      assert.ok(box.width <= w && box.height <= h, `${format} fits ${w}x${h}`);
      assert.ok(box.left >= 0 && box.top >= 0);
      assert.ok(box.left + box.width <= w && box.top + box.height <= h);
      assert.ok(Math.abs(box.width / box.height - aspect) < 0.02, `${format} keeps its shape on ${w}x${h}`);
    }
  }
  const square = fitFrame(1, 390, 844);
  assert.equal(square.width, 390);
  assert.equal(square.height, 390);
  assert.ok(square.top > 0 && square.top < (844 - 390) / 2);
});

test('Caracas falls on a sensible map tile', () => {
  const point = worldPoint(10.4806, -66.9036, 16);
  assert.ok(point.x > 20580 && point.x < 20600);
  assert.ok(point.y > 30840 && point.y < 30870);
});

test('video size stays even and inside the long-edge cap', () => {
  assert.deepEqual(evenSize(4000, 3000, 1920), { width: 1920, height: 1440 });
  assert.deepEqual(evenSize(100, 101, 4096), { width: 100, height: 102 });
});
