// API calls for Pet Owner observation updates; pure helpers live in ownerObservationUpdates.ts.
import api from './api';
import { sortOwnerUpdates, type OwnerObservation, type OwnerObservationUpdate } from './ownerObservationUpdates';

export const fetchMyObservations = async (): Promise<OwnerObservation[]> => {
    const res = await api.get<OwnerObservation[]>('/owner-followups/my-observations');
    return (res.data || []).map((o) => ({ ...o, owner_updates: sortOwnerUpdates(o.owner_updates || []) }));
};

export const submitOwnerObservationUpdate = async (
    followupId: number,
    input: { complianceStatus: string; remarks: string; photos: File[]; requestId: string }
): Promise<OwnerObservationUpdate> => {
    const form = new FormData();
    form.append('compliance_status', input.complianceStatus);
    form.append('owner_remarks', input.remarks.trim());
    form.append('client_request_id', input.requestId);
    input.photos.forEach((file) => form.append('photos', file));
    const res = await api.post<OwnerObservationUpdate>(`/owner-followups/${followupId}/owner-updates`, form, {
        timeout: 120000, // photo uploads can be slow on mobile data
    });
    if (!res.data || typeof res.data.update_id !== 'number') {
        throw new Error('Unexpected response while saving your update.');
    }
    return res.data;
};

export const reviewOwnerObservationUpdate = async (
    followupId: number,
    updateId: number,
    reviewRemarks: string
): Promise<OwnerObservationUpdate> => {
    const res = await api.post<OwnerObservationUpdate>(`/owner-followups/${followupId}/owner-updates/${updateId}/review`, {
        review_remarks: reviewRemarks.trim() || null,
    });
    return res.data;
};
