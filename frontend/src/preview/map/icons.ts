import L from 'leaflet';

/** CSS-drawn markers (see map.css): no image assets, which bundlers tend to break. */
export const pinIcon = L.divIcon({ className: 'pv-pin', html: '<span></span>', iconSize: [30, 38], iconAnchor: [15, 36] });

const dots = new Map<string, L.DivIcon>();

/** A numbered sighting marker. The most recent one is ringed. */
export function dotIcon(n: number, latest: boolean): L.DivIcon {
  const key = `${n}|${latest}`;
  let icon = dots.get(key);
  if (!icon) {
    icon = L.divIcon({ className: `pv-dot${latest ? ' pv-dot--latest' : ''}`, html: `<span>${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    dots.set(key, icon);
  }
  return icon;
}
