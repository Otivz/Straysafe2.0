// Pet Owner observation updates: types, labels, validation, and API calls.
// Compliance values must match OwnerComplianceStatus in backend/app/schemas/owner_followup.py.

export type OwnerComplianceStatus = 'issue_resolved' | 'improving' | 'still_addressing' | 'unable_to_comply';

export interface OwnerObservationUpdatePhoto {
    photo_id: number;
    photo_url: string;
    created_at?: string | null;
}

export interface OwnerObservationUpdate {
    update_id: number;
    followup_id: number;
    report_id: number;
    pet_id: number | null;
    animal_name: string | null;
    owner_user_id: number;
    owner_name: string | null;
    compliance_status: OwnerComplianceStatus | string;
    owner_remarks: string;
    submitted_at: string;
    photos: OwnerObservationUpdatePhoto[];
    is_reviewed: boolean;
    reviewed_at: string | null;
    reviewed_by: number | null;
    reviewer_name: string | null;
    review_remarks: string | null;
}

// The owner's view of an observation record (fields returned by /owner-followups/my-observations).
export interface OwnerObservation {
    followup_id: number;
    report_id: number;
    pet_id: number | null;
    animal_name: string | null;
    animal_photo: string | null;
    status: string;
    due_at: string;
    created_at: string | null;
    is_overdue: boolean;
    workflow_section?: string | null;
    first_warning_date: string | null;
    first_warning_violation: string | null;
    first_warning_description: string | null;
    has_second_warning?: boolean;
    resolved_at?: string | null;
    leader_name?: string | null;
    subdivision_name?: string | null;
    owner_updates: OwnerObservationUpdate[];
    owner_updates_count: number;
}

export const OWNER_COMPLIANCE_OPTIONS: { value: OwnerComplianceStatus; label: string; hint: string }[] = [
    { value: 'issue_resolved', label: 'Issue Resolved', hint: 'The reported problem has been fixed.' },
    { value: 'improving', label: 'Action Taken / Improving', hint: 'Steps were taken and things are getting better.' },
    { value: 'still_addressing', label: 'Still Addressing the Issue', hint: 'You are still working on it.' },
    { value: 'unable_to_comply', label: 'Unable to Comply Yet', hint: 'Something is stopping you; explain below.' },
];

export const OWNER_COMPLIANCE_LABELS: Record<string, string> = Object.fromEntries(
    OWNER_COMPLIANCE_OPTIONS.map((o) => [o.value, o.label])
);

export const getComplianceLabel = (value: string): string => OWNER_COMPLIANCE_LABELS[value] || value;

// Tailwind classes per status, used for badges on both the owner and subdivision screens.
export const COMPLIANCE_BADGE_CLASSES: Record<string, string> = {
    issue_resolved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    improving: 'bg-sky-100 text-sky-800 border-sky-200',
    still_addressing: 'bg-amber-100 text-amber-800 border-amber-200',
    unable_to_comply: 'bg-rose-100 text-rose-800 border-rose-200',
};

// Limits mirror the backend: at most 5 JPG/PNG/WEBP photos of 10 MB each, remarks 3–2000 characters.
export const OWNER_UPDATE_MAX_PHOTOS = 5;
export const OWNER_UPDATE_MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const OWNER_UPDATE_REMARKS_MIN = 3;
export const OWNER_UPDATE_REMARKS_MAX = 2000;
export const OWNER_UPDATE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface PhotoCheck {
    accepted: File[];
    errors: string[];
}

// Checks new picks against the already-selected count; returns the files that can be added.
export const checkOwnerUpdatePhotos = (picked: File[], alreadySelected: number): PhotoCheck => {
    const accepted: File[] = [];
    const errors: string[] = [];
    for (const file of picked) {
        if (!OWNER_UPDATE_PHOTO_TYPES.includes(file.type)) {
            errors.push(`"${file.name}" is not a JPG, PNG, or WEBP photo.`);
        } else if (file.size > OWNER_UPDATE_MAX_PHOTO_BYTES) {
            errors.push(`"${file.name}" is larger than 10 MB.`);
        } else if (alreadySelected + accepted.length >= OWNER_UPDATE_MAX_PHOTOS) {
            errors.push(`You can attach up to ${OWNER_UPDATE_MAX_PHOTOS} photos.`);
            break;
        } else {
            accepted.push(file);
        }
    }
    return { accepted, errors };
};

export const validateOwnerUpdateForm = (status: string, remarks: string): string | null => {
    if (!OWNER_COMPLIANCE_LABELS[status]) return 'Please choose a compliance status.';
    const trimmed = remarks.trim();
    if (trimmed.length < OWNER_UPDATE_REMARKS_MIN) return 'Please describe what you did to address the reported issue.';
    if (trimmed.length > OWNER_UPDATE_REMARKS_MAX) return `Remarks must be ${OWNER_UPDATE_REMARKS_MAX} characters or fewer.`;
    return null;
};

export const createOwnerUpdateRequestId = (): string => {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    return `ou-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

export const sortOwnerUpdates = (updates: OwnerObservationUpdate[]): OwnerObservationUpdate[] =>
    [...updates].sort((a, b) => {
        const diff = new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
        return diff !== 0 ? diff : b.update_id - a.update_id;
    });

// Adds or replaces one update in a list without duplicating it.
export const mergeOwnerUpdate = (updates: OwnerObservationUpdate[] | undefined, saved: OwnerObservationUpdate): OwnerObservationUpdate[] =>
    sortOwnerUpdates([saved, ...(updates || []).filter((u) => u.update_id !== saved.update_id)]);

// Observation records the owner can still submit updates for.
export const isObservationOpenForUpdates = (obs: Pick<OwnerObservation, 'status' | 'workflow_section'>): boolean =>
    obs.status === 'observing' && obs.workflow_section !== 'resolved';

interface ApiErrorLike {
    message?: string;
    request?: unknown;
    isAxiosError?: boolean;
    response?: { data?: { detail?: unknown } };
}

export const getApiErrorMessage = (error: unknown, fallback: string): string => {
    const err = (error ?? {}) as ApiErrorLike;
    if (!err.response) {
        if (err.request || err.isAxiosError) {
            return 'Could not reach the server, so this may not have been saved. Your entries are kept; please try again.';
        }
        return err.message || fallback;
    }
    const detail = err.response.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length > 0) {
        return detail
            .map((d: { msg?: unknown }) => (typeof d?.msg === 'string' ? d.msg.replace(/^Value error, /, '') : 'Invalid value'))
            .join(' ');
    }
    return fallback;
};
