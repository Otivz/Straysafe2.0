// "Watch areas" on the Leader's dashboard (src/admin/lib/watchAreas.ts): a place with several safety, injury or nuisance reports in a short time,
// by how close the pins are, with a count of different reporters, a trend, and the privacy rules. The REAL module (and the real distance function
// and hotspot clustering) is loaded by Vite: no browser, no network, no backend.
// Run from the frontend folder:   node --test tests/adminWatchAreas.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-watch-'));
after(() => rm(scratch, { recursive: true, force: true }));

let server;
let W;
let geo;
before(async () => {
  server = await createServer({
    root: frontendDir, configFile: false, mode: 'development', envDir: scratch, cacheDir: join(scratch, '.vite'), logLevel: 'silent', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null },
  });
  W = await server.ssrLoadModule('/src/admin/lib/watchAreas.ts');
  geo = await server.ssrLoadModule('/src/preview/geo.ts');           // the same module watchAreas uses: its landmarks are the ones set here
  geo.setLiveGeography({ coverage: null, landmarks: LANDMARKS });
});
after(async () => { await server?.close(); });

const m = (dm) => dm / 111320;                                    // metres north -> degrees of latitude
const B = { lat: 14.8, lng: 121.0 };
const NOW = new Date('2026-11-25T08:00:00');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
let n = 0;
const mk = (over = {}) => {
  n += 1;
  const { dN = 0, days = 1, who = `res-${n}`, ...rest } = over;
  return {
    id: `SS-2026-${String(n).padStart(4, '0')}`, title: `Case ${n}`, category: 'safety', status: 'reported', priority: 'normal', closure: null, duplicateOfReportId: null,
    reportedAt: daysAgo(days), location: { area: 'Near Clubhouse', detail: '', lat: B.lat + m(dN), lng: B.lng },
    reporter: { residentId: who, name: `Person ${who}`, phone: '' }, ...rest,
  };
};
const run = (cases) => W.computeWatchAreas(cases, NOW);
// Registered landmarks (as the connected app reads them from GET /landmarks): one at the test place, one 500 m south of it
const LANDMARKS = [{ id: 1, name: 'Clubhouse', lat: 14.8 + 20 / 111320, lng: 121.0 }, { id: 2, name: 'Main Gate', lat: 14.8 - 500 / 111320, lng: 121.0 }];

test('4 reports from 3 people within 14 days at one place is a watch area, with the place, the counts and the case ids', () => {
  const r = run([mk({ dN: 0, who: 'a' }), mk({ dN: 10, who: 'b' }), mk({ dN: 20, who: 'b', category: 'nuisance' }), mk({ dN: 30, who: 'c', category: 'injured' })]);
  assert.equal(r.areas.length, 1);
  const a = r.areas[0];
  assert.deepEqual([a.total, a.reporters, a.open, a.tier, a.area], [4, 3, 4, 'watch', 'Near Clubhouse']);
  assert.deepEqual(a.byCategory, { safety: 2, nuisance: 1, injured: 1 });
  assert.equal(a.caseIds.length, 4);
  assert.equal(W.watchLine(a), '4 reports in 14 days from 3 residents');
  assert.equal(r.unplaced, 0);
});

test('it takes at least 3 reports from at least 2 different people', () => {
  assert.equal(run([mk({ who: 'a' }), mk({ dN: 10, who: 'b' })]).areas.length, 0);                                  // 2 reports
  assert.equal(run([mk({ who: 'a' }), mk({ dN: 10, who: 'a' }), mk({ dN: 20, who: 'a' }), mk({ dN: 30, who: 'a' })]).areas.length, 0);   // one household, four reports
  assert.equal(run([mk({ who: 'a' }), mk({ dN: 10, who: 'a' }), mk({ dN: 20, who: 'b' })]).areas.length, 1);
});

