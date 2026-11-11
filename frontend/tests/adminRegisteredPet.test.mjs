// The Leader's view of the registered pet behind a Lost Pet report: what the case screen is given (the registry record, the same record
// as it was when the report was filed, the registered owner, the last-seen details), the states that are not a plain pet (an older
// report with no pet, a removed or another subdivision's record, an office record with no account), the wording that keeps "the reporter
// named this pet" apart from "the team confirmed the animal", and the office's request that asks a resident to confirm a pet record.
// The REAL adapters, constants and action runner are loaded by Vite; the API is stubbed: no browser, no network, no backend.
// Run from the frontend folder:   node --test tests/adminRegisteredPet.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-leader-pet-'));
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
let constants;
let actions;
let adminApi;
let rootApi;
let errors;
before(async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { pathname: '/admin-app/cases', protocol: 'http:' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
  server = await createServer({
    root: frontendDir, configFile: false, mode: 'development', envDir: scratch, cacheDir: join(scratch, '.vite'), logLevel: 'silent', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null },
  });
  ad = await server.ssrLoadModule('/src/admin/live/adapters.ts');
  constants = await server.ssrLoadModule('/src/admin/data/constants.ts');
  actions = await server.ssrLoadModule('/src/admin/live/actions.ts');
  adminApi = (await server.ssrLoadModule('/src/admin/live/api.ts')).adminApi;
  rootApi = (await server.ssrLoadModule('/src/utils/api.ts')).api;
  errors = await server.ssrLoadModule('/src/preview/lib/errors.ts');
});
after(async () => { await server?.close(); });

const NOW = new Date('2026-11-11T04:00:00.000Z');
const resident = { id: '7', name: 'Rita Reporter', unit: 'Blk 4 Lot 12', street: 'Molave St.', phone: '0917 123 4567', email: 'rita@example.test', status: 'active', joinedAt: '', lastActiveAt: '', petIds: [] };
const lookup = { nameOf: (id) => (id === 7 ? 'Rita Reporter' : undefined), resident: (id) => (id === 7 ? resident : undefined), refOf: (reportId) => `SS-2026-${String(reportId).padStart(4, '0')}` };

const facts = (over = {}) => ({
  pet_id: 31, reference_code: 'PET-0031', name: 'Mochi', species: 'Dog', breed: 'Shih Tzu', sex: 'Male', color: 'White, gold', markings: 'Pink collar', age: '3 years',
  photos: ['https://img.test/mochi-1.jpg', 'https://img.test/mochi-2.jpg'], registered_at: '2026-10-01T09:30:00', registered_by_user_id: 7, registered_by_name: 'Rita Reporter',
  declared_by_owner: true, owner_id: 7, owner_name: 'Rita Reporter', ...over,
});
const casePet = (over = {}) => ({
  pet_id: 31, available: true, linked_by_reporter: true, reporter_is_owner: true,
  registry: { ...facts({ color: 'White, gold, brown patch' }), status: 'Active', updated_at: '2026-11-05T10:00:00' },
  registration: { declared_by_owner: true, registered_at: '2026-10-01T09:30:00', registered_by_name: 'Rita Reporter', verified: false },
  owner: { user_id: 7, name: 'Rita Reporter', phone: '0917 123 4567', email: 'rita@example.test', address: 'Blk 4 Lot 12, Molave St.', status: 'Active', emergency_contact_name: 'Tito Reporter', emergency_contact_phone: '0918 000 1111' },
  as_reported: facts(), snapshot_taken_at: '2026-11-10T19:00:00', changed_since_report: ['colour'],
  last_seen: {
    as_filed: { at: '2026-11-10T18:30:00', location: 'Gate 2', latitude: 14.8008, longitude: 121.0036 },
    notice: { at: '2026-11-10T18:45:00', location: 'Gate 3', latitude: null, longitude: null, status: 'requested' },
  },
  ...over,
});

