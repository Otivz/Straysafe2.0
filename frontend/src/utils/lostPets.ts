// Neighbor-to-Neighbor Lost Pet Sighting Ping (docs/01-system/LOST_PET_SIGHTING_PING.md): shared types and the
// timeline rules. Sightings are individual reports, never a route; the reported time and the submission time stay
// separate; nothing is verified automatically.

export interface Sighting {
    sighting_id: number;
    latitude: number;
    longitude: number;
    location_label: string | null;
    location_source: 'map_pin' | 'device';
    seen_at: string;
    submitted_at: string;
    description: string | null;
    photo_url: string | null;
    status: 'unverified' | 'verified' | 'dismissed';
    review_note?: string | null;
    reported_by: string;
    is_mine: boolean;
}

export interface LostPetAlert {
    alert_id: number;
    report_id: number;
    status: 'requested' | 'active' | 'closed';
    subdivision: string | null;
    pet: { name: string; photo_url: string | null; species: string | null; breed: string | null; color: string | null; distinguishing_marks: string | null; description: string | null };
    owner_first_name: string | null;
    last_seen: { at: string | null; location: string | null; latitude: number | null; longitude: number | null };
    contact_preference: string;
    contact_text: string;
    owner_note: string | null;
    leader_message: string | null;
    requested_at: string | null;
    activated_at: string | null;
    closed_at: string | null;
    close_outcome: string | null;
    close_reason: string | null;
    sighting_count: number;
    latest_sighting: Sighting | null;
    accepting_sightings: boolean;
    is_owner: boolean;
    can_manage: boolean;
    residents_notified: number | null;
    sightings?: Sighting[];
}

export interface TimelineItem {
    key: string;
    kind: 'last_seen' | 'sighting';
    at: string | null;            // reported time (when the animal was seen)
    submitted_at: string | null;  // when the report reached StraySafe (sightings only)
    label: string;
    sighting?: Sighting;
    latest: boolean;              // the most recently submitted sighting
}

const time = (iso?: string | null) => (iso ? new Date(iso).getTime() : Number.NaN);

/** The timeline: the last known location first, then sightings by reported time; the newest submission is flagged. */
export function buildTimeline(alert?: Partial<Pick<LostPetAlert, 'last_seen'>>, sightings: Sighting[] = []): TimelineItem[] {
    const safeSightings = sightings || [];
    const latestId = safeSightings.length
        ? [...safeSightings].sort((a, b) => time(b.submitted_at) - time(a.submitted_at) || b.sighting_id - a.sighting_id)[0].sighting_id
        : null;
    const items: TimelineItem[] = [...safeSightings]
        .sort((a, b) => time(a.seen_at) - time(b.seen_at) || time(a.submitted_at) - time(b.submitted_at) || a.sighting_id - b.sighting_id)
        .map(s => ({
            key: `s${s.sighting_id}`, kind: 'sighting', at: s.seen_at, submitted_at: s.submitted_at,
            label: s.location_label ? `Spotted near ${s.location_label}` : 'Spotted at the pinned location',
            sighting: s, latest: s.sighting_id === latestId,
        }));
    const lastSeenAt = alert?.last_seen?.at || null;
    const lastSeenLoc = alert?.last_seen?.location || null;
    return [{
        key: 'last-seen', kind: 'last_seen', at: lastSeenAt, submitted_at: null,
        label: lastSeenLoc ? `Last known location: ${lastSeenLoc}` : 'Last known location',
        latest: false,
    }, ...items];
}

export const fmtTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '—';
export const fmtDateTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

/** A datetime-local value (YYYY-MM-DDTHH:mm) for "now" in the browser's local time. */
export function localInputValue(date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export const SIGHTING_STATUS_LABEL: Record<Sighting['status'], string> = {
    unverified: 'Not verified', verified: 'Verified by the Subdivision Leader', dismissed: 'Dismissed by the Subdivision Leader',
};
export const ALERT_STATUS_LABEL: Record<LostPetAlert['status'], string> = {
    requested: 'Requested (waiting for the Subdivision Leader)', active: 'Active neighborhood alert', closed: 'Closed',
};
export const CLOSE_OUTCOME_LABEL: Record<string, string> = {
    reunited: 'Resolved – Pet Reunited', not_found: 'Closed – pet not found', declined: 'Not broadcast',
    report_closed: 'Closed with the report', other: 'Closed',
};

/** Where the pet was most recently seen: the sighting with the latest reported time. Dismissed ones are left out.
 *  (The tracking map rings the latest *submitted* sighting; for location, the reported time is what counts.) */
export function mostRecentSighting(sightings: Sighting[] = []): Sighting | null {
    const kept = (sightings || []).filter(s => s.status !== 'dismissed');
    if (!kept.length) return null;
    return [...kept].sort((a, b) => time(b.seen_at) - time(a.seen_at) || time(b.submitted_at) - time(a.submitted_at) || b.sighting_id - a.sighting_id)[0];
}

/** A sighting's place: its name, else its coordinates. */
export const sightingPlace = (s: Pick<Sighting, 'location_label' | 'latitude' | 'longitude'>): string =>
    (s.location_label || '').trim() || `${Number(s.latitude).toFixed(6)}, ${Number(s.longitude).toFixed(6)}`;

// Same rule as isValidLatLng (utils/coverageArea), kept here so this file stays free of the API client (unit tests)
const validPosition = (lat: unknown, lng: unknown): boolean => {
    if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return false;
    const a = Number(lat);
    const b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) && !(a === 0 && b === 0) && Math.abs(a) <= 90 && Math.abs(b) <= 180;
};

/** Sightings in the tracking map's order and numbering: by reported time (then id), only those with a valid position. */
export function orderedSightings(sightings: Sighting[] = []): Sighting[] {
    return (sightings || [])
        .filter(s => validPosition(s?.latitude, s?.longitude))
        .sort((a, b) => time(a.seen_at) - time(b.seen_at) || a.sighting_id - b.sighting_id);
}

/** A sighting's number on the maps (1 = earliest seen), or null. */
export const sightingNumber = (sightings: Sighting[], sightingId: number): number | null => {
    const i = orderedSightings(sightings).findIndex(s => s.sighting_id === sightingId);
    return i >= 0 ? i + 1 : null;
};
