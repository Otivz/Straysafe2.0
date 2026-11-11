// Lost Pet end to end, on the Resident side: what filing a missing-pet report asks the server for (no notice: the server publishes it in the
// same step), what "I may have this pet safely with me" and the conversation actions send, and how an ended notice is named. The REAL
// modules (actions, selectors) are loaded by Vite with a stubbed API: no browser, no network, no backend, no database.
// Run from the frontend folder:   node --test tests/residentLostPetFlow.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-lostpet-'));
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
});
after(async () => { await server?.close(); });

const CATEGORY = { lost_pet: 6, found_animal: 5 };
const ctxFor = (state) => ({ userId: 7, state: () => state, categoryIdOf: (family) => CATEGORY[family] ?? null, categoriesRead() {} });
const pet = { id: '12', name: 'Mochi', type: 'dog', sex: 'male', breed: 'Shih Tzu', color: 'White', ageText: '3 years', markings: [], description: '', registeredAt: '2026-10-01' };
const draft = (over = {}) => ({
  kind: 'lost', category: 'lost_pet', animalType: 'dog', petId: '12', petName: 'Mochi', description: 'Slipped out of the gate this morning.', observedAt: '2026-11-11T07:15',
  location: { label: 'Gate 2', lat: 14.8008, lng: 121.0036, manual: false }, media: [], extra: '', ...over,
});

function stubApi() {
  const sent = { created: [], alerts: [], sightings: [], coordination: [] };
  Object.assign(api, {
    createReport: async (body) => { sent.created.push(body); return { report_id: 31, created_at: '2026-11-11T07:30:00' }; },
    uploadReportMedia: async () => undefined,
    requestAlert: async (id, body) => { sent.alerts.push([id, body]); return {}; },
    submitSighting: async (id, form) => { sent.sightings.push([id, form]); return {}; },
    coordinationConsent: async (id, allow) => { sent.coordination.push(['consent', id, allow]); return {}; },
    coordinationMediation: async (id) => { sent.coordination.push(['mediation', id]); return {}; },
  });
  return sent;
}

// ------------------------------------------------------------------------------------------------------------------- filing
test('filing a missing-pet report asks for no notice (the server publishes it in the same step); a found animal still asks for its notice', async () => {
  const sent = stubApi();
  const lost = await actions.runAction({ type: 'report/submit' }, ctxFor({ draft: draft(), pets: [pet], reports: [] }));
  assert.equal(sent.created.length, 1);
  assert.equal(sent.created[0].pet_id, 12);
  assert.equal(sent.alerts.length, 0, 'nothing is asked for afterwards: a second request could only fail with "already active"');
  assert.deepEqual(lost.created, { number: 31, createdAt: '2026-11-11T07:30:00' });
  assert.equal(lost.notices, true, 'the notice is read again, because it already exists');

  await actions.runAction({ type: 'report/submit' }, ctxFor({
    draft: draft({ kind: 'found', category: 'found_animal', animalType: 'cat', petId: null, petName: '', description: 'A grey cat near Gate 2, friendly.', extra: 'In my carport' }), pets: [pet], reports: [],
  }));
  assert.equal(sent.alerts.length, 1);
  assert.equal(sent.alerts[0][1].alert_type, 'found_animal');
});

// ---------------------------------------------------------------------------------------------------------- the two kinds of report
const seen = { type: 'sighting/add', noticeId: 'alert-12', observedAt: '2026-11-11T07:15', location: { label: 'Block 6', lat: 14.8, lng: 121, manual: false }, description: 'A brown dog, calm.', onBehalf: false, photos: 0, media: [] };