const summary = (over = {}) => ({
  report_id: 158, reported_at: '2026-11-10T19:00:00', updated_at: '2026-11-10T19:00:00', last_event: null, subdivision_id: 1, case_status: 'reported', priority: 'high', is_sensitive: false,
  category: { category_id: 6, name: 'Lost Pet', family: 'lost_pet', label: 'Lost Pet' },
  animal: { type: 'Dog', breed: 'Shih Tzu', color: 'White, gold', size: null, count: 1, description: 'Slipped out of the gate.', condition: null },
  location: { landmark: 'Gate 2', latitude: 14.8008, longitude: 121.0036 },
  reporter: { user_id: 7, name: 'Rita Reporter' }, assigned_leader_id: null, assigned_leader_name: null,
  assessment: { incident: 'not_reviewed', evidence_sufficiency: 'not_assessed', urgency: 'not_assessed', saved_at: null },
  identity_status: 'identified', ownership_status: 'unknown', ownership_owner_id: null, pet_id: 31, closure: null, reopened_count: 0, merged_into_report_id: null, photo_count: 0, thumbnail_url: null,
  ...over,
});
const detail = (over = {}) => ({
  report_id: 158, case_status: 'reported', priority: 'high', is_sensitive: false,
  category: { category_id: 6, name: 'Lost Pet', family: 'lost_pet', label: 'Lost Pet' },
  animal: { type: 'Dog', breed: 'Shih Tzu', color: 'White, gold', size: null, count: 1, description: 'Slipped out of the gate.', condition: null },
  location: { landmark: 'Gate 2', latitude: 14.8008, longitude: 121.0036 }, reported_at: '2026-11-10T19:00:00', subdivision_id: 1,
  reporter: { user_id: 7, name: 'Rita Reporter' }, assigned_leader_id: null, assigned_leader_name: null,
  assessment: { incident: 'not_reviewed', incident_basis: null, evidence_sufficiency: 'not_assessed', evidence_reviewed: [], urgency: 'not_assessed', urgency_note: null, notes: null, saved_at: null, saved_by: null, saved_by_name: null },
  identity: { status: 'identified', note: null, pet_id: 31, decided: false },
  pet: casePet(),
  ownership: { status: 'unknown', owner_user_id: null, owner_name: null, evidence: [], note: null, decided_at: null },
  closure: null, reopened_count: 0, referrals: [], followups: [], contacts: [], warnings: [], claims: [], links: [], allowed_moves: ['under_review'], can_reopen: false, warning_eligibility: { ok: false, reason: null },
  ...over,
});
const apiPet = (over = {}) => ({
  pet_id: 31, pet_name: 'Mochi', pet_type: 'Dog', breed: 'Shih Tzu', color_markings: null, primary_color: 'White', secondary_color: null, gender: 'Male', estimated_age: '3 years', birth_date: null,
  size_category: 'Small', distinctive_markings: 'Pink collar', health_condition: null, notes: null, photo_url: null, photo_front_url: null, photo_left_url: null, photo_right_url: null,
  owner_id: 7, created_at: '2026-10-01T09:30:00', is_vaccinated: null, vaccine_expiry: null, status: 'Active', ...over,
});

// ----------------------------------------------------------------------------------------------------- the registered pet panel
test('a report that names a registered pet gives the registry record, the record as reported, what changed, the owner and the last-seen details', () => {
  const p = ad.registeredPetFrom(casePet());
  assert.equal(p.petId, '31');
  assert.equal(p.unavailable, null);
  assert.equal(p.linkedByReporter, true, 'the reporter named this pet; nobody has decided yet');
  assert.equal(p.reporterIsOwner, true);
  assert.deepEqual([p.current.name, p.current.species, p.current.breed, p.current.sex, p.current.colour, p.current.markings, p.current.age, p.current.status],
    ['Mochi', 'Dog', 'Shih Tzu', 'Male', 'White, gold, brown patch', 'Pink collar', '3 years', 'Active']);
  assert.equal(p.current.photos.length, 2);
  assert.equal(p.asReported.colour, 'White, gold', 'the record as it was when the report was filed');
  assert.deepEqual(p.changedSince, ['colour']);
  assert.deepEqual([p.registration.byOwner, p.registration.registeredBy], [true, 'Rita Reporter']);
  assert.deepEqual(p.owner, { residentId: '7', name: 'Rita Reporter', phone: '0917 123 4567', email: 'rita@example.test', address: 'Blk 4 Lot 12, Molave St.', emergencyContact: 'Tito Reporter · 0918 000 1111' });
  assert.equal(p.lastSeen.where, 'Gate 2');
  assert.deepEqual([p.lastSeen.lat, p.lastSeen.lng], [14.8008, 121.0036]);
  const at = new Date(p.lastSeen.at);
  assert.deepEqual([at.getHours(), at.getMinutes()], [18, 30], 'the server\'s wall-clock time is kept');
  assert.deepEqual([p.notice.where, p.notice.status], ['Gate 3', 'requested'], 'what the community notice says is kept apart from what the report says');
});

test('registration is never presented as verification: the model carries who declared it, not a "verified" flag', () => {
  const p = ad.registeredPetFrom(casePet({ registration: { declared_by_owner: false, registered_at: '2026-10-01T09:30:00', registered_by_name: 'Leader One', verified: true } }));
  assert.deepEqual(Object.keys(p.registration).sort(), ['byOwner', 'registeredAt', 'registeredBy']);
  assert.equal(p.registration.byOwner, false);
});

