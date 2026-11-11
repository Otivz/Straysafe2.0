// Registration-first Lost Pet reports, on the Resident side: which pets can be reported, what a lost report sends (the pet, when it was
// last seen, nothing the server builds itself), the refusals a person is told in words, the office-linked pet question, and the
// structured error detail a screen can act on. The REAL modules (selectors, actions, the HTTP error mapping) are loaded by Vite with
// a stubbed API: no browser, no network, no backend, no database.
// Run from the frontend folder:   node --test tests/residentRegistration.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-registration-'));
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
let selectors;
let actions;
let api;
let http;
before(async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { pathname: '/resident-app/home', protocol: 'http:' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
  server = await createServer({
    root: frontendDir, configFile: false, mode: 'development', envDir: scratch, cacheDir: join(scratch, '.vite'), logLevel: 'silent', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null },
  });
  selectors = await server.ssrLoadModule('/src/resident/data/selectors.ts');
  actions = await server.ssrLoadModule('/src/resident/live/actions.ts');
  api = (await server.ssrLoadModule('/src/resident/live/api.ts')).residentApi;
  http = await server.ssrLoadModule('/src/live/http.ts');
});
after(async () => { await server?.close(); });

const pet = (over = {}) => ({ id: '12', name: 'Mochi', type: 'dog', sex: 'male', breed: 'Shih Tzu', color: 'White and gold', ageText: '3 years', markings: ['pink collar'], description: '', registeredAt: '2026-10-01', ...over });
const lostReport = (over = {}) => ({ id: 'SS-2026-0031', kind: 'lost', category: 'lost_pet', status: 'reported', petId: '12', ...over });
const draft = (over = {}) => ({
  kind: 'lost', category: 'lost_pet', animalType: 'dog', petId: '12', petName: 'Mochi', description: 'Slipped out of the gate this morning.', observedAt: '2026-11-11T07:15',
  location: { label: 'Gate 2', lat: 14.8008, lng: 121.0036, manual: false }, media: [], extra: '', ...over,
});

// ------------------------------------------------------------------------------------------------------ which pets can be reported
test('every registered pet can be reported missing except a deceased one', () => {
  const state = { pets: [pet(), pet({ id: '13', name: 'Kiko', type: 'cat' }), pet({ id: '14', name: 'Old', status: 'Deceased' }), pet({ id: '15', name: 'Brownie', status: 'Lost' })], reports: [] };
  assert.deepEqual(selectors.reportablePets(state).map((p) => p.name), ['Mochi', 'Kiko', 'Brownie']);
});

test('a pet with an open lost report is shown with that report and cannot be reported again; the others stay reportable', () => {
  const state = { pets: [pet(), pet({ id: '13', name: 'Kiko', type: 'cat' })], reports: [lostReport(), lostReport({ id: 'SS-2026-0032', petId: '99' })] };
  const choices = selectors.lostPetChoices(state);
  assert.deepEqual(choices.map((c) => [c.pet.name, c.active?.id ?? null]), [['Mochi', 'SS-2026-0031'], ['Kiko', null]]);
  assert.equal(selectors.activeLostReport(state, '12').id, 'SS-2026-0031');
  assert.equal(selectors.activeLostReport(state, '13'), undefined);
});

test('a closed lost report, or a report of another kind, does not make a pet unavailable', () => {
  const state = { pets: [pet()], reports: [lostReport({ status: 'closed' }), { id: 'SS-2026-0040', kind: 'incident', category: 'nuisance', status: 'reported', petId: '12' }] };
  assert.equal(selectors.lostPetChoices(state)[0].active, undefined);
});

test('no registered pets: nothing can be reported missing', () => {
  assert.deepEqual(selectors.reportablePets({ pets: [], reports: [] }), []);
});

// ----------------------------------------------------------------------------------------------------------------- what is sent
function stubApi(overrides = {}) {
  const sent = { created: [], alerts: [], media: [], petBodies: [], answers: [] };
  const accepted = (id, enabled = true) => ({ id, category_id: { lost_pet: 6, nuisance: 8 }[id] ?? null, label: id, enabled });
  Object.assign(api, {
    categories: async () => ({ subdivision_id: 1, subdivision: { name: 'Selera Homes', city: null, office: {} }, publication: { lost_pet: 'review', found_animal: 'review' },
      categories: [accepted('lost_pet'), accepted('nuisance')] }),
    createReport: async (body) => { sent.created.push(body); return { report_id: 31, created_at: '2026-11-11T07:30:00' }; },
    uploadReportMedia: async (id, file) => { sent.media.push([id, file]); },
    requestAlert: async (id, body) => { sent.alerts.push([id, body]); return {}; },
    createPet: async (body) => { sent.petBodies.push(body); return { pet_id: 77 }; },
    updatePet: async (id, body) => { sent.petBodies.push(body); return { pet_id: id }; },
    uploadPetPhoto: async () => ({ photo_url: 'x' }),
    answerOwnership: async (id, accept, reason) => { sent.answers.push([id, accept, reason ?? null]); return {}; },
    ...overrides,
  });
  return sent;
}
const ctxFor = (state) => ({ userId: 7, state: () => state, categoryIdOf: (family) => ({ lost_pet: 6, nuisance: 8 }[family] ?? null), categoriesRead() {} });
const reportState = (d, pets = [pet()]) => ({ draft: d, pets, reports: [] });

