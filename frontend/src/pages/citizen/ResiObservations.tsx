import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ShieldCheck, Eye } from 'lucide-react';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import OwnerObservationCard from '../../components/OwnerObservationCard';
import { isObservationOpenForUpdates, getApiErrorMessage, type OwnerObservation } from '../../utils/ownerObservationUpdates';
import { fetchMyObservations } from '../../utils/ownerObservationUpdatesApi';

// Pet Owner "Observation Updates": every observation record where the signed-in
// resident is the identified owner, with a form to submit compliance updates.
export default function ResiObservations() {
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [observations, setObservations] = useState<OwnerObservation[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // State is only set in the promise callbacks, after the request settles.
    const load = useCallback(
        () =>
            fetchMyObservations()
                .then((data) => {
                    setObservations(data);
                    setErrorMessage(null);
                })
                .catch((err: unknown) => {
                    setErrorMessage(getApiErrorMessage(err, 'Your observation records could not be loaded. Please try again.'));
                })
                .finally(() => {
                    setLoading(false);
                    setRefreshing(false);
                }),
        []
    );

    useEffect(() => {
        void load();
        // Pick up subdivision reviews and status changes when the owner comes back to the tab.
        const onFocus = () => { void load(); };
        window.addEventListener('focus', onFocus);
        const timer = setInterval(() => { void load(); }, 60000);
        return () => {
            window.removeEventListener('focus', onFocus);
            clearInterval(timer);
        };
    }, [load]);

    const active = observations.filter(isObservationOpenForUpdates);
    const past = observations.filter((o) => !isObservationOpenForUpdates(o));

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24 text-gray-800">
            <ResiNavbar onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)} />

            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32 pb-24 md:pb-8 flex flex-col gap-6">
                <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-black text-[#1a1208] tracking-tight flex items-center gap-2">
                            <Eye className="w-6 h-6 text-[#F97316]" /> Observation Updates
                        </h1>
                        <p className="text-xs text-gray-500 font-medium mt-1 max-w-xl">
                            When your subdivision issues a First Warning about your pet, a 3-day observation starts. Use this page to
                            tell them what you did to fix the issue and send photo evidence.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => { setRefreshing(true); void load(); }}
                        disabled={refreshing}
                        className="self-start sm:self-auto px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-bold text-gray-700 hover:text-[#F97316] inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
                    </button>
                </header>

                {errorMessage && (
                    <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold">
                        {errorMessage}
                    </div>
                )}

                {loading ? (
                    <div className="p-8 rounded-3xl bg-white border border-gray-100 text-center text-xs text-gray-400 font-bold">
                        Loading your observation records...
                    </div>
                ) : observations.length === 0 && !errorMessage ? (
                    <div className="p-8 rounded-3xl bg-white border border-gray-100 text-center space-y-2">
                        <ShieldCheck className="w-10 h-10 mx-auto text-emerald-500" />
                        <p className="text-sm font-black text-[#1a1208]">No observations for your pets</p>
                        <p className="text-xs text-gray-500 font-medium">You have no active or past observation records.</p>
                    </div>
                ) : (
                    <>
                        {active.length > 0 && (
                            <section className="space-y-3">
                                <h2 className="text-[11px] font-black uppercase tracking-wider text-[#EA580C]">Active ({active.length})</h2>
                                {active.map((o) => <OwnerObservationCard key={o.followup_id} observation={o} />)}
                            </section>
                        )}
                        {past.length > 0 && (
                            <section className="space-y-3">
                                <h2 className="text-[11px] font-black uppercase tracking-wider text-gray-400">Past Observations ({past.length})</h2>
                                {past.map((o) => <OwnerObservationCard key={o.followup_id} observation={o} />)}
                            </section>
                        )}
                    </>
                )}
            </main>

            <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} isSearchOpen={false} />
        </div>
    );
}
