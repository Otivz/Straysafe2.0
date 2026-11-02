import { api } from './api';
import type { OwnerObservationUpdate } from './ownerObservationUpdates';

export interface FollowUpContactLog {
    contact_log_id: number;
    followup_id: number;
    logged_by: number;
    logger_name?: string | null;
    logger_role?: string | null;
    contact_type: string;
    contact_date: string;
    notes: string;
    created_at?: string | null;
}

export interface OwnerFollowUp {
    followup_id: number;
    report_id: number;
    pet_id?: number | null;
    pet_name?: string | null;
    subdivision_id: number;
    subdivision_name?: string | null;
    leader_id: number;
    leader_name?: string | null;

    owner_id?: number | null;
    owner_name?: string | null;
    owner_phone?: string | null;
    owner_address?: string | null;

    status: 'observing' | 'complied' | 'closed' | 'escalated' | 'cancelled';
    due_at: string;
    duration_days: number;
    notes?: string | null;

    is_extended: boolean;
    extended_at?: string | null;
    extended_by?: number | null;
    extension_reason?: string | null;
    extension_days?: number | null;

    compliance_notes?: string | null;
    closed_at?: string | null;
    closed_by?: number | null;
    close_reason?: string | null;

    owner_acknowledged_at?: string | null;
    owner_acknowledgement_method?: string | null;
    owner_notes?: string | null;
    owner_photo_url?: string | null;
    owner_photo_submitted_at?: string | null;

    staff_caution?: string | null;
    is_overdue: boolean;
    remaining_hours?: number | null;
    contact_logs: FollowUpContactLog[];
    owner_updates?: OwnerObservationUpdate[];

    created_at?: string | null;
    updated_at?: string | null;
}

export interface StartFollowUpPayload {
    report_id: number;
    pet_id?: number | null;
    owner_id?: number | null;
    owner_name?: string | null;
    owner_phone?: string | null;
    owner_address?: string | null;
    duration_days?: number | null;
    notes?: string | null;
}

export const getFollowUpByReport = async (reportId: number): Promise<OwnerFollowUp | null> => {
    try {
        const res = await api.get(`/owner-followups/by-report/${reportId}`);
        return res.data || null;
    } catch (err: any) {
        if (err?.response?.status === 404) return null;
        throw err;
    }
};

export const startFollowUp = async (payload: StartFollowUpPayload): Promise<OwnerFollowUp> => {
    const res = await api.post('/owner-followups/', payload);
    return res.data;
};

export const extendFollowUp = async (
    followupId: number,
    extensionReason: string,
    extensionDays?: number
): Promise<OwnerFollowUp> => {
    const res = await api.post(`/owner-followups/${followupId}/extend`, {
        extension_reason: extensionReason,
        extension_days: extensionDays
    });
    return res.data;
};

export const closeFollowUp = async (
    followupId: number,
    outcome: 'complied' | 'closed' | 'escalated',
    reason: string,
    complianceNotes?: string
): Promise<OwnerFollowUp> => {
    const res = await api.post(`/owner-followups/${followupId}/close`, {
        outcome,
        reason,
        compliance_notes: complianceNotes
    });
    return res.data;
};

export const acknowledgeFollowUp = async (
    followupId: number,
    method: 'account' | 'verbal' | 'phone' = 'account',
    notes?: string
): Promise<OwnerFollowUp> => {
    const res = await api.post(`/owner-followups/${followupId}/acknowledge`, {
        method,
        notes
    });
    return res.data;
};

export const updateOwnerFollowUp = async (
    followupId: number,
    ownerNotes?: string,
    ownerPhotoUrl?: string
): Promise<OwnerFollowUp> => {
    const res = await api.post(`/owner-followups/${followupId}/owner-update`, {
        owner_notes: ownerNotes,
        owner_photo_url: ownerPhotoUrl
    });
    return res.data;
};

export const addContactLog = async (
    followupId: number,
    contactType: string,
    notes: string
): Promise<FollowUpContactLog> => {
    const res = await api.post(`/owner-followups/${followupId}/contact-logs`, {
        contact_type: contactType,
        notes
    });
    return res.data;
};

export const getContactLogs = async (followupId: number): Promise<FollowUpContactLog[]> => {
    const res = await api.get(`/owner-followups/${followupId}/contact-logs`);
    return res.data || [];
};

export const getFollowUpDurationSetting = async (): Promise<number> => {
    try {
        const res = await api.get('/owner-followups/settings/duration');
        return res.data?.default_duration_days || 3;
    } catch {
        return 3;
    }
};

export * from './ownerFollowUpTime';
