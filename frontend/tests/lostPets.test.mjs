// Lost pet sighting timeline (docs/01-system/LOST_PET_SIGHTING_PING.md): last known location first, sightings by
// reported time, the newest submission flagged; reported and submitted times kept separate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTimeline } from '../src/utils/lostPets.ts';

const s = (id, seen, submitted, label = null) => ({ sighting_id: id, latitude: 0, longitude: 0, location_label: label, location_source: 'map_pin',
    seen_at: seen, submitted_at: submitted, description: null, photo_url: null, status: 'unverified', reported_by: 'A neighbor', is_mine: false });
const alert = { last_seen: { at: '2026-11-02T16:30:00', location: 'Subdivision entrance', latitude: 1, longitude: 1 } };

test('last known location first, then sightings by reported time', () => {
    const t = buildTimeline(alert, [
        s(1, '2026-11-02T17:45:00', '2026-11-02T17:46:00', 'residential road'),
        s(2, '2026-11-02T17:15:00', '2026-11-02T17:50:00', 'Lot 15'),   // an earlier sighting submitted later
        s(3, '2026-11-02T17:32:00', '2026-11-02T17:33:00', 'clubhouse'),
    ]);
    assert.equal(t[0].kind, 'last_seen');
    assert.equal(t[0].label, 'Last known location: Subdivision entrance');
    assert.deepEqual(t.slice(1).map(i => i.sighting.sighting_id), [2, 3, 1]);
});

test('the latest submitted sighting is flagged, even when it reports an earlier time', () => {
    const t = buildTimeline(alert, [s(1, '2026-11-02T17:45:00', '2026-11-02T17:46:00'), s(2, '2026-11-02T17:15:00', '2026-11-02T17:50:00')]);
    assert.deepEqual(t.filter(i => i.latest).map(i => i.sighting.sighting_id), [2]);
    assert.equal(t.find(i => i.sighting?.sighting_id === 2).submitted_at, '2026-11-02T17:50:00');
    assert.equal(t.find(i => i.sighting?.sighting_id === 2).at, '2026-11-02T17:15:00');
});

test('no sightings: only the last known location, nothing flagged', () => {
    const t = buildTimeline(alert, []);
    assert.equal(t.length, 1);
    assert.equal(t.some(i => i.latest), false);
});
