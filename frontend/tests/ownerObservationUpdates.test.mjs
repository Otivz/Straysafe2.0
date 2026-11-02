import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    OWNER_COMPLIANCE_OPTIONS,
    OWNER_UPDATE_MAX_PHOTOS,
    checkOwnerUpdatePhotos,
    validateOwnerUpdateForm,
    sortOwnerUpdates,
    mergeOwnerUpdate,
    isObservationOpenForUpdates,
    getComplianceLabel,
    createOwnerUpdateRequestId,
    getApiErrorMessage,
} from '../src/utils/ownerObservationUpdates.ts';

const update = (id, submittedAt, extra = {}) => ({
    update_id: id,
    followup_id: 1,
    report_id: 1,
    pet_id: 1,
    animal_name: 'Bantay',
    owner_user_id: 1,
    owner_name: 'Owner',
    compliance_status: 'improving',
    owner_remarks: 'Fixed the gate.',
    submitted_at: submittedAt,
    photos: [],
    is_reviewed: false,
    reviewed_at: null,
    reviewed_by: null,
    reviewer_name: null,
    review_remarks: null,
    ...extra,
});

const file = (name, type, size = 1000) => ({ name, type, size });

test('compliance options match the backend OwnerComplianceStatus values', () => {
    assert.deepEqual(OWNER_COMPLIANCE_OPTIONS.map((o) => o.value), ['issue_resolved', 'improving', 'still_addressing', 'unable_to_comply']);
    assert.equal(getComplianceLabel('issue_resolved'), 'Issue Resolved');
    assert.equal(getComplianceLabel('unknown_value'), 'unknown_value');
});

test('form validation requires a status and real remarks', () => {
    assert.match(validateOwnerUpdateForm('', 'Fixed it'), /compliance status/);
    assert.match(validateOwnerUpdateForm('improving', '  '), /describe/);
    assert.match(validateOwnerUpdateForm('improving', 'x'.repeat(2001)), /2000/);
    assert.equal(validateOwnerUpdateForm('improving', 'Fixed the gate latch.'), null);
});

test('photo checks accept images only, up to 10 MB and 5 photos', () => {
    const r1 = checkOwnerUpdatePhotos([file('a.png', 'image/png'), file('b.gif', 'image/gif'), file('c.jpg', 'image/jpeg', 11 * 1024 * 1024)], 0);
    assert.deepEqual(r1.accepted.map((f) => f.name), ['a.png']);
    assert.equal(r1.errors.length, 2);
    const many = Array.from({ length: 4 }, (_, i) => file(`p${i}.webp`, 'image/webp'));
    const r2 = checkOwnerUpdatePhotos(many, 3);
    assert.equal(r2.accepted.length, OWNER_UPDATE_MAX_PHOTOS - 3);
    assert.match(r2.errors[0], /up to 5/);
});

test('history is newest first and merging never duplicates', () => {
    const sorted = sortOwnerUpdates([update(1, '2026-10-30T09:00:00'), update(3, '2026-10-31T09:00:00'), update(2, '2026-10-31T09:00:00')]);
    assert.deepEqual(sorted.map((u) => u.update_id), [3, 2, 1]);
    const reviewed = update(1, '2026-10-30T09:00:00', { is_reviewed: true, review_remarks: 'ok' });
    const merged = mergeOwnerUpdate(sorted, reviewed);
    assert.equal(merged.length, 3);
    assert.equal(merged.find((u) => u.update_id === 1).is_reviewed, true);
    assert.equal(merged.find((u) => u.update_id === 1).owner_remarks, 'Fixed the gate.');
});

test('updates are only open while the observation is active', () => {
    assert.equal(isObservationOpenForUpdates({ status: 'observing', workflow_section: 'active' }), true);
    assert.equal(isObservationOpenForUpdates({ status: 'observing', workflow_section: 'for_second_warning' }), true);
    assert.equal(isObservationOpenForUpdates({ status: 'observing', workflow_section: 'resolved' }), false);
    assert.equal(isObservationOpenForUpdates({ status: 'complied', workflow_section: 'resolved' }), false);
});

test('request ids are unique and within backend limits; errors never claim success', () => {
    const a = createOwnerUpdateRequestId();
    assert.notEqual(a, createOwnerUpdateRequestId());
    assert.ok(a.length >= 8 && a.length <= 64);
    assert.equal(getApiErrorMessage({ response: { data: { detail: 'Observation record not found for your account.' } } }, 'x'), 'Observation record not found for your account.');
    assert.match(getApiErrorMessage({ request: {}, isAxiosError: true }, 'x'), /Could not reach the server/);
    assert.equal(getApiErrorMessage({ response: { data: {} } }, 'fallback'), 'fallback');
});
