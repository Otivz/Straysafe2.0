// Backend answers -> the Resident UI's model (src/resident/live/adapters.ts). Fixtures have the shapes the backend really sends
// (routes/reports.py as the reporter gets it, lost_pet_alerts._alert_view, ownership_claims, notifications, pets); no network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  animalTypeOf, claimFromApi, coordinationFromApi, evidenceIdsFrom, joinAddress, joinExtra, mediaFromApi, noticeFromAlert, noticeFromAnnouncement, noticeRef, notificationFromApi, officeFrom,
  ownershipRequestFromApi, petFromApi, petToApi, preferencesFrom, profileFromUser, reportFromApi, settingsFrom, sightingFromApi, splitAddress, splitExtra, updateFromChat, updateFromHistory,
} from '../src/resident/live/adapters.ts';

const FAMILY = { 1: 'injured', 3: 'nuisance', 5: 'found_animal', 6: 'lost_pet' };
const lookup = {
  refOf: (id) => `SS-2026-${String(id).padStart(4, '0')}`,
  familyOf: (id) => FAMILY[id] ?? 'other',
  claimOfReport: (id) => (id === 40 ? '9' : undefined),
};

const report = (over = {}) => ({
  report_id: 158, created_at: '2026-11-01T01:00:00+00:00', case_status: 'in_progress', case_outcome: null, category_id: 3,
  animal_type: 'Dog', animal_breed: null, animal_color: 'Brown', description: 'A brown dog barks all night near Gate 2. It has done this for a week.', condition: 'How often does it happen?: Often',
  latitude: 14.8, longitude: 121.0, landmark: 'Gate 2', pet_id: null, pet_name: null, user_id: 7,
  media: [{ media_id: 1, file_url: 'https://img.test/a.jpg', media_type: 'Image', is_evidence: false, uploaded_at: '2026-11-01T01:01:00+00:00' }, { media_id: 2, file_url: 'https://img.test/e.pdf', media_type: 'Document', is_evidence: false, uploaded_at: '2026-11-01T01:02:00+00:00' }, { media_id: 3, file_url: 'https://img.test/c.mp4', media_type: 'Video', is_evidence: false, uploaded_at: '2026-11-01T01:03:00+00:00' }, { media_id: 4, file_url: 'https://img.test/proof.jpg', media_type: 'Image', is_evidence: true, uploaded_at: '2026-11-01T01:04:00+00:00' }],
  // oldest first, the way the server lists it (the report's history relationship is ordered by time)
  history: [
    { history_id: 1, remarks: 'Initial report submitted by resident.', created_at: '2026-11-01T01:00:00+00:00', updater_name: 'Rita' },
    { history_id: 2, remarks: 'Case status changed to Under review.', created_at: '2026-11-02T05:00:00+00:00', updater_name: 'Leader' },
    { history_id: 3, remarks: 'Case status changed to In progress.', created_at: '2026-11-03T05:00:00+00:00', updater_name: 'Leader' },
  ],
  ...over,
});

test('animal types, extra answers and addresses are read both ways', () => {
  assert.equal(animalTypeOf('Dog'), 'dog');
  assert.equal(animalTypeOf('Small mammal'), 'small_mammal');
  assert.equal(animalTypeOf('Unknown'), 'other');
  assert.equal(splitExtra('How often does it happen?: Often'), 'Often');
  assert.equal(splitExtra('Can the animal move?: Not sure'), 'Not sure');
  assert.equal(splitExtra('limping'), 'limping');
  assert.equal(splitExtra(''), undefined);
  assert.equal(splitExtra(null), undefined);
  assert.equal(joinExtra('How often does it happen?', 'Often'), 'How often does it happen?: Often');
  assert.deepEqual(splitAddress('Blk 4 Lot 12, Molave St.'), { unit: 'Blk 4 Lot 12', street: 'Molave St.' });
  assert.deepEqual(splitAddress('Clubhouse'), { unit: 'Clubhouse', street: '' });
  assert.deepEqual(splitAddress(null), { unit: '', street: '' });
  assert.equal(joinAddress(' Blk 4 ', ' Molave St. '), 'Blk 4, Molave St.');
  assert.equal(joinAddress('Blk 4', ''), 'Blk 4');
});

