// Sighting pin location names (docs/01-system/LOST_PET_SIGHTING_PING.md): built only from the reverse-geocoding answer
// for that exact pin; nearest named place when there is no street; null (coordinates only) when nothing usable.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fmtCoord, formatPlaceName } from '../src/utils/placeName.ts';

test('street, area, town and province, nearest first', () => {
    const geo = { address: { road: 'Sampaguita Street', neighbourhood: 'Phase 2', village: 'Barangay Test', town: 'Sample Town', province: 'Sample Province' } };
    assert.equal(formatPlaceName(geo), 'Near Sampaguita Street, Phase 2, Sample Town, Sample Province');
});

test('no street: the nearest named place, then the area', () => {
    assert.equal(formatPlaceName({ name: 'Clubhouse', address: { suburb: 'Phase 1', city: 'Sample City' } }), 'Near Clubhouse, Phase 1, Sample City');
    assert.equal(formatPlaceName({ address: { suburb: 'Phase 1', city: 'Sample City', state: 'Region X' } }), 'Phase 1, Sample City, Region X');
});

test('repeated parts are shown once', () => {
    assert.equal(formatPlaceName({ address: { road: 'Main Road', suburb: 'Sample City', city: 'Sample City' } }), 'Near Main Road, Sample City');
});

test('only display_name: its first four parts', () => {
    assert.equal(formatPlaceName({ display_name: 'A, B, C, D, E, F' }), 'A, B, C, D');
});

test('nothing usable or an error answer: null, so only the coordinates are shown', () => {
    assert.equal(formatPlaceName(null), null);
    assert.equal(formatPlaceName({ error: 'Unable to geocode' }), null);
    assert.equal(formatPlaceName({ address: {} }), null);
});

test('coordinates: 6 decimals, numeric strings accepted, a dash when missing', () => {
    assert.equal(fmtCoord(14.5995124), '14.599512');
    assert.equal(fmtCoord('120.98422100'), '120.984221');
    assert.equal(fmtCoord(-0.5), '-0.500000');
    assert.equal(fmtCoord(null), '—');
    assert.equal(fmtCoord(''), '—');
    assert.equal(fmtCoord('abc'), '—');
});
