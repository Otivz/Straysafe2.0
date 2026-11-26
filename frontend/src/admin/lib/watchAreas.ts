import { distanceM } from '../../preview/geo';
import type { Case, CategoryId } from '../data/types';
import { HOTSPOT_JOIN_M, computeHotspots, type PinnedCase } from './hotspots';

/**
 * Watch areas for the Leader's dashboard: a place where several reports of a safety, injury or animal-nuisance concern came in within a short
 * time, shown BEFORE it gets worse. It is a pattern, never a task and never a finding: nothing here says who or why.
 *
 * Places are found by how close the pins are (the same 70 m clustering as the hotspot zones on the map), not by a street name: a report has no
 * street, only a landmark text and a position. The place is also NAMED from the pins (the nearest registered landmark to their centre, or the
 * distance and direction from it), never from the typed landmark text, which is often vague or differs between reports of the same spot.
 *
 * What counts: reports of the last WATCH_WINDOW_DAYS days about safety, injured or nuisance concerns (a missing pet and a found animal are not
 * incidents), with a pin, that are not duplicates, merged, withdrawn or found invalid. A place is a watch area when it has at least WATCH_MIN_CASES
 * of them, from at least WATCH_MIN_REPORTERS different people (one household filing four complaints is not a pattern), and at least one is still
 * open (a place whose cases are all closed needs nothing now). "High" at WATCH_HIGH_CASES, or when an open urgent case is among them.
 *
 * Privacy: a nuisance complaint is private, and a place with several can point at one household. So this is for the Leader only, and it gives a
 * place, counts and the case ids: never a name, a contact or what the complaint says. The numbers are judgement values to tune with real use.
 */
export const WATCH_WINDOW_DAYS = 14;
export const WATCH_MIN_CASES = 3;
export const WATCH_MIN_REPORTERS = 2;
export const WATCH_HIGH_CASES = 5;

const FAMILIES: readonly CategoryId[] = ['safety', 'injured', 'nuisance'];
const DAY_MS = 86_400_000;

export interface WatchArea {
  /** The lowest case id in the place: stable while the same cases are there. */
  key: string;
  lat: number;
  lng: number;
  /** Where it is, named from the centre of the pins (never from what the reports typed): "Near Clubhouse", "About 150 m north of ...". */
  area: string;
  tier: 'watch' | 'high';
  total: number;
  /** Different people who reported. */
  reporters: number;
  open: number;
  urgentOpen: number;
  /** Cases in the same place in the WATCH_WINDOW_DAYS days before the window, for "up from". */
  previous: number;
  byCategory: Partial<Record<CategoryId, number>>;
  caseIds: string[];
}

export interface WatchResult {
  areas: WatchArea[];
  /** Recent reports of these kinds that have no pin, so no place can be told for them. */
  unplaced: number;
}

const at = (c: Case): number | null => {
  const t = Date.parse(c.reportedAt);
  return Number.isNaN(t) ? null : t;
};

/** A report that counts as an incident: the right kind, and not a duplicate, merged, withdrawn or found invalid. */
function counts(c: Case): boolean {
  if (!FAMILIES.includes(c.category)) return false;
  if (c.duplicateOfReportId) return false;
  return c.closure?.outcome !== 'invalid';
}

const pinned = (c: Case): c is PinnedCase => typeof c.location.lat === 'number' && typeof c.location.lng === 'number' && Number.isFinite(c.location.lat) && Number.isFinite(c.location.lng);

/**
 * One person, as far as the data says: their resident account, else their name and number (a report the Leader took down by phone). The number
 * is its last 10 digits, so "0917 123 4567" and "+63 917 123 4567" are one number.
 */
const personOf = (c: Case): string => (c.reporter.residentId ? `r:${c.reporter.residentId}` : `n:${(c.reporter.name || '').trim().toLowerCase()}|${(c.reporter.phone || '').replace(/\D/g, '').slice(-10)}`);

export function computeWatchAreas(cases: Case[], now: Date): WatchResult {
  const t1 = now.getTime();
  const t0 = t1 - WATCH_WINDOW_DAYS * DAY_MS;
  const tPrev = t0 - WATCH_WINDOW_DAYS * DAY_MS;
  const recent: Case[] = [];
  const before: PinnedCase[] = [];
  for (const c of cases) {
    if (!counts(c)) continue;
    const t = at(c);
    if (t === null || t > t1) continue;
    if (t >= t0) recent.push(c);
    else if (t >= tPrev && pinned(c)) before.push(c);
  }
  const placed = recent.filter(pinned);
  const areas: WatchArea[] = [];
  for (const h of computeHotspots(placed)) {
    if (h.total < WATCH_MIN_CASES || h.open < 1) continue;
    const reporters = new Set(h.cases.map(personOf)).size;
    if (reporters < WATCH_MIN_REPORTERS) continue;
    const byCategory: Partial<Record<CategoryId, number>> = {};
    for (const c of h.cases) byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    areas.push({
      key: h.key, lat: h.lat, lng: h.lng, area: h.area, tier: h.total >= WATCH_HIGH_CASES || h.urgent > 0 ? 'high' : 'watch',
      total: h.total, reporters, open: h.open, urgentOpen: h.urgent,
      previous: before.filter((c) => distanceM({ lat: h.lat, lng: h.lng }, c.location) <= HOTSPOT_JOIN_M).length,
      byCategory, caseIds: h.cases.map((c) => c.id),
    });
  }
  areas.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'high' ? -1 : 1) || b.total - a.total || a.key.localeCompare(b.key));
  return { areas, unplaced: recent.length - placed.length };
}

/** "4 reports in 14 days from 3 residents" */
export function watchLine(a: WatchArea): string {
  return `${a.total} reports in ${WATCH_WINDOW_DAYS} days from ${a.reporters} ${a.reporters === 1 ? 'resident' : 'residents'}`;
}

/** How it compares with the days before: "up from 1 before", "none in the 14 days before", or null when it is no higher than before. */
export function watchTrend(a: WatchArea): string | null {
  if (a.previous >= a.total) return null;
  return a.previous === 0 ? `none in the ${WATCH_WINDOW_DAYS} days before` : `up from ${a.previous} in the ${WATCH_WINDOW_DAYS} days before`;
}