test('a report as its reporter sees it: kind, title, status, pin, extra answer, photos, and a private visibility without a notice', () => {
  const r = reportFromApi(report(), lookup, { me: 7 });
  assert.deepEqual([r.id, r.kind, r.category, r.status, r.visibility, r.noticeId], ['SS-2026-0158', 'incident', 'nuisance', 'in_progress', 'private', null]);
  assert.equal(r.title, 'A brown dog barks all night near Gate 2.');
  assert.deepEqual([r.location.label, r.location.lat, r.location.lng, r.location.manual], ['Gate 2', 14.8, 121, false]);
  assert.equal(r.extra, 'Often');
  assert.equal(r.animalType, 'dog');
  assert.deepEqual(r.media.map((m) => [m.id, m.kind, m.name]), [['m1', 'photo', 'Photo 1'], ['m3', 'video', 'Video 1']], 'no document and no claim evidence');
  assert.equal(r.outcome, null);
});

test('the timeline is the server\'s own lines, newest first, with the original submission as "Report received"', () => {
  const r = reportFromApi(report(), lookup, { me: 7 });
  assert.deepEqual(r.updates.map((u) => [u.kind, u.title]), [['status', 'In progress'], ['status', 'Under review'], ['received', 'Report received']]);
  assert.equal(r.updatedAt, r.updates[0].at);
  // the same whichever way the lines arrive: the original submission is known by what it says, not by where it sits
  const flipped = reportFromApi(report({ history: [...report().history].reverse() }), lookup, { me: 7 });
  assert.deepEqual(flipped.updates, r.updates);
  assert.deepEqual(updateFromHistory({ history_id: 1, remarks: 'Initial report submitted by resident.', created_at: '2026-11-01T01:00:00+00:00' }), { id: 'h1', at: '2026-11-01T01:00:00.000Z', kind: 'received', title: 'Report received' });
  assert.deepEqual(updateFromHistory({ history_id: 9, remarks: 'Case closed: Owner compliance verified.', created_at: '2026-11-09T00:00:00+00:00' }), { id: 'h9', at: '2026-11-09T00:00:00.000Z', kind: 'outcome', title: 'Closed', body: 'Owner compliance verified' });
  assert.equal(updateFromHistory({ history_id: 8, remarks: 'Case reopened.', created_at: '2026-11-09T00:00:00+00:00' }).title, 'Reopened');
  assert.deepEqual(updateFromHistory({ history_id: 7, remarks: '', created_at: '2026-11-09T00:00:00+00:00' }).title, 'Update recorded');
  assert.equal(updateFromHistory({ history_id: 6, remarks: 'x'.repeat(300), created_at: '2026-11-09T00:00:00+00:00' }).title.length, 120);
});

test('case chat: what the resident said is "you", the subdivision\'s words are a message, the server\'s own notices are skipped', () => {
  const msg = (over) => ({ message_id: 1, sender_id: 7, sender_name: 'Rita', sender_role: 'Citizen', message_text: 'The dog is back.', media_url: null, is_system: false, sent_at: '2026-11-04T01:00:00+00:00', ...over });
  assert.deepEqual(updateFromChat(msg({}), 7), { id: 'c1', at: '2026-11-04T01:00:00.000Z', kind: 'you', title: 'You added information', body: 'The dog is back.' });
  assert.deepEqual(updateFromChat(msg({ sender_id: 2, message_text: 'Thanks, we will check.' }), 7).kind, 'message');
  assert.equal(updateFromChat(msg({ is_system: true }), 7), null);
  assert.equal(updateFromChat(msg({ message_text: '', media_url: null }), 7), null);
  assert.equal(updateFromChat(msg({ message_text: '', media_url: 'https://img.test/p.jpg' }), 7).body, '[Photo attached]');
  const r = reportFromApi(report(), lookup, { me: 7, chat: [msg({ sent_at: '2026-11-10T00:00:00+00:00' })] });
  assert.equal(r.updates[0].kind, 'you', 'chat is merged into the timeline by time');
});

test('a closed case shows how it ended, in the server\'s neutral words', () => {
  const closed = (outcome) => reportFromApi(report({ case_status: 'closed', case_outcome: { label: 'Owner compliance verified', outcome, closed_at: '2026-11-08T05:00:00+00:00' } }), lookup, { me: 7 });
  assert.deepEqual([closed('resolved').outcome.label, closed('resolved').outcome.resolved, closed('resolved').outcome.at], ['Owner compliance verified', true, '2026-11-08T05:00:00.000Z']);
  assert.equal(closed('unresolved').outcome.resolved, false);
  assert.match(closed('unresolved').outcome.summary, /without a confirmed resolution/);
  assert.match(closed('invalid').outcome.summary, /did not need any action/);
});

