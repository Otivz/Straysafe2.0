import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { getPetPicture } from '../../utils/avatar';
import { 
    ArrowLeft, 
    Clock, 
    CheckCircle2, 
    XCircle, 
    FileText, 
    ArrowRight, 
    Heart, 
    CreditCard, 
    Sparkles, 
    X,
    Eye,
    AlertCircle,
    PartyPopper
} from 'lucide-react';

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
    id_type?: string | null;
    id_number?: string | null;
    id_photo_url?: string | null;
    is_handed_over?: boolean;
    handover_date?: string | null;
    staff_handed_over?: boolean;
    staff_handover_date?: string | null;
    staff_handover_name?: string | null;
    created_pet_id?: number | null;
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

    // Confirm Modal & ID Lightbox
    const [selectedConfirmApp, setSelectedConfirmApp] = useState<AdoptionApp | null>(null);
    const [confirmNotes, setConfirmNotes] = useState('');
    const [confirmSubmitting, setConfirmSubmitting] = useState(false);
    const [previewIdPhotoUrl, setPreviewIdPhotoUrl] = useState<string | null>(null);
    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 4500);
    };

    const fetchApps = async () => {
        setLoading(true);
        try {
            const res = await api.get('/adoptions/my-applications');
            setApplications(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Failed to load my adoption applications", err);
            showToast("Failed to load your applications.", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApps();
    }, []);

    const handleConfirmReceived = async () => {
        if (!selectedConfirmApp) return;
        setConfirmSubmitting(true);
        try {
            await api.post(`/adoptions/${selectedConfirmApp.adoption_id}/adopter-confirm-received`, {
                notes: confirmNotes.trim() || undefined,
            });

            showToast("Receipt confirmed! The pet has been officially registered under your account! 🎉");
            setSelectedConfirmApp(null);
            setConfirmNotes('');
            fetchApps();
        } catch (err: any) {
            console.error("Confirm received error", err);
            showToast(err.response?.data?.detail || "Failed to confirm receipt. Please try again.", "error");
        } finally {
            setConfirmSubmitting(false);
        }
    };

    const filtered = applications.filter((app) => {
        if (statusFilter === 'All') return true;
        return app.status === statusFilter;
    });

    const getStatusBadge = (app: AdoptionApp) => {
        if (app.status === 'Approved') {
            if (app.staff_handed_over && app.is_handed_over) {
                return (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black border border-emerald-300 shadow-2xs">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Officially Adopted
                    </span>
                );
            }
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-black border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Approved (Awaiting Handover)
                </span>
            );
        }
        if (app.status === 'Rejected') {
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-red-50 text-red-700 text-xs font-black border border-red-200">
                    <XCircle className="w-3.5 h-3.5" /> Not Selected
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-black border border-amber-200">
                <Clock className="w-3.5 h-3.5" /> Under Barangay Review
            </span>
        );
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

                <div className="flex items-center gap-2">
                    <Link
                        to="/resident/pets"
                        className="text-xs px-3.5 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold transition-all border border-orange-200 flex items-center gap-1.5"
                    >
                        <Heart className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
                        <span>My Registered Pets</span>
                    </Link>
                    <Link
                        to="/resident-home"
                        className="text-xs px-3.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition-all"
                    >
                        Portal
                    </Link>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-8">
                {/* Toast Notification */}
                {toastMessage && (
                    <div
                        className={`mb-6 p-4 rounded-2xl border text-sm font-bold shadow-sm flex items-center gap-3 ${
                            toastMessage.type === 'success'
                                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                : 'bg-red-50 border-red-200 text-red-800'
                        }`}
                    >
                        {toastMessage.type === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                        )}
                        <span>{toastMessage.text}</span>
                    </div>
                )}

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
                        {filtered.map((app) => {
                            const isFullyAdopted = app.status === 'Approved' && app.staff_handed_over && app.is_handed_over;
                            const isAwaitingAdopterConfirm = app.status === 'Approved' && !app.is_handed_over;

                            return (
                                <div
                                    key={app.adoption_id}
                                    className={`bg-white rounded-3xl border p-5 sm:p-6 shadow-xs transition-all ${
                                        isFullyAdopted
                                            ? 'border-emerald-200 bg-linear-to-b from-white to-emerald-50/20'
                                            : isAwaitingAdopterConfirm
                                            ? 'border-orange-200'
                                            : 'border-gray-200/90 hover:border-orange-200'
                                    }`}
                                >
                                    {/* Application Top Bar */}
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

                                        <div>{getStatusBadge(app)}</div>
                                    </div>

                                    {/* Fully Adopted Success Banner */}
                                    {isFullyAdopted && (
                                        <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                                                    <PartyPopper className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="font-black text-sm text-emerald-950">
                                                        Official Adoption Successfully Completed!
                                                    </h4>
                                                    <p className="text-xs text-emerald-800">
                                                        Handover officially confirmed by both Barangay Staff and you. {app.animal_name || 'Your rescue'} is now registered to your account!
                                                    </p>
                                                </div>
                                            </div>
                                            <Link
                                                to="/resident/pets"
                                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5"
                                            >
                                                <Heart className="w-3.5 h-3.5 fill-white" /> View Registered Pets
                                            </Link>
                                        </div>
                                    )}

                                    {/* Awaiting Handover Action Box */}
                                    {isAwaitingAdopterConfirm && (
                                        <div className="mt-4 p-4 rounded-2xl bg-orange-50 border border-orange-200 space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-orange-100 text-orange-700 rounded-xl mt-0.5">
                                                    <CheckCircle2 className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-sm text-orange-950">
                                                        Application Approved — Two-Way Handover Confirmation
                                                    </h4>
                                                    <p className="text-xs text-orange-900 mt-1 leading-relaxed">
                                                        Please visit the Barangay Animal Facility with your <strong>{app.id_type || 'Government ID'}</strong> to claim your pet. Once you have received the animal, please confirm receipt below.
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Status Steps */}
                                            <div className="bg-white/80 rounded-xl p-3 border border-orange-100 text-xs space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-600">Barangay Staff Handover:</span>
                                                    {app.staff_handed_over ? (
                                                        <span className="font-bold text-emerald-700 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Staff Confirmed ({app.staff_handover_name || 'Staff'})
                                                        </span>
                                                    ) : (
                                                        <span className="font-semibold text-amber-700 flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5" /> Awaiting Staff Handover
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-600">Adopter Receipt Confirmation:</span>
                                                    {app.is_handed_over ? (
                                                        <span className="font-bold text-emerald-700 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed by You
                                                        </span>
                                                    ) : (
                                                        <span className="font-semibold text-orange-700 flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5" /> Pending Your Confirmation
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Confirm Button */}
                                            {!app.is_handed_over && (
                                                <div className="pt-1 flex items-center justify-end">
                                                    <button
                                                        onClick={() => setSelectedConfirmApp(app)}
                                                        className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <CheckCircle2 className="w-4 h-4" />
                                                        <span>Confirm Pet Received & Finalize Adoption</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Application Information */}
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

                                        {/* Government ID Info */}
                                        {app.id_type && (
                                            <div className="sm:col-span-2 bg-gray-50/80 p-3 rounded-xl border border-gray-100 flex items-center justify-between flex-wrap gap-2">
                                                <div className="flex items-center gap-2">
                                                    <CreditCard className="w-4 h-4 text-orange-500 shrink-0" />
                                                    <div>
                                                        <span className="font-bold text-gray-800 mr-2">{app.id_type}:</span>
                                                        <span className="text-gray-600 font-mono text-[11px]">{app.id_number || 'Registered'}</span>
                                                    </div>
                                                </div>
                                                {app.id_photo_url && (
                                                    <button
                                                        onClick={() => setPreviewIdPhotoUrl(app.id_photo_url || null)}
                                                        className="text-xs font-bold text-orange-600 hover:underline inline-flex items-center gap-1"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" /> View Uploaded ID
                                                    </button>
                                                )}
                                            </div>
                                        )}

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
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Adopter Handover Confirmation Modal */}
            {selectedConfirmApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900">
                                        Confirm Pet Received & Adopted
                                    </h2>
                                    <p className="text-xs text-gray-500">
                                        Final step to officially register ownership
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedConfirmApp(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-4 mb-4 text-xs text-emerald-950 space-y-2">
                            <p className="leading-relaxed">
                                You are confirming that you have taken physical custody of{' '}
                                <strong>{selectedConfirmApp.animal_name || `Rescue Animal #${selectedConfirmApp.holding_id}`}</strong>{' '}
                                from the Barangay Animal Facility.
                            </p>
                            <p className="font-semibold text-emerald-900">
                                ✓ The pet will officially be registered in your resident account records.<br />
                                ✓ Official adoption status is recorded with date, time, and staff verification.
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                Additional Notes or Confirmation Feedback (Optional)
                            </label>
                            <textarea
                                rows={3}
                                value={confirmNotes}
                                onChange={(e) => setConfirmNotes(e.target.value)}
                                placeholder="e.g. Pet received in healthy condition, collar received, ready for home..."
                                className="w-full p-3 text-xs rounded-xl border border-gray-200 focus:border-emerald-500 focus:outline-hidden resize-none bg-gray-50 focus:bg-white"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setSelectedConfirmApp(null)}
                                className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmReceived}
                                disabled={confirmSubmitting}
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                            >
                                {confirmSubmitting ? (
                                    <span>Registering Adoption...</span>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-4 h-4" />
                                        <span>Confirm Official Adoption</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ID Photo Lightbox Modal */}
            {previewIdPhotoUrl && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-orange-500" />
                                <h3 className="font-bold text-sm text-gray-900">
                                    Uploaded Government ID Document
                                </h3>
                            </div>
                            <button
                                onClick={() => setPreviewIdPhotoUrl(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black/5 flex items-center justify-center max-h-[70vh]">
                            <img
                                src={previewIdPhotoUrl}
                                alt="Government ID"
                                className="w-full h-auto max-h-[70vh] object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MyAdoptionApplications;
