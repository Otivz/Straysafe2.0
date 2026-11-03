import { useCallback, useEffect, useState } from 'react';
import api from './api';

// The Barangay's holding stay limit: one value stored on the server (GET/PUT /holding/stay-limit). Only the Head Officer
// or an Administrator may change it (on Barangay Settings); the server enforces it for adoption and impoundment.

export const DEFAULT_STAY_LIMIT_DAYS = 7;

export interface StayLimitInfo {
    days: number;
    default_days: number;
    max_days: number;
    is_default: boolean;
    updated_at: string | null;
    updated_by_name: string | null;
    can_edit: boolean;
}

// Shared by every component on the page: one request, and a save updates them all
let cached: StayLimitInfo | null = null;
const listeners = new Set<(info: StayLimitInfo) => void>();
const publish = (info: StayLimitInfo) => { cached = info; listeners.forEach(fn => fn(info)); };

export function useStayLimit() {
    const [info, setInfo] = useState<StayLimitInfo | null>(cached);
    useEffect(() => {
        listeners.add(setInfo);
        api.get<StayLimitInfo>('/holding/stay-limit').then(res => publish(res.data)).catch(() => { /* keep the last known value */ });
        return () => { listeners.delete(setInfo); };
    }, []);
    const save = useCallback(async (days: number) => {
        const res = await api.put<StayLimitInfo>('/holding/stay-limit', { days });
        publish(res.data);
        return res.data;
    }, []);
    return { info, days: info?.days ?? DEFAULT_STAY_LIMIT_DAYS, canEdit: !!info?.can_edit, loaded: !!info, save };
}

/** Where an animal stands against the stay limit: whole days held, reached or not, and the date it is reached. */
export function stayLock(stayStartIso: string | null | undefined, limitDays: number) {
    const start = stayStartIso ? new Date(stayStartIso) : null;
    const valid = !!start && !Number.isNaN(start.getTime());
    const heldMs = valid ? Math.max(0, Date.now() - start!.getTime()) : 0;
    const daysHeld = Math.floor(heldMs / 86400000);
    const availableAt = valid ? new Date(start!.getTime() + limitDays * 86400000) : null;
    return {
        daysHeld,
        reached: heldMs >= limitDays * 86400000,
        availableOn: availableAt ? availableAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
    };
}
