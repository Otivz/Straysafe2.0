// The Leader's side of the Lost Pet end-to-end workflow: what a missing-pet case is given (the notice, sightings and possible recoveries, the
// conversations the Leader was asked to help with, the recovery record), what the dashboard treats as a task (a request for help, a Barangay that
// still has to be contacted; never a missing-pet report merely for being new), the closure rules (only the owner's confirmation records a
// recovery) and what each Lost Pet action sends. The REAL adapters, selectors, constants and action runner are loaded by Vite; the API is
// stubbed: no browser, no network, no backend.
// Run from the frontend folder:   node --test tests/adminLostPet.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-leader-lostpet-'));
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
let constants;
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
  constants = await server.ssrLoadModule('/src/admin/data/constants.ts');
  actions = await server.ssrLoadModule('/src/admin/live/actions.ts');
  adminApi = (await server.ssrLoadModule('/src/admin/live/api.ts')).adminApi;
});
after(async () => { await server?.close(); });

const NOW = new Date('2026-11-11T04:00:00.000Z');
const lookup = { nameOf: (id) => ({ 9: 'Leader Lee', 7: 'Rita Reporter' })[id], resident: () => undefined, refOf: (reportId) => `SS-2026-${String(reportId).padStart(4, '0')}` };

const summary = (over = {}) => ({
  report_id: 158, reported_at: '2026-11-10T19:00:00', updated_at: '2026-11-10T19:00:00', last_event: null, subdivision_id: 1, case_status: 'reported', priority: 'normal', is_sensitive: false,
  category: { category_id: 6, name: 'Lost Pet', family: 'lost_pet', label: 'Lost Pet' },
  animal: { type: 'Dog', breed: 'Shih Tzu', color: 'White, gold', size: null, count: 1, description: 'Slipped out of the gate.', condition: null },
  location: { landmark: 'Gate 2', latitude: 14.8008, longitude: 121.0036 },
  reporter: { user_id: 7, name: 'Rita Reporter' }, assigned_leader_id: null, assigned_leader_name: null,
  assessment: { incident: 'not_reviewed', evidence_sufficiency: 'not_assessed', urgency: 'not_assessed', saved_at: null },
  identity_status: 'identified', ownership_status: 'unknown', ownership_owner_id: null, pet_id: 31, closure: null, reopened_count: 0, merged_into_report_id: null, photo_count: 0, thumbnail_url: null, ...over,
});