test('a lost-pet report is "visible to neighbours" only while its notice is active, "awaiting review" while it is requested', () => {
  const alert = (status) => ({ alert_id: 12, report_id: 158, status, alert_type: 'lost_pet', last_seen: { at: '2026-11-01T00:30:00+00:00', location: 'Gate 2', latitude: 14.8, longitude: 121.0, generalized: false } });
  const lost = (status) => reportFromApi(report({ category_id: 6, pet_name: 'Mochi', animal_type: 'Dog' }), lookup, { me: 7, alert: status ? alert(status) : null });
  assert.deepEqual([lost('active').visibility, lost('active').noticeId, lost('active').kind, lost('active').title], ['published', 'alert-12', 'lost', 'Lost pet: Mochi']);
  assert.deepEqual([lost('requested').visibility, lost('requested').noticeId], ['pending_review', null]);
  assert.deepEqual([lost('closed').visibility, lost('closed').noticeId], ['private', null]);
  assert.deepEqual([lost(null).visibility, lost(null).noticeId], ['private', null]);
  assert.equal(lost('active').observedAt, '2026-11-01T00:30:00.000Z', 'the lost-pet notice keeps when it was last seen');
  const found = reportFromApi(report({ category_id: 5, animal_type: 'Cat' }), lookup, { me: 7 });
  assert.deepEqual([found.kind, found.title], ['found', 'Found: cat']);
});

test('a report with no pin has no coordinates and the place is only in words', () => {
  const r = reportFromApi(report({ latitude: null, longitude: null, landmark: null }), lookup, { me: 7 });
  assert.deepEqual([r.location.lat, r.location.lng, r.location.label, r.location.manual], [null, null, 'Pinned on the map', true]);
});

test('media: photos and videos only, claim evidence and documents left out', () => {
  assert.deepEqual(mediaFromApi(report().media).map((m) => m.kind), ['photo', 'video']);
});

test('notice ids say which API they came from', () => {
  assert.deepEqual([noticeRef('alert-12'), noticeRef('ann-7'), noticeRef('n-3'), noticeRef('')], [{ kind: 'alert', id: 12 }, { kind: 'announcement', id: 7 }, null, null]);
});

const alert = (over = {}) => ({
  alert_id: 12, report_id: 158, status: 'active', alert_type: 'lost_pet', pet: { name: 'Mochi', photo_url: 'https://img.test/p.jpg', species: 'Dog', breed: null, color: 'White', distinguishing_marks: null, description: 'Shy.' },
  last_seen: { at: '2026-11-01T00:30:00+00:00', location: 'Near the clubhouse', latitude: 14.8003, longitude: 121.0021, generalized: true }, owner_note: 'Very shy', leader_message: null,
  requested_at: '2026-11-01T02:00:00+00:00', activated_at: '2026-11-01T03:00:00+00:00', closed_at: null, close_outcome: null, close_reason: null, sighting_count: 1, accepting_sightings: true, is_owner: false, requested_by: null, ...over,
});

test('a lost-pet notice: the title from the pet, the general area from the position the server already rounded, nothing about the owner', () => {
  const n = noticeFromAlert(alert(), lookup, new Set());
  assert.deepEqual([n.id, n.type, n.title, n.status, n.mine, n.area, n.animalType, n.photos, n.source], ['alert-12', 'lost_pet', 'Lost dog: Mochi', 'active', false, 'Near the clubhouse', 'dog', 1, 'owner']);
  assert.deepEqual(n.approx, { lat: 14.8003, lng: 121.0021, radiusM: 120 });
  assert.deepEqual(n.photoUrls, ['https://img.test/p.jpg']);
  assert.equal(n.description, 'Very shy');
  assert.equal(n.reportId, undefined, 'a neighbour is never given the owner\'s report');
  assert.equal(noticeFromAlert(alert({ is_owner: true }), lookup, new Set()).reportId, 'SS-2026-0158');
  assert.equal(noticeFromAlert(alert(), lookup, new Set([158])).mine, true, 'the resident who filed the report owns the notice');
});

