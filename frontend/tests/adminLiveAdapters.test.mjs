// Backend answers -> the Admin UI's model (src/admin/live/adapters.ts). Fixtures have the shapes the backend really sends
// (services/case_summaries.py, case_view.py, case_notes.py, routes/lost_pet_alerts.py, ...); no network, no browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  analyticsFromApi, animalDescription, animalTypeOf, applyDetail, applyQueue, caseFromSummary, caseSettingsTo, caseTitle, eventKindOf, isOriginalSubmission, noticeFromAlert,
  noticeFromAnnouncement, noticeRef, notificationFlagsFrom, notificationFromApi, notificationSettingsFrom, orgIdOf, orgTypeOf, petFromApi, petIdsByOwner,
  profileFromUser, residentFromUser, settingsFrom, splitAddress, warningFromApi,
} from '../src/admin/live/adapters.ts';

const NOW = new Date('2026-11-09T04:00:00.000Z');
const resident = { id: '7', name: 'Rita Reporter', unit: 'Blk 4 Lot 12', street: 'Molave St.', phone: '0917 123 4567', email: 'rita@example.test', status: 'active', joinedAt: '', lastActiveAt: '', petIds: [] };
const names = { 7: 'Rita Reporter', 2: 'Leader One', 9: 'Owner Olive' };
const lookup = {
  nameOf: (id) => names[id],
  resident: (id) => (id === 7 ? resident : undefined),
  refOf: (reportId) => `SS-2026-${String(reportId).padStart(4, '0')}`,
};

const summary = (over = {}) => ({
  report_id: 158, reported_at: '2026-11-01T01:00:00+00:00', updated_at: '2026-11-02T05:30:00+00:00',
  last_event: { history_id: 55, at: '2026-11-02T05:30:00+00:00', text: 'Case status changed to Under review.', by_name: 'Leader One' },
  subdivision_id: 1, case_status: 'under_review', priority: 'high', is_sensitive: false,
  category: { category_id: 3, name: 'Animal Nuisance', family: 'nuisance', label: 'Animal Nuisance' },
  animal: { type: 'Dog', breed: 'Labrador mix', color: 'Brown', size: 'Medium', count: 2, description: 'Barks all night.', condition: null },
  location: { landmark: 'Gate 2', latitude: 14.8, longitude: 121.0 },
  reporter: { user_id: 7, name: 'Rita Reporter' }, assigned_leader_id: null, assigned_leader_name: null,
  assessment: { incident: 'not_reviewed', evidence_sufficiency: 'not_assessed', urgency: 'not_assessed', saved_at: null },
  identity_status: 'unidentified', ownership_status: 'unknown', ownership_owner_id: null, pet_id: null, closure: null, reopened_count: 0, merged_into_report_id: null, photo_count: 1, thumbnail_url: 'https://img.test/a.jpg',
  ...over,
});