const sighting = (over = {}) => ({
  sighting_id: 5, sighting_type: 'seen', latitude: 14.8012, longitude: 121.0041, location_label: 'Block 6 carports', seen_at: '2026-11-11T01:00:00', submitted_at: '2026-11-11T01:05:00',
  description: 'Resting under a car.', photo_url: null, status: 'unverified', review_note: null, care_note: null, reviewed_by: null, reviewed_at: null, reported_by: 'Omar Reyes', ...over,
});
const conversation = (over = {}) => ({
  coordination_id: 3, alert_id: 12, report_id: 158, sighting_id: 6, status: 'open', mode: 'leader', owner_consent: true, finder_consent: false, mediation_requested_at: '2026-11-11T02:00:00',
  mediation_requested_by_role: 'finder', resolved_at: null, resolution_note: null,
  owner: { user_id: 7, name: 'Rita Reporter', first_name: 'Rita', phone: '0917 123 4567' }, finder: { user_id: 8, name: 'Nina Cruz', first_name: 'Nina', phone: '0918 555 0000' }, ...over,
});
const alertBlock = (over = {}) => ({
  alert: {
    alert_id: 12, report_id: 158, status: 'active', last_seen: { at: '2026-11-10T18:30:00', location: 'Gate 2', latitude: 14.8008, longitude: 121.0036 }, activated_at: '2026-11-10T19:00:00',
    closed_at: null, close_outcome: null, close_reason: null, residents_notified: 14, recovered_at: null, recovery: null,
    sightings: [sighting(), sighting({ sighting_id: 6, sighting_type: 'secured', seen_at: '2026-11-11T02:00:00', care_note: 'In my carport', reported_by: 'Nina Cruz', status: 'verified', reviewed_by: 'Leader Lee', reviewed_at: '2026-11-11T03:00:00', review_note: 'The guard saw it too.' })],
    coordinations: [conversation()], ...over,
  },
});
const detail = (over = {}) => ({
  report_id: 158, case_status: 'reported', priority: 'normal', is_sensitive: false, category: { category_id: 6, name: 'Lost Pet', family: 'lost_pet', label: 'Lost Pet' },
  animal: summary().animal, location: summary().location, reported_at: '2026-11-10T19:00:00', subdivision_id: 1, reporter: { user_id: 7, name: 'Rita Reporter' }, assigned_leader_id: null, assigned_leader_name: null,
  assessment: { incident: 'not_reviewed', incident_basis: null, evidence_sufficiency: 'not_assessed', evidence_reviewed: [], urgency: 'not_assessed', urgency_note: null, notes: null, saved_at: null, saved_by: null, saved_by_name: null },
  identity: { status: 'identified', note: null, pet_id: 31, decided: false }, pet: null, lost_pet: alertBlock(),
  ownership: { status: 'unknown', owner_user_id: null, owner_name: null, evidence: [], note: null, decided_at: null },
  closure: null, reopened_count: 0, referrals: [], followups: [], contacts: [], warnings: [], claims: [], links: [], allowed_moves: [], can_reopen: false, warning_eligibility: { ok: false, reason: null }, ...over,
});
const referral = (over = {}) => ({
  referral_id: 5, report_id: 158, org_type: 'barangay', org_name: 'Barangay Hall — Peace & Order', status: 'to_contact', is_open: true, is_urgent: false, reason: 'Asking for help looking for the pet.',
  reference_no: null, contact_method: 'other', contact_person: null, contact_detail: null, referred_at: '2026-11-11T01:00:00', referred_by: 9, referred_by_name: 'Leader Lee', external_outcome: null,
  remaining_follow_up: null, follow_up_at: null, updates: [], ...over,
});
const openCase = (summaryOver = {}, detailOver = {}) => ad.applyDetail(ad.caseFromSummary(summary(summaryOver), lookup), detail(detailOver), null, [], lookup);

// --------------------------------------------------------------------------------------------------------------- what the case is given
test('the Lost Pet picture: the notice, the sightings and possible recoveries newest first, the care note, who reviewed what, and the conversation', () => {
  const c = openCase();
  const lp = c.lostPet;
  assert.equal(lp.alertId, '12');
  assert.deepEqual([lp.notice.status, lp.notice.residentsNotified, lp.lastSeen.where, lp.lastSeen.lat], ['active', 14, 'Gate 2', 14.8008]);
  assert.deepEqual(lp.sightings.map((s) => [s.id, s.kind]), [['6', 'secured'], ['5', 'seen']], 'newest first');
  const lead = lp.sightings[0];
  assert.deepEqual([lead.careNote, lead.reportedBy, lead.review, lead.reviewedBy, lead.reviewNote], ['In my carport', 'Nina Cruz', 'verified', 'Leader Lee', 'The guard saw it too.']);
  assert.equal(lp.sightings[1].careNote, undefined, 'an ordinary sighting has no care note');
  assert.deepEqual([lp.sightings[1].lat, lp.sightings[1].lng], [14.8012, 121.0041], 'the Leader is authorised to see the exact spot');
  const x = lp.conversations[0];
  assert.deepEqual([x.mode, x.status, x.requestedBy, x.owner.name, x.owner.phone, x.finder.name, x.finder.phone], ['leader', 'open', 'finder', 'Rita Reporter', '0917 123 4567', 'Nina Cruz', '0918 555 0000']);
});

