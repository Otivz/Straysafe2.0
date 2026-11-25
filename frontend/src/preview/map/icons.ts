import L from 'leaflet';

/** CSS-drawn markers (see map.css): no image assets, which bundlers tend to break. */
export const pinIcon = L.divIcon({ className: 'pv-pin', html: '<span></span>', iconSize: [30, 38], iconAnchor: [15, 36] });

const landmarks = new Map<number, L.DivIcon>();

/** A numbered reference-landmark pin (sage teardrop with upright index). */
export function landmarkPinIcon(n: number): L.DivIcon {
  let icon = landmarks.get(n);
  if (!icon) {
    icon = L.divIcon({
      className: 'pv-landmark',
      html: `<span><em>${n}</em></span>`,
      iconSize: [26, 32],
      iconAnchor: [13, 30],
    });
    landmarks.set(n, icon);
  }
  return icon;
}

const arrows = new Map<number, L.DivIcon>();

/** An arrowhead turned along a leg (degrees clockwise from north), rounded to 5 so a few icons are reused. */
export function arrowIcon(bearing: number): L.DivIcon {
  const key = Math.round(bearing / 5) * 5 % 360;
  let icon = arrows.get(key);
  if (!icon) {
    icon = L.divIcon({ className: 'pv-arrow', html: `<span style="transform:rotate(${key}deg)"></span>`, iconSize: [18, 18], iconAnchor: [9, 9] });
    arrows.set(key, icon);
  }
  return icon;
}

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
