import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getCaseStages, getWhereNow, openObservation } from '../src/utils/caseStages.ts';

// Owner follow-up entries as the server writes them in the report history (routes/owner_followups.py)
const entry = (id, remarks, created_at, report_status_id = null) => ({ history_id: id, remarks, created_at, report_status_id });
const verified = entry(1, 'Report verified', '2026-10-29T08:00:00', 2);
const started = entry(2, "Owner follow-up started: the subdivision contacted the pet's owner and is observing until Nov 01, 2026.", '2026-10-29T09:00:00');
const extended = entry(3, 'Owner follow-up extended: the subdivision is observing until Nov 04, 2026.', '2026-10-31T09:00:00');
const ended = entry(4, 'Owner follow-up ended (Owner complied): dog kept inside', '2026-11-01T09:00:00', 11);

test('an open observation shows in the stages and the "where now" line', () => {
    const report = { status_id: 2, created_at: '2026-10-29T07:00:00', history: [verified, started] };
    assert.deepEqual(openObservation(report), { until: 'Nov 01, 2026' });
    const stages = getCaseStages(report);
    assert.equal(stages.steps[1].label, 'Under observation');
    assert.equal(stages.steps[1].state, 'current');
    assert.equal(stages.currentLabel, 'Under observation until Nov 01, 2026');
    const where = getWhereNow(report, stages);
    assert.match(where.parts.map(p => p.text).join(''), /^Under observation: .*keep it confined.*until Nov 01, 2026\.$/);
});

test('an extension moves the date', () => {
    const report = { status_id: 2, history: [verified, started, extended] };
    assert.deepEqual(openObservation(report), { until: 'Nov 04, 2026' });
});

test('an ended observation is no longer shown, and a report without one keeps "Checked"', () => {
    assert.equal(openObservation({ status_id: 11, history: [verified, started, ended] }), null);
    const plain = getCaseStages({ status_id: 2, history: [verified] });
    assert.equal(plain.steps[1].label, 'Checked');
    assert.equal(plain.currentLabel, 'Checked by the subdivision');
});
