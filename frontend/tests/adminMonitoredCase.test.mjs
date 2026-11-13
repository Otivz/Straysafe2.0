// The page of a missing pet or a found animal (src/admin/pages/case/MonitoredCasePage.tsx) is built from a few pure functions (src/admin/data/monitored.ts):
// the animal and what happened, who to talk to, what needs the Leader (and in which order), the situation in tiles and the activity. They are loaded by Vite;
// no browser, no network, no backend.
// Run from the frontend folder (PowerShell):   node --test tests/adminMonitoredCase.test.mjs
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const frontendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = await mkdtemp(join(tmpdir(), 'straysafe-leader-monitored-'));
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
let mon;
before(async () => {
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.window = { location: { pathname: '/admin-app/cases', protocol: 'http:' }, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
  server = await createServer({
    root: frontendDir, configFile: false, mode: 'development', envDir: scratch, cacheDir: join(scratch, '.vite'), logLevel: 'silent', appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, watch: null },
  });
  ad = await server.ssrLoadModule('/src/admin/live/adapters.ts');
  mon = await server.ssrLoadModule('/src/admin/data/monitored.ts');
});
after(async () => { await server?.close(); });

const NOW = new Date('2026-11-12T04:00:00.000Z');
const ago = (hours) => new Date(NOW.getTime() - hours * 3600e3).toISOString();
const lookup = { nameOf: () => undefined, resident: () => undefined, refOf: (reportId) => `SS-2026-${String(reportId).padStart(4, '0')}` };

const summary = (over = {}) => ({
  report_id: 158, reported_at: '2026-11-12T01:00:00', updated_at: '2026-11-12T01:00:00', last_event: null, subdivision_id: 1, case_status: 'reported', priority: 'normal', is_sensitive: false,
  category: { category_id: 6, name: 'Lost Pet', family: 'lost_pet', label: 'Lost Pet' },
  animal: { type: 'Dog', breed: 'Shih Tzu', color: 'White, gold', size: 'Small', count: 1, description: 'Slipped out of the gate.', condition: null },
  location: { landmark: 'Gate 2', latitude: 14.8008, longitude: 121.0036 },
  reporter: { user_id: 7, name: 'Rita Reporter' }, assigned_leader_id: null, assigned_leader_name: null,
  assessment: { incident: 'not_reviewed', evidence_sufficiency: 'not_assessed', urgency: 'not_assessed', saved_at: null },
  identity_status: 'identified', ownership_status: 'unknown', ownership_owner_id: null, pet_id: 31, closure: null, reopened_count: 0, merged_into_report_id: null, photo_count: 0, thumbnail_url: null, ...over,
});
const LUNA = { name: 'Luna', species: 'Dog', breed: 'Shih Tzu', sex: 'Female', colour: 'White and golden', markings: 'A white chest', age: '3 years', photos: ['https://img.example/luna-1.jpg', 'https://img.example/luna-2.jpg'] };
const pet = (over = {}) => ({
  petId: '31', unavailable: null, linkedByReporter: true, reporterIsOwner: true, current: { ...LUNA, status: 'Active', updatedAt: null }, asReported: { ...LUNA }, changedSince: [], registration: null,
  owner: { residentId: '7', name: 'Rita Reporter', phone: '0917 123 4567', email: 'rita@example.test', address: 'Blk 4 Lot 12, Molave St.', emergencyContact: '' }, lastSeen: null, notice: null, ...over,
});
const lostPet = (over = {}) => ({
  alertId: '12', notice: { status: 'active', publishedAt: ago(3), closedAt: null, closeOutcome: null, closeReason: null, residentsNotified: 14 },
  lastSeen: { at: ago(4), where: 'Gate 2', lat: 14.8008, lng: 121.0036 }, sightings: [], conversations: [], recovery: null, ...over,
});
const lostCase = (over = {}) => ({ ...ad.caseFromSummary(summary(), lookup), description: 'Luna slipped out of the gate.', registeredPet: pet(), lostPet: lostPet(), ...over });
const foundCase = (over = {}) => ({
  ...ad.caseFromSummary(summary({ report_id: 160, category: { category_id: 7, name: 'Found / Unidentified Animal', family: 'found_animal', label: 'Found Animal' }, animal: { type: 'Dog', breed: null, color: 'Brown', size: 'Medium', count: 1, description: 'Wet and shaking.', condition: null }, location: { landmark: 'Clubhouse', latitude: 14.802, longitude: 121.0048 }, reporter: { user_id: 8, name: 'Owen Owner' } }), lookup),
  description: 'A brown dog with a blue collar.', ...over,
});

