import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REPORT_STATUS_MAP, getReportStatusLabel, isSelectableReportStatus, normalizeReportStatusFilter } from '../src/utils/reportStatus.ts';

test('status 4 is labelled as a referral everywhere the shared map is used', () => {
    assert.equal(REPORT_STATUS_MAP[4], 'Referred to Barangay');
    assert.equal(getReportStatusLabel(4), 'Referred to Barangay');
});

test('legacy statuses remain readable but cannot be selected for new updates', () => {
    for (const id of [5, 6, 8, 13]) {
        assert.ok(getReportStatusLabel(id));
        assert.notEqual(getReportStatusLabel(id), 'Reported');
        assert.equal(isSelectableReportStatus(id), false);
    }
    for (const id of [2, 4, 7, 11, 16]) assert.equal(isSelectableReportStatus(id), true);
    assert.equal(isSelectableReportStatus(99), false);
});

test('old escalation bookmarks and new referral filters identify the same status', () => {
    for (const label of ['Escalated', 'Escalated to Barangay', 'escalated to barangay', 'Referred to Barangay', 'Referred to the Barangay']) {
        const params = new URLSearchParams('status=' + encodeURIComponent(label));
        assert.equal(normalizeReportStatusFilter(params.get('status')), REPORT_STATUS_MAP[4]);
    }
    assert.equal(normalizeReportStatusFilter(null), 'all');
    assert.equal(normalizeReportStatusFilter('Under Observation'), 'Under Observation');
});
