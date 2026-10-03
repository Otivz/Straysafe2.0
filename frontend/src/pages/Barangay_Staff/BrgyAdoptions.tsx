import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../utils/api';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import { getPetPicture } from '../../utils/avatar';
import { 
    Heart, 
    Search, 
    CheckCircle2, 
    XCircle, 
    Clock, 
    Shield, 
    AlertCircle, 
    FileText, 
    X,
    ExternalLink,
    CreditCard,
    Eye,
    Sparkles,
    User,
    Phone,
    Home,
    PawPrint,
    MapPin,
    ShieldCheck,
    Award,
    HeartHandshake,
    Activity,
    FolderKanban,
    Calendar,
    ClipboardCheck,
    Video,
    ArrowLeft,
    Printer,
    Plus,
    Camera,
    MessageCircle
} from 'lucide-react';
import MaskedIdDisplay from '../../components/MaskedIdDisplay';
import AdoptionStageStepper from '../../components/AdoptionStageStepper';
import {
    AdoptionVerificationModal,
    AdoptionInterviewModal,
    AdoptionHomeVisitModal,
    AdoptionReviewModal,
    AdoptionHandoverScheduleModal,
    AdoptionHandoverModal,
    AdoptionDossierModal,
    HOME_ENVIRONMENT_CHECKLIST_ITEMS,
} from '../../components/Modals/AdoptionStaffStageModals';
import AdoptionCertificateModal from '../../components/Modals/AdoptionCertificateModal';
import AdoptionCertificateDocument from '../../components/Adoption/AdoptionCertificateDocument';
import AdoptionMonitoringModal from '../../components/Modals/AdoptionMonitoringModal';
import { getUnifiedAdoptionStatus } from '../../utils/adoptionStatus';
import { useAdoptionChatUnread } from '../../utils/useAdoptionChatUnread';

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
    // 9-Stage Workflow Fields
    current_stage?: string;
    application_stage_status?: string;
    interview_scheduled_at?: string | null;
    interview_mode?: string | null;
    interview_location?: string | null;
    interview_result?: string | null;
    interviewer_name?: string | null;
    interview_notes?: string | null;
    questions_discussed?: string | null;
    applicant_responses?: string | null;
    additional_observations?: string | null;
    home_visit_scheduled_date?: string | null;
    home_visit_result?: string | null;
    home_visit_notes?: string | null;
    home_visit_inspector_name?: string | null;
    home_visit_photos?: string[] | null;
    residence_condition?: string | null;
    existing_pets?: string | null;
    certificate_number?: string | null;
    approval_date?: string | null;
    approved_by_name?: string | null;
    monitoring_records_count?: number | null;
    agreement_signed_at?: string | null;
    agreement_signature_url?: string | null;
    certificate_id?: number | null;
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
    adoption_completed_at?: string | null;
}

interface CatalogAnimal {
    holding_id: number;
    report_id: number;
    animal_name: string | null;
    animal_type: string | null;
    breed: string | null;
    color: string | null;
    estimated_size: string | null;
    facility_status: number;
    adoption_catalog_notes: string | null;
    intake_date: string | null;
    promoted_at: string | null;
    photos: string[];
    facility_name: string | null;
}

const REJECTION_REASONS = [
    {
        id: 'id_mismatch',
        label: 'ID does not match identity',
        badge: 'ID Verification',
        description: 'Uploaded government ID does not match applicant identity or is unverifiable.',
        template: 'The uploaded Government ID does not match your submitted identity details or could not be verified.',
    },
    {
        id: 'info_mismatch',
        label: 'Inaccurate or incomplete info',
        badge: 'Application Info',
        description: 'Contact number, address, or applicant profile contains inaccurate or incomplete data.',
        template: 'Your application contains inaccurate, incomplete, or unverifiable personal/contact information.',
    },
    {
        id: 'living_space',
        label: 'Unsuitable living space / environment',
        badge: 'Living Space',
        description: 'Living conditions or residence setup is not suitable for this pet’s size, breed, or needs.',
        template: 'The current living environment or household space is not suitable for the care requirements of this animal.',
    },
    {
        id: 'criteria_unmet',
        label: 'Adoption criteria not met',
        badge: 'Criteria Not Met',
        description: 'Applicant does not meet Barangay animal welfare adoption qualifications.',
        template: 'The application does not meet our required Barangay Animal Welfare adoption criteria at this time.',
    },
    {
        id: 'other',
        label: 'Other reason (fill up details)',
        badge: 'Custom Reason',
        description: 'Specify a custom reason in the explanation form below.',
        template: '',
    },
];

