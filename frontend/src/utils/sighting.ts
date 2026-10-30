import { nominatimReverse } from './geocode';
// Labels for a report's animal sighting on the maps. The subdivision's own name ("Selera Homes") belongs only to the
// subdivision boundary / recenter button: the report form saves it as the landmark when none was typed, so it is never
// used to label where an animal was seen.

export const SIGHTING_TITLE = 'Reported Animal Sighting';

// Not a real landmark: the subdivision name, or a placeholder written when nothing was entered
const NOT_A_LANDMARK = new Set([
    'selera homes', 'selera', 'incident location', 'initial sighting spot', 'sighting location', 'rescue site',
    'reported incident location', 'unknown', 'n/a', 'none',
]);
const FACILITY_WORDS = ['holding pen', 'holding facility', 'holding place', 'barangay holding'];

/** The landmark the reporter actually gave for the sighting, or null. */
export function sightingLandmark(raw: any): string | null {
    for (const v of [raw?.initial_landmark, raw?.landmark]) {
        const s = typeof v === 'string' ? v.trim() : '';
        if (!s) continue;
        const l = s.toLowerCase();
        if (NOT_A_LANDMARK.has(l) || FACILITY_WORDS.some((w) => l.includes(w))) continue;
        return s;
    }
    return null;
}

/** "Oct 12, 2026, 3:41 PM" from a report's created_at, or null. */
export function sightingDateTime(raw: any): string | null {
    const v = raw?.created_at || raw?.reported_at;
    if (!v) return null;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Street address from coordinates (OpenStreetMap), fetched only when a popup opens and remembered per spot
const addressCache = new Map<string, Promise<string | null>>();

export function reverseGeocodeStreet(lat: number, lng: number): Promise<string | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Promise.resolve(null);
    const key = `${lat.toFixed(5)},${lng.toFixed(5)}`;
    const hit = addressCache.get(key);
    if (hit) return hit;
    const p = nominatimReverse(lat, lng, { format: 'jsonv2', addressdetails: 1, 'accept-language': 'en' })
        .then((data) => {
            const a = data?.address;
            if (!a) return data?.display_name || null;
            const road = a.road || a.pedestrian || a.path || '';
            const area = a.neighbourhood || a.village || a.suburb || '';
            const city = a.city || a.town || a.municipality || '';
            const parts = [road, area !== road ? area : '', city].filter(Boolean);
            return parts.join(', ') || data.display_name || null;
        })
        .catch(() => null);
    addressCache.set(key, p);
    return p;
}