test('publication state stays distinct from recovery, including requested and closed notices', () => {
  const found = noticeFromAlert(alert({ alert_type: 'found_animal', pet: { name: 'Found animal', photo_url: null, species: 'Cat', breed: null, color: null, distinguishing_marks: null, description: null } }), lookup, new Set());
  assert.deepEqual([found.type, found.title, found.source, found.photos, found.photoUrls], ['found_animal', 'Found: cat', 'admin', 0, undefined]);
  assert.equal(noticeFromAlert(alert({ status: 'closed', close_outcome: 'withdrawn' }), lookup, new Set()).status, 'closed');
  assert.equal(noticeFromAlert(alert({ status: 'requested' }), lookup, new Set()).status, 'requested');
  const confirmed = noticeFromAlert(alert({ status: 'closed', close_outcome: 'recovered', recovered_at: '2026-11-01T04:00:00Z' }), lookup, new Set());
  assert.equal(confirmed.status, 'closed');
  assert.equal(confirmed.recoveredAt, '2026-11-01T04:00:00.000Z');
  const nowhere = noticeFromAlert(alert({ last_seen: { at: null, location: null, latitude: null, longitude: null, generalized: true } }), lookup, new Set());
  assert.deepEqual([nowhere.area, nowhere.approx, nowhere.lastSeenAt], ['Somewhere in the subdivision', undefined, undefined]);
});

test('sightings: by you or a neighbour, newest first, a place only if one was given', () => {
  const s = (over) => ({ sighting_id: 5, latitude: 14.8003, longitude: 121.0021, coordinates_generalized: true, location_label: 'Block 6 carports', location_source: 'map_pin', seen_at: '2026-11-02T10:00:00+00:00', submitted_at: '2026-11-02T10:05:00+00:00', description: 'Resting under a car.', photo_url: null, status: 'unverified', reported_by: 'A neighbor', is_mine: false, ...over });
  assert.deepEqual([sightingFromApi(s()).by, sightingFromApi(s({ is_mine: true })).by, sightingFromApi(s()).location.label, sightingFromApi(s({ photo_url: 'https://img.test/x.jpg' })).photos], ['neighbour', 'you', 'Block 6 carports', 1]);
  assert.deepEqual([sightingFromApi(s({ latitude: null, longitude: null })).location.lat, sightingFromApi(s({ latitude: null, longitude: null, location_label: null })).location.label], [null, 'Pinned on the map']);
  const n = noticeFromAlert(alert({ sightings: [s({ sighting_id: 1, seen_at: '2026-11-01T10:00:00+00:00' }), s({ sighting_id: 2, seen_at: '2026-11-03T10:00:00+00:00' })] }), lookup, new Set());
  assert.deepEqual(n.sightings.map((x) => x.id), ['sg2', 'sg1']);
  const reviewed = sightingFromApi(s({ on_behalf: true, status: 'dismissed', reviewed_at: '2026-11-03T12:00:00Z', review_note: 'A different dog.' }));
  assert.equal(reviewed.onBehalf, true);
  assert.equal(reviewed.review.status, 'dismissed');
  assert.equal(reviewed.review.at, '2026-11-03T12:00:00.000Z');
  assert.equal(reviewed.review.note, 'A different dog.');
  const summary = noticeFromAlert(alert({ sighting_count: 7, latest_sighting: s({ sighting_id: 9 }) }), lookup, new Set());
  assert.equal(summary.sightingCount, 7);
  assert.equal(summary.sightings.length, 0);
  assert.equal(summary.latestSighting.id, 'sg9');
});

test('a safety advisory is an announcement, shown as published', () => {
  const n = noticeFromAnnouncement({ announcement_id: 7, title: 'Rabies reminder', category: 'Animal Advisory', visibility: 'Subdivision Only', content: 'Please vaccinate.', pinned: false, expiration: null, location: 'Selera Homes', posted_by: 'Leader', posted_on: '2026-11-01T01:00:00+00:00', status: 'Published', media: [{ media_id: 1, file_url: 'https://img.test/n.jpg', media_type: 'Image', caption: null }] });
  assert.deepEqual([n.id, n.type, n.status, n.mine, n.area, n.photos, n.publishedAt], ['ann-7', 'safety_advisory', 'active', false, 'Selera Homes', 1, '2026-11-01T01:00:00.000Z']);
});

const claim = (over = {}) => ({ claim_id: 9, report_id: 40, alert_id: 12, status: 'submitted', statement: 'That is my dog.', evidence: ['photos'], submitted_at: '2026-11-05T00:00:00+00:00', reviewed_at: null, review_note: null, claimed_pet_id: 31, ...over });

