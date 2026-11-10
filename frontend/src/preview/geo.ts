/**
 * Geography shared by the two StraySafe 2.0 interfaces (src/admin and src/resident): the reporting area, the registered landmarks
 * and the distance rules. The connected apps replace the built-in area and landmarks with the server's own (GET /reports/coverage-area,
 * GET /landmarks) before any screen shows. One copy of the subdivision coordinates: the outline, the centre and the radius rule come
 * from `utils/coverageArea.ts`, which makes no network call.
 */
import {
  SELERA_DEFAULT_CENTER, SELERA_DEFAULT_POLYGON, calculateDistanceMeters, getPolygonLatLngs, isValidLatLng, isWithinCoverage,
  type CoverageAreaInfo,
} from '../utils/coverageArea';

export { isValidLatLng };

export type LatLng = [number, number];
export interface Point { lat: number; lng: number }
/** A circle around a rounded point: how a community view shows "about here" without showing an exact spot. */
export interface GeneralArea { lat: number; lng: number; radiusM: number }

/** Where the maps open. */
export const AREA_CENTER: LatLng = SELERA_DEFAULT_CENTER;

// ------------------------------------------------------------------------------------------------ reporting area (radius)
/**
 * Built-in reporting radius, used only until the server's own (GET /reports/coverage-area, `radius_meters`) has been read. The
 * server restricts reports with a RADIUS around the subdivision centre (`is_inside_reporting_coverage`); the outline is drawn but
 * never enforced.
 */
const DEFAULT_REPORTING_RADIUS_M = 500;

const defaultCoverage = (): CoverageAreaInfo => ({
  id: 0,
  subdivision_id: 1,
  center_label: 'Selera Homes',
  center_latitude: AREA_CENTER[0],
  center_longitude: AREA_CENTER[1],
  radius_meters: DEFAULT_REPORTING_RADIUS_M,
  boundary_polygon: SELERA_DEFAULT_POLYGON,
  is_active: true,
});

export interface AreaCheck { inside: boolean; distanceM: number; limitM: number }

// ---------------------------------------------------------------------------------------- the connected app's own geography
/**
 * The connected app replaces the built-in reporting area and landmarks with the server's own
 * (GET /reports/coverage-area, GET /landmarks) before any screen shows. It is a plain module value,
 * not React state: it is written once, when the connected app has loaded, and read when a map or a location check is drawn.
 */
let live: { coverage: CoverageAreaInfo | null; landmarks: Landmark[] | null } = { coverage: null, landmarks: null };
export function setLiveGeography(next: { coverage: CoverageAreaInfo | null; landmarks: Landmark[] | null }): void { live = next; }
export function clearLiveGeography(): void { live = { coverage: null, landmarks: null }; }
/** The reporting area in force: the server's, or the built-in default until it has been read. */
export const reportingCoverage = (): CoverageAreaInfo => live.coverage ?? defaultCoverage();
/** The registered landmarks to offer: the server's, or the built-in ones until they have been read. */
export const registeredLandmarks = (): Landmark[] => live.landmarks ?? REGISTERED_LANDMARKS;
/** Where the maps open. */
export const areaCenter = (): LatLng => { const c = reportingCoverage(); return [c.center_latitude, c.center_longitude]; };
/**
 * The outline drawn on the maps (the server's boundary when it has one; else the built-in outline). The built-in outline is APPROXIMATE and
 * UNVERIFIED (four hand-picked corners, no survey or plat behind it), so no screen may call it official or surveyed. Never used to accept
 * or refuse a report.
 */
export const areaOutline = (): LatLng[] => getPolygonLatLngs(reportingCoverage().boundary_polygon);

/** The radius rule (`isWithinCoverage`) applied to the reporting area in force. The same check is used everywhere in the apps. */
export function checkReportingArea(lat: number, lng: number): AreaCheck {
  const r = isWithinCoverage(lat, lng, reportingCoverage());
  return { inside: r.isInside, distanceM: r.distance, limitM: r.allowedRadius };
}

export const distanceM = (a: Point, b: Point): number => calculateDistanceMeters(a.lat, a.lng, b.lat, b.lng);

// ----------------------------------------------------------------------------------------------------------- landmarks
export interface Landmark { id: number; name: string; lat: number; lng: number }

/**
 * Registered landmarks of Selera Homes, from the `landmarks` table seed (rows 1 and 3 of `Database3.4_subdivision.sql`).
 * Only places residents can describe are listed: the Barangay impound facility is an operational site (the community holding
 * pen that used to be row 2 was removed from the seed). The connected apps replace them with GET /landmarks.
 */
export const REGISTERED_LANDMARKS: Landmark[] = [
  { id: 1, name: 'Selera Homes Main Entrance Gate', lat: 14.801496, lng: 121.005174 },
  { id: 3, name: 'Selera Community Park & Clubhouse', lat: 14.800634, lng: 121.002228 },
];

export const landmarkLabel = (l: Landmark): string => `Near ${l.name}`;

/** The registered landmark closest to a point, when it is close enough to say "near". */
export function nearestLandmark(lat: number, lng: number, withinM = 80): Landmark | null {
  let best: { l: Landmark; d: number } | null = null;
  for (const l of registeredLandmarks()) {
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
 * around it. The server rounds the same way for a pet owner's match card ("~100 m: the area, not the house",
 * `report_visibility._match_card`) and does the redaction itself.
 */
export function generalize(lat: number, lng: number): GeneralArea {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return { lat: round(lat), lng: round(lng), radiusM: GENERAL_AREA_RADIUS_M };
}

// ------------------------------------------------------------------------------------------------------------- tiles
/** The one tile source, as used by every map. No API key. */
export const OSM_TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
} as const;
