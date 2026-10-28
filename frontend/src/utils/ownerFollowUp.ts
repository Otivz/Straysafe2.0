// Owner follow-up API (docs/06-future-proposals/SUBDIVISION_OWNER_FOLLOW_UP_PLAN.md, section 6)
import api from './api';

export type FollowUpStatus = 'Observing' | 'Owner Complied' | 'Closed by Leader' | 'Escalated' | 'Report Closed';
export type ContactMethod = 'Phone' | 'In person' | 'In-app' | 'Owner update' | 'Repeated incident';
export type CloseOutcome = 'owner_complied' | 'incident_resolved' | 'false_alarm';

export interface FollowUpContact {
    contact_id: number;
    contacted_at: string;
    method: ContactMethod;
    note: string;
    photo_url?: string | null;
    related_report_id?: number | null;
    contacted_by?: number | null;
    contacted_by_name?: string | null;
}

export interface OwnerFollowUp {
    followup_id: number;
    report_id: number;
    status: FollowUpStatus;
    label: string;
    opened_at: string;
    due_at: string;
    days_left: number;
    is_due: boolean;
    extended: boolean;
    acknowledged: boolean;
    acknowledged_at?: string | null;
    acknowledged_via?: 'App' | 'Phone' | null;
    pet_name?: string | null;
    closed_at?: string | null;
    closing_outcome?: string | null;
    // staff view only
    owner_user_id?: number | null;
    owner_has_account?: boolean;
    owner_name?: string | null;
    owner_phone?: string | null;
    opened_by_name?: string | null;
    closed_by_name?: string | null;
    closing_reason?: string | null;
    acknowledgement_note?: string | null;
    extended_at?: string | null;
    extension_reason?: string | null;
    contacts?: FollowUpContact[];
    // owner view only
    my_updates?: { contacted_at: string; note: string; photo_url?: string | null }[];
}

/** The server's refusal message, or a fallback. */
export function followUpError(err: unknown, fallback = 'Something went wrong. Try again.'): string {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
    return fallback;
}

export const getFollowUpForReport = async (reportId: number): Promise<OwnerFollowUp | null> =>
    (await api.get(`/owner-followups/by-report/${reportId}`)).data ?? null;

export const listFollowUps = async (params: { status?: 'open' | 'closed'; due?: boolean } = {}): Promise<OwnerFollowUp[]> =>
    (await api.get('/owner-followups', { params })).data ?? [];

export const startFollowUp = async (reportId: number): Promise<OwnerFollowUp> =>
    (await api.post('/owner-followups', { report_id: reportId })).data;

export const addFollowUpContact = async (id: number, body: { method: Exclude<ContactMethod, 'Owner update'>; note: string; related_report_id?: number | null }): Promise<OwnerFollowUp> =>
    (await api.post(`/owner-followups/${id}/contacts`, body)).data;

export const acknowledgeFollowUp = async (id: number, note?: string): Promise<OwnerFollowUp> =>
    (await api.post(`/owner-followups/${id}/acknowledge`, { note: note || null })).data;

export const sendOwnerUpdate = async (id: number, note: string, photo?: File | null): Promise<OwnerFollowUp> => {
    const form = new FormData();
    form.append('note', note);
    if (photo) form.append('file', photo);
    return (await api.post(`/owner-followups/${id}/owner-update`, form, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
};

export const extendFollowUp = async (id: number, reason: string): Promise<OwnerFollowUp> =>
    (await api.post(`/owner-followups/${id}/extend`, { reason })).data;

export const closeFollowUp = async (id: number, outcome: CloseOutcome, reason: string): Promise<OwnerFollowUp> =>
    (await api.post(`/owner-followups/${id}/close`, { outcome, reason })).data;