test('a claim: the server keeps the latest decision, so the timeline is "sent" and then that decision', () => {
  const sent = claimFromApi(claim());
  assert.deepEqual([sent.id, sent.noticeId, sent.petId, sent.status, sent.updates.length, sent.decisionNote], ['9', 'alert-12', '31', 'submitted', 1, undefined]);
  const ask = claimFromApi(claim({ status: 'needs_info', reviewed_at: '2026-11-06T00:00:00+00:00', review_note: 'Describe the scar.' }));
  assert.deepEqual([ask.status, ask.updates[0].kind, ask.updates[0].title, ask.updates[0].body, ask.decisionNote], ['needs_info', 'message', 'More information requested', 'Describe the scar.', undefined]);
  const ok = claimFromApi(claim({ status: 'accepted', reviewed_at: '2026-11-07T00:00:00+00:00', review_note: 'Matched.' }));
  assert.deepEqual([ok.status, ok.decisionNote, ok.updates[0].title], ['approved', 'Matched.', 'Claim approved']);
  assert.equal(claimFromApi(claim({ status: 'rejected', reviewed_at: '2026-11-07T00:00:00+00:00', review_note: 'No.' })).status, 'rejected');
  assert.equal(claimFromApi(claim({ status: 'withdrawn' })), null, 'a withdrawn claim is gone from the list');
  assert.equal(claimFromApi(claim({ alert_id: null })).noticeId, '');
});

test('what the resident says they have becomes the evidence ids the server knows', () => {
  assert.deepEqual(evidenceIdsFrom(['I have photos of the animal with me']).sort(), ['photos', 'statement']);
  assert.deepEqual(evidenceIdsFrom(['I have a vet or vaccination record', 'I know its tag or microchip details']).sort(), ['markings', 'statement', 'vet']);
  assert.deepEqual(evidenceIdsFrom([]), ['statement']);
});

test('pets: read from the registry, written back as the server takes them', () => {
  const api = { pet_id: 31, pet_name: 'Mochi', pet_type: 'Dog', breed: 'Shih Tzu', color_markings: 'White and gold', primary_color: 'White', secondary_color: null, gender: 'Female', estimated_age: '3 years', birth_date: null, size_category: 'Small', distinctive_markings: 'gold ear tips, pink collar', health_condition: null, notes: 'Shy', photo_url: 'https://img.test/p.jpg', photo_front_url: null, photo_left_url: null, photo_right_url: null, owner_id: 7, created_at: '2026-02-01T00:00:00+00:00', is_vaccinated: true, vaccine_expiry: null, status: 'Active' };
  const pet = petFromApi(api);
  assert.deepEqual([pet.id, pet.type, pet.breed, pet.color, pet.ageText, pet.markings, pet.photoUrl], ['31', 'dog', 'Shih Tzu', 'White, White and gold', '3 years', ['gold ear tips', 'pink collar'], 'https://img.test/p.jpg']);
  const body = petToApi({ ...pet, name: ' Mochi ', color: 'White and gold' });
  assert.deepEqual([body.pet_name, body.pet_type, body.breed, body.color_markings, body.distinctive_markings], [' Mochi ', 'Dog', 'Shih Tzu', 'White and gold', 'gold ear tips, pink collar']);
  assert.equal(petToApi({ ...pet, breed: '', ageText: '' }).breed, null);
});

test('a pet carries its sex and the record status the server holds, and is saved as a dog or a cat with its sex', () => {
  const base = { pet_id: 31, pet_name: 'Mochi', pet_type: 'Dog', breed: null, color_markings: 'White', primary_color: null, secondary_color: null, gender: 'Female', estimated_age: null,
    birth_date: null, size_category: 'Medium', distinctive_markings: null, health_condition: null, notes: null, photo_url: null, photo_front_url: null, photo_left_url: null,
    photo_right_url: null, owner_id: 7, created_at: '2026-10-01T00:00:00+00:00', is_vaccinated: false, vaccine_expiry: null, status: 'Deceased' };
  const pet = petFromApi(base);
  assert.deepEqual([pet.sex, pet.status], ['female', 'Deceased']);
  assert.equal(petFromApi({ ...base, gender: 'Unknown', status: null }).sex, 'unknown');
  assert.equal('status' in petFromApi({ ...base, status: null }), false, 'no status is simply absent');
  assert.deepEqual([petToApi({ ...pet, sex: 'male' }).gender, petToApi({ ...pet, sex: 'unknown' }).gender, petToApi({ ...pet, type: 'cat' }).pet_type], ['Male', 'Unknown', 'Cat']);
});

