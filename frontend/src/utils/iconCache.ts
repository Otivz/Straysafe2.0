import type L from 'leaflet';

// Map marker icons, reused for the same inputs (STRAYSAFE_PERFORMANCE_AUDIT.md M1 / C3).
// react-leaflet calls marker.setIcon() whenever a marker gets a different icon object, and Leaflet then rebuilds the
// pin's HTML. Building a fresh L.divIcon on every render therefore redrew every pin each time a page re-rendered.
// One icon object can safely be shared by many markers: Leaflet builds a separate element for each marker from it.
const cache = new Map<string, L.DivIcon>();

export function cachedIcon(key: string, build: () => L.DivIcon): L.DivIcon {
    let icon = cache.get(key);
    if (!icon) {
        if (cache.size > 500) cache.clear(); // never grows without limit (names / zoom levels are a small set anyway)
        icon = build();
        cache.set(key, icon);
    }
    return icon;
}
