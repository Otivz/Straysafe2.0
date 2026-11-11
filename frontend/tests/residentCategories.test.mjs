// What the Resident Report screens offer, and how each choice maps to the six kinds of report the subdivision works with
// (src/resident/data/entries.ts, data/constants.ts, live/adapters.ts acceptingFrom). Pure data: no browser, no network.
// Run from the frontend folder:   node --test tests/residentCategories.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATEGORIES, PET_TYPE_IDS } from '../src/resident/data/constants.ts';
import {
  ENTRIES, ENTRY_IDS, SITUATIONS, SITUATION_QUESTION, accepts, carryOver, entryOf, offeredEntries, offeredSituations,
} from '../src/resident/data/entries.ts';
import { acceptingFrom } from '../src/resident/live/adapters.ts';

const SIX = ['lost_pet', 'found_animal', 'nuisance', 'safety', 'injured', 'other'];
const ALL_ON = Object.fromEntries(SIX.map((f) => [f, true]));
const without = (...off) => ({ ...ALL_ON, ...Object.fromEntries(off.map((f) => [f, false])) });

test('the first Report screen has the three approved entries, in order, in plain words', () => {
  assert.deepEqual(ENTRY_IDS, ['lost_pet', 'complaint', 'animal']);
  assert.deepEqual(ENTRY_IDS.map((id) => [ENTRIES[id].title, ENTRIES[id].blurb]), [
    ['Lost pet', 'My pet is missing.'],
    ['Animal complaint', 'An animal is causing a problem.'],
    ['Report an animal', 'I saw an animal that may need attention.'],
  ]);
});

test('"Report an animal" asks the approved question with the four approved answers, each filed as one existing kind of report', () => {
  assert.equal(SITUATION_QUESTION, 'What’s happening with the animal?');
  assert.deepEqual(SITUATIONS.map((s) => [s.title, s.family]), [
    ['It looks lost or has no owner nearby', 'found_animal'],
    ['It is hurt or needs help', 'injured'],
    ['It may be dangerous', 'safety'],
    ['Something else, or I’m not sure', 'other'],
  ]);
});

test('the six internal kinds keep their identifiers and each is reachable through exactly one entry', () => {
  assert.deepEqual(Object.keys(CATEGORIES), SIX);
  const reach = ENTRY_IDS.flatMap((id) => ENTRIES[id].families);
  assert.deepEqual([...reach].sort(), [...SIX].sort(), 'every kind is offered once, none twice');
  assert.deepEqual(ENTRIES.lost_pet.families, ['lost_pet']);
  assert.deepEqual(ENTRIES.complaint.families, ['nuisance']);
  for (const family of SIX) assert(ENTRY_IDS.includes(entryOf(family)), `${family} belongs to an entry`);
  assert.deepEqual(SIX.map(entryOf), ['lost_pet', 'animal', 'complaint', 'animal', 'animal', 'animal']);
});

test('the kinds still behave as before: the form each one opens is unchanged', () => {
  assert.deepEqual(SIX.map((f) => CATEGORIES[f].kind), ['lost', 'found', 'incident', 'incident', 'incident', 'incident']);
  assert.deepEqual(SIX.map((f) => CATEGORIES[f].private), [false, false, true, true, true, true]);
});

test('no technical wording in what a resident reads', () => {
  const words = [
    ...ENTRY_IDS.flatMap((id) => [ENTRIES[id].title, ENTRIES[id].blurb, ENTRIES[id].filter]),
    ...SITUATIONS.map((s) => s.title), SITUATION_QUESTION, ...SIX.map((f) => CATEGORIES[f].label),
  ].join(' | ');
  for (const bad of ['unidentified', 'nuisance', 'distressed', 'safety concern', 'incident', 'categor']) assert(!words.toLowerCase().includes(bad), `"${bad}" in: ${words}`);
  assert.equal(new Set(SIX.map((f) => CATEGORIES[f].label)).size, 6, 'six different labels');
});

