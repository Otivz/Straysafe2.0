import L from 'leaflet';
import { orderedSightings, sightingPlace, type Sighting } from '../../utils/lostPets';

// Pin icons shared by the Lost Pet Tracking Map and the report maps, so a sighting has the same number and color on
// both: the original last-known location (red) and each resident sighting (numbered, amber; green once verified;
// gray when dismissed; blue ring on the latest submitted). Pins are separate reports: they are never joined into a route.
export const lastSeenIcon = L.divIcon({
    className: '', iconSize: [34, 34], iconAnchor: [17, 34],
    html: '<div style="width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#dc2626;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center"><span style="transform:rotate(45deg);font-size:15px">🐾</span></div>',
});

export const sightingIcon = (n: number, status: Sighting['status'], latest: boolean) => L.divIcon({
    className: '', iconSize: [28, 28], iconAnchor: [14, 14],
    html: `<div data-sighting-pin="${n}" style="width:28px;height:28px;border-radius:9999px;background:${status === 'verified' ? '#059669' : status === 'dismissed' ? '#9ca3af' : '#f59e0b'};color:#fff;font:800 12px sans-serif;display:flex;align-items:center;justify-content:center;border:${latest ? '3px solid #1d4ed8' : '2px solid #fff'};box-shadow:0 1px 4px rgba(0,0,0,.35)">${n}</div>`,
});

/** The sighting pins for a report map (MapComponent markers), numbered and colored exactly like the tracking map. */
export function reportSightingMarkers(sightings: Sighting[], latestId?: number | null) {
    return orderedSightings(sightings).map((s, i) => ({
        id: -(100000 + s.sighting_id),
        lat: Number(s.latitude),
        lng: Number(s.longitude),
        title: `Sighting ${i + 1}${s.sighting_id === latestId ? ' · latest' : ''} · ${sightingPlace(s)}`,
        category: 'Neighbor Sighting',
        priority: 'Low',
        icon: sightingIcon(i + 1, s.status, s.sighting_id === latestId),
    }));
}