const detail = (over = {}) => ({
  report_id: 158, case_status: 'in_progress', priority: 'urgent', is_sensitive: true,
  category: { category_id: 3, name: 'Animal Nuisance', family: 'nuisance', label: 'Animal Nuisance' },
  animal: { type: 'Small mammal', breed: null, color: null, size: null, count: 1, description: 'The full report text.', condition: null },
  location: { landmark: null, latitude: null, longitude: null }, reported_at: '2026-11-01T01:00:00+00:00', subdivision_id: 1,
  reporter: { user_id: 7, name: 'Rita Reporter' }, assigned_leader_id: 2, assigned_leader_name: 'Leader One',
  assessment: { incident: 'verified', incident_basis: 'The guard saw it too.', evidence_sufficiency: 'sufficient', evidence_reviewed: ['m1'], urgency: 'possible', urgency_note: 'n', notes: 'ass notes', saved_at: '2026-11-02T00:00:00+00:00', saved_by: 2, saved_by_name: 'Leader One' },
  identity: { status: 'identified', note: 'Recognised by the guard', pet_id: 31 },
  ownership: { status: 'confirmed', owner_user_id: 9, owner_name: 'Owner Olive', evidence: ['photos'], note: 'Photos with the owner', decided_at: '2026-11-02T00:00:00+00:00' },
  closure: null, reopened_count: 0,
  referrals: [{ referral_id: 4, report_id: 158, org_type: 'veterinary', org_name: null, status: 'acknowledged', is_open: true, is_urgent: false, reason: 'Needs a check-up', reference_no: null, contact_method: 'call', contact_person: 'Dr. Cruz', contact_detail: null, referred_at: '2026-11-03T02:00:00+00:00', referred_by: 2, referred_by_name: 'Leader One', external_outcome: null, remaining_follow_up: null, follow_up_at: null,
    updates: [{ update_id: 1, update_type: 'status', source: 'staff', update_date: '2026-11-04', note: 'They called back', evidence_url: null, status_after: 'acknowledged', recorded_by: 2, recorded_by_name: 'Leader One', recorded_at: '2026-11-04T01:00:00+00:00' }, { update_id: 2, update_type: 'status', source: 'staff', update_date: '2026-11-05', note: 'Visit booked', evidence_url: null, status_after: 'in_progress', recorded_by: 2, recorded_by_name: 'Leader One', recorded_at: '2026-11-05T01:00:00+00:00' }] }],
  followups: [{ followup_id: 8, kind: 'warning_end', title: 'End of observation', notes: null, due_at: '2026-11-12T00:00:00+00:00', status: 'pending', referral_id: null, created_by: 2, created_by_name: 'Leader One', created_at: '2026-11-03T00:00:00+00:00', completed_at: null, completion_note: null, cancel_reason: null },
    { followup_id: 9, kind: 'post_closure', title: 'Post-closure check', notes: 'n', due_at: '2026-12-01T00:00:00+00:00', status: 'pending', referral_id: null, created_by: 2, created_by_name: null, created_at: '2026-11-03T00:00:00+00:00', completed_at: null, completion_note: null, cancel_reason: null }],
  contacts: [{ log_id: 3, method: 'phone', with_whom: 'Olive (owner)', summary: 'Said she will fence the yard', outcome: 'cooperative', contact_at: '2026-11-03T03:00:00+00:00', logged_by: 2, logged_by_name: 'Leader One' }],
  warnings: [{ warning_id: 12, warning_level: '1st Warning', violation_type: 'Other', status: 'Pending', owner_user_id: 9, owner_name: 'Owner Olive', description: 'Keep the dog on a leash.', issued_by: 2, issued_by_name: 'Leader One', policy_id: 'p1', policy_title: 'Leash rule', policy_reference: 'House Rules §6.1', observation_days: 3, follow_up_at: '2026-11-12T00:00:00+00:00', fine_amount: 0, created_at: '2026-11-09T00:00:00+00:00',
    observations: [{ observation_id: 5, warning_id: 12, result: 'partial', observed_at: '2026-11-10T00:00:00+00:00', notes: 'Leashed twice', concluded: null, by: 2, by_name: 'Leader One', recorded_at: '2026-11-10T01:00:00+00:00' }], concluded: null, concluded_at: null }],
  claims: [{ claim_id: 6, report_id: 158, status: 'needs_info', statement: 'That is my dog', evidence: ['photos'], submitted_at: '2026-11-05T00:00:00+00:00', reviewed_at: '2026-11-06T00:00:00+00:00', review_note: 'Send a photo', claimant_user_id: 9, claimant_name: 'Owner Olive', claimed_pet_id: 31, evidence_urls: [], reviewed_by: 2 }],
  links: [{ link_id: 1, report_id: 150, link_type: 'related', note: null, linked_at: '2026-11-04T00:00:00+00:00' }],
  allowed_moves: ['under_review'], can_reopen: false, warning_eligibility: { ok: true, reason: null },
  ...over,
});

const report = () => ({
  report_id: 158, created_at: '2026-11-01T01:00:00+00:00', reporter_name: 'Rita Reporter',
  media: [{ media_id: 1, file_url: 'https://img.test/a.jpg', media_type: 'Image', uploaded_at: '2026-11-01T01:00:00+00:00' }, { media_id: 2, file_url: 'https://img.test/b.mp4', media_type: 'Video', uploaded_at: '2026-11-01T01:01:00+00:00' }, { media_id: 3, file_url: 'https://img.test/c.jpg', media_type: 'Image', uploaded_at: '2026-11-01T01:02:00+00:00' }],
  history: [{ history_id: 1, remarks: 'Case status changed to Under review.', created_at: '2026-11-02T05:30:00+00:00', updater_name: 'Leader One' }, { history_id: 2, remarks: 'Case closed: Owner compliance verified.', created_at: '2026-11-08T05:30:00+00:00', updater_name: null }],
});

test('animal types and titles are read from what the report says', () => {
  assert.equal(animalTypeOf('Dog'), 'dog');
  assert.equal(animalTypeOf('Small mammal'), 'small_mammal');
  assert.equal(animalTypeOf('Unknown'), 'other');
  assert.equal(animalTypeOf(null), 'other');
  assert.equal(animalTypeOf('Dragon'), 'other');
  assert.equal(caseTitle('lost_pet', 'dog', 'Gate 2'), 'Missing dog, Gate 2');
  assert.equal(caseTitle('nuisance', 'cat', null), 'Cat causing a nuisance');
  assert.equal(caseTitle('safety', 'wildlife', '  '), 'Safety concern: wild animal');
  assert.equal(animalDescription({ breed: 'Labrador mix', color: 'Brown', size: 'Medium' }), 'Brown, medium size, Labrador mix');
  assert.equal(animalDescription({ breed: null, color: null, size: null }), 'No description of the animal was given.');
});

