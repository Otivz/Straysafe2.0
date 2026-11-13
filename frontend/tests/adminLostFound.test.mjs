// The Leader's side of the Lost & Found possible matches: how the server's answer becomes what the screens read, which matches are waiting for a decision
// (and which are not any more), how a report is seen from either side, that a missing pet and a found animal are monitored from the start (never "a new
// report waiting for review"), and what deciding a match sends. The REAL adapters, selectors and action runner are loaded by Vite; the API is stubbed:
// no browser, no network, no backend.
// Run from the frontend folder (PowerShell):   node --test tests/adminLostFound.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-leader-lostfound-'));
after(() => rm(scratch, { recursive: true, force: true }));

class MemoryStorage {
  constructor() { this.map = new Map(); }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

let server;
let ad;
let selectors;
let actions;
let adminApi;
before(async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { pathname: '/admin-app/cases', protocol: 'http:' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
  server = await createServer({
    root: frontendDir, configFile: false, mode: 'development', envDir: scratch, cacheDir: join(scratch, '.vite'), logLevel: 'silent', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null },
  });
  ad = await server.ssrLoadModule('/src/admin/live/adapters.ts');
  selectors = await server.ssrLoadModule('/src/admin/data/selectors.ts');
  actions = await server.ssrLoadModule('/src/admin/live/actions.ts');
  adminApi = (await server.ssrLoadModule('/src/admin/live/api.ts')).adminApi;
});
after(async () => { await server?.close(); });

const NOW = new Date('2026-11-12T04:00:00.000Z');
const lookup = { nameOf: () => undefined, resident: () => undefined, refOf: (reportId) => `SS-2026-${String(reportId).padStart(4, '0')}` };

const side = (over = {}) => ({
  report_id: 158, kind: 'lost', title: 'Luna', photo_url: null, species: 'dog', breed: 'Shih Tzu', colors: ['white', 'golden'], size: 'small', features: ['a white chest'], collar: 'red collar',
  place: 'Gate 2', at: '2026-11-10T18:30:00', reported_at: '2026-11-10T19:00:00', words: 'Slipped out of the gate.', open: true,
  reporter: { user_id: 7, name: 'Rita Reporter', phone: '0917 123 4567' }, ...over,
});
const apiMatch = (id, lostId, foundId, over = {}) => ({
  match_id: id, subdivision_id: 1, lost_report_id: lostId, found_report_id: foundId, score: 80, level: 'strong', status: 'pending', reasons: ['Same colours: white and golden'],
  created_at: '2026-11-11T01:00:00', decided_at: null, decided_by: null, link_id: null, coordination_id: null,
  lost: side({ report_id: lostId }), found: side({ report_id: foundId, kind: 'found', title: 'Found white dog near Gate 2', place: 'Gate 2', words: 'Very friendly.', reporter: { user_id: 8, name: 'Nina Cruz', phone: null } }),
  coordination: null, ...over,
});
const match = (id, lostId, foundId, over = {}) => ad.matchFromApi(apiMatch(id, lostId, foundId, over), lookup);

const summary = (over = {}) => ({
  report_id: 158, reported_at: '2026-11-10T19:00:00', updated_at: '2026-11-10T19:00:00', last_event: null, subdivision_id: 1, case_status: 'reported', priority: 'normal', is_sensitive: false,
  category: { category_id: 6, name: 'Lost Pet', family: 'lost_pet', label: 'Lost Pet' },
  animal: { type: 'Dog', breed: 'Shih Tzu', color: 'White, gold', size: null, count: 1, description: 'Slipped out of the gate.', condition: null },
  location: { landmark: 'Gate 2', latitude: 14.8008, longitude: 121.0036 },
  reporter: { user_id: 7, name: 'Rita Reporter' }, assigned_leader_id: null, assigned_leader_name: null,
  assessment: { incident: 'not_reviewed', evidence_sufficiency: 'not_assessed', urgency: 'not_assessed', saved_at: null },
  identity_status: 'unidentified', ownership_status: 'unknown', ownership_owner_id: null, pet_id: null, closure: null, reopened_count: 0, merged_into_report_id: null, photo_count: 0, thumbnail_url: null, ...over,
});
const lostCase = (over = {}) => ad.caseFromSummary(summary(over), lookup);
const foundCase = (over = {}) => ad.caseFromSummary(summary({ report_id: 160, category: { category_id: 7, name: 'Found / Unidentified Animal', family: 'found_animal', label: 'Found Animal' }, ...over }), lookup);
const nuisanceCase = () => ad.caseFromSummary(summary({ report_id: 170, category: { category_id: 3, name: 'Animal Nuisance', family: 'nuisance', label: 'Animal Nuisance' } }), lookup);