test('a pet the office linked to this account is a question to answer, with who asked', () => {
  const req = ownershipRequestFromApi({ confirmation_id: 5, pet_id: 31, pet_name: 'Brownie', pet_type: 'Dog', breed: 'Aspin', photo_url: 'https://img.test/b.jpg', proposed_by_name: 'Leader Lee', created_at: '2026-11-10T09:00:00+00:00' });
  assert.deepEqual([req.id, req.petId, req.petName, req.petType, req.photoUrl, req.proposedBy], ['5', '31', 'Brownie', 'dog', 'https://img.test/b.jpg', 'Leader Lee']);
  const bare = ownershipRequestFromApi({ confirmation_id: 6, pet_id: 32, pet_name: null, pet_type: null, breed: null, photo_url: null, proposed_by_name: null, created_at: null });
  assert.deepEqual([bare.petName, bare.proposedBy, 'photoUrl' in bare], ['A pet', 'Your subdivision office', false]);
});

test('the notification that asks "is this your pet?" leads to My pets, not to a report', () => {
  const n = notificationFromApi({ notification_id: 9, type: 'pet_owner_confirmation', title: 'Please confirm pet ownership', message: 'Open My Pets', related_id: 31, is_read: false, created_at: '2026-11-10T00:00:00+00:00' }, lookup);
  assert.equal(n.to, '/pets');
});

test('notifications lead where they should: an alert id is never taken for a report id', () => {
  const n = (over) => notificationFromApi({ notification_id: 5, type: 'status_update', title: 'Report #158 was updated', message: 'm', related_id: 158, is_read: false, created_at: '2026-11-02T00:00:00+00:00', ...over }, lookup);
  assert.deepEqual([n({}).kind, n({}).to, n({}).read], ['report_update', '/reports/SS-2026-0158', false]);
  assert.deepEqual([n({ type: 'lost_pet_alert', title: 'Missing pet: Mochi - have you seen it?', related_id: 12 }).kind, n({ type: 'lost_pet_alert', title: 'Missing pet: Mochi - have you seen it?', related_id: 12 }).to], ['community_notice', '/community/alert-12']);
  assert.deepEqual([n({ type: 'lost_pet_alert', title: 'New sighting of Mochi', related_id: 12 }).kind, n({ type: 'lost_pet_alert', title: 'New sighting of Mochi', related_id: 12 }).to], ['sighting', '/community/alert-12/sightings']);
  assert.deepEqual([n({ type: 'ownership_claim_review', related_id: 40 }).kind, n({ type: 'ownership_claim_review', related_id: 40 }).to], ['claim_update', '/claims/9']);
  assert.equal(n({ type: 'ownership_claim_review', related_id: 99 }).to, '/community');
  assert.equal(n({ related_id: null }).to, '/reports');
});

test('every Lost Pet notification opens the NOTICE (its id is the alert\'s): an ordinary sighting opens the sightings, the rest the notice', () => {
  const n = (type, over = {}) => notificationFromApi({ notification_id: 6, type, title: 'Mochi', message: 'm', related_id: 12, is_read: false, created_at: '2026-11-02T00:00:00+00:00', ...over }, lookup);
  assert.deepEqual([n('lost_pet_sighting').kind, n('lost_pet_sighting').to], ['sighting', '/community/alert-12/sightings']);
  assert.deepEqual([n('lost_pet_secured').kind, n('lost_pet_secured').to], ['sighting', '/community/alert-12']);
  assert.deepEqual([n('lost_pet_coordination').kind, n('lost_pet_coordination').to], ['community_notice', '/community/alert-12']);
  assert.deepEqual([n('lost_pet_recovered').kind, n('lost_pet_recovered').to], ['community_notice', '/community/alert-12']);
  assert.equal(n('lost_pet_sighting', { related_id: null }).to, '/community');
  // a Leader's notification carries a REPORT id: it is never read as a notice here
  assert.equal(n('lost_pet_leader', { related_id: 158 }).to, '/reports/SS-2026-0158');
});

test('a notice that ended says how: only the owner\'s confirmation is "home"; every other ending keeps its own reason', () => {
  const closed = (outcome, reason, extra = {}) => noticeFromAlert(alert({ status: 'closed', close_outcome: outcome, close_reason: reason, ...extra }), lookup, new Set());
  const home = closed('recovered', null, { recovered_at: '2026-11-04T01:00:00+00:00' });
  assert.deepEqual([home.status, home.closeOutcome, Boolean(home.recoveredAt)], ['closed', 'recovered', true]);
  const withdrawn = closed('withdrawn', 'The owner withdrew the report.');
  assert.deepEqual([withdrawn.status, withdrawn.closeOutcome, withdrawn.closeReason, withdrawn.recoveredAt], ['closed', 'withdrawn', 'The owner withdrew the report.', undefined]);
  const open = noticeFromAlert(alert(), lookup, new Set());
  assert.deepEqual([open.closeOutcome, open.closeReason, open.recoveredAt], [undefined, undefined, undefined], 'an active notice has no ending');
});