test('an older report, a split case or a server that sends no pet gives no registered pet, not a blank one', () => {
  assert.equal(ad.registeredPetFrom(null), null);
  assert.equal(ad.registeredPetFrom(undefined), null);
  const base = ad.caseFromSummary(summary({ pet_id: null, identity_status: 'unidentified' }), lookup);
  assert.equal(base.registeredPet, undefined, 'a list row has not read the pet yet');
  const { pet: _omitted, ...withoutPet } = detail();
  assert.equal(ad.applyDetail(base, detail({ pet: null }), null, [], lookup).registeredPet, null);
  assert.equal(ad.applyDetail(base, withoutPet, null, [], lookup).registeredPet, null);
});

test('a pet from another subdivision shows nothing of the record or its owner; a removed record keeps what the report was filed with', () => {
  const restricted = ad.registeredPetFrom({ pet_id: 31, available: false, reason: 'restricted', as_reported: null, last_seen: { as_filed: null, notice: null } });
  assert.deepEqual([restricted.unavailable, restricted.current, restricted.owner, restricted.asReported, restricted.registration, restricted.lastSeen, restricted.notice], ['restricted', null, null, null, null, null, null]);
  const removed = ad.registeredPetFrom({ pet_id: 31, available: false, reason: 'removed', as_reported: facts(), last_seen: { as_filed: { at: '2026-11-10T18:30:00', location: 'Gate 2', latitude: null, longitude: null }, notice: null } });
  assert.equal(removed.unavailable, 'removed');
  assert.equal(removed.current, null);
  assert.equal(removed.owner, null);
  assert.equal(removed.asReported.name, 'Mochi');
  assert.deepEqual([removed.lastSeen.where, removed.lastSeen.lat], ['Gate 2', undefined], 'no pin when none was given');
});

test('an office record with no resident account is shown as that, with only the emergency contact', () => {
  const p = ad.registeredPetFrom(casePet({
    linked_by_reporter: false, reporter_is_owner: false, owner: { emergency_contact_name: 'Aling Nena', emergency_contact_phone: null },
    registration: { declared_by_owner: false, registered_at: '2026-10-01T09:30:00', registered_by_name: 'Leader One', verified: false },
  }));
  assert.deepEqual([p.owner.residentId, p.owner.name, p.owner.phone, p.owner.emergencyContact], [null, 'No resident account linked', '—', 'Aling Nena']);
  assert.deepEqual([p.registration.byOwner, p.registration.registeredBy, p.linkedByReporter], [false, 'Leader One', false]);
  assert.equal(ad.registeredPetFrom(casePet({ owner: null })).owner, null, 'no owner and no contact: nothing to show');
});

test('what the registry leaves out reads "Not recorded", and an unknown sex is not shown as a sex', () => {
  const p = ad.registeredPetFrom(casePet({ registry: { ...facts({ breed: null, color: null, markings: '', age: null, sex: 'Unknown', photos: [] }), status: null, updated_at: null }, as_reported: null, changed_since_report: [] }));
  assert.deepEqual([p.current.breed, p.current.colour, p.current.markings, p.current.age, p.current.sex], ['Not recorded', 'Not recorded', 'Not recorded', 'Not recorded', 'Not recorded']);
  assert.equal(p.current.status, 'Active');
  assert.equal(p.asReported, null, 'a report filed before the snapshot existed has nothing to compare');
});

// ----------------------------------------------------------------------------------------------- linked by the reporter vs decided
test('whether a Leader has decided the identity travels from the list row and from the opened case', () => {
  assert.equal(ad.caseFromSummary(summary({ identity_decided: false }), lookup).identity.decided, false);
  assert.equal(ad.caseFromSummary(summary({ identity_decided: true }), lookup).identity.decided, true);
  assert.equal(ad.caseFromSummary(summary(), lookup).identity.decided, undefined, 'a server that does not say is not read as "not decided"');
  const base = ad.caseFromSummary(summary(), lookup);
  assert.equal(ad.applyDetail(base, detail(), null, [], lookup).identity.decided, false);
  assert.equal(ad.applyDetail(base, detail({ identity: { status: 'identified', note: 'Guard recognised her', pet_id: 31, decided: true } }), null, [], lookup).identity.decided, true);
  assert.equal(ad.summaryFromDetail(detail()).identity_decided, false, 'a case opened by its link keeps it');
});