const side = (over = {}) => ({
  report_id: 158, kind: 'lost', title: 'Luna', photo_url: null, species: 'dog', breed: 'Shih Tzu', colors: ['white'], size: 'small', features: [], collar: null, place: 'Gate 2', at: '2026-11-12T01:00:00',
  reported_at: '2026-11-12T01:00:00', words: 'x', open: true, reporter: { user_id: 7, name: 'Rita Reporter', phone: '0917 123 4567' }, ...over,
});
const apiMatch = (id, lostId, foundId, over = {}) => ({
  match_id: id, subdivision_id: 1, lost_report_id: lostId, found_report_id: foundId, score: 80, level: 'strong', status: 'pending', reasons: ['Same colours: white', 'Both are dogs', 'Very close: about 25 m apart'],
  created_at: '2026-11-12T01:30:00', decided_at: null, decided_by: null, link_id: null, coordination_id: null,
  lost: side({ report_id: lostId }), found: side({ report_id: foundId, kind: 'found', title: 'Found white dog near Gate 2', reporter: { user_id: 8, name: 'Owen Owner', phone: '0917 999 8888' } }), coordination: null, ...over,
});
const match = (id, lostId, foundId, over = {}) => ad.matchFromApi(apiMatch(id, lostId, foundId, over), lookup);

const followUp = (over = {}) => ({ id: 'f1', kind: 'follow_up', title: 'Ask the guard', dueAt: ago(5), status: 'pending', createdAt: ago(30), createdBy: 'Lena Leader', ...over });
const referral = (over = {}) => ({ id: 'r1', orgId: 'barangay', orgName: 'Barangay Hall', reason: 'Help searching for the animal', referredAt: ago(2), contactPerson: '', contactChannel: '', status: 'to_contact', notes: [], createdBy: 'Lena Leader', updatedAt: ago(2), ...over });
const asked = { id: 'c3', requestedAt: ago(1), status: 'open', mode: 'leader', sightingId: 's9', ownerAgreed: true, finderAgreed: false, requestedBy: 'owner', owner: { residentId: '7', name: 'Rita Reporter', phone: '0917 123 4567' }, finder: { residentId: '8', name: 'Owen Owner', phone: '0917 999 8888' } };
const sighting = (over = {}) => ({ id: 's1', kind: 'seen', seenAt: ago(1), submittedAt: ago(1), place: 'Block 6 carports', description: 'Trotting along the carports.', reportedBy: 'Owen Owner', review: 'unverified', ...over });

// ------------------------------------------------------------------------------------------------------------------------------- the resting state
test('a report that was just filed asks nothing of the Leader: it is simply being monitored', () => {
  for (const c of [lostCase(), foundCase()]) {
    assert.deepEqual(mon.needsYou(c, [], NOW), [], `${c.id} needs nobody`);
  }
  const tiles = mon.situationTiles(lostCase(), [], NOW, undefined);
  assert.deepEqual(tiles.map((t) => [t.key, t.value]), [['sightings', 'None yet'], ['related', 'None'], ['notice', 'Published'], ['alerts', 'None sent'], ['barangay', 'Not asked']]);
  assert.match(tiles[2].meta, /14 notified$/, 'the notice tile says how many residents it reached');
});

test('a closed report asks for nothing and offers no action', () => {
  const c = lostCase({ status: 'closed', referrals: [referral()], lostPet: lostPet({ conversations: [asked] }) });
  assert.deepEqual(mon.needsYou(c, [match(1, 158, 160)], NOW), []);
  assert(mon.situationTiles(c, [], NOW, undefined).every((t) => !t.action), 'no action is offered on a closed report');
});

