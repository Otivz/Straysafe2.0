// Phase 8: owner observation in the case stages and the "where is it now" line (docs/01-system/ACTIVITY_TIMELINE_RULES.md)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCaseStages, getWhereNow, formatObservationDue } from '../src/utils/caseStages.ts';

const due = '2026-11-04T05:00:00+00:00';
const base = { report_id: 1, created_at: '2026-11-01T01:00:00', history: [] };
const text = (w) => w.parts.map((p) => p.text).join('');

test('an open owner observation reads "Under observation until <date>", not safe care at a holding place', () => {
    const report = { ...base, status_id: 7, custody_status: 'Sighting', observation: { open: true, status: 'observing', due_at: due, extended: false, ended_at: null, outcome: null } };
    const stages = getCaseStages(report, null);
    assert.ok(stages.currentLabel.startsWith('Under observation until '), stages.currentLabel);
    assert.equal(stages.steps[stages.currentIndex].key, 'checked');
    assert.ok(!stages.currentLabel.toLowerCase().includes('holding place'));
    const where = text(getWhereNow(report, stages, null, 'Gate 2'));
    assert.ok(where.includes('the owner has until'), where);
});

test('the observation label also shows while the report status is still Verified', () => {
    const report = { ...base, status_id: 2, observation: { open: true, status: 'observing', due_at: due, extended: true, ended_at: null, outcome: null } };
    assert.ok(getCaseStages(report, null).currentLabel.startsWith('Under observation until '));
});

test('after the observation ends, the under-observation state is removed', () => {
    const report = { ...base, status_id: 7, custody_status: 'Sighting', observation: { open: false, status: 'closed', due_at: due, extended: false, ended_at: '2026-11-05T01:00:00+00:00', outcome: 'closed by the subdivision' } };
    const stages = getCaseStages(report, null);
    assert.ok(!stages.currentLabel.startsWith('Under observation'), stages.currentLabel);
    assert.equal(stages.currentLabel, 'Observation ended; the subdivision decides the next step');
    assert.ok(text(getWhereNow(report, stages, null, null)).includes('observation has ended'));
});

test('status 7 without an owner observation (a bite case observed at a facility) keeps the care step', () => {
    const stages = getCaseStages({ ...base, status_id: 7 }, null);
    assert.equal(stages.steps[stages.currentIndex].key, 'care');
    assert.equal(stages.currentLabel, 'In safe care at a holding place');
});

test('an animal held in a facility stays in care even if an observation exists', () => {
    const report = { ...base, status_id: 7, custody_status: 'Secured in Facility', observation: { open: true, status: 'observing', due_at: due, extended: false, ended_at: null, outcome: null } };
    assert.equal(getCaseStages(report, null).steps[getCaseStages(report, null).currentIndex].key, 'care');
});

test('a closed case shows its outcome, not the observation', () => {
    const report = { ...base, status_id: 11, observation: { open: false, status: 'complied', due_at: due, extended: false, ended_at: due, outcome: 'the owner complied' } };
    const stages = getCaseStages(report, null);
    assert.equal(stages.outcome, 'good');
    assert.equal(stages.currentLabel, 'Case resolved');
});

test('empty history and a missing due date are handled', () => {
    const report = { ...base, status_id: 7, history: undefined, observation: { open: true, status: 'observing', due_at: null, extended: false, ended_at: null, outcome: null } };
    assert.equal(getCaseStages(report, null).currentLabel, 'Under observation by the subdivision');
    assert.equal(formatObservationDue('not a date'), null);
    assert.equal(formatObservationDue(null), null);
});