test('a missing-pet report with no notice still gets a picture; every other kind of case gets none', () => {
  const none = openCase({}, { lost_pet: { alert: null } }).lostPet;
  assert.deepEqual([none.alertId, none.notice, none.sightings, none.conversations, none.recovery], [null, null, [], [], null]);
  const nuisance = ad.applyDetail(ad.caseFromSummary(summary({ category: { category_id: 8, name: 'Nuisance', family: 'nuisance', label: 'Nuisance' } }), lookup), detail({ category: { category_id: 8, name: 'Nuisance', family: 'nuisance', label: 'Nuisance' }, lost_pet: null }), null, [], lookup);
  assert.equal(nuisance.lostPet, null);
  assert.equal(ad.caseFromSummary(summary(), lookup).lostPet, undefined, 'a list row has not read the picture yet');
});

test('a recovery names how it was confirmed and who recorded it: the owner in the app, or the Leader after a call or a visit', () => {
  const home = (recovery) => openCase({}, { lost_pet: alertBlock({ status: 'closed', close_outcome: 'recovered', closed_at: '2026-11-11T03:00:00', recovered_at: '2026-11-11T03:00:00', recovery, coordinations: [] }) }).lostPet.recovery;
  const byOwner = home({ recovered_at: '2026-11-11T03:00:00', source: 'owner_app', recorded_by: 7, confirmed_by: 7, recorded_at: '2026-11-11T03:00:05', note: null });
  assert.deepEqual([byOwner.source, byOwner.recordedBy, byOwner.note], ['owner_app', 'The owner', undefined]);
  const byLeader = home({ recovered_at: '2026-11-11T02:30:00', source: 'phone', recorded_by: 9, confirmed_by: 7, recorded_at: '2026-11-11T03:00:00', note: 'Found by the guard.' });
  assert.deepEqual([byLeader.source, byLeader.recordedBy, byLeader.note], ['phone', 'Leader Lee', 'Found by the guard.']);
  assert.equal(openCase().lostPet.recovery, null, 'a sighting or a lead never makes a recovery');
});

test('the work queue tells the dashboard who asked for help without opening every case; an opened case keeps its own record', () => {
  const base = ad.caseFromSummary(summary(), lookup);
  const queue = { followups: [], claims: [], referrals: [], warnings: [], coordinations: [{ coordination_id: 3, report_id: 158, alert_id: 12, mode: 'leader', status: 'open', requested_at: '2026-11-11T02:00:00', owner_name: 'Rita Reporter', finder_name: 'Nina Cruz' }] };
  const [merged] = ad.applyQueue([base], queue, new Set(), lookup);
  assert.deepEqual(merged.mediation.map((m) => [m.id, m.ownerName, m.finderName]), [['3', 'Rita Reporter', 'Nina Cruz']]);
  const [opened] = ad.applyQueue([base], queue, new Set([base.id]), lookup);
  assert.equal(opened.mediation, undefined);
  assert.equal(ad.applyQueue([base], { followups: [], claims: [], referrals: [], warnings: [] }, new Set(), lookup)[0].mediation, undefined, 'an older server sends no coordinations');
});

test('a Leader notification about a request for help opens that case; the notice\'s own alert id is never read as a report', () => {
  const n = (type, id) => ad.notificationFromApi({ notification_id: 4, type, title: 'Help requested', message: 'm', related_id: id, is_read: false, created_at: '2026-11-11T02:00:00+00:00' });
  assert.deepEqual([n('lost_pet_leader', 158).kind, n('lost_pet_leader', 158).caseId?.endsWith('0158')], ['help_request', true]);
  assert.equal(n('lost_pet_alert_request', 12).caseId, undefined);
});

// ------------------------------------------------------------------------------------------------------------------ the dashboard
const caseOf = (over = {}, detailOver = null) => (detailOver ? openCase(over, detailOver) : ad.caseFromSummary(summary(over), lookup));

test('a missing-pet report is not a task for being new; any other new report still is', () => {
  const lost = caseOf();
  const nuisance = caseOf({ report_id: 160, category: { category_id: 8, name: 'Nuisance', family: 'nuisance', label: 'Nuisance' } });
  const items = selectors.attentionItems([lost, nuisance], NOW);
  assert.deepEqual(items.map((i) => i.case.id), [nuisance.id], 'only the nuisance report is waiting for review');
  assert.equal(selectors.dashboardCounts([lost, nuisance], NOW).newReports, 1);
  assert.equal(selectors.dashboardCounts([lost, nuisance], NOW).missingPets, 1);
});

