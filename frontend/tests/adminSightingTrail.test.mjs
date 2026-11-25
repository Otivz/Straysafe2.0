// The sighting trail of a missing pet (src/admin/lib/sightingTrail.ts): the last-seen place, then each place a neighbour reported in the order
// they were SEEN, joined leg by leg, plus an approximate area to start looking. The REAL module (and the real distance and bearing functions)
// is loaded by Vite: no browser, no network, no backend.
// Run from the frontend folder:   node --test tests/adminSightingTrail.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-trail-'));
after(() => rm(scratch, { recursive: true, force: true }));

let server;
let T;
let geo;
before(async () => {
  server = await createServer({
    root: frontendDir, configFile: false, mode: 'development', envDir: scratch, cacheDir: join(scratch, '.vite'), logLevel: 'silent', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null },
  });
  T = await server.ssrLoadModule('/src/admin/lib/sightingTrail.ts');
  geo = await server.ssrLoadModule('/src/preview/geo.ts');
});
after(async () => { await server?.close(); });

const m = (dm) => dm / 111320;                                       // metres north -> degrees of latitude
const B = { lat: 14.8, lng: 121.0 };
const T0 = Date.parse('2026-11-24T08:00:00Z');
const at = (min) => new Date(T0 + min * 60000).toISOString();
const sg = (id, dN, min, extra = {}) => ({ id, kind: 'seen', seenAt: at(min), lat: B.lat + m(dN), lng: B.lng, review: 'unverified', ...extra });
const NOW = new Date(T0 + 3 * 3600000);
const build = (o) => T.buildTrail({ start: { ...B, at: at(0) }, sightings: [], animal: 'dog', now: NOW, open: true, ...o });

test('a calm trail: the last-seen place, then 3 sightings, joined by arrows', () => {
  const t = build({ sightings: [sg('a', 150, 30), sg('b', 300, 60), sg('c', 450, 90)] });
  assert.equal(t.stops.map((s) => s.n).join(), '0,1,2,3');
  assert.equal(t.legs.length, 3);
  assert.ok(t.legs.every((l) => l.kind === 'arrow'));
  assert.deepEqual(t.warnings, []);
  assert.equal(T.legText(t.legs[0], 'Last seen'), 'Last seen → 1: 150 m in 30 min');
});

test('the area to start looking: around the LATEST place, wider with the hours since, capped, and only on an open case', () => {
  const t = build({ sightings: [sg('a', 150, 30), sg('b', 300, 60), sg('c', 450, 90)] });
  assert.ok(Math.abs(t.zone.lat - (B.lat + m(450))) < 1e-9);
  assert.equal(t.zone.radiusM, 460);                                                   // dog: 400 + 1.5 h x 40
  assert.equal(build({ animal: 'cat', sightings: [sg('a', 100, 30)] }).zone.radiusM, 180);   // cat: 150 + 2.5 h x 10
  const old = new Date(T0 + 30 * 24 * 3600000);
  assert.equal(build({ now: old, sightings: [sg('a', 100, 30)] }).zone.radiusM, 1200);        // capped for a dog
  assert.equal(build({ now: old, animal: 'cat', sightings: [sg('a', 100, 30)] }).zone.radiusM, 400);
  assert.equal(build({ open: false, sightings: [sg('a', 100, 30)] }).zone, null);
  assert.match(t.zone.basis, /not a prediction/);
});

test('a jump: too far for the time, with a warning that names the sighting, the distance and the time', () => {
  const j = build({ sightings: [sg('a', 100, 20), sg('b', 2100, 25)] });                 // 2 km in 5 minutes
  assert.equal(j.legs[1].kind, 'jump');
  assert.equal(j.warnings.length, 1);
  assert.match(j.warnings[0], /Sighting 2/);
  assert.match(j.warnings[0], /different animal/);
  assert.match(j.warnings[0], /5 min/);
  assert.match(T.legText(j.legs[1], 'Last seen'), /far for the time/);
});

test('the speed limit is per animal; a long wait means the direction is unclear; a few metres is the same spot', () => {
  const fast = (animal) => build({ animal, sightings: [sg('a', 400, 2)] }).legs[0].kind;      // 12 km/h
  assert.equal(fast('cat'), 'jump');
  assert.equal(fast('dog'), 'arrow');
  assert.equal(build({ sightings: [sg('a', 100, 20), sg('b', 2100, 20 + 840)] }).legs[1].kind, 'unclear');   // 14 h
  assert.equal(build({ sightings: [sg('a', 10, 20)] }).legs[0].kind, 'same');
  const noTime = build({ start: { ...B, at: null }, sightings: [sg('a', 150, 30)] });
  assert.equal(noTime.stops[0].n, 0);
  assert.equal(noTime.legs[0].kind, 'unclear');
});

test('which sightings count: dismissed ones are left out (and take no number), leads are not joined, no position is skipped', () => {
  const t = build({
    sightings: [sg('d', 100, 10, { review: 'dismissed' }), sg('v', 200, 20, { review: 'verified' }), sg('l', 250, 25, { kind: 'secured' }), sg('x', 300, 40), sg('nolat', 0, 50, { lat: undefined })],
  });
  assert.equal(t.stops.map((s) => s.n).join(), '0,1,3');                              // numbers as on the map: 1 = verified, 2 = the lead, 3 = x
  assert.ok(!t.stops.some((s) => s.key === 'l' || s.key === 'nolat' || s.key === 'd'));
  assert.equal(t.stops.find((s) => s.key === 'v').verified, true);
  assert.equal(t.stops.find((s) => s.key === 'x').verified, false);
});

test('stops are ordered by the time SEEN, and a sighting older than the last-seen time is flagged', () => {
  assert.equal(build({ sightings: [sg('late', 400, 90), sg('early', 100, 30)] }).stops.map((s) => s.key).join(), 'start,early,late');
  const before = build({ start: { ...B, at: at(60) }, sightings: [sg('a', 100, 10)] });
  assert.ok(before.warnings.some((w) => /before the time the report gives/.test(w)));
});

test('nothing to draw, and bad coordinates', () => {
  const e = T.buildTrail({ start: null, sightings: [], animal: 'dog', now: NOW, open: true });
  assert.deepEqual([e.stops.length, e.legs.length, e.zone], [0, 0, null]);
  const only = build({});
  assert.equal(only.legs.length, 0);
  assert.ok(only.zone);                                                                // a missing pet with only a last-seen place still has an area to start looking
  assert.equal(T.buildTrail({ start: { lat: NaN, lng: 1, at: null }, sightings: [], animal: 'dog', now: NOW, open: true }).stops.length, 0);
});

test('the bearing (real geo function): north is 0, east is 90; metres and span read well', () => {
  assert.equal(Math.round(geo.bearingDeg(B, { lat: B.lat + 0.001, lng: B.lng })), 0);
  assert.equal(Math.round(geo.bearingDeg(B, { lat: B.lat, lng: B.lng + 0.001 })), 90);
  assert.deepEqual([T.metres(80), T.metres(1400), T.span(40), T.span(180), T.span(28 * 60)], ['80 m', '1.4 km', '40 min', '3 h', '1 d 4 h']);
});