test('the same person is told apart by account, else by name and number (a report taken down by phone)', () => {
  const byPhone = (name, phone, extra = {}) => mk({ reporter: { residentId: null, name, phone }, ...extra });
  assert.equal(run([byPhone('Rita', '0917 123 4567', { dN: 0 }), byPhone(' rita ', '09171234567', { dN: 10 }), byPhone('Rita', '+63 917 123 4567', { dN: 20 })]).areas.length, 0);
  assert.equal(run([byPhone('Rita', '0917 123 4567', { dN: 0 }), byPhone('Pedro', '0918 000 0000', { dN: 10 }), byPhone('Rita', '0917 123 4567', { dN: 20 })]).areas[0]?.reporters, 2);
});

test('it is about distance, not a street name: places 200 m apart are separate, and each needs its own 3', () => {
  const r = run([mk({ dN: 0, who: 'a' }), mk({ dN: 10, who: 'b' }), mk({ dN: 20, who: 'c' }), mk({ dN: 300, who: 'd' }), mk({ dN: 310, who: 'e' })]);
  assert.equal(r.areas.length, 1);
  assert.equal(r.areas[0].total, 3);
});

test('what counts: only safety, injured and nuisance; not a missing pet, a found animal or "other"', () => {
  const r = run([mk({ category: 'lost_pet', who: 'a' }), mk({ category: 'found_animal', dN: 5, who: 'b' }), mk({ category: 'other', dN: 10, who: 'c' }), mk({ category: 'safety', dN: 15, who: 'd' })]);
  assert.equal(r.areas.length, 0);
});

test('what does not count: duplicates, merged, withdrawn and invalid reports, and anything older than 14 days or in the future', () => {
  const base = [mk({ who: 'a' }), mk({ dN: 10, who: 'b' })];
  const bad = [
    mk({ dN: 20, who: 'c', closure: { outcome: 'invalid', disposition: 'duplicate_report' }, status: 'closed' }),
    mk({ dN: 25, who: 'd', duplicateOfReportId: 12 }),
    mk({ dN: 30, who: 'e', days: 20 }),
    mk({ dN: 35, who: 'f', days: -2 }),
  ];
  assert.equal(run([...base, ...bad]).areas.length, 0);
  assert.equal(run([...base, mk({ dN: 20, who: 'c' })]).areas.length, 1);
});

test('a place whose cases are all closed needs nothing now; one still open is shown, and closed ones still count in the number', () => {
  const closed = (extra) => mk({ status: 'closed', closure: { outcome: 'resolved', disposition: 'resolved_intervention' }, ...extra });
  assert.equal(run([closed({ who: 'a' }), closed({ dN: 10, who: 'b' }), closed({ dN: 20, who: 'c' })]).areas.length, 0);
  const r = run([closed({ who: 'a' }), closed({ dN: 10, who: 'b' }), mk({ dN: 20, who: 'c' })]);
  assert.deepEqual([r.areas[0].total, r.areas[0].open], [3, 1]);
});

test('"high" at 5 reports, or when an open urgent case is among them; the highest tier is listed first', () => {
  assert.equal(run([mk({ who: 'a' }), mk({ dN: 5, who: 'b' }), mk({ dN: 10, who: 'c' })]).areas[0].tier, 'watch');
  assert.equal(run([mk({ who: 'a' }), mk({ dN: 5, who: 'b' }), mk({ dN: 10, who: 'c' }), mk({ dN: 15, who: 'd' }), mk({ dN: 20, who: 'e' })]).areas[0].tier, 'high');
  const urgent = run([mk({ who: 'a' }), mk({ dN: 5, who: 'b', priority: 'urgent' }), mk({ dN: 10, who: 'c' })]).areas[0];
  assert.deepEqual([urgent.tier, urgent.urgentOpen], ['high', 1]);
  const two = run([
    mk({ dN: 0, who: 'a' }), mk({ dN: 5, who: 'b' }), mk({ dN: 10, who: 'c' }), mk({ dN: 15, who: 'd' }),
    mk({ dN: 600, who: 'e' }), mk({ dN: 605, who: 'f', priority: 'urgent' }), mk({ dN: 610, who: 'g' }),
  ]).areas;
  // the 3-case place with an urgent one is high, the 4-case place is watch: high is listed first even with fewer reports
  assert.deepEqual(two.map((x) => [x.tier, x.total]), [['high', 3], ['watch', 4]]);
});

