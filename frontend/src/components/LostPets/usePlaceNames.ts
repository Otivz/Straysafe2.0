import { useEffect, useState } from 'react';
import { nominatimReverse } from '../../utils/geocode';
import { formatPlaceName } from '../../utils/placeName';
import type { Sighting } from '../../utils/lostPets';

/**
 * Place names for sightings saved without one (older submissions): looked up from each sighting's own coordinates,
 * one at a time (Nominatim allows about one request per second; answers are cached per coordinate). Display only.
 */
export function usePlaceNames(sightings: Sighting[]): Record<number, string> {
    const [names, setNames] = useState<Record<number, string>>({});
    const missing = sightings.filter(s => !s.location_label && Number.isFinite(Number(s.latitude)) && Number.isFinite(Number(s.longitude)));
    const key = missing.map(s => `${s.sighting_id}:${s.latitude},${s.longitude}`).join('|');
    useEffect(() => {
        if (!key) return;
        let active = true;
        (async () => {
            for (const s of missing) {
                if (!active) return;
                try {
                    const geo = await nominatimReverse(s.latitude, s.longitude, { format: 'jsonv2', addressdetails: 1, zoom: 18, 'accept-language': 'en' }, { timeoutMs: 6000 });
                    const name = formatPlaceName(geo);
                    if (active && name) setNames(prev => ({ ...prev, [s.sighting_id]: name }));
                } catch { /* keep showing the coordinates */ }
                await new Promise(r => setTimeout(r, 1100));
            }
        })();
        return () => { active = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the sightings that need a name
    }, [key]);
    return names;
}