// ------------------------------------------------------------------------------------------------------------------------------ the adapter
test('a possible match is read as two reports named by their case references, with the species and size in words and times as instants', () => {
  const m = ad.matchFromApi(apiMatch(42, 158, 160, {
    status: 'confirmed', decided_at: '2026-11-11T03:00:00', coordination: { coordination_id: 9, mode: 'direct', status: 'open' },
    rows: [{ key: 'when', label: 'When', lost: '2026-11-10T18:30:00', found: '', verdict: 'unknown', note: 'Time not known', reason: null }, { key: 'colors', label: 'Coat', lost: 'White', found: 'White', verdict: 'match', note: 'Same colours', reason: 'x' }],
  }), lookup);
  assert.equal(m.id, '42');
  assert.equal(m.status, 'confirmed');
  assert.deepEqual([m.lost.caseId, m.found.caseId], ['SS-2026-0158', 'SS-2026-0160']);
  assert.deepEqual([m.lost.kind, m.found.kind], ['lost', 'found']);
  assert.deepEqual([m.lost.species, m.lost.size], ['Dog', 'Small']);
  assert.equal(m.lost.reporter.phone, '0917 123 4567');
  assert.equal(m.found.reporter.phone, '—', 'a finder with no phone number is shown as not recorded, never as an empty string');
  assert.deepEqual(m.coordination, { mode: 'direct', status: 'open' });
  assert.match(m.lost.at, /^2026-11-10T\d\d:30:00\.000Z$/, 'a naive server time becomes an instant');
  assert.equal(m.rows[0].found, '', 'a time that is not known stays empty (the screen says "Not noted")');
  assert.match(m.rows[0].lost, /Z$/);
  assert.equal(m.rows[1].lost, 'White', 'only the "When" row holds times');
  assert.equal(m.createdAt !== null && m.decidedAt !== null, true);
});

test('a match that has not been opened in full has no comparison rows yet', () => {
  assert.equal(match(1, 158, 160).rows, undefined);
});

test('the notification that tells a Leader about a possible match opens the report that was just filed', () => {
  const n = ad.notificationFromApi({ notification_id: 5, type: 'lost_found_review', title: 'Possible match to review', message: 'A found animal may be a missing pet.', related_id: 160, is_read: false, created_at: '2026-11-11T01:00:00' });
  assert.equal(n.caseId, 'SS-2026-0160');
  assert.equal(n.kind, 'case_activity');
});

// ----------------------------------------------------------------------------------------------------------- what is waiting, linked, ruled out
const set = () => [
  match(1, 158, 160, { score: 90 }),                                        // pending, strong
  match(2, 158, 161, { score: 55, level: 'possible' }),                     // pending, possible
  match(3, 158, 162, { status: 'confirmed', decided_at: '2026-11-11T03:00:00' }),
  match(4, 159, 160, { status: 'rejected', score: 45, level: 'possible' }), // another missing pet, ruled out against the same found report
  match(5, 159, 163, { status: 'moot', score: 60 }),
];

test('the matches to review are the waiting ones with both reports open, strongest first', () => {
  const all = set();
  assert.deepEqual(selectors.matchesToReview(all).map((m) => m.id), ['1', '2']);
  const closed = [match(6, 158, 164, { found: { ...apiMatch(6, 158, 164).found, open: false } }), match(7, 158, 165, { lost: { ...apiMatch(7, 158, 165).lost, open: false } })];
  assert.deepEqual(selectors.matchesToReview(closed), [], 'a closed report can no longer be linked, so nothing is asked about it');
});

