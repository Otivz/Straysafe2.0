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
    PartyPopper,
    ClipboardList,
    Award,
    PenTool,
    Activity
} from 'lucide-react';
import MaskedIdDisplay from '../../components/MaskedIdDisplay';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import AdoptionStageStepper from '../../components/AdoptionStageStepper';
import AdoptionAgreementModal from '../../components/Modals/AdoptionAgreementModal';
import AdoptionCertificateModal from '../../components/Modals/AdoptionCertificateModal';
import AdoptionMonitoringModal from '../../components/Modals/AdoptionMonitoringModal';

interface AdoptionApp {
    adoption_id: number;
    holding_id: number;
    applicant_id: number;
    status: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
    full_name: string;
    address: string;
    contact_no: string;
    has_other_pets: boolean;
    living_space: string;
    reason: string;
    id_type?: string | null;
    id_number?: string | null;
    id_photo_url?: string | null;
    has_id_uploaded?: boolean;
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
    cancellation_reason?: string | null;
    cancelled_at?: string | null;
    // 9-Stage Lifecycle Fields
    current_stage?: string;
    application_stage_status?: string;
    agreement_signed_at?: string | null;
    agreement_signature_url?: string | null;
    certificate_id?: number | null;
    handover_location?: string | null;
    handover_photo_url?: string | null;
    post_monitoring_status?: string;
}

