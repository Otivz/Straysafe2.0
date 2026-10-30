import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    CLOSED_STATUS_IDS, distanceMeters, findHotspots, heatPoints, isActiveReport, isInDateRange, isValidIncident,
} from '../src/utils/heatmap.ts';

const NOW = new Date('2026-10-27T12:00:00');
const daysAgo = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();
// About 11 m per 0.0001 degree of latitude near Selera Homes
const near = (i, extra = {}) => ({
    report_id: i, status_id: 2, category_id: 4, created_at: daysAgo(1),
    initial_latitude: 14.8005 + i * 0.0001, initial_longitude: 121.0034, ...extra,
});

test('the closed list matches the backend', () => {
    const py = readFileSync(new URL('../../backend/app/utils/case_closure.py', import.meta.url), 'utf8');
    const match = py.match(/CLOSED_REPORT_STATUS_IDS\s*=\s*\{([^}]*)\}/);
    assert.ok(match, 'CLOSED_REPORT_STATUS_IDS not found in case_closure.py');
    const backend = match[1].split(',').map(s => Number(s.trim())).filter(Number.isFinite).sort((a, b) => a - b);
    assert.deepEqual([...CLOSED_STATUS_IDS].sort((a, b) => a - b), backend);
});

test('Picked Up, Disputed and Under Investigation are active; resolved statuses are not', () => {
    for (const id of [1, 2, 4, 5, 6, 7, 8, 13, 15, 16]) assert.equal(isActiveReport({ status_id: id }), true, `status ${id}`);
    for (const id of [3, 9, 10, 11, 12, 14, 17, 18]) assert.equal(isActiveReport({ status_id: id }), false, `status ${id}`);
    assert.equal(isActiveReport({ current_status_id: 6 }), true);
});

test('rejected, false alarm and merged reports are not incidents; resolved ones are', () => {
    for (const id of [3, 14, 18]) assert.equal(isValidIncident({ status_id: id }), false);
    for (const id of [9, 10, 11, 12, 17]) assert.equal(isValidIncident({ status_id: id }), true);
});

test('heat uses the original sighting, not the facility the animal was moved to', () => {
    const moved = { status_id: 8, initial_latitude: 14.80091084, initial_longitude: 121.00298613, latitude: 14.806906, longitude: 121.0039297 };
    assert.deepEqual(heatPoints([moved]), [[14.80091084, 121.00298613, 0.6]]);
    // no saved origin after a move: left off the heat layer rather than placed at the facility
    assert.deepEqual(heatPoints([{ status_id: 8, latitude: 14.806906, longitude: 121.0039297, custody_status: 'In Barangay Facility' }]), []);
});

test('heat leaves out invalid reports and lost pets unless asked, and weighs High priority more', () => {
    const reports = [near(1, { priority_level: 'High' }), near(2, { status_id: 14 }), near(3, { category_id: 6 }), near(4, { status_id: 11 })];
    assert.deepEqual(heatPoints(reports).map(p => p[2]), [1.0, 0.6]);
    assert.equal(heatPoints(reports, true).length, 3);
});

test('date presets', () => {
    const r = { created_at: daysAgo(45) };
    assert.equal(isInDateRange(r, '30d', '', '', NOW), false);
    assert.equal(isInDateRange(r, '90d', '', '', NOW), true);
    assert.equal(isInDateRange(r, 'all', '', '', NOW), true);
    assert.equal(isInDateRange({ created_at: daysAgo(3) }, '7d', '', '', NOW), true);
    assert.equal(isInDateRange({ created_at: '2026-10-10T09:00:00' }, 'custom', '2026-10-01', '2026-10-15', NOW), true);
    assert.equal(isInDateRange({ created_at: '2026-10-16T09:00:00' }, 'custom', '2026-10-01', '2026-10-15', NOW), false);
});

test('distance', () => {
    const d = distanceMeters([14.8005, 121.0034], [14.8010, 121.0034]);
    assert.ok(d > 54 && d < 57, `${d}`);
});

test('3 incidents within 50 m make a hotspot, 5 make High Incident Density', () => {
    assert.deepEqual(findHotspots([near(0), near(1)], { now: NOW }), []);
    const three = findHotspots([near(0), near(1), near(2)], { now: NOW });
    assert.equal(three.length, 1);
    assert.equal(three[0].count, 3);
    assert.equal(three[0].level, 'Hotspot');
    const five = findHotspots([0, 1, 2, 3, 4].map(i => near(i)), { now: NOW });
    assert.equal(five[0].level, 'High Incident Density');
});

