import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
    ClipboardList,
    Award,
    Activity,
    Calendar,
    Home as HomeIcon,
    ShieldCheck,
    User,
    Phone,
    MapPin,
    Plus,
    UploadCloud
} from 'lucide-react';
import MaskedIdDisplay from '../../components/MaskedIdDisplay';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import AdoptionStageStepper from '../../components/AdoptionStageStepper';
import AdoptionAgreementModal from '../../components/Modals/AdoptionAgreementModal';
import AdoptionCertificateModal from '../../components/Modals/AdoptionCertificateModal';
import AdoptionMonitoringModal from '../../components/Modals/AdoptionMonitoringModal';
import { AdoptionDossierModal } from '../../components/Modals/AdoptionStaffStageModals';
import { getUnifiedAdoptionStatus } from '../../utils/adoptionStatus';

interface MonitoringLog {
    log_id: number;
    adoption_id: number;
    milestone_name: string;
    due_date: string;
    submitted_at?: string | null;
    status: string;
    health_status?: string | null;
    photos?: string[] | null;
    vet_record_url?: string | null;
    adopter_notes?: string | null;
    reviewer_name?: string | null;
    review_notes?: string | null;
    reviewed_at?: string | null;
}

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
    certificate_number?: string | null;
    approval_date?: string | null;
    is_certificate_sent?: boolean;
    certificate_sent_at?: string | null;
    handover_location?: string | null;
    handover_scheduled_date?: string | null;
    handover_scheduled_time?: string | null;
    handover_assigned_staff?: string | null;
    handover_notes?: string | null;
    handover_status?: string | null;
    resident_handover_confirmed?: boolean;
    resident_handover_confirmed_at?: string | null;
    handover_photo_url?: string | null;
    post_monitoring_status?: string;
    interview_scheduled_at?: string | null;
    interview_mode?: string | null;
    interview_location?: string | null;
    interview_result?: string | null;
    interview_notes?: string | null;
    home_visit_scheduled_date?: string | null;
    home_visit_result?: string | null;
    adoption_completed_at?: string | null;
}