test('the trend: how many were in the same place in the 14 days before', () => {
  const recent = [mk({ who: 'a' }), mk({ dN: 5, who: 'b' }), mk({ dN: 10, who: 'c' }), mk({ dN: 15, who: 'd' })];
  const a = run([...recent, mk({ dN: 8, who: 'e', days: 20 })]).areas[0];
  assert.deepEqual([a.total, a.previous], [4, 1]);
  assert.equal(W.watchTrend(a), 'up from 1 in the 14 days before');
  const none = run(recent).areas[0];
  assert.equal(W.watchTrend(none), 'none in the 14 days before');
  const same = run([...recent, mk({ who: 'e', days: 17 }), mk({ dN: 5, who: 'f', days: 18 }), mk({ dN: 8, who: 'g', days: 19 }), mk({ dN: 9, who: 'h', days: 20 })]).areas[0];
  assert.equal(W.watchTrend(same), null);                                            // 4 before, 4 now: not higher
  assert.equal(run([...recent, mk({ dN: 400, who: 'x', days: 20 })]).areas[0].previous, 0);   // far away does not count
});

test('the place is named from the PINS, never from what the reports typed', () => {
  // the reports all typed "Near Gate 2" or nothing useful, but the pins are next to the Clubhouse
  const typed = (d, who, area) => mk({ dN: d, who, location: { area, detail: '', lat: B.lat + m(d), lng: B.lng } });
  const r = run([typed(0, 'a', 'Near Gate 2'), typed(5, 'b', 'Near Gate 2'), typed(10, 'c', 'Location not named')]);
  assert.equal(r.areas[0].area, 'Near Clubhouse');
});

test('far from every landmark: the distance and direction from the nearest one; no landmark at all: the coordinates', () => {
  // 300 m north of the Clubhouse (and 800 m north of the Main Gate)
  const far = run([300, 305, 310].map((d, i) => mk({ dN: d, who: `f${i}` }))).areas[0];
  assert.match(far.area, /^About 2[89]0 m north of Clubhouse$/);
  // 1.5 km east of everything
  const east = (d, who) => mk({ who, location: { area: 'x', detail: '', lat: B.lat, lng: B.lng + d / 107600 } });
  assert.match(run([east(1500, 'e1'), east(1505, 'e2'), east(1510, 'e3')]).areas[0].area, /^About 1\.5 km east of Clubhouse$/);
  geo.setLiveGeography({ coverage: null, landmarks: [] });
  try {
    assert.match(run([0, 5, 10].map((d, i) => mk({ dN: d, who: `n${i}` }))).areas[0].area, /^Pinned spot 14\.800\d\d, 121\.00000$/);
  } finally {
    geo.setLiveGeography({ coverage: null, landmarks: LANDMARKS });
  }
});

test('reports with no pin are not counted, and are said to be missing', () => {
  const noPin = (who) => mk({ who, location: { area: 'Near Clubhouse', detail: '' } });
  const r = run([mk({ who: 'a' }), mk({ dN: 5, who: 'b' }), noPin('c'), noPin('d')]);
  assert.equal(r.areas.length, 0);
  assert.equal(r.unplaced, 2);
  assert.equal(run([mk({ who: 'a' }), mk({ dN: 5, who: 'b' }), mk({ dN: 10, who: 'c' }), noPin('d')]).unplaced, 1);
});

test('privacy: the result carries a place, counts and case ids only: no name, contact or text of a report', () => {
  const r = run([mk({ who: 'a', description: 'Mang Tony’s dog bit me', title: 'secret title' }), mk({ dN: 5, who: 'b' }), mk({ dN: 10, who: 'c' })]);
  const text = JSON.stringify(r);
  assert.ok(!/Person|Tony|secret|phone|0917/.test(text), text);
  assert.deepEqual(Object.keys(r.areas[0]).sort(), ['area', 'byCategory', 'caseIds', 'key', 'lat', 'lng', 'open', 'previous', 'reporters', 'tier', 'total', 'urgentOpen']);
});

test('nothing to watch is an empty result', () => {
  assert.deepEqual(run([]), { areas: [], unplaced: 0 });
});