test('one report sees its linked reports, the matches waiting for it and the ones ruled out, from either side', () => {
  const all = set();
  const lost = selectors.matchesOf(all, 'SS-2026-0158');
  assert.deepEqual([lost.linked.map((m) => m.id), lost.waiting.map((m) => m.id), lost.ruledOut.map((m) => m.id)], [['3'], ['1', '2'], []]);
  const found = selectors.matchesOf(all, 'SS-2026-0160');
  assert.deepEqual([found.linked.map((m) => m.id), found.waiting.map((m) => m.id), found.ruledOut.map((m) => m.id)], [[], ['1'], ['4']], 'the same match appears on the found report as on the lost one');
  assert.deepEqual(selectors.matchesOf(all, 'SS-2026-0159').ruledOut.map((m) => m.id), ['4']);
  assert.equal(selectors.matchesOf(all, 'SS-2026-0159').waiting.length, 0, 'a moot match is not waiting and not ruled out: it no longer applies');
  assert.equal(selectors.partnerOf(all[0], 'SS-2026-0158').caseId, 'SS-2026-0160');
  assert.equal(selectors.partnerOf(all[0], 'SS-2026-0160').caseId, 'SS-2026-0158');
  assert.equal(selectors.relatedSummary(lost), '2 possible matches to review');
  assert.equal(selectors.relatedSummary(selectors.matchesOf(all, 'SS-2026-0162')), '1 linked');
  assert.equal(selectors.relatedSummary(selectors.matchesOf(all, 'SS-2026-0999')), 'None yet');
});

test('two references name the same report when their numbers agree, whatever year they carry', () => {
  assert.equal(selectors.sameReport('SS-2025-0158', 'SS-2026-0158'), true);
  assert.equal(selectors.sameReport('SS-2026-0158', 'SS-2026-0159'), false);
  assert.equal(selectors.matchesOf(set(), 'SS-2025-0158').waiting.length, 2);
});

// ------------------------------------------------------------------------------------------------------------------- monitored from the start
test('a missing pet and a found animal are monitored from the start: never a new report waiting for review, no status to move', () => {
  const lost = lostCase();
  const found = foundCase();
  const nuisance = nuisanceCase();
  assert.deepEqual([lost, found, nuisance].map(selectors.isLostOrFound), [true, true, false]);
  assert.equal(selectors.dashboardCounts([lost, found, nuisance], NOW).newReports, 1, 'only the nuisance report waits for review');
  const reasons = (c) => (selectors.attentionItems([c], NOW).find((i) => i.case.id === c.id)?.reasons ?? []).map((r) => r.kind);
  assert.equal(reasons(found).includes('new'), false);
  assert.equal(reasons(nuisance).includes('new'), true);
  assert.deepEqual([selectors.allowedStatusMoves(lost), selectors.allowedStatusMoves(found)], [[], []]);
  assert.notEqual(selectors.allowedStatusMoves(nuisance).length, 0);
  assert.equal(selectors.currentActivity(found, NOW), 'Monitoring');
  assert.equal(selectors.currentActivity(nuisance, NOW), 'Awaiting assessment');
});

// ------------------------------------------------------------------------------------------------------------------------------ what is sent
const ctx = { userId: 9, subdivisionId: 1, caseOf: () => undefined, noticeOf: () => undefined, settings: () => ({}), storedSettings: () => null, residents: () => [] };
function stub(answers) {
  const calls = [];
  const real = {};
  for (const [name, answer] of Object.entries(answers)) { real[name] = adminApi[name]; adminApi[name] = async (...args) => { calls.push([name, ...args]); return answer; }; }
  return { calls, restore: () => Object.assign(adminApi, real) };
}