test('a list row becomes a case with the reference, status, priority, pin and last event, and nothing invented', () => {
  const c = caseFromSummary(summary(), lookup);
  assert.equal(c.id, 'SS-2026-0158');
  assert.equal(c.status, 'under_review');
  assert.equal(c.priority, 'high');
  assert.equal(c.category, 'nuisance');
  assert.equal(c.title, 'Dog causing a nuisance, Gate 2');
  assert.deepEqual([c.location.area, c.location.lat, c.location.lng], ['Gate 2', 14.8, 121]);
  assert.equal(c.animal.count, 2);
  assert.equal(c.reporter.name, 'Rita Reporter');
  assert.equal(c.reporter.phone, '0917 123 4567');
  assert.equal(c.assignedTo, 'Unassigned');
  assert.equal(c.timeline.length, 1);
  assert.equal(c.timeline[0].kind, 'status');
  assert.equal(c.timeline[0].actor, 'Leader One');
  assert.equal(c.updatedAt, '2026-11-02T05:30:00.000Z');
  assert.deepEqual([c.followUps, c.warnings, c.referrals, c.claims, c.notes, c.evidence], [[], [], [], [], [], []]);
  assert.equal(c.closure, null);
});

test('a report with no pin has no coordinates, and an unnamed place says so', () => {
  const c = caseFromSummary(summary({ location: { landmark: null, latitude: null, longitude: null } }), lookup);
  assert.equal(c.location.area, 'Location not named');
  assert.ok(!('lat' in c.location) && !('lng' in c.location));
});

test('a reporter who is not in the directory shows only the name', () => {
  const c = caseFromSummary(summary({ reporter: { user_id: 99, name: 'Someone' } }), lookup);
  assert.deepEqual([c.reporter.name, c.reporter.phone, c.reporter.email, c.reporter.residentId], ['Someone', '—', '—', '99']);
});

test('a closed case carries its documented closure, and a legacy closure with no disposition is not called resolved', () => {
  const closed = caseFromSummary(summary({ case_status: 'closed', closure: { disposition: 'owner_compliance', outcome: 'resolved', label: 'x', reason: 'Fenced the yard.', closed_at: '2026-11-08T05:30:00+00:00', closed_by: 2, derived_from_legacy_status: false } }), lookup);
  assert.deepEqual([closed.closure.disposition, closed.closure.outcome, closed.closure.closedBy, closed.closure.reason], ['owner_compliance', 'resolved', 'Leader One', 'Fenced the yard.']);
  const legacy = caseFromSummary(summary({ case_status: 'closed', closure: { disposition: null, outcome: null, label: null, reason: null, closed_at: null, closed_by: null, derived_from_legacy_status: true } }), lookup);
  assert.deepEqual([legacy.closure.disposition, legacy.closure.outcome, legacy.closure.closedBy], ['unresolved_other', 'unresolved', 'A case officer']);
});

test('timeline wording is read into an icon kind, and unknown wording stays "info"', () => {
  assert.equal(eventKindOf('Case status changed to In progress.'), 'status');
  assert.equal(eventKindOf('Case moved to Under review.'), 'status');
  assert.equal(eventKindOf('Case closed: Owner compliance verified.'), 'closure');
  assert.equal(eventKindOf('Case reopened.'), 'reopen');
  assert.equal(eventKindOf('⚠️ WARNING ISSUED: Official 1st Warning'), 'warning');
  assert.equal(eventKindOf('Observation ended: the owner complied.'), 'compliance');
  assert.equal(eventKindOf('Neighborhood alert published to 40 residents by Leader One.'), 'notice');
  assert.equal(eventKindOf('Something nobody planned for'), 'info');
});