// ------------------------------------------------------------------------------------------------------------------------ what needs the Leader
test('what needs the Leader is listed most pressing first, each with the one thing to do', () => {
  const c = lostCase({
    claims: [{ id: 'k1', claimantName: 'Mia Cruz', status: 'submitted', submittedAt: ago(1), statement: 'Mine', evidence: [] }],
    followUps: [followUp()], referrals: [referral()],
    lostPet: lostPet({ conversations: [asked], sightings: [sighting({ id: 's2', kind: 'secured', description: 'She is in my carport.', place: 'Carport' })] }),
  });
  const needs = mon.needsYou(c, [match(1, 158, 160), match(2, 158, 161, { level: 'possible', score: 55, reasons: ['Both are dogs'] })], NOW);
  assert.deepEqual(needs.map((n) => n.kind), ['help', 'lead', 'match', 'claim', 'followup', 'barangay', 'match']);
  assert.deepEqual(needs.map((n) => n.action), ['Help them', 'Review', 'Review match', 'Review claim', 'Mark done', 'Record contact', 'Review match']);
  assert.deepEqual(needs[0].open, { kind: 'help', conversationId: 'c3' });
  assert.deepEqual(needs[1].open, { kind: 'reviewSighting', sightingId: 's2' });
  assert.deepEqual(needs[2].open, { kind: 'match', matchId: '1' }, 'the strong match comes before the possible one');
  assert.deepEqual(needs[5].open, { kind: 'coordination', referralId: 'r1', contact: true }, 'a call that is only written down is asked about until the attempt is recorded');
  assert.match(needs[0].title, /Rita Reporter and Owen Owner asked you to help them get in touch/);
  assert.match(needs[2].title, /Found white dog near Gate 2 may be Luna/);
  assert.match(needs[2].detail, /Strong match · Same colours: white/);
});

test('a match reads as one plain sentence, from either side', () => {
  assert.equal(mon.needsYou(lostCase(), [match(1, 158, 160)], NOW)[0].title, 'Found white dog near Gate 2 may be Luna');
  assert.equal(mon.needsYou(foundCase(), [match(1, 158, 160)], NOW)[0].title, 'This animal may be Luna', 'on the found animal itself it is not named twice');
  const unnamed = match(2, 158, 160, { lost: { ...apiMatch(2, 158, 160).lost, title: 'Missing pet' } });
  assert.equal(mon.needsYou(lostCase(), [unnamed], NOW)[0].title, 'Found white dog near Gate 2 may be a missing pet');
});

test('the records the system makes when a Leader links two reports are never shown as sightings or asked about as leads', () => {
  const link = sighting({ id: 's7', kind: 'secured', description: mon.LINK_RECORD_NOTE, reportedBy: 'Owen Owner' });
  assert.equal(mon.isLinkRecord(link), true);
  assert.equal(mon.isLinkRecord(sighting({ kind: 'secured', description: 'She is in my carport.' })), false);
  assert.equal(mon.isLinkRecord(sighting({ kind: 'seen', description: mon.LINK_RECORD_NOTE })), false, 'only a possible recovery can be one');
  const c = lostCase({ lostPet: lostPet({ sightings: [link] }) });
  assert.deepEqual(mon.needsYou(c, [], NOW), []);
  assert.equal(mon.situationTiles(c, [], NOW, undefined)[0].value, 'None yet');
});

test('a possible recovery from a neighbour is a lead until it is answered; an ordinary sighting never is', () => {
  const lead = sighting({ id: 's2', kind: 'secured', place: 'Carport' });
  assert.deepEqual(mon.needsYou(lostCase({ lostPet: lostPet({ sightings: [lead] }) }), [], NOW).map((n) => n.kind), ['lead']);
  assert.deepEqual(mon.needsYou(lostCase({ lostPet: lostPet({ sightings: [{ ...lead, review: 'verified' }] }) }), [], NOW), []);
  assert.deepEqual(mon.needsYou(lostCase({ lostPet: lostPet({ sightings: [sighting()] }) }), [], NOW), [], 'an ordinary sighting is not a task');
});

test('a match decided, ruled out or on a closed report is not asked about again', () => {
  const c = lostCase();
  assert.deepEqual(mon.needsYou(c, [match(1, 158, 160, { status: 'confirmed' }), match(2, 158, 161, { status: 'rejected' }), match(3, 158, 162, { found: { ...apiMatch(3, 158, 162).found, open: false } })], NOW), []);
});

