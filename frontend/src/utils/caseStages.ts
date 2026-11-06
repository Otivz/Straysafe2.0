// The five stages a resident sees at the top of a report's timeline (RESCUE_TIMELINE_IMPROVEMENT_PLAN.md, section 3).
// Every one of the 18 report statuses maps to one step. A case does not have to pass every step: an animal found and
// returned at once never goes to a holding facility, so that step shows as skipped, not done.
import { isHeldInFacility, isHoldingHistoryEntry } from './reportStatus.ts';

export type StepKey = 'reported' | 'checked' | 'rescue' | 'care' | 'closed';
export type StepState = 'done' | 'current' | 'upcoming' | 'skipped';
export type Outcome = 'good' | 'sad' | 'not_found' | 'dismissed' | 'merged';

export interface CaseStep {
    key: StepKey;
    label: string;
    state: StepState;
    date: string | null;          // when the case first reached this step
    targetId: number | null;      // the history entry to scroll to
    statusIds: number[];          // the statuses that belong to this step
}

export interface CaseStages {
    steps: CaseStep[];
    currentIndex: number;          // 0..4
    currentLabel: string;          // one line: where the case is now
    outcome: Outcome | null;       // set once the case is closed
}

const STEP_ORDER: StepKey[] = ['reported', 'checked', 'rescue', 'care', 'closed'];
const STEP_STATUSES: Record<StepKey, number[]> = {
    reported: [1],
    checked: [2, 7, 16, 15],
    rescue: [4, 13, 5, 6],
    care: [8],
    closed: [9, 10, 11, 12, 17, 3, 14, 18],
};
const STEP_LABELS: Record<StepKey, string> = {
    reported: 'Reported',
    checked: 'Checked',
    rescue: 'Barangay referral',
    care: 'In safe care',
    closed: 'Closed',
};

const IN_FACILITY = /facility|impound|holding|shelter|secured in/i;

/** The report's owner observation (Phase 8), from the report detail's `observation` summary. */
export interface ObservationSummary {
    open: boolean;
    status: string;
    due_at: string | null;
    extended: boolean;
    ended_at: string | null;
    outcome: string | null;
}