test('the whole case: assessment, ownership, referrals (newest note first), follow-ups, claims, links, evidence, timeline', () => {
  const base = caseFromSummary(summary(), lookup);
  const notes = [{ note_id: 2, report_id: 158, text: 'Second note', by: 2, by_name: 'Leader One', at: '2026-11-07T00:00:00+00:00' }];
  const c = applyDetail(base, detail(), report(), notes, lookup);

  assert.deepEqual([c.status, c.priority, c.sensitive, c.assignedTo], ['in_progress', 'urgent', true, 'Leader One']);
  assert.equal(c.animal.type, 'small_mammal');
  assert.equal(c.description, 'The full report text.');
  assert.ok(!('lat' in c.location));

  assert.deepEqual([c.assessment.incident, c.assessment.incidentBasis, c.assessment.evidenceReviewed, c.assessment.savedBy], ['verified', 'The guard saw it too.', ['m1'], 'Leader One']);
  assert.deepEqual([c.identity.status, c.identity.matches], ['identified', { 31: 'confirmed' }]);
  assert.deepEqual([c.ownership.status, c.ownership.ownerResidentId, c.ownership.evidence], ['confirmed', '9', ['photos']]);

  assert.equal(c.evidence.length, 3);
  assert.deepEqual(c.evidence.map((e) => [e.id, e.kind, e.label]), [['m1', 'photo', 'Photo 1'], ['m2', 'video', 'Video 1'], ['m3', 'photo', 'Photo 2']]);
  assert.equal(c.evidence[0].url, 'https://img.test/a.jpg');

  const ref = c.referrals[0];
  assert.deepEqual([ref.id, ref.orgId, ref.orgName, ref.status, ref.contactChannel], ['4', 'vet_office', 'City Veterinary Office', 'acknowledged', 'Phone call']);
  assert.deepEqual(ref.notes.map((n) => n.text), ['Visit booked', 'They called back']);
  assert.equal(ref.updatedAt, '2026-11-05T01:00:00.000Z');

  assert.deepEqual(c.followUps.map((f) => [f.id, f.kind, f.status]), [['8', 'warning_end', 'pending'], ['9', 'post_closure', 'pending']]);
  assert.deepEqual([c.ownerContacts[0].method, c.ownerContacts[0].outcome], ['phone', 'cooperative']);
  assert.deepEqual([c.claims[0].status, c.claims[0].claimantName, c.claims[0].reviewedBy, c.claims[0].claimedPetId], ['needs_info', 'Owner Olive', 'Leader One', '31']);
  assert.deepEqual(c.relatedCaseIds, ['SS-2026-0150']);
  assert.deepEqual(c.notes.map((n) => [n.id, n.by, n.text]), [['n2', 'Leader One', 'Second note']]);

  // timeline: the neutral lines, the note, and the report itself, newest first
  assert.deepEqual(c.timeline.map((e) => e.kind), ['closure', 'note', 'status', 'reported']);
  assert.equal(c.timeline[0].actor, 'System');
  assert.equal(c.updatedAt, c.timeline[0].at);
});

test('the original submission is on the case timeline once, even though the server also writes a line for it', () => {
  const base = caseFromSummary(summary(), lookup);
  const withOriginal = report();
  withOriginal.history = [{ history_id: 0, remarks: 'Initial report submitted by resident.', created_at: '2026-11-01T01:00:00+00:00', updater_name: 'Rita Reporter' }, ...withOriginal.history];
  const c = applyDetail(base, detail(), withOriginal, [], lookup);
  assert.deepEqual(c.timeline.map((e) => e.kind), ['closure', 'status', 'reported']);
  assert.equal(c.timeline.filter((e) => /submitted/i.test(e.title)).length, 1);
  assert.equal(isOriginalSubmission('  Initial report submitted by resident.'), true);
  assert.equal(isOriginalSubmission('Case status changed to Under review.'), false);
  assert.equal(isOriginalSubmission(null), false);
});

test('an unnamed referral organisation gets the Admin UI\'s own name; an unknown type is "other"', () => {
  assert.equal(orgIdOf('veterinary'), 'vet_office');
  assert.equal(orgIdOf('animal_welfare'), 'welfare');
  assert.equal(orgIdOf('something'), 'other');
  assert.equal(orgTypeOf('vet_office'), 'veterinary');
  assert.equal(orgTypeOf('welfare'), 'animal_welfare');
  assert.equal(orgTypeOf('barangay'), 'barangay');
  assert.equal(orgTypeOf('mystery'), 'other');
});

test('a post-closure follow-up is read back onto the closure as the follow-up check', () => {
  const base = caseFromSummary(summary(), lookup);
  const closed = detail({ case_status: 'closed', closure: { disposition: 'unresolved_other', outcome: 'unresolved', label: 'x', reason: 'Closed for the test.', closed_at: '2026-11-08T05:30:00+00:00', closed_by: 2, derived_from_legacy_status: false } });
  const c = applyDetail(base, closed, report(), [], lookup);
  assert.equal(c.closure.followUpCheck, '2026-12-01T00:00:00.000Z');
});