test('a lost report names the resident\'s own registered pet and when it was last seen; the pet\'s details are not retyped', async () => {
  const sent = stubApi();
  const result = await actions.runAction({ type: 'report/submit' }, ctxFor(reportState(draft())));
  assert.equal(sent.created.length, 1);
  const body = sent.created[0];
  assert.equal(body.pet_id, 12);
  assert.match(body.last_seen_at, /^2026-11-11T07:15/);
  assert.equal(body.category_id, 6);
  assert.equal(body.animal_type, 'Dog');
  assert.equal(body.description, 'Slipped out of the gate this morning.', 'only what is about this incident: no "Pet name:" prefix');
  assert.equal(body.latitude, 14.8008);
  assert.deepEqual(result.created, { number: 31, createdAt: '2026-11-11T07:30:00' });
  assert.equal(sent.alerts.length, 0, 'the server publishes the missing-pet notice in the same step that files the report: nothing is asked for afterwards');
});

test('optional details may be empty on a lost report (a pet needs no 10-character description)', async () => {
  const sent = stubApi();
  await actions.runAction({ type: 'report/submit' }, ctxFor(reportState(draft({ description: '' }))));
  assert.equal(sent.created[0].description, '');
});

test('a lost report without a registered pet is refused in words, and nothing is sent', async () => {
  const sent = stubApi();
  for (const [d, pets] of [[draft({ petId: null, petName: '' }), [pet()]], [draft({ petId: '99' }), [pet()]], [draft(), []]]) {
    await assert.rejects(() => actions.runAction({ type: 'report/submit' }, ctxFor(reportState(d, pets))), { message: 'Register your pet first to report it missing.' });
  }
  assert.equal(sent.created.length, 0);
});

test('a report of another kind still describes the animal itself and names no pet', async () => {
  const sent = stubApi();
  const complaint = { kind: 'incident', category: 'nuisance', animalType: 'dog', petId: '12', petName: 'Mochi', description: 'A white dog howls every night behind the clubhouse.', observedAt: '2026-11-11T07:15', location: draft().location, media: [], extra: 'Often' };
  await actions.runAction({ type: 'report/submit' }, ctxFor(reportState(complaint)));
  assert.equal(sent.created[0].pet_id, null);
  assert.equal(sent.created[0].last_seen_at, undefined);
  assert.equal(sent.created[0].category_id, 8);
  await assert.rejects(() => actions.runAction({ type: 'report/submit' }, ctxFor(reportState({ ...complaint, description: 'too short' }))), { message: 'Add the animal and a description first.' });
});

test('a kind the subdivision switched off since the app last asked is explained in words, before anything is filed', async () => {
  const sent = stubApi({ categories: async () => ({ subdivision_id: 1, subdivision: { name: 'x', city: null, office: {} }, publication: { lost_pet: 'review', found_animal: 'review' }, categories: [{ id: 'lost_pet', category_id: 6, label: 'x', enabled: false }] }) });
  await assert.rejects(() => actions.runAction({ type: 'report/submit' }, ctxFor(reportState(draft()))), /isn’t accepting this kind of report right now/);
  assert.equal(sent.created.length, 0);
});

// ------------------------------------------------------------------------------------------------------- the pet registration
test('a pet is saved as a dog or a cat with its sex, and "this is a different pet" is sent only when the resident says so', async () => {
  const sent = stubApi();
  const saved = pet({ id: 'pet-new', sex: 'female', type: 'cat' });
  await actions.runAction({ type: 'pet/save', pet: saved }, ctxFor({ pets: [] }));
  await actions.runAction({ type: 'pet/save', pet: saved, confirmNew: true }, ctxFor({ pets: [] }));
  assert.equal(sent.petBodies[0].pet_type, 'Cat');
  assert.equal(sent.petBodies[0].gender, 'Female');
  assert.equal('confirm_new_pet' in sent.petBodies[0], false);
  assert.equal(sent.petBodies[1].confirm_new_pet, true);
});

test('the answer to "is this your pet?" is sent to the server, and the pets and requests are read again', async () => {
  const sent = stubApi();
  const yes = await actions.runAction({ type: 'ownership/answer', id: '5', accept: true }, ctxFor({ pets: [] }));
  const no = await actions.runAction({ type: 'ownership/answer', id: '6', accept: false, reason: 'Not mine' }, ctxFor({ pets: [] }));
  assert.deepEqual(sent.answers, [[5, true, null], [6, false, 'Not mine']]);
  assert.equal(yes.pets && yes.ownership && no.pets && no.ownership, true);
});

// ------------------------------------------------------------------------------------------------ the error a screen can act on
test('an error with a structured detail keeps its code and data; a plain sentence stays a plain error', () => {
  const axiosError = (detail) => Object.assign(new Error('Request failed'), { isAxiosError: true, response: { status: 409, data: { detail } } });
  const refused = http.toApiError(axiosError({ code: 'LOST_REPORT_EXISTS', report_id: 12, message: 'Mochi already has an active lost-pet report. Open it instead of starting another.' }));
  assert.equal(refused.message, 'Mochi already has an active lost-pet report. Open it instead of starting another.');
  assert.equal(http.errorCodeOf(refused), 'LOST_REPORT_EXISTS');
  assert.equal(refused.data.report_id, 12);
  assert.equal(refused.status, 409);
  assert.equal(refused.name, 'AdminApiError', 'still an AdminApiError, so every screen handles it as before');
  const plain = http.toApiError(axiosError('Register your pet first to report it missing.'));
  assert.equal(plain.message, 'Register your pet first to report it missing.');
  assert.equal(http.errorCodeOf(plain), undefined);
  const held = http.toApiError(axiosError({ code: 'EXISTING_PET_FOR_YOU', message: 'Your subdivision may already have registered this pet for you.', candidates: [{ pet_id: 4, pet_name: 'Brownie', pet_type: 'Dog' }] }));
  assert.equal(http.errorCodeOf(held), 'EXISTING_PET_FOR_YOU');
  assert.equal(held.data.candidates[0].pet_name, 'Brownie');
});