test('only what the subdivision accepts is offered; an answer that has not been read offers nothing', () => {
  assert.deepEqual(offeredEntries(ALL_ON), ['lost_pet', 'complaint', 'animal']);
  assert.deepEqual(offeredSituations(ALL_ON).map((s) => s.family), ['found_animal', 'injured', 'safety', 'other']);
  assert.deepEqual(offeredEntries(undefined), [], 'not read yet, or it could not be read');
  assert.deepEqual(offeredSituations(undefined), []);
  assert.deepEqual(offeredEntries({}), [], 'a kind the server did not mention is not a yes');
  assert.equal(accepts(undefined, 'lost_pet'), false);
});

test('switching kinds off hides exactly those entries and options', () => {
  assert.deepEqual(offeredEntries(without('lost_pet')), ['complaint', 'animal']);
  assert.deepEqual(offeredEntries(without('nuisance')), ['lost_pet', 'animal']);
  assert.deepEqual(offeredSituations(without('injured')).map((s) => s.family), ['found_animal', 'safety', 'other']);
  assert.deepEqual(offeredEntries(without('injured')), ['lost_pet', 'complaint', 'animal'], 'the parent stays while one option is left');
  assert.deepEqual(offeredEntries(without('found_animal', 'injured', 'safety')), ['lost_pet', 'complaint', 'animal']);
  assert.deepEqual(offeredSituations(without('found_animal', 'injured', 'safety')).map((s) => s.family), ['other']);
});

test('"Report an animal" disappears when all four of its kinds are off, and the rest of the screen remains', () => {
  const none = without('found_animal', 'injured', 'safety', 'other');
  assert.deepEqual(offeredEntries(none), ['lost_pet', 'complaint']);
  assert.deepEqual(offeredSituations(none), []);
  assert.deepEqual(offeredEntries(Object.fromEntries(SIX.map((f) => [f, false]))), [], 'everything off: the screen explains that nothing is taken');
});

test('what is accepted comes from the Leader\'s switch and a stored category to file under', () => {
  const answer = (rows) => ({ categories: rows.map(([id, category_id, enabled]) => ({ id, category_id, label: id, enabled })) });
  assert.deepEqual(acceptingFrom(answer([['lost_pet', 6, true], ['found_animal', 7, true], ['nuisance', 8, false], ['safety', null, true], ['injured', 10, true]])),
    { lost_pet: true, found_animal: true, nuisance: false, safety: false, injured: true });
  assert.deepEqual(acceptingFrom(answer([])), {});
});

const draft = (over = {}) => ({
  kind: 'incident', category: 'nuisance', animalType: 'dog', petId: 'p1', petName: 'Mochi', description: 'A tan dog keeps knocking over the bins by Gate 3.',
  observedAt: '2026-11-10T18:30', location: { label: 'Gate 3', lat: 14.8, lng: 121, manual: false }, extra: 'Often',
  media: [
    { id: 'm1', name: 'a.jpg', kind: 'photo', size: 1 }, { id: 'm2', name: 'b.mp4', kind: 'video', size: 2 },
    { id: 'm3', name: 'c.jpg', kind: 'photo', size: 1 }, { id: 'm4', name: 'd.jpg', kind: 'photo', size: 1 }, { id: 'm5', name: 'e.jpg', kind: 'photo', size: 1 },
  ],
  ...over,
});

test('when a kind is switched off mid-report, what was written is carried to the kind chosen instead', () => {
  const from = draft();
  const toIncident = carryOver(from, 'other');
  assert.deepEqual([toIncident.description, toIncident.observedAt, toIncident.location, toIncident.animalType], [from.description, from.observedAt, from.location, 'dog']);
  assert.equal(toIncident.media.length, 5, 'photos and videos both fit a general report');
  assert.deepEqual(Object.keys(toIncident).sort(), ['animalType', 'description', 'location', 'media', 'observedAt'], 'nothing else is carried: not the pet, not the old extra answer');
  const toFound = carryOver(from, 'found_animal');
  assert.deepEqual(toFound.media.map((m) => m.id), ['m1', 'm3', 'm4'], 'a found report takes up to three photos and no videos');
  const toLost = carryOver(from, 'lost_pet');
  assert.deepEqual(toLost, { observedAt: from.observedAt, location: from.location }, 'a lost report is about one registered pet: only when and where is carried into it, never the text or the animal of another report');
  assert.deepEqual(PET_TYPE_IDS, ['dog', 'cat'], 'only dogs and cats can be registered for now');
});