/** "Nov 4, 2026" in the viewer's local time. */
export function formatObservationDue(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * An owner observation is the subdivision watching an owned pet at home. An earlier holding intake remains a
 * separate record; status 7 alone never establishes physical custody.
 */
function ownerObservation(report: { observation?: ObservationSummary | null } | null | undefined, custody: string): { open: boolean; due: string | null; ended: boolean } | null {
    const obs = report?.observation;
    if (!obs) return null;
    if (IN_FACILITY.test(custody)) return null;
    return { open: !!obs.open, due: formatObservationDue(obs.due_at), ended: !obs.open };
}

function stepOfStatus(statusId: number | null | undefined): StepKey {
    const id = Number(statusId) || 1;
    return (STEP_ORDER.find((k) => STEP_STATUSES[k].includes(id)) || 'reported');
}

function closedOutcome(statusId: number, custody: string, mergedInto?: number | null): { outcome: Outcome; label: string; short: string } {
    if (statusId === 9) return { outcome: 'good', label: 'Back home with its owner', short: 'Back home' };
    if (statusId === 10) return { outcome: 'good', label: 'Released', short: 'Released' };
    if (/adopt/i.test(custody)) return { outcome: 'good', label: 'Adopted into a new home', short: 'Adopted' };
    if (statusId === 11) return { outcome: 'good', label: 'Case resolved', short: 'Resolved' };
    if (statusId === 12) return { outcome: 'sad', label: 'The animal passed away', short: 'Passed away' };
    if (statusId === 17) return { outcome: 'not_found', label: "Search ended: the animal couldn't be found", short: 'Search ended' };
    if (statusId === 18) return { outcome: 'merged', label: mergedInto ? `Merged into Case #${mergedInto}` : 'Merged into another case', short: 'Merged' };
    if (statusId === 3) return { outcome: 'dismissed', label: 'Closed: the report was rejected', short: 'Closed' };
    return { outcome: 'dismissed', label: 'Closed: no action needed', short: 'Closed' };
}

const OPEN_LABELS: Record<number, string> = {
    1: 'Waiting for the subdivision to check it',
    2: 'Checked by the subdivision',
    16: 'Being looked into by the subdivision',
    15: 'Ownership is being reviewed',
    4: 'Referred to the Barangay outside StraySafe',
    13: 'Earlier Barangay approval recorded',
    5: 'Earlier rescue dispatch recorded',
    6: 'Earlier animal pickup recorded',
    7: 'Under owner observation by the subdivision',
    8: 'Earlier impoundment recorded',
};

/**
 * Where a report is in its life, for residents. `history` is the report's own status history (not the merged
 * holding log), `holding` the resident holding view (or null).
 */
export function getCaseStages(report: any, holding?: any | null): CaseStages {
    const statusId = Number(report?.status_id ?? report?.current_status_id) || 1;
    const custody = String(report?.custody_status || holding?.custody_status || '');
    let current = stepOfStatus(statusId);
    // Use recorded intake/server custody evidence, never a report status, to display current care.
    const recordedHolding = isHeldInFacility(report) || !!(holding?.holding_id && !holding?.discharge_date);
    if (current !== 'closed' && statusId !== 6 && recordedHolding) current = 'care';
    else if (current === 'care' && !recordedHolding) current = 'rescue';
    const observation = recordedHolding ? null : ownerObservation(report, custody);
    const currentIndex = STEP_ORDER.indexOf(current);

    // First entry that reached each step (real history entries only, oldest first)
    const history = [...(report?.history || [])]
        .filter((h: any) => h && h.created_at && h.history_id && h.history_id < 100000)
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const firstOf = (key: StepKey) => history.find((h: any) => key === 'care'
        ? isHoldingHistoryEntry(h)
        : STEP_STATUSES[key].includes(Number(h.report_status_id)) && !(Number(h.report_status_id) === 7 && isHoldingHistoryEntry(h))) || null;

    const closed = current === 'closed' ? closedOutcome(statusId, custody, report?.duplicate_of_report_id) : null;

    const steps: CaseStep[] = STEP_ORDER.map((key, i) => {
        const first = key === 'reported' ? null : firstOf(key);
        let date: string | null = key === 'reported' ? (report?.created_at || null) : (first?.created_at || null);
        if (key === 'care' && !date && holding?.intake_date) date = holding.intake_date;
        let state: StepState;
        if (i < currentIndex) state = date || i === 0 ? 'done' : 'skipped';
        else if (i === currentIndex) state = closed ? 'done' : 'current';
        else state = 'upcoming';
        if (key === 'closed' && closed && !date) date = history.length ? history[history.length - 1].created_at : null;
        return {
            key,
            label: key === 'closed' && closed ? closed.short : STEP_LABELS[key],
            state,
            date,
            targetId: first ? Number(first.history_id) : null,
            statusIds: STEP_STATUSES[key],
        };
    });

    let currentLabel = closed
        ? closed.label
        : (current === 'care' ? 'In recorded care at a holding place' : (OPEN_LABELS[statusId] || OPEN_LABELS[1]));
    if (!closed && observation) {
        if (observation.open) currentLabel = observation.due ? `Under observation until ${observation.due}` : 'Under observation by the subdivision';
        else if (statusId === 7) currentLabel = 'Observation ended; the subdivision decides the next step';
    }
    return { steps, currentIndex, currentLabel, outcome: closed ? closed.outcome : null };
}

// ---- Phase 2: one sentence saying where the animal is now ----------------------------------------------------------

export type WhereTone = 'progress' | 'rescue' | 'safe' | 'good' | 'closed';
/** Text pieces; a `strong` piece is shown in bold (a place name). */
export interface WhereNow {
    parts: { text: string; strong?: boolean }[];
    tone: WhereTone;
    mergedInto?: number | null;
}

/** The facility the animal is (or was last) in: the holding record, the report, else the latest history entry. */
export function caseFacilityName(report: any, holding?: any | null): string | null {
    const fromHistory = [...(report?.history || [])]
        .filter((h: any) => h && h.facility_name)
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]?.facility_name;
    return holding?.facility_name || report?.facility?.name || fromHistory || null;
}

// A landmark the reporter typed may already say where ("Near the chapel", "Behind Block 7"): then it reads
// "last seen near the chapel", not "last seen near Near the chapel".
const RELATIVE_PLACE = /^(near|at|by|behind|beside|along|across|inside|outside|in front of|infront of|around)\b/i;

