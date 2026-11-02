import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import LostPetAlertView from '../../components/LostPets/LostPetAlertView';
import ErrorBoundary from '../../components/ErrorBoundary';
import api from '../../utils/api';
import { useAutoRefresh } from '../../utils/useAutoRefresh';
import { DEFAULT_PET_AVATAR } from '../../utils/avatar';
import { fmtDateTime, type LostPetAlert, type Sighting } from '../../utils/lostPets';

export interface LostPetDashboard {
    stats: { active_alerts: number; requested_alerts: number; total_sightings: number; pets_reunited: number; pending_lost_reports: number };
    requested: LostPetAlert[];
    active: LostPetAlert[];
    recent_sightings: (Sighting & { alert_id: number; pet_name: string })[];
    resolved: LostPetAlert[];
    pending_reports: { report_id: number; created_at: string | null; landmark: string | null; animal_type: string | null }[];
}

const AlertRow = ({ a }: { a: LostPetAlert }) => (
    <Link to={`/subd/lost-pet-alerts/${a.alert_id}`} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-2.5 hover:border-role-border">
        <img src={a.pet.photo_url || DEFAULT_PET_AVATAR} alt={a.pet.name} className="h-12 w-12 rounded-lg object-cover" />
        <div className="min-w-0 flex-1 text-xs">
            <p className="font-black text-gray-900">{a.pet.name} <span className="font-semibold text-gray-500">· Report #{a.report_id}</span></p>
            <p className="text-gray-500 truncate">Last seen near {a.last_seen.location || '—'} · {fmtDateTime(a.last_seen.at)}</p>
        </div>
        <span className="text-xs font-bold text-gray-700 shrink-0">{a.sighting_count} sighting{a.sighting_count === 1 ? '' : 's'}</span>
    </Link>
);

const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="rounded-2xl border border-gray-100 bg-white p-4"><p className="text-2xl font-black text-gray-900 tabular-nums">{value}</p><p className="text-xs font-bold text-gray-500">{label}</p></div>
);

// Subdivision Leaders: Neighborhood Alerts (requested / active / resolved), recent sightings and lost reports waiting.
export default function SubdLostPetAlerts() {
    const { alertId } = useParams();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [reportId, setReportId] = useState<number | null>(null);
    const [data, setData] = useState<LostPetDashboard | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!alertId) return;
        let active = true;
        api.get<LostPetAlert>(`/lost-pet-alerts/${alertId}`)
            .then(r => { if (active && r.data?.report_id) setReportId(r.data.report_id); })
            .catch(() => undefined);
        return () => { active = false; };
    }, [alertId]);

    useEffect(() => {
        if (alertId) return;
        let active = true;
        api.get<LostPetDashboard>('/lost-pet-alerts/dashboard')
            .then(r => { if (active) setData(r.data); })
            .catch(() => { if (active) setError('Neighborhood alerts could not be loaded. Please try again.'); });
        return () => { active = false; };
    }, [alertId]);
    useAutoRefresh(() => api.get<LostPetDashboard>('/lost-pet-alerts/dashboard').then(r => { setData(r.data); setError(''); }).catch(() => undefined), !alertId, 30000);

    const handleBack = () => {
        if (reportId) {
            navigate(`/subd/reports/${reportId}`);
        } else if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/subd/reports');
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#F8F9FA] font-sans text-gray-800">
            <SubdSidebar mobileOpen={menuOpen} onMobileClose={() => setMenuOpen(false)} />
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <SubdNavbar onMenuToggle={() => setMenuOpen(true)} leftContent={
                    <div className="flex flex-col">
                        <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Lost Pet Alerts</h1>
                        <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Neighborhood alerts and resident sightings.</p>
                    </div>
                } />
                <div className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 pb-36 md:pb-6 flex flex-col gap-4 custom-scrollbar bg-[#FAFAF9]">
                    {alertId ? (
                        <>
                            <button
                                type="button"
                                onClick={handleBack}
                                className="inline-flex items-center gap-1.5 text-xs font-bold text-role hover:underline cursor-pointer transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                                <span>Back to Report</span>
                            </button>
                            <ErrorBoundary>
                                <LostPetAlertView
                                    alertId={Number(alertId)}
                                    reportPath={id => `/subd/reports/${id}`}
                                    onAlertLoaded={a => setReportId(a.report_id)}
                                />
                            </ErrorBoundary>
                        </>
                    ) : (
                        <>
                            {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
                            {!data && !error && <p role="status" className="text-sm text-gray-500">Loading…</p>}
                            {data && (
                                <>
                                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="lost-pet-stats">
                                        <Stat label="Active lost pet alerts" value={data.stats.active_alerts} />
                                        <Stat label="Total sighting reports" value={data.stats.total_sightings} />
                                        <Stat label="Pets successfully reunited" value={data.stats.pets_reunited} />
                                        <Stat label="Pending lost pet reports" value={data.stats.pending_lost_reports} />
                                    </div>
                                    {data.requested.length > 0 && (
                                        <section className="space-y-2"><h2 className="text-sm font-black text-gray-900">Alert requests waiting for you ({data.requested.length})</h2>
                                            {data.requested.map(a => <AlertRow key={a.alert_id} a={a} />)}</section>
                                    )}
                                    <section className="space-y-2"><h2 className="text-sm font-black text-gray-900">Active neighborhood alerts</h2>
                                        {data.active.length ? data.active.map(a => <AlertRow key={a.alert_id} a={a} />) : <p className="text-xs text-gray-500">No active alerts.</p>}</section>
                                    <section className="space-y-2"><h2 className="text-sm font-black text-gray-900">Recent sightings</h2>
                                        {data.recent_sightings.length ? (
                                            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white">
                                                {data.recent_sightings.map(s => (
                                                    <li key={s.sighting_id}><Link to={`/subd/lost-pet-alerts/${s.alert_id}`} className="block px-3 py-2 text-xs hover:bg-gray-50">
                                                        <span className="font-bold text-gray-900">{s.pet_name}</span> near {s.location_label || 'a pinned location'} · seen {fmtDateTime(s.seen_at)} · submitted {fmtDateTime(s.submitted_at)} · {s.reported_by}
                                                    </Link></li>
                                                ))}
                                            </ul>
                                        ) : <p className="text-xs text-gray-500">No sightings yet.</p>}</section>
                                    <section className="space-y-2"><h2 className="text-sm font-black text-gray-900">Lost pet reports without an alert</h2>
                                        {data.pending_reports.length ? data.pending_reports.map(r => (
                                            <Link key={r.report_id} to={`/subd/reports/${r.report_id}`} className="block rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs hover:border-role-border">
                                                Report #{r.report_id} · {r.animal_type || 'Pet'} · {r.landmark || '—'} · {fmtDateTime(r.created_at)}
                                            </Link>
                                        )) : <p className="text-xs text-gray-500">None.</p>}
                                        <p className="text-[11px] text-gray-500">The owner requests a neighborhood alert from their Lost Pet Report; you review and activate it.</p></section>
                                    <section className="space-y-2"><h2 className="text-sm font-black text-gray-900">Resolved lost pet cases</h2>
                                        {data.resolved.length ? data.resolved.map(a => <AlertRow key={a.alert_id} a={a} />) : <p className="text-xs text-gray-500">None yet.</p>}</section>
                                </>
                            )}
                        </>
                    )}
                </div>
                <SubdBottomNav />
            </main>
        </div>
    );
}