test('a warning is active until an officer concludes it; a closed case ends it as "Case closed."', () => {
  const w = detail().warnings[0];
  const active = warningFromApi(w, null);
  assert.deepEqual([active.id, active.status, active.observationDays, active.delivery, active.ownerName], ['12', 'active', 3, 'in_app', 'Owner Olive']);
  assert.equal(active.observations[0].result, 'partial');
  assert.equal(active.observationStart, '2026-11-09T00:00:00.000Z');
  assert.equal(active.observationEnd, '2026-11-12T00:00:00.000Z');

  const concluded = warningFromApi({ ...w, concluded: 'compliant', concluded_at: '2026-11-10T02:00:00+00:00' }, null);
  assert.deepEqual([concluded.status, concluded.outcome, concluded.outcomeNote], ['concluded', 'compliant', 'Leashed twice']);

  const closure = { disposition: 'unresolved_other', outcome: 'unresolved', reason: '', followUpCheck: null, closedAt: '2026-11-11T00:00:00.000Z', closedBy: 'Leader One' };
  const ended = warningFromApi(w, closure);
  assert.deepEqual([ended.status, ended.outcome, ended.outcomeNote, ended.concludedAt], ['concluded', 'other', 'Case closed.', '2026-11-11T00:00:00.000Z']);

  const noPeriod = warningFromApi({ ...w, observation_days: null, follow_up_at: null }, null);
  assert.deepEqual([noPeriod.observationDays, noPeriod.observationStart, noPeriod.observationEnd], [null, null, null]);
});

test('the work queue fills the open items of a case that has not been opened, and leaves an opened case alone', () => {
  const a = caseFromSummary(summary(), lookup);
  const b = caseFromSummary(summary({ report_id: 159, reported_at: '2026-11-02T01:00:00+00:00' }), lookup);
  const queue = {
    followups: [{ followup_id: 1, report_id: 158, kind: 'site_check', title: 'Check the gate', notes: null, due_at: '2026-11-10T01:00:00+00:00', status: 'pending', referral_id: null, created_by: 2, created_by_name: 'Leader One', created_at: '2026-11-03T00:00:00+00:00', completed_at: null, completion_note: null, cancel_reason: null },
      { followup_id: 2, report_id: 159, kind: 'follow_up', title: 'Call back', notes: null, due_at: null, status: 'pending', referral_id: null, created_by: 2, created_by_name: null, created_at: '2026-11-03T00:00:00+00:00', completed_at: null, completion_note: null, cancel_reason: null }],
    claims: [{ claim_id: 3, report_id: 158, status: 'submitted', statement: 'Mine', evidence: [], submitted_at: '2026-11-05T00:00:00+00:00', reviewed_at: null, review_note: null, claimant_user_id: 9, claimant_name: 'Owner Olive', claimed_pet_id: null, evidence_urls: [], reviewed_by: null }],
    referrals: [{ referral_id: 4, report_id: 158, org_type: 'wildlife', org_name: 'Wildlife Unit', status: 'sent', is_urgent: false, reason: 'Hawk', referred_at: '2026-11-03T02:00:00+00:00', follow_up_at: null, contact_person: null, contact_detail: null, updated_at: '2026-11-04T02:00:00+00:00' }],
    warnings: [{ warning_id: 5, report_id: 159, owner_user_id: 9, owner_name: 'Owner Olive', policy_id: 'p1', policy_title: 'P', policy_reference: 'Ord. 1', observation_days: 3, follow_up_at: '2026-11-12T00:00:00+00:00', status: 'Pending', created_at: '2026-11-09T00:00:00+00:00', description: 'x' }],
  };
  const out = applyQueue([a, b], queue, new Set(['SS-2026-0159']), lookup);
  assert.deepEqual([out[0].followUps.length, out[0].claims.length, out[0].referrals.length], [1, 1, 1]);
  assert.equal(out[0].referrals[0].updatedAt, '2026-11-04T02:00:00.000Z');
  assert.deepEqual([out[1].followUps.length, out[1].warnings.length], [0, 0], 'an opened case keeps its own full record');
  assert.equal(a.followUps.length, 0, 'the input is not changed');
  const fresh = applyQueue([a, b], queue, new Set(), lookup);
  assert.deepEqual([fresh[1].followUps.length, fresh[1].warnings.length, fresh[1].warnings[0].status], [1, 1, 'active']);
});