test('incidents further than 50 m apart do not form a hotspot', () => {
    const spread = [0, 6, 12].map(i => near(i)); // 0.0006 degrees apart, about 66 m
    assert.deepEqual(findHotspots(spread, { now: NOW }), []);
});

test('hotspots count only the last 30 days and only valid incidents', () => {
    const old = [0, 1, 2].map(i => near(i, { created_at: daysAgo(40) }));
    assert.deepEqual(findHotspots(old, { now: NOW }), []);
    const withFalseAlarm = [near(0), near(1), near(2, { status_id: 14 })];
    assert.deepEqual(findHotspots(withFalseAlarm, { now: NOW }), []);
    const resolved = [near(0, { status_id: 11 }), near(1, { status_id: 9 }), near(2)];
    assert.equal(findHotspots(resolved, { now: NOW })[0].count, 3);
});

test('lost pets do not create hotspots unless included', () => {
    const lost = [0, 1, 2].map(i => near(i, { category_id: 6 }));
    assert.deepEqual(findHotspots(lost, { now: NOW }), []);
    assert.equal(findHotspots(lost, { now: NOW, includeLostPets: true }).length, 1);
});

test('an incident belongs to one hotspot, and the label is the most common recorded landmark', () => {
    const a = [0, 1, 2].map(i => near(i, { initial_landmark: i < 2 ? 'Fuschia St.' : 'Rose St.' }));
    const b = [0, 1, 2].map(i => near(i + 50, { report_id: 100 + i })); // about 550 m away
    const spots = findHotspots([...a, ...b], { now: NOW });
    assert.equal(spots.length, 2);
    assert.equal(new Set(spots.flatMap(s => s.reportIds)).size, 6);
    assert.equal(spots.find(s => s.reportIds.includes(0)).label, 'Fuschia St.');
    assert.match(spots.find(s => s.reportIds.includes(100)).label, /^\d+\.\d{5}, \d+\.\d{5}$/);
});

test('group animals, merged links and repeated API rows cannot inflate density', () => {
    const root = near(20);
    const children = [near(21, { split_from_report_id: 20 }), near(22, { split_from_report_id: 20 })];
    const merged = near(23, { duplicate_of_report_id: 20 });
    assert.equal(heatPoints([root, ...children, merged, { ...root }]).length, 1);
    assert.deepEqual(findHotspots([root, ...children, merged, { ...root }], { now: NOW }), []);
    assert.equal(isActiveReport(merged), false);
});

test('Manila custom dates include both endpoints and reject invalid/reversed ranges', () => {
    const within = created_at => isInDateRange({ created_at }, 'custom', '2026-10-10', '2026-10-10', NOW);
    assert.equal(within('2026-10-09T16:00:00.000Z'), true);
    assert.equal(within('2026-10-10T15:59:59.999Z'), true);
    assert.equal(within('2026-10-09T15:59:59.999Z'), false);
    assert.equal(within('2026-10-10T16:00:00.000Z'), false);
    assert.equal(isInDateRange(near(1), 'custom', '2026-10-20', '2026-10-10', NOW), false);
    assert.equal(isInDateRange(near(1), 'custom', '2026-02-31', '', NOW), false);
});

test('rolling windows include their boundary but exclude future timestamps', () => {
    assert.equal(isInDateRange({ created_at: daysAgo(30) }, '30d', '', '', NOW), true);
    assert.equal(isInDateRange({ created_at: daysAgo(30.001) }, '30d', '', '', NOW), false);
    assert.equal(isInDateRange({ created_at: daysAgo(-1) }, '30d', '', '', NOW), false);
    assert.deepEqual(findHotspots([0, 1, 2].map(i => near(i, { created_at: daysAgo(-1) })), { now: NOW }), []);
});

test('empty data, invalid coordinates and adoption-related closures remain well defined', () => {
    assert.deepEqual(heatPoints([]), []);
    assert.deepEqual(findHotspots([], { now: NOW }), []);
    assert.deepEqual(heatPoints([near(1, { initial_latitude: 120, latitude: null, longitude: null })]), []);
    for (const status_id of [9, 10, 11, 12, 17]) {
        const historical = near(status_id, { status_id });
        assert.equal(isActiveReport(historical), false);
        assert.equal(heatPoints([historical]).length, 1, 'a closed outcome remains a historical incident');
    }
});