test('a request to help an owner and a neighbour, and a Barangay nobody has contacted, are what a missing-pet case asks of the Leader, in that order of importance', () => {
  const asked = caseOf({}, { referrals: [referral()] });                    // opened: it reads its own conversation and referral
  const queued = ad.applyQueue([ad.caseFromSummary(summary({ report_id: 161 }), lookup)], { followups: [], claims: [], referrals: [], warnings: [], coordinations: [{ coordination_id: 9, report_id: 161, alert_id: 13, mode: 'leader', status: 'open', requested_at: '2026-11-11T02:00:00', owner_name: 'Ana Owner', finder_name: 'Ben Finder' }] }, new Set(), lookup)[0];
  const unsentOnly = caseOf({ report_id: 162 }, { report_id: 162, lost_pet: alertBlock({ coordinations: [] }), referrals: [referral({ report_id: 162 })] });
  const items = selectors.attentionItems([unsentOnly, asked, queued], NOW);
  const kinds = (id) => items.find((i) => i.case.id === id).reasons.map((r) => r.kind);
  assert.deepEqual(kinds(asked.id), ['mediation', 'barangay']);
  assert.deepEqual(kinds(queued.id), ['mediation']);
  assert.deepEqual(kinds(unsentOnly.id), ['barangay']);
  assert.deepEqual(items.map((i) => i.case.id), [asked.id, queued.id, unsentOnly.id], 'a request for help outranks a Barangay that has not been contacted');
  assert.match(items.find((i) => i.case.id === queued.id).reasons[0].label, /Ana Owner and Ben Finder asked you to help them get in touch/);
  assert.equal(selectors.dashboardCounts([asked, queued, unsentOnly], NOW).mediation, 2);
});

test('a finished request is no longer a task, and neither is a closed case', () => {
  const finished = caseOf({}, { lost_pet: alertBlock({ coordinations: [conversation({ status: 'resolved', resolved_at: '2026-11-11T03:00:00', resolution_note: 'Both reached.' })] }) });
  assert.deepEqual(selectors.attentionItems([finished], NOW), []);
  assert.equal(selectors.mediationOf(finished).length, 0);
  const closed = caseOf({ case_status: 'closed' }, { case_status: 'closed' });
  assert.deepEqual(selectors.attentionItems([closed], NOW), []);
});

// ------------------------------------------------------------------------------------------------------------------------- closing
test('a missing-pet case has no manual status to move, and closing it can never say "recovered" or "withdrawn"', () => {
  const lost = caseOf();
  assert.deepEqual(selectors.allowedStatusMoves(lost), []);
  assert.deepEqual(selectors.allowedStatusMoves(caseOf({ category: { category_id: 8, name: 'Nuisance', family: 'nuisance', label: 'Nuisance' } })), ['under_review', 'in_progress'], 'other kinds keep their steps');
  const recovered = selectors.dispositionAvailability(lost, 'pet_recovered');
  assert.equal(recovered.ok, false);
  assert.match(recovered.reason, /owner’s confirmation/);
  assert.equal(selectors.dispositionAvailability(lost, 'withdrawn_by_reporter').ok, false);
  assert.equal(selectors.dispositionAvailability(lost, 'no_further_sightings').ok, true);
  assert.equal(constants.OFFERED_DISPOSITION_IDS.includes('withdrawn_by_reporter'), false, 'a withdrawal is the owner\'s own act, never offered to a Leader');
  assert.equal(constants.DISPOSITIONS.withdrawn_by_reporter.group, 'invalid', 'it still reads as "no action needed" wherever a case was closed that way');
  assert.equal(constants.REFERRAL_STATUS.to_contact.open, true);
});

// ------------------------------------------------------------------------------------------------------------------------ what is sent
const ctx = { userId: 9, subdivisionId: 1, caseOf: () => undefined, noticeOf: () => undefined, settings: () => ({}), storedSettings: () => null, residents: () => [] };
function stub(names) {
  const calls = [];
  const real = {};
  for (const n of names) { real[n] = adminApi[n]; adminApi[n] = async (...args) => { calls.push([n, ...args]); return {}; }; }
  return { calls, restore: () => Object.assign(adminApi, real) };
}