test('a follow-up is a task only when it is due, and the Barangay only when nobody has heard from it for days', () => {
  const soon = lostCase({ followUps: [followUp({ dueAt: new Date(NOW.getTime() + 2 * 86400e3).toISOString() })] });
  assert.deepEqual(mon.needsYou(soon, [], NOW), []);
  assert.equal(mon.situationTiles(soon, [], NOW, undefined).some((t) => t.key === 'next'), true, 'it is read as "next check" instead');
  const quiet = lostCase({ referrals: [referral({ status: 'sent', updatedAt: ago(24 * 5) })] });
  const needs = mon.needsYou(quiet, [], NOW);
  assert.deepEqual(needs.map((n) => [n.kind, n.action]), [['update', 'Record update']]);
  assert.match(needs[0].title, /No update from Barangay Hall for 5 days/);
  assert.deepEqual(mon.needsYou(lostCase({ referrals: [referral({ status: 'sent', updatedAt: ago(5) })] }), [], NOW), [], 'a call made hours ago is not overdue');
  assert.deepEqual(mon.needsYou(lostCase({ referrals: [referral({ status: 'no_response', updatedAt: ago(2) })] }), [], NOW), [], 'a call that just went unanswered is not asked about again at once');
  assert.deepEqual(mon.needsYou(lostCase({ referrals: [referral({ status: 'no_response', updatedAt: ago(24 * 4) })] }), [], NOW).map((n) => n.kind), ['update'], 'but it comes back after days of silence');
  assert.deepEqual(mon.needsYou(lostCase({ referrals: [referral({ status: 'in_progress', updatedAt: ago(24 * 9) })] }), [], NOW), [], 'the Barangay working on it is not nagged');
});

// ---------------------------------------------------------------------------------------------------------------- the situation, in tiles
test('the situation is one tile per topic, and an occasional action sits on the tile it belongs to', () => {
  const calm = mon.situationTiles(foundCase(), [], NOW, undefined);
  assert.deepEqual(calm.map((t) => [t.key, t.value]), [['related', 'None'], ['notice', 'Not published'], ['alerts', 'None sent'], ['barangay', 'Not asked']]);
  assert.deepEqual(calm.filter((t) => t.action).map((t) => [t.key, t.action.label, t.action.open.kind]), [['notice', 'Publish notice', 'publishNotice'], ['alerts', 'Send an alert', 'alert'], ['barangay', 'Ask for help', 'referral']]);
  const busy = lostCase({ lostPet: lostPet({ sightings: [sighting(), sighting({ id: 's3', seenAt: ago(9) })] }), referrals: [referral({ status: 'sent' })],
    ownerContacts: [{ id: 'o1', at: ago(2), by: 'Lena Leader', method: 'phone', withWhom: 'Rita', summary: 'Spoke', outcome: 'cooperative' }] });
  const tiles = mon.situationTiles(busy, [match(1, 158, 160, { status: 'confirmed' })], NOW, undefined);
  assert.deepEqual(tiles.map((t) => [t.key, t.value]), [['sightings', '2 sightings'], ['related', 'Linked'], ['notice', 'Published'], ['alerts', 'None sent'], ['barangay', 'Sent'], ['contact', 'Rita']]);
  assert.deepEqual([tiles[0].meta, tiles[1].meta, tiles[4].meta, tiles[5].meta], ['Latest 1 h ago', 'Found white dog near Gate 2', 'Updated 2 h ago', 'Phone call · 2 h ago']);
  // a possible match still waiting is in "Needs you": its tile only says so, and offers nothing of its own
  const waiting = mon.situationTiles(lostCase(), [match(1, 158, 160)], NOW, undefined).find((t) => t.key === 'related');
  assert.deepEqual([waiting.value, waiting.action], ['1 possible match', undefined]);
});

