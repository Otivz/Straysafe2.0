import { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import type { LostPetAlert, Sighting } from '../../utils/lostPets';

type Loaded = { reportId: number; alert: LostPetAlert | null; sightings: Sighting[] };
const EMPTY: { alert: LostPetAlert | null; sightings: Sighting[] } = { alert: null, sightings: [] };

/** The report's alert, then (only if it has sightings) every sighting. No alert, or not allowed to see it: nothing. */
async function fetchReportSightings(reportId: number): Promise<Loaded> {
    try {
        const res = await api.get(`/lost-pet-alerts/reports/${reportId}`);
        const alert: LostPetAlert | null = res.data?.alert || null;
        if (!alert || !alert.sighting_count) return { reportId, alert, sightings: [] };
        const detail = await api.get(`/lost-pet-alerts/${alert.alert_id}`);
        return { reportId, alert, sightings: Array.isArray(detail.data?.sightings) ? detail.data.sightings : [] };
    } catch {
        return { reportId, alert: null, sightings: [] };
    }
}

/**
 * A Lost Pet Report's neighborhood alert and its sightings, for the report page's Location Intelligence. Uses the
 * alert's own access rules (owner, the subdivision's leader, admin, residents while it is active). Refreshes every
 * 30 seconds, like the alert card.
 */
export function useReportSightings(reportId: number | null | undefined, enabled: boolean) {
    // Kept with the report it belongs to, so another report's sightings are never shown while the next one loads
    const [data, setData] = useState<Loaded | null>(null);

    useEffect(() => {
        if (!enabled || !reportId) return;
        let active = true;
        fetchReportSightings(reportId).then(loaded => { if (active) setData(loaded); });
        return () => { active = false; };
    }, [reportId, enabled]);
    const refresh = useCallback(() => (reportId ? fetchReportSightings(reportId).then(setData) : undefined), [reportId]);
    useAutoRefresh(refresh, enabled && !!reportId, 30000);

    return enabled && data && data.reportId === reportId ? { alert: data.alert, sightings: data.sightings } : EMPTY;
}
