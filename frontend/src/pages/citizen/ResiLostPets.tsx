import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import LostPetAlertView from '../../components/LostPets/LostPetAlertView';
import ErrorBoundary from '../../components/ErrorBoundary';
import api from '../../utils/api';
import { DEFAULT_PET_AVATAR } from '../../utils/avatar';
import { fmtDateTime, type LostPetAlert } from '../../utils/lostPets';

// Residents: alert tracking map, timeline, and "Spotted Here" sighting reporting.
export default function ResiLostPets() {
    const { alertId } = useParams();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [alerts] = useState<LostPetAlert[] | null>(null);
    // The Lost Pet Report behind the alert, only for someone who may open it (the owner, the leader). Neighbors who got
    // the alert can't see a private report, so their Back goes where they came from instead of to a "not found" page.
    const [reportId, setReportId] = useState<number | null>(null);
    const ownReport = (a: Pick<LostPetAlert, 'report_id' | 'is_owner' | 'can_manage'>) => (a.is_owner || a.can_manage ? a.report_id : null);
    const [error] = useState('');

    useEffect(() => {
        if (!alertId) return;
        let active = true;
        api.get<LostPetAlert>(`/lost-pet-alerts/${alertId}`)
            .then(r => { if (active && r.data?.report_id) setReportId(ownReport(r.data)); })
            .catch(() => undefined);
        return () => { active = false; };
    }, [alertId]);

    const handleBack = () => {
        if (reportId) {
            navigate(`/resident/reports/${reportId}`);
        } else if (window.history.length > 1) {
            navigate(-1);
        } else {
            navigate('/resident-home');
        }
    };

    if (!alertId) {
        return <Navigate to="/resident-home" replace />;
    }

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24 text-gray-800">
            <ResiNavbar onMenuToggle={isOpen => setMenuOpen(isOpen)} />
            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-24 md:pb-8 flex flex-col gap-5">
                {alertId ? (
                    <>
                        <button
                            type="button"
                            onClick={handleBack}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-700 hover:text-orange-800 hover:underline cursor-pointer transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                            <span>Back</span>
                        </button>
                        <ErrorBoundary>
                            <LostPetAlertView
                                alertId={Number(alertId)}
                                reportPath={id => `/resident/reports/${id}`}
                                onAlertLoaded={a => setReportId(ownReport(a))}
                            />
                        </ErrorBoundary>
                    </>
                ) : (
                    <>
                        <div>
                            <h1 className="text-2xl font-black text-[#1a1208]">Lost Pet Alerts</h1>
                            <p className="text-sm text-gray-500 mt-1">Missing pets in your subdivision. If you see one, open its alert and tap <strong>Report a Sighting</strong>.</p>
                        </div>
                        {error && <p role="alert" className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</p>}
                        {alerts === null && !error && <p role="status" className="text-sm text-gray-500">Loading…</p>}
                        {alerts && alerts.length === 0 && (
                            <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-500">No active lost pet alerts in your subdivision right now.</div>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2" data-testid="lost-pet-alert-list">
                            {(alerts || []).map(a => (
                                <Link key={a.alert_id} to={`/resident/lost-pets/${a.alert_id}`} className="flex gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm hover:border-orange-300">
                                    <img src={a.pet.photo_url || DEFAULT_PET_AVATAR} alt={a.pet.name} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                                    <div className="min-w-0 text-xs space-y-0.5">
                                        <p className="text-sm font-black text-gray-900">{a.pet.name}</p>
                                        <p className="text-gray-600">{[a.pet.species, a.pet.breed, a.pet.color].filter(Boolean).join(' · ')}</p>
                                        <p className="text-gray-500">Last seen near {a.last_seen.location || 'the subdivision'} · {fmtDateTime(a.last_seen.at)}</p>
                                        <p className="font-bold text-orange-700">{a.sighting_count} sighting{a.sighting_count === 1 ? '' : 's'} · Report a Sighting →</p>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </>
                )}
            </main>
            <ResiMobileNav isNavbarMenuOpen={menuOpen} isSearchOpen={false} />
        </div>
    );
}
