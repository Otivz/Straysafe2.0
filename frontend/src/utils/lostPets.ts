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