test('recording the owner\'s confirmation, reviewing a sighting and finishing a request each send exactly what the server needs, then read the case again', async () => {
  const s = stub(['recordRecovery', 'reviewSighting', 'resolveCoordination']);
  try {
    const home = await actions.runAction({ type: 'lost/recordRecovery', id: 'SS-2026-0158', alertId: '12', source: 'phone', confirmedAt: '2026-11-11T02:30:00.000Z', note: ' Found by the guard. ' }, ctx);
    const review = await actions.runAction({ type: 'lost/reviewSighting', id: 'SS-2026-0158', sightingId: '6', status: 'verified', note: '' }, ctx);
    const done = await actions.runAction({ type: 'lost/resolveConversation', id: 'SS-2026-0158', conversationId: '3', note: 'Both reached.' }, ctx);
    const [recordCall, reviewCall, resolveCall] = s.calls;
    assert.deepEqual([recordCall[0], recordCall[1], recordCall[2].source, recordCall[2].note], ['recordRecovery', 12, 'phone', 'Found by the guard.']);
    assert.match(recordCall[2].confirmed_at, /^2026-11-11T/);
    assert.deepEqual(reviewCall, ['reviewSighting', 6, 'verified', null]);
    assert.deepEqual(resolveCall, ['resolveCoordination', 3, 'Both reached.']);
    assert.deepEqual([home.cases, home.notices, home.pets], [['SS-2026-0158'], true, true], 'the notice and the pet record changed too');
    assert.deepEqual([review.cases, done.cases], [['SS-2026-0158'], ['SS-2026-0158']]);
  } finally { s.restore(); }
});

test('a recovery cannot be recorded without a notice to record it against', async () => {
  const s = stub(['recordRecovery']);
  try {
    await assert.rejects(() => actions.runAction({ type: 'lost/recordRecovery', id: 'SS-2026-0158', alertId: '', source: 'phone', confirmedAt: '2026-11-11T02:30:00.000Z' }, ctx), /could not be found/);
    assert.equal(s.calls.length, 0);
  } finally { s.restore(); }
});

test('asking for help can be written down without claiming anyone was contacted; the contact attempt is recorded later, with how and whom', async () => {
  const s = stub(['createReferral', 'updateReferral']);
  try {
    const base = { type: 'case/createReferral', id: 'SS-2026-0158', orgId: 'barangay', orgName: 'Barangay Hall — Peace & Order', reason: 'Asking for help looking for the pet.', referredAt: '2026-11-11T01:00:00.000Z', notes: '' };
    await actions.runAction({ ...base, contactPerson: 'Not recorded', contactChannel: '', contacted: false }, ctx);
    await actions.runAction({ ...base, contactPerson: 'Duty officer', contactChannel: 'Phone call' }, ctx);
    await actions.runAction({ type: 'case/updateReferral', id: 'SS-2026-0158', referralId: '5', status: 'no_response', note: 'Rang twice, nobody answered.', contact: { method: 'phone', person: 'Duty officer', detail: '0917 000 0000' } }, ctx);
    await actions.runAction({ type: 'case/updateReferral', id: 'SS-2026-0158', referralId: '5', status: 'in_progress', note: 'They are sending someone.' }, ctx);
    const [unsent, sent, attempt, plain] = s.calls;
    assert.deepEqual([unsent[2].contacted, unsent[2].contact_person, unsent[2].contact_detail], [false, null, null]);
    assert.deepEqual([sent[2].contacted, sent[2].contact_person, sent[2].contact_detail], [true, 'Duty officer', 'Phone call']);
    assert.deepEqual([attempt[3].status, attempt[3].contact_method, attempt[3].contact_person, attempt[3].contact_detail], ['no_response', 'phone', 'Duty officer', '0917 000 0000']);
    assert.equal('contact_method' in plain[3], false, 'an ordinary update records no contact attempt');
  } finally { s.restore(); }
});
