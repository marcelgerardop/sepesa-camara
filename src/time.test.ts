import assert from 'node:assert/strict';
import test from 'node:test';
import { coverCrop, evenSize } from './frame.ts';
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

test('video size stays even and inside the long-edge cap', () => {
  assert.deepEqual(evenSize(4000, 3000, 1920), { width: 1920, height: 1440 });
  assert.deepEqual(evenSize(100, 101, 4096), { width: 100, height: 102 });
});