test('a lost-pet notice carries what identifies the pet, the viewer\'s role, and a name only when the pet has one', () => {
  const pet = (over) => ({ name: 'Mochi', photo_url: null, species: 'Dog', breed: 'Shih Tzu', color: 'White', distinguishing_marks: 'Blue collar', description: null, ...over });
  const owner = noticeFromAlert(alert({ pet: pet(), is_owner: true }), lookup, new Set());
  assert.deepEqual([owner.petName, owner.identity, owner.viewerRole], ['Mochi', { breed: 'Shih Tzu', color: 'White', marks: 'Blue collar' }, 'owner']);
  const unnamed = noticeFromAlert(alert({ pet: pet({ name: 'Missing pet', breed: null, color: null, distinguishing_marks: null }) }), lookup, new Set());
  assert.deepEqual([unnamed.petName, unnamed.identity, unnamed.viewerRole], [undefined, undefined, 'neighbor']);
  assert.equal(noticeFromAlert(alert({ viewer_role: 'finder' }), lookup, new Set()).viewerRole, 'finder');
  const found = noticeFromAlert(alert({ alert_type: 'found_animal', is_owner: true, pet: pet({ name: 'Found animal' }) }), lookup, new Set());
  assert.deepEqual([found.petName, found.viewerRole], [undefined, 'neighbor'], 'the person who reported a found animal is not its owner');
});

test('a possible-recovery report keeps its kind, its private care note and the Leader\'s review; a conversation is read from the resident\'s own side', () => {
  const sg = {
    sighting_id: 7, latitude: 14.8, longitude: 121, coordinates_generalized: false, location_label: 'Block 6', location_source: 'map_pin', seen_at: '2026-11-02T10:00:00+00:00',
    submitted_at: '2026-11-02T10:05:00+00:00', description: 'Calm.', photo_url: null, status: 'verified', reported_by: 'A neighbor', is_mine: false,
    sighting_type: 'secured', care_note: 'In my carport', reviewed_by: 'Leader Ana',
  };
  const s = sightingFromApi(sg);
  assert.deepEqual([s.kind, s.careNote, s.review], ['secured', 'In my carport', { status: 'verified', by: 'Leader Ana' }]);
  const plain = sightingFromApi({ ...sg, sighting_type: 'seen', care_note: null, status: 'unverified', reviewed_by: null });
  assert.deepEqual([plain.kind, plain.careNote, plain.review], [undefined, undefined, undefined]);
  assert.equal(sightingFromApi({ ...sg, status: 'dismissed' }).review.status, 'dismissed');

  const c = (over = {}) => ({
    coordination_id: 3, alert_id: 12, report_id: 158, sighting_id: 7, you_are: 'owner', status: 'open', mode: 'none', owner_consent: true, finder_consent: false, direct_open: false,
    can_message: false, mediation_requested: false, mediation_requested_by_you: false, unread_messages: 2, resolution_note: null, other_party: { first_name: 'Ben' }, ...over,
  });
  const owner = coordinationFromApi(c());
  assert.deepEqual([owner.id, owner.sightingId, owner.youAre, owner.youAgreed, owner.otherAgreed, owner.otherName, owner.unread], ['3', 'sg7', 'owner', true, false, 'Ben', 2]);
  const finder = coordinationFromApi(c({ you_are: 'finder', other_party: { first_name: null } }));
  assert.deepEqual([finder.youAgreed, finder.otherAgreed, finder.otherName], [false, true, 'the owner']);
  const asked = coordinationFromApi(c({ mode: 'leader', mediation_requested: true, mediation_requested_by_you: true }));
  assert.deepEqual([asked.mode, asked.mediationRequested, asked.mediationByYou, asked.canMessage], ['leader', true, true, false]);
  assert.equal(coordinationFromApi(c({ you_are: 'leader' })), null, 'the Leader\'s own view of it is the Leader app\'s');
  const n = noticeFromAlert(alert({ is_owner: true, sightings: [sg], coordinations: [c(), c({ coordination_id: 4, you_are: 'leader' })], secured_count: 1 }), lookup, new Set());
  assert.deepEqual([n.securedCount, n.coordinations.map((x) => x.id)], [1, ['3']]);
});