test('notification alerts have their own tile, separate from the Community notice: what is live, when the next send is', () => {
  const alert = (over = {}) => ({
    id: '5', title: 'Still looking for Luna', message: 'Please report any sightings.', includePhoto: true, destination: 'notice', audience: 'all', status: 'active', stopReason: null,
    schedule: { mode: 'repeat', repeat: 'every', everyMinutes: 30, times: [], startAt: ago(1), endKind: 'resolved', endAt: new Date(NOW.getTime() + 14 * 86400e3).toISOString(), maxSends: null },
    nextSendAt: new Date(NOW.getTime() + 20 * 60e3).toISOString(), upcoming: [], sendsDone: 2, createdAt: ago(1), createdBy: 'Lena Leader', sends: [], ...over,
  });
  const tileOf = (c) => mon.situationTiles(c, [], NOW, undefined).find((t) => t.key === 'alerts');
  const live = tileOf(lostCase({ alerts: [alert()] }));
  assert.deepEqual([live.value, live.tone, live.action], ['1 repeating', 'brand', { label: 'Manage', open: { kind: 'alerts' } }]);
  assert.match(live.meta, /^Next send /);
  assert.deepEqual([tileOf(lostCase({ alerts: [alert({ status: 'paused', nextSendAt: null })] })).value, tileOf(lostCase({ alerts: [alert({ status: 'paused', nextSendAt: null })] })).meta], ['1 paused', 'Nothing goes out while paused']);
  assert.equal(tileOf(lostCase({ alerts: [alert({ status: 'scheduled', schedule: { ...alert().schedule, mode: 'later' }, sendsDone: 0 })] })).value, '1 scheduled');
  const ended = tileOf(lostCase({ alerts: [alert({ status: 'stopped', nextSendAt: null, sendsDone: 3 })] }));
  assert.deepEqual([ended.value, ended.action.label], ['3 sends made', 'Send another']);
  assert.equal(tileOf(lostCase({ status: 'closed', alerts: [alert({ status: 'stopped', nextSendAt: null })] })).action, undefined, 'nothing is sent about a closed report');
  // a private report sends nothing to residents: no notice tile and no alerts tile
  assert.deepEqual(mon.situationTiles(foundCase({ sensitive: true }), [], NOW, undefined).map((t) => t.key), ['related', 'barangay']);
});

test('the calm state says since when the report is monitored and when it last changed', () => {
  assert.match(mon.monitoringLine(lostCase(), NOW), /^Under monitoring since Nov 1[12], \d{1,2}:\d{2}\s[AP]M · last update /);
  assert.equal(mon.subjectEnd(lostCase()), 'Luna is home');
  assert.equal(mon.subjectEnd(foundCase()), 'the owner is found');
});

// ------------------------------------------------------------------------------------------------------------------------- the animal, the people
test('the animal is described in words, with its photos, and what happened is told in the reporter\'s own words', () => {
  const lost = mon.heroOf(lostCase());
  assert.deepEqual([lost.kind, lost.name, lost.about, lost.looks, lost.whenLabel, lost.where, lost.words], ['lost', 'Luna', 'Dog · Shih Tzu · Female · 3 years', 'White and golden, A white chest', 'Last seen', 'Gate 2', 'Luna slipped out of the gate.']);
  assert.deepEqual(lost.photos, ['https://img.example/luna-1.jpg', 'https://img.example/luna-2.jpg']);
  assert.deepEqual(lost.pin, { lat: 14.8008, lng: 121.0036 });
  const found = mon.heroOf(foundCase());
  assert.deepEqual([found.kind, found.name, found.about, found.whenLabel, found.where], ['found', 'Found dog', 'Brown, medium size', 'Found', 'Clubhouse']);
  // an older missing-pet report with no registered pet still has a page: nothing is made up
  const old = mon.heroOf(lostCase({ registeredPet: null, lostPet: null }));
  assert.deepEqual([old.name, old.about, old.petId], ['Missing dog', 'Dog', null]);
  // what changed in the pet's record since the report was filed is said, not hidden
  assert.deepEqual(mon.heroOf(lostCase({ registeredPet: pet({ changedSince: ['colour'] }) })).changed, ['colour']);
});