test('"Identity confirmed" is shown only for an identity the team decided; the reporter\'s own link reads "Linked by the reporter"', () => {
  const { identityDisplay, IDENTITY, LINKED_BY_REPORTER } = constants;
  assert.equal(identityDisplay('identified', false).label, 'Linked by the reporter');
  assert.equal(identityDisplay('identified', false), LINKED_BY_REPORTER);
  assert.equal(identityDisplay('identified', true).label, 'Identity confirmed');
  assert.equal(identityDisplay('identified', undefined).label, 'Identity confirmed', 'an older server: the status is taken as it is');
  assert.equal(identityDisplay('unidentified', false), IDENTITY.unidentified);
  assert.equal(identityDisplay('possible_match', false), IDENTITY.possible_match);
  assert.notEqual(LINKED_BY_REPORTER.tone, IDENTITY.identified.tone, 'it does not look like a confirmed identity');
});

// ----------------------------------------------------------------------------------------------------------- who entered a pet record
test('a pet record says whether the owner or the office entered it', () => {
  const byOwner = ad.petFromApi(apiPet({ registered_by_user_id: 7, registered_by_name: 'Rita Reporter' }), NOW);
  assert.deepEqual(byOwner.registeredBy, { name: 'Rita Reporter', byOwner: true, userId: '7' });
  const byOffice = ad.petFromApi(apiPet({ owner_id: null, registered_by_user_id: 2, registered_by_name: 'Leader One' }), NOW);
  assert.deepEqual(byOffice.registeredBy, { name: 'Leader One', byOwner: false, userId: '2' });
  assert.equal(byOffice.ownerId, '', 'no resident account is linked yet');
  const unknown = ad.petFromApi(apiPet(), NOW);
  assert.equal('registeredBy' in unknown, false, 'a server that does not say who entered it is not guessed at');
});

// ------------------------------------------------------------------------------------------------------- linking an office record
test('asking a resident to confirm a pet record sends the pet, the resident and how the officer checked; the registry is read again', async () => {
  const seen = [];
  const real = adminApi.assignPetOwner;
  adminApi.assignPetOwner = async (...args) => { seen.push(args); return apiPet(); };
  try {
    const result = await actions.runAction({ type: 'pet/linkOwner', petId: '31', residentId: '7', evidence: '  The phone number on the record is hers.  ' }, {});
    assert.deepEqual(seen, [[31, 7, 'The phone number on the record is hers.']]);
    assert.deepEqual(result, { cases: [], pets: true });
  } finally { adminApi.assignPetOwner = real; }
});

test('an id that is not a number never reaches the server', async () => {
  const real = adminApi.assignPetOwner;
  let called = false;
  adminApi.assignPetOwner = async () => { called = true; return apiPet(); };
  try {
    await assert.rejects(() => actions.runAction({ type: 'pet/linkOwner', petId: 'abc', residentId: '7', evidence: 'The phone number matches.' }, {}), (e) => e instanceof errors.AdminApiError && e.status === 404);
    await assert.rejects(() => actions.runAction({ type: 'pet/linkOwner', petId: '31', residentId: '', evidence: 'The phone number matches.' }, {}), (e) => e instanceof errors.AdminApiError && e.status === 404);
    assert.equal(called, false);
  } finally { adminApi.assignPetOwner = real; }
});

test('the request is one POST to the existing assign-owner endpoint: the resident in the query, the evidence in the body', async () => {
  const calls = [];
  const before = rootApi.defaults.adapter;
  rootApi.defaults.adapter = async (config) => { calls.push({ method: config.method, url: config.url, body: JSON.parse(config.data) }); return { data: apiPet(), status: 200, statusText: 'OK', headers: {}, config }; };
  try {
    await adminApi.assignPetOwner(31, 7, 'Shown the vaccination card.');
  } finally { rootApi.defaults.adapter = before; }
  assert.deepEqual(calls, [{ method: 'post', url: '/pets/31/assign-owner?owner_id=7', body: { evidence_note: 'Shown the vaccination card.' } }]);
});

test('a refusal from the server (for example a record another officer entered) reaches the screen as the server\'s own sentence', async () => {
  const real = adminApi.assignPetOwner;
  adminApi.assignPetOwner = async () => { throw new errors.AdminApiError('server', 'Access denied: You can only edit pet records that you registered.', 403); };
  try {
    await assert.rejects(() => actions.runAction({ type: 'pet/linkOwner', petId: '31', residentId: '7', evidence: 'The phone number matches.' }, {}), (e) => e.status === 403 && /only edit pet records that you registered/.test(e.message));
  } finally { adminApi.assignPetOwner = real; }
});