test('addresses split into a unit and a street; a resident is active, pending or suspended', () => {
  assert.deepEqual(splitAddress('Blk 4 Lot 12, Molave St.'), { unit: 'Blk 4 Lot 12', street: 'Molave St.' });
  assert.deepEqual(splitAddress('Blk 4, Lot 12, Molave St.'), { unit: 'Blk 4', street: 'Lot 12, Molave St.' });
  assert.deepEqual(splitAddress('Clubhouse'), { unit: 'Clubhouse', street: '' });
  assert.deepEqual(splitAddress(null), { unit: 'Address not recorded', street: '' });
  const user = { user_id: 7, name: 'Rita', email: 'r@x.test', phone: null, role_id: 1, address: 'Blk 4, Molave St.', status: 'Active', is_verified: true, created_at: '2026-01-01T00:00:00+00:00', last_login: null, position_name: null, subdivision_name: 'Selera', subdivision_id: 1 };
  assert.equal(residentFromUser(user, []).status, 'active');
  assert.equal(residentFromUser({ ...user, is_verified: false }, []).status, 'pending');
  assert.equal(residentFromUser({ ...user, status: 'Suspended' }, []).status, 'suspended');
  assert.equal(residentFromUser({ ...user, status: 'Inactive' }, []).status, 'suspended');
  const r = residentFromUser(user, ['3']);
  assert.deepEqual([r.phone, r.lastActiveAt === r.joinedAt, r.petIds], ['—', true, ['3']]);
});

test('a pet record: type, colours, marks, photos, vaccination as the owner declared it', () => {
  const pet = { pet_id: 31, pet_name: 'Mochi', pet_type: 'Dog', breed: null, color_markings: 'Brown and white', primary_color: 'Brown', secondary_color: 'White', gender: 'Female', estimated_age: null, birth_date: '2022-05-01', size_category: 'Small',
    distinctive_markings: 'white patch, torn left ear; red collar', health_condition: null, notes: 'Shy', photo_url: 'https://img.test/p.jpg', photo_front_url: null, photo_left_url: 'https://img.test/l.jpg', photo_right_url: null, owner_id: 9, created_at: '2026-02-01T00:00:00+00:00', is_vaccinated: true, vaccine_expiry: '2026-12-01', status: 'Active' };
  const p = petFromApi(pet, NOW);
  assert.deepEqual([p.id, p.type, p.sex, p.size, p.vaccination, p.ownerId, p.photos, p.microchipped], ['31', 'dog', 'female', 'small', 'up_to_date', '9', 2, false]);
  assert.equal(p.breed, 'Not recorded');
  assert.equal(p.color, 'Brown, White, Brown and white');
  assert.deepEqual(p.markings, ['white patch', 'torn left ear', 'red collar']);
  assert.equal(p.ageText, 'Born 2022-05-01');
  assert.equal(petFromApi({ ...pet, vaccine_expiry: '2026-01-01' }, NOW).vaccination, 'overdue');
  assert.equal(petFromApi({ ...pet, is_vaccinated: false }, NOW).vaccination, 'unknown');
  assert.equal(petFromApi({ ...pet, owner_id: null }, NOW).ownerId, '');
  assert.deepEqual([...petIdsByOwner([pet, { ...pet, pet_id: 32 }, { ...pet, pet_id: 33, owner_id: null }])], [[9, ['31', '32']]]);
});

test('notices: a lost-pet alert is a draft until the Leader publishes it, and a closed one is archived with its reason', () => {
  const alert = (over = {}) => ({ alert_id: 12, report_id: 158, status: 'requested', alert_type: 'lost_pet', pet: { name: 'Mochi', photo_url: 'https://img.test/p.jpg', species: 'Dog', breed: null, color: null, description: null },
    last_seen: { at: '2026-11-01T01:00:00+00:00', location: 'Near the clubhouse' }, owner_note: 'Very shy', leader_message: null, requested_at: '2026-11-01T02:00:00+00:00', activated_at: null, closed_at: null, close_outcome: null, close_reason: null, requested_by: 7, sighting_count: 0, ...over });
  const draft = noticeFromAlert(alert(), lookup);
  assert.deepEqual([draft.id, draft.type, draft.status, draft.caseId, draft.source, draft.title, draft.description, draft.location], ['alert-12', 'lost_pet', 'draft', 'SS-2026-0158', 'resident', 'Missing dog: Mochi', 'Very shy', 'Near the clubhouse']);
  assert.equal(draft.media[0].url, 'https://img.test/p.jpg');
  const live = noticeFromAlert(alert({ status: 'active', activated_at: '2026-11-02T00:00:00+00:00', leader_message: 'Please keep an eye out.', requested_by: 2 }), lookup);
  assert.deepEqual([live.status, live.publishedAt, live.description, live.source], ['published', '2026-11-02T00:00:00.000Z', 'Please keep an eye out.', 'admin']);
  const closed = noticeFromAlert(alert({ status: 'closed', closed_at: '2026-11-05T00:00:00+00:00', close_outcome: 'not_found', close_reason: 'Never seen again.' }), lookup);
  assert.deepEqual([closed.status, closed.archivedReason], ['archived', 'Never seen again.']);
  const found = noticeFromAlert(alert({ alert_type: 'found_animal', pet: { name: 'Found animal', photo_url: null, species: 'Cat', breed: null, color: null, description: null } }), lookup);
  assert.deepEqual([found.type, found.title, found.media], ['found_animal', 'Found cat near Near the clubhouse', []]);
  assert.deepEqual([noticeRef('alert-12'), noticeRef('ann-7'), noticeRef('notice-3'), noticeRef('new')], [{ kind: 'alert', id: 12 }, { kind: 'announcement', id: 7 }, null, null]);
});