export function getWhereNow(report: any, stages: CaseStages, holding?: any | null, lastSeen?: string | null): WhereNow {
    const statusId = Number(report?.status_id ?? report?.current_status_id) || 1;
    const facility = caseFacilityName(report, holding);
    // " Last seen near X." / " Last seen near the chapel." (prefix without its trailing "near ")
    const seen = (prefixNear: string, prefixPlain: string) => {
        if (!lastSeen) return [];
        const relative = RELATIVE_PLACE.test(lastSeen);
        const place = relative ? lastSeen.charAt(0).toLowerCase() + lastSeen.slice(1) : lastSeen;
        return [{ text: relative ? prefixPlain : prefixNear }, { text: place, strong: true }, { text: '.' }];
    };
    const near = (prefix: string) => seen(prefix, prefix.replace(/near $/, ''));
    const key = stages.steps[stages.currentIndex]?.key;

    if (stages.outcome) {
        switch (stages.outcome) {
            case 'good':
                if (statusId === 9) return { tone: 'good', parts: [{ text: 'Back home with its owner.' }] };
                if (statusId === 10) return { tone: 'good', parts: [{ text: 'The animal was released.' }] };
                if (/adopt/i.test(String(report?.custody_status || ''))) return { tone: 'good', parts: [{ text: 'Adopted into a new home.' }] };
                return { tone: 'good', parts: [{ text: 'The case was resolved.' }] };
            case 'sad':
                return { tone: 'closed', parts: [{ text: 'Sadly, the animal passed away.' }] };
            case 'not_found':
                return { tone: 'closed', parts: [{ text: 'The search ended without finding the animal.' }, ...near(' It was last seen near ')] };
            case 'merged':
                return {
                    tone: 'closed', mergedInto: report?.duplicate_of_report_id || null,
                    parts: [{ text: report?.duplicate_of_report_id ? `This report was merged into Case #${report.duplicate_of_report_id}. Follow that case for updates.` : 'This report was merged into another case.' }],
                };
            default:
                return { tone: 'closed', parts: [{ text: 'Closed: no action was needed.' }] };
        }
    }

    if (key === 'care') {
        const stay = holding?.current_facility_duration_display;
        return {
            tone: 'safe',
            parts: facility
                ? [{ text: 'The animal is safe at the ' }, { text: facility, strong: true }, { text: stay ? ` (in care for ${stay}).` : '.' }]
                : [{ text: 'The animal is safe at a holding place.' }],
        };
    }
    if (key === 'rescue') {
        if (statusId === 6) return { tone: 'rescue', parts: [{ text: `${OPEN_LABELS[6]}.` }, ...near(' Last seen near ')] };
        if (statusId === 5) return { tone: 'rescue', parts: [{ text: `${OPEN_LABELS[5]}.` }, ...near(' Last seen near ')] };
        if (statusId === 13) return { tone: 'rescue', parts: [{ text: `${OPEN_LABELS[13]}.` }, ...near(' Last seen near ')] };
        if (statusId === 8) return { tone: 'rescue', parts: [{ text: `${OPEN_LABELS[8]}.` }, ...near(' Last seen near ')] };
        return { tone: 'rescue', parts: [{ text: 'Referred to the Barangay outside StraySafe. The Subdivision Leader records the updates and outcome it reports.' }, ...near(' Last seen near ')] };
    }
    if (key === 'checked') {
        const observation = ownerObservation(report, String(report?.custody_status || holding?.custody_status || ''));
        if (observation?.open) {
            return {
                tone: 'progress',
                parts: observation.due
                    ? [{ text: 'Under observation: the owner has until ' }, { text: observation.due, strong: true }, { text: ' to address the report.' }]
                    : [{ text: 'Under observation by the subdivision.' }],
            };
        }
        if (observation && statusId === 7) {
            return { tone: 'progress', parts: [{ text: 'The observation has ended; the subdivision decides the next step.' }] };
        }
        if (statusId === 7) return { tone: 'progress', parts: [{ text: 'Under owner observation by the subdivision.' }] };
        return { tone: 'progress', parts: [{ text: statusId === 15 ? 'Ownership is being reviewed.' : statusId === 16 ? 'The subdivision is looking into it.' : 'Checked by the subdivision.' }, ...near(' Last seen near ')] };
    }
    return { tone: 'progress', parts: [{ text: 'Waiting for the subdivision to check it.' }, ...near(' Reported near ')] };
}
