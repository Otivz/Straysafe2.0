import { useEffect, useState } from 'react';
import api from '../../utils/api';

// Staff-only Phase 6 summary in the existing pet history: observations, repeat incidents and warning counts.
// The server refuses residents (403); this renders nothing for them or when there is nothing to show.

interface Summary {
    observations: { followup_id: number; report_id: number; status: string; started_at: string | null; due_at: string | null; repeat_count: number }[];
    repeated_incidents: { incident_id: number; report_id: number; notes: string; incident_date: string | null }[];
    counts: { observations: number; repeated_incidents: number; verbal_warnings: number; account_warnings: number };
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

const PetFollowUpSummary = ({ petId }: { petId: number }) => {
    const [data, setData] = useState<Summary | null>(null);

    useEffect(() => {
        let cancelled = false;
        api.get(`/owner-followups/pet/${petId}/summary`)
            .then((r) => { if (!cancelled) setData(r.data); })
            .catch(() => { if (!cancelled) setData(null); });
        return () => { cancelled = true; };
    }, [petId]);

    if (!data) return null;
    const c = data.counts;
    if (!c.observations && !c.repeated_incidents && !c.verbal_warnings && !c.account_warnings) return null;

    const tile = (n: number, label: string) => (
        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2">
            <p className="text-lg font-black text-gray-900 leading-none">{n}</p>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
        </div>
    );

    return (
        <div className="space-y-2 rounded-2xl border border-amber-100 bg-amber-50/40 p-3" aria-label="Observation and warning summary">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-800">Staff summary</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {tile(c.observations, 'Observations')}
                {tile(c.repeated_incidents, 'Repeat incidents')}
                {tile(c.account_warnings, 'Official warnings')}
                {tile(c.verbal_warnings, 'Verbal warnings')}
            </div>
            {data.observations.length > 0 && (
                <ul className="space-y-1 text-[11px] font-semibold text-gray-600">
                    {data.observations.map((o) => (
                        <li key={o.followup_id}>
                            Observation on Report #{o.report_id}: {o.status}, started {fmt(o.started_at)}, due {fmt(o.due_at)}
                            {o.repeat_count ? ` · ${o.repeat_count} repeat incident${o.repeat_count === 1 ? '' : 's'}` : ''}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default PetFollowUpSummary;
