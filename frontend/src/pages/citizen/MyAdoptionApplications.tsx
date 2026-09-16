import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { getPetPicture } from '../../utils/avatar';
import { ArrowLeft, Clock, CheckCircle2, XCircle, FileText, ArrowRight, Heart } from 'lucide-react';

interface AdoptionApp {
    adoption_id: number;
    holding_id: number;
    applicant_id: number;
    status: 'Pending' | 'Approved' | 'Rejected';
    full_name: string;
    address: string;
    contact_no: string;
    has_other_pets: boolean;
    living_space: string;
    reason: string;
    reviewed_by: number | null;
    reviewer_role: string | null;
    reviewer_name: string | null;
    review_notes: string | null;
    reviewed_at: string | null;
    created_at: string;
    updated_at: string;
    animal_name: string | null;
    animal_type: string | null;
    animal_breed: string | null;
    animal_photo: string | null;
}

const MyAdoptionApplications = () => {
    const navigate = useNavigate();
    const [applications, setApplications] = useState<AdoptionApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');

    useEffect(() => {
        const fetchApps = async () => {
            setLoading(true);
            try {
                const res = await api.get('/adoptions/my-applications');
                setApplications(Array.isArray(res.data) ? res.data : []);
            } catch (err) {
                console.error("Failed to load my adoption applications", err);
            } finally {
                setLoading(false);
            }
        };

        fetchApps();
    }, []);

    const filtered = applications.filter((app) => {
        if (statusFilter === 'All') return true;
        return app.status === statusFilter;
    });

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'Approved':
                return (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                    </span>
                );
            case 'Rejected':
                return (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-black border border-red-200">
                        <XCircle className="w-3.5 h-3.5" /> Not Selected
                    </span>
                );
            default:
                return (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-black border border-amber-200">
                        <Clock className="w-3.5 h-3.5" /> Under Barangay Review
                    </span>
                );
        }
    };

    return (
        <div className="min-h-screen bg-[#FBFBF9] text-[#1E293B] font-sans pb-16">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#E2E8F0] px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/adopt')}
                        className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors flex items-center gap-1.5 text-xs font-bold"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Adoption Catalog</span>
                    </button>
                    <div className="h-4 w-px bg-gray-200" />
                    <h1 className="font-extrabold text-base text-gray-900">
                        My Adoption Applications
                    </h1>
                </div>

                <Link
                    to="/resident-home"
                    className="text-xs px-3.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-all"
                >
                    Resident Portal
                </Link>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
                {/* Filter Tabs */}
                <div className="flex items-center gap-2 mb-6 border-b border-gray-200/80 pb-3">
                    {(['All', 'Pending', 'Approved', 'Rejected'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setStatusFilter(tab)}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${
                                statusFilter === tab
                                    ? 'bg-orange-500 text-white shadow-xs'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                        >
                            {tab === 'All' ? 'All Applications' : tab}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-2xl p-6 border border-gray-200 animate-pulse h-36" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-3xl p-12 border border-dashed border-gray-300 text-center max-w-md mx-auto shadow-xs">
                        <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                        <h3 className="font-extrabold text-gray-900 text-base mb-1">
                            No Applications Found
                        </h3>
                        <p className="text-xs text-gray-500 mb-6">
                            {statusFilter !== 'All'
                                ? `You have no ${statusFilter.toLowerCase()} adoption applications.`
                                : "You have not submitted any adoption applications yet. Check out the adoption catalog to find a rescue pet."}
                        </p>
                        <Link
                            to="/adopt"
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-all shadow-xs"
                        >
                            <Heart className="w-3.5 h-3.5" /> Browse Adoptable Pets
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filtered.map((app) => (
                            <div
                                key={app.adoption_id}
                                className="bg-white rounded-3xl border border-gray-200/90 p-5 sm:p-6 shadow-xs hover:border-orange-200 transition-all"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                                    <div className="flex items-center gap-4">
                                        <img
                                            src={getPetPicture(app.animal_photo)}
                                            alt={app.animal_name || 'Pet'}
                                            className="w-14 h-14 rounded-2xl object-cover border border-gray-100 shrink-0"
                                        />
                                        <div>
                                            <h3 className="font-extrabold text-base text-gray-900 flex items-center gap-2">
                                                {app.animal_name || `Rescue Animal #${app.holding_id}`}
                                                <span className="text-xs text-gray-400 font-normal">
                                                    (App #{app.adoption_id})
                                                </span>
                                            </h3>
                                            <p className="text-xs text-gray-500">
                                                {app.animal_type || 'Rescue'} • {app.animal_breed || 'Mixed Breed'}
                                            </p>
                                        </div>
                                    </div>

                                    <div>{getStatusBadge(app.status)}</div>
                                </div>

                                <div className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <span className="text-gray-400 font-medium">Date Submitted:</span>
                                        <span className="text-gray-800 font-semibold ml-1.5">
                                            {new Date(app.created_at).toLocaleDateString(undefined, {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                            })}
                                        </span>
                                    </div>

                                    <div>
                                        <span className="text-gray-400 font-medium">Living Space:</span>
                                        <span className="text-gray-800 font-semibold ml-1.5">
                                            {app.living_space}
                                        </span>
                                    </div>

                                    <div className="sm:col-span-2 bg-gray-50/70 p-3 rounded-xl border border-gray-100 text-gray-600">
                                        <span className="font-bold text-gray-700 block mb-1">Your Stated Reason:</span>
                                        "{app.reason}"
                                    </div>

                                    {app.review_notes && (
                                        <div className="sm:col-span-2 bg-orange-50/60 p-3 rounded-xl border border-orange-100 text-orange-950">
                                            <span className="font-bold text-orange-900 block mb-0.5">
                                                Barangay Review Remarks ({app.reviewer_name || 'Officer'}):
                                            </span>
                                            {app.review_notes}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                                    <span className="text-[11px] text-gray-400">
                                        Managed by Barangay Animal Welfare
                                    </span>
                                    <Link
                                        to={`/adopt/journey/${app.holding_id}`}
                                        className="text-xs text-orange-600 font-bold hover:underline inline-flex items-center gap-1"
                                    >
                                        View Animal Journey <ArrowRight className="w-3 h-3" />
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
};

export default MyAdoptionApplications;
