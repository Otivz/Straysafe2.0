import { getReportStatusLabel, isReportClosed } from './reportStatus';

// Facts for the history Case Summary panel (docs/03-development/audits/HISTORY_REPORT_DETAILS_AUDIT_2026-11-02.md).
// Every field is optional so each page can pass its own report object from GET /reports/{id}.

const VERIFIED_STATUS_ID = 2;
const REJECTED_STATUS_IDS = [3, 14];

export interface CaseSummaryHistoryEntry {
    report_status_id?: number | null;
    created_at?: string | null;
    updater_name?: string | null;
    remarks?: string | null;
}

export interface CaseSummaryReport {
    report_id?: number;
    current_status_id?: number | null;
    status_id?: number | null;
    created_at?: string | null;
    history?: CaseSummaryHistoryEntry[] | null;
    // Verification
    verified_by_name?: string | null;
    verified_at?: string | null;
    verification_notes?: string | null;
    false_alarm_reason?: string | null;
    // Animal
    animal_type?: string | null;
    ai_animal_type?: string | null;
    animal_breed?: string | null;
    ai_possible_breed?: string | null;
    animal_color?: string | null;
    ai_dominant_color?: string | null;
    ai_coat_pattern?: string | null;
    estimated_size?: string | null;
    ai_estimated_size?: string | null;
    animal_count?: number | null;
    condition?: string | null;
    // Priority
    priority_level?: string | null;
    ai_suggested_priority?: string | null;
    ai_suggested_priority_reason?: string | null;
    // Behavior found by an official (Phase 3)
    verified_actual_bite?: boolean | null;
    verified_attempted_bite?: boolean | null;
    verified_chasing?: boolean | null;
    verified_injury?: boolean | null;
    verified_aggressive?: boolean | null;
    behavior_finding?: string | null;
    // Owner observation, warnings, disputes
    observation?: CaseSummaryObservation | null;
    issued_warnings?: CaseSummaryWarning[] | null;
    latest_warning?: CaseSummaryWarning | null;
    disputes?: CaseSummaryDispute[] | null;
    // Merged and split
    duplicate_of_report_id?: number | null;
    merged_at?: string | null;
    merged_by_name?: string | null;
    merge_notes?: string | null;
    merged_reports?: CaseSummaryLinkedReport[] | null;
    split_from_report_id?: number | null;
    split_children_count?: number | null;
    // Matched pet and owner
    pet_name?: string | null;
    case_pet_name?: string | null;
    matched_pet_record?: { pet_name?: string | null; breed?: string | null; owner_name?: string | null; photo_url?: string | null } | null;
    review_type?: string | null;
    review_status?: string | null;
    reviewed_by_name?: string | null;
    reviewed_by_role?: string | null;
    reviewed_at?: string | null;
    owner_return?: { owner_name?: string | null; returned_at?: string | null; return_method?: string | null } | null;
    reunion_confirmed_by?: string | null;
    // Visibility decision (Phase 4)
    visibility?: string | null;
    visible_to_residents?: boolean | null;
    visibility_decided_by_name?: string | null;
    visibility_decided_at?: string | null;
    visibility_reason?: string | null;
    visibility_needs_review?: boolean | null;
    public_block_reason?: string | null;
    // Comments
    comments?: CaseSummaryComment[] | null;
    comments_open?: boolean | null;
    // AI photo check
    ai_photo_status?: string | null;
    ai_photo_likelihood?: number | null;
    ai_photo_recommendation?: string | null;
    ai_photo_details?: string | null;
    // For the printout (Phase 6)
    media?: { file_url?: string | null; media_type?: string | null; history_id?: number | null; holding_log_id?: number | null; is_evidence?: boolean | null }[] | null;
    barangay_name?: string | null;
}

export interface CaseSummaryComment {
    comment_id: number;
    comment?: string | null;
    user_name?: string | null;
    created_at?: string | null;
    parent_comment_id?: number | null;
}

/** GET /reports/{id} `observation`: the case's latest owner observation, without owner details. */
export interface CaseSummaryObservation {
    open?: boolean | null;
    status?: string | null;
    due_at?: string | null;
    extended?: boolean | null;
    ended_at?: string | null;
    outcome?: string | null;
    started_at?: string | null;
    // Officials only (GET /reports/{id} for roles 2-4)
    extension_days?: number | null;
    extension_reason?: string | null;
    closed_by_name?: string | null;
}

export interface CaseSummaryWarning {
    warning_level?: string | null;
    violation_type?: string | null;
    status?: string | null;
    issued_at?: string | null;
    created_at?: string | null;
    issuer_name?: string | null;
}

export interface CaseSummaryDispute {
    dispute_id: number;
    resident_name?: string | null;
    dispute_reason?: string | null;
    status?: string | null;
    created_at?: string | null;
    resolved_at?: string | null;
    reviewer_name?: string | null;
    reviewer_notes?: string | null;
    pet_name?: string | null;
}

export interface CaseSummaryLinkedReport {
    report_id: number;
    landmark?: string | null;
    created_at?: string | null;
}

export interface CaseOutcome {
    statusId: number;
    label: string;
    closed: boolean;
    reachedAt: string | null;
    recordedBy: string | null;
    remarks: string | null;
}

export interface CaseVerification {
    by: string | null;
    at: string | null;
    notes: string | null;
    fromHistory: boolean;
}

export interface CaseRejection {
    label: string;
    reason: string | null;
    by: string | null;
    at: string | null;
}

/** A recorded value, or null when it is empty or "Unknown". */
export const knownText = (value?: string | null): string | null => {
    const trimmed = (value ?? '').trim();
    return trimmed && trimmed.toLowerCase() !== 'unknown' ? trimmed : null;
};

