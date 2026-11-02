import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    formatObservationRemaining,
    normalizeFollowUpDuration
} from '../src/utils/ownerFollowUpTime.ts';
import {
    REPORT_STATUS_MAP,
    CLOSED_REPORT_STATUS_IDS,
    isReportClosed,
    getReportStatusBadgeStyle
} from '../src/utils/reportStatus.ts';

test('formatObservationRemaining calculates remaining observation time correctly', () => {
    const futureDue = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const result = formatObservationRemaining(futureDue);
    assert.equal(result.isOverdue, false);
    assert.ok(result.text.includes('remaining'));
    assert.ok(result.percentLeft > 0);
});

test('formatObservationRemaining marks past deadlines as overdue', () => {
    const pastDue = new Date(Date.now() - 5 * 3600 * 1000).toISOString();
    const result = formatObservationRemaining(pastDue);
    assert.equal(result.isOverdue, true);
    assert.ok(result.text.toLowerCase().includes('overdue'));
    assert.equal(result.percentLeft, 100);
});

test('formatObservationRemaining handles null or empty dates safely', () => {
    const result = formatObservationRemaining(null);
    assert.equal(result.isOverdue, false);
    assert.equal(result.text, 'No due date');
    assert.equal(result.percentLeft, 0);
});

test('normalizeFollowUpDuration returns valid default or positive integer', () => {
    assert.equal(normalizeFollowUpDuration(null), 3);
    assert.equal(normalizeFollowUpDuration(0), 3);
    assert.equal(normalizeFollowUpDuration(-2), 3);
    assert.equal(normalizeFollowUpDuration(5), 5);
    assert.equal(normalizeFollowUpDuration(14), 14);
});

test('REPORT_STATUS_MAP maps status 7 to Under Observation and maintains open status', () => {
    assert.equal(REPORT_STATUS_MAP[7], 'Under Observation');
    assert.equal(isReportClosed(7), false);
    assert.ok(!CLOSED_REPORT_STATUS_IDS.includes(7));
    const badgeClass = getReportStatusBadgeStyle(7);
    assert.ok(badgeClass.includes('amber'));
});