test('confirming, ruling out and reviewing again each send the decision for that match, then read both reports and the matches again', async () => {
  const s = stub({ decideMatch: { match_id: 42, lost_report_id: 158, found_report_id: 160, status: 'confirmed' } });
  try {
    for (const decision of ['confirm', 'reject', 'reopen']) {
      const result = await actions.runAction({ type: 'match/decide', matchId: '42', decision }, ctx);
      assert.deepEqual(result.cases.map((c) => Number(c.slice(-4))), [158, 160], 'both reports are read again: a link, a history line and a conversation changed');
      assert.equal(result.matches, true);
    }
    assert.deepEqual(s.calls.map((c) => [c[0], c[1], c[2]]), [['decideMatch', 42, 'confirm'], ['decideMatch', 42, 'reject'], ['decideMatch', 42, 'reopen']]);
  } finally { s.restore(); }
});

test('a match that cannot be found sends nothing', async () => {
  const s = stub({ decideMatch: {} });
  try {
    await assert.rejects(() => actions.runAction({ type: 'match/decide', matchId: '', decision: 'confirm' }, ctx), /could not be found/i);
    assert.equal(s.calls.length, 0);
  } finally { s.restore(); }
});

test('linking a lost/found pair requests the same-animal bridge and refreshes matches and both cases', async () => {
  const s = stub({ link: {} });
  try {
    const result = await actions.runAction({ type: 'case/linkCases', id: 'SS-2026-0158', otherIds: ['SS-2026-0160'], sameAnimal: true }, ctx);
    assert.deepEqual(s.calls, [['link', 158, { report_ids: [160], link_type: 'same_animal' }]]);
    assert.deepEqual(result.cases, ['SS-2026-0158', 'SS-2026-0160']);
    assert.equal(result.matches, true);
    assert.equal(result.notifications, true);
  } finally { s.restore(); }
});

test('a real conversation message preserves its retry key and refreshes each case whose Activity the server wrote', async () => {
  const s = stub({ sendThreadMessage: { report_id: 158, related_report_id: 160 } });
  try {
    const result = await actions.runAction({ type: 'thread/send', id: 'SS-2026-0158', threadId: '9', body: ' The owner can collect the animal today. ', clientRequestId: 'message-retry-9' }, ctx);
    assert.deepEqual(s.calls, [['sendThreadMessage', 9, 'The owner can collect the animal today.', 'message-retry-9']]);
    assert.deepEqual(result.cases.map((id) => Number(id.slice(-4))), [158, 160]);
    assert.equal(result.notifications, true);
  } finally { s.restore(); }
});

test('unlinking the matched pair refreshes the closed bridge and both reports without closing either case', async () => {
  const s = stub({ unlinkMatch: { lost_report_id: 158, found_report_id: 160 } });
  try {
    const result = await actions.runAction({ type: 'match/unlink', matchId: '42' }, ctx);
    assert.deepEqual(s.calls, [['unlinkMatch', 42]]);
    assert.deepEqual(result.cases.map((id) => Number(id.slice(-4))), [158, 160]);
    assert.equal(result.matches && result.notifications, true);
  } finally { s.restore(); }
});

test('closing, reopening or recording a recovery changes which matches can still be decided, so the matches are read again', async () => {
  const s = stub({ close: {}, reopen: {}, recordRecovery: {} });
  try {
    const closed = await actions.runAction({ type: 'case/close', id: 'SS-2026-0158', disposition: 'no_further_sightings', reason: 'No sightings for a month.', followUpCheckAt: null, endOpenItems: true }, ctx);
    const reopened = await actions.runAction({ type: 'case/reopen', id: 'SS-2026-0158', reason: 'It was seen again.' }, ctx);
    const home = await actions.runAction({ type: 'lost/recordRecovery', id: 'SS-2026-0158', alertId: '12', source: 'phone', confirmedAt: '2026-11-11T02:30:00.000Z' }, ctx);
    assert.deepEqual([closed.matches, reopened.matches, home.matches], [true, true, true]);
  } finally { s.restore(); }
});
