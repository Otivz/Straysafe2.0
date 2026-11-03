// Readable place names for map pins (reverse geocoding answers from OpenStreetMap Nominatim, utils/geocode.ts).
// A name always comes from the answer for the exact pin; nothing is invented. Coordinates are kept as they are.

interface NominatimAddress {
    road?: string; pedestrian?: string; footway?: string; path?: string; residential?: string; street?: string;
    neighbourhood?: string; quarter?: string; suburb?: string; village?: string; hamlet?: string; city_district?: string;
    town?: string; city?: string; municipality?: string; county?: string; state?: string; province?: string; region?: string;
}
export interface NominatimReverse { name?: string; display_name?: string; address?: NominatimAddress; error?: string }

const uniq = (parts: Array<string | undefined>) => {
    const out: string[] = [];
    for (const p of parts) {
        const t = (p || '').trim();
        if (t && !out.some(o => o.toLowerCase() === t.toLowerCase())) out.push(t);
    }
    return out;
};

/**
 * "Near {street}, {area}, {town}, {province}" for a reverse-geocoded pin. Without a street: the nearest named place,
 * then the area. Null when the answer has nothing usable (the caller keeps showing the coordinates).
 */
export function formatPlaceName(geo: NominatimReverse | null | undefined): string | null {
    if (!geo || geo.error) return null;
    const a = geo.address || {};
    const street = a.road || a.pedestrian || a.footway || a.path || a.street || a.residential;
    const area = a.neighbourhood || a.quarter || a.suburb || a.village || a.hamlet || a.city_district;
    const town = a.town || a.city || a.municipality;
    const province = a.province || a.state || a.county;
    const lead = street || (geo.name && geo.name !== area && geo.name !== town ? geo.name : undefined);
    const parts = uniq([lead, area, town, province]);
    if (parts.length) return lead ? `Near ${parts.join(', ')}` : parts.join(', ');
    const display = uniq((geo.display_name || '').split(',')).slice(0, 4);
    return display.length ? display.join(', ') : null;
}

/** Coordinates shown with 6 decimals (about 0.1 m), the precision residents can read and copy. */
export const fmtCoord = (n: number | string | null | undefined) =>
    n === null || n === undefined || n === '' || !Number.isFinite(Number(n)) ? '—' : Number(n).toFixed(6);
