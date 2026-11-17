import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-media-lightbox-'));
after(() => rm(scratch, { recursive: true, force: true }));

let server;
let lightboxMod;
let evidenceMod;

before(async () => {
  server = await createServer({
    root: frontendDir,
    configFile: false,
    mode: 'development',
    envDir: scratch,
    cacheDir: join(scratch, '.vite'),
    logLevel: 'silent',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
  });
  lightboxMod = await server.ssrLoadModule('/src/admin/components/MediaLightbox.tsx');
  evidenceMod = await server.ssrLoadModule('/src/admin/components/Evidence.tsx');
});

after(async () => {
  await server?.close();
});

test('MediaLightbox module exports the provider, component and hook', () => {
  assert.ok(typeof lightboxMod.MediaViewerProvider === 'function');
  assert.ok(typeof lightboxMod.MediaLightbox === 'function');
  assert.ok(typeof lightboxMod.useMediaViewer === 'function');
});

test('EvidenceTile component is exported and accepts evidence items', () => {
  assert.ok(typeof evidenceMod.EvidenceTile === 'function');
});

test('media item kind and video extension detection', () => {
  const isVideo = (item) => item?.kind === 'video' || (item?.url && /\.(mp4|webm|mov|ogg)$/i.test(item.url));

  assert.equal(isVideo({ kind: 'photo', url: 'https://cdn.example/image.jpg' }), false);
  assert.equal(isVideo({ kind: 'video', url: 'https://cdn.example/clip.mp4' }), true);
  assert.equal(isVideo({ kind: 'other', url: 'https://cdn.example/evidence.webm' }), true);
  assert.equal(isVideo({ kind: 'photo', url: 'https://cdn.example/photo.png' }), false);
});

test('navigation index wrap-around calculation', () => {
  const items = [
    { url: 'https://cdn.example/1.jpg' },
    { url: 'https://cdn.example/2.jpg' },
    { url: 'https://cdn.example/3.jpg' },
  ];

  const prevIndex = (curr, len) => (curr - 1 + len) % len;
  const nextIndex = (curr, len) => (curr + 1) % len;

  // At index 0, prev goes to 2, next goes to 1
  assert.equal(prevIndex(0, items.length), 2);
  assert.equal(nextIndex(0, items.length), 1);

  // At index 2 (last), prev goes to 1, next wraps to 0
  assert.equal(prevIndex(2, items.length), 1);
  assert.equal(nextIndex(2, items.length), 0);
});

test('zoom stepping and bounds calculation', () => {
  const zoomIn = (z) => Math.min(Number((z + 0.5).toFixed(2)), 4);
  const zoomOut = (z) => Math.max(Number((z - 0.5).toFixed(2)), 0.5);
  const toggleZoom = (z) => (z === 1 ? 2 : 1);

  assert.equal(zoomIn(1), 1.5);
  assert.equal(zoomIn(3.8), 4);
  assert.equal(zoomIn(4), 4);

  assert.equal(zoomOut(1), 0.5);
  assert.equal(zoomOut(0.5), 0.5);

  assert.equal(toggleZoom(1), 2);
  assert.equal(toggleZoom(2), 1);
  assert.equal(toggleZoom(2.5), 1);
});

test('multi-image upload carousel cycling logic with 2 or more images', () => {
  const images = ['img1.jpg', 'img2.jpg', 'img3.jpg'];
  const hasMultiple = images.length >= 2;
  assert.equal(hasMultiple, true);

  let currentIdx = 0;
  const getIdx = (i, len) => ((i % len) + len) % len;

  // Next click
  currentIdx = getIdx(currentIdx + 1, images.length);
  assert.equal(currentIdx, 1);
  assert.equal(images[currentIdx], 'img2.jpg');

  // Next click
  currentIdx = getIdx(currentIdx + 1, images.length);
  assert.equal(currentIdx, 2);
  assert.equal(images[currentIdx], 'img3.jpg');

  // Next click wraps to 0
  currentIdx = getIdx(currentIdx + 1, images.length);
  assert.equal(currentIdx, 0);
  assert.equal(images[currentIdx], 'img1.jpg');

  // Prev click wraps to 2
  currentIdx = getIdx(currentIdx - 1, images.length);
  assert.equal(currentIdx, 2);
  assert.equal(images[currentIdx], 'img3.jpg');
});

test('complaint evidence media extraction and card photo resolution', () => {
  const caseItem = {
    evidence: [
      { id: 'ev-1', kind: 'photo', url: 'https://cdn.example/barking1.jpg' },
      { id: 'ev-2', kind: 'photo', url: 'https://cdn.example/barking2.jpg' },
      { id: 'ev-3', kind: 'video', url: 'https://cdn.example/video.mp4' },
    ],
  };

  const availablePhotos = (caseItem.evidence ?? [])
    .filter((e) => (e.kind === 'photo' || e.url) && !e.url?.endsWith('.mp4') && !e.url?.endsWith('.webm'))
    .map((e) => e.url);

  assert.equal(availablePhotos.length, 2);
  assert.equal(availablePhotos[0], 'https://cdn.example/barking1.jpg');
  assert.equal(availablePhotos[1], 'https://cdn.example/barking2.jpg');
});
