import { generalize, isValidLatLng, type GeneralArea, type Point } from '../../preview/geo';
import type { NumberedPoint } from '../../preview/map/types';
import type { GeoPoint, Notice, Report } from '../data/types';

/** The place name used when a pin was placed but not described. Private reports may carry it; public ones must be described. */
export const PINNED_LABEL = 'Pinned on the map';

/** The position of a place, when it has one. A place described only in words has none, and no position is ever invented. */
export function pointOf(g: GeoPoint | null | undefined): Point | null {
  return g && isValidLatLng(g.lat, g.lng) ? { lat: g.lat as number, lng: g.lng as number } : null;
}

export type Visible = { kind: 'exact'; lat: number; lng: number } | { kind: 'general'; area: GeneralArea };

/**
 * What a viewer may see of a place. The exact spot only for someone authorized (the person who reported it, and
 * administrators); everyone else gets a rounded general area. No position means no map, only the words.
 */
export function visiblePoint(g: GeoPoint | null | undefined, authorized: boolean): Visible | null {
  const p = pointOf(g);
  if (!p) return null;
  return authorized ? { kind: 'exact', ...p } : { kind: 'general', area: generalize(p.lat, p.lng) };
}

export interface SightingMap {
  /** Last seen / found here, exact. Only for the owner of the notice. */
  pin: Point | null;
  /** The same, as a general area, for everyone else. */
  areas: GeneralArea[];
  numbered: NumberedPoint[];
  /** Sighting id → its number on the map. The oldest report is 1. */
  numberOf: Map<string, number>;
  /** Sightings that have a position on the map. The others are only described in words. */
  plotted: Set<string>;
}

/**
 * The map of a notice's sightings. The owner of the notice sees exact markers, as does a neighbour for their own sighting;
 * every other sighting is rounded to a general area. A sighting without coordinates is not plotted.
 */
export function sightingMap(notice: Notice, report: Report | undefined): SightingMap {
  const owner = notice.mine;
  const ordered = [...notice.sightings].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const latestId = ordered.length ? ordered[ordered.length - 1].id : null;
  const numberOf = new Map<string, number>();
  const plotted = new Set<string>();
  const numbered: NumberedPoint[] = [];
  ordered.forEach((s, i) => {
    numberOf.set(s.id, i + 1);
    const v = visiblePoint(s.location, owner || s.by === 'you');
    if (!v) return;
    plotted.add(s.id);
    const latest = s.id === latestId;
    numbered.push(v.kind === 'exact' ? { n: i + 1, lat: v.lat, lng: v.lng, latest } : { n: i + 1, lat: v.area.lat, lng: v.area.lng, latest, general: true });
  });
  const own = owner ? pointOf(report?.location) : null;
  return { pin: own, areas: !own && notice.approx ? [notice.approx] : [], numbered, numberOf, plotted };
}