test('the Leader is shown who to talk to: the owner of a missing pet and whoever reported it; the finder of a found animal and the owner of its linked report', () => {
  assert.deepEqual(mon.peopleOf(lostCase(), []).map((p) => [p.role, p.name]), [['Owner', 'Rita Reporter']], 'the owner reported it: shown once');
  const other = lostCase({ registeredPet: pet({ reporterIsOwner: false }), reporter: { residentId: '9', name: 'Nina Cruz', unit: 'Blk 1', phone: '0917 000 0000', email: 'nina@example.test', preferredContact: 'phone' } });
  assert.deepEqual(mon.peopleOf(other, []).map((p) => [p.role, p.name]), [['Current registry owner', 'Rita Reporter'], ['Reported by', 'Nina Cruz']]);
  assert.equal(mon.peopleOf(other, [])[0].contact, undefined, 'a later registry owner never inherits an earlier case conversation');
  const found = foundCase();
  assert.deepEqual(mon.peopleOf(found, []).map((p) => [p.role, p.name]), [['Reported by', 'Owen Owner']]);
  const linked = match(1, 158, 160, { status: 'confirmed' });
  assert.deepEqual(mon.peopleOf(found, [linked]).map((p) => [p.role, p.name]), [['Reported by', 'Owen Owner'], ['Owner of Luna', 'Rita Reporter']]);
  assert.deepEqual(mon.peopleOf(lostCase(), [linked]).map((p) => [p.role, p.name]), [['Owner', 'Rita Reporter'], ['Found-animal report (SS-2026-0160)', 'Owen Owner']]);
  assert.equal(mon.peopleOf(lostCase(), [])[0].contact.party, 'owner');
  assert.equal(mon.peopleOf(lostCase(), [])[0].contact.label, 'Contact the owner');
  assert.equal(mon.peopleOf(other, [])[1].contact.party, 'reporter');
  assert.equal(mon.peopleOf(other, [])[1].contact.label, 'Contact Nina');
  assert.equal(mon.peopleOf(found, [])[0].contact.party, 'reporter');
  assert.equal(mon.peopleOf(found, [])[0].contact.label, 'Contact Owen');
  assert.equal(mon.peopleOf(found, [linked])[1].contact.reportId, 'SS-2026-0158', 'contacting a linked owner uses the missing-pet case, never the finder’s own report');
  assert.equal(mon.peopleOf(lostCase(), [linked])[1].contact.reportId, 'SS-2026-0160', 'contacting a linked reporter uses the found-animal case');
  assert.equal(mon.peopleOf(lostCase(), [linked])[1].contact.label, 'Contact Owen');
  const linkedSecond = match(2, 158, 161, { status: 'confirmed', found: side({ report_id: 161, kind: 'found', title: 'Found white dog near Gate 3', reporter: { user_id: 9, name: 'Nina Cruz', phone: '0917 777 6666' } }) });
  const multi = mon.peopleOf(lostCase(), [linked, linkedSecond]);
  assert.deepEqual(multi.map((p) => [p.role, p.name, p.contact?.label, p.contact?.reportId]), [
    ['Owner', 'Rita Reporter', 'Contact the owner', undefined],
    ['Found-animal report (SS-2026-0160)', 'Owen Owner', 'Contact Owen', 'SS-2026-0160'],
    ['Found-animal report (SS-2026-0161)', 'Nina Cruz', 'Contact Nina', 'SS-2026-0161'],
  ], 'multiple found-animal reporters linked to one lost pet each get their own isolated contact target');
});

// --------------------------------------------------------------------------------------------------------------------------------- activity
test('the activity is one list: what happened, the notes, the contacts and the follow-ups finished, without a status ladder', () => {
  const ev = (id, at, kind, title) => ({ id, at, actor: 'System', kind, title });
  const c = lostCase({
    timeline: [ev('h1', ago(5), 'info', 'Missing-pet notice published.'), ev('h2', ago(4), 'status', 'Case moved to In progress.'), ev('h3', ago(3), 'priority', 'Priority changed.'), ev('h4', ago(2), 'referral', 'Assistance requested.'), ev('h9', ago(1.5), 'note', 'Internal note added')],
    notes: [{ id: 'n1', at: ago(1.5), by: 'Case officer', text: 'A possible match was suggested: report #160. Strong match, waiting for a Leader to review it.' }],
    ownerContacts: [{ id: 'o1', at: ago(1), by: 'Lena Leader', method: 'phone', withWhom: 'Rita', summary: 'Said she would ask the guard.', outcome: 'cooperative' }],
    followUps: [followUp({ id: 'f2', status: 'done', completedAt: ago(0.5), completionNote: 'Nothing.' }), followUp({ id: 'f3', status: 'pending' })],
    referrals: [referral()],
  });
  const feed = mon.activityOf(c);
  assert.deepEqual(feed.map((e) => e.id), ['followup-f2', 'contact-o1', 'note-n1', 'h4', 'h1'], 'newest first; a status or priority change is left out; a pending follow-up is not an event; the Barangay is in the history once');
  assert.equal(feed[1].title, 'Contacted Rita (phone call)');
  assert.equal(feed[2].title, 'A possible match was suggested: report #160. Strong match, waiting for a Leader to review it.', 'a staff note reads as the sentence it is, in full: nobody types one on this page');
});

test('a few words of the page are generated from the title: the place has its own line', () => {
  assert.equal(mon.titleHead('Missing dog, Gate 2'), 'Missing dog');
  assert.equal(mon.titleHead('Found cat'), 'Found cat');
});