test('"I may have this pet safely with me" sends its kind, the private note and the finder\'s own contact choice; an ordinary sighting sends none of them', async () => {
  const sent = stubApi();
  await actions.runAction(seen, ctxFor({}));
  await actions.runAction({ ...seen, kind: 'secured', careNote: ' In my carport ', contactChoice: 'direct' }, ctxFor({}));
  await actions.runAction({ ...seen, kind: 'secured', contactChoice: 'leader' }, ctxFor({}));
  await actions.runAction({ ...seen, kind: 'secured' }, ctxFor({}));
  const [ordinary, direct, leader, later] = sent.sightings.map(([id, form]) => [id, form]);
  assert.equal(ordinary[0], 12);
  assert.deepEqual(['sighting_type', 'care_note', 'contact_choice'].map((k) => ordinary[1].get(k)), [null, null, null], 'an ordinary sighting is just a sighting: no lead, no conversation');
  assert.deepEqual(['sighting_type', 'care_note', 'contact_choice'].map((k) => direct[1].get(k)), ['secured', 'In my carport', 'direct']);
  assert.deepEqual(['sighting_type', 'care_note', 'contact_choice'].map((k) => leader[1].get(k)), ['secured', null, 'leader']);
  assert.deepEqual(['sighting_type', 'contact_choice'].map((k) => later[1].get(k)), ['secured', null], '"decide later" sends no choice: nothing is shared until they choose');
  for (const [, form] of sent.sightings) {
    assert.equal(form.get('accuracy_confirmed'), 'true');
    assert.match(form.get('client_request_id'), /\S/, 'a double tap sends the same sighting once');
  }
});

test('a notice number that is not a Lost Pet notice is refused before anything is sent', async () => {
  const sent = stubApi();
  await assert.rejects(() => actions.runAction({ ...seen, noticeId: 'ann-7' }, ctxFor({})), /Sightings are for lost-pet and found-animal notices/);
  assert.equal(sent.sightings.length, 0);
});

test('a sighting retry retains its submission key and second-hand provenance', async () => {
  const sent = stubApi();
  const retry = { ...seen, clientRequestId: 'sighting-retry-1', onBehalf: true };
  await actions.runAction(retry, ctxFor({}));
  await actions.runAction(retry, ctxFor({}));
  assert.deepEqual(sent.sightings.map(([, form]) => [form.get('client_request_id'), form.get('on_behalf')]), [['sighting-retry-1', 'true'], ['sighting-retry-1', 'true']]);
});

// ------------------------------------------------------------------------------------------------------------------ conversations
test('agreeing to message, or asking the Subdivision Leader to help, is sent with the conversation\'s own number and reads the notices again', async () => {
  const sent = stubApi();
  const agreed = await actions.runAction({ type: 'coordination/consent', id: '3', allow: true }, ctxFor({}));
  const asked = await actions.runAction({ type: 'coordination/mediation', id: '3' }, ctxFor({}));
  assert.deepEqual(sent.coordination, [['consent', 3, true], ['mediation', 3]]);
  assert.equal(agreed.notices && asked.notices, true);
  await assert.rejects(() => actions.runAction({ type: 'coordination/mediation', id: 'abc' }, ctxFor({})));
});

// --------------------------------------------------------------------------------------------------------------------- endings
test('only the owner\'s confirmation says a missing pet is home; every other ending is "Closed"', () => {
  const lost = (over) => ({ type: 'lost_pet', status: 'closed', ...over });
  assert.equal(selectors.noticeEndedLabel(lost({ closeOutcome: 'recovered' })), 'Pet is home');
  assert.equal(selectors.noticeEndedLabel(lost({ recoveredAt: '2026-11-04T01:00' })), 'Pet is home');
  for (const outcome of ['withdrawn', 'merged', 'not_found', 'report_closed', undefined]) assert.equal(selectors.noticeEndedLabel(lost({ closeOutcome: outcome })), 'Closed');
  assert.equal(selectors.noticeEndedLabel(lost({ status: 'requested' })), 'Not published');
  assert.equal(selectors.noticeEndedLabel({ type: 'found_animal', status: 'closed' }), 'Closed');
  assert.equal(selectors.noticeEndedLabel({ type: 'found_animal', status: 'closed', closeOutcome: 'reunited' }), 'Recovered');
});