test('a safety advisory is an announcement: Draft, Published or Archived', () => {
  const ann = { announcement_id: 7, title: 'Rabies vaccination reminder', category: 'Animal Advisory', visibility: 'Subdivision Only', content: 'Please vaccinate.', pinned: false, expiration: null, location: 'Selera Homes', posted_by: 'Leader One', posted_on: '2026-11-01T01:00:00+00:00', status: 'Published', media: [{ media_id: 1, file_url: 'https://img.test/n.jpg', media_type: 'Image', caption: null }] };
  const n = noticeFromAnnouncement(ann);
  assert.deepEqual([n.id, n.type, n.status, n.caseId, n.author, n.publishedAt], ['ann-7', 'safety_advisory', 'published', null, 'Leader One', '2026-11-01T01:00:00.000Z']);
  assert.equal(n.media[0].url, 'https://img.test/n.jpg');
  assert.equal(noticeFromAnnouncement({ ...ann, status: 'Draft' }).publishedAt, null);
  assert.equal(noticeFromAnnouncement({ ...ann, status: 'Archived' }).status, 'archived');
});

test('notifications: the kind is read from the type or title; a lost-pet alert id is never taken for a report id', () => {
  const n = (over) => notificationFromApi({ notification_id: 1, type: 'status_update', title: 'Report #158 was updated', message: 'm', related_id: 158, is_read: false, created_at: '2026-11-02T00:00:00+00:00', ...over });
  assert.equal(n({}).kind, 'case_activity');
  assert.equal(n({}).caseId, 'SS-2026-0158');
  assert.equal(n({ type: 'lost_pet_alert_request', title: 'Neighborhood alert requested' }).kind, 'new_report');
  assert.equal(n({ type: 'lost_pet_alert_request', title: 'Neighborhood alert requested' }).caseId, undefined);
  assert.equal(n({ type: 'claim_submitted', title: 'Ownership claim' }).kind, 'ownership_claim');
  assert.equal(n({ type: 'followup_due', title: 'Follow-up due' }).kind, 'follow_up');
  assert.equal(n({ type: 'x', title: 'Urgent: dog bite' }).kind, 'urgent');
  assert.equal(n({ related_id: null }).caseId, undefined);
  assert.equal(n({ is_read: true }).read, true);
});

const prefs = (over = {}) => ({ email_reports: true, email_rescues: false, email_pet_matches: false, email_claims: true, email_reminders: true, push_enabled: true, push_reports: true, push_rescues: false, push_pet_matches: false, push_claims: true, push_adoptions: true, push_messages: false, push_show_preview: true, ...over });

test('notification toggles round-trip through the server flags, so what is saved is what is read back', () => {
  const read = notificationSettingsFrom(prefs());
  assert.deepEqual(read, { newReports: true, urgent: true, followUps: true, claims: true, caseActivity: false, channels: { inApp: true, email: true, push: true } });
  const written = notificationFlagsFrom({ ...read, caseActivity: true });
  const again = notificationSettingsFrom({ ...prefs(), ...written });
  assert.deepEqual(again, { ...read, caseActivity: true });
  // turning email off clears every email flag; turning push off sets the master switch
  const off = notificationFlagsFrom({ ...read, channels: { inApp: true, email: false, push: false } });
  assert.deepEqual([off.email_reports, off.email_reminders, off.email_claims, off.email_rescues, off.push_enabled], [false, false, false, false, false]);
  const back = notificationSettingsFrom({ ...prefs(), ...off });
  assert.deepEqual([back.channels.email, back.channels.push, back.newReports], [false, false, true]);
});