const byTime = (a: CaseSummaryHistoryEntry, b: CaseSummaryHistoryEntry) =>
    new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();

const statusOf = (report: CaseSummaryReport): number => Number(report.current_status_id ?? report.status_id ?? 1);

/** The case's current status and when it was reached: the first entry of the last unbroken run of that status. */
export function caseOutcome(report: CaseSummaryReport): CaseOutcome {
    const statusId = statusOf(report);
    const entries = [...(report.history || [])].filter(h => h.report_status_id != null).sort(byTime);
    let reached: CaseSummaryHistoryEntry | null = null;
    for (let i = entries.length - 1; i >= 0 && entries[i].report_status_id === statusId; i--) reached = entries[i];
    return {
        statusId,
        label: getReportStatusLabel(statusId),
        closed: isReportClosed(statusId),
        reachedAt: reached?.created_at || (statusId === 1 ? report.created_at || null : null),
        recordedBy: knownText(reached?.updater_name),
        remarks: knownText(reached?.remarks),
    };
}

/** Who verified the report. Falls back to the first Verified history entry when the verification fields are empty (F17). */
export function caseVerification(report: CaseSummaryReport): CaseVerification | null {
    if (knownText(report.verified_by_name) || report.verified_at) {
        return { by: knownText(report.verified_by_name), at: report.verified_at || null, notes: knownText(report.verification_notes), fromHistory: false };
    }
    const entry = [...(report.history || [])].sort(byTime).find(h => h.report_status_id === VERIFIED_STATUS_ID);
    if (!entry) return null;
    return { by: knownText(entry.updater_name), at: entry.created_at || null, notes: knownText(report.verification_notes) || knownText(entry.remarks), fromHistory: true };
}

/** Why a rejected or false-alarm report was closed. */
export function caseRejection(report: CaseSummaryReport): CaseRejection | null {
    const statusId = statusOf(report);
    if (!REJECTED_STATUS_IDS.includes(statusId)) return null;
    const entry = [...(report.history || [])].sort(byTime).reverse().find(h => h.report_status_id === statusId);
    return {
        label: getReportStatusLabel(statusId),
        reason: knownText(report.false_alarm_reason) || knownText(entry?.remarks),
        by: knownText(entry?.updater_name),
        at: entry?.created_at || null,
    };
}

/** The behaviors an official verified on this report (empty when none). */
export function behaviorFound(report: CaseSummaryReport): string[] {
    const found: [boolean | null | undefined, string][] = [
        [report.verified_actual_bite, 'Bite'],
        [report.verified_attempted_bite, 'Attempted bite'],
        [report.verified_chasing, 'Chasing'],
        [report.verified_injury, 'Caused injury'],
        [report.verified_aggressive, 'Aggressive'],
    ];
    return found.filter(([flag]) => flag === true).map(([, label]) => label);
}

const OBSERVATION_STATUS: Record<string, string> = {
    observing: 'Observing (open)',
    complied: 'Owner complied',
    closed: 'Closed by the subdivision',
    escalated: 'Endorsed to the Barangay',
    cancelled: 'Cancelled',
};

export const observationStatusLabel = (status?: string | null): string | null =>
    status ? OBSERVATION_STATUS[status] || status : null;

/** The pet linked to this case, or null when none is. */
export function casePet(report: CaseSummaryReport): { name: string; breed: string | null; owner: string | null; photoUrl: string | null } | null {
    const record = report.matched_pet_record;
    const name = knownText(record?.pet_name) || knownText(report.case_pet_name) || knownText(report.pet_name);
    if (!name) return null;
    return { name, breed: knownText(record?.breed), owner: knownText(record?.owner_name), photoUrl: knownText(record?.photo_url) };
}

/** Who confirmed the reunion: the owner (Pet Recovered) or an officer who recorded the handover. */
export const reunionConfirmedLabel = (by?: string | null): string | null =>
    by === 'owner' ? 'The owner' : by === 'officer' ? 'An officer (handover recorded)' : null;

export const returnMethodLabel = (method?: string | null): string | null =>
    method === 'in_person' ? 'Handed over in person' : method === 'self_retrieved' ? 'Owner retrieved the animal' : knownText(method);

/** Comments oldest first; every reply (at any depth) follows the top-level comment of its thread. */
export function orderedComments(comments?: CaseSummaryComment[] | null): (CaseSummaryComment & { isReply: boolean })[] {
    const all = [...(comments || [])].filter(c => knownText(c.comment))
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    const byId = new Map(all.map(c => [c.comment_id, c]));
    const rootOf = (c: CaseSummaryComment): number => {
        const seen = new Set<number>();
        let current = c;
        while (current.parent_comment_id && byId.has(current.parent_comment_id) && !seen.has(current.comment_id)) {
            seen.add(current.comment_id);
            current = byId.get(current.parent_comment_id)!;
        }
        return current.comment_id;
    };
    const tops = all.filter(c => rootOf(c) === c.comment_id);
    return tops.flatMap(top => [
        { ...top, isReply: false },
        ...all.filter(c => c.comment_id !== top.comment_id && rootOf(c) === top.comment_id).map(c => ({ ...c, isReply: true })),
    ]);
}

/** The AI's estimate that the photo was made or edited by AI, as a percentage (null when not checked). */
export const aiMadeLikelihood = (value?: number | null): string | null =>
    typeof value === 'number' && Number.isFinite(value) ? `${Math.round(Math.min(Math.max(value, 0), 1) * 100)}%` : null;

/** Free-text AI details, skipping raw JSON and overly long text. */
export const aiPhotoDetailsText = (value?: string | null): string | null => {
    const text = knownText(value);
    return text && !text.startsWith('{') && !text.startsWith('[') && text.length <= 300 ? text : null;
};

export function formatCaseDate(value?: string | null): string | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