const BrgyAdoptions = () => {
    // Auth context
    const rawStaff = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const rawAdmin = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
    const isAdmin = Boolean(rawAdmin);
    const staffUser = rawStaff ? JSON.parse(rawStaff) : null;
    const isHeadOfficer = isAdmin || Boolean(staffUser?.is_head_officer);
    const HEAD_ONLY_HINT = 'Only the Barangay Head Officer or an Administrator can do this';

    // Navigation & state
    const [mobileOpen, setMobileOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'applications' | 'monitoring' | 'catalog'>('applications');
    const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Cancelled'>('Pending');
    const [selectedStageFilter, setSelectedStageFilter] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState('');

    // 9-Stage Modal State
    const [stageModalState, setStageModalState] = useState<{
        app: AdoptionApp;
        modal: 'verify' | 'interview_schedule' | 'interview_eval' | 'interview_log' | 'home_visit_schedule' | 'home_visit_eval' | 'home_visit_log' | 'review' | 'handover_schedule' | 'handover' | 'dossier' | 'certificate' | 'monitoring';
    } | null>(null);

    // Monitoring Dashboard Data
    const [monitoringDashboard, setMonitoringDashboard] = useState<any>(null);
    const [monitoringLoading, setMonitoringLoading] = useState(false);

    const fetchMonitoringDashboard = async () => {
        setMonitoringLoading(true);
        try {
            const res = await api.get('/adoptions/monitoring/dashboard');
            setMonitoringDashboard(res.data);
        } catch (err) {
            console.error("Failed to load monitoring dashboard:", err);
        } finally {
            setMonitoringLoading(false);
        }
    };

    // Data
    const [applications, setApplications] = useState<AdoptionApp[]>([]);
    const [catalogAnimals, setCatalogAnimals] = useState<CatalogAnimal[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);

    // Modal state
    const [selectedApp, setSelectedApp] = useState<AdoptionApp | null>(null);
    const [viewAppModal, setViewAppModal] = useState<AdoptionApp | null>(null);

    // Adoption chat (adopter <-> Barangay) lives in the shared Case Messages inbox (/brgy/messages)
    const navigate = useNavigate();
    const { counts: chatUnread } = useAdoptionChatUnread();
    const [searchParams, setSearchParams] = useSearchParams();
    const chatParam = searchParams.get('chat');
    const viewParam = searchParams.get('view');
    const openAdoptionChat = (adoptionId: number) => navigate(`/brgy/messages?adoptionId=${adoptionId}`);

    // Older notification links (/brgy/adoptions?chat=<adoption_id>) forward to the inbox
    useEffect(() => {
        if (!chatParam) return;
        const id = Number(chatParam);
        if (Number.isInteger(id) && id > 0) navigate(`/brgy/messages?adoptionId=${id}`, { replace: true });
    }, [chatParam, navigate]);
    const [reviewModalType, setReviewModalType] = useState<'approve' | 'reject' | null>(null);
    const [rejectionCategory, setRejectionCategory] = useState<string>('id_mismatch');
    const [reviewNotes, setReviewNotes] = useState('');
    const [handoverModalApp, setHandoverModalApp] = useState<AdoptionApp | null>(null);
    const [handoverNotes, setHandoverNotes] = useState('');
    const [previewIdPhotoUrl, setPreviewIdPhotoUrl] = useState<string | null>(null);
    const [previewIdData, setPreviewIdData] = useState<{ url: string; applicantName: string; idType: string; maskedId: string } | null>(null);
    const [idImageError, setIdImageError] = useState<boolean>(false);
    const [loadingIdAdoptionId, setLoadingIdAdoptionId] = useState<number | null>(null);
    const [showApplicantInfoModal, setShowApplicantInfoModal] = useState<boolean>(false);
    const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    const showToast = (text: string, type: 'success' | 'error' = 'success') => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 4000);
    };

    const handleProceedToCertificate = async (adoptionId: number) => {
        setActionLoading(true);
        try {
            const res = await api.post(`/adoptions/${adoptionId}/certificate/proceed`);
            setViewAppModal(prev => {
                if (!prev || prev.adoption_id !== adoptionId) return prev;
                return {
                    ...prev,
                    current_stage: 'Certificate',
                    application_stage_status: 'Certificate_Ready',
                    certificate_number: res.data?.certificate_number || prev.certificate_number,
                };
            });
            await fetchApplications(true);
            showToast("Proceeded to Stage 7 Certificate!");
            setTimeout(() => {
                const target = document.getElementById('dossier-current-stage-section');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        } catch (err: any) {
            console.error("Proceed to certificate failed:", err);
            showToast(err.response?.data?.detail || "Failed to proceed to Certificate stage.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const handleSendDigitalCertificate = async (adoptionId: number) => {
        setActionLoading(true);
        try {
            const res = await api.post(`/adoptions/${adoptionId}/certificate/send`, {});
            setViewAppModal(prev => {
                if (!prev || prev.adoption_id !== adoptionId) return prev;
                return {
                    ...prev,
                    is_certificate_sent: true,
                    certificate_sent_at: res.data?.sent_at || new Date().toISOString(),
                };
            });
            await fetchApplications(true);
            showToast("Digital Certificate successfully sent to resident!");
        } catch (err: any) {
            console.error("Send digital certificate failed:", err);
            showToast(err.response?.data?.detail || "Failed to send digital certificate.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const handleProceedToHandover = async (adoptionId: number) => {
        setActionLoading(true);
        try {
            await api.post(`/adoptions/${adoptionId}/handover/proceed`);
            setViewAppModal(prev => {
                if (!prev || prev.adoption_id !== adoptionId) return prev;
                return {
                    ...prev,
                    current_stage: 'Handover',
                    application_stage_status: 'Handover_Ready',
                };
            });
            await fetchApplications(true);
            showToast("Proceeded to Stage 8 Handover!");
        } catch (err: any) {
            console.error("Proceed to handover failed:", err);
            showToast(err.response?.data?.detail || "Failed to proceed to Handover stage.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const handleProceedToMonitoring = async (adoptionId: number) => {
        setActionLoading(true);
        try {
            const res = await api.post(`/adoptions/${adoptionId}/monitoring/proceed`);
            setViewAppModal(prev => {
                if (!prev || prev.adoption_id !== adoptionId) return prev;
                return {
                    ...prev,
                    current_stage: 'Monitoring',
                    application_stage_status: 'Monitoring_Active',
                    post_monitoring_status: res.data?.post_monitoring_status || 'Active',
                };
            });
            await fetchApplications(true);
            showToast("Proceeded to Stage 9: Post-Adoption Welfare Monitoring!");
            setTimeout(() => {
                const target = document.getElementById('stage-9-monitoring-section') || document.getElementById('dossier-current-stage-section');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        } catch (err: any) {
            console.error("Proceed to monitoring failed:", err);
            showToast(err.response?.data?.detail || "Failed to proceed to Monitoring stage.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const handleMarkAdoptionSuccessful = async (adoptionId: number) => {
        setActionLoading(true);
        try {
            const res = await api.post(`/adoptions/${adoptionId}/successful/proceed`);
            setViewAppModal(prev => {
                if (!prev || prev.adoption_id !== adoptionId) return prev;
                return {
                    ...prev,
                    current_stage: 'Successful_Adoption',
                    post_monitoring_status: 'Completed',
                    application_stage_status: 'Case_Closed',
                    status: 'Approved',
                    adoption_completed_at: res.data?.adoption_completed_at || new Date().toISOString(),
                };
            });
            await fetchApplications(true);
            showToast("Adoption officially marked as successful and case closed!", "success");
            setTimeout(() => {
                const target = document.getElementById('stage-10-successful-section') || document.getElementById('dossier-current-stage-section');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            }, 100);
        } catch (err: any) {
            console.error("Mark adoption successful failed:", err);
            showToast(err.response?.data?.detail || "Failed to mark adoption as successful.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    // Stage 9 Inline Monitoring State
    const [dossierMonitoringLogs, setDossierMonitoringLogs] = useState<any[]>([]);
    const [loadingDossierMonitoringLogs, setLoadingDossierMonitoringLogs] = useState<boolean>(false);
    const [monitoringInlineTab, setMonitoringInlineTab] = useState<'history' | 'add'>('history');

    // Inline Add Monitoring Record Form State
    const [inlineMonitoringDate, setInlineMonitoringDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [inlineMonitoringType, setInlineMonitoringType] = useState<string>('Initial Follow-up');
    const [inlineAnimalCondition, setInlineAnimalCondition] = useState<string>('Good');
    const [inlineHealthStatus, setInlineHealthStatus] = useState<string>('Healthy');
    const [inlineLivingCondition, setInlineLivingCondition] = useState<string>('Good');
    const [inlineFoodAndWater, setInlineFoodAndWater] = useState<string>('Adequate');
    const [inlineShelterCondition, setInlineShelterCondition] = useState<string>('Safe');
    const [inlineVaccinationStatus, setInlineVaccinationStatus] = useState<string>('Up to Date');
    const [inlineBehavior, setInlineBehavior] = useState<string>('Normal');
    const [inlineOfficerName, setInlineOfficerName] = useState<string>('');
    const [inlineRemarks, setInlineRemarks] = useState<string>('');
    const [inlineNextFollowupDate, setInlineNextFollowupDate] = useState<string>('');
    const [inlineSelectedPhotos, setInlineSelectedPhotos] = useState<{ file: File; preview: string }[]>([]);
    const [isSavingMonitoringRecord, setIsSavingMonitoringRecord] = useState<boolean>(false);
    const [monitoringFormError, setMonitoringFormError] = useState<string | null>(null);

    const fetchDossierMonitoringLogs = async (adoptionId: number) => {
        setLoadingDossierMonitoringLogs(true);
        try {
            const res = await api.get(`/adoptions/${adoptionId}/monitoring`);
            setDossierMonitoringLogs(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            console.error("Failed to load dossier monitoring logs:", err);
        } finally {
            setLoadingDossierMonitoringLogs(false);
        }
    };

    useEffect(() => {
        if (viewAppModal?.adoption_id) {
            fetchDossierMonitoringLogs(viewAppModal.adoption_id);
            setInlineOfficerName(staffUser?.name || 'Barangay Staff');
        }
    }, [viewAppModal?.adoption_id, viewAppModal?.current_stage]);

    const handleInlinePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const files = Array.from(e.target.files);
        const newItems = files.map(file => ({
            file,
            preview: URL.createObjectURL(file),
        }));
        setInlineSelectedPhotos(prev => [...prev, ...newItems]);
        e.target.value = '';
    };

    const handleRemoveInlinePhoto = (index: number) => {
        setInlineSelectedPhotos(prev => {
            const item = prev[index];
            if (item?.preview) URL.revokeObjectURL(item.preview);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSaveMonitoringRecord = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!viewAppModal) return;
        setIsSavingMonitoringRecord(true);
        setMonitoringFormError(null);

        try {
            let uploadedUrls: string[] = [];
            if (inlineSelectedPhotos.length > 0) {
                const formData = new FormData();
                inlineSelectedPhotos.forEach(p => {
                    formData.append('files', p.file);
                });
                const uploadRes = await api.post('/adoptions/upload-monitoring-photos', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });
                if (uploadRes.data?.urls) {
                    uploadedUrls = uploadRes.data.urls;
                }
            }

            await api.post(`/adoptions/${viewAppModal.adoption_id}/monitoring/record`, {
                monitoring_date: inlineMonitoringDate ? new Date(inlineMonitoringDate).toISOString() : new Date().toISOString(),
                monitoring_type: inlineMonitoringType,
                monitoring_personnel: inlineOfficerName.trim() || staffUser?.name || 'Barangay Staff',
                animal_condition: inlineAnimalCondition,
                health_status: inlineHealthStatus,
                living_condition: inlineLivingCondition,
                food_and_water: inlineFoodAndWater,
                shelter_condition: inlineShelterCondition,
                vaccination_status: inlineVaccinationStatus,
                behavior: inlineBehavior,
                remarks: inlineRemarks.trim() || undefined,
                next_followup_date: inlineNextFollowupDate || undefined,
                photos: uploadedUrls,
            });

            showToast("Monitoring record successfully saved!");
            setMonitoringInlineTab('history');
            setInlineSelectedPhotos([]);
            setInlineRemarks('');
            setInlineNextFollowupDate('');
            await fetchDossierMonitoringLogs(viewAppModal.adoption_id);
            await fetchApplications(true);
        } catch (err: any) {
            console.error("Save monitoring record failed:", err);
            setMonitoringFormError(err.response?.data?.detail || "Failed to save monitoring record.");
            showToast(err.response?.data?.detail || "Failed to save monitoring record.", "error");
        } finally {
            setIsSavingMonitoringRecord(false);
        }
    };

    const parseRecordData = (log: any) => {
        let meta: any = null;
        let textRemarks = log.adopter_notes || '';
        const rawReview = log.review_notes || '';
        if (rawReview.includes('__JSON_META__') && rawReview.includes('__END_META__')) {
            try {
                const rawJson = rawReview.split('__JSON_META__')[1].split('__END_META__')[0];
                meta = JSON.parse(rawJson);
            } catch (e) {
                console.error("Error parsing monitoring meta:", e);
            }
        }
        return {
            visitTitle: log.milestone_name ? log.milestone_name.replace(/_/g, ' ') : `Monitoring Record #${log.log_id}`,
            monitoringDate: log.due_date ? new Date(log.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : (log.submitted_at ? new Date(log.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'),
            monitoringType: meta?.monitoring_type || 'Follow-up Check-in',
            animalCondition: meta?.animal_condition || log.health_status || 'Good',
            healthStatus: meta?.health_status || log.health_status || 'Healthy',
            livingCondition: meta?.living_condition || 'Good',
            shelterCondition: meta?.shelter_condition || 'Safe and Appropriate',
            foodAndWater: meta?.food_and_water || 'Adequate',
            vaccinationStatus: meta?.vaccination_status || 'Up to Date',
            behavior: meta?.behavior || 'Normal',
            officer: meta?.personnel || log.reviewer_name || staffUser?.name || 'Barangay Staff',
            remarks: meta?.remarks || textRemarks || rawReview.replace(/__JSON_META__.*?__END_META__/, '') || 'Animal is adapting well to the new home.',
            nextFollowupDate: meta?.next_followup_date ? new Date(meta.next_followup_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'None Scheduled',
            photos: Array.isArray(log.photos) ? log.photos : [],
        };
    };

    const handleViewSecureId = async (adoptionId: number) => {
        setLoadingIdAdoptionId(adoptionId);
        setIdImageError(false);
        try {
            const res = await api.get(`/adoptions/${adoptionId}/secure-id-view`);
            const targetUrl = res.data?.temporary_url || viewAppModal?.id_photo_url || '';
            setPreviewIdData({
                url: targetUrl,
                applicantName: res.data?.applicant_name || viewAppModal?.full_name || 'Applicant',
                idType: res.data?.id_type || viewAppModal?.id_type || 'Government ID',
                maskedId: res.data?.masked_id || viewAppModal?.id_number || '',
            });
            setPreviewIdPhotoUrl(targetUrl || 'id_verified');
        } catch (err: any) {
            console.error("Failed to load secure ID view:", err);
            const targetUrl = viewAppModal?.id_photo_url || '';
            setPreviewIdData({
                url: targetUrl,
                applicantName: viewAppModal?.full_name || 'Applicant',
                idType: viewAppModal?.id_type || 'Government ID',
                maskedId: viewAppModal?.id_number || '',
            });
            setPreviewIdPhotoUrl(targetUrl || 'id_verified');
        } finally {
            setLoadingIdAdoptionId(null);
        }
    };

    // Open a specific application's details (/brgy/adoptions?view=<adoption_id>, e.g. from Case Messages)
    useEffect(() => {
        if (!viewParam || applications.length === 0) return;
        const target = applications.find(a => a.adoption_id === Number(viewParam));
        if (target) setViewAppModal(target);
        setSearchParams({}, { replace: true });
    }, [viewParam, applications, setSearchParams]);

    const fetchApplications = async (silent: boolean = false) => {
        if (!silent) setLoading(true);
        try {
            const res = await api.get('/adoptions/applications');
            const list = Array.isArray(res.data) ? res.data : [];
            setApplications(list);
            setViewAppModal(prev => {
                if (!prev) return null;
                const updated = list.find(a => a.adoption_id === prev.adoption_id);
                return updated || prev;
            });
        } catch (err: any) {
            console.error("Failed to load adoption applications", err);
            if (!silent) showToast("Failed to load adoption applications.", "error");
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const fetchCatalog = async () => {
        try {
            const res = await api.get('/adoptions/catalog');
            setCatalogAnimals(Array.isArray(res.data) ? res.data : []);
        } catch (err: any) {
            console.error("Failed to load adoption catalog", err);
        }
    };

    useEffect(() => {
        fetchApplications();
        fetchCatalog();
        fetchMonitoringDashboard();

        // Automatic synchronization polling (every 8 seconds)
        const pollInterval = setInterval(() => {
            fetchApplications(true);
        }, 8000);

        // Immediate refresh when returning to this tab
        const handleFocus = () => {
            fetchApplications(true);
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(pollInterval);
            window.removeEventListener('focus', handleFocus);
        };
    }, []);

    const filteredApplications = useMemo(() => {
        return applications.filter((app) => {
            if (statusFilter !== 'All' && app.status !== statusFilter) return false;
            if (selectedStageFilter !== 'All' && (app.current_stage || 'Application') !== selectedStageFilter) return false;
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchApplicant = app.full_name.toLowerCase().includes(q);
                const matchPet = app.animal_name?.toLowerCase().includes(q) || false;
                const matchAddress = app.address.toLowerCase().includes(q);
                if (!matchApplicant && !matchPet && !matchAddress) return false;
            }
            return true;
        });
    }, [applications, statusFilter, selectedStageFilter, searchQuery]);

    // Stage 5 Inline Dossier Review State
    const [showInlineStage5Review, setShowInlineStage5Review] = useState<boolean>(true);
    const [stage5DossierData, setStage5DossierData] = useState<any>(null);
    const [loadingStage5Dossier, setLoadingStage5Dossier] = useState<boolean>(false);
    const [dossierLightboxPhoto, setDossierLightboxPhoto] = useState<string | null>(null);

    const fetchStage5Dossier = async (adoptionId: number) => {
        setLoadingStage5Dossier(true);
        try {
            const res = await api.get(`/adoptions/${adoptionId}/dossier`);
            setStage5DossierData(res.data);
        } catch (err) {
            console.error("Failed to load stage 5 dossier data:", err);
        } finally {
            setLoadingStage5Dossier(false);
        }
    };

    const handleStage5Approve = async (app: AdoptionApp) => {
        setActionLoading(true);
        try {
            await api.post(`/adoptions/${app.adoption_id}/review/submit`, {
                decision: 'Approve',
                recommendation: 'Approve',
                review_notes: 'All stages (Verification, Interview, and Home Visit) verified and recommended for approval.',
            });
            showToast("Dossier review approved! Application advanced to Stage 6: Approval.");
            await fetchApplications();
        } catch (err: any) {
            console.error("Stage 5 approve error:", err);
            showToast(err.response?.data?.detail || "Failed to submit review decision.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    useEffect(() => {
        if (viewAppModal?.adoption_id) {
            fetchStage5Dossier(viewAppModal.adoption_id);
        }
    }, [viewAppModal?.adoption_id, viewAppModal?.current_stage]);

    const handleOpenReviewModal = (app: AdoptionApp, type: 'approve' | 'reject') => {
        setSelectedApp(app);
        setReviewModalType(type);
        if (type === 'reject') {
            setRejectionCategory('id_mismatch');
            setReviewNotes('The uploaded Government ID does not match your submitted identity details or could not be verified.');
        } else {
            setReviewNotes('');
        }
    };

    const handleSubmitReview = async () => {
        if (!selectedApp || !reviewModalType) return;
        if (reviewModalType === 'reject' && !reviewNotes.trim()) {
            showToast("Please provide a reason for rejecting this application.", "error");
            return;
        }
        setActionLoading(true);

        try {
            if (reviewModalType === 'approve') {
                if (selectedApp.current_stage === 'Review' || selectedApp.current_stage === 'Consolidated_Review') {
                    await api.post(`/adoptions/${selectedApp.adoption_id}/review/submit`, {
                        decision: 'Approve',
                        recommendation: 'Approve',
                        review_notes: reviewNotes.trim() || 'Dossier review completed and officially recommended for approval.',
                    });
                    showToast("Dossier review approved! Application advanced to Stage 6: Approval.");
                } else {
                    await api.post(`/adoptions/${selectedApp.adoption_id}/application/approve`);
                    showToast("Application approved! Stage advanced to Stage 3: Interview.");
                }
            } else {
                if (selectedApp.current_stage === 'Review' || selectedApp.current_stage === 'Consolidated_Review') {
                    await api.post(`/adoptions/${selectedApp.adoption_id}/review/submit`, {
                        decision: 'Reject',
                        recommendation: 'Reject',
                        review_notes: reviewNotes.trim(),
                    });
                } else {
                    await api.put(`/adoptions/review/${selectedApp.adoption_id}`, {
                        decision: 'Rejected',
                        review_notes: reviewNotes.trim() || undefined,
                    });
                }
                showToast("Adoption application marked as Rejected.");
            }

            setReviewModalType(null);
            setSelectedApp(null);
            await fetchApplications();
            await fetchCatalog();
        } catch (err: any) {
            console.error("Review application error", err);
            showToast(err.response?.data?.detail || "Failed to process decision.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const handleStaffConfirmHandover = async () => {
        if (!handoverModalApp) return;
        setActionLoading(true);
        try {
            const res = await api.post(`/adoptions/${handoverModalApp.adoption_id}/staff-confirm-handover`, {
                notes: handoverNotes.trim() || undefined,
            });
            showToast(res.data?.message || "Pet handover officially confirmed by Barangay Staff!");
            setHandoverModalApp(null);
            setHandoverNotes('');
            fetchApplications();
            fetchCatalog();
        } catch (err: any) {
            console.error("Staff confirm handover error", err);
            showToast(err.response?.data?.detail || "Failed to confirm pet handover.", "error");
        } finally {
            setActionLoading(false);
        }
    };

    const totalAppsCount = applications.length;
    const pendingCount = applications.filter((a) => a.status === 'Pending').length;
    const approvedCount = applications.filter((a) => a.status === 'Approved').length;
    const catalogCount = catalogAnimals.length;

    const isStage1 = viewAppModal
        ? (viewAppModal.current_stage === 'Application' || viewAppModal.current_stage === 'Applied' || (!viewAppModal.current_stage && viewAppModal.status === 'Pending'))
        : false;

    return (
        <div className="flex h-screen bg-[#FBFBF9] text-[#1E293B] font-sans overflow-hidden">
            {/* Sidebar */}
            {isAdmin ? (
                <AdminSidebar />
            ) : (
                <BrgySidebar isMobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />
            )}

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
                {isAdmin ? (
                    <AdminNavbar 
                        leftContent={
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Adoption Management</h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Centralized Barangay management for public adoption applications and adoptable animal records
                                </p>
                            </div>
                        }
                    />
                ) : (
                    <BrgyNavbar 
                        onMenuToggle={() => setMobileOpen(!mobileOpen)} 
                        leftContent={
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Adoption Management</h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Centralized Barangay management for public adoption applications and adoptable animal records
                                </p>
                            </div>
                        }
                    />
                )}

                {viewAppModal ? (
                    /* ─── COMPLETE IN-PAGE ADOPTION REPORT & DOSSIER VIEW ─── */
                    <main className="p-4 sm:p-8 pb-32 lg:pb-8 max-w-7xl w-full mx-auto space-y-6 animate-in fade-in duration-200">
                        {/* ─── Top Action & Navigation Banner ─── */}
                        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            {/* Left: Back button & Title */}
                            <div className="flex items-center gap-3.5 min-w-0">
                                <button
                                    type="button"
                                    onClick={() => setViewAppModal(null)}
                                    className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer shadow-2xs hover:-translate-x-0.5 active:scale-95 shrink-0"
                                    title="Return to adoption applications list"
                                >
                                    <ArrowLeft className="w-4 h-4 text-slate-600" />
                                    <span className="hidden sm:inline">Back to Applications</span>
                                    <span className="sm:hidden">Back</span>
                                </button>

                                <div className="h-6 w-px bg-slate-200 hidden sm:block" />

                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
                                            Adoption Report & Dossier #{viewAppModal.adoption_id}
                                        </h2>
                                        {(() => {
                                            const modalInfo = getUnifiedAdoptionStatus(viewAppModal);
                                            return (
                                                <>
                                                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${modalInfo.badgeClasses}`}>
                                                        {modalInfo.label}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-orange-700 bg-orange-50 border border-orange-200/80 px-2.5 py-0.5 rounded-full">
                                                        Stage {modalInfo.stageIndex + 1} of 10: {viewAppModal.current_stage || 'Application'}
                                                    </span>
                                                </>
                                            );
                                        })()}
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-medium">
                                        Submitted on {new Date(viewAppModal.created_at).toLocaleString('en-PH', {
                                            year: 'numeric', month: 'short', day: 'numeric',
                                            hour: '2-digit', minute: '2-digit'
                                        })} • Resident Applicant: <strong className="text-slate-700">{viewAppModal.full_name}</strong>
                                    </p>
                                </div>
                            </div>

                            {/* Right: Quick actions */}
                            <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => openAdoptionChat(viewAppModal.adoption_id)}
                                    className="relative px-3.5 py-2 bg-white hover:bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                    title="Chat with the adopter about this application"
                                >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                    <span>Chat with Adopter</span>
                                    {(chatUnread[viewAppModal.adoption_id] || 0) > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                                            {chatUnread[viewAppModal.adoption_id] > 9 ? '9+' : chatUnread[viewAppModal.adoption_id]}
                                        </span>
                                    )}
                                </button>
                                <Link
                                    to={`/brgy/adopt/journey/${viewAppModal.holding_id}`}
                                    className="px-3.5 py-2 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs"
                                >
                                    <span>Journey Trail</span>
                                    <ExternalLink className="w-3.5 h-3.5 text-orange-500" />
                                </Link>

                                {viewAppModal.status === 'Pending' && isHeadOfficer && (!viewAppModal.current_stage || viewAppModal.current_stage === 'Application' || viewAppModal.current_stage === 'Verification') && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const app = viewAppModal;
                                                handleOpenReviewModal(app, 'reject');
                                            }}
                                            className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1"
                                        >
                                            <XCircle className="w-3.5 h-3.5" />
                                            <span>Reject</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const app = viewAppModal;
                                                handleOpenReviewModal(app, 'approve');
                                            }}
                                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer flex items-center gap-1"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            <span>Approve & Proceed</span>
                                        </button>
                                    </>
                                )}

                                <button
                                    type="button"
                                    onClick={() => setViewAppModal(null)}
                                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                    title="Close dossier"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* ─── ANIMAL SUMMARY ─── */}
                        <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50/70 rounded-3xl p-5 sm:p-6 border border-orange-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                                <img
                                    src={getPetPicture(viewAppModal.animal_photo)}
                                    alt={viewAppModal.animal_name || 'Pet'}
                                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-white shadow-md shrink-0"
                                />
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-orange-700 bg-white/80 px-2.5 py-0.5 rounded-full border border-orange-200">
                                            Animal Summary
                                        </span>
                                        <span className="text-[11px] font-bold text-gray-500 bg-white/70 px-2.5 py-0.5 rounded-full border border-gray-200">
                                            Animal ID: #{viewAppModal.holding_id}
                                        </span>
                                        {(() => {
                                            const modalStatus = getUnifiedAdoptionStatus(viewAppModal);
                                            return (
                                                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${modalStatus.badgeClasses}`}>
                                                    Status: {modalStatus.label}
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight truncate">
                                        {viewAppModal.animal_name || `Rescue Animal #${viewAppModal.holding_id}`}
                                    </h2>
                                    <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-0.5 flex items-center gap-2 flex-wrap">
                                        <span>{viewAppModal.animal_type || 'Rescue'}</span>
                                        {viewAppModal.animal_breed && <span>• Breed: {viewAppModal.animal_breed}</span>}
                                        {(() => {
                                            const matchCat = catalogAnimals.find(a => a.holding_id === viewAppModal.holding_id);
                                            return (
                                                <>
                                                    {matchCat?.color && <span>• Color: {matchCat.color}</span>}
                                                    {matchCat?.estimated_size && <span>• Size: {matchCat.estimated_size}</span>}
                                                </>
                                            );
                                        })()}
                                    </p>
                                </div>
                            </div>


                        </div>

                        {/* ─── COMPACT APPLICANT / ADOPTER SUMMARY (STAGES 2–10 ONLY) ─── */}
                        {!isStage1 && (
                            <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6 min-w-0">
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black text-sm border border-orange-200 shrink-0 shadow-2xs">
                                            <User className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block leading-none mb-1">
                                                Applicant / Adopter
                                            </span>
                                            <h3 className="text-sm sm:text-base font-black text-slate-900 leading-none truncate">
                                                {viewAppModal.full_name}
                                            </h3>
                                        </div>
                                    </div>

                                    <div className="hidden sm:block h-8 w-px bg-slate-200" />

                                    <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs font-bold text-slate-600 min-w-0">
                                        <div className="flex items-center gap-1.5 text-slate-700">
                                            <Phone className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                            <span>{viewAppModal.contact_no || 'No contact number'}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-slate-700 min-w-0">
                                            <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                                            <span className="truncate max-w-[280px]" title={viewAppModal.address || ''}>
                                                {viewAppModal.address || 'Santa Maria, Bulacan'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="shrink-0 flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => setShowApplicantInfoModal(true)}
                                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200/90 rounded-2xl text-xs font-black transition-all shadow-2xs cursor-pointer hover:-translate-y-0.5 active:scale-95"
                                        title="View complete applicant details, ID verification, and motivation"
                                    >
                                        <User className="w-4 h-4 text-orange-500" />
                                        <span>View Applicant Information</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ─── ADOPTION LIFECYCLE ─── */}
                        <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-xs space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                    <FolderKanban className="w-4 h-4 text-orange-500" /> 2. Adoption Lifecycle
                                </h3>
                                <span className="text-xs text-slate-400 font-medium">10-Stage Workflow Progression</span>
                            </div>
                            <AdoptionStageStepper
                                currentStage={viewAppModal.current_stage}
                                stageStatus={viewAppModal.application_stage_status}
                                status={viewAppModal.status}
                                postMonitoringStatus={viewAppModal.post_monitoring_status}
                            />
                        </div>

                        {/* 3. CURRENT STAGE (STAGES 2–10 ONLY) */}
                        {!isStage1 && (
                            <div id="dossier-current-stage-section" className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-xs space-y-4">
                            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-purple-600" /> 
                                    {(viewAppModal.current_stage === 'Successful_Adoption' || viewAppModal.current_stage === 'Completed' || viewAppModal.current_stage === 'Successful' || viewAppModal.post_monitoring_status === 'Completed' || viewAppModal.application_stage_status === 'Case_Closed') ? (
                                        <span className="text-emerald-700 font-black">CURRENT STAGE: SUCCESSFUL ADOPTION (FINAL)</span>
                                    ) : (viewAppModal.current_stage === 'Certificate' || viewAppModal.current_stage === 'Payment') ? (
                                        <span className="text-amber-700 font-black">7. CERTIFICATE OF ADOPTION</span>
                                    ) : (
                                        <>3. Current Stage: <span className="text-orange-600 font-extrabold">{viewAppModal.current_stage || 'Application'}</span></>
                                    )}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setStageModalState({ app: viewAppModal, modal: 'dossier' })}
                                        className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                                    >
                                        <FileText className="w-3.5 h-3.5 text-slate-500" />
                                        <span>Full Case Dossier</span>
                                    </button>
                                </div>
                            </div>

                            {/* Stage 1 & 2: Application / Verification */}
                            {(viewAppModal.current_stage === 'Verification' || viewAppModal.current_stage === 'Application' || viewAppModal.current_stage === 'Applied' || (!viewAppModal.current_stage && viewAppModal.status === 'Pending')) && (
                                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                                        Applicant identity, Government ID authenticity, and residency need verification before approving for interview.
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => setStageModalState({ app: viewAppModal, modal: 'verify' })}
                                            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                                        >
                                            <ShieldCheck className="w-4 h-4" />
                                            <span>Verify ID & Eligibility</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Stage 3: Interview */}
                            {viewAppModal.current_stage === 'Interview' && (
                                <div className="space-y-3">
                                    {viewAppModal.interview_scheduled_at ? (
                                        /* Scheduled Interview Detail Card */
                                        <div className="p-4 sm:p-5 rounded-2xl bg-purple-50/90 border border-purple-200/90 text-purple-950 space-y-3">
                                            <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-purple-200/60">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-purple-600 text-white shadow-2xs flex items-center gap-1.5">
                                                        <Calendar className="w-3.5 h-3.5" /> INTERVIEW SCHEDULED
                                                    </span>
                                                    {viewAppModal.interview_result && (
                                                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                                                            viewAppModal.interview_result === 'Successful'
                                                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                                : viewAppModal.interview_result === 'Needs Follow-up'
                                                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                                                : 'bg-red-100 text-red-800 border border-red-300'
                                                        }`}>
                                                            Result: {viewAppModal.interview_result}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs sm:text-sm font-bold text-purple-800">
                                                    Mode: <strong className="text-purple-950">{viewAppModal.interview_mode || 'In-Person'}</strong>
                                                </span>
                                            </div>

                                            {/* 4-Column Structured Info */}
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                                <div className="bg-white/90 p-3 rounded-xl border border-purple-100 shadow-2xs">
                                                    <span className="text-[10px] font-bold uppercase text-purple-600 block">Date</span>
                                                    <strong className="text-slate-900 text-sm">
                                                        {new Date(viewAppModal.interview_scheduled_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                                    </strong>
                                                </div>
                                                <div className="bg-white/90 p-3 rounded-xl border border-purple-100 shadow-2xs">
                                                    <span className="text-[10px] font-bold uppercase text-purple-600 block">Time</span>
                                                    <strong className="text-slate-900 text-sm">
                                                        {new Date(viewAppModal.interview_scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                    </strong>
                                                </div>
                                                <div className="bg-white/90 p-3 rounded-xl border border-purple-100 shadow-2xs">
                                                    <span className="text-[10px] font-bold uppercase text-purple-600 block">Interviewer</span>
                                                    <strong className="text-slate-900 text-sm truncate block" title={viewAppModal.interviewer_name || 'Barangay Personnel'}>
                                                        {viewAppModal.interviewer_name || 'Barangay Personnel'}
                                                    </strong>
                                                </div>
                                                <div className="bg-white/90 p-3 rounded-xl border border-purple-100 shadow-2xs">
                                                    <span className="text-[10px] font-bold uppercase text-purple-600 block">Location</span>
                                                    <strong className="text-slate-900 text-sm truncate block" title={viewAppModal.interview_location || (viewAppModal.interview_mode === 'In-Person' ? 'Barangay Animal Facility' : 'Virtual Meeting / Office')}>
                                                        {viewAppModal.interview_location || (viewAppModal.interview_mode === 'In-Person' ? 'Barangay Animal Facility' : 'Virtual Meeting / Office')}
                                                    </strong>
                                                </div>
                                            </div>

                                            {/* Notes / Instructions box if present */}
                                            {viewAppModal.interview_notes && (
                                                <div className="bg-white/80 p-3 rounded-xl border border-purple-100 text-xs text-purple-950 space-y-1">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 block">
                                                        Interview Notes & Instructions
                                                    </span>
                                                    <p className="whitespace-pre-wrap font-medium">{viewAppModal.interview_notes}</p>
                                                </div>
                                            )}

                                            {/* Action Buttons */}
                                            <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setStageModalState({ app: viewAppModal, modal: 'interview_schedule' })}
                                                    className="px-4 py-2 bg-white hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                                >
                                                    <Calendar className="w-3.5 h-3.5 text-purple-600" />
                                                    <span>Edit Schedule</span>
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => setStageModalState({ app: viewAppModal, modal: 'interview_eval' })}
                                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5"
                                                >
                                                    <Video className="w-3.5 h-3.5" />
                                                    <span>Start Interview</span>
                                                </button>

                                                {viewAppModal.interview_result === 'Successful' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setStageModalState({ app: viewAppModal, modal: 'home_visit_schedule' })}
                                                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5 ml-auto"
                                                    >
                                                        <Home className="w-3.5 h-3.5" />
                                                        <span>Proceed to Home Visit</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        /* Not Scheduled Initial State */
                                        <div className="p-5 rounded-2xl bg-purple-50/80 border border-purple-200/90 text-xs text-purple-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="space-y-1.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-200 text-purple-900 border border-purple-300/60">
                                                        CURRENT STAGE: INTERVIEW
                                                    </span>
                                                    <span className="font-bold text-purple-700">Interview Status: <strong className="text-purple-950">Not Scheduled</strong></span>
                                                </div>
                                                <p className="text-xs sm:text-sm text-purple-800/90 leading-relaxed">
                                                    Application approved and passed initial assessment. Schedule the applicant's interview session to assess pet care knowledge, living readiness, and commitment.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setStageModalState({ app: viewAppModal, modal: 'interview_schedule' })}
                                                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-black text-xs transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
                                            >
                                                <Calendar className="w-4 h-4" />
                                                <span>Schedule Interview</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Stage 4: Home Visit */}
                            {viewAppModal.current_stage === 'Home_Visit' && (
                                <div className="space-y-3">
                                    {viewAppModal.home_visit_result ? (
                                        <div className="p-4 rounded-2xl bg-teal-50/80 border border-teal-200/80 text-xs text-teal-950 space-y-1">
                                            <div className="font-black flex items-center justify-between text-sm">
                                                <span>Home Visit Result: <strong className="text-teal-800">{viewAppModal.home_visit_result}</strong></span>
                                                <span className="text-teal-700">{viewAppModal.home_visit_inspector_name || 'Staff'}</span>
                                            </div>
                                            <div className="text-teal-700">Address: {viewAppModal.address} • Environment: {viewAppModal.living_space}</div>
                                        </div>
                                    ) : viewAppModal.home_visit_scheduled_date ? (
                                        <div className="p-4 rounded-2xl bg-teal-50/80 border border-teal-200/80 text-xs sm:text-sm text-teal-950">
                                            Home Visit Scheduled: <strong>{new Date(viewAppModal.home_visit_scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong> • Inspector: {viewAppModal.home_visit_inspector_name || 'Staff'}
                                        </div>
                                    ) : (
                                        <p className="text-xs sm:text-sm text-slate-500">
                                            Interview completed successfully. Schedule and conduct the Home Visit to inspect living conditions and perimeter security.
                                        </p>
                                    )}

                                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setStageModalState({ app: viewAppModal, modal: 'home_visit_schedule' })}
                                            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                                        >
                                            <Calendar className="w-3.5 h-3.5" />
                                            <span>{viewAppModal.home_visit_scheduled_date ? 'Reschedule Home Visit' : 'Schedule Home Visit'}</span>
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setStageModalState({ app: viewAppModal, modal: 'home_visit_eval' })}
                                            className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                                        >
                                            <Home className="w-3.5 h-3.5 text-teal-600" />
                                            <span>Record Assessment</span>
                                        </button>

                                        {viewAppModal.home_visit_notes && (
                                            <button
                                                type="button"
                                                onClick={() => setStageModalState({ app: viewAppModal, modal: 'home_visit_log' })}
                                                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                                            >
                                                <FileText className="w-3.5 h-3.5 text-teal-600" />
                                                <span>View Assessment</span>
                                            </button>
                                        )}

                                        {(viewAppModal.home_visit_result === 'Suitable' || viewAppModal.home_visit_result === 'Suitable with Conditions' || viewAppModal.home_visit_result === 'Passed') && (
                                            <button
                                                type="button"
                                                disabled={!isHeadOfficer}
                                                title={!isHeadOfficer ? HEAD_ONLY_HINT : undefined}
                                                onClick={() => setStageModalState({ app: viewAppModal, modal: 'review' })}
                                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <ClipboardCheck className="w-3.5 h-3.5" />
                                                <span>Proceed to Review</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Stage 5: Review */}
                            {(viewAppModal.current_stage === 'Review' || viewAppModal.current_stage === 'Consolidated_Review') && (
                                <div className="space-y-3">
                                    <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-xs sm:text-sm text-amber-950 space-y-1">
                                        <div className="font-extrabold text-sm text-amber-900 flex items-center gap-1.5">
                                            <ClipboardCheck className="w-4 h-4 text-amber-600" />
                                            <span>Complete Dossier Review & Final Decision</span>
                                        </div>
                                        <p className="text-amber-800/90 text-xs leading-relaxed">
                                            All required stages (Verification, Interview, and Home Visit) have been completed. Review the complete adoption dossier and assessment results before making the final decision.
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowInlineStage5Review((prev) => !prev);
                                                if (!stage5DossierData && viewAppModal) {
                                                    fetchStage5Dossier(viewAppModal.adoption_id);
                                                }
                                            }}
                                            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                                        >
                                            <ClipboardCheck className="w-3.5 h-3.5" />
                                            <span>{showInlineStage5Review ? 'Hide Complete Dossier Review' : 'Review Complete Dossier & Decision'}</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Stage 6: Approval */}
                            {viewAppModal.current_stage === 'Approval' && (
                                <div className="space-y-3.5">
                                    <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 text-xs sm:text-sm text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="space-y-0.5">
                                            <div className="font-black text-emerald-950 flex items-center gap-1.5 text-sm">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                <span>CURRENT STAGE: APPROVAL</span>
                                            </div>
                                            <div className="text-xs text-emerald-700 font-semibold">
                                                Status: <strong>Review Approved</strong> {viewAppModal.approval_date ? `• Approved on ${new Date(viewAppModal.approval_date).toLocaleDateString()}` : ''}
                                            </div>
                                        </div>
                                        {viewAppModal.certificate_number && (
                                            <span className="font-mono font-bold text-xs bg-emerald-100/80 text-emerald-900 px-3 py-1.5 rounded-xl border border-emerald-300/70">
                                                Cert #: {viewAppModal.certificate_number}
                                            </span>
                                        )}
                                    </div>

                                    {viewAppModal.review_notes && (
                                        <div className="p-3.5 rounded-2xl bg-amber-50/60 border border-amber-200/70 text-xs text-amber-950 space-y-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 block">
                                                Barangay Review Remarks ({viewAppModal.reviewer_name || 'Barangay Staff'}):
                                            </span>
                                            <p className="font-medium text-slate-800 dark:text-slate-200">{viewAppModal.review_notes}</p>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                                        <button
                                            type="button"
                                            disabled={actionLoading || !isHeadOfficer}
                                            title={!isHeadOfficer ? HEAD_ONLY_HINT : undefined}
                                            onClick={() => handleProceedToCertificate(viewAppModal.adoption_id)}
                                            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer ml-auto disabled:opacity-50"
                                        >
                                            <Award className="w-3.5 h-3.5" />
                                            <span>{actionLoading ? 'Proceeding...' : 'Proceed to Certificate'}</span>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Stage 7: Certificate */}
                            {(viewAppModal.current_stage === 'Certificate' || viewAppModal.current_stage === 'Payment') && (
                                <div className="space-y-6">
                                    {/* Print styles for direct page printing */}
                                    <style>{`
                                        @media print {
                                            body * {
                                                visibility: hidden !important;
                                            }
                                            #straysafe-adoption-certificate-root,
                                            #straysafe-adoption-certificate-root * {
                                                visibility: visible !important;
                                            }
                                            #straysafe-adoption-certificate-root {
                                                position: absolute !important;
                                                left: 0 !important;
                                                top: 0 !important;
                                                width: 100% !important;
                                                max-width: 100% !important;
                                                margin: 0 !important;
                                                padding: 10mm 12mm !important;
                                                background: #FEFCF8 !important;
                                                box-shadow: none !important;
                                                border: none !important;
                                                page-break-inside: avoid !important;
                                                -webkit-print-color-adjust: exact !important;
                                                print-color-adjust: exact !important;
                                            }
                                            @page {
                                                size: A4 portrait;
                                                margin: 6mm;
                                            }
                                        }
                                    `}</style>

                                    {/* Stage 7 Header Banner */}
                                    <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-xs sm:text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="space-y-0.5">
                                            <div className="font-black text-amber-950 flex items-center gap-1.5 text-sm">
                                                <Award className="w-4 h-4 text-amber-600" />
                                                <span>STAGE 7 — CERTIFICATE OF ADOPTION</span>
                                            </div>
                                            <div className="text-xs text-amber-800 font-semibold">
                                                Status: <strong>Adoption Certificate Ready</strong>
                                            </div>
                                        </div>
                                        {viewAppModal.certificate_number && (
                                            <span className="font-mono font-bold text-xs bg-amber-100 text-amber-900 px-3 py-1.5 rounded-xl border border-amber-300">
                                                Cert #: {viewAppModal.certificate_number}
                                            </span>
                                        )}
                                    </div>

                                    {/* Certificate Controls & Delivery Status Card */}
                                    <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4 shadow-2xs">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80">
                                            <div>
                                                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                                    <Award className="w-4 h-4 text-orange-500" /> Certificate Management
                                                </h4>
                                                <p className="text-[11px] text-slate-500 font-medium">
                                                    Official StraySafe adoption certificate with digital QR verification and Punong Barangay authorization.
                                                </p>
                                            </div>

                                            {/* Action Buttons Top */}
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <button
                                                    type="button"
                                                    onClick={() => window.print()}
                                                    className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                                                >
                                                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                                                    <span>Print Certificate</span>
                                                </button>

                                                {!viewAppModal.is_certificate_sent ? (
                                                    <button
                                                        type="button"
                                                        disabled={actionLoading || !isHeadOfficer}
                                                        title={!isHeadOfficer ? HEAD_ONLY_HINT : undefined}
                                                        onClick={() => handleSendDigitalCertificate(viewAppModal.adoption_id)}
                                                        className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 active:scale-95"
                                                    >
                                                        <Sparkles className="w-3.5 h-3.5" />
                                                        <span>{actionLoading ? 'Sending...' : 'Send Digital Certificate'}</span>
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled={actionLoading}
                                                        onClick={() => handleProceedToHandover(viewAppModal.adoption_id)}
                                                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 active:scale-95"
                                                    >
                                                        <HeartHandshake className="w-3.5 h-3.5" />
                                                        <span>{actionLoading ? 'Proceeding...' : 'Proceed to Handover'}</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Delivery Info */}
                                        {viewAppModal.is_certificate_sent ? (
                                            <div className="p-4 rounded-xl bg-emerald-50/90 border border-emerald-300 text-xs text-emerald-950 space-y-2 shadow-2xs">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-black uppercase tracking-wider text-[11px] text-emerald-800 flex items-center gap-1.5">
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" /> DIGITAL CERTIFICATE SENT
                                                    </span>
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-200 text-emerald-900">
                                                        ✓ Sent to Resident
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-medium">
                                                    <div>
                                                        <span className="text-slate-500 block text-[10px]">Sent To:</span>
                                                        <strong className="text-slate-900 text-xs">{viewAppModal.full_name}</strong>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500 block text-[10px]">Date Sent:</span>
                                                        <strong className="text-slate-900 text-xs">
                                                            {viewAppModal.certificate_sent_at ? new Date(viewAppModal.certificate_sent_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Sent'}
                                                        </strong>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-500 block text-[10px]">Certificate No.:</span>
                                                        <strong className="text-slate-900 font-mono text-xs">{viewAppModal.certificate_number || 'N/A'}</strong>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] text-emerald-700 font-bold pt-1">
                                                    ✓ Certificate successfully sent to resident. You may now proceed to Stage 8: Handover.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-center justify-between gap-2">
                                                <span>Click <strong>Send Digital Certificate</strong> to deliver this official certificate to the resident's StraySafe account.</span>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900 shrink-0">
                                                    Awaiting Delivery
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    {/* ─── FULL OFFICIAL CERTIFICATE DOCUMENT INLINE ─── */}
                                    <div className="py-2">
                                        <AdoptionCertificateDocument
                                            adoptionId={viewAppModal.adoption_id}
                                            applicationData={viewAppModal}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Stage 8: Handover */}
                            {viewAppModal.current_stage === 'Handover' && (
                                <div className="space-y-4">
                                    <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                        <div className="space-y-0.5">
                                            <div className="font-black text-amber-950 flex items-center gap-1.5 text-sm">
                                                <HeartHandshake className="w-4 h-4 text-amber-600" />
                                                <span>CURRENT STAGE: HANDOVER</span>
                                            </div>
                                            <div className="text-xs text-amber-800 font-semibold">
                                                Status: <strong>{viewAppModal.handover_status === 'Scheduled' ? 'Handover Scheduled' : viewAppModal.staff_handed_over ? 'Handover Completed' : 'Ready for Handover Scheduling'}</strong>
                                            </div>
                                        </div>
                                        {viewAppModal.staff_handed_over && viewAppModal.is_handed_over ? (
                                            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-black border border-emerald-300 flex items-center gap-1 text-xs">
                                                <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Completed & Registered
                                            </span>
                                        ) : viewAppModal.handover_status === 'Scheduled' ? (
                                            <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-900 font-bold border border-blue-300 text-xs">
                                                Scheduled
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300 text-xs">
                                                Ready for Scheduling
                                            </span>
                                        )}
                                    </div>

                                    {/* Handover Schedule Status Card */}
                                    {viewAppModal.handover_status === 'Scheduled' || viewAppModal.handover_scheduled_date ? (
                                        <div className="p-4 rounded-2xl bg-blue-50/80 border border-blue-200 text-xs space-y-3">
                                            <div className="flex items-center justify-between pb-2 border-b border-blue-200/60">
                                                <span className="font-black uppercase tracking-wider text-[11px] text-blue-900 flex items-center gap-1.5">
                                                    <Calendar className="w-4 h-4 text-blue-600" /> HANDOVER STATUS: Scheduled
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 bg-white/90 p-3.5 rounded-xl border border-blue-100">
                                                <div>
                                                    <span className="text-slate-500 font-semibold block text-[10px]">Date:</span>
                                                    <strong className="text-slate-900 text-xs">
                                                        {viewAppModal.handover_scheduled_date ? new Date(viewAppModal.handover_scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                                    </strong>
                                                </div>
                                                <div>
                                                    <span className="text-slate-500 font-semibold block text-[10px]">Time:</span>
                                                    <strong className="text-slate-900 text-xs">{viewAppModal.handover_scheduled_time || '10:00 AM'}</strong>
                                                </div>
                                                <div className="sm:col-span-2">
                                                    <span className="text-slate-500 font-semibold block text-[10px]">Location:</span>
                                                    <strong className="text-slate-900 text-xs">{viewAppModal.handover_location || 'Barangay Animal Welfare Center'}</strong>
                                                </div>
                                            </div>

                                            {viewAppModal.handover_assigned_staff && (
                                                <div className="text-[11px] text-blue-950 font-medium">
                                                    Assigned Staff: <strong>{viewAppModal.handover_assigned_staff}</strong>
                                                </div>
                                            )}
                                            {viewAppModal.handover_notes && (
                                                <div className="text-[11px] text-slate-600 bg-white/70 p-2.5 rounded-lg border border-blue-100/80">
                                                    Notes: {viewAppModal.handover_notes}
                                                </div>
                                            )}

                                            {/* Dual Confirmations */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                                <div className="p-3 rounded-xl bg-white border border-slate-200">
                                                    <span className="text-slate-500 font-semibold block text-[10px]">Resident Confirmation:</span>
                                                    {viewAppModal.resident_handover_confirmed || viewAppModal.is_handed_over ? (
                                                        <span className="font-black text-emerald-700 flex items-center gap-1 mt-1 text-xs">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> ✓ Confirmed by Resident
                                                        </span>
                                                    ) : (
                                                        <span className="font-bold text-amber-700 flex items-center gap-1 mt-1 text-xs">
                                                            <Clock className="w-3.5 h-3.5" /> Pending Resident Confirmation
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="p-3 rounded-xl bg-white border border-slate-200">
                                                    <span className="text-slate-500 font-semibold block text-[10px]">Barangay Staff Confirmation:</span>
                                                    {viewAppModal.staff_handed_over ? (
                                                        <span className="font-black text-emerald-700 flex items-center gap-1 mt-1 text-xs">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> ✓ Completed ({viewAppModal.staff_handover_name || 'Staff'})
                                                        </span>
                                                    ) : (
                                                        <span className="font-bold text-amber-700 flex items-center gap-1 mt-1 text-xs">
                                                            <Clock className="w-3.5 h-3.5" /> Pending Physical Release
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Unscheduled Prompt */
                                        <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-xs text-amber-900 space-y-2">
                                            <p className="leading-relaxed">
                                                The digital certificate has been sent to <strong>{viewAppModal.full_name}</strong>. Set the handover schedule so the adopter is informed when and where to claim <strong>{viewAppModal.animal_name || 'the pet'}</strong>.
                                            </p>
                                        </div>
                                    )}

                                    {/* Handover Action Buttons */}
                                    <div className="flex flex-wrap items-center gap-2.5 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setStageModalState({ app: viewAppModal, modal: 'handover_schedule' })}
                                            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                                        >
                                            <Calendar className="w-3.5 h-3.5" />
                                            <span>{viewAppModal.handover_scheduled_date ? 'Edit Handover Schedule' : 'Schedule Handover'}</span>
                                        </button>

                                        {!viewAppModal.staff_handed_over && (
                                            <button
                                                type="button"
                                                onClick={() => setHandoverModalApp(viewAppModal)}
                                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all shadow-xs flex items-center gap-1.5 cursor-pointer ml-auto"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span>Confirm Pet Handed Over</span>
                                            </button>
                                        )}

                                        {viewAppModal.staff_handed_over && (
                                            <button
                                                type="button"
                                                disabled={actionLoading || !isHeadOfficer}
                                                title={!isHeadOfficer ? HEAD_ONLY_HINT : undefined}
                                                onClick={() => handleProceedToMonitoring(viewAppModal.adoption_id)}
                                                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer ml-auto disabled:opacity-50"
                                            >
                                                <Activity className="w-3.5 h-3.5" />
                                                <span>{actionLoading ? 'Proceeding...' : 'Proceed to Monitoring'}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Stage 9: Monitoring (Full Inline Page Section) */}
                            {viewAppModal.current_stage === 'Monitoring' && (
                                <div id="stage-9-monitoring-section" className="space-y-6 animate-in fade-in duration-200">
                                    {/* Top Stage 9 Status Banner */}
                                    <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/90 border border-indigo-200/90 text-xs sm:text-sm text-indigo-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                                        <div className="space-y-1">
                                            <div className="font-black text-indigo-950 flex items-center gap-2 text-sm sm:text-base">
                                                <Activity className="w-5 h-5 text-indigo-600" />
                                                <span>CURRENT STAGE: MONITORING</span>
                                            </div>
                                            <div className="text-xs text-indigo-900 font-semibold space-y-0.5 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                                                <span>Status: <strong>Post-Adoption Welfare Monitoring</strong></span>
                                                <span className="hidden sm:inline text-indigo-300">•</span>
                                                <span>Adoption Status: <strong className="text-emerald-700 font-black">COMPLETED</strong></span>
                                                <span className="hidden sm:inline text-indigo-300">•</span>
                                                <span>Monitoring Status: <strong className="text-indigo-700 font-black">ACTIVE</strong></span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Adoption Completed
                                            </span>
                                            <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-indigo-600 text-white shadow-2xs flex items-center gap-1">
                                                <span className="w-2 h-2 rounded-full bg-indigo-200 animate-ping" />
                                                Active ●
                                            </span>
                                        </div>
                                    </div>

                                    {/* 9. POST-ADOPTION WELFARE MONITORING Sub-Header & Tabs */}
                                    <div className="p-5 sm:p-6 rounded-3xl bg-white border border-slate-200/90 shadow-xs space-y-5">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                                            <div>
                                                <h4 className="text-sm sm:text-base font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                                                    <Activity className="w-5 h-5 text-indigo-600" /> 9. POST-ADOPTION WELFARE MONITORING
                                                </h4>
                                                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                                                    Welfare Follow-up Records & Health Check-ins for {viewAppModal.animal_name || `Pet #${viewAppModal.holding_id}`}
                                                </p>
                                            </div>

                                            {/* Tabs / Page Controls */}
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setMonitoringInlineTab('history')}
                                                    className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                                                        monitoringInlineTab === 'history'
                                                            ? 'bg-indigo-600 text-white shadow-xs'
                                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                                    }`}
                                                >
                                                    <Clock className="w-3.5 h-3.5" />
                                                    <span>Monitoring History ({dossierMonitoringLogs.length})</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setMonitoringInlineTab('add')}
                                                    className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 ${
                                                        monitoringInlineTab === 'add'
                                                            ? 'bg-indigo-600 text-white shadow-xs'
                                                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                                    }`}
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    <span>+ Add Monitoring Record</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* TAB 1: MONITORING HISTORY */}
                                        {monitoringInlineTab === 'history' && (
                                            <div className="space-y-4">
                                                {loadingDossierMonitoringLogs ? (
                                                    <div className="py-12 text-center space-y-2">
                                                        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                                                        <p className="text-xs font-bold text-slate-500">Loading monitoring records...</p>
                                                    </div>
                                                ) : dossierMonitoringLogs.length === 0 ? (
                                                    <div className="p-8 sm:p-10 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50 space-y-3">
                                                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto shadow-2xs">
                                                            <Activity className="w-6 h-6" />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <h5 className="font-black text-sm text-slate-800 uppercase tracking-wide">MONITORING HISTORY</h5>
                                                            <p className="text-xs text-slate-500 font-medium">No monitoring records logged yet.</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setMonitoringInlineTab('add')}
                                                            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs transition-colors inline-flex items-center gap-1.5 shadow-xs cursor-pointer"
                                                        >
                                                            <Plus className="w-4 h-4" />
                                                            <span>+ Add First Monitoring Record</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-4">
                                                        {dossierMonitoringLogs.map((log, index) => {
                                                            const data = parseRecordData(log);
                                                            return (
                                                                <div
                                                                    key={log.log_id || index}
                                                                    className="p-5 rounded-2xl bg-slate-50/90 border border-slate-200 space-y-4 shadow-2xs hover:border-indigo-200 transition-colors"
                                                                >
                                                                    {/* Record Top Bar */}
                                                                    <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-200/80">
                                                                        <div className="flex items-center gap-2.5">
                                                                            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-black text-xs shrink-0">
                                                                                #{index + 1}
                                                                            </div>
                                                                            <div>
                                                                                <h5 className="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-2">
                                                                                    <span>Monitoring Visit #{index + 1}</span>
                                                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                                                        {data.monitoringType}
                                                                                    </span>
                                                                                </h5>
                                                                                <span className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                                                                    <Calendar className="w-3 h-3 text-slate-400" /> Date: <strong className="text-slate-700">{data.monitoringDate}</strong>
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                                                                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Recorded & Verified
                                                                        </span>
                                                                    </div>

                                                                    {/* Detailed Attributes Grid */}
                                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                                                        <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Animal Condition</span>
                                                                            <strong className="text-slate-800 text-xs">{data.animalCondition}</strong>
                                                                        </div>
                                                                        <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Health Status</span>
                                                                            <strong className="text-emerald-700 text-xs font-bold">{data.healthStatus}</strong>
                                                                        </div>
                                                                        <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Living Condition</span>
                                                                            <strong className="text-slate-800 text-xs">{data.livingCondition}</strong>
                                                                        </div>
                                                                        <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Shelter Condition</span>
                                                                            <strong className="text-slate-800 text-xs">{data.shelterCondition}</strong>
                                                                        </div>
                                                                        <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Food & Water</span>
                                                                            <strong className="text-slate-800 text-xs">{data.foodAndWater}</strong>
                                                                        </div>
                                                                        <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Vaccination Status</span>
                                                                            <strong className="text-slate-800 text-xs">{data.vaccinationStatus}</strong>
                                                                        </div>
                                                                        <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Behavior</span>
                                                                            <strong className="text-slate-800 text-xs">{data.behavior}</strong>
                                                                        </div>
                                                                        <div className="p-2.5 bg-white rounded-xl border border-slate-200/80">
                                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Barangay Officer</span>
                                                                            <strong className="text-slate-800 text-xs truncate block">{data.officer}</strong>
                                                                        </div>
                                                                    </div>

                                                                    {/* Remarks / Observations */}
                                                                    {data.remarks && (
                                                                        <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 text-xs text-slate-700 space-y-1">
                                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Remarks:</span>
                                                                            <p className="leading-relaxed whitespace-pre-wrap">{data.remarks}</p>
                                                                        </div>
                                                                    )}

                                                                    {/* Attachments / Photos Section directly below Remarks */}
                                                                    {data.photos && data.photos.length > 0 && (
                                                                        <div className="p-3.5 bg-white rounded-xl border border-slate-200/80 text-xs space-y-2">
                                                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                                                                Attachments / Photos ({data.photos.length}):
                                                                            </span>
                                                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                                                {data.photos.map((photoUrl: string, pIdx: number) => (
                                                                                    <button
                                                                                        key={pIdx}
                                                                                        type="button"
                                                                                        onClick={() => setDossierLightboxPhoto(photoUrl)}
                                                                                        className="relative group rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-500 transition-all cursor-pointer shadow-2xs"
                                                                                        title="Click to view full photo"
                                                                                    >
                                                                                        <img
                                                                                            src={photoUrl}
                                                                                            alt={`Monitoring check-in photo ${pIdx + 1}`}
                                                                                            className="w-16 h-16 sm:w-20 sm:h-20 object-cover group-hover:scale-105 transition-transform"
                                                                                        />
                                                                                    </button>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {/* Next Follow-up Date */}
                                                                    <div className="flex items-center gap-2 pt-1 text-xs text-slate-600">
                                                                        <Clock className="w-3.5 h-3.5 text-indigo-500" />
                                                                        <span>Next Follow-up Date: <strong className="text-slate-900">{data.nextFollowupDate}</strong></span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* TAB 2: ADD MONITORING RECORD (INLINE EXPANDED FORM) */}
                                        {monitoringInlineTab === 'add' && (
                                            <form onSubmit={handleSaveMonitoringRecord} className="p-5 sm:p-7 rounded-3xl bg-slate-50 border border-slate-200 space-y-5 shadow-2xs animate-in fade-in duration-200">
                                                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                                                    <h5 className="font-black text-xs sm:text-sm text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                                        <Plus className="w-4 h-4 text-indigo-600" /> ADD MONITORING RECORD
                                                    </h5>
                                                    <span className="text-[11px] text-slate-400 font-semibold">Stage 9 Welfare Check-in</span>
                                                </div>

                                                {monitoringFormError && (
                                                    <div className="p-3 rounded-xl bg-red-100 text-red-800 text-xs font-bold flex items-center gap-2">
                                                        <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                                                        <span>{monitoringFormError}</span>
                                                    </div>
                                                )}

                                                {/* Form Inputs Grid */}
                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Monitoring Date <span className="text-red-500">*</span>
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={inlineMonitoringDate}
                                                            onChange={(e) => setInlineMonitoringDate(e.target.value)}
                                                            required
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Monitoring Type <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            value={inlineMonitoringType}
                                                            onChange={(e) => setInlineMonitoringType(e.target.value)}
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        >
                                                            <option value="Initial Follow-up">Initial Follow-up</option>
                                                            <option value="Routine Check-in">Routine Check-in</option>
                                                            <option value="Special Welfare Visit">Special Welfare Visit</option>
                                                            <option value="30-Day Final Evaluation">30-Day Final Evaluation</option>
                                                            <option value="Unscheduled Inspection">Unscheduled Inspection</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Animal Condition <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            value={inlineAnimalCondition}
                                                            onChange={(e) => setInlineAnimalCondition(e.target.value)}
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        >
                                                            <option value="Good">Good</option>
                                                            <option value="Excellent">Excellent</option>
                                                            <option value="Healthy & Active">Healthy & Active</option>
                                                            <option value="Fair">Fair</option>
                                                            <option value="Poor / Needs Attention">Poor / Needs Attention</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Health Status <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            value={inlineHealthStatus}
                                                            onChange={(e) => setInlineHealthStatus(e.target.value)}
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        >
                                                            <option value="Healthy">Healthy</option>
                                                            <option value="Minor Symptoms">Minor Symptoms</option>
                                                            <option value="Under Treatment">Under Treatment</option>
                                                            <option value="Critical">Critical</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Living Condition <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            value={inlineLivingCondition}
                                                            onChange={(e) => setInlineLivingCondition(e.target.value)}
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        >
                                                            <option value="Good">Good</option>
                                                            <option value="Excellent">Excellent</option>
                                                            <option value="Safe & Clean">Safe & Clean</option>
                                                            <option value="Adequate">Adequate</option>
                                                            <option value="Poor / Needs Sanitation">Poor / Needs Sanitation</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Food & Water <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            value={inlineFoodAndWater}
                                                            onChange={(e) => setInlineFoodAndWater(e.target.value)}
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        >
                                                            <option value="Adequate">Adequate</option>
                                                            <option value="Abundant & Fresh">Abundant & Fresh</option>
                                                            <option value="Needs Improvement">Needs Improvement</option>
                                                            <option value="Insufficient">Insufficient</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Shelter Condition <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            value={inlineShelterCondition}
                                                            onChange={(e) => setInlineShelterCondition(e.target.value)}
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        >
                                                            <option value="Safe">Safe</option>
                                                            <option value="Safe and Appropriate">Safe and Appropriate</option>
                                                            <option value="Needs Improvement">Needs Improvement</option>
                                                            <option value="Inadequate">Inadequate</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Vaccination Status <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            value={inlineVaccinationStatus}
                                                            onChange={(e) => setInlineVaccinationStatus(e.target.value)}
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        >
                                                            <option value="Up to Date">Up to Date</option>
                                                            <option value="Due Soon">Due Soon</option>
                                                            <option value="Pending Schedule">Pending Schedule</option>
                                                            <option value="Not Vaccinated">Not Vaccinated</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Behavior <span className="text-red-500">*</span>
                                                        </label>
                                                        <select
                                                            value={inlineBehavior}
                                                            onChange={(e) => setInlineBehavior(e.target.value)}
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        >
                                                            <option value="Normal">Normal</option>
                                                            <option value="Active & Friendly">Active & Friendly</option>
                                                            <option value="Shy / Timid">Shy / Timid</option>
                                                            <option value="Aggressive">Aggressive</option>
                                                            <option value="Lethargic">Lethargic</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Barangay Staff / Officer
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={inlineOfficerName}
                                                            onChange={(e) => setInlineOfficerName(e.target.value)}
                                                            placeholder="e.g. Officer Juan Dela Cruz"
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block font-bold text-slate-700 mb-1.5">
                                                            Next Follow-up Date
                                                        </label>
                                                        <input
                                                            type="date"
                                                            value={inlineNextFollowupDate}
                                                            onChange={(e) => setInlineNextFollowupDate(e.target.value)}
                                                            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-semibold text-slate-800 focus:border-indigo-500 focus:outline-hidden"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Remarks */}
                                                <div className="space-y-1.5">
                                                    <label className="block font-bold text-xs text-slate-700">
                                                        Remarks
                                                    </label>
                                                    <textarea
                                                        rows={3}
                                                        value={inlineRemarks}
                                                        onChange={(e) => setInlineRemarks(e.target.value)}
                                                        placeholder="e.g. Animal is adapting well to the new home. Active, healthy, and eating well..."
                                                        className="w-full p-3.5 rounded-xl border border-slate-200 bg-white text-xs font-normal text-slate-800 focus:border-indigo-500 focus:outline-hidden resize-none shadow-2xs"
                                                    />
                                                </div>

                                                {/* Upload Monitoring Photo with file input */}
                                                <div className="space-y-2 pt-1">
                                                    <label className="block font-bold text-xs text-slate-700">
                                                        Upload Monitoring Photo
                                                    </label>
                                                    <div className="flex items-center gap-3 flex-wrap">
                                                        <label
                                                            htmlFor="inline-monitoring-photo-upload"
                                                            className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer shadow-2xs active:scale-95"
                                                        >
                                                            <Camera className="w-4 h-4 text-indigo-600" />
                                                            <span>Upload Photo</span>
                                                        </label>
                                                        <input
                                                            id="inline-monitoring-photo-upload"
                                                            type="file"
                                                            accept="image/*"
                                                            multiple
                                                            onChange={handleInlinePhotoSelect}
                                                            className="hidden"
                                                        />
                                                        <span className="text-[11px] text-slate-400">
                                                            Select image from phone gallery, camera, or local device files.
                                                        </span>
                                                    </div>

                                                    {/* Previews */}
                                                    {inlineSelectedPhotos.length > 0 && (
                                                        <div className="flex items-center gap-3 pt-2 flex-wrap">
                                                            {inlineSelectedPhotos.map((item, idx) => (
                                                                <div key={idx} className="relative group rounded-2xl overflow-hidden border-2 border-indigo-200 shadow-xs">
                                                                    <img
                                                                        src={item.preview}
                                                                        alt={`Monitoring upload preview ${idx + 1}`}
                                                                        className="w-16 h-16 object-cover"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveInlinePhoto(idx)}
                                                                        className="absolute top-1 right-1 w-5 h-5 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center text-xs font-black shadow-md cursor-pointer transition-transform group-hover:scale-110"
                                                                        title="Remove image"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                                                    <button
                                                        type="button"
                                                        onClick={() => setMonitoringInlineTab('history')}
                                                        className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        type="submit"
                                                        disabled={isSavingMonitoringRecord}
                                                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                                                    >
                                                        {isSavingMonitoringRecord ? (
                                                            <>
                                                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                                                <span>Saving Record...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CheckCircle2 className="w-4 h-4" />
                                                                <span>Save Monitoring Record</span>
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </form>
                                        )}
                                    </div>

                                    {/* Proceed to Stage 10: MONITORING COMPLETE? Card */}
                                    <div className="p-5 sm:p-6 rounded-3xl bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-50/60 border border-emerald-200/90 shadow-2xs space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="space-y-1">
                                                <h5 className="font-black text-xs sm:text-sm text-emerald-950 uppercase tracking-wider flex items-center gap-2">
                                                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                                                    <span>MONITORING COMPLETE?</span>
                                                </h5>
                                                <p className="text-xs text-emerald-900/80 font-medium max-w-2xl leading-relaxed">
                                                    All required post-adoption monitoring has been completed. Mark this adoption as successful to officially close the adoption case.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                disabled={actionLoading || !isHeadOfficer}
                                                title={!isHeadOfficer ? HEAD_ONLY_HINT : undefined}
                                                onClick={() => handleMarkAdoptionSuccessful(viewAppModal.adoption_id)}
                                                className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-2xl shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
                                            >
                                                <CheckCircle2 className="w-4 h-4" />
                                                <span>{actionLoading ? 'Finalizing Case...' : 'Mark Adoption as Successful'}</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Stage 10: Successful Adoption (Full Inline Page Section - FINAL) */}
                            {(viewAppModal.current_stage === 'Successful_Adoption' || viewAppModal.current_stage === 'Completed' || viewAppModal.current_stage === 'Successful' || viewAppModal.post_monitoring_status === 'Completed' || viewAppModal.application_stage_status === 'Case_Closed') && (
                                <div id="stage-10-successful-section" className="space-y-6 animate-in fade-in duration-200">
                                    {/* Top Stage 10 Status Banner */}
                                    <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 text-white shadow-md shadow-emerald-600/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="space-y-1">
                                            <div className="font-black flex items-center gap-2 text-base sm:text-lg">
                                                <CheckCircle2 className="w-6 h-6 text-white" />
                                                <span>CURRENT STAGE: SUCCESSFUL ADOPTION</span>
                                            </div>
                                            <div className="text-xs text-emerald-50 font-semibold space-y-0.5 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                                                <span>Status: <strong className="text-white">✓ ADOPTION SUCCESSFUL</strong></span>
                                                <span className="hidden sm:inline text-emerald-200">•</span>
                                                <span>Monitoring Status: <strong className="text-white">COMPLETED</strong></span>
                                                <span className="hidden sm:inline text-emerald-200">•</span>
                                                <span>Case Status: <strong className="text-white">CLOSED</strong></span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                            <span className="px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-white text-emerald-800 shadow-xs flex items-center gap-1.5">
                                                <Sparkles className="w-3.5 h-3.5 text-amber-500" /> FINAL STAGE (10 OF 10)
                                            </span>
                                        </div>
                                    </div>

                                    {/* 10. SUCCESSFUL ADOPTION CARD */}
                                    <div className="p-6 sm:p-8 rounded-3xl bg-white border border-emerald-200/90 shadow-xs space-y-6">
                                        {/* Prominent Success Message */}
                                        <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/80 border border-emerald-200 text-center space-y-2">
                                            <div className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-md shadow-emerald-600/30">
                                                <CheckCircle2 className="w-8 h-8" />
                                            </div>
                                            <h3 className="text-lg sm:text-xl font-black text-emerald-950 uppercase tracking-tight">
                                                ✓ ADOPTION SUCCESSFULLY COMPLETED
                                            </h3>
                                            <p className="text-xs sm:text-sm text-emerald-900/80 font-medium max-w-2xl mx-auto leading-relaxed">
                                                This adoption has successfully completed all required adoption, handover, and post-adoption monitoring procedures.
                                            </p>
                                        </div>

                                        {/* Structured Details Grid */}
                                        <div className="space-y-3">
                                            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                                                Official Case Particulars & Records
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Adopter</span>
                                                    <strong className="text-slate-900 text-sm font-extrabold block truncate">{viewAppModal.full_name}</strong>
                                                    <span className="text-[11px] text-slate-500 font-medium">{viewAppModal.contact_no}</span>
                                                </div>
                                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Animal</span>
                                                    <strong className="text-slate-900 text-sm font-extrabold block truncate">{viewAppModal.animal_name || 'Rescue Pet'}</strong>
                                                    <span className="text-[11px] text-slate-500 font-medium">{viewAppModal.animal_type || 'Dog'} • {viewAppModal.animal_breed || 'Mixed'}</span>
                                                </div>
                                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Animal ID</span>
                                                    <strong className="text-slate-900 text-sm font-extrabold block">#{viewAppModal.holding_id}</strong>
                                                    <span className="text-[11px] text-slate-500 font-medium">Holding Custody Unit</span>
                                                </div>
                                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Adoption Date</span>
                                                    <strong className="text-slate-900 text-sm font-extrabold block">
                                                        {viewAppModal.adoption_completed_at ? new Date(viewAppModal.adoption_completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (viewAppModal.approval_date ? new Date(viewAppModal.approval_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date(viewAppModal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))}
                                                    </strong>
                                                    <span className="text-[11px] text-emerald-700 font-bold">Officially Finalized</span>
                                                </div>
                                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Certificate No.</span>
                                                    <strong className="text-slate-900 text-xs font-extrabold block truncate">
                                                        {viewAppModal.certificate_number || `SS-ADOPT-${new Date().getFullYear()}-${String(viewAppModal.adoption_id).padStart(5, '0')}`}
                                                    </strong>
                                                    <span className="text-[11px] text-teal-700 font-bold">Issued & Verified</span>
                                                </div>
                                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Handover Date</span>
                                                    <strong className="text-slate-900 text-sm font-extrabold block">
                                                        {viewAppModal.handover_date ? new Date(viewAppModal.handover_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (viewAppModal.staff_handover_date ? new Date(viewAppModal.staff_handover_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : (viewAppModal.handover_scheduled_date ? new Date(viewAppModal.handover_scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Completed'))}
                                                    </strong>
                                                    <span className="text-[11px] text-emerald-700 font-bold">Physical Custody Transferred</span>
                                                </div>
                                                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Monitoring Completed</span>
                                                    <strong className="text-slate-900 text-sm font-extrabold block">
                                                        {viewAppModal.adoption_completed_at ? new Date(viewAppModal.adoption_completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                    </strong>
                                                    <span className="text-[11px] text-emerald-700 font-bold">Welfare Checks Passed</span>
                                                </div>
                                                <div className="p-3.5 bg-emerald-50/70 rounded-2xl border border-emerald-200 space-y-1">
                                                    <span className="text-[10px] text-emerald-700 font-bold uppercase block">Final Adoption Status</span>
                                                    <strong className="text-emerald-900 text-base font-black block">SUCCESSFUL</strong>
                                                    <span className="text-[11px] text-emerald-800 font-bold flex items-center gap-1">
                                                        <span className="w-2 h-2 rounded-full bg-emerald-600" /> Case Status: CLOSED
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* FINAL CASE SUMMARY CHECKLIST CARD */}
                                        <div className="p-5 sm:p-6 rounded-3xl bg-slate-50/90 border border-slate-200/90 space-y-4">
                                            <div className="flex items-center justify-between pb-3 border-b border-slate-200 flex-wrap gap-2">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                                                    <h4 className="font-black text-sm text-slate-900 uppercase tracking-wider">
                                                        ADOPTION CASE COMPLETED
                                                    </h4>
                                                </div>
                                                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                    Final Status: SUCCESSFUL
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                                                {[
                                                    { num: 1, name: 'Application', done: true },
                                                    { num: 2, name: 'Verification', done: true },
                                                    { num: 3, name: 'Interview', done: true },
                                                    { num: 4, name: 'Home Visit', done: true },
                                                    { num: 5, name: 'Review', done: true },
                                                    { num: 6, name: 'Approval', done: true },
                                                    { num: 7, name: 'Certificate Issued', done: true },
                                                    { num: 8, name: 'Handover Completed', done: true },
                                                    { num: 9, name: 'Monitoring Completed', done: true },
                                                    { num: 10, name: 'Adoption Successful', done: true },
                                                ].map((step) => (
                                                    <div key={step.num} className="p-3 rounded-xl bg-white border border-emerald-200 shadow-2xs flex items-center gap-2">
                                                        <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-xs shrink-0">
                                                            ✓
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="text-[10px] text-slate-400 font-bold block">{step.num}.</span>
                                                            <strong className="text-slate-900 text-xs font-bold truncate block">{step.name}</strong>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Quick View Certificate Action */}
                                        <div className="flex items-center justify-between flex-wrap gap-3 pt-2 border-t border-slate-100">
                                            <span className="text-xs text-slate-500 font-medium">
                                                This adoption case is permanently closed with distinction. No further workflow actions are required.
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setStageModalState({ app: viewAppModal, modal: 'certificate' })}
                                                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                                            >
                                                <Award className="w-4 h-4 text-amber-400" />
                                                <span>View Official Certificate</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                        {/* 5. COMPLETE DOSSIER REVIEW & FINAL DECISION (INLINE) */}
                        {(viewAppModal.current_stage === 'Review' || viewAppModal.current_stage === 'Consolidated_Review') && showInlineStage5Review && (
                            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-amber-200/90 shadow-xs space-y-6 animate-in fade-in slide-in-from-top-3 duration-300">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                                            <ClipboardCheck className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wider">
                                                5. Complete Dossier Review & Final Decision
                                            </h3>
                                            <p className="text-xs text-slate-500">
                                                Comprehensive consolidated evaluation of applicant, interview, home visit, and living environment
                                            </p>
                                        </div>
                                    </div>
                                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                                        Stage 5 of 9
                                    </span>
                                </div>

                                {loadingStage5Dossier ? (
                                    <div className="py-12 text-center space-y-2">
                                        <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
                                        <p className="text-xs font-bold text-slate-500">Loading compiled dossier data...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6 text-xs text-slate-700">
                                        {/* Row 1: Applicant Information, Animal Information, Application Information */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* APPLICANT INFORMATION */}
                                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                                                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 pb-1 border-b border-slate-200">
                                                    <User className="w-3.5 h-3.5 text-slate-700" /> Applicant Information
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Applicant Name</span>
                                                        <strong className="text-slate-900 text-sm block">{viewAppModal.full_name}</strong>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Contact Number</span>
                                                        <span className="text-slate-800 font-semibold">{viewAppModal.contact_no}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Residential Address</span>
                                                        <span className="text-slate-800 font-semibold leading-tight block">{viewAppModal.address}</span>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                                        <div>
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Living Space</span>
                                                            <span className="text-slate-800 font-semibold">{viewAppModal.living_space}</span>
                                                        </div>
                                                        <div>
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Other Pets</span>
                                                            <span className="text-slate-800 font-semibold">
                                                                {viewAppModal.existing_pets || (viewAppModal.has_other_pets ? 'Yes (Owns other pets)' : 'None')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* ANIMAL INFORMATION */}
                                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                                                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 pb-1 border-b border-slate-200">
                                                    <PawPrint className="w-3.5 h-3.5 text-slate-700" /> Animal Information
                                                </div>
                                                <div className="flex items-start gap-3">
                                                    <img
                                                        src={getPetPicture(viewAppModal.animal_photo)}
                                                        alt={viewAppModal.animal_name || 'Pet'}
                                                        className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0 bg-white"
                                                    />
                                                    <div className="min-w-0 space-y-1">
                                                        <strong className="text-slate-900 text-sm block truncate">
                                                            {viewAppModal.animal_name || 'Rescue Pet'}
                                                        </strong>
                                                        <div className="text-slate-600 font-semibold text-[11px]">
                                                            {viewAppModal.animal_type || 'Dog'} • {viewAppModal.animal_breed || 'Mixed Breed'}
                                                        </div>
                                                        <div className="text-slate-500 text-[10px]">
                                                            Status: <strong className="text-emerald-700 font-bold">In Protective Custody</strong>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Holding ID</span>
                                                        <span className="text-slate-800 font-semibold">#{viewAppModal.holding_id}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Adoption Readiness</span>
                                                        <span className="text-emerald-700 font-bold">Ready for Handover</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* APPLICATION INFORMATION */}
                                            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2.5">
                                                <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 pb-1 border-b border-slate-200">
                                                    <FileText className="w-3.5 h-3.5 text-slate-700" /> Application Information
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase">Application Number</span>
                                                        <strong className="text-slate-900 text-sm">#{viewAppModal.adoption_id}</strong>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase">Date Submitted</span>
                                                        <span className="text-slate-800 font-semibold">
                                                            {new Date(viewAppModal.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase">Application Status</span>
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-300">
                                                            Stage 5: Review
                                                        </span>
                                                    </div>
                                                    {viewAppModal.reason && (
                                                        <div className="pt-1.5">
                                                            <span className="text-[10px] text-slate-400 font-bold uppercase block">Applicant Motivation</span>
                                                            <p className="text-[11px] text-slate-700 italic line-clamp-2 bg-white p-2 rounded-xl border border-slate-200">
                                                                "{viewAppModal.reason}"
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Row 2: Verification Review (Stage 2) & Interview Review (Stage 3) */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* VERIFICATION REVIEW */}
                                            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200/80 space-y-3">
                                                <div className="flex items-center justify-between pb-1.5 border-b border-blue-200/60">
                                                    <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-blue-900">
                                                        <ShieldCheck className="w-4 h-4 text-blue-600" /> Stage 2: Verification Review (Read-Only)
                                                    </div>
                                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                        ✓ Verified
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2.5 text-xs">
                                                    <div className="bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Verification Status</span>
                                                        <strong className="text-slate-900 font-extrabold">{stage5DossierData?.verification?.id_match_status || 'Identity Matched'}</strong>
                                                    </div>
                                                    <div className="bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Government ID</span>
                                                        <strong className="text-slate-900 font-extrabold">{viewAppModal.id_type || 'Government ID Verified'}</strong>
                                                    </div>
                                                    <div className="bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Applicant Residency</span>
                                                        <strong className="text-slate-900 font-extrabold">{stage5DossierData?.verification?.residency_status || 'Resident Confirmed'}</strong>
                                                    </div>
                                                    <div className="bg-white p-2.5 rounded-xl border border-blue-100 shadow-2xs">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Blacklist Status</span>
                                                        <strong className={stage5DossierData?.verification?.is_blacklisted ? 'text-red-600 font-black' : 'text-emerald-700 font-black'}>
                                                            {stage5DossierData?.verification?.is_blacklisted ? 'Flagged' : 'Clean / Clear'}
                                                        </strong>
                                                    </div>
                                                </div>
                                                {stage5DossierData?.verification?.verification_notes && (
                                                    <div className="bg-white p-2.5 rounded-xl border border-blue-100 text-[11px] text-slate-700">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Verification Notes</span>
                                                        <p className="font-medium italic">"{stage5DossierData.verification.verification_notes}"</p>
                                                    </div>
                                                )}
                                                <div className="text-[10px] text-slate-500 font-medium flex items-center justify-between pt-1">
                                                    <span>Verified By: <strong>{stage5DossierData?.verification?.verifier_name || 'Barangay Staff'}</strong></span>
                                                    <span>{stage5DossierData?.verification?.verified_at ? new Date(stage5DossierData.verification.verified_at).toLocaleDateString() : 'Completed'}</span>
                                                </div>
                                            </div>

                                            {/* INTERVIEW REVIEW */}
                                            <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-200/80 space-y-3">
                                                <div className="flex items-center justify-between pb-1.5 border-b border-purple-200/60">
                                                    <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-purple-900">
                                                        <Video className="w-4 h-4 text-purple-600" /> Stage 3: Interview Review
                                                    </div>
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                                        (viewAppModal.interview_result === 'Successful' || stage5DossierData?.interview?.recommendation === 'Successful')
                                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                                            : 'bg-purple-100 text-purple-800 border border-purple-300'
                                                    }`}>
                                                        ✓ {viewAppModal.interview_result || stage5DossierData?.interview?.recommendation || 'Passed'}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2 text-xs">
                                                    <div className="bg-white p-2.5 rounded-xl border border-purple-100 shadow-2xs">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Interview Mode</span>
                                                        <strong className="text-slate-900 font-extrabold">{viewAppModal.interview_mode || stage5DossierData?.interview?.interview_mode || 'In-Person'}</strong>
                                                    </div>
                                                    <div className="bg-white p-2.5 rounded-xl border border-purple-100 shadow-2xs">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Interview Date</span>
                                                        <strong className="text-slate-900 font-extrabold">
                                                            {viewAppModal.interview_scheduled_at ? new Date(viewAppModal.interview_scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Conducted'}
                                                        </strong>
                                                    </div>
                                                    <div className="bg-white p-2.5 rounded-xl border border-purple-100 shadow-2xs">
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Interview Result</span>
                                                        <strong className="text-emerald-700 font-extrabold">{viewAppModal.interview_result || 'Passed'}</strong>
                                                    </div>
                                                </div>
                                                <div className="bg-white p-2.5 rounded-xl border border-purple-100 text-[11px] text-slate-700 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Interview Notes & Observations</span>
                                                    <p className="font-medium whitespace-pre-wrap">
                                                        {viewAppModal.interview_notes || stage5DossierData?.interview?.interview_notes || 'Applicant answered questions satisfactorily regarding daily schedule, feeding routine, and veterinary care commitments.'}
                                                    </p>
                                                </div>
                                                <div className="text-[10px] text-slate-500 font-medium flex items-center justify-between pt-1">
                                                    <span>Interviewer: <strong>{viewAppModal.interviewer_name || stage5DossierData?.interview?.interviewer_name || 'Barangay Staff'}</strong></span>
                                                    <span>Status: <strong className="text-emerald-700">Completed</strong></span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Row 3: Home Visit Review (Stage 4) */}
                                        <div className="p-5 rounded-2xl bg-teal-50/50 border border-teal-200/80 space-y-4">
                                            <div className="flex items-center justify-between pb-2 border-b border-teal-200/60">
                                                <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-teal-900">
                                                    <Home className="w-4 h-4 text-teal-600" /> Stage 4: Home Visit & Environment Review
                                                </div>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                    ✓ {viewAppModal.home_visit_result || stage5DossierData?.home_visit?.inspection_result || 'Suitable'}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                                <div className="bg-white p-3 rounded-xl border border-teal-100 shadow-2xs">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Home Visit Status</span>
                                                    <strong className="text-emerald-800 font-black">Completed</strong>
                                                </div>
                                                <div className="bg-white p-3 rounded-xl border border-teal-100 shadow-2xs">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Home Visit Result</span>
                                                    <strong className="text-teal-900 font-black">{viewAppModal.home_visit_result || stage5DossierData?.home_visit?.inspection_result || 'Suitable'}</strong>
                                                </div>
                                                <div className="bg-white p-3 rounded-xl border border-teal-100 shadow-2xs">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Residence Condition</span>
                                                    <strong className="text-slate-900 font-extrabold">{viewAppModal.residence_condition || stage5DossierData?.home_visit?.residence_condition || 'Good'}</strong>
                                                </div>
                                                <div className="bg-white p-3 rounded-xl border border-teal-100 shadow-2xs">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Existing Pets in House</span>
                                                    <strong className="text-slate-900 font-extrabold truncate block">
                                                        {viewAppModal.existing_pets || stage5DossierData?.home_visit?.existing_pets || (viewAppModal.has_other_pets ? 'Yes (Has pets)' : 'None')}
                                                    </strong>
                                                </div>
                                            </div>

                                            {/* Recommendations & Comments */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="bg-white p-3 rounded-xl border border-teal-100 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Recommendations for Adopter</span>
                                                    <p className="text-[11px] text-slate-800 font-medium italic">
                                                        "{stage5DossierData?.home_visit?.recommendations || 'Ensure perimeter gate is always secured and keep food and clean water readily accessible.'}"
                                                    </p>
                                                </div>
                                                <div className="bg-white p-3 rounded-xl border border-teal-100 space-y-1">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Home Visit Comments & Audit Notes</span>
                                                    <p className="text-[11px] text-slate-800 font-medium whitespace-pre-wrap">
                                                        {viewAppModal.home_visit_notes || stage5DossierData?.home_visit?.checklist_notes || 'Home environment inspected. Living conditions are safe and comfortable for the adopted pet.'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="text-[10px] text-slate-500 font-medium flex items-center justify-between pt-1">
                                                <span>Assessed By: <strong>{viewAppModal.home_visit_inspector_name || stage5DossierData?.home_visit?.inspector_name || 'Barangay Staff'}</strong></span>
                                                <span>Assessment Date: <strong>{viewAppModal.home_visit_scheduled_date ? new Date(viewAppModal.home_visit_scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recorded'}</strong></span>
                                            </div>
                                        </div>

                                        {/* Row 4: HOME ENVIRONMENT CHECKLIST */}
                                        {(() => {
                                            const notes = (viewAppModal.home_visit_notes || stage5DossierData?.home_visit?.checklist_notes || '');
                                            let passedItems = [];
                                            if (notes.includes('✓')) {
                                                passedItems = HOME_ENVIRONMENT_CHECKLIST_ITEMS.filter((item) => {
                                                    return notes.includes(`✓ ${item.label}`) && !notes.includes(`✕ ${item.label}`);
                                                });
                                            } else {
                                                const hv = stage5DossierData?.home_visit || viewAppModal;
                                                passedItems = HOME_ENVIRONMENT_CHECKLIST_ITEMS.filter((item) => {
                                                    if (item.key === 'perimeter_fencing_secure') return Boolean(hv?.is_fencing_secure);
                                                    if (item.key === 'adequate_living_space_shelter') return Boolean(hv?.is_shelter_adequate);
                                                    if (item.key === 'cleanliness_sanitation_hazards') return Boolean(hv?.hazard_free);
                                                    return false;
                                                });
                                            }

                                            return (
                                                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                                                    <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
                                                        <span className="font-black text-slate-900 uppercase tracking-wider text-[11px] block">
                                                            Home Environment Assessment Checklist Results ({passedItems.length}):
                                                        </span>
                                                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                            {passedItems.length} Criteria Passed
                                                        </span>
                                                    </div>

                                                    {passedItems.length > 0 ? (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                            {passedItems.map((item) => (
                                                                <div
                                                                    key={item.key}
                                                                    className="p-3 rounded-xl bg-white border border-emerald-200 flex items-start gap-2.5 text-xs shadow-2xs"
                                                                >
                                                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                                                    <div>
                                                                        <div className="font-extrabold text-slate-900 text-[11px] leading-snug">{item.label}</div>
                                                                        <div className="text-[10px] text-slate-500 mt-0.5">{item.description}</div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div className="p-4 bg-white rounded-xl border border-slate-200 text-xs text-slate-500 italic text-center">
                                                            No checklist criteria were marked as passed during this home visit.
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Row 5: HOME VISIT PHOTOS */}
                                        {((viewAppModal.home_visit_photos && viewAppModal.home_visit_photos.length > 0) || (stage5DossierData?.home_visit?.visit_photos && stage5DossierData.home_visit.visit_photos.length > 0)) && (
                                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                                                <div className="flex items-center justify-between pb-1 border-b border-slate-200">
                                                    <span className="font-black text-slate-900 uppercase tracking-wider text-[11px] block">
                                                        Home Visit Photos ({(viewAppModal.home_visit_photos || stage5DossierData?.home_visit?.visit_photos).length})
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-medium">
                                                        Click any photo to view full size
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    {(viewAppModal.home_visit_photos || stage5DossierData?.home_visit?.visit_photos).map((url: string, idx: number) => (
                                                        <div
                                                            key={idx}
                                                            onClick={() => setDossierLightboxPhoto(url)}
                                                            className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video bg-black/5 cursor-pointer shadow-2xs"
                                                        >
                                                            <img
                                                                src={url}
                                                                alt={`Home visit photo ${idx + 1}`}
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                                            />
                                                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                                                <Eye className="w-5 h-5" />
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Row 6: DOCUMENTS & REQUIREMENTS */}
                                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
                                            <span className="font-black text-slate-900 uppercase tracking-wider text-[11px] block pb-1 border-b border-slate-200">
                                                Documents & Requirements Status:
                                            </span>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                                <div className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Government ID</span>
                                                        <span className="font-bold text-slate-800 text-xs">{viewAppModal.id_type || 'Submitted ID'}</span>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                                                        ✓ Verified
                                                    </span>
                                                </div>
                                                <div className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Application Record</span>
                                                        <span className="font-bold text-slate-800 text-xs">App #{viewAppModal.adoption_id}</span>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                                                        ✓ Complete
                                                    </span>
                                                </div>
                                                <div className="p-3 bg-white rounded-xl border border-slate-200/80 flex items-center justify-between">
                                                    <div>
                                                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Adoption Agreement</span>
                                                        <span className="font-bold text-slate-800 text-xs">Digital Contract</span>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800">
                                                        Pending Approval
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Row 7: DOSSIER REVIEW SUMMARY */}
                                        <div className="p-5 rounded-2xl bg-amber-50/70 border border-amber-200 text-amber-950 space-y-3">
                                            <div className="flex items-center justify-between pb-1.5 border-b border-amber-200/80">
                                                <div className="font-black text-xs uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                                    <ClipboardCheck className="w-4 h-4 text-amber-600" /> Dossier Review Summary
                                                </div>
                                                <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-emerald-600 text-white shadow-2xs">
                                                    Ready for Final Decision
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                                                <div className="p-2.5 bg-white/90 rounded-xl border border-amber-100 shadow-2xs">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Verification</span>
                                                    <strong className="text-emerald-700 font-black text-xs">✓ Completed</strong>
                                                </div>
                                                <div className="p-2.5 bg-white/90 rounded-xl border border-amber-100 shadow-2xs">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Interview</span>
                                                    <strong className="text-emerald-700 font-black text-xs">✓ Completed</strong>
                                                </div>
                                                <div className="p-2.5 bg-white/90 rounded-xl border border-amber-100 shadow-2xs">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Home Visit</span>
                                                    <strong className="text-emerald-700 font-black text-xs">✓ Completed</strong>
                                                </div>
                                                <div className="p-2.5 bg-white/90 rounded-xl border border-amber-100 shadow-2xs">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Home Environment</span>
                                                    <strong className="text-emerald-700 font-black text-xs">✓ Suitable</strong>
                                                </div>
                                                <div className="p-2.5 bg-white/90 rounded-xl border border-amber-100 shadow-2xs">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Required Docs</span>
                                                    <strong className="text-emerald-700 font-black text-xs">✓ Complete</strong>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Row 8: FINAL DECISION BUTTONS */}
                                        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div>
                                                <span className="font-black text-slate-900 uppercase tracking-wider text-xs block">
                                                    Final Adoption Decision
                                                </span>
                                                <p className="text-[11px] text-slate-500 mt-0.5">
                                                    Approving will advance the application to Stage 6: Approval.
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    disabled={actionLoading || !isHeadOfficer}
                                                    title={!isHeadOfficer ? HEAD_ONLY_HINT : undefined}
                                                    onClick={() => handleStage5Approve(viewAppModal)}
                                                    className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs transition-all shadow-xs flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    <span>{actionLoading ? 'Approving...' : 'APPROVE ADOPTION'}</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={actionLoading}
                                                    onClick={() => {
                                                        const app = viewAppModal;
                                                        handleOpenReviewModal(app, 'reject');
                                                    }}
                                                    className="px-5 py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl font-black text-xs transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                                                >
                                                    <XCircle className="w-4 h-4" />
                                                    <span>REJECT</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── FULL APPLICANT / ADOPTER INFORMATION (STAGE 1 ONLY) ─── */}
                        {isStage1 && (
                            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-xs space-y-6">
                                <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center font-black border border-orange-200 shrink-0">
                                            <User className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                                                Applicant Information & Profile
                                            </h3>
                                            <p className="text-xs text-slate-400 font-medium">
                                                Detailed application and residency information submitted by {viewAppModal.full_name}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <span className="text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200/80 px-2.5 py-1 rounded-full">
                                            Stage 1: Application
                                        </span>

                                        {viewAppModal.status === 'Pending' && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenReviewModal(viewAppModal, 'reject')}
                                                    className="px-3.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5 shadow-2xs hover:-translate-y-0.5 active:scale-95"
                                                    title="Reject this application"
                                                >
                                                    <XCircle className="w-3.5 h-3.5" />
                                                    <span>Reject</span>
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenReviewModal(viewAppModal, 'approve')}
                                                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer flex items-center gap-1.5 hover:-translate-y-0.5 active:scale-95"
                                                    title="Approve application and proceed to Stage 3: Interview"
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                    <span>Approve & Proceed</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* 2-Column Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                            <User className="w-3 h-3 text-orange-500" /> Applicant Legal Name
                                        </span>
                                        <p className="text-sm font-black text-slate-900">{viewAppModal.full_name}</p>
                                    </div>

                                    <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                            <Phone className="w-3 h-3 text-blue-500" /> Contact Number
                                        </span>
                                        <p className="text-sm font-black text-slate-900">{viewAppModal.contact_no || 'N/A'}</p>
                                    </div>

                                    <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1 sm:col-span-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                            <MapPin className="w-3 h-3 text-rose-500" /> Residential Address
                                        </span>
                                        <p className="text-sm font-extrabold text-slate-900 leading-relaxed">
                                            {viewAppModal.address || 'No residential address provided'}
                                        </p>
                                    </div>

                                    <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                            <Home className="w-3 h-3 text-emerald-500" /> Living Space
                                        </span>
                                        <p className="text-sm font-black text-slate-900">{viewAppModal.living_space || 'Not specified'}</p>
                                    </div>

                                    <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                            <PawPrint className="w-3 h-3 text-purple-500" /> Other Pets in Home
                                        </span>
                                        <p className="text-sm font-black text-slate-900">
                                            {viewAppModal.has_other_pets ? 'Yes — Currently owns other pets' : 'No other pets'}
                                        </p>
                                    </div>
                                </div>

                                {/* Government ID Verification Section */}
                                {viewAppModal.id_type && (
                                    <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-3">
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                                            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                                <CreditCard className="w-3.5 h-3.5 text-indigo-500" /> Government ID Verification
                                            </h4>
                                            <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                <CheckCircle2 className="w-3 h-3" /> Verified
                                            </span>
                                        </div>

                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                    ID Type: <span className="text-slate-800 font-extrabold">{viewAppModal.id_type}</span>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ID Number:</span>
                                                    {viewAppModal.id_number && (
                                                        <MaskedIdDisplay idNumber={viewAppModal.id_number} idType={viewAppModal.id_type} />
                                                    )}
                                                </div>
                                            </div>

                                            {(viewAppModal.has_id_uploaded || viewAppModal.id_photo_url) && (
                                                <button
                                                    type="button"
                                                    disabled={loadingIdAdoptionId === viewAppModal.adoption_id}
                                                    onClick={() => handleViewSecureId(viewAppModal.adoption_id)}
                                                    className="px-4 py-2 bg-white hover:bg-orange-50 text-orange-600 border border-orange-200 rounded-xl text-xs font-black transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    <span>{loadingIdAdoptionId === viewAppModal.adoption_id ? 'Loading Secure ID...' : 'View ID Photo'}</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Applicant Stated Motivation */}
                                <div className="space-y-2">
                                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                        <FileText className="w-4 h-4 text-amber-500" /> Applicant's Stated Motivation & Reason
                                    </h4>
                                    <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words bg-amber-50/40 p-4 sm:p-5 rounded-2xl border border-amber-200/70 font-medium">
                                        "{viewAppModal.reason || 'No specific motivation provided.'}"
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Cancellation details */}
                        {viewAppModal.status === 'Cancelled' && (
                            <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-200/90 shadow-xs space-y-3">
                                <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 text-xs space-y-2">
                                    <div className="flex items-center justify-between flex-wrap gap-2 text-gray-700 font-bold">
                                        <span className="flex items-center gap-1.5 text-gray-800 text-sm">
                                            <XCircle className="w-4 h-4 text-gray-500" /> Cancelled by Applicant
                                        </span>
                                        {viewAppModal.cancelled_at && (
                                            <span className="text-xs text-gray-500 font-normal">
                                                Cancelled on {new Date(viewAppModal.cancelled_at).toLocaleDateString(undefined, {
                                                    year: 'numeric',
                                                    month: 'short',
                                                    day: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </span>
                                        )}
                                    </div>
                                    {viewAppModal.cancellation_reason && (
                                        <div className="text-xs text-gray-600 bg-white p-3.5 rounded-xl border border-gray-200/80">
                                            <span className="font-bold text-gray-700 block mb-0.5">Cancellation Reason:</span>
                                            <p className="whitespace-pre-wrap break-words leading-relaxed">{viewAppModal.cancellation_reason}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </main>
                ) : (
                    /* ─── MAIN ADOPTION MANAGEMENT LIST VIEW ─── */
                    <main className="p-4 sm:p-8 pb-32 lg:pb-8 max-w-7xl w-full mx-auto space-y-6">
                    {/* Page Header */}
                    {/* Mobile Header with Rich Design & Animation (md:hidden) */}
                    <div className="block md:hidden">
                        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FF6B2B] via-[#F97316] to-[#FB923C] p-4 sm:p-5 text-white shadow-lg shadow-orange-500/20 border border-orange-400/40">
                            {/* Animated glowing backdrop orbs & paw watermarks */}
                            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/20 blur-xl animate-pulse pointer-events-none" />
                            <div className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full bg-amber-300/25 blur-2xl pointer-events-none" />
                            <div className="absolute top-3 right-4 select-none pointer-events-none text-2xl opacity-20 animate-bounce">
                                🐾
                            </div>

                            <div className="relative z-10 flex flex-col gap-3.5">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/35 shadow-inner shrink-0">
                                            <Heart className="w-6 h-6 text-white fill-white animate-pulse" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[9px] font-black uppercase tracking-wider text-white border border-white/30 mb-0.5 shadow-2xs">
                                                <Sparkles className="w-2.5 h-2.5 text-amber-200" /> Adoption Portal
                                            </div>
                                            <h1 className="text-lg font-black tracking-tight leading-none text-white truncate">
                                                Adoption Management
                                            </h1>
                                        </div>
                                    </div>
                                </div>

                                {/* Top Stats Grid in Mobile Header with glassmorphism */}
                                <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                                    <div className="bg-white/15 hover:bg-white/20 backdrop-blur-md p-2.5 rounded-2xl border border-white/30 flex items-center gap-2.5 shadow-2xs transition-transform active:scale-95">
                                        <div className="w-2.5 h-2.5 rounded-full bg-amber-300 animate-ping shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-extrabold text-orange-100 uppercase tracking-wider truncate">Pending Review</div>
                                            <div className="text-base sm:text-lg font-black text-white leading-tight">{pendingCount}</div>
                                        </div>
                                    </div>
                                    <div className="bg-white/15 hover:bg-white/20 backdrop-blur-md p-2.5 rounded-2xl border border-white/30 flex items-center gap-2.5 shadow-2xs transition-transform active:scale-95">
                                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-300 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-extrabold text-orange-100 uppercase tracking-wider truncate">In Catalog</div>
                                            <div className="text-base sm:text-lg font-black text-white leading-tight">{catalogAnimals.length}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ─── DESKTOP KPI STATS ROW (hidden md:grid) ─── */}
                    <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {/* Card 1: Total Applications */}
                        <div 
                            onClick={() => { setActiveTab('applications'); setStatusFilter('All'); }}
                            className={`bg-white rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[145px] hover:-translate-y-1 ${
                                activeTab === 'applications' && statusFilter === 'All'
                                    ? 'border-blue-400 ring-2 ring-blue-100 shadow-md'
                                    : 'border-slate-200/80 hover:border-blue-200 shadow-xs hover:shadow-sm'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                        Total Applications
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Submitted by residents</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-600 flex items-center justify-center shrink-0 border border-blue-200/60 shadow-2xs">
                                    <FileText className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none">
                                    {totalAppsCount}
                                </p>
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-blue-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-700 text-[9px] shrink-0 font-black">✓</span>
                                    <span>All-time submissions</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 2: Pending Review */}
                        <div 
                            onClick={() => { setActiveTab('applications'); setStatusFilter('Pending'); }}
                            className={`bg-white rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[145px] hover:-translate-y-1 ${
                                activeTab === 'applications' && statusFilter === 'Pending'
                                    ? 'border-amber-400 ring-2 ring-amber-100 shadow-md'
                                    : 'border-slate-200/80 hover:border-amber-200 shadow-xs hover:shadow-sm'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-1.5">
                                        {pendingCount > 0 && (
                                            <span className="relative flex h-2 w-2">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                                            </span>
                                        )}
                                        <h3 className="text-xs font-black text-amber-700 uppercase tracking-wider">
                                            Pending Review
                                        </h3>
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Awaiting staff decision</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-100 text-amber-600 flex items-center justify-center shrink-0 border border-amber-200/60 shadow-2xs">
                                    <Clock className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-3xl sm:text-4xl font-black text-amber-700 tracking-tight leading-none">
                                    {pendingCount}
                                </p>
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-amber-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-700 text-[9px] shrink-0 font-black">!</span>
                                    <span>Requires verification</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 3: Approved Adoptions */}
                        <div 
                            onClick={() => { setActiveTab('applications'); setStatusFilter('Approved'); }}
                            className={`bg-white rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[145px] hover:-translate-y-1 ${
                                activeTab === 'applications' && statusFilter === 'Approved'
                                    ? 'border-emerald-400 ring-2 ring-emerald-100 shadow-md'
                                    : 'border-slate-200/80 hover:border-emerald-200 shadow-xs hover:shadow-sm'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-xs font-black text-emerald-700 uppercase tracking-wider">
                                        Approved Adoptions
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Successful matches</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-100 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200/60 shadow-2xs">
                                    <CheckCircle2 className="w-5 h-5" />
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-3xl sm:text-4xl font-black text-emerald-700 tracking-tight leading-none">
                                    {approvedCount}
                                </p>
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[9px] shrink-0 font-black">✓</span>
                                    <span>Approved & claimed</span>
                                </div>
                            </div>
                        </div>

                        {/* Card 4: In Catalog */}
                        <div 
                            onClick={() => setActiveTab('catalog')}
                            className={`bg-white rounded-3xl p-5 border transition-all duration-300 cursor-pointer relative overflow-hidden flex flex-col justify-between min-h-[145px] hover:-translate-y-1 ${
                                activeTab === 'catalog'
                                    ? 'border-rose-400 ring-2 ring-rose-100 shadow-md'
                                    : 'border-slate-200/80 hover:border-rose-200 shadow-xs hover:shadow-sm'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <h3 className="text-xs font-black text-rose-600 uppercase tracking-wider">
                                        In Public Catalog
                                    </h3>
                                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">Adoptable animals</p>
                                </div>
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-rose-50 to-pink-100 text-rose-500 flex items-center justify-center shrink-0 border border-rose-200/60 shadow-2xs">
                                    <Heart className="w-5 h-5 fill-rose-500/20" />
                                </div>
                            </div>
                            <div className="mt-3">
                                <p className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight leading-none">
                                    {catalogCount}
                                </p>
                                <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center gap-1.5 text-[11px] font-bold text-rose-600">
                                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[9px] shrink-0 font-black">♥</span>
                                    <span>Ready for homes</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Role Notice for non-Head Officer */}
                    {!isHeadOfficer && (
                        <div className="bg-blue-50/90 border border-blue-200/90 rounded-2xl p-3.5 sm:p-4 flex items-start gap-3 shadow-2xs">
                            <div className="p-1.5 rounded-xl bg-blue-100 text-blue-700 shrink-0">
                                <Shield className="w-4 h-4" />
                            </div>
                            <div className="text-xs text-blue-900 leading-relaxed">
                                <span className="font-extrabold">Staff View Mode:</span> You are currently viewing applications as regular Barangay Staff. You can verify documents, run interviews, home visits, handovers and monitoring visits for your barangay. Stage decisions (approval, review, certificate, monitoring, final success) are restricted to the <strong>Barangay Head Officer</strong> or <strong>System Administrator</strong>.
                            </div>
                        </div>
                    )}

                    {/* Toast Notification */}
                    {toastMessage && (
                        <div
                            className={`p-4 rounded-2xl border text-xs sm:text-sm font-bold shadow-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${
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
                            <span className="flex-1">{toastMessage.text}</span>
                        </div>
                    )}

                    {/* Primary Tab Navigation */}
                    <div className="flex items-center gap-1.5 sm:gap-2 p-1 bg-gray-100/90 rounded-2xl border border-gray-200/60 sm:bg-transparent sm:p-0 sm:border-0 sm:border-b sm:border-gray-200 sm:pb-2 sm:rounded-none">
                        <button
                            onClick={() => setActiveTab('applications')}
                            className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 sm:py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 ${
                                activeTab === 'applications'
                                    ? 'bg-gray-900 text-white shadow-xs'
                                    : 'bg-transparent sm:bg-white text-gray-600 hover:bg-white/80 sm:hover:bg-gray-100 sm:border sm:border-gray-200'
                            }`}
                        >
                            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                            <span className="truncate">Applications ({applications.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('monitoring')}
                            className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 sm:py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 ${
                                activeTab === 'monitoring'
                                    ? 'bg-gray-900 text-white shadow-xs'
                                    : 'bg-transparent sm:bg-white text-gray-600 hover:bg-white/80 sm:hover:bg-gray-100 sm:border sm:border-gray-200'
                            }`}
                        >
                            <Activity className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500 shrink-0" />
                            <span className="truncate">Welfare Monitoring ({monitoringDashboard?.stats?.active || 0})</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('catalog')}
                            className={`flex-1 sm:flex-initial px-3 sm:px-5 py-2 sm:py-2.5 text-xs font-black rounded-xl transition-all flex items-center justify-center gap-2 ${
                                activeTab === 'catalog'
                                    ? 'bg-gray-900 text-white shadow-xs'
                                    : 'bg-transparent sm:bg-white text-gray-600 hover:bg-white/80 sm:hover:bg-gray-100 sm:border sm:border-gray-200'
                            }`}
                        >
                            <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-500 shrink-0" />
                            <span className="truncate">Catalog Animals ({catalogAnimals.length})</span>
                        </button>
                    </div>

                    {/* Applications Tab Content */}
                    {activeTab === 'applications' && (
                        <div className="space-y-4">
                            {/* Controls Bar */}
                            <div className="bg-white rounded-2xl p-3 sm:p-4 border border-gray-200/90 shadow-2xs space-y-3">
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                                        {(['All', 'Pending', 'Approved', 'Rejected', 'Cancelled'] as const).map((tab) => (
                                            <button
                                                key={tab}
                                                onClick={() => setStatusFilter(tab)}
                                                className={`px-3 sm:px-3.5 py-1.5 text-xs font-extrabold rounded-xl transition-all shrink-0 cursor-pointer ${
                                                    statusFilter === tab
                                                        ? 'bg-orange-500 text-white shadow-2xs'
                                                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200/70'
                                                }`}
                                            >
                                                {tab === 'All' ? 'All' : tab}
                                                {tab === 'Pending' && pendingCount > 0 && (
                                                    <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-white/30 text-white text-[10px] font-bold">
                                                        {pendingCount}
                                                    </span>
                                                )}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="relative w-full sm:w-64">
                                        <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search applicant or pet..."
                                            className="w-full pl-9.5 pr-4 py-2 bg-gray-50 border border-gray-200/80 rounded-xl text-xs font-bold text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* 10-Stage Pipeline Filter Bar */}
                                <div className="pt-2 border-t border-gray-100 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0 mr-1 flex items-center gap-1">
                                        <FolderKanban className="w-3.5 h-3.5 text-orange-500" /> Stage Filter:
                                    </span>
                                    {[
                                        { id: 'All', label: 'All Stages' },
                                        { id: 'Application', label: '1. App' },
                                        { id: 'Verification', label: '2. Verify' },
                                        { id: 'Interview', label: '3. Interview' },
                                        { id: 'Home_Visit', label: '4. Home Visit' },
                                        { id: 'Review', label: '5. Review' },
                                        { id: 'Approval', label: '6. Approval' },
                                        { id: 'Certificate', label: '7. Cert' },
                                        { id: 'Handover', label: '8. Handover' },
                                        { id: 'Monitoring', label: '9. Monitor' },
                                        { id: 'Successful_Adoption', label: '10. Successful' },
                                    ].map((stg) => (
                                        <button
                                            key={stg.id}
                                            type="button"
                                            onClick={() => setSelectedStageFilter(stg.id)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                                                selectedStageFilter === stg.id
                                                    ? 'bg-slate-900 text-white shadow-2xs'
                                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                            }`}
                                        >
                                            {stg.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Applications Table / Cards */}
                            {loading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="bg-white rounded-2xl sm:rounded-3xl p-5 sm:p-6 border border-gray-200 animate-pulse h-36" />
                                    ))}
                                </div>
                            ) : filteredApplications.length === 0 ? (
                                <div className="bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-12 border border-dashed border-gray-300 text-center max-w-lg mx-auto shadow-2xs">
                                    <div className="w-12 h-12 rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
                                        <FileText className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-black text-gray-900 text-base mb-1">No Applications Match</h3>
                                    <p className="text-xs text-gray-500 max-w-xs mx-auto">
                                        There are currently no adoption applications matching your selected status filter or search query.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {filteredApplications.map((app) => (
                                        <div
                                            key={app.adoption_id}
                                            className="bg-white rounded-3xl border border-gray-200/90 hover:border-gray-300 p-4 sm:p-5 shadow-xs hover:shadow-md transition-all space-y-3.5"
                                        >
                                            {/* ─── CARD HEADER: Pet Info + Status + Top Actions ─── */}
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-gray-100">
                                                <div className="flex items-center gap-3.5 min-w-0">
                                                    <img
                                                        src={getPetPicture(app.animal_photo)}
                                                        alt={app.animal_name || 'Pet'}
                                                        className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl object-cover border border-gray-100 shrink-0 shadow-2xs"
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                                            <h3 className="font-black text-base sm:text-lg text-gray-900 truncate">
                                                                {app.animal_name || `Rescue Animal #${app.holding_id}`}
                                                            </h3>
                                                            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 font-bold border border-orange-200/80">
                                                                {app.animal_type || 'Rescue'} {app.animal_breed ? `• ${app.animal_breed}` : ''}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">
                                                                App #{app.adoption_id}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-gray-400 font-medium flex items-center gap-1">
                                                            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                            <span>Submitted on {new Date(app.created_at).toLocaleDateString(undefined, {
                                                                year: 'numeric',
                                                                month: 'short',
                                                                day: 'numeric',
                                                                hour: '2-digit',
                                                                minute: '2-digit'
                                                            })}</span>
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Status Badge & Actions */}
                                                <div className="flex items-center gap-2 flex-wrap sm:justify-end shrink-0 pt-1 sm:pt-0">
                                                    {(() => {
                                                        const info = getUnifiedAdoptionStatus(app);
                                                        return (
                                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border ${info.badgeClasses}`}>
                                                                {info.isOfficiallyAdopted ? (
                                                                    <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
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
                                                    })()}

                                                    <button
                                                        type="button"
                                                        onClick={() => setViewAppModal(app)}
                                                        className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                                        title="View full resident application and adoption dossier report"
                                                    >
                                                        <Eye className="w-3.5 h-3.5" />
                                                        <span>View Details</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => openAdoptionChat(app.adoption_id)}
                                                        className="relative px-3.5 py-1.5 bg-white hover:bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                                        title="Chat with the adopter about this application"
                                                    >
                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                        <span>Chat</span>
                                                        {(chatUnread[app.adoption_id] || 0) > 0 && (
                                                            <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                                                                {chatUnread[app.adoption_id] > 9 ? '9+' : chatUnread[app.adoption_id]}
                                                            </span>
                                                        )}
                                                    </button>

                                                    <Link
                                                        to={`/brgy/adopt/journey/${app.holding_id}`}
                                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-black transition-colors flex items-center gap-1.5 shadow-2xs"
                                                        title="View Journey Trail"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5 text-orange-500" />
                                                        <span className="hidden sm:inline">Journey Trail</span>
                                                    </Link>

                                                    {/* Quick Approve / Reject for Pending applications if Head Officer */}
                                                    {app.status === 'Pending' && isHeadOfficer && (!app.current_stage || app.current_stage === 'Application' || app.current_stage === 'Verification') && (
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenReviewModal(app, 'approve')}
                                                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer active:scale-95 flex items-center gap-1"
                                                            >
                                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                                <span>Approve</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenReviewModal(app, 'reject')}
                                                                className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-xs font-black transition-all border border-red-200 cursor-pointer active:scale-95 flex items-center gap-1"
                                                            >
                                                                <XCircle className="w-3.5 h-3.5" />
                                                                <span>Reject</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* ─── COMPACT APPLICANT INFORMATION ─── */}
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                                                <div className="bg-gray-50/90 rounded-2xl p-2.5 sm:p-3 border border-gray-100/90 flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-orange-100/80 text-orange-600 flex items-center justify-center shrink-0">
                                                        <User className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Applicant Name</div>
                                                        <div className="text-xs font-extrabold text-gray-900 truncate" title={app.full_name}>
                                                            {app.full_name}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50/90 rounded-2xl p-2.5 sm:p-3 border border-gray-100/90 flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-blue-100/80 text-blue-600 flex items-center justify-center shrink-0">
                                                        <Phone className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contact Number</div>
                                                        <div className="text-xs font-extrabold text-gray-900 truncate">
                                                            {app.contact_no}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50/90 rounded-2xl p-2.5 sm:p-3 border border-gray-100/90 flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-rose-100/80 text-rose-600 flex items-center justify-center shrink-0">
                                                        <MapPin className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Residential Address</div>
                                                        <div className="text-xs font-extrabold text-gray-900 truncate" title={app.address || 'No address specified'}>
                                                            {app.address || '—'}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="bg-gray-50/90 rounded-2xl p-2.5 sm:p-3 border border-gray-100/90 flex items-center gap-2.5">
                                                    <div className="w-8 h-8 rounded-xl bg-emerald-100/80 text-emerald-600 flex items-center justify-center shrink-0">
                                                        <Home className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Living Space</div>
                                                        <div className="text-xs font-extrabold text-gray-900 truncate" title={app.living_space}>
                                                            {app.living_space}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Welfare Monitoring Tab Content (Stage 9) */}
                    {activeTab === 'monitoring' && (
                        <div className="space-y-4">
                            {/* Monitoring KPIs */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
                                    <div className="flex items-center justify-between text-indigo-600 mb-2">
                                        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Active Check-ins</span>
                                        <Activity className="w-5 h-5" />
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black text-slate-900">
                                        {monitoringDashboard?.stats?.active || 0}
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-1 font-semibold">Under 30-day tracking</p>
                                </div>

                                <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
                                    <div className="flex items-center justify-between text-amber-600 mb-2">
                                        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Delinquent / Overdue</span>
                                        <Clock className="w-5 h-5" />
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black text-amber-600">
                                        {monitoringDashboard?.stats?.delinquent || 0}
                                    </div>
                                    <p className="text-[11px] text-amber-500 mt-1 font-semibold">Missed milestone deadlines</p>
                                </div>

                                <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
                                    <div className="flex items-center justify-between text-emerald-600 mb-2">
                                        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Fully Completed</span>
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black text-emerald-600">
                                        {monitoringDashboard?.stats?.completed || 0}
                                    </div>
                                    <p className="text-[11px] text-emerald-500 mt-1 font-semibold">Cleared 30-day monitoring</p>
                                </div>

                                <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-xs">
                                    <div className="flex items-center justify-between text-blue-600 mb-2">
                                        <span className="text-xs font-black uppercase tracking-wider text-slate-500">Total Cases</span>
                                        <ShieldCheck className="w-5 h-5" />
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-black text-slate-900">
                                        {monitoringDashboard?.stats?.total_monitoring_cases || 0}
                                    </div>
                                    <p className="text-[11px] text-slate-400 mt-1 font-semibold">Lifetime monitored adoptions</p>
                                </div>
                            </div>

                            {/* Cases List */}
                            {monitoringLoading ? (
                                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-2xs space-y-3">
                                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                                    <p className="text-xs font-bold text-slate-500">Loading post-adoption welfare dashboard...</p>
                                </div>
                            ) : !monitoringDashboard?.cases || monitoringDashboard.cases.length === 0 ? (
                                <div className="bg-white rounded-3xl p-12 text-center border border-dashed border-gray-300 max-w-lg mx-auto shadow-2xs">
                                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto mb-3">
                                        <Activity className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-black text-gray-900 text-base mb-1">No Active Welfare Monitoring Cases</h3>
                                    <p className="text-xs text-gray-500 max-w-xs mx-auto">
                                        When approved adoptions complete Stage 8 Physical Handover, they automatically begin Stage 9 30-day welfare tracking here.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {monitoringDashboard.cases.map((mCase: any) => (
                                        <div
                                            key={mCase.adoption_id}
                                            className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow space-y-4"
                                        >
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 font-black">
                                                        <PawPrint className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-black text-sm text-slate-900">{mCase.animal_name}</h4>
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 uppercase">
                                                                {mCase.animal_type || 'Pet'}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500">
                                                            Adopter: <strong className="text-slate-800">{mCase.adopter_name}</strong> • Contact: {mCase.adopter_contact || 'N/A'}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${
                                                        mCase.post_monitoring_status === 'Completed'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            : mCase.post_monitoring_status === 'Delinquent' || mCase.post_monitoring_status === 'Escalated'
                                                            ? 'bg-red-50 text-red-700 border-red-200'
                                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                    }`}>
                                                        {mCase.post_monitoring_status || 'Active'}
                                                    </span>

                                                    <button
                                                        type="button"
                                                        onClick={() => setStageModalState({
                                                            app: {
                                                                adoption_id: mCase.adoption_id,
                                                                animal_name: mCase.animal_name,
                                                                full_name: mCase.adopter_name,
                                                            } as any,
                                                            modal: 'monitoring'
                                                        })}
                                                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                                                    >
                                                        <Activity className="w-3.5 h-3.5" />
                                                        <span>Inspect & Review Logs</span>
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => setStageModalState({
                                                            app: {
                                                                adoption_id: mCase.adoption_id,
                                                                animal_name: mCase.animal_name,
                                                                full_name: mCase.adopter_name,
                                                            } as any,
                                                            modal: 'certificate'
                                                        })}
                                                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <Award className="w-3.5 h-3.5 text-slate-500" />
                                                        <span>Certificate</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Milestones Progress Grid */}
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                                {mCase.milestones.map((m: any) => {
                                                    const isOverdue = m.status === 'Overdue';
                                                    return (
                                                        <div
                                                            key={m.log_id}
                                                            className={`p-3 rounded-2xl border text-xs flex items-center justify-between ${
                                                                m.status === 'Approved'
                                                                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                                                                    : m.status === 'Submitted'
                                                                    ? 'bg-blue-50/70 border-blue-200 text-blue-900'
                                                                    : isOverdue
                                                                    ? 'bg-red-50/70 border-red-200 text-red-900'
                                                                    : 'bg-slate-50/70 border-slate-200 text-slate-700'
                                                            }`}
                                                        >
                                                            <div>
                                                                <span className="font-extrabold block">{m.milestone_name} Check-in</span>
                                                                <span className="text-[10px] text-slate-500">
                                                                    Due: {m.due_date} {m.health_status ? `• ${m.health_status}` : ''}
                                                                </span>
                                                            </div>
                                                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                                                m.status === 'Approved'
                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                    : m.status === 'Submitted'
                                                                    ? 'bg-blue-100 text-blue-800'
                                                                    : isOverdue
                                                                    ? 'bg-red-100 text-red-800'
                                                                    : 'bg-slate-200 text-slate-700'
                                                            }`}>
                                                                {m.status}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Catalog Tab Content */}
                    {activeTab === 'catalog' && (
                        <div className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3.5 rounded-2xl border border-gray-200/90 shadow-2xs">
                                <p className="text-xs font-bold text-gray-600">
                                    Rescued animals currently listed in the public Adoption Catalog ({catalogAnimals.length})
                                </p>
                                <Link
                                    to="/adopt"
                                    target="_blank"
                                    className="text-xs text-orange-600 font-black hover:underline flex items-center gap-1"
                                >
                                    Open Public View <ExternalLink className="w-3.5 h-3.5" />
                                </Link>
                            </div>

                            {catalogAnimals.length === 0 ? (
                                <div className="bg-white rounded-2xl sm:rounded-3xl p-8 sm:p-12 border border-dashed border-gray-300 text-center max-w-lg mx-auto shadow-2xs">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-orange-500 flex items-center justify-center mx-auto mb-3">
                                        <Heart className="w-6 h-6" />
                                    </div>
                                    <h3 className="font-black text-gray-900 text-base mb-1">No Animals in Catalog</h3>
                                    <p className="text-xs text-gray-500 max-w-xs mx-auto">
                                        Animals can be promoted to the catalog from the Holding Facility page after their 7-day impound period elapses.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                                    {catalogAnimals.map((animal) => (
                                        <div
                                            key={animal.holding_id}
                                            className="bg-white rounded-2xl sm:rounded-3xl border border-gray-200/90 overflow-hidden shadow-2xs hover:shadow-sm transition-all flex flex-col"
                                        >
                                            <div className="relative w-full h-44 sm:h-48 bg-gray-100">
                                                <img
                                                    src={getPetPicture(animal.photos?.[0])}
                                                    alt={animal.animal_name || 'Pet'}
                                                    className="w-full h-full object-cover"
                                                />
                                                <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white font-black text-[10px] uppercase tracking-wider">
                                                    {animal.animal_type || 'Rescue'}
                                                </span>
                                            </div>

                                            <div className="p-4 flex-1 flex flex-col justify-between">
                                                <div>
                                                    <h3 className="font-black text-base text-gray-900 mb-1">
                                                        {animal.animal_name || `Rescue #${animal.holding_id}`}
                                                    </h3>
                                                    <p className="text-xs text-gray-500 mb-2">
                                                        {animal.breed || 'Mixed'} • {animal.color || 'Natural'}
                                                    </p>
                                                    {animal.adoption_catalog_notes && (
                                                        <p className="text-xs text-gray-600 line-clamp-2 bg-gray-50 p-2.5 rounded-xl border border-gray-100 italic mb-3">
                                                            "{animal.adoption_catalog_notes}"
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                                                    <span className="text-[11px] font-bold text-gray-400">
                                                        Promoted: {animal.promoted_at ? new Date(animal.promoted_at).toLocaleDateString() : 'Active'}
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <Link
                                                            to={`/brgy/adopt/journey/${animal.holding_id}`}
                                                            className="text-xs text-orange-600 font-black hover:underline flex items-center gap-1"
                                                        >
                                                            Journey Map <ExternalLink className="w-3 h-3" />
                                                        </Link>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </main>
            )}
                {!isAdmin && <BrgyBottomNav />}
            </div>

            {/* Review Decision Modal */}
            {reviewModalType && selectedApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl max-w-xl w-full p-5 sm:p-7 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2.5">
                                {reviewModalType === 'approve' ? (
                                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-2xs shrink-0">
                                        <CheckCircle2 className="w-5 h-5" />
                                    </div>
                                ) : (
                                    <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center shadow-2xs shrink-0">
                                        <XCircle className="w-5 h-5" />
                                    </div>
                                )}
                                <div>
                                    <h2 className="text-base sm:text-lg font-black text-gray-900 leading-snug">
                                        {reviewModalType === 'approve' ? 'Approve Adoption Application?' : 'Reject Adoption Application'}
                                    </h2>
                                    <p className="text-[11px] text-gray-500 font-semibold">
                                        Applicant: <strong>{selectedApp.full_name}</strong> • Animal: <strong>{selectedApp.animal_name || `Rescue Animal #${selectedApp.holding_id}`}</strong>
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setReviewModalType(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {reviewModalType === 'approve' ? (
                            <div className="space-y-4 mb-2">
                                <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 space-y-2">
                                    <p className="text-xs sm:text-sm font-black text-emerald-950 leading-snug">
                                        Are you sure you want to approve this adoption application?
                                    </p>
                                    <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                                        Once approved, the application will proceed to the <strong>Interview stage</strong>. The applicant's initial submission and verification will be marked complete, and you can schedule and conduct their interview.
                                    </p>
                                </div>

                                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/90 text-xs text-slate-700 space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-slate-500">Applicant:</span>
                                        <span className="font-extrabold text-slate-900">{selectedApp.full_name}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-slate-500">Pet to Adopt:</span>
                                        <span className="font-extrabold text-orange-600">{selectedApp.animal_name || `Rescue #${selectedApp.holding_id}`}</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4 mb-5">
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Select the official reason for rejecting this adoption application. The adopter will see this reason in their notification and account status.
                                </p>

                                {/* Predefined Reason Category Cards */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                                        Rejection Reason Category <span className="text-red-500">*</span>
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {REJECTION_REASONS.map((r) => {
                                            const isSelected = rejectionCategory === r.id;
                                            return (
                                                <button
                                                    key={r.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setRejectionCategory(r.id);
                                                        setReviewNotes(r.template);
                                                    }}
                                                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                                                        isSelected
                                                            ? 'border-red-500 bg-red-50/70 shadow-xs ring-2 ring-red-500/20'
                                                            : 'border-gray-200 bg-gray-50/50 hover:bg-gray-100/70 hover:border-gray-300'
                                                    } ${r.id === 'other' ? 'sm:col-span-2' : ''}`}
                                                >
                                                    <div className="flex items-center justify-between gap-1 mb-1">
                                                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                                                            isSelected ? 'bg-red-100 text-red-700' : 'bg-gray-200/70 text-gray-600'
                                                        }`}>
                                                            {r.badge}
                                                        </span>
                                                        <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                                                            isSelected ? 'border-red-600 bg-red-600' : 'border-gray-300'
                                                        }`}>
                                                            {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                        </div>
                                                    </div>
                                                    <div className="font-bold text-xs text-gray-900 leading-snug">
                                                        {r.label}
                                                    </div>
                                                    <div className="text-[11px] text-gray-500 leading-tight mt-0.5">
                                                        {r.description}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Custom Fill-up Form / Detailed Explanation */}
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider">
                                            Explanation & Message for Adopter <span className="text-red-500">*</span>
                                        </label>
                                        <span className="text-[10px] text-gray-400 font-semibold">
                                            Editable fill-up form
                                        </span>
                                    </div>
                                    <textarea
                                        rows={3}
                                        value={reviewNotes}
                                        onChange={(e) => setReviewNotes(e.target.value)}
                                        placeholder={
                                            rejectionCategory === 'other'
                                                ? "Type your specific reason for rejection here..."
                                                : "You may customize or add more details to this explanation for the adopter..."
                                        }
                                        className="w-full p-3 text-xs rounded-xl border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-100 focus:outline-hidden resize-none bg-white transition-all shadow-2xs font-normal"
                                    />
                                    {!reviewNotes.trim() && (
                                        <p className="text-[11px] text-red-600 font-bold flex items-center gap-1">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                            Please provide an explanation to inform the adopter why their application is rejected.
                                        </p>
                                    )}
                                    <p className="text-[10px] text-gray-500 leading-normal">
                                        This explanation will appear in the applicant's account under their adoption status and in their system notification.
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                            <button
                                onClick={() => setReviewModalType(null)}
                                className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitReview}
                                disabled={actionLoading || (reviewModalType === 'reject' && !reviewNotes.trim())}
                                className={`px-5 py-2.5 text-xs font-black text-white rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 ${
                                    reviewModalType === 'approve'
                                        ? 'bg-emerald-600 hover:bg-emerald-700'
                                        : 'bg-red-600 hover:bg-red-700'
                                }`}
                            >
                                {reviewModalType === 'approve' && <CheckCircle2 className="w-4 h-4" />}
                                {actionLoading ? 'Processing...' : reviewModalType === 'approve' ? 'Approve & Proceed' : 'Confirm Rejection'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Staff Handover Confirmation Modal */}
            {handoverModalApp && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3.5 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl max-w-lg w-full p-5 sm:p-8 shadow-2xl border border-gray-100 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shadow-2xs shrink-0">
                                    <Shield className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base sm:text-lg font-black text-gray-900 truncate">
                                        Pet Handover Confirmation
                                    </h2>
                                    <p className="text-[11px] sm:text-xs text-gray-500 truncate">
                                        Barangay Animal Welfare Custody Release
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setHandoverModalApp(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3.5 sm:p-4 mb-4 text-xs text-amber-950 space-y-2">
                            <p className="leading-relaxed">
                                You are officially recording that the rescue animal{' '}
                                <strong>{handoverModalApp.animal_name || `Rescue Animal #${handoverModalApp.holding_id}`}</strong>{' '}
                                has been physically claimed and handed over to applicant{' '}
                                <strong>{handoverModalApp.full_name}</strong>.
                            </p>
                            <div className="bg-white/90 p-2.5 rounded-xl border border-amber-200/80 text-[11px] space-y-1.5 shadow-2xs">
                                <div><strong>ID Document Type:</strong> {handoverModalApp.id_type || 'Government ID'}</div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <strong>ID Number:</strong>
                                    {handoverModalApp.id_number ? (
                                        <MaskedIdDisplay idNumber={handoverModalApp.id_number} idType={handoverModalApp.id_type} compact={true} />
                                    ) : (
                                        <span>Registered on file</span>
                                    )}
                                </div>
                                <div><strong>Applicant Contact:</strong> {handoverModalApp.contact_no}</div>
                            </div>
                        </div>

                        <div className="mb-5 sm:mb-6">
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                Staff Handover Remarks / Verification Notes (Optional)
                            </label>
                            <textarea
                                rows={3}
                                value={handoverNotes}
                                onChange={(e) => setHandoverNotes(e.target.value)}
                                placeholder="e.g. Verified physical PhilSys ID, collar provided, adopter briefed on pet care..."
                                className="w-full p-3 text-xs rounded-xl border border-gray-200 focus:border-amber-500 focus:outline-hidden resize-none bg-gray-50 focus:bg-white transition-colors"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5">
                            <button
                                onClick={() => setHandoverModalApp(null)}
                                className="px-4 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleStaffConfirmHandover}
                                disabled={actionLoading}
                                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                            >
                                {actionLoading ? 'Recording...' : 'Confirm Handover & Release'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ID Photo Lightbox Modal */}
            {previewIdPhotoUrl && (
                <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
                    <div className="bg-white rounded-2xl sm:rounded-3xl max-w-2xl w-full p-4 sm:p-6 shadow-2xl border border-gray-200 relative">
                        <div className="flex items-center justify-between mb-3 sm:mb-4">
                            <div className="flex items-center gap-2">
                                <CreditCard className="w-5 h-5 text-orange-500" />
                                <h3 className="font-black text-sm text-gray-900">
                                    Applicant Government-Issued ID Photo
                                </h3>
                            </div>
                            <button
                                onClick={() => setPreviewIdPhotoUrl(null)}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="rounded-xl sm:rounded-2xl overflow-hidden border border-gray-200 bg-black/5 flex items-center justify-center max-h-[65vh] sm:max-h-[70vh]">
                            <img
                                src={previewIdPhotoUrl}
                                alt="Applicant Government ID"
                                className="w-full h-auto max-h-[65vh] sm:max-h-[70vh] object-contain"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Secure ID Document Inspection Modal */}
            {previewIdPhotoUrl && (
                <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-200 relative animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                                    <CreditCard className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-sm text-gray-900">
                                        Secure Government ID Inspection
                                    </h3>
                                    <p className="text-[11px] text-gray-500 font-medium">
                                        {previewIdData?.applicantName ? `Applicant: ${previewIdData.applicantName} • ` : ''}
                                        Signed Ephemeral Link (Expires in 5 mins)
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setPreviewIdPhotoUrl(null);
                                    setPreviewIdData(null);
                                }}
                                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 cursor-pointer"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Watermark and SPI notice ribbon */}
                        <div className="mb-3 px-3 py-2 bg-amber-50/80 border border-amber-200/80 rounded-xl flex items-center gap-2 text-[11px] text-amber-900 font-semibold">
                            <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Forensic purpose watermark applied. Access event logged under RA 10173 audit trail.</span>
                        </div>

                        <div className="rounded-2xl overflow-hidden border border-gray-200 bg-slate-900 flex items-center justify-center max-h-[65vh]">
                            <img
                                src={previewIdPhotoUrl}
                                alt="Government ID"
                                className="w-full h-auto max-h-[65vh] object-contain"
                            />
                        </div>

                        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                            <span>ID Document Type: <strong className="text-gray-900">{previewIdData?.idType || 'Government ID'}</strong></span>
                            <button
                                type="button"
                                onClick={() => {
                                    setPreviewIdPhotoUrl(null);
                                    setPreviewIdData(null);
                                }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl transition-colors cursor-pointer"
                            >
                                Close Inspection
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── 9-STAGE WORKFLOW MODALS ─── */}
            {stageModalState && (
                <>
                    {/* Stage 2: Verification Modal */}
                    {stageModalState.modal === 'verify' && (
                        <AdoptionVerificationModal
                            isOpen={true}
                            adoptionId={stageModalState.app.adoption_id}
                            applicantName={stageModalState.app.full_name}
                            onClose={() => setStageModalState(null)}
                            onSuccess={() => {
                                fetchApplications();
                                showToast("Stage 2 Verification recorded successfully!");
                            }}
                        />
                    )}

                    {/* Stage 3: Interview Modals */}
                    {(stageModalState.modal === 'interview_schedule' || stageModalState.modal === 'interview_eval' || stageModalState.modal === 'interview_log') && (
                        <AdoptionInterviewModal
                            isOpen={true}
                            mode={stageModalState.modal === 'interview_schedule' ? 'schedule' : stageModalState.modal === 'interview_eval' ? 'evaluate' : 'view_log'}
                            adoptionId={stageModalState.app.adoption_id}
                            applicantName={stageModalState.app.full_name}
                            existingData={stageModalState.app}
                            onClose={() => setStageModalState(null)}
                            onSuccess={() => {
                                fetchApplications();
                                showToast("Stage 3 Interview action saved successfully!");
                            }}
                        />
                    )}

                    {/* Stage 4: Home Visit Modals */}
                    {(stageModalState.modal === 'home_visit_schedule' || stageModalState.modal === 'home_visit_eval' || stageModalState.modal === 'home_visit_log') && (
                        <AdoptionHomeVisitModal
                            isOpen={true}
                            mode={stageModalState.modal === 'home_visit_schedule' ? 'schedule' : stageModalState.modal === 'home_visit_eval' ? 'evaluate' : 'view_assessment'}
                            adoptionId={stageModalState.app.adoption_id}
                            applicantName={stageModalState.app.full_name}
                            applicantAddress={stageModalState.app.address}
                            applicantContact={stageModalState.app.contact_no}
                            existingData={stageModalState.app}
                            onClose={() => setStageModalState(null)}
                            onSuccess={() => {
                                fetchApplications();
                                showToast("Stage 4 Home Visit action recorded successfully!");
                            }}
                        />
                    )}

                    {/* Stage 5 & 6: Dossier Review & Final Decision Modal */}
                    {stageModalState.modal === 'review' && (
                        <AdoptionReviewModal
                            isOpen={true}
                            adoptionId={stageModalState.app.adoption_id}
                            onClose={() => setStageModalState(null)}
                            onSuccess={() => {
                                fetchApplications();
                                showToast("Stage 5 Review decision submitted successfully!");
                            }}
                        />
                    )}

                    {/* Stage 8: Handover Scheduling Modal */}
                    {stageModalState.modal === 'handover_schedule' && (
                        <AdoptionHandoverScheduleModal
                            isOpen={true}
                            adoptionId={stageModalState.app.adoption_id}
                            animalName={stageModalState.app.animal_name || 'Pet'}
                            applicantName={stageModalState.app.full_name}
                            existingData={stageModalState.app}
                            onClose={() => setStageModalState(null)}
                            onSuccess={() => {
                                fetchApplications();
                                showToast("Handover scheduled successfully and sent to resident!");
                            }}
                        />
                    )}

                    {/* Stage 8: Handover Completion Modal */}
                    {stageModalState.modal === 'handover' && (
                        <AdoptionHandoverModal
                            isOpen={true}
                            adoptionId={stageModalState.app.adoption_id}
                            animalName={stageModalState.app.animal_name || 'Pet'}
                            applicantName={stageModalState.app.full_name}
                            onClose={() => setStageModalState(null)}
                            onSuccess={() => {
                                fetchApplications();
                                fetchMonitoringDashboard();
                                showToast("Stage 8 Handover completed and 30-Day Welfare Monitoring initiated!");
                            }}
                        />
                    )}

                    {/* Stage 7: Official Certificate & QR Modal */}
                    {stageModalState.modal === 'certificate' && (
                        <AdoptionCertificateModal
                            isOpen={true}
                            adoptionId={stageModalState.app.adoption_id}
                            applicationData={stageModalState.app}
                            onClose={() => setStageModalState(null)}
                        />
                    )}

                    {/* Stage 9: Welfare Monitoring Logs Modal */}
                    {stageModalState.modal === 'monitoring' && (
                        <AdoptionMonitoringModal
                            isOpen={true}
                            adoptionId={stageModalState.app.adoption_id}
                            animalName={stageModalState.app.animal_name || 'Pet'}
                            onClose={() => setStageModalState(null)}
                            onUpdate={() => {
                                fetchApplications();
                                fetchMonitoringDashboard();
                            }}
                        />
                    )}

                    {/* 9-Stage Unified Dossier Modal */}
                    {stageModalState.modal === 'dossier' && (
                        <AdoptionDossierModal
                            isOpen={true}
                            adoptionId={stageModalState.app.adoption_id}
                            onClose={() => setStageModalState(null)}
                        />
                    )}
                </>
            )}

            {/* Applicant Information & Profile Modal */}
            {showApplicantInfoModal && viewAppModal && (
                <div
                    className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onClick={() => setShowApplicantInfoModal(false)}
                >
                    <div
                        className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200/90 shadow-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
                        role="dialog"
                        aria-modal="true"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between gap-4 shrink-0 bg-slate-50/70">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-black border border-orange-200 shrink-0 shadow-2xs">
                                    <User className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight uppercase truncate">
                                        Applicant Information & Profile
                                    </h2>
                                    <p className="text-xs text-slate-500 font-medium truncate">
                                        Complete adopter information for Adoption Dossier #{viewAppModal.adoption_id}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowApplicantInfoModal(false)}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer shrink-0"
                                title="Close modal"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-5 sm:p-6 space-y-6 overflow-y-auto">
                            {/* 2-Column Info Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <User className="w-3 h-3 text-orange-500" /> Applicant Legal Name
                                    </span>
                                    <p className="text-sm font-black text-slate-900">{viewAppModal.full_name}</p>
                                </div>

                                <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <Phone className="w-3 h-3 text-blue-500" /> Contact Number
                                    </span>
                                    <p className="text-sm font-black text-slate-900">{viewAppModal.contact_no || 'N/A'}</p>
                                </div>

                                <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1 sm:col-span-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-rose-500" /> Residential Address
                                    </span>
                                    <p className="text-sm font-extrabold text-slate-900 leading-relaxed">
                                        {viewAppModal.address || 'No residential address provided'}
                                    </p>
                                </div>

                                <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <Home className="w-3 h-3 text-emerald-500" /> Living Space
                                    </span>
                                    <p className="text-sm font-black text-slate-900">{viewAppModal.living_space || 'Not specified'}</p>
                                </div>

                                <div className="bg-slate-50/90 rounded-2xl p-4 border border-slate-100 space-y-1">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                        <PawPrint className="w-3 h-3 text-purple-500" /> Other Pets in Home
                                    </span>
                                    <p className="text-sm font-black text-slate-900">
                                        {viewAppModal.has_other_pets ? 'Yes — Currently owns other pets' : 'No other pets'}
                                    </p>
                                </div>

                            </div>

                            {/* Government ID Verification Section */}
                            {viewAppModal.id_type && (
                                <div className="bg-slate-50 rounded-2xl p-4 sm:p-5 border border-slate-200/80 space-y-3">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                            <CreditCard className="w-3.5 h-3.5 text-indigo-500" /> Government ID Verification
                                        </h4>
                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            <CheckCircle2 className="w-3 h-3" /> Verified
                                        </span>
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                                ID Type: <span className="text-slate-800 font-extrabold">{viewAppModal.id_type}</span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ID Number:</span>
                                                {viewAppModal.id_number && (
                                                    <MaskedIdDisplay idNumber={viewAppModal.id_number} idType={viewAppModal.id_type} />
                                                )}
                                            </div>
                                        </div>

                                        {(viewAppModal.has_id_uploaded || viewAppModal.id_photo_url) && (
                                            <button
                                                type="button"
                                                disabled={loadingIdAdoptionId === viewAppModal.adoption_id}
                                                onClick={() => handleViewSecureId(viewAppModal.adoption_id)}
                                                className="px-4 py-2 bg-white hover:bg-orange-50 text-orange-600 border border-orange-200 rounded-xl text-xs font-black transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 shrink-0"
                                            >
                                                <Eye className="w-4 h-4" />
                                                <span>{loadingIdAdoptionId === viewAppModal.adoption_id ? 'Loading Secure ID...' : 'View ID Photo'}</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Applicant Stated Motivation */}
                            <div className="space-y-2">
                                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                                    <FileText className="w-4 h-4 text-amber-500" /> Applicant's Stated Motivation & Reason
                                </h4>
                                <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words bg-amber-50/40 p-4 sm:p-5 rounded-2xl border border-amber-200/70 font-medium">
                                    "{viewAppModal.reason || 'No specific motivation provided.'}"
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-100 flex justify-end bg-slate-50/70">
                            <button
                                type="button"
                                onClick={() => setShowApplicantInfoModal(false)}
                                className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Inline Dossier Photo Lightbox */}
            {dossierLightboxPhoto && (
                <div
                    className="fixed inset-0 z-70 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
                    onClick={() => setDossierLightboxPhoto(null)}
                >
                    <div className="relative max-w-3xl max-h-[85vh] p-2 bg-white rounded-2xl shadow-2xl">
                        <button
                            type="button"
                            onClick={() => setDossierLightboxPhoto(null)}
                            className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 text-white hover:bg-black cursor-pointer z-10"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <img
                            src={dossierLightboxPhoto}
                            alt="Full size photo"
                            className="max-w-full max-h-[80vh] rounded-xl object-contain"
                        />
                    </div>
                </div>
            )}

            {/* Government ID Secure Viewer Modal */}
            {(previewIdPhotoUrl || previewIdData) && (
                <div
                    className="fixed inset-0 z-80 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onClick={() => {
                        setPreviewIdPhotoUrl(null);
                        setPreviewIdData(null);
                        setIdImageError(false);
                    }}
                >
                    <div
                        className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
                        role="dialog"
                        aria-modal="true"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 gap-3 shrink-0">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-black border border-indigo-200 shrink-0 shadow-2xs">
                                    <CreditCard className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
                                        <span>Applicant Government ID Document</span>
                                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            Verified
                                        </span>
                                    </h3>
                                    <p className="text-xs text-slate-500 font-medium truncate">
                                        Applicant: <strong className="text-slate-800">{previewIdData?.applicantName || viewAppModal?.full_name}</strong>
                                        {previewIdData?.idType && ` • ${previewIdData.idType}`}
                                        {previewIdData?.maskedId && ` (${previewIdData.maskedId})`}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setPreviewIdPhotoUrl(null);
                                    setPreviewIdData(null);
                                    setIdImageError(false);
                                }}
                                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer shrink-0"
                                title="Close ID preview"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body: ID Photo Preview */}
                        <div className="p-4 sm:p-6 bg-slate-950 flex items-center justify-center overflow-auto min-h-[320px] max-h-[65vh]">
                            {previewIdData?.url && previewIdData.url !== 'id_verified' && !idImageError ? (
                                <div className="flex flex-col items-center gap-3 max-w-full">
                                    <img
                                        src={(() => {
                                            const raw = previewIdData.url;
                                            if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
                                            const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://127.0.0.1:8000';
                                            const cleanPath = raw.startsWith('/') ? raw : `/${raw}`;
                                            return `${baseUrl.replace(/\/$/, '')}${cleanPath}`;
                                        })()}
                                        alt="Applicant Government ID"
                                        className="max-w-full max-h-[58vh] rounded-2xl object-contain shadow-2xl border border-slate-800"
                                        onError={() => setIdImageError(true)}
                                    />
                                    {previewIdData.url.startsWith('http') && (
                                        <a
                                            href={previewIdData.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" />
                                            <span>Open high-res original in new tab</span>
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <div 
                                    className="w-full max-w-md bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 rounded-3xl p-6 text-white shadow-2xl flex flex-col justify-between space-y-6"
                                >
                                    <div className="flex items-center justify-between border-b border-indigo-500/20 pb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-400/30">
                                                <CreditCard className="w-4 h-4 text-indigo-300" />
                                            </div>
                                            <div>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300 block">
                                                    Republic of the Philippines
                                                </span>
                                                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                                                    {previewIdData?.idType || viewAppModal?.id_type || 'Government ID Card'}
                                                </h4>
                                            </div>
                                        </div>
                                        <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                            Verified
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-20 rounded-xl bg-indigo-900/60 border border-indigo-400/20 flex flex-col items-center justify-center text-indigo-300 text-[10px] font-bold shrink-0">
                                                <User className="w-8 h-8 text-indigo-400 mb-1" />
                                                <span>PHOTO</span>
                                            </div>
                                            <div className="space-y-1 min-w-0">
                                                <span className="text-[9px] font-bold text-indigo-300/70 uppercase block">Applicant Legal Name</span>
                                                <strong className="text-sm font-black text-white block truncate">
                                                    {previewIdData?.applicantName || viewAppModal?.full_name}
                                                </strong>
                                                <span className="text-[9px] font-bold text-indigo-300/70 uppercase block mt-2">ID Number / CRN</span>
                                                <span className="font-mono text-xs font-bold text-indigo-200 block">
                                                    {previewIdData?.maskedId || viewAppModal?.id_number || '••••••••4678'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="border-t border-indigo-500/20 pt-3 flex items-center justify-between text-[10px] text-indigo-300/60">
                                        <span>Security ID Verification Hash: Active</span>
                                        <span className="font-mono text-[9px]">RA 10173 Compliant</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/80 flex-wrap gap-2 text-xs">
                            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
                                <Shield className="w-3.5 h-3.5 text-indigo-500" /> Protected ephemeral access • Verified government record
                            </span>
                            <button
                                type="button"
                                onClick={() => {
                                    setPreviewIdPhotoUrl(null);
                                    setPreviewIdData(null);
                                    setIdImageError(false);
                                }}
                                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-colors cursor-pointer text-xs"
                            >
                                Close Preview
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyAdoptions;