const MyAdoptionApplications = () => {
    const navigate = useNavigate();
    const [applications, setApplications] = useState<AdoptionApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'>('All');
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

    // Confirm Received Modal & ID Lightbox
    const [selectedConfirmApp, setSelectedConfirmApp] = useState<AdoptionApp | null>(null);
    const [confirmNotes, setConfirmNotes] = useState('');
    const [confirmSubmitting, setConfirmSubmitting] = useState(false);
    const [previewIdPhotoUrl, setPreviewIdPhotoUrl] = useState<string | null>(null);
    const [loadingIdAdoptionId, setLoadingIdAdoptionId] = useState<number | null>(null);

    // 9-Stage Action Modals
    const [selectedAgreementApp, setSelectedAgreementApp] = useState<AdoptionApp | null>(null);
    const [selectedCertificateAdoptionId, setSelectedCertificateAdoptionId] = useState<number | null>(null);
    const [selectedMonitoringApp, setSelectedMonitoringApp] = useState<AdoptionApp | null>(null);

    const handleViewSecureId = async (adoptionId: number) => {
        setLoadingIdAdoptionId(adoptionId);
        try {
            const res = await api.get(`/adoptions/${adoptionId}/secure-id-view`);
            if (res.data?.temporary_url) {
                setPreviewIdPhotoUrl(res.data.temporary_url);
            } else {
                showToast("No secure viewing link generated.", "error");
            }
        } catch (err: any) {
            console.error("Failed to load secure ID view:", err);
            showToast(err.response?.data?.detail || "Could not load ID photo securely. Please try again.", "error");
        } finally {
            setLoadingIdAdoptionId(null);
        }
    };

    // Cancel Adoption Modal State
    const [selectedCancelApp, setSelectedCancelApp] = useState<AdoptionApp | null>(null);
    const [cancelReason, setCancelReason] = useState('');
    const [cancelSubmitting, setCancelSubmitting] = useState(false);
    const [cancelError, setCancelError] = useState<string | null>(null);

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

    const handleConfirmCancel = async () => {
        if (!selectedCancelApp) return;
        if (!cancelReason.trim()) {
            setCancelError("Please provide a reason for cancelling your adoption request.");
            return;
        }

        setCancelSubmitting(true);
        setCancelError(null);
        try {
            await api.post(`/adoptions/${selectedCancelApp.adoption_id}/cancel`, {
                reason: cancelReason.trim(),
            });

            showToast("Adoption request has been cancelled.");
            setSelectedCancelApp(null);
            setCancelReason('');
            fetchApps();
        } catch (err: any) {
            console.error("Cancel adoption error", err);
            setCancelError(err.response?.data?.detail || "Failed to cancel adoption request. Please try again.");
        } finally {
            setCancelSubmitting(false);
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
        if (app.status === 'Cancelled') {
            return (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-black border border-gray-200 dark:border-gray-700">
                    <XCircle className="w-3.5 h-3.5 text-gray-500" /> Cancelled
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
        <div className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0F19] text-[#1E293B] dark:text-[#F8FAFC] font-sans pb-24">
            {/* Main Website Navbar */}
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 sm:pt-32">
                {/* Back & Action Bar */}
                <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
                    <button
                        onClick={() => navigate('/adopt')}
                        className="flex items-center gap-2 group text-gray-500 dark:text-gray-400 hover:text-[#F97316] dark:hover:text-[#F97316] transition-colors cursor-pointer"
                        title="Back to Adopt a Pet Catalog"
                    >
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#151C2C] border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 group-hover:text-[#F97316] group-hover:border-orange-200 dark:group-hover:border-orange-500/30 transition-all shadow-sm">
                            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#1a1208] dark:text-white group-hover:text-[#F97316] dark:group-hover:text-[#F97316] transition-colors">Back to Adopt a Pet</span>
                    </button>

                    <Link
                        to="/adopt"
                        className="px-4 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/50 hover:bg-orange-100 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-300 font-bold text-xs transition-all border border-orange-200 dark:border-orange-800/60 flex items-center gap-1.5 shadow-xs"
                    >
                        <Heart className="w-3.5 h-3.5 fill-orange-500 text-orange-500" />
                        <span>Browse Animals</span>
                    </Link>
                </div>

                {/* Page Title */}
                <div className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2.5">
                        <ClipboardList className="w-7 h-7 text-[#F97316]" />
                        <span>Adoption Requests & Applications</span>
                    </h1>
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-1">
                        Track and manage your submitted adoption requests with Barangay Animal Welfare Services
                    </p>
                </div>
                {/* Toast Notification */}
                {toastMessage && (
                    <div
                        className={`mb-6 p-4 rounded-2xl border text-sm font-bold shadow-sm flex items-center gap-3 ${
                            toastMessage.type === 'success'
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'
                        }`}
                    >
                        {toastMessage.type === 'success' ? (
                            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                        )}
                        <span>{toastMessage.text}</span>
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="flex items-center gap-2 mb-6 border-b border-gray-200/80 dark:border-gray-800 pb-3 overflow-x-auto scrollbar-none">
                    {(['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'] as const).map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setStatusFilter(tab)}
                            className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${
                                statusFilter === tab
                                    ? 'bg-orange-500 text-white shadow-xs'
                                    : 'bg-white dark:bg-[#151C2C] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700'
                            }`}
                        >
                            {tab === 'All' ? 'All Applications' : tab}
                        </button>
                    ))}
                </div>

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white dark:bg-[#151C2C] rounded-2xl p-6 border border-gray-200 dark:border-gray-800 animate-pulse h-36" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl p-12 border border-dashed border-gray-300 dark:border-gray-700 text-center max-w-md mx-auto shadow-xs">
                        <FileText className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-3" />
                        <h3 className="font-extrabold text-gray-900 dark:text-white text-base mb-1">
                            No Applications Found
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
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
                            const canCancel = app.status === 'Pending' || (app.status === 'Approved' && !app.is_handed_over);

                            return (
                                <div
                                    key={app.adoption_id}
                                    className={`bg-white dark:bg-[#151C2C] rounded-3xl border p-5 sm:p-6 shadow-xs transition-all ${
                                        isFullyAdopted
                                            ? 'border-emerald-200 dark:border-emerald-800/80 bg-linear-to-b from-white to-emerald-50/20 dark:from-[#151C2C] dark:to-emerald-950/20'
                                            : isAwaitingAdopterConfirm
                                            ? 'border-orange-200 dark:border-orange-900/60'
                                            : app.status === 'Cancelled'
                                            ? 'border-gray-200 dark:border-gray-800 opacity-90'
                                            : 'border-gray-200/90 dark:border-gray-800 hover:border-orange-200 dark:hover:border-orange-500/40'
                                    }`}
                                >
                                    {/* Application Top Bar */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center gap-4">
                                            <img
                                                src={getPetPicture(app.animal_photo)}
                                                alt={app.animal_name || 'Pet'}
                                                className="w-14 h-14 rounded-2xl object-cover border border-gray-100 dark:border-gray-800 shrink-0"
                                            />
                                            <div>
                                                <h3 className="font-extrabold text-base text-gray-900 dark:text-white flex items-center gap-2">
                                                    {app.animal_name || `Rescue Animal #${app.holding_id}`}
                                                    <span className="text-xs text-gray-400 dark:text-gray-400 font-normal">
                                                        (App #{app.adoption_id})
                                                    </span>
                                                </h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {app.animal_type || 'Rescue'} • {app.animal_breed || 'Mixed Breed'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            {getStatusBadge(app)}
                                            {canCancel && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedCancelApp(app);
                                                        setCancelReason('');
                                                        setCancelError(null);
                                                    }}
                                                    className="px-3 py-1 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
                                                    title="Cancel this adoption request"
                                                >
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    <span>CANCEL ADOPTION</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* 9-Stage Adoption Lifecycle Stepper */}
                                    <div className="mt-4">
                                        <AdoptionStageStepper
                                            currentStage={app.current_stage || (app.status === 'Approved' ? 'Certificate' : 'Application')}
                                            stageStatus={app.application_stage_status || (app.status === 'Approved' ? 'Approved_Pending_Agreement' : 'Submitted')}
                                            status={app.status}
                                            postMonitoringStatus={app.post_monitoring_status}
                                        />
                                    </div>

                                    {/* Stage 7: Digital Adoption Agreement Ready Banner */}
                                    {app.status === 'Approved' && !app.agreement_signed_at && (
                                        <div className="mt-4 p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2.5 bg-orange-100 dark:bg-orange-900/60 text-orange-600 dark:text-orange-400 rounded-xl shrink-0">
                                                    <PenTool className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="font-black text-sm text-orange-950 dark:text-orange-200">
                                                        Stage 7: Official Adoption Agreement Ready to Sign
                                                    </h4>
                                                    <p className="text-xs text-orange-800 dark:text-orange-300/90 leading-relaxed">
                                                        Congratulations! Your application has been officially approved. Sign your digital deed of commitment now to receive your verified SHA-256 certificate and prepare for physical pickup.
                                                    </p>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedAgreementApp(app)}
                                                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs rounded-xl shadow-xs transition-all shrink-0 flex items-center gap-1.5 cursor-pointer active:scale-95 animate-pulse"
                                            >
                                                <PenTool className="w-3.5 h-3.5" />
                                                <span>Sign Adoption Agreement</span>
                                            </button>
                                        </div>
                                    )}

                                    {/* Fully Adopted Success Banner */}
                                    {isFullyAdopted && (
                                        <div className="mt-4 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-xl">
                                                    <PartyPopper className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h4 className="font-black text-sm text-emerald-950 dark:text-emerald-200">
                                                        Official Adoption Successfully Completed!
                                                    </h4>
                                                    <p className="text-xs text-emerald-800 dark:text-emerald-300/90">
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

                                    {/* Cancelled Adoption Banner & Reason Details */}
                                    {app.status === 'Cancelled' && (
                                        <div className="mt-4 p-4 rounded-2xl bg-gray-50 dark:bg-[#0E131F] border border-gray-200 dark:border-gray-800 space-y-2">
                                            <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-bold text-gray-700 dark:text-gray-300">
                                                <span className="flex items-center gap-1.5 text-gray-800 dark:text-gray-200">
                                                    <XCircle className="w-4 h-4 text-gray-500" />
                                                    Adoption Request Cancelled
                                                </span>
                                                {app.cancelled_at && (
                                                    <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                                                        Cancelled on {new Date(app.cancelled_at).toLocaleDateString(undefined, {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                )}
                                            </div>
                                            {app.cancellation_reason && (
                                                <div className="text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-[#151C2C] p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                                    <span className="font-bold text-gray-700 dark:text-gray-300 block mb-0.5">Cancellation Reason:</span>
                                                    "{app.cancellation_reason}"
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Rejected Adoption Banner & Reason Details */}
                                    {app.status === 'Rejected' && (
                                        <div className="mt-4 p-4 rounded-2xl bg-red-50/90 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 space-y-2.5">
                                            <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-bold text-red-900 dark:text-red-200">
                                                <span className="flex items-center gap-1.5">
                                                    <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                                                    Application Not Approved
                                                </span>
                                                {app.reviewed_at && (
                                                    <span className="text-[11px] font-normal text-red-700/80 dark:text-red-400/80">
                                                        Reviewed on {new Date(app.reviewed_at).toLocaleDateString(undefined, {
                                                            year: 'numeric',
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                )}
                                            </div>

                                            {app.review_notes ? (
                                                <div className="text-xs text-red-950 dark:text-red-200 bg-white/90 dark:bg-[#151C2C] p-3 rounded-xl border border-red-200/80 dark:border-red-900/50 space-y-1">
                                                    <span className="font-bold text-red-800 dark:text-red-400 block text-[11px] uppercase tracking-wider">
                                                        Reason for Decision:
                                                    </span>
                                                    <p className="leading-relaxed whitespace-pre-wrap font-medium">"{app.review_notes}"</p>
                                                </div>
                                            ) : (
                                                <div className="text-xs text-red-800 dark:text-red-300">
                                                    This application was not approved by Barangay Animal Welfare review.
                                                </div>
                                            )}

                                            <p className="text-[11px] text-red-700 dark:text-red-400 leading-relaxed">
                                                Need clarification or wish to re-apply? Please verify your government ID and household information, or visit your local Barangay Animal Welfare facility.
                                            </p>
                                        </div>
                                    )}

                                    {/* Awaiting Handover Action Box */}
                                    {isAwaitingAdopterConfirm && (
                                        <div className="mt-4 p-4 rounded-2xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800/60 space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 rounded-xl mt-0.5">
                                                    <CheckCircle2 className="w-5 h-5" />
                                                </div>
                                                <div className="flex-1">
                                                    <h4 className="font-bold text-sm text-orange-950 dark:text-orange-200">
                                                        Application Approved — Two-Way Handover Confirmation
                                                    </h4>
                                                    <p className="text-xs text-orange-900 dark:text-orange-300 mt-1 leading-relaxed">
                                                        Please visit the Barangay Animal Facility with your <strong>{app.id_type || 'Government ID'}</strong> to claim your pet. Once you have received the animal, please confirm receipt below.
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Status Steps */}
                                            <div className="bg-white/80 dark:bg-[#151C2C]/90 rounded-xl p-3 border border-orange-100 dark:border-orange-900/40 text-xs space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-600 dark:text-gray-400">Barangay Staff Handover:</span>
                                                    {app.staff_handed_over ? (
                                                        <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Staff Confirmed ({app.staff_handover_name || 'Staff'})
                                                        </span>
                                                    ) : (
                                                        <span className="font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5" /> Awaiting Staff Handover
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span className="text-gray-600 dark:text-gray-400">Adopter Receipt Confirmation:</span>
                                                    {app.is_handed_over ? (
                                                        <span className="font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed by You
                                                        </span>
                                                    ) : (
                                                        <span className="font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1">
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
                                                        className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
                                            <span className="text-gray-400 dark:text-gray-400 font-medium">Date Submitted:</span>
                                            <span className="text-gray-800 dark:text-gray-200 font-semibold ml-1.5">
                                                {new Date(app.created_at).toLocaleDateString(undefined, {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric',
                                                })}
                                            </span>
                                        </div>

                                        <div>
                                            <span className="text-gray-400 dark:text-gray-400 font-medium">Living Space:</span>
                                            <span className="text-gray-800 dark:text-gray-200 font-semibold ml-1.5">
                                                {app.living_space}
                                            </span>
                                        </div>

                                        {/* Government ID Info */}
                                        {app.id_type && (
                                            <div className="sm:col-span-2 bg-gray-50/80 dark:bg-[#0E131F] p-3 rounded-xl border border-gray-100 dark:border-gray-800 flex items-center justify-between flex-wrap gap-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <CreditCard className="w-4 h-4 text-orange-500 shrink-0" />
                                                    <span className="font-bold text-gray-800 dark:text-gray-200">{app.id_type}:</span>
                                                    {app.id_number && (
                                                        <MaskedIdDisplay idNumber={app.id_number} idType={app.id_type} />
                                                    )}
                                                </div>
                                                {(app.has_id_uploaded || app.id_photo_url) && (
                                                    <button
                                                        type="button"
                                                        disabled={loadingIdAdoptionId === app.adoption_id}
                                                        onClick={() => handleViewSecureId(app.adoption_id)}
                                                        className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        {loadingIdAdoptionId === app.adoption_id ? 'Loading Secure ID...' : 'View Uploaded ID'}
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        <div className="sm:col-span-2 bg-gray-50/70 dark:bg-[#0E131F] p-3 rounded-xl border border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-300">
                                            <span className="font-bold text-gray-700 dark:text-gray-200 block mb-1">Your Stated Reason:</span>
                                            "{app.reason}"
                                        </div>

                                        {app.review_notes && (
                                            <div className="sm:col-span-2 bg-orange-50/60 dark:bg-orange-950/30 p-3 rounded-xl border border-orange-100 dark:border-orange-900/40 text-orange-950 dark:text-orange-300">
                                                <span className="font-bold text-orange-900 dark:text-orange-200 block mb-0.5">
                                                    Barangay Review Remarks ({app.reviewer_name || 'Officer'}):
                                                </span>
                                                {app.review_notes}
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between flex-wrap gap-2.5">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {(app.certificate_id || app.agreement_signed_at) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedCertificateAdoptionId(app.adoption_id)}
                                                    className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
                                                    title="View verified adoption certificate and QR verification hash"
                                                >
                                                    <Award className="w-3.5 h-3.5 text-amber-600" />
                                                    <span>View Certificate & QR</span>
                                                </button>
                                            )}
                                            {(app.current_stage === 'Monitoring' || isFullyAdopted) && (
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedMonitoringApp(app)}
                                                    className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs hover:shadow-xs active:scale-95"
                                                    title="View and submit 30-day welfare health check-ins (Day 7, 14, 30)"
                                                >
                                                    <Activity className="w-3.5 h-3.5 text-indigo-600" />
                                                    <span>30-Day Welfare Check-ins</span>
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className="text-[11px] text-gray-400 dark:text-gray-400 hidden sm:inline">
                                                Barangay Animal Welfare
                                            </span>
                                            <Link
                                                to={`/adopt/journey/${app.holding_id}`}
                                                className="text-xs text-orange-600 dark:text-orange-400 font-bold hover:underline inline-flex items-center gap-1"
                                            >
                                                View Animal Journey <ArrowRight className="w-3 h-3" />
                                            </Link>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>

            {/* Cancel Adoption Request Confirmation Modal */}
            {selectedCancelApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in-95">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                                    <XCircle className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 dark:text-white">
                                        Cancel Adoption Request
                                    </h2>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {selectedCancelApp.animal_name || `Rescue Animal #${selectedCancelApp.holding_id}`} (App #{selectedCancelApp.adoption_id})
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (!cancelSubmitting) {
                                        setSelectedCancelApp(null);
                                        setCancelReason('');
                                        setCancelError(null);
                                    }
                                }}
                                disabled={cancelSubmitting}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer disabled:opacity-50"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Warning Box */}
                        <div className="bg-red-50/70 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-2xl p-4 mb-4 text-xs text-red-900 dark:text-red-300 space-y-1.5">
                            <p className="font-bold flex items-center gap-1.5 text-red-950 dark:text-red-200">
                                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                                Are you sure you want to cancel this adoption request?
                            </p>
                            <p className="leading-relaxed text-red-800 dark:text-red-300/90 pl-5.5">
                                Cancelling will immediately withdraw your application for this animal and make the rescue available for other applicants or adoption review. This record will remain in your history.
                            </p>
                        </div>

                        {/* Error Message */}
                        {cancelError && (
                            <div className="mb-4 p-3 rounded-xl bg-red-100 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-200 text-xs font-bold flex items-center gap-2">
                                <AlertCircle className="w-4 h-4 shrink-0" />
                                <span>{cancelError}</span>
                            </div>
                        )}

                        {/* Reason Input (Required) */}
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                Reason for Cancellation <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                rows={4}
                                value={cancelReason}
                                onChange={(e) => {
                                    setCancelReason(e.target.value);
                                    if (cancelError) setCancelError(null);
                                }}
                                placeholder="Please specify why you are cancelling this adoption request (e.g. change in personal circumstances, housing conflict, adopted elsewhere, etc.)..."
                                className="w-full p-3.5 text-xs rounded-xl border border-gray-200 dark:border-gray-700 focus:border-red-500 focus:outline-hidden resize-none bg-gray-50 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
                            />
                            <div className="flex items-center justify-between mt-1 text-[11px] text-gray-400">
                                <span>A clear cancellation reason helps our shelter maintain accurate records.</span>
                                <span className={cancelReason.trim() ? "text-emerald-500 font-bold" : "text-amber-500"}>
                                    {cancelReason.trim().length} chars
                                </span>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center justify-end gap-2.5">
                            <button
                                type="button"
                                onClick={() => {
                                    setSelectedCancelApp(null);
                                    setCancelReason('');
                                    setCancelError(null);
                                }}
                                disabled={cancelSubmitting}
                                className="px-4 py-2.5 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                            >
                                CANCEL
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmCancel}
                                disabled={cancelSubmitting || !cancelReason.trim()}
                                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                            >
                                {cancelSubmitting ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Cancelling Request...</span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="w-4 h-4" />
                                        <span>CONFIRM CANCELLATION</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Adopter Handover Confirmation Modal */}
            {selectedConfirmApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900 dark:text-white">
                                        Confirm Pet Received & Adopted
                                    </h2>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Final step to officially register ownership
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedConfirmApp(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl p-4 mb-4 text-xs text-emerald-950 dark:text-emerald-200 space-y-2">
                            <p className="leading-relaxed">
                                You are confirming that you have taken physical custody of{' '}
                                <strong>{selectedConfirmApp.animal_name || `Rescue Animal #${selectedConfirmApp.holding_id}`}</strong>{' '}
                                from the Barangay Animal Facility.
                            </p>
                            <p className="font-semibold text-emerald-900 dark:text-emerald-300">
                                ✓ The pet will officially be registered in your resident account records.<br />
                                ✓ Official adoption status is recorded with date, time, and staff verification.
                            </p>
                        </div>

                        <div className="mb-6">
                            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                                Additional Notes or Confirmation Feedback (Optional)
                            </label>
                            <textarea
                                rows={3}
                                value={confirmNotes}
                                onChange={(e) => setConfirmNotes(e.target.value)}
                                placeholder="e.g. Pet received in healthy condition, collar received, ready for home..."
                                className="w-full p-3 text-xs rounded-xl border border-gray-200 dark:border-gray-700 focus:border-emerald-500 focus:outline-hidden resize-none bg-gray-50 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setSelectedConfirmApp(null)}
                                className="px-4 py-2 text-xs font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmReceived}
                                disabled={confirmSubmitting}
                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
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
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-800 relative">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-orange-500" />
                                <div>
                                    <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                                        Protected Government ID Document
                                    </h3>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-400">
                                        Forensically watermarked • Ephemeral signed access (expires in 5 minutes)
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setPreviewIdPhotoUrl(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-black/5 dark:bg-black/30 flex items-center justify-center max-h-[70vh]">
                            <img
                                src={previewIdPhotoUrl}
                                alt="Government ID"
                                className="w-full h-auto max-h-[70vh] object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}
            {/* Stage 7 Digital Adoption Agreement Modal */}
            {selectedAgreementApp && (
                <AdoptionAgreementModal
                    adoptionId={selectedAgreementApp.adoption_id}
                    animalName={selectedAgreementApp.animal_name || 'Pet'}
                    applicantName={selectedAgreementApp.full_name}
                    isOpen={Boolean(selectedAgreementApp)}
                    onClose={() => setSelectedAgreementApp(null)}
                    onAgreementSigned={(cert) => {
                        showToast("Adoption Agreement signed successfully! Certificate generated.", "success");
                        fetchApps();
                        if (cert?.certificate_id || cert?.adoption_id) {
                            setSelectedCertificateAdoptionId(selectedAgreementApp.adoption_id);
                        }
                    }}
                />
            )}

            {/* Official Adoption Certificate Modal */}
            {selectedCertificateAdoptionId && (
                <AdoptionCertificateModal
                    adoptionId={selectedCertificateAdoptionId}
                    isOpen={Boolean(selectedCertificateAdoptionId)}
                    onClose={() => setSelectedCertificateAdoptionId(null)}
                />
            )}

            {/* Stage 9 Post-Adoption 30-Day Welfare Monitoring Modal */}
            {selectedMonitoringApp && (
                <AdoptionMonitoringModal
                    adoptionId={selectedMonitoringApp.adoption_id}
                    animalName={selectedMonitoringApp.animal_name || 'Pet'}
                    isOpen={Boolean(selectedMonitoringApp)}
                    onClose={() => setSelectedMonitoringApp(null)}
                    onUpdate={() => {
                        fetchApps();
                    }}
                />
            )}

            <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} />
        </div>
    );
};

export default MyAdoptionApplications;