test('settings: categories, policies and publication come from the case settings, the office from the profile, the name is the subdivision\'s', () => {
  const cs = { categories: { lost_pet: true, found_animal: true, nuisance: false, safety: true, injured: true, other: true }, policies: [{ id: 'p1', title: 'Leash rule', reference: 'House Rules §6.1', summary: 's', applies_to: ['nuisance', 'safety'], observation_days: 3, status: 'confirmed' }, { id: 'p2', title: 'Noise', reference: '§6.5', summary: '', applies_to: ['nuisance'], observation_days: null, status: 'pending_confirmation' }],
    followups: { default_days: 7, min_days: 1, max_days: 60 }, publication: { lost_pet: 'immediate', found_animal: 'review' }, office: { address: 'Clubhouse', phone: '02 8123 4567', email: 'o@x.test', hours: 'Mon-Fri' } };
  const cats = { subdivision_id: 1, subdivision: { name: 'Selera Homes', city: 'Test City', office: cs.office }, categories: [] };
  const s = settingsFrom(cs, cats, prefs());
  assert.deepEqual([s.subdivision.name, s.subdivision.city, s.subdivision.address, s.subdivision.officeHours], ['Selera Homes', 'Test City', 'Clubhouse', 'Mon-Fri']);
  assert.equal(s.categories.nuisance, false);
  assert.deepEqual([s.policies[0].appliesTo, s.policies[0].observationDays, s.policies[1].observationDays, s.policies[1].status], [['nuisance', 'safety'], 3, null, 'pending_confirmation']);
  assert.deepEqual(s.privacy, { lostPetPublication: 'immediate', foundPublication: 'review' });
  const back = caseSettingsTo({ ...s, subdivision: { ...s.subdivision, officePhone: '  02 8000 0000 ' } }, cs);
  assert.deepEqual(back.followups, cs.followups, 'the follow-up bounds the screen does not edit are kept');
  assert.equal(back.office.phone, '02 8000 0000');
  assert.deepEqual(back.policies, cs.policies);
  assert.deepEqual(back.publication, cs.publication);
});

test('the profile shows the Leader\'s own position, not an invented title', () => {
  const user = { user_id: 2, name: 'Leader One', email: 'l@x.test', phone: '0917', role_id: 2, address: null, status: 'Active', is_verified: true, created_at: '2026-01-05T00:00:00+00:00', last_login: null, position_name: 'HOA President', subdivision_name: 'Selera Homes', subdivision_id: 1, role_name: 'Subdivision Leader' };
  const p = profileFromUser(user);
  assert.deepEqual([p.id, p.title, p.role, p.subdivision, p.memberSince], ['2', 'HOA President', 'Subdivision Leader', 'Selera Homes', '2026-01-05T00:00:00.000Z']);
  assert.equal(profileFromUser({ ...user, position_name: null }).title, 'Subdivision Leader');
});

test('the server\'s lifecycle numbers become the shape the analytics page reads (share is a fraction, weeks are dates)', () => {
  const a = analyticsFromApi({ case_lifecycle: { received: 10, closed: 4, resolved_share: 75, median_days_to_close: 3.5,
    timeline: [{ start_date: '2026-11-02', received: 6, closed: 1 }, { start_date: '2026-11-09', received: 4, closed: 3 }],
    categories: [{ id: 'nuisance', label: 'Animal Nuisance', count: 6 }],
    outcomes: [{ group: 'resolved', count: 3, items: [{ id: 'owner_compliance', label: 'Owner compliance verified', count: 3 }] }, { group: 'unresolved', count: 1, items: [] }, { group: 'invalid', count: 0, items: [] }],
    referrals: { total: 3, by_org: [{ name: 'Vet Office', count: 2 }], by_status: [{ status: 'sent', count: 2 }, { status: 'completed', count: 1 }] } } });
  assert.deepEqual([a.received, a.closed, a.resolvedShare, a.medianDays], [10, 4, 0.75, 3.5]);
  assert.equal(a.weekly.length, 2);
  assert.ok(a.weekly[0].start instanceof Date);
  assert.deepEqual(a.weekly.map((w) => [w.received, w.closed]), [[6, 1], [4, 3]]);
  assert.deepEqual(a.outcomes.map((o) => [o.group, o.label, o.count]), [['resolved', 'Resolved', 3], ['unresolved', 'Not resolved', 1], ['invalid', 'No action needed', 0]]);
  assert.deepEqual(a.referrals, { total: 3, byOrg: [{ id: 'Vet Office', name: 'Vet Office', count: 2 }], byStatus: [{ status: 'sent', label: 'Sent', count: 2 }, { status: 'completed', label: 'Completed externally', count: 1 }] });
  const empty = analyticsFromApi({ case_lifecycle: { received: 0, closed: 0, resolved_share: null, median_days_to_close: null, timeline: [], categories: [], outcomes: [], referrals: { total: 0, by_org: [], by_status: [] } } });
  assert.deepEqual([empty.resolvedShare, empty.medianDays, empty.weekly], [null, null, []]);
});
