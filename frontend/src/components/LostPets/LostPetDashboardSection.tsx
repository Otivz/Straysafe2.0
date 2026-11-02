import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { fmtDateTime, type LostPetAlert, type Sighting } from '../../utils/lostPets';

interface Dash {
    stats: { active_alerts: number; requested_alerts: number; total_sightings: number; pets_reunited: number; pending_lost_reports: number };
    requested?: LostPetAlert[];
    active: LostPetAlert[];
    recent_sightings: (Sighting & { alert_id: number; pet_name: string })[];
}

/** Subdivision dashboard: lost pet alerts and sightings from the records (Neighbor-to-Neighbor Lost Pet Sighting Ping). */
export default function LostPetDashboardSection() {
    const [data, setData] = useState<Dash | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let active = true;
        api.get<Dash>('/lost-pet-alerts/dashboard')
            .then(r => { if (active) setData(r.data); })
            .catch(() => { if (active) setFailed(true); });
        return () => { active = false; };
    }, []);
    useAutoRefresh(() => api.get<Dash>('/lost-pet-alerts/dashboard').then(r => { setData(r.data); setFailed(false); }).catch(() => undefined), true, 60000);

    if (failed && !data) return null;
    const tile = (label: string, value: number | undefined) => (
        <div className="rounded-xl bg-[#FAFAF9] border border-gray-100 p-3">
            <p className="text-xl font-black text-gray-900 tabular-nums">{value ?? '–'}</p>
            <p className="text-[10px] font-bold text-gray-500 leading-tight">{label}</p>
        </div>
    );
    return (
        <section className="bg-white rounded-2xl border border-gray-100 shadow-xs p-4 sm:p-5 space-y-4" aria-label="Lost pet alerts" data-testid="lost-pet-dashboard-section">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide">Lost Pet Alerts</h2>
                    <p className="text-[11px] text-gray-500">Neighborhood alerts and resident sightings{data && data.stats.requested_alerts > 0 ? ` · ${data.stats.requested_alerts} request${data.stats.requested_alerts === 1 ? '' : 's'} waiting` : ''}</p>
                </div>
            </div>
            {data && data.requested && data.requested.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                    <p className="text-xs font-black text-amber-900 uppercase tracking-wide">
                        Alert requests waiting for review ({data.requested.length})
                    </p>
                    <div className="space-y-1.5">
                        {data.requested.map(a => (
                            <Link key={a.alert_id} to={`/subd/lost-pet-alerts/${a.alert_id}`} className="flex items-center justify-between rounded-lg bg-white p-2 text-xs hover:border-amber-400 border border-amber-100">
                                <span className="font-bold text-gray-900">{a.pet.name} <span className="text-gray-500 font-normal">· Report #{a.report_id}</span></span>
                                <span className="text-amber-700 font-bold">Review & Activate →</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {tile('Active lost pet alerts', data?.stats.active_alerts)}
                {tile('Total sighting reports', data?.stats.total_sightings)}
                {tile('Pets successfully reunited', data?.stats.pets_reunited)}
                {tile('Pending lost pet reports', data?.stats.pending_lost_reports)}
            </div>
            {data && (
                <div className="grid gap-3 md:grid-cols-2">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Active neighborhood alerts</p>
                        {data.active.length ? data.active.slice(0, 3).map(a => (
                            <Link key={a.alert_id} to={`/subd/lost-pet-alerts/${a.alert_id}`} className="block rounded-lg px-2 py-1.5 text-xs hover:bg-gray-50">
                                <span className="font-bold text-gray-900">{a.pet.name}</span> · {a.sighting_count} sighting{a.sighting_count === 1 ? '' : 's'}
                            </Link>
                        )) : <p className="text-xs text-gray-500">None right now.</p>}
                    </div>
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5">Latest sighting locations</p>
                        {data.recent_sightings.length ? data.recent_sightings.slice(0, 3).map(s => (
                            <Link key={s.sighting_id} to={`/subd/lost-pet-alerts/${s.alert_id}`} className="block rounded-lg px-2 py-1.5 text-xs hover:bg-gray-50">
                                <span className="font-bold text-gray-900">{s.pet_name}</span> near {s.location_label || 'a pinned location'} · {fmtDateTime(s.seen_at)}
                            </Link>
                        )) : <p className="text-xs text-gray-500">No sightings yet.</p>}
                    </div>
                </div>
            )}
        </section>
    );
}
