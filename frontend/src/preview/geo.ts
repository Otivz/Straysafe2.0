/**
 * Geography shared by the two UI previews (src/admin and src/resident). DEVELOPMENT ONLY: nothing here is reachable from
 * the production bundle, because only the previews import it.
 *
 * One copy of the subdivision coordinates: the outline, the centre and the radius rule all come from the legacy
 * `utils/coverageArea.ts`. Importing it adds no network call (only its `fetchCoverageArea()` and hooks make requests, and
 * the previews never call them), and the API client it imports is already loaded by `main.tsx` for every route.
 */
import {
  SELERA_DEFAULT_CENTER, SELERA_DEFAULT_POLYGON, SELERA_POLYGON_BOUNDS, calculateDistanceMeters, isValidLatLng, isWithinCoverage,
  type CoverageAreaInfo,
} from '../utils/coverageArea';

export { isValidLatLng };

export type LatLng = [number, number];
export interface Point { lat: number; lng: number }
/** A circle around a rounded point: how a community view shows "about here" without showing an exact spot. */
export interface GeneralArea { lat: number; lng: number; radiusM: number }

/** Where the maps open. */
export const AREA_CENTER: LatLng = SELERA_DEFAULT_CENTER;

/**
 * The outline drawn on the maps. It is APPROXIMATE and UNVERIFIED: four hand-picked corners (two of them are registered
 * landmarks), with no survey or plat behind it and no GeoJSON in the repository. It is never used to accept or refuse a
 * report, and no screen may call it official or surveyed.
 */
export const AREA_OUTLINE: LatLng[] = SELERA_POLYGON_BOUNDS;

// ------------------------------------------------------------------------------------------------ reporting area (radius)
/**
 * PREVIEW SETTING, not a confirmed production value.
 *
 * The legacy server restricts reports with a RADIUS around the subdivision centre (`is_inside_reporting_coverage`); the
 * outline is drawn but never enforced. The stored radius is 500 m in the database dump (`coverage_settings`, row updated
 * 2026-09-26) while the code default is 1,000 m, and neither has been confirmed as the production configuration.
 * 500 m is used here because it is the only value actually stored. To connect the real value, make `previewCoverage()`
 * return `await fetchCoverageArea()` (GET /reports/coverage-area → radius_meters); nothing else needs to change.
 */
export const PREVIEW_REPORTING_RADIUS_M = 500;

export const previewCoverage = (): CoverageAreaInfo => ({
  id: 0,
  subdivision_id: 1,
  center_label: 'Selera Homes',
  center_latitude: AREA_CENTER[0],
  center_longitude: AREA_CENTER[1],
  radius_meters: PREVIEW_REPORTING_RADIUS_M,
  boundary_polygon: SELERA_DEFAULT_POLYGON,
  is_active: true,
});

export interface AreaCheck { inside: boolean; distanceM: number; limitM: number }

/** The legacy radius rule (`isWithinCoverage`) applied to the preview setting. The same check is used everywhere in the previews. */
export function checkReportingArea(lat: number, lng: number): AreaCheck {
  const r = isWithinCoverage(lat, lng, previewCoverage());
  return { inside: r.isInside, distanceM: r.distance, limitM: r.allowedRadius };
}

export const distanceM = (a: Point, b: Point): number => calculateDistanceMeters(a.lat, a.lng, b.lat, b.lng);

// ----------------------------------------------------------------------------------------------------------- landmarks
export interface Landmark { id: number; name: string; lat: number; lng: number }

/**
 * Registered landmarks of Selera Homes, from the `landmarks` table seed (rows 1 and 3 of `Database3.3_subdivision.sql`,
 * identical in `straysafe_subdivision.sql`). Only places residents can describe are listed: the Temporary Holding Pen and
 * the Barangay impound facility are operational sites. Replace with GET /landmarks when connected.
 */
export const REGISTERED_LANDMARKS: Landmark[] = [
  { id: 1, name: 'Selera Homes Main Entrance Gate', lat: 14.801496, lng: 121.005174 },
  { id: 3, name: 'Selera Community Park & Clubhouse', lat: 14.800634, lng: 121.002228 },
];

export const landmarkLabel = (l: Landmark): string => `Near ${l.name}`;

/** The registered landmark closest to a point, when it is close enough to say "near". */
export function nearestLandmark(lat: number, lng: number, withinM = 80): Landmark | null {
  let best: { l: Landmark; d: number } | null = null;
  for (const l of REGISTERED_LANDMARKS) {
    const d = calculateDistanceMeters(lat, lng, l.lat, l.lng);
    if (d <= withinM && (!best || d < best.d)) best = { l, d };
  }
  return best?.l ?? null;
}

// ------------------------------------------------------------------------------------------------------ community views
/** Radius of the general area. Larger than the worst-case rounding error (about 77 m), so the true spot is always inside it. */
export const GENERAL_AREA_RADIUS_M = 120;

/**
 * What a community view may show instead of an exact spot: the position rounded to 0.001° (about 110 m) with a circle
 * around it. The legacy server rounds the same way for a pet owner's match card ("~100 m: the area, not the house",
 * `report_visibility._match_card`). The real API must do this redaction itself; the previews apply it in their selectors.
 */
export function generalize(lat: number, lng: number): GeneralArea {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { lat: round(lat), lng: round(lng), radiusM: GENERAL_AREA_RADIUS_M };
}

// ------------------------------------------------------------------------------------------------------- sample points
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const unit = (h: number, salt: number): number => ((Math.imul(h ^ salt, 2654435761) >>> 0) % 10000) / 10000;
const round6 = (v: number): number => Math.round(v * 1e6) / 1e6;

/**
 * SAMPLE coordinates for the preview mock data. They are made up, never real report positions. The same key always gives
 * the same point, and every point lies inside the approximate outline: a place that names a registered landmark (clubhouse,
 * park, gate) lands 25–60 m from it, anything else somewhere in the middle of the outline.
 */
export function samplePoint(key: string): Point {
  const k = key.toLowerCase();
  const h = hash(k);
  const find = (id: number) => REGISTERED_LANDMARKS.find((l) => l.id === id) as Landmark;
  const anchor = /clubhouse|\bpark\b/.test(k) ? find(3) : /\bgate\b|guardhouse|entrance/.test(k) ? find(1) : null;
  if (anchor) {
    const t = 0.15 + 0.2 * unit(h, 1); // a landmark sits on a corner of the outline, so step toward the centre to stay inside
    return { lat: round6(anchor.lat + t * (AREA_CENTER[0] - anchor.lat)), lng: round6(anchor.lng + t * (AREA_CENTER[1] - anchor.lng)) };
  }
  const u = 0.15 + 0.7 * unit(h, 2);
  const v = 0.15 + 0.7 * unit(h, 3);
  const [p0, p1, p2, p3] = AREA_OUTLINE; // a convex corner mix of the four corners stays inside the outline
  const mix = (i: 0 | 1) => (1 - u) * (1 - v) * p0[i] + u * (1 - v) * p1[i] + u * v * p2[i] + (1 - u) * v * p3[i];
  return { lat: round6(mix(0)), lng: round6(mix(1)) };
}

// ------------------------------------------------------------------------------------------------------------- tiles
/** The one tile source, as used by every legacy map. No API key. */
export const OSM_TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
} as const;
