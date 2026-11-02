// Helpers for the Under Observation "Add Monitoring Log" form and history.
// Values must match MonitoringMethod / MonitoringOutcome in backend/app/schemas/owner_followup.py.

export interface MonitoringLog {
    contact_log_id: number;
    followup_id: number;
    report_id: number | null;
    pet_id: number | null;
    logged_by: number;
    logger_name: string | null;
    logger_role: string | null;
    contact_type: string;
    inspection_method: string | null;
    inspection_outcome: string | null;
    contact_date: string;
    notes: string;
    created_at: string | null;
}

export const MONITORING_METHOD_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'observation', label: 'On-Site Visual Inspection' },
    { value: 'direct_owner', label: 'Direct Owner Contact' },
    { value: 'phone', label: 'Phone Call' },
    { value: 'sms', label: 'Message / SMS' },
    { value: 'other', label: 'Other' },
];

export const MONITORING_OUTCOME_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'pet_secured', label: 'Pet Secured Inside Premises' },
    { value: 'owner_complied', label: 'Owner Complied' },
    { value: 'owner_not_available', label: 'Owner Not Available' },
    { value: 'violation_observed', label: 'Violation Still Observed' },
    { value: 'no_improvement', label: 'No Improvement Observed' },
    { value: 'other', label: 'Other' },
];

export const MONITORING_METHOD_LABELS: Record<string, string> = {
    observation: 'On-Site Visual Inspection',
    direct_owner: 'Direct Owner Contact',
    phone: 'Phone Call',
    sms: 'Message / SMS',
    other: 'Other',
    in_person: 'In-Person Visit',
};

export const MONITORING_OUTCOME_LABELS: Record<string, string> = {
    pet_secured: 'Pet Secured Inside Premises',
    owner_complied: 'Owner Complied',
    owner_not_available: 'Owner Not Available',
    violation_observed: 'Violation Still Observed',
    no_improvement: 'No Improvement Observed',
    other: 'Other',
    spoke_with_owner: 'Spoke with Owner Directly',
    pet_still_roaming: 'Pet Still Roaming / Unleashed',
    no_answer: 'No Answer / Premises Unattended',
};

export const DEFAULT_MONITORING_METHOD = 'observation';
export const DEFAULT_MONITORING_OUTCOME = 'pet_secured';

// Older contact logs have no inspection_method; fall back to their contact_type text.
export const getMonitoringMethodLabel = (log: Pick<MonitoringLog, 'inspection_method' | 'contact_type'>): string =>
    (log.inspection_method && MONITORING_METHOD_LABELS[log.inspection_method]) || log.contact_type || 'Contact Log';

export const getMonitoringOutcomeLabel = (log: Pick<MonitoringLog, 'inspection_outcome'>): string | null =>
    log.inspection_outcome ? MONITORING_OUTCOME_LABELS[log.inspection_outcome] || log.inspection_outcome : null;

export const sortMonitoringLogs = (logs: MonitoringLog[]): MonitoringLog[] =>
    [...logs].sort((a, b) => {
        const diff = new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
        return diff !== 0 ? diff : b.contact_log_id - a.contact_log_id;
    });

// Adds the saved row to a history list without duplicating it if a refetch already returned it.
export const mergeMonitoringLog = (logs: MonitoringLog[] | undefined, saved: MonitoringLog): MonitoringLog[] =>
    sortMonitoringLogs([saved, ...(logs || []).filter((l) => l.contact_log_id !== saved.contact_log_id)]);

// Idempotency key sent with each form draft so repeated clicks or retries cannot create a second row.
export const createMonitoringRequestId = (): string => {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    return `ml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

interface ApiErrorLike {
    message?: string;
    request?: unknown;
    isAxiosError?: boolean;
    response?: { data?: { detail?: unknown } };
}

export const getMonitoringLogErrorMessage = (error: unknown): string => {
    const err = (error ?? {}) as ApiErrorLike;
    if (!err.response) {
        if (err.request || err.isAxiosError) {
            return 'Could not reach the server, so the log may not have been saved. Your entries are kept; please try again.';
        }
        return err.message || 'The monitoring log could not be saved. Your entries are kept; please try again.';
    }
    const detail = err.response.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    if (Array.isArray(detail) && detail.length > 0) {
        return detail
            .map((d: { msg?: unknown }) => (typeof d?.msg === 'string' ? d.msg.replace(/^Value error, /, '') : 'Invalid value'))
            .join(' ');
    }
    return 'The monitoring log could not be saved. Your entries are kept; please try again.';
};
