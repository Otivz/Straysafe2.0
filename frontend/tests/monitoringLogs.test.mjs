import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    MONITORING_METHOD_LABELS,
    MONITORING_OUTCOME_LABELS,
    getMonitoringMethodLabel,
    getMonitoringOutcomeLabel,
    sortMonitoringLogs,
    mergeMonitoringLog,
    createMonitoringRequestId,
    getMonitoringLogErrorMessage,
} from '../src/utils/monitoringLogs.ts';

const log = (id, createdAt, extra = {}) => ({
    contact_log_id: id,
    followup_id: 1,
    report_id: 1,
    pet_id: 1,
    logged_by: 2,
    logger_name: 'Subd Leader',
    logger_role: 'Subdivision Leader',
    contact_type: 'Other',
    inspection_method: 'observation',
    inspection_outcome: 'pet_secured',
    contact_date: createdAt,
    notes: 'note',
    created_at: createdAt,
    ...extra,
});

test('form options match the backend MonitoringMethod and MonitoringOutcome values', () => {
    // Compared as sets: display order is a UI choice, the accepted values must match the backend Literals.
    const sorted = (o) => Object.keys(o).sort();
    assert.deepEqual(sorted(MONITORING_METHOD_LABELS), ['direct_owner', 'in_person', 'observation', 'other', 'phone', 'sms']);
    assert.deepEqual(sorted(MONITORING_OUTCOME_LABELS), [
        'no_answer', 'no_improvement', 'other', 'owner_complied', 'owner_not_available',
        'pet_secured', 'pet_still_roaming', 'spoke_with_owner', 'violation_observed',
    ]);
});

test('labels fall back for contact logs saved before inspection fields existed', () => {
    assert.equal(getMonitoringMethodLabel(log(1, '2026-10-31T10:00:00')), 'On-Site Visual Inspection');
    assert.equal(getMonitoringMethodLabel({ inspection_method: null, contact_type: 'Phone Call' }), 'Phone Call');
    assert.equal(getMonitoringOutcomeLabel({ inspection_outcome: null }), null);
    assert.equal(getMonitoringOutcomeLabel({ inspection_outcome: 'no_answer' }), 'No Answer / Premises Unattended');
});

test('history is newest first, with the id breaking same-second ties', () => {
    const sorted = sortMonitoringLogs([
        log(1, '2026-10-30T09:00:00'),
        log(3, '2026-10-31T09:00:00'),
        log(2, '2026-10-31T09:00:00'),
    ]);
    assert.deepEqual(sorted.map((l) => l.contact_log_id), [3, 2, 1]);
});

test('merging the saved row never duplicates it', () => {
    const existing = [log(1, '2026-10-30T09:00:00')];
    const saved = log(2, '2026-10-31T09:00:00');
    const once = mergeMonitoringLog(existing, saved);
    const twice = mergeMonitoringLog(once, saved);
    assert.deepEqual(twice.map((l) => l.contact_log_id), [2, 1]);
    assert.deepEqual(mergeMonitoringLog(undefined, saved).map((l) => l.contact_log_id), [2]);
});

test('request ids are unique and within the backend length limits', () => {
    const a = createMonitoringRequestId();
    const b = createMonitoringRequestId();
    assert.notEqual(a, b);
    assert.ok(a.length >= 8 && a.length <= 64);
});

test('error messages never claim success and keep entries', () => {
    assert.equal(getMonitoringLogErrorMessage({ response: { data: { detail: 'Observation record not found.' } } }), 'Observation record not found.');
    assert.equal(
        getMonitoringLogErrorMessage({ response: { data: { detail: [{ msg: 'Value error, Staff notes are required.' }] } } }),
        'Staff notes are required.'
    );
    assert.match(getMonitoringLogErrorMessage({ request: {}, isAxiosError: true }), /Could not reach the server/);
    assert.match(getMonitoringLogErrorMessage({ response: { status: 500, data: {} } }), /could not be saved/);
    assert.equal(getMonitoringLogErrorMessage(new Error('Unexpected response')), 'Unexpected response');
});
