import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getOriginalSighting, getReportSighting } from '../src/utils/originalSighting.ts';

test('a current facility cannot fill in a blank original landmark', () => {
    const result = getOriginalSighting({ initial_landmark: '', initial_latitude: '14.80141775', initial_longitude: '121.00406153', landmark: 'Animal Impound Facility', latitude: 14.807, longitude: 121.004 });
    assert.equal(result.landmark, null);
    assert.equal(result.label, '14.801418, 121.004062');
    assert.deepEqual(result.point, [14.80141775, 121.00406153]);
});

test('missing origins do not acquire current coordinates or a current address', () => {
    assert.deepEqual(getOriginalSighting({ landmark: 'Animal Impound Facility', latitude: 14.807, longitude: 121.004 }), { landmark: null, point: null, label: null });
    assert.equal(getOriginalSighting(null).label, null);
});

test('preserves an explicitly recorded facility sighting', () => {
    assert.equal(getOriginalSighting({ initial_landmark: 'Animal Impound Facility' }).label, 'Animal Impound Facility');
});

test('invalid, blank, or incomplete coordinate pairs cannot make a map pin', () => {
    for (const initial_latitude of [null, undefined, '', ' ', NaN, Infinity, 91, true]) {
        assert.equal(getOriginalSighting({ initial_latitude, initial_longitude: 121 }).point, null);
    }
    assert.equal(getOriginalSighting({ initial_latitude: 14, initial_longitude: 181 }).point, null);
    assert.equal(getOriginalSighting({ initial_latitude: 14 }).point, null);
    assert.deepEqual(getOriginalSighting({ initial_latitude: 0, initial_longitude: 0 }).point, [0, 0]);
});

test('placeholder origins do not claim to be recorded landmarks', () => {
    assert.equal(getOriginalSighting({ initial_landmark: ' Incident Sighting Location ' }).label, null);
    assert.equal(getOriginalSighting({ initial_landmark: ' Near the basketball court ' }).label, 'Near the basketball court');
});

test('match reviews keep the full saved sighting precision instead of moving to a rounded or facility pin', () => {
    const original = { initial_latitude: '14.80108707', initial_longitude: '121.00457400', initial_landmark: 'Rose Street' };
    assert.deepEqual(getReportSighting({ ...original, latitude: 14.801, longitude: 121.005 }).point, [14.80108707, 121.004574]);
    const moved = getReportSighting({ ...original, latitude: 14.8069, longitude: 121.0039, landmark: 'Holding Facility', current_status_id: 8 });
    assert.deepEqual(moved.point, [14.80108707, 121.004574]);
    assert.equal(moved.landmark, 'Rose Street');
});

test('legacy reports use the complete report point while still at the sighting', () => {
    assert.deepEqual(getReportSighting({ latitude: '14.80108707', longitude: '121.00457400', landmark: 'Rose Street', current_status_id: 2 }).point, [14.80108707, 121.004574]);
    assert.equal(getReportSighting({ latitude: '', longitude: 121 }).point, null);
    assert.equal(getReportSighting({ latitude: 0, longitude: 0 }).point, null);
});

test('a missing origin after relocation does not put the sighting at the holding facility', () => {
    for (const state of [{ current_status_id: 8 }, { custody_status: 'In Barangay Facility' }, { facility_id: 2 }]) {
        assert.equal(getReportSighting({ ...state, latitude: 14.8069, longitude: 121.0039 }).point, null);
    }
});

test('switching sightings selects each report independently without mixing coordinate pairs', () => {
    const first = { initial_latitude: 14.80108707, initial_longitude: 121.004574 };
    const second = { initial_latitude: 14.80234567, initial_longitude: 121.00567891 };
    assert.deepEqual(getReportSighting(first).point, [14.80108707, 121.004574]);
    assert.deepEqual(getReportSighting(second).point, [14.80234567, 121.00567891]);
    assert.equal(getReportSighting({ initial_latitude: 14.8, initial_longitude: null, latitude: 14.81, longitude: 121.01, current_status_id: 8 }).point, null);
});
