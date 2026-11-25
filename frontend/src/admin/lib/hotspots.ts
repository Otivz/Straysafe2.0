import { distanceM, placeLabel } from '../../preview/geo';
import type { Case } from '../data/types';

/** Pins this close together (metres, to a cluster's centre) are one cluster. */
export const HOTSPOT_JOIN_M = 70;
/** A cluster of at least this many cases is a hotspot zone. */
export const HOTSPOT_MIN_CASES = 2;
const RADIUS_MIN_M = 45;
const RADIUS_MAX_M = 80;
const RADIUS_STEP_M = 7;
/** At this many cases (or with an open urgent case inside) a zone is red instead of amber. */
const RED_AT_CASES = 4;

export type PinnedCase = Case & { location: { lat: number; lng: number } };

export interface Hotspot {
  /** Stable for the same cases: the lowest case id in the zone, so a re-render keeps the same circle. */
  key: string;
  lat: number;
  lng: number;
  radiusM: number;
  tier: 'amber' | 'red';
  /** Where it is, named from the zone's centre (the pins), not from what the reports typed: "Near Clubhouse", "About 150 m north of ...". */
  area: string;
  total: number;
  urgent: number;
  open: number;
  closed: number;
  cases: PinnedCase[];
}

const isOpen = (c: Case) => c.status !== 'closed';
const isOpenUrgent = (c: Case) => c.priority === 'urgent' && isOpen(c);

/**
 * Hotspot zones, computed from the pinned cases it is given (never from fixed places): each case joins the first cluster whose centre is
 * within HOTSPOT_JOIN_M metres of it (the centre then moves to the average of its pins), else starts a new one. A cluster of two or more
 * cases is a zone. Cases are taken in id order so the result does not depend on the order they were passed in.
 */
export function computeHotspots(pinned: PinnedCase[]): Hotspot[] {
  const clusters: { lat: number; lng: number; cases: PinnedCase[] }[] = [];
  for (const c of [...pinned].sort((a, b) => a.id.localeCompare(b.id))) {
    const here = { lat: c.location.lat, lng: c.location.lng };
    let target = clusters[0];
    let nearest = Infinity;
    for (const cl of clusters) {
      const d = distanceM(here, cl);
      if (d <= HOTSPOT_JOIN_M && d < nearest) { target = cl; nearest = d; }
    }
    if (!target || nearest === Infinity) {
      clusters.push({ ...here, cases: [c] });
      continue;
    }
    target.cases.push(c);
    target.lat = target.cases.reduce((s, x) => s + x.location.lat, 0) / target.cases.length;
    target.lng = target.cases.reduce((s, x) => s + x.location.lng, 0) / target.cases.length;
  }
  return clusters
    .filter((cl) => cl.cases.length >= HOTSPOT_MIN_CASES)
    .map((cl) => {
      const total = cl.cases.length;
      const urgent = cl.cases.filter(isOpenUrgent).length;
      return {
        key: cl.cases[0].id,
        lat: cl.lat,
        lng: cl.lng,
        radiusM: Math.min(RADIUS_MAX_M, RADIUS_MIN_M + (total - HOTSPOT_MIN_CASES) * RADIUS_STEP_M),
        tier: total >= RED_AT_CASES || urgent > 0 ? ('red' as const) : ('amber' as const),
        // From the pins: a typed place ('near the corner', 'Location not named') is often vague or differs between reports of one spot
        area: placeLabel({ lat: cl.lat, lng: cl.lng }),
        total,
        urgent,
        open: cl.cases.filter(isOpen).length,
        closed: cl.cases.filter((c) => !isOpen(c)).length,
        cases: cl.cases,
      };
    })
    .sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}