const MyAdoptionApplications = () => {
    const [applications, setApplications] = useState<AdoptionApp[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'>('All');
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

    // Confirm Received Modal & ID Lightbox
    const [selectedConfirmApp, setSelectedConfirmApp] = useState<AdoptionApp | null>(null);
    const [selectedAppDetails, setSelectedAppDetails] = useState<AdoptionApp | null>(null);
    const [showApplicantDetailsModal, setShowApplicantDetailsModal] = useState(false);
    const [confirmNotes, setConfirmNotes] = useState('');
    const [confirmSubmitting, setConfirmSubmitting] = useState(false);
    const [previewIdPhotoUrl, setPreviewIdPhotoUrl] = useState<string | null>(null);
    const [loadingIdAdoptionId, setLoadingIdAdoptionId] = useState<number | null>(null);

    // 9-Stage Action Modals
    const [selectedAgreementApp, setSelectedAgreementApp] = useState<AdoptionApp | null>(null);
    const [selectedCertificateAdoptionId, setSelectedCertificateAdoptionId] = useState<number | null>(null);
    const [selectedMonitoringApp, setSelectedMonitoringApp] = useState<AdoptionApp | null>(null);
    const [selectedDossierAppId, setSelectedDossierAppId] = useState<number | null>(null);

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

    const [confirmingHandoverId, setConfirmingHandoverId] = useState<number | null>(null);

    const handleConfirmHandoverSchedule = async (adoptionId: number) => {
        setConfirmingHandoverId(adoptionId);
        try {
            await api.post(`/adoptions/${adoptionId}/handover/resident-confirm`);
            await fetchApps(true);
            showToast("Handover schedule confirmed! See you at the scheduled time.", "success");
        } catch (err: any) {
            console.error("Failed to confirm handover schedule:", err);
            showToast(err.response?.data?.detail || "Failed to confirm handover schedule.", "error");
        } finally {
            setConfirmingHandoverId(null);
        }
    };

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 4500);
    };

    const fetchApps = async (silent: boolean = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await api.get('/adoptions/my-applications');
            setApplications(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Failed to load my adoption applications", err);
            if (!silent) showToast("Failed to load your applications.", "error");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        fetchApps();

        // Automatic synchronization polling (every 8 seconds)
        const pollInterval = setInterval(() => {
            fetchApps(true);
        }, 8000);

        // Immediate refresh when returning to this tab
        const handleFocus = () => {
            fetchApps(true);
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(pollInterval);
            window.removeEventListener('focus', handleFocus);
        };
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
        const info = getUnifiedAdoptionStatus(app);
        return (
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black border ${info.badgeClasses}`}>
                {info.isOfficiallyAdopted ? (
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                ) : app.status === 'Cancelled' ? (
                    <XCircle className="w-3.5 h-3.5 text-gray-500" />
                ) : app.status === 'Rejected' ? (
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                ) : app.status === 'Approved' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                )}
                <span>{info.label}</span>
            </span>
        );
    };

    const getStageBadgeLabel = (app: AdoptionApp) => {
        const statusObj = getUnifiedAdoptionStatus(app);
        return `Stage ${statusObj.stageIndex + 1} — ${statusObj.stageLabel.replace(/^\d+\.\s*/, '')}`;
    };

    const getImportantDateInfo = (app: AdoptionApp) => {
        const currentStage = app.current_stage || (app.status === 'Approved' ? 'Interview' : 'Application');

        if (currentStage === 'Successful_Adoption' || currentStage === 'Completed' || app.adoption_completed_at) {
            return {
                label: 'Adoption Completed',
                date: app.adoption_completed_at
                    ? new Date(app.adoption_completed_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                    : new Date(app.updated_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
            };
        }
        if (currentStage === 'Handover' && app.handover_scheduled_date) {
            return {
                label: 'Handover Schedule',
                date: `${new Date(app.handover_scheduled_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}${app.handover_scheduled_time ? ` • ${app.handover_scheduled_time}` : ''}`
            };
        }
        if (currentStage === 'Home_Visit' && app.home_visit_scheduled_date) {
            return {
                label: 'Home Visit Schedule',
                date: new Date(app.home_visit_scheduled_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
            };
        }
        if (currentStage === 'Interview' && app.interview_scheduled_at) {
            return {
                label: 'Interview Schedule',
                date: new Date(app.interview_scheduled_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            };
        }
        if (app.approval_date || (app.status === 'Approved' && app.reviewed_at)) {
            return {
                label: 'Approved Date',
                date: new Date(app.approval_date || app.reviewed_at!).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
            };
        }
        return {
            label: 'Submitted',
            date: new Date(app.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
        };
    };

    // Synchronized active application object
    const activeApp = selectedAppDetails
        ? (applications.find(a => a.adoption_id === selectedAppDetails.adoption_id) || selectedAppDetails)
        : null;

    // ── Stage 9 Inline Welfare Monitoring State (Resident POV) ─────────
    const [residentMonitoringLogs, setResidentMonitoringLogs] = useState<MonitoringLog[]>([]);
    const [loadingResidentLogs, setLoadingResidentLogs] = useState(false);
    const [residentMonitoringTab, setResidentMonitoringTab] = useState<'history' | 'add'>('history');

    // Resident Add Monitoring Record form fields
    const [residentMonitoringDate, setResidentMonitoringDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [residentPetCondition, setResidentPetCondition] = useState<string>('Healthy');
    const [residentHealthStatus, setResidentHealthStatus] = useState<string>('');
    const [residentBehavior, setResidentBehavior] = useState<string>('');
    const [residentFoodAppetite, setResidentFoodAppetite] = useState<string>('Normal');
    const [residentVetUpdate, setResidentVetUpdate] = useState<string>('');
    const [residentNotes, setResidentNotes] = useState<string>('');
    const [residentPhotoFiles, setResidentPhotoFiles] = useState<File[]>([]);
    const [residentPhotoPreviews, setResidentPhotoPreviews] = useState<string[]>([]);
    const [residentSubmittingMonitoring, setResidentSubmittingMonitoring] = useState(false);
    const [residentMonitoringSuccess, setResidentMonitoringSuccess] = useState<string | null>(null);
    const [residentMonitoringError, setResidentMonitoringError] = useState<string | null>(null);

    const parseMonitoringMeta = (log: MonitoringLog) => {
        let meta: any = {};
        if (log.review_notes && log.review_notes.includes('__JSON_META__')) {
            try {
                const raw = log.review_notes.split('__JSON_META__')[1].split('__END_META__')[0];
                meta = JSON.parse(raw);
            } catch (e) {
                console.error("Failed to parse log metadata", e);
            }
        }
        const isAdopter = meta.is_adopter_submission !== undefined
            ? Boolean(meta.is_adopter_submission)
            : (log.milestone_name?.toLowerCase().includes('adopter') || !log.reviewer_name);

        return {
            isAdopter,
            monitoringDate: meta.monitoring_date || log.submitted_at || log.due_date,
            monitoringType: meta.monitoring_type || (isAdopter ? 'Adopter Welfare Check-in' : 'Barangay Staff Follow-up'),
            personnel: meta.personnel || log.reviewer_name || (isAdopter ? 'You (Adopter)' : 'Barangay Staff'),
            animalCondition: meta.animal_condition || log.health_status || 'Healthy',
            healthStatus: meta.health_status || log.health_status || 'Healthy',
            livingCondition: meta.living_condition || 'Good',
            foodAndWater: meta.food_and_water || 'Normal',
            shelterCondition: meta.shelter_condition || 'Safe',
            vaccinationStatus: meta.vaccination_status || '',
            behavior: meta.behavior || '',
            remarks: meta.remarks || log.adopter_notes || (log.review_notes && !log.review_notes.includes('__JSON_META__') ? log.review_notes : ''),
            nextFollowup: meta.next_followup_date || '',
            photos: (Array.isArray(log.photos) && log.photos.length > 0) ? log.photos : (Array.isArray(meta.photos) ? meta.photos : [])
        };
    };

    const fetchResidentMonitoringLogs = async (adoptionId: number) => {
        setLoadingResidentLogs(true);
        try {
            const res = await api.get(`/adoptions/${adoptionId}/monitoring`);
            setResidentMonitoringLogs(Array.isArray(res.data) ? res.data : []);
        } catch (err: any) {
            console.error("Failed to load resident monitoring logs:", err);
        } finally {
            setLoadingResidentLogs(false);
        }
    };

    useEffect(() => {
        if (activeApp?.adoption_id) {
            fetchResidentMonitoringLogs(activeApp.adoption_id);
            setResidentMonitoringTab('history');
            setResidentMonitoringSuccess(null);
            setResidentMonitoringError(null);
        }
    }, [activeApp?.adoption_id]);

    const handlePhotoFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        setResidentPhotoFiles(prev => [...prev, ...files]);
        const newPreviews = files.map(file => URL.createObjectURL(file));
        setResidentPhotoPreviews(prev => [...prev, ...newPreviews]);
        e.target.value = '';
    };

    const handleRemoveResidentPhoto = (index: number) => {
        setResidentPhotoFiles(prev => prev.filter((_, i) => i !== index));
        setResidentPhotoPreviews(prev => {
            if (prev[index]) URL.revokeObjectURL(prev[index]);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSubmitResidentMonitoring = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeApp) return;
        setResidentSubmittingMonitoring(true);
        setResidentMonitoringError(null);
        setResidentMonitoringSuccess(null);

        try {
            let uploadedPhotoUrls: string[] = [];
            if (residentPhotoFiles.length > 0) {
                const formData = new FormData();
                residentPhotoFiles.forEach(file => {
                    formData.append('files', file);
                });
                const uploadRes = await api.post('/adoptions/upload-monitoring-photos', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                uploadedPhotoUrls = uploadRes.data?.urls || [];
            }

            await api.post(`/adoptions/${activeApp.adoption_id}/monitoring/record`, {
                monitoring_date: residentMonitoringDate ? new Date(residentMonitoringDate).toISOString() : new Date().toISOString(),
                monitoring_type: "Adopter Welfare Check-in",
                animal_condition: residentPetCondition,
                health_status: residentHealthStatus || residentPetCondition,
                behavior: residentBehavior || "Adjusting well to home",
                food_and_water: residentFoodAppetite,
                vaccination_status: residentVetUpdate || "Up to Date",
                remarks: residentNotes || undefined,
                photos: uploadedPhotoUrls,
            });

            // Clean up previews
            residentPhotoPreviews.forEach(url => URL.revokeObjectURL(url));
            setResidentPhotoFiles([]);
            setResidentPhotoPreviews([]);
            setResidentHealthStatus('');
            setResidentBehavior('');
            setResidentVetUpdate('');
            setResidentNotes('');
            setResidentPetCondition('Healthy');
            setResidentFoodAppetite('Normal');
            setResidentMonitoringDate(new Date().toISOString().split('T')[0]);

            setResidentMonitoringSuccess("Monitoring record submitted successfully.");
            showToast("Monitoring record submitted successfully.", "success");
            setResidentMonitoringTab('history');
            await fetchResidentMonitoringLogs(activeApp.adoption_id);
            fetchApps(true);
        } catch (err: any) {
            console.error("Failed to submit monitoring record:", err);
            setResidentMonitoringError(err.response?.data?.detail || "Failed to submit monitoring record. Please try again.");
        } finally {
            setResidentSubmittingMonitoring(false);
        }
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
                {/* Toast Notification */}
                {toastMessage && (
                    <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 text-xs font-bold border shadow-xs animate-in fade-in slide-in-from-top-2 ${toastMessage.type === 'error'
                        ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900/60'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/60'
                        }`}>
                        {toastMessage.type === 'error' ? (
                            <AlertCircle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        )}
                        <span>{toastMessage.text}</span>
                    </div>
                )}

                {/* ─────────────────────────────────────────────────────────────
                    1. COMPLETE APPLICATION DETAILS VIEW (WHEN VIEW DETAILS CLICKED)
                   ───────────────────────────────────────────────────────────── */}
                {activeApp ? (
                    <div className="space-y-6 animate-in fade-in duration-200">
                        {/* Top Back Action Bar */}
                        <div className="flex items-center justify-between flex-wrap gap-4 bg-white dark:bg-[#151C2C] p-4 sm:p-5 rounded-3xl border border-gray-200/90 dark:border-gray-800 shadow-xs">
                            <button
                                onClick={() => setSelectedAppDetails(null)}
                                className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-2xs hover:-translate-x-0.5 active:scale-95"
                                title="Return to applications list"
                            >
                                <ArrowLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                                <span>Back to All Applications</span>
                            </button>

                            <div className="flex items-center gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setSelectedDossierAppId(activeApp.adoption_id)}
                                    className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                                    title="View complete official case dossier and audit history"
                                >
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>Full Case Dossier</span>
                                </button>
                                {getStatusBadge(activeApp)}
                                <span className="text-[10px] font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800/60 px-2.5 py-1 rounded-full">
                                    {getStageBadgeLabel(activeApp)}
                                </span>
                            </div>
                        </div>

                        {/* SECTION B: ANIMAL INFORMATION HERO CARD */}
                        <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50/70 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-orange-950/40 rounded-3xl p-5 sm:p-6 border border-orange-200/90 dark:border-orange-800/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                                <img
                                    src={getPetPicture(activeApp.animal_photo)}
                                    alt={activeApp.animal_name || 'Pet'}
                                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white dark:border-gray-800 shadow-md shrink-0"
                                />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-orange-700 dark:text-orange-300 bg-white/80 dark:bg-[#151C2C]/80 px-2.5 py-0.5 rounded-full border border-orange-200 dark:border-orange-800">
                                            Adoptable Rescue Pet
                                        </span>
                                        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 bg-white/70 dark:bg-[#151C2C]/70 px-2.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-800">
                                            Holding ID: #{activeApp.holding_id}
                                        </span>
                                    </div>
                                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight truncate">
                                        {activeApp.animal_name || `Rescue Animal #${activeApp.holding_id}`}
                                    </h2>
                                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 font-semibold mt-0.5">
                                        {activeApp.animal_type || 'Rescue'} {activeApp.animal_breed ? `• ${activeApp.animal_breed}` : ''}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <Link
                                    to={`/adopt/journey/${activeApp.holding_id}`}
                                    className="px-4 py-2 bg-white dark:bg-[#151C2C] hover:bg-orange-50 dark:hover:bg-orange-950/40 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs"
                                >
                                    <span>View Journey</span>
                                    <ArrowRight className="w-3.5 h-3.5 text-orange-500" />
                                </Link>
                            </div>
                        </div>

                        {/* SECTION A: COMPACT APPLICANT / ADOPTER SUMMARY */}
                        <div className="bg-white dark:bg-[#151C2C] rounded-3xl p-5 sm:p-6 border border-slate-200/90 dark:border-gray-800 shadow-xs space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-gray-800">
                                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                    <User className="w-4 h-4 text-orange-500" /> APPLICANT / ADOPTER SUMMARY
                                </h3>
                                <span className="text-xs text-slate-400 dark:text-gray-500 font-bold">
                                    Application #{activeApp.adoption_id}
                                </span>
                            </div>

                            <div className="space-y-2.5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <span className="text-sm font-black text-slate-900 dark:text-white">
                                            {activeApp.full_name}
                                        </span>
                                        <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">•</span>
                                        <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-bold">
                                            <Phone className="w-3.5 h-3.5 text-orange-500" /> {activeApp.contact_no}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-slate-400 font-semibold">Status:</span>
                                        {getStatusBadge(activeApp)}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                                    <MapPin className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                                    <span className="truncate font-semibold" title={activeApp.address}>
                                        {activeApp.address || 'Santa Maria, Bulacan'}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-gray-800 flex items-center justify-end gap-2 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setSelectedDossierAppId(activeApp.adoption_id)}
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-50 dark:bg-orange-950/40 hover:bg-orange-100 dark:hover:bg-orange-900/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 rounded-xl text-xs font-black transition-all cursor-pointer shadow-2xs active:scale-95"
                                >
                                    <FileText className="w-4 h-4 text-orange-500" />
                                    <span>Full Case Dossier</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowApplicantDetailsModal(true)}
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-orange-50 dark:hover:bg-orange-950/40 text-slate-800 dark:text-slate-100 hover:text-orange-600 dark:hover:text-orange-400 border border-slate-200 dark:border-gray-700 hover:border-orange-200 dark:hover:border-orange-800 rounded-xl text-xs font-black transition-all cursor-pointer shadow-2xs active:scale-95"
                                >
                                    <Eye className="w-4 h-4 text-orange-500" />
                                    <span>View Applicant Details</span>
                                </button>
                            </div>
                        </div>

                        {/* SECTION C: COMPLETE 10-STAGE ADOPTION LIFECYCLE */}
                        <div className="bg-white dark:bg-[#151C2C] rounded-3xl p-5 sm:p-6 border border-slate-200/90 dark:border-gray-800 shadow-xs space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-gray-800">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4 text-orange-500" /> Adoption Lifecycle
                                </h3>
                                <span className="text-xs text-slate-400 dark:text-gray-500 font-medium">
                                    10-Stage Workflow Progression
                                </span>
                            </div>
                            <AdoptionStageStepper
                                currentStage={activeApp.current_stage || (activeApp.status === 'Approved' ? 'Interview' : 'Application')}
                                stageStatus={activeApp.application_stage_status || (activeApp.status === 'Approved' ? 'In_Progress' : 'Submitted')}
                                status={activeApp.status}
                                postMonitoringStatus={activeApp.post_monitoring_status}
                            />
                        </div>

                        {/* SECTION D & E: CURRENT STAGE & STAGE-SPECIFIC INFORMATION */}
                        {/* STAGE 3: Interview Banner */}
                        {activeApp.status !== 'Cancelled' && activeApp.status !== 'Rejected' && activeApp.current_stage === 'Interview' && (
                            <div className="p-5 rounded-3xl bg-purple-50/90 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800/80 space-y-3 shadow-xs">
                                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-purple-200/70 dark:border-purple-800/60">
                                    <span className="text-xs font-black uppercase tracking-wider text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                                        <Calendar className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                        CURRENT STAGE: STAGE 3 — INTERVIEW
                                    </span>
                                    {activeApp.interview_scheduled_at ? (
                                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                                            Scheduled: {new Date(activeApp.interview_scheduled_at).toLocaleString('en-PH', {
                                                month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
                                            })}
                                        </span>
                                    ) : (
                                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                                            Awaiting Barangay Staff Schedule
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-purple-950 dark:text-purple-200 leading-relaxed">
                                    {activeApp.interview_scheduled_at
                                        ? `Your interview has been scheduled via ${activeApp.interview_mode || 'In-Person Session'} at ${activeApp.interview_location || 'Barangay Animal Facility'}. Please be ready at the designated schedule to discuss pet care responsibilities.`
                                        : 'Your application has advanced to the Interview stage. An assigned Barangay welfare officer will contact you shortly with the schedule.'}
                                </p>
                                {activeApp.interview_notes && (
                                    <div className="bg-purple-100/70 dark:bg-purple-900/40 p-3 rounded-xl text-xs text-purple-900 dark:text-purple-200 border border-purple-200/60 dark:border-purple-800/60">
                                        <span className="font-bold block text-[10px] uppercase tracking-wider mb-0.5">Instructions from Officer:</span>
                                        <p className="whitespace-pre-wrap">{activeApp.interview_notes}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STAGE 4: Home Visit Banner */}
                        {activeApp.status !== 'Cancelled' && activeApp.status !== 'Rejected' && activeApp.current_stage === 'Home_Visit' && (
                            <div className="p-5 rounded-3xl bg-teal-50/90 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/80 space-y-3 shadow-xs">
                                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-teal-200/70 dark:border-teal-800/60">
                                    <span className="text-xs font-black uppercase tracking-wider text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                                        <HomeIcon className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                                        CURRENT STAGE: STAGE 4 — HOME VISIT
                                    </span>
                                    {activeApp.home_visit_scheduled_date ? (
                                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/60 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-700">
                                            Visit Date: {new Date(activeApp.home_visit_scheduled_date).toLocaleDateString('en-PH', {
                                                month: 'short', day: 'numeric', year: 'numeric'
                                            })}
                                        </span>
                                    ) : (
                                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                                            Scheduling In Progress
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-teal-950 dark:text-teal-200 leading-relaxed">
                                    {activeApp.home_visit_scheduled_date
                                        ? 'A Barangay animal welfare officer is scheduled to visit your home to inspect the living area and fence safety for this rescue pet.'
                                        : 'Your interview is complete. A Barangay inspector is preparing to schedule your home living space inspection.'}
                                </p>
                            </div>
                        )}

                        {/* STAGE 5: Review Banner */}
                        {activeApp.status !== 'Cancelled' && activeApp.status !== 'Rejected' && activeApp.current_stage === 'Review' && (
                            <div className="p-5 rounded-3xl bg-indigo-50/90 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 space-y-2.5 shadow-xs">
                                <div className="flex items-center gap-2 pb-2 border-b border-indigo-200/70 dark:border-indigo-800/60">
                                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                    <span className="text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                                        CURRENT STAGE: STAGE 5 — APPLICATION REVIEW
                                    </span>
                                </div>
                                <p className="text-xs text-indigo-950 dark:text-indigo-200 leading-relaxed">
                                    Your complete application dossier, interview assessment, and home visit evaluations are undergoing official final review by the Barangay.
                                </p>
                            </div>
                        )}

                        {/* STAGE 6 & 7: Approval & Certificate */}
                        {activeApp.status !== 'Cancelled' && activeApp.status !== 'Rejected' && (activeApp.current_stage === 'Approval' || activeApp.current_stage === 'Certificate') && (
                            <div className="p-5 rounded-3xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-3.5 shadow-xs">
                                <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-emerald-200 dark:border-emerald-800/70">
                                    <div className="flex items-center gap-2">
                                        <Award className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                        <div>
                                            <h4 className="font-black text-sm text-emerald-950 dark:text-emerald-200 uppercase tracking-wide">
                                                CURRENT STAGE: ADOPTION OFFICIALLY APPROVED
                                            </h4>
                                            <p className="text-xs text-emerald-800 dark:text-emerald-300">
                                                Your adoption application has been officially approved by the Barangay.
                                            </p>
                                        </div>
                                    </div>
                                    {activeApp.certificate_number && (
                                        <span className="font-mono text-xs font-bold px-3 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-700">
                                            Cert #: {activeApp.certificate_number}
                                        </span>
                                    )}
                                </div>

                                {activeApp.is_certificate_sent ? (
                                    <div className="p-4 bg-white/90 dark:bg-[#151C2C]/90 rounded-2xl border border-emerald-200 dark:border-emerald-800/80 space-y-2.5">
                                        <div className="flex items-center justify-between flex-wrap gap-2">
                                            <div>
                                                <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 tracking-wider block">
                                                    CERTIFICATE OF ADOPTION READY
                                                </span>
                                                <div className="text-xs text-slate-700 dark:text-slate-300 font-semibold mt-0.5">
                                                    Animal: <strong>{activeApp.animal_name || 'Rescue Pet'}</strong> • Adopter: <strong>{activeApp.full_name}</strong>
                                                </div>
                                                {activeApp.certificate_sent_at && (
                                                    <div className="text-[10px] text-slate-400 mt-0.5">
                                                        Date Issued: {new Date(activeApp.certificate_sent_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedCertificateAdoptionId(activeApp.adoption_id)}
                                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                                            >
                                                <Award className="w-4 h-4" />
                                                <span>View / Download Certificate</span>
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3.5 bg-white/60 dark:bg-[#151C2C]/60 rounded-xl border border-emerald-100 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                                        <span>The Barangay is preparing your official Adoption Certificate. You will be notified once it is sent.</span>
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                                            Preparing Certificate
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STAGE 8: Handover Schedule & Confirmations */}
                        {activeApp.status !== 'Cancelled' && activeApp.status !== 'Rejected' && activeApp.current_stage === 'Handover' && (
                            <div className="p-5 rounded-3xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 space-y-3 shadow-xs">
                                <div className="flex items-start gap-3 pb-2 border-b border-amber-200/70 dark:border-amber-800/60">
                                    <div className="p-2 bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-xl mt-0.5">
                                        <Heart className="w-5 h-5" />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-sm text-amber-950 dark:text-amber-200 uppercase tracking-wide">
                                            CURRENT STAGE: STAGE 8 — HANDOVER & PHYSICAL CLAIMING
                                        </h4>
                                        <p className="text-xs text-amber-900 dark:text-amber-300 mt-0.5 leading-relaxed">
                                            {activeApp.handover_status === 'Scheduled' || activeApp.handover_scheduled_date
                                                ? 'Your adoption handover has been scheduled with the Barangay.'
                                                : 'Your adoption has been approved! The Barangay is preparing the handover schedule for you to claim your pet.'}
                                        </p>
                                    </div>
                                </div>

                                {(activeApp.handover_status === 'Scheduled' || activeApp.handover_scheduled_date) && (
                                    <div className="bg-white/90 dark:bg-[#151C2C]/90 rounded-2xl p-4 border border-amber-200 dark:border-amber-800/80 space-y-3 text-xs">
                                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                                            <div>
                                                <span className="text-slate-400 block text-[10px] font-medium">Animal:</span>
                                                <strong className="text-slate-900 dark:text-white font-bold">{activeApp.animal_name || 'Rescue Pet'}</strong>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px] font-medium">Date:</span>
                                                <strong className="text-slate-900 dark:text-white font-bold">
                                                    {activeApp.handover_scheduled_date ? new Date(activeApp.handover_scheduled_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'To be confirmed'}
                                                </strong>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px] font-medium">Time:</span>
                                                <strong className="text-slate-900 dark:text-white font-bold">{activeApp.handover_scheduled_time || '10:00 AM'}</strong>
                                            </div>
                                            <div>
                                                <span className="text-slate-400 block text-[10px] font-medium">Location:</span>
                                                <strong className="text-slate-900 dark:text-white font-bold">{activeApp.handover_location || 'Barangay Facility'}</strong>
                                            </div>
                                        </div>

                                        {activeApp.handover_assigned_staff && (
                                            <div className="text-[11px] text-slate-600 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
                                                Assigned Barangay Staff: <strong>{activeApp.handover_assigned_staff}</strong>
                                            </div>
                                        )}
                                        {activeApp.handover_notes && (
                                            <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-lg border border-amber-200/60">
                                                Special Instructions: {activeApp.handover_notes}
                                            </div>
                                        )}

                                        {/* Resident Confirmation */}
                                        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500 text-[11px]">Your Confirmation:</span>
                                                {activeApp.resident_handover_confirmed || activeApp.is_handed_over ? (
                                                    <span className="text-emerald-700 dark:text-emerald-400 font-bold text-xs flex items-center gap-1">
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> ✓ Confirmed
                                                    </span>
                                                ) : (
                                                    <span className="text-amber-700 dark:text-amber-400 font-semibold text-xs flex items-center gap-1">
                                                        <Clock className="w-3.5 h-3.5" /> Pending Confirmation
                                                    </span>
                                                )}
                                            </div>

                                            {!activeApp.resident_handover_confirmed && !activeApp.is_handed_over && (
                                                <button
                                                    type="button"
                                                    disabled={confirmingHandoverId === activeApp.adoption_id}
                                                    onClick={() => handleConfirmHandoverSchedule(activeApp.adoption_id)}
                                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    <span>{confirmingHandoverId === activeApp.adoption_id ? 'Confirming...' : 'Confirm Handover Schedule'}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {!activeApp.is_handed_over && (
                                    <div className="pt-2 flex items-center justify-end">
                                        <button
                                            onClick={() => setSelectedConfirmApp(activeApp)}
                                            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                            <span>Confirm Pet Received & Finalize Adoption</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* STAGE 9: Monitoring (Resident POV Inline Section) */}
                        {activeApp.status !== 'Cancelled' && activeApp.status !== 'Rejected' && activeApp.current_stage === 'Monitoring' && (
                            <div className="space-y-4 animate-in fade-in duration-200">
                                {/* Current Stage Banner */}
                                <div className="p-5 rounded-3xl bg-indigo-50/90 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/80 space-y-3 shadow-xs">
                                    <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-indigo-200 dark:border-indigo-800/70">
                                        <div className="flex items-center gap-2">
                                            <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                            <div>
                                                <h4 className="font-black text-sm text-indigo-950 dark:text-indigo-200 uppercase tracking-wide">
                                                    CURRENT STAGE: STAGE 9 — POST-ADOPTION WELFARE MONITORING
                                                </h4>
                                                <p className="text-xs text-indigo-800 dark:text-indigo-300">
                                                    Welfare follow-up checks and health check-ins for {activeApp.animal_name || 'Adopted Pet'}
                                                </p>
                                            </div>
                                        </div>
                                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-600 text-white shadow-2xs">
                                            Active Monitoring ●
                                        </span>
                                    </div>
                                    <p className="text-xs text-indigo-950 dark:text-indigo-200 leading-relaxed">
                                        During this 30-day post-adoption transition period, you can log regular updates regarding your adopted pet's adjustment, health status, and living condition directly below.
                                    </p>
                                </div>

                                {/* INLINE POST-ADOPTION WELFARE MONITORING SECTION */}
                                <div className="bg-white dark:bg-[#151C2C] rounded-3xl p-5 sm:p-6 border border-slate-200/90 dark:border-gray-800 shadow-xs space-y-5">
                                    {/* Header & Section Navigation */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-gray-800">
                                        <div>
                                            <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                                                <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                                POST-ADOPTION WELFARE MONITORING
                                            </h3>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                Welfare follow-up records and health check-ins for your adopted pet
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 bg-slate-100 dark:bg-[#0E131F] p-1 rounded-2xl border border-slate-200 dark:border-slate-800">
                                            <button
                                                type="button"
                                                onClick={() => setResidentMonitoringTab('history')}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                                                    residentMonitoringTab === 'history'
                                                        ? 'bg-indigo-600 text-white shadow-xs'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                Monitoring History ({residentMonitoringLogs.length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setResidentMonitoringTab('add');
                                                    setResidentMonitoringSuccess(null);
                                                }}
                                                className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                                                    residentMonitoringTab === 'add'
                                                        ? 'bg-indigo-600 text-white shadow-xs'
                                                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                                                }`}
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                                <span>+ Add Monitoring Record</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Notifications */}
                                    {residentMonitoringSuccess && (
                                        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in">
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                                                <span>{residentMonitoringSuccess}</span>
                                            </div>
                                            <button 
                                                onClick={() => setResidentMonitoringSuccess(null)}
                                                className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 p-1 cursor-pointer"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}

                                    {residentMonitoringError && (
                                        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300 text-xs font-bold flex items-center justify-between gap-3 animate-in fade-in">
                                            <div className="flex items-center gap-2">
                                                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                                                <span>{residentMonitoringError}</span>
                                            </div>
                                            <button 
                                                onClick={() => setResidentMonitoringError(null)}
                                                className="text-red-700 hover:text-red-900 dark:text-red-400 p-1 cursor-pointer"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    )}

                                    {/* ── SECTION 1: MONITORING HISTORY ── */}
                                    {residentMonitoringTab === 'history' && (
                                        <div className="space-y-4">
                                            {loadingResidentLogs ? (
                                                <div className="py-12 text-center space-y-3">
                                                    <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                                                    <p className="text-xs font-bold text-slate-500">Loading welfare monitoring history...</p>
                                                </div>
                                            ) : residentMonitoringLogs.length === 0 ? (
                                                <div className="p-8 sm:p-10 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-slate-50/50 dark:bg-slate-900/20 space-y-3">
                                                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                                                        <Activity className="w-6 h-6" />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                                            No monitoring records logged yet.
                                                        </p>
                                                        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto">
                                                            Share regular updates on how your newly adopted pet is adjusting to help complete the 1-month welfare follow-up.
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setResidentMonitoringTab('add')}
                                                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
                                                    >
                                                        <Plus className="w-3.5 h-3.5" />
                                                        <span>+ Add First Monitoring Record</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="space-y-3.5">
                                                    {residentMonitoringLogs.map((log) => {
                                                        const meta = parseMonitoringMeta(log);
                                                        return (
                                                            <div
                                                                key={log.log_id}
                                                                className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                                                                    meta.isAdopter
                                                                        ? 'bg-orange-50/30 dark:bg-orange-950/10 border-orange-200/80 dark:border-orange-800/50'
                                                                        : 'bg-indigo-50/30 dark:bg-indigo-950/10 border-indigo-200/80 dark:border-indigo-800/50'
                                                                }`}
                                                            >
                                                                {/* Top Record Header */}
                                                                <div className="flex items-start sm:items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                                                                            meta.isAdopter
                                                                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/70 dark:text-orange-300'
                                                                                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                                                                        }`}>
                                                                            <Activity className="w-4 h-4" />
                                                                        </div>
                                                                        <div>
                                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                                                                                    {log.milestone_name.replace(/_/g, ' ')}
                                                                                </h4>
                                                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                                                                    meta.isAdopter
                                                                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                                                                                        : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
                                                                                }`}>
                                                                                    {meta.isAdopter ? 'Submitted by You' : 'Barangay Monitoring Record'}
                                                                                </span>
                                                                            </div>
                                                                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5 flex-wrap">
                                                                                <span className="flex items-center gap-1 font-medium">
                                                                                    <Calendar className="w-3 h-3 text-slate-400" />
                                                                                    Monitoring Date: {meta.monitoringDate ? new Date(meta.monitoringDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                                                                </span>
                                                                                {log.submitted_at && (
                                                                                    <span className="text-slate-400">
                                                                                        • Submitted {new Date(log.submitted_at).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                                                                            log.status === 'Approved'
                                                                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                                                                : log.status === 'Submitted'
                                                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                                                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                                                        }`}>
                                                                            <CheckCircle2 className="w-3 h-3" />
                                                                            {log.status === 'Submitted' ? 'Submitted' : log.status}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                {/* Details Grid */}
                                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 py-3 text-xs">
                                                                    <div className="p-2.5 bg-white/80 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800/80">
                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Pet Condition</span>
                                                                        <span className="font-black text-slate-800 dark:text-slate-200">{meta.animalCondition}</span>
                                                                    </div>
                                                                    <div className="p-2.5 bg-white/80 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800/80">
                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Health Status</span>
                                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{meta.healthStatus}</span>
                                                                    </div>
                                                                    <div className="p-2.5 bg-white/80 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800/80">
                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Food / Appetite</span>
                                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{meta.foodAndWater}</span>
                                                                    </div>
                                                                    <div className="p-2.5 bg-white/80 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800/80">
                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Recorded By</span>
                                                                        <span className="font-semibold text-slate-800 dark:text-slate-200">{meta.personnel}</span>
                                                                    </div>
                                                                </div>

                                                                {/* Behavior & Adaptation */}
                                                                {meta.behavior && (
                                                                    <div className="text-xs text-slate-700 dark:text-slate-300 py-1.5">
                                                                        <span className="font-bold text-slate-500 dark:text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">
                                                                            Behavior & Adaptation:
                                                                        </span>
                                                                        <p className="bg-white/90 dark:bg-[#0E131F] p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 font-medium">
                                                                            {meta.behavior}
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {/* Vaccination / Vet Update */}
                                                                {meta.vaccinationStatus && meta.vaccinationStatus !== 'Up to Date' && (
                                                                    <div className="text-xs text-teal-900 dark:text-teal-200 bg-teal-50/70 dark:bg-teal-950/30 p-2.5 rounded-xl border border-teal-200/70 dark:border-teal-800/60 flex items-center gap-2">
                                                                        <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                                                                        <div>
                                                                            <span className="font-bold text-[10px] uppercase block tracking-wider text-teal-800 dark:text-teal-300">Vaccination / Vet Update:</span>
                                                                            <span>{meta.vaccinationStatus}</span>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Remarks / Additional Notes */}
                                                                {meta.remarks && (
                                                                    <div className="text-xs text-slate-700 dark:text-slate-300 py-1">
                                                                        <span className="font-bold text-slate-500 dark:text-slate-400 block text-[11px] uppercase tracking-wider mb-0.5">
                                                                            Observations / Notes:
                                                                        </span>
                                                                        <p className="whitespace-pre-wrap bg-white/90 dark:bg-[#0E131F] p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 italic">
                                                                            "{meta.remarks}"
                                                                        </p>
                                                                    </div>
                                                                )}

                                                                {/* Attached Photos */}
                                                                {meta.photos && Array.isArray(meta.photos) && meta.photos.length > 0 && (
                                                                    <div className="pt-2">
                                                                        <span className="font-bold text-slate-500 dark:text-slate-400 block text-[11px] uppercase tracking-wider mb-1.5">
                                                                            Attached Welfare Photos ({meta.photos.length}):
                                                                        </span>
                                                                        <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
                                                                            {meta.photos.map((photoUrl: string, idx: number) => (
                                                                                <a
                                                                                    key={idx}
                                                                                    href={photoUrl}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="relative group shrink-0"
                                                                                >
                                                                                    <img
                                                                                        src={photoUrl}
                                                                                        alt={`Welfare check photo ${idx + 1}`}
                                                                                        className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl border-2 border-white dark:border-slate-800 shadow-xs group-hover:scale-105 transition-transform"
                                                                                    />
                                                                                </a>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── SECTION 2: ADD MONITORING RECORD FORM (RESIDENT POV) ── */}
                                    {residentMonitoringTab === 'add' && (
                                        <form onSubmit={handleSubmitResidentMonitoring} className="space-y-4 pt-1 animate-in fade-in">
                                            <div className="p-4 bg-orange-50/60 dark:bg-orange-950/20 rounded-2xl border border-orange-200/80 dark:border-orange-800/50 flex items-center gap-3">
                                                <Sparkles className="w-5 h-5 text-orange-600 shrink-0" />
                                                <p className="text-xs text-orange-900 dark:text-orange-200 font-medium">
                                                    Submit a health and welfare update for <strong>{activeApp.animal_name || 'your adopted pet'}</strong>. Your records are saved to the official adoption dossier and shared with Barangay Animal Welfare Services.
                                                </p>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {/* 1. Monitoring Date */}
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                        1. Monitoring Date <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="date"
                                                        required
                                                        value={residentMonitoringDate}
                                                        onChange={(e) => setResidentMonitoringDate(e.target.value)}
                                                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                    />
                                                    <span className="text-[11px] text-slate-400 mt-1 block">Defaults to current date, select date of check-in.</span>
                                                </div>

                                                {/* 2. Pet Condition */}
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                        2. Pet Condition <span className="text-red-500">*</span>
                                                    </label>
                                                    <select
                                                        value={residentPetCondition}
                                                        onChange={(e) => setResidentPetCondition(e.target.value)}
                                                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
                                                    >
                                                        <option value="Healthy">Healthy</option>
                                                        <option value="Minor Concern">Minor Concern</option>
                                                        <option value="Needs Veterinary Attention">Needs Veterinary Attention</option>
                                                        <option value="Serious Concern">Serious Concern</option>
                                                    </select>
                                                    <span className="text-[11px] text-slate-400 mt-1 block">Overall physical appearance and energy level.</span>
                                                </div>

                                                {/* 3. Current Health Status */}
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                        3. Current Health Status
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={residentHealthStatus}
                                                        onChange={(e) => setResidentHealthStatus(e.target.value)}
                                                        placeholder="e.g. Energetic, clear eyes, shiny coat, healing well"
                                                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                    />
                                                </div>

                                                {/* 5. Food / Appetite */}
                                                <div>
                                                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                        4. Food / Appetite <span className="text-red-500">*</span>
                                                    </label>
                                                    <select
                                                        value={residentFoodAppetite}
                                                        onChange={(e) => setResidentFoodAppetite(e.target.value)}
                                                        className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
                                                    >
                                                        <option value="Normal">Normal</option>
                                                        <option value="Reduced">Reduced</option>
                                                        <option value="Increased">Increased</option>
                                                        <option value="Other">Other</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* 4. Behavior / Adjustment */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                    5. Behavior / Adjustment
                                                </label>
                                                <input
                                                    type="text"
                                                    value={residentBehavior}
                                                    onChange={(e) => setResidentBehavior(e.target.value)}
                                                    placeholder="e.g. Active, friendly with kids, sleeping comfortably, adjusting well to home routine"
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                />
                                                <span className="text-[11px] text-slate-400 mt-1 block">Describe how your pet interacts with household members and other animals.</span>
                                            </div>

                                            {/* 6. Vaccination / Veterinary Update */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                    6. Vaccination / Veterinary Update (Optional)
                                                </label>
                                                <input
                                                    type="text"
                                                    value={residentVetUpdate}
                                                    onChange={(e) => setResidentVetUpdate(e.target.value)}
                                                    placeholder="e.g. Received 5-in-1 booster on Oct 1, deworming administered, or regular vet checkup"
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                                                />
                                            </div>

                                            {/* 7. Photo Upload (Native file upload / camera / gallery) */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                    7. Photo Upload (Camera or Gallery)
                                                </label>
                                                <div className="space-y-3">
                                                    <label className="flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-orange-500 dark:hover:border-orange-500 rounded-2xl bg-slate-50/70 dark:bg-[#0E131F] cursor-pointer transition-colors group">
                                                        <UploadCloud className="w-7 h-7 text-slate-400 group-hover:text-orange-500 transition-colors mb-1.5" />
                                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 group-hover:text-orange-600 dark:group-hover:text-orange-400">
                                                            Click to select photo from Camera or Gallery
                                                        </span>
                                                        <span className="text-[11px] text-slate-400 mt-0.5">Supports PNG, JPG, JPEG, WEBP</span>
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            multiple
                                                            onChange={handlePhotoFilesChange}
                                                            className="hidden"
                                                        />
                                                    </label>

                                                    {/* Photo Previews */}
                                                    {residentPhotoPreviews.length > 0 && (
                                                        <div className="space-y-1.5">
                                                            <span className="text-[11px] font-bold text-slate-500">Selected Photos ({residentPhotoPreviews.length}):</span>
                                                            <div className="flex items-center gap-3 overflow-x-auto pb-1">
                                                                {residentPhotoPreviews.map((url, idx) => (
                                                                    <div key={idx} className="relative group shrink-0">
                                                                        <img
                                                                            src={url}
                                                                            alt="Preview"
                                                                            className="w-18 h-18 sm:w-20 sm:h-20 object-cover rounded-xl border-2 border-orange-200 dark:border-orange-900/60 shadow-xs"
                                                                        />
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleRemoveResidentPhoto(idx)}
                                                                            className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center shadow-md cursor-pointer transition-transform hover:scale-110"
                                                                            title="Remove photo"
                                                                        >
                                                                            <X className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* 8. Additional Notes */}
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                                                    8. Additional Notes & Observations
                                                </label>
                                                <textarea
                                                    rows={3}
                                                    value={residentNotes}
                                                    onChange={(e) => setResidentNotes(e.target.value)}
                                                    placeholder="Any additional observations about sleeping habits, favorite toys, interaction with visitors, or general well-being..."
                                                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0E131F] border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                                                />
                                            </div>

                                            {/* 9 & 10. Actions */}
                                            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setResidentMonitoringTab('history');
                                                        setResidentMonitoringError(null);
                                                    }}
                                                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    type="submit"
                                                    disabled={residentSubmittingMonitoring}
                                                    className="px-5 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 active:scale-95"
                                                >
                                                    {residentSubmittingMonitoring ? (
                                                        <>
                                                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                            <span>Submitting Record...</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <CheckCircle2 className="w-4 h-4" />
                                                            <span>Submit Monitoring Record</span>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </form>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* STAGE 10: SUCCESSFUL ADOPTION (FINAL) */}
                        {(activeApp.current_stage === 'Successful_Adoption' || activeApp.current_stage === 'Completed' || activeApp.current_stage === 'Successful' || activeApp.post_monitoring_status === 'Completed' || activeApp.application_stage_status === 'Case_Closed') && (
                            <div className="space-y-4">
                                <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-md shadow-emerald-600/20 space-y-3">
                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2.5 bg-white/20 backdrop-blur-md rounded-2xl text-white">
                                                <CheckCircle2 className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <div className="text-[10px] font-black uppercase tracking-wider text-emerald-200">
                                                    Stage 10 of 10 • Final Stage
                                                </div>
                                                <h4 className="font-black text-base sm:text-lg text-white">
                                                    ADOPTION SUCCESSFUL
                                                </h4>
                                                <p className="text-xs text-emerald-50">
                                                    ✓ Your adoption has successfully completed all required procedures.
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                            <Link
                                                to="/resident/pets"
                                                className="px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5"
                                            >
                                                <Heart className="w-3.5 h-3.5 fill-emerald-800" /> My Registered Pets
                                            </Link>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-5 rounded-3xl bg-white dark:bg-[#151C2C] border border-emerald-200 dark:border-emerald-800/80 space-y-3.5 shadow-xs">
                                    <div className="flex items-center justify-between pb-2 border-b border-emerald-100 dark:border-emerald-900/60">
                                        <span className="font-black text-xs uppercase tracking-wider text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                                            <Award className="w-4 h-4 text-emerald-600" /> Official Adoption Record Summary
                                        </span>
                                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                            Case Status: CLOSED
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                        <div className="p-3 bg-slate-50 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800">
                                            <span className="text-slate-400 block text-[10px] font-bold uppercase">Animal:</span>
                                            <strong className="text-slate-900 dark:text-white font-extrabold text-sm block">{activeApp.animal_name || 'Rescue Pet'}</strong>
                                            <span className="text-slate-500 text-[11px]">{activeApp.animal_type || 'Dog'} • {activeApp.animal_breed || 'Mixed'}</span>
                                        </div>
                                        <div className="p-3 bg-slate-50 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800">
                                            <span className="text-slate-400 block text-[10px] font-bold uppercase">Adopter:</span>
                                            <strong className="text-slate-900 dark:text-white font-extrabold text-sm block">{activeApp.full_name}</strong>
                                            <span className="text-slate-500 text-[11px]">{activeApp.contact_no}</span>
                                        </div>
                                        <div className="p-3 bg-slate-50 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800">
                                            <span className="text-slate-400 block text-[10px] font-bold uppercase">Certificate:</span>
                                            <strong className="text-slate-900 dark:text-white font-extrabold text-xs block truncate">
                                                {activeApp.certificate_number || `SS-ADOPT-${new Date().getFullYear()}-${String(activeApp.adoption_id).padStart(5, '0')}`}
                                            </strong>
                                            <span className="text-teal-700 dark:text-teal-400 font-bold text-[11px]">Issued & Registered</span>
                                        </div>
                                        <div className="p-3 bg-slate-50 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800">
                                            <span className="text-slate-400 block text-[10px] font-bold uppercase">Adoption Status:</span>
                                            <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold text-sm block">SUCCESSFUL</strong>
                                            <span className="text-emerald-600 font-semibold text-[11px]">All stages verified</span>
                                        </div>
                                        <div className="p-3 bg-slate-50 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800">
                                            <span className="text-slate-400 block text-[10px] font-bold uppercase">Case Status:</span>
                                            <strong className="text-slate-900 dark:text-white font-extrabold text-sm block">CLOSED</strong>
                                            <span className="text-slate-500 text-[11px]">Permanent Record</span>
                                        </div>
                                        <div className="p-3 bg-slate-50 dark:bg-[#0E131F] rounded-xl border border-slate-100 dark:border-slate-800">
                                            <span className="text-slate-400 block text-[10px] font-bold uppercase">Monitoring:</span>
                                            <strong className="text-emerald-700 dark:text-emerald-400 font-extrabold text-sm block">COMPLETED</strong>
                                            <span className="text-emerald-600 font-semibold text-[11px]">Welfare requirements met</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedCertificateAdoptionId(activeApp.adoption_id)}
                                                className="px-4 py-2 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <Award className="w-3.5 h-3.5 text-amber-400" />
                                                <span>View Digital Certificate</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedMonitoringApp(activeApp)}
                                                className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <Activity className="w-3.5 h-3.5" />
                                                <span>View Completed Monitoring Log</span>
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDossierAppId(activeApp.adoption_id)}
                                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <FileText className="w-3.5 h-3.5" />
                                            <span>Full Case Dossier & Audit Logs</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Cancelled State */}
                        {activeApp.status === 'Cancelled' && (
                            <div className="p-5 rounded-3xl bg-gray-50 dark:bg-[#0E131F] border border-gray-200 dark:border-gray-800 space-y-2">
                                <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-bold text-gray-700 dark:text-gray-300">
                                    <span className="flex items-center gap-1.5 text-gray-800 dark:text-gray-200">
                                        <XCircle className="w-4 h-4 text-gray-500" />
                                        Adoption Request Cancelled
                                    </span>
                                    {activeApp.cancelled_at && (
                                        <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                                            Cancelled on {new Date(activeApp.cancelled_at).toLocaleDateString('en-PH', {
                                                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                            })}
                                        </span>
                                    )}
                                </div>
                                {activeApp.cancellation_reason && (
                                    <div className="text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-[#151C2C] p-3 rounded-xl border border-gray-100 dark:border-gray-800">
                                        <span className="font-bold text-gray-700 dark:text-gray-300 block mb-0.5">Cancellation Reason:</span>
                                        "{activeApp.cancellation_reason}"
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Rejected State */}
                        {activeApp.status === 'Rejected' && (
                            <div className="p-5 rounded-3xl bg-red-50/90 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 space-y-2.5">
                                <div className="flex items-center justify-between flex-wrap gap-2 text-xs font-bold text-red-900 dark:text-red-200">
                                    <span className="flex items-center gap-1.5">
                                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                                        Application Not Approved
                                    </span>
                                    {activeApp.reviewed_at && (
                                        <span className="text-[11px] font-normal text-red-700/80 dark:text-red-400/80">
                                            Reviewed on {new Date(activeApp.reviewed_at).toLocaleDateString('en-PH', {
                                                year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                            })}
                                        </span>
                                    )}
                                </div>

                                {activeApp.review_notes && (
                                    <div className="text-xs text-red-950 dark:text-red-200 bg-white/90 dark:bg-[#151C2C] p-3 rounded-xl border border-red-200/80 dark:border-red-900/50 space-y-1">
                                        <span className="font-bold text-red-800 dark:text-red-400 block text-[11px] uppercase tracking-wider">
                                            Reason for Decision:
                                        </span>
                                        <p className="leading-relaxed whitespace-pre-wrap font-medium">"{activeApp.review_notes}"</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    /* ─────────────────────────────────────────────────────────────
                        2. ALL APPLICATIONS COMPACT LIST VIEW (DEFAULT)
                       ───────────────────────────────────────────────────────────── */
                    <div className="space-y-6">
                        {/* Page Title */}
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white uppercase tracking-tight flex items-center gap-2.5">
                                <ClipboardList className="w-7 h-7 text-[#F97316]" />
                                <span>Adoption Requests & Applications</span>
                            </h1>
                            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mt-1">
                                Track and manage your submitted adoption requests with Barangay Animal Welfare Services
                            </p>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center gap-2 border-b border-gray-200/80 dark:border-gray-800 pb-3 overflow-x-auto scrollbar-none">
                            {(['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setStatusFilter(tab)}
                                    className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer shrink-0 ${statusFilter === tab
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
                                    <div key={i} className="bg-white dark:bg-[#151C2C] rounded-2xl p-6 border border-gray-200 dark:border-gray-800 animate-pulse h-32" />
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
                            <div className="grid grid-cols-1 gap-4">
                                {filtered.map((app) => {
                                    const info = getUnifiedAdoptionStatus(app);
                                    const isFullyAdopted = info.isOfficiallyAdopted;
                                    const impDate = getImportantDateInfo(app);

                                    return (
                                        <div
                                            key={app.adoption_id}
                                            className={`bg-white dark:bg-[#151C2C] rounded-3xl border p-5 sm:p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-4 ${isFullyAdopted
                                                ? 'border-emerald-200 dark:border-emerald-800/80 bg-linear-to-b from-white to-emerald-50/20 dark:from-[#151C2C] dark:to-emerald-950/20'
                                                : info.isAwaitingHandover
                                                    ? 'border-orange-200 dark:border-orange-900/60'
                                                    : app.status === 'Cancelled'
                                                        ? 'border-gray-200 dark:border-gray-800 opacity-90'
                                                        : 'border-gray-200/90 dark:border-gray-800 hover:border-orange-200 dark:hover:border-orange-500/40'
                                                }`}
                                        >
                                            {/* Top: Animal Info & Status */}
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <img
                                                        src={getPetPicture(app.animal_photo)}
                                                        alt={app.animal_name || 'Pet'}
                                                        className="w-16 h-16 sm:w-18 sm:h-18 rounded-2xl object-cover border border-gray-100 dark:border-gray-800 shrink-0 shadow-2xs"
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-1">
                                                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2.5 py-0.5 rounded-full">
                                                                Application #{app.adoption_id}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50 border border-orange-200 dark:border-orange-800/60 px-2.5 py-0.5 rounded-full">
                                                                {getStageBadgeLabel(app)}
                                                            </span>
                                                        </div>
                                                        <h3 className="font-black text-lg text-gray-900 dark:text-white tracking-tight truncate">
                                                            {app.animal_name || `Rescue Animal #${app.holding_id}`}
                                                        </h3>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-0.5">
                                                            {app.animal_type || 'Rescue'} • {app.animal_breed || 'Mixed Breed'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-wrap sm:self-start">
                                                    {getStatusBadge(app)}
                                                </div>
                                            </div>

                                            {/* Middle: Key Dates */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs">
                                                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                                    <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
                                                    <span>
                                                        <strong className="font-semibold text-gray-500 dark:text-gray-400">Submitted:</strong>{' '}
                                                        {new Date(app.created_at).toLocaleDateString('en-PH', {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            year: 'numeric',
                                                        })}
                                                    </span>
                                                </div>

                                                {impDate.label !== 'Submitted' && (
                                                    <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200 font-bold">
                                                        <Clock className="w-4 h-4 text-orange-500 shrink-0" />
                                                        <span>
                                                            <span className="text-orange-600 dark:text-orange-400">{impDate.label}:</span> {impDate.date}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Bottom: Action Buttons */}
                                            <div className="pt-2 flex items-center justify-between gap-3">
                                                {info.canCancel ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedCancelApp(app);
                                                            setCancelReason('');
                                                            setCancelError(null);
                                                        }}
                                                        className="px-3.5 py-2 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" />
                                                        <span>Cancel</span>
                                                    </button>
                                                ) : <div />}

                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedAppDetails(app);
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }}
                                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 active:scale-95 text-white text-xs font-black rounded-xl shadow-xs transition-all cursor-pointer"
                                                >
                                                    <span>View Details</span>
                                                    <ArrowRight className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Cancel Adoption Request Confirmation Modal */}
            {selectedCancelApp && (
                <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in-95 relative z-[121]">
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
                <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-gray-100 dark:border-gray-800 animate-in fade-in zoom-in-95 relative z-[121]">
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
                <div className="fixed inset-0 z-[140] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 dark:border-gray-800 relative z-[141]">
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

            {/* Complete Applicant & Adopter Details Modal */}
            {showApplicantDetailsModal && activeApp && (
                <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in-95 max-h-[85vh] flex flex-col relative z-[121]">
                        {/* Header */}
                        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center shrink-0">
                                    <User className="w-5 h-5" />
                                </div>
                                <div>
                                    <h2 className="text-base sm:text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                        Applicant & Adopter Profile
                                    </h2>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                        Application #{activeApp.adoption_id} • Complete Adopter APPLICATION Record
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowApplicantDetailsModal(false)}
                                className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body (Scrollable) */}
                        <div className="overflow-y-auto space-y-6 py-4 pr-1 scrollbar-thin">
                            {/* 1. APPLICANT INFORMATION */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                    <User className="w-4 h-4 text-orange-500" /> 1. Applicant Information
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-3.5 border border-slate-100 dark:border-gray-800 space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-gray-400 uppercase tracking-wider block">
                                            Full Legal Name
                                        </span>
                                        <p className="text-sm font-black text-slate-900 dark:text-white">{activeApp.full_name}</p>
                                    </div>

                                    <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-3.5 border border-slate-100 dark:border-gray-800 space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <Phone className="w-3 h-3 text-orange-500" /> Contact Number
                                        </span>
                                        <p className="text-sm font-black text-slate-900 dark:text-white">{activeApp.contact_no}</p>
                                    </div>

                                    <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-3.5 border border-slate-100 dark:border-gray-800 space-y-1 sm:col-span-2">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1.5">
                                            <MapPin className="w-3 h-3 text-orange-500" /> Complete Residential Address
                                        </span>
                                        <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                                            {activeApp.address || 'Santa Maria, Bulacan'}
                                        </p>
                                    </div>

                                    <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-3.5 border border-slate-100 dark:border-gray-800 space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-gray-400 uppercase tracking-wider block">
                                            Living Space
                                        </span>
                                        <p className="text-sm font-black text-slate-900 dark:text-white">{activeApp.living_space}</p>
                                    </div>

                                    <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-3.5 border border-slate-100 dark:border-gray-800 space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 dark:text-gray-400 uppercase tracking-wider block">
                                            Other Pets in Home
                                        </span>
                                        <p className="text-sm font-black text-slate-900 dark:text-white">
                                            {activeApp.has_other_pets ? 'Yes — Currently owns other pets' : 'No other pets'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 2. GOVERNMENT ID VERIFICATION */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                    <CreditCard className="w-4 h-4 text-orange-500" /> 2. Government ID Verification
                                </h3>
                                <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-4 border border-slate-100 dark:border-gray-800 space-y-3 text-xs">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-gray-400 uppercase tracking-wider block">
                                                ID Type
                                            </span>
                                            <span className="font-bold text-slate-800 dark:text-slate-200 text-sm">
                                                {activeApp.id_type || 'Philippine Government Valid ID'}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-gray-400 uppercase tracking-wider block">
                                                Verification Status
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs mt-0.5">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> ID Verified by Barangay
                                            </span>
                                        </div>
                                    </div>

                                    {activeApp.id_number && (
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-gray-400 uppercase tracking-wider block mb-1">
                                                ID Number (Masked)
                                            </span>
                                            <MaskedIdDisplay idNumber={activeApp.id_number} idType={activeApp.id_type} />
                                        </div>
                                    )}

                                    {(activeApp.has_id_uploaded || activeApp.id_photo_url) && (
                                        <div className="pt-2 border-t border-slate-200/80 dark:border-gray-800 flex items-center justify-between flex-wrap gap-2">
                                            <span className="text-slate-500 text-[11px]">Secure ID Document Attached</span>
                                            <button
                                                type="button"
                                                disabled={loadingIdAdoptionId === activeApp.adoption_id}
                                                onClick={() => handleViewSecureId(activeApp.adoption_id)}
                                                className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95 disabled:opacity-50"
                                            >
                                                <Eye className="w-3.5 h-3.5" />
                                                <span>{loadingIdAdoptionId === activeApp.adoption_id ? 'Loading Secure ID...' : 'View Uploaded ID Photo'}</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 3. APPLICANT'S STATED MOTIVATION & REASON */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-orange-500" /> 3. Applicant's Stated Motivation & Reason
                                </h3>
                                <div className="bg-amber-50/60 dark:bg-amber-950/20 p-4 rounded-2xl border border-amber-200/70 dark:border-amber-800/50 space-y-1 text-xs">
                                    <p className="text-slate-700 dark:text-slate-300 font-medium leading-relaxed italic whitespace-pre-wrap">
                                        {activeApp.reason ? `"${activeApp.reason}"` : 'No additional statement provided.'}
                                    </p>
                                </div>
                            </div>

                            {/* 4. APPLICATION INFORMATION */}
                            <div className="space-y-3">
                                <h3 className="text-xs font-black text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
                                    <ClipboardList className="w-4 h-4 text-orange-500" /> 4. Application Information
                                </h3>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                    <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-3 border border-slate-100 dark:border-gray-800">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Application #</span>
                                        <strong className="text-slate-900 dark:text-white font-extrabold text-sm">#{activeApp.adoption_id}</strong>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-3 border border-slate-100 dark:border-gray-800">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Date Submitted</span>
                                        <strong className="text-slate-900 dark:text-white font-extrabold text-xs block truncate">
                                            {new Date(activeApp.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                                        </strong>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-3 border border-slate-100 dark:border-gray-800">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Adoption Status</span>
                                        <div className="mt-0.5">{getStatusBadge(activeApp)}</div>
                                    </div>
                                    <div className="bg-slate-50 dark:bg-[#0E131F] rounded-2xl p-3 border border-slate-100 dark:border-gray-800">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase block">Current Stage</span>
                                        <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 block truncate">
                                            {getStageBadgeLabel(activeApp)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end">
                            <button
                                type="button"
                                onClick={() => setShowApplicantDetailsModal(false)}
                                className="px-5 py-2.5 bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-black text-xs rounded-xl transition-all cursor-pointer"
                            >
                                Close Details
                            </button>
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
                    applicationData={applications.find(a => a.adoption_id === selectedCertificateAdoptionId)}
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

            {/* Official 10-Stage Adoption Dossier & Audit Log Modal */}
            {selectedDossierAppId && (
                <AdoptionDossierModal
                    adoptionId={selectedDossierAppId}
                    isOpen={Boolean(selectedDossierAppId)}
                    onClose={() => setSelectedDossierAppId(null)}
                />
            )}

            <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} />
        </div>
    );
};

export default MyAdoptionApplications;
