import { bearingDeg, distanceM } from '../../preview/geo';
import type { AnimalType, LostPetSighting } from '../data/types';

/**
 * The sighting trail of a missing pet: the place it was last seen, then each place a neighbour reported it, in the order they were SEEN (not
 * the order they were typed in), joined leg by leg, plus an approximate area to search around the latest place.
 *
 * It describes what was reported; it never predicts. A leg is a dashed line because nobody knows the way the animal took, and it says so:
 *   arrow    a plausible move (the time between the two is short enough that the direction means something)
 *   unclear  too long between the two (or a time is missing) to say which way it went: drawn, but without an arrow
 *   jump     too far for the time that passed: it may be a different animal, so the Leader is told to check it
 *   same     the two are practically the same spot: no line
 * A sighting the Leader dismissed ("not a match") is left out. A possible-recovery lead ("someone may have the pet") is not a place the pet
 * walked to, so it is never joined into the trail.
 */

export interface TrailStop {
  key: string;
  /** 0 is the last-seen place; 1, 2, ... are the sightings, numbered as on the map. */
  n: number;
  lat: number;
  lng: number;
  /** ISO time it was seen, or null when the report gave none. */
  at: string | null;
  verified: boolean;
}

export type LegKind = 'arrow' | 'unclear' | 'jump' | 'same';

export interface TrailLeg {
  from: TrailStop;
  to: TrailStop;
  distanceM: number;
  /** Minutes between the two, or null when a time is missing. */
  gapMin: number | null;
  speedKmh: number | null;
  kind: LegKind;
}

export interface SearchZone {
  lat: number;
  lng: number;
  radiusM: number;
  /** Plain words for the key under the map. */
  basis: string;
}

export interface Trail {
  stops: TrailStop[];
  legs: TrailLeg[];
  zone: SearchZone | null;
  /** Things the Leader should look at, as plain sentences. */
  warnings: string[];
}

/** Two places closer than this are one place (a GPS fix and a pin never agree to the metre). */
export const SAME_SPOT_M = 25;
/** Longer than this between two sightings and the direction between them says nothing. */
export const UNCLEAR_GAP_MIN = 12 * 60;
/** A jump is only called one beyond this distance, whatever the speed (a few metres in a few seconds is just noise). */
export const JUMP_MIN_M = 200;

type Kind = 'dog' | 'cat' | 'other';
const kindOf = (a: AnimalType | string | undefined | null): Kind => (a === 'dog' ? 'dog' : a === 'cat' ? 'cat' : 'other');

/** What a person can believe about how fast and how far a loose animal goes. Deliberately generous: this is a guide, not a measurement. */
const MOVE: Record<Kind, { plausibleKmh: number; baseM: number; perHourM: number; maxM: number; noun: string }> = {
  // plausibleKmh: the speed over a few minutes that a loose animal can keep up (a trot, with bursts); above it two sightings are probably two animals
  cat: { plausibleKmh: 8, baseM: 150, perHourM: 10, maxM: 400, noun: 'cats' },
  dog: { plausibleKmh: 15, baseM: 400, perHourM: 40, maxM: 1200, noun: 'dogs' },
  other: { plausibleKmh: 10, baseM: 250, perHourM: 20, maxM: 600, noun: 'animals' },
};

const ms = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

