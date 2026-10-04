import { useEffect, useState } from 'react';
import { api } from './api';

// One shared way to build the case activity timeline (resident, Subdivision and Barangay views all use it):
// the report's status history, plus the holding facility's own log (admission, transfers, photos, adoption
// outcome), with duplicates removed.

/** Loads the holding-facility record (with its timeline) for a report, if the animal was ever held. */
export function useCaseHolding(reportId?: number | null, duplicateOfReportId?: number | null, reloadKey?: unknown) {
    const [holding, setHolding] = useState<any | null>(null);
    useEffect(() => {
        if (!reportId) return;
        let cancelled = false;
        (async () => {
            try {
                const list = await api.get('/holding/');
                const target = duplicateOfReportId ? Number(duplicateOfReportId) : Number(reportId);
                const match = (Array.isArray(list.data) ? list.data : []).find((a: any) => a.report_id === Number(reportId) || a.report_id === target);
                if (!match) {
                    if (!cancelled) setHolding(null);
                    return;
                }
                const detail = await api.get(`/holding/${match.holding_id}`);
                if (!cancelled) setHolding(detail.data);
            } catch {
                if (!cancelled) setHolding(null);
            }
        })();
        return () => { cancelled = true; };
    }, [reportId, duplicateOfReportId, reloadKey]);
    return holding;
}

export function buildCaseTimeline(report: any, holdingAnimal: any | null): any[] {
    const h: any[] = [...(report?.history || [])];
    if (holdingAnimal && holdingAnimal.timeline) {
        holdingAnimal.timeline.forEach((log: any) => {
            // Media attached to this holding log
            let logMedia = log.media || [];
            if (logMedia.length === 0) {
                logMedia = report.media?.filter((m: any) => {
                    if (!m.is_evidence) return false;
                    if (m.media_type === 'Document' || (m.file_url && m.file_url.toLowerCase().endsWith('.pdf'))) return false;
                    if (m.status_id === 4) return false; // escalation evidence belongs to the escalation entry
                    if (m.holding_log_id) return m.holding_log_id === log.log_id;
                    return false;
                }) || [];
            }
            logMedia = logMedia.filter((m: any) => m && m.file_url && typeof m.file_url === 'string' && m.file_url.trim() !== '');

            // An intake/transfer log that the case history already records: merge its media into that entry
            if (log.event_type === 'intake' || log.event_type === 'transfer') {
                const existingIndex = h.findIndex((rh: any) => {
                    const isFacility = rh.report_status_id === 7 || rh.report_status_id === 8 ||
                        (rh.remarks && (rh.remarks.toLowerCase().includes('holding') || rh.remarks.toLowerCase().includes('facility')));
                    if (!isFacility) return false;
                    const diff = Math.abs(new Date(rh.created_at || rh.timestamp || 0).getTime() - new Date(log.logged_at).getTime());
                    return diff <= 300000; // within 5 minutes
                });
                if (existingIndex !== -1) {
                    if (logMedia.length > 0) {
                        const existingMedia = h[existingIndex].media || [];
                        const existingIds = new Set(existingMedia.map((m: any) => m.media_id || m.file_url));
                        h[existingIndex].media = [...existingMedia, ...logMedia.filter((m: any) => !existingIds.has(m.media_id || m.file_url))];
                    }
                    return;
                }
            }

            // The case history already records "promoted to adoption": do not list it twice
            if (log.event_type === 'status_change' && (log.title || '').toLowerCase().includes('promoted to adoption')
                && h.some((rh: any) => (rh.remarks || '').toLowerCase().includes('promoted to adoption'))) {
                return;
            }

            let statusId = 16; // default: observation / in-facility care
            const title = (log.title || '').toLowerCase();
            if (log.event_type === 'outcome') {
                if (title.includes('deceased')) statusId = 12;
                else if (title.includes('claimed')) statusId = 9;
                else if (title.includes('released')) statusId = 10;
                else statusId = 11;
            } else if (log.event_type === 'intake') {
                statusId = 7;
            }

            const fallbackAuthor = report.assigned_leader_name || (report.subdivision_id ? 'Subdivision Officer' : 'Facility Caretaker');
            h.push({
                history_id: 100000 + log.log_id,
                report_status_id: statusId,
                remarks: `${log.title}${log.notes ? ` — ${log.notes}` : ''}`,
                created_at: log.logged_at,
                updater_name: log.staff_name || (log.logged_by ? fallbackAuthor : 'System Monitor'),
                media: logMedia,
            });
        });
    }
    return h.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