test('profile and office', () => {
  const user = { user_id: 7, name: 'Rita', email: 'rita@x.test', phone: null, role_id: 1, address: 'Blk 4 Lot 12, Molave St.', status: 'Active', is_verified: true, created_at: '2026-01-05T00:00:00+00:00', last_login: null, position_name: null, subdivision_name: 'Selera', subdivision_id: 1 };
  assert.deepEqual(profileFromUser(user), { id: '7', name: 'Rita', email: 'rita@x.test', phone: '', unit: 'Blk 4 Lot 12', street: 'Molave St.', memberSince: '2026-01-05T00:00:00.000Z' });
  const cats = (office) => ({ subdivision_id: 1, subdivision: { name: 'Selera Homes', city: 'C', office }, publication: { lost_pet: 'review', found_animal: 'review' }, categories: [] });
  assert.equal(officeFrom(cats({ address: '', phone: '', email: '', hours: '' })), null, 'no office details recorded: nothing is invented');
  assert.deepEqual(officeFrom(cats({ address: 'Clubhouse', phone: '02 8123 4567', email: '', hours: 'Mon-Fri' })), { name: 'Selera Homes office', phone: '02 8123 4567', email: '', hours: 'Mon-Fri', address: 'Clubhouse' });
});

const prefs = (over = {}) => ({ email_reports: true, email_rescues: false, email_pet_matches: false, email_claims: true, email_reminders: true, push_enabled: true, push_reports: true, push_rescues: false, push_pet_matches: true, push_claims: true, push_adoptions: true, push_messages: false, push_show_preview: true, ...over });

test('notification switches round-trip through the server flags; community, advisories and SMS are not switches the server has', () => {
  const read = settingsFrom(prefs());
  assert.deepEqual(read, { notifications: { reportUpdates: true, sightings: true, claims: true, community: true, advisories: true }, channels: { push: true, email: true, sms: false } });
  const written = preferencesFrom({ ...read, notifications: { ...read.notifications, sightings: false } });
  assert.deepEqual(settingsFrom({ ...prefs(), ...written }).notifications.sightings, false);
  assert.deepEqual(settingsFrom({ ...prefs(), ...written }).notifications.reportUpdates, true);
  const noEmail = preferencesFrom({ ...read, channels: { push: false, email: false, sms: false } });
  assert.deepEqual([noEmail.email_reports, noEmail.email_claims, noEmail.email_pet_matches, noEmail.email_reminders, noEmail.push_enabled], [false, false, false, false, false]);
  const back = settingsFrom({ ...prefs(), ...noEmail });
  assert.deepEqual([back.channels.email, back.channels.push, back.notifications.reportUpdates], [false, false, true]);
});

test('an unregistered lost pet\'s name travels at the start of the description and is taken back out', async () => {
  const { splitPetName, withPetName } = await import('../src/resident/live/adapters.ts');
  assert.equal(withPetName('Mochi', 'White shih tzu, shy.'), 'Pet name: Mochi\n\nWhite shih tzu, shy.');
  assert.equal(withPetName('  ', ' just text '), 'just text');
  assert.deepEqual(splitPetName('Pet name: Mochi\n\nWhite shih tzu, shy.'), { petName: 'Mochi', description: 'White shih tzu, shy.' });
  assert.deepEqual(splitPetName('A dog near the gate.'), { description: 'A dog near the gate.' });
  assert.deepEqual(splitPetName(splitPetName(withPetName('Bantay', 'Brown dog.')).description), { description: 'Brown dog.' });
  const lookup = { refOf: (id) => `SS-2026-${id}`, familyOf: () => 'lost_pet', claimOfReport: () => undefined };
  const { reportFromApi } = await import('../src/resident/live/adapters.ts');
  const r = reportFromApi({ report_id: 5, created_at: '2026-11-01T01:00:00+00:00', case_status: 'reported', case_outcome: null, category_id: 6, animal_type: 'Dog', animal_breed: null, animal_color: null,
    description: 'Pet name: Mochi\n\nWhite shih tzu, shy.', condition: null, latitude: 14.8, longitude: 121, landmark: 'Gate 2', pet_id: null, pet_name: null, user_id: 7, media: [], history: [] }, lookup, { me: 7 });
  assert.deepEqual([r.petName, r.description, r.title], ['Mochi', 'White shih tzu, shy.', 'Lost pet: Mochi']);
});