const validLatLng = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** "950 m" / "1.4 km" */
export const metres = (m: number): string => (m < 1000 ? `${Math.round(m / 10) * 10 || Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
/** "40 min" / "3 h" / "1 d 4 h" */
export function span(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  if (min < 24 * 60) return `${Math.round((min / 60) * 10) / 10} h`.replace('.0', '');
  const d = Math.floor(min / (24 * 60));
  const h = Math.round((min - d * 24 * 60) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

const label = (s: TrailStop) => (s.n === 0 ? 'the last-seen place' : `sighting ${s.n}`);

/**
 * The sighting numbers are the ones the map has always used: the position in the list of every sighting that is not a link record and not
 * dismissed, oldest first. `sightings` must already be in that order and without link records (the caller owns that rule).
 */
export function buildTrail(input: {
  /** The last-seen place of the report (exact; only a Leader gets it) and when. */
  start: { lat: number; lng: number; at: string | null } | null;
  sightings: LostPetSighting[];
  animal: AnimalType | string | undefined | null;
  now: Date;
  /** false on a closed case: the trail is history, so no area to search is drawn. */
  open: boolean;
}): Trail {
  const stops: TrailStop[] = [];
  if (input.start && validLatLng(input.start.lat, input.start.lng)) {
    stops.push({ key: 'start', n: 0, lat: input.start.lat, lng: input.start.lng, at: input.start.at, verified: true });
  }
  // The number a sighting has on the map is its place among the ones that are not dismissed, so the trail agrees with the markers
  let n = 0;
  for (const s of input.sightings) {
    if (s.review === 'dismissed') continue;
    n += 1;
    if (s.kind === 'secured') continue;                       // a lead is a place the pet is kept, not a place it walked to
    if (!validLatLng(s.lat, s.lng)) continue;
    stops.push({ key: s.id, n, lat: s.lat as number, lng: s.lng as number, at: s.seenAt || null, verified: s.review === 'verified' });
  }
  // Oldest first. A stop with no time keeps the place it was given (the last-seen place first).
  const withTime = stops.filter((s) => ms(s.at) !== null).sort((a, b) => (ms(a.at) as number) - (ms(b.at) as number) || a.n - b.n);
  const noTime = stops.filter((s) => ms(s.at) === null);
  const ordered = [...noTime.filter((s) => s.n === 0), ...withTime, ...noTime.filter((s) => s.n !== 0)];

  const kind = kindOf(input.animal);
  const rule = MOVE[kind];
  const legs: TrailLeg[] = [];
  const warnings: string[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const from = ordered[i - 1];
    const to = ordered[i];
    const dist = distanceM(from, to);
    const t0 = ms(from.at);
    const t1 = ms(to.at);
    const gapMin = t0 !== null && t1 !== null ? Math.max(0, (t1 - t0) / 60000) : null;
    const speed = gapMin !== null && gapMin >= 1 ? dist / 1000 / (gapMin / 60) : null;
    let legKind: LegKind;
    if (dist < SAME_SPOT_M) legKind = 'same';
    else if (dist >= JUMP_MIN_M && speed !== null && speed > rule.plausibleKmh) legKind = 'jump';
    else if (dist >= JUMP_MIN_M && gapMin !== null && gapMin < 1) legKind = 'jump';
    else if (gapMin === null || gapMin > UNCLEAR_GAP_MIN) legKind = 'unclear';
    else legKind = 'arrow';
    legs.push({ from, to, distanceM: dist, gapMin, speedKmh: speed, kind: legKind });
    if (legKind === 'jump') {
      warnings.push(`${label(to)[0].toUpperCase()}${label(to).slice(1)} is ${metres(dist)} from ${label(from)}${gapMin !== null ? ` after only ${span(gapMin)}` : ''}: it may be a different animal. Check it before relying on the trail.`);
    }
  }

  // A sighting that is OLDER than the last-seen time contradicts the report: say so rather than draw it as if it came after
  const start = ordered.find((s) => s.n === 0);
  const startAt = start ? ms(start.at) : null;
  if (startAt !== null) {
    for (const s of ordered) {
      const t = ms(s.at);
      if (s.n > 0 && t !== null && t < startAt) warnings.push(`Sighting ${s.n} was seen before the time the report gives for the last-seen place.`);
    }
  }

  // The area to search: around the latest place (not a lead, not dismissed). It widens with the hours since, up to a cap, and only on an open case.
  let zone: SearchZone | null = null;
  const latest = ordered[ordered.length - 1];
  if (input.open && latest) {
    const t = ms(latest.at);
    const hours = t === null ? 0 : Math.max(0, (input.now.getTime() - t) / 3_600_000);
    const radiusM = Math.round(Math.min(rule.maxM, rule.baseM + hours * rule.perHourM) / 10) * 10;
    zone = {
      lat: latest.lat, lng: latest.lng, radiusM,
      basis: `Where to start looking, around ${latest.n === 0 ? 'the last-seen place' : `sighting ${latest.n}`}. It grows with the time since (up to ${metres(rule.maxM)} for ${rule.noun}). It is a guide, not a prediction.`,
    };
  }
  return { stops: ordered, legs, zone, warnings };
}

/** One line for a leg, for the list under the map: "Last seen → 1: 150 m in 30 min". The place name of stop 0 is `startLabel` ("Last seen" or "Found"). */
export function legText(leg: TrailLeg, startLabel: string): string {
  const name = (s: TrailStop) => (s.n === 0 ? startLabel : String(s.n));
  const note = leg.kind === 'unclear' ? ' (too long between the two to say which way)' : leg.kind === 'jump' ? ' (far for the time: check it)' : leg.kind === 'same' ? ' (the same spot)' : '';
  return `${name(leg.from)} → ${name(leg.to)}: ${metres(leg.distanceM)}${leg.gapMin !== null ? ` in ${span(leg.gapMin)}` : ''}${note}`;
}

export { bearingDeg };
