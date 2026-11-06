import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import SuccessModal from '../../components/Modals/SuccessModal';
import NoticeModal from '../../components/Modals/NoticeModal';
import { cloudinaryResized } from '../../utils/cloudinaryImage';
import SubdOwnerUpdatesSection from '../../components/SubdOwnerUpdatesSection';
import { mergeOwnerUpdate, sortOwnerUpdates, type OwnerObservationUpdate } from '../../utils/ownerObservationUpdates';
import {
    type MonitoringLog,
    MONITORING_METHOD_OPTIONS,
    MONITORING_OUTCOME_OPTIONS,
    MONITORING_METHOD_LABELS,
    MONITORING_OUTCOME_LABELS,
    DEFAULT_MONITORING_METHOD,
    DEFAULT_MONITORING_OUTCOME,
    getMonitoringMethodLabel,
    getMonitoringOutcomeLabel,
    sortMonitoringLogs,
    mergeMonitoringLog,
    createMonitoringRequestId,
    getMonitoringLogErrorMessage,
} from '../../utils/monitoringLogs';

export type WorkflowSection = 'active' | 'for_second_warning' | 'second_warning_issued' | 'endorsed' | 'resolved';

export interface UnderObservationItem {
    followup_id: number;
    report_id: number;
    pet_id: number | null;
    pet_name: string | null;
    animal_name?: string | null;
    animal_photo?: string | null;
    subdivision_id: number;
    subdivision_name?: string | null;
    leader_id: number;
    leader_name?: string | null;
    owner_id: number | null;
    owner_name: string | null;
    owner_phone: string | null;
    owner_address: string | null;
    owner_acknowledged_at?: string | null;
    owner_acknowledgement_method?: string | null;
    status: string;
    duration_days: number;
    due_at: string;
    notes: string | null;
    created_at: string;
    extension_count?: number;
    can_extend?: boolean;
    is_overdue: boolean;
    report_photo: string | null;
    report_category_name: string | null;
    report_landmark: string | null;
    report_animal_type: string | null;
    report_breed: string | null;
    report_color: string | null;
    report_description: string | null;
    report_condition: string | null;
    first_warning_id: number | null;
    first_warning_date: string | null;
    first_warning_level: string | null;
    first_warning_violation: string | null;
    first_warning_description: string | null;
    first_warning_issuer_name: string | null;
    // Second Warning fields
    second_warning_id: number | null;
    second_warning_date: string | null;
    second_warning_level: string | null;
    second_warning_violation: string | null;
    second_warning_description: string | null;
    second_warning_issuer_name: string | null;
    has_second_warning: boolean;
    is_eligible_for_second_warning: boolean;
    is_eligible_for_endorsement: boolean;
    // Workflow Section Classification
    workflow_section: WorkflowSection;
    resolved_by_name: string | null;
    resolved_at: string | null;
    resolved_notes: string | null;
    endorsement_date: string | null;
    endorsement_letter_content: string | null;
    endorsement_status: string | null;
    current_observation_day: number;
    observation_day_display: string;
    remaining_time_display: string;
    progress_percent: number;
    contact_logs?: MonitoringLog[];
    logs?: MonitoringLog[];
    owner_updates?: OwnerObservationUpdate[];
    owner_updates_count?: number;
    unreviewed_owner_updates_count?: number;
    endorsement_letter?: string | null;
    is_escalated: boolean;
}

interface DashboardMetrics {
    total_under_observation: number;
    day_1_count: number;
    day_2_count: number;
    day_3_count: number;
    overdue_count: number;
    complied_count: number;
    // 5 Workflow section counts
    active_observation_count: number;
    for_second_warning_count: number;
    second_warning_issued_count: number;
    endorsed_count: number;
    resolved_count: number;
}

// Clean date/time formatters avoiding system AM/24h collision
const formatDateTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Not recorded';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return String(dateStr);
    }
};

const formatDateOnly = (dateStr: string | null | undefined): string => {
    if (!dateStr) return 'Not recorded';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return String(dateStr);
        return d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });
    } catch {
        return String(dateStr);
    }
};

const formatCardDate = formatDateOnly;

const formatCardTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        });
    } catch {
        return '';
    }
};

const formatCount = (count: number | string | null | undefined): string => {
    const n = Number(count ?? 0);
    return isNaN(n) ? '0' : String(n);
};

const getOutcomeBadgeClass = (outcomeKey: string | null | undefined, label: string | null): string => {
    const key = (outcomeKey || '').toLowerCase();
    const text = (label || '').toLowerCase();
    if (key === 'pet_secured' || text.includes('secured') || text.includes('complied')) {
        return 'bg-emerald-50 text-emerald-700';
    }
    if (
        key.includes('violation') ||
        key.includes('no_improvement') ||
        text.includes('required') ||
        text.includes('violation') ||
        text.includes('follow-up')
    ) {
        return 'bg-orange-50 text-orange-700';
    }
    return 'bg-amber-50 text-amber-700';
};

const getAnimalDisplayName = (item: UnderObservationItem | null | undefined): string => {
    if (!item) return 'Reported Animal';
    if (item.animal_name && item.animal_name !== 'Reported Animal') return item.animal_name;
    if (item.pet_name) return item.pet_name;
    if (item.report_animal_type) {
        return `${item.report_animal_type}${item.report_breed ? ` (${item.report_breed})` : ''}`;
    }
    return `Reported Animal #${item.report_id}`;
};

export default function SubdUnderObservation() {
    const navigate = useNavigate();
    const { id: routeCaseId } = useParams<{ id?: string }>();
    const [searchParams] = useSearchParams();
    const routeByReport = searchParams.get('by') === 'report';
    const findRouteCase = useCallback((list: UnderObservationItem[]): UnderObservationItem | undefined => {
        const wanted = Number(routeCaseId);
        if (routeByReport) return list.find((it) => it.report_id === wanted);
        return list.find((it) => it.followup_id === wanted) ?? list.find((it) => it.report_id === wanted);
    }, [routeCaseId, routeByReport]);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [items, setItems] = useState<UnderObservationItem[]>([]);
    const [metrics, setMetrics] = useState<DashboardMetrics>({
        total_under_observation: 0,
        day_1_count: 0,
        day_2_count: 0,
        day_3_count: 0,
        overdue_count: 0,
        complied_count: 0,
        active_observation_count: 0,
        for_second_warning_count: 0,
        second_warning_issued_count: 0,
        endorsed_count: 0,
        resolved_count: 0,
    });

    // Workflow Section Tab Filter: 'active' | 'for_second_warning' | 'second_warning_issued' | 'endorsed' | 'resolved' | 'all'
    const [activeTab, setActiveTab] = useState<'all' | WorkflowSection | 'warning_escalation'>('all');

    // Search and Day Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [dayFilter, setDayFilter] = useState<string>('all');

    // Selected item for full-page observation details
    const [selectedItem, setSelectedItem] = useState<UnderObservationItem | null>(null);

    // Modal: Mark as Resolved (Verification Remarks Required)
    const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
    const [resolveNotes, setResolveNotes] = useState('');
    const [isSubmittingResolve, setIsSubmittingResolve] = useState(false);

    // Modal: Issue Second Warning
    const [isSecondWarningModalOpen, setIsSecondWarningModalOpen] = useState(false);
    const [warningViolationType, setWarningViolationType] = useState('Free-Roaming Unleashed');
    const [warningDescription, setWarningDescription] = useState('');
    const [warningFineAmount, setWarningFineAmount] = useState<string>('0');
    const [isSubmittingWarning, setIsSubmittingWarning] = useState(false);

    // Modal: Endorsement to Barangay San Vicente
    const [isEndorseModalOpen, setIsEndorseModalOpen] = useState(false);
    const [endorseReason, setEndorseReason] = useState('');
    const [endorseNotes, setEndorseNotes] = useState('');
    const [isSubmittingEndorse, setIsSubmittingEndorse] = useState(false);

    // Add Monitoring Log popup modal state
    const [isAddLogModalOpen, setIsAddLogModalOpen] = useState(false);
    const [logErrorMessage, setLogErrorMessage] = useState<string | null>(null);

    // Add Note / Contact Log form
    const [logMethod, setLogMethod] = useState(DEFAULT_MONITORING_METHOD);
    const [logOutcome, setLogOutcome] = useState(DEFAULT_MONITORING_OUTCOME);
    const [logNote, setLogNote] = useState('');
    const [isSubmittingLog, setIsSubmittingLog] = useState(false);
    // Synchronous guard: state updates land after re-render, so a fast double click could slip past isSubmittingLog.
    const logSubmitInFlight = useRef(false);
    // One key per form draft; kept after a failure so a retry cannot save the same log twice.
    const [logRequestId, setLogRequestId] = useState(createMonitoringRequestId);
    const [logDraftFollowupId, setLogDraftFollowupId] = useState<number | null>(null);

    // Prevent background scrolling while Add Monitoring Log popup is open
    useEffect(() => {
        if (isAddLogModalOpen) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [isAddLogModalOpen]);

    // Handle Escape key to close popup
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isAddLogModalOpen && !isSubmittingLog) {
                setIsAddLogModalOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isAddLogModalOpen, isSubmittingLog]);

    // Extension modal / action
    const [isExtendModalOpen, setIsExtendModalOpen] = useState(false);
    const [extendReason, setExtendReason] = useState('');
    const [isSubmittingExtend, setIsSubmittingExtend] = useState(false);

    // Feedback modals
    const [noticeMsg, setNoticeMsg] = useState<{ title: string; message: string } | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);

    const unreviewedOwnerUpdates = items.filter((it) => (it.unreviewed_owner_updates_count || 0) > 0);

    // A staff review changes only the review fields; replace that update in place.
    const handleOwnerUpdateReviewed = (reviewed: OwnerObservationUpdate) => {
        const apply = (it: UnderObservationItem): UnderObservationItem => {
            if (it.followup_id !== reviewed.followup_id) return it;
            const updates = mergeOwnerUpdate(it.owner_updates, reviewed);
            return { ...it, owner_updates: updates, unreviewed_owner_updates_count: updates.filter((u) => !u.is_reviewed).length };
        };
        setItems((prev) => prev.map(apply));
        setSelectedItem((prev) => (prev ? apply(prev) : prev));
        setSuccessMsg('Owner update marked as reviewed. The case status is unchanged.');
    };

    const handleViewDetails = (item: UnderObservationItem) => {
        setSelectedItem(item);
        navigate(`/subd/under-observation/${item.followup_id}`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleBackToList = () => {
        setSelectedItem(null);
        navigate('/subd/under-observation');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Synchronize route param with selected case
    useEffect(() => {
        if (routeCaseId && items.length > 0) {
            const match = findRouteCase(items);
            if (match) {
                setSelectedItem(match);
            }
        } else if (!routeCaseId) {
            setSelectedItem(null);
        }
    }, [routeCaseId, findRouteCase, items]);

    const fetchDashboard = async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            const res = await api.get('/owner-followups/under-observation');
            const data = res.data;
            setMetrics({
                total_under_observation: data.total_under_observation || 0,
                day_1_count: data.day_1_count || 0,
                day_2_count: data.day_2_count || 0,
                day_3_count: data.day_3_count || 0,
                overdue_count: data.overdue_count || 0,
                complied_count: data.complied_count || 0,
                active_observation_count: data.active_observation_count || 0,
                for_second_warning_count: data.for_second_warning_count || 0,
                second_warning_issued_count: data.second_warning_issued_count || 0,
                endorsed_count: data.endorsed_count || 0,
                resolved_count: data.resolved_count || 0,
            });
            const list: UnderObservationItem[] = (data.items || []).map((it: any) => ({
                ...it,
                logs: sortMonitoringLogs(it.contact_logs || []),
                owner_updates: sortOwnerUpdates(it.owner_updates || []),
            }));
            setItems(list);

            if (routeCaseId) {
                const match = findRouteCase(list);
                if (match) {
                    setSelectedItem(match);
                } else {
                    setSelectedItem((prev) => (prev ? list.find((it) => it.followup_id === prev.followup_id) ?? prev : prev));
                }
            } else {
                setSelectedItem((prev) => (prev ? list.find((it) => it.followup_id === prev.followup_id) ?? prev : prev));
            }
        } catch (err: any) {
            console.error('Failed to fetch under observation data', err);
            setNoticeMsg({
                title: 'Connection Issue',
                message: err?.response?.data?.detail || 'Unable to load Under Observation cases. Please try again.',
            });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchDashboard();
        const interval = setInterval(() => {
            fetchDashboard(true);
        }, 30000); // 30s auto-refresh
        return () => clearInterval(interval);
    }, []);

    // Filtered items
    const filteredItems = useMemo(() => {
        return items.filter((item) => {
            // Search text
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const animalTitle = getAnimalDisplayName(item).toLowerCase();
                const matchesAnimal = animalTitle.includes(q);
                const matchesOwner = (item.owner_name || '').toLowerCase().includes(q);
                const matchesReport = `report #${item.report_id}`.toLowerCase().includes(q) || `${item.report_id}` === q;
                const matchesLandmark = (item.report_landmark || '').toLowerCase().includes(q);
                const matchesBreed = (item.report_breed || '').toLowerCase().includes(q);
                if (!matchesAnimal && !matchesOwner && !matchesReport && !matchesLandmark && !matchesBreed) {
                    return false;
                }
            }

            // Tab / Section filter
            if (activeTab === 'warning_escalation') {
                if (item.workflow_section !== 'for_second_warning' && item.workflow_section !== 'second_warning_issued') {
                    return false;
                }
            } else if (activeTab !== 'all') {
                if (item.workflow_section !== activeTab) return false;
            }

            // Day filter (applicable primarily in active tab or all)
            if (dayFilter !== 'all') {
                const dayNum = parseInt(dayFilter, 10);
                if (item.current_observation_day !== dayNum) return false;
            }

            return true;
        });
    }, [items, searchQuery, activeTab, dayFilter]);

    // Handle Adding Monitoring / Follow-up Log
    const resetLogForm = () => {
        setLogMethod(DEFAULT_MONITORING_METHOD);
        setLogOutcome(DEFAULT_MONITORING_OUTCOME);
        setLogNote('');
        setLogRequestId(createMonitoringRequestId());
    };

    // A draft belongs to one case; opening another case starts a fresh form and request key.
    const openFollowupId = selectedItem?.followup_id ?? null;
    if (openFollowupId !== logDraftFollowupId) {
        setLogDraftFollowupId(openFollowupId);
        resetLogForm();
    }

    const handleAddLog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedItem || logSubmitInFlight.current) return;
        setLogErrorMessage(null);

        if (!MONITORING_METHOD_LABELS[logMethod] || !MONITORING_OUTCOME_LABELS[logOutcome]) {
            const msg = 'Please select an inspection method and an inspection outcome.';
            setLogErrorMessage(msg);
            setNoticeMsg({ title: 'Incomplete Log', message: msg });
            return;
        }
        if (!logNote.trim()) {
            const msg = 'Please describe monitoring findings, owner interaction, animal location, compliance status, or supporting evidence.';
            setLogErrorMessage(msg);
            setNoticeMsg({ title: 'Staff Notes Required', message: msg });
            return;
        }

        const followupId = selectedItem.followup_id;
        logSubmitInFlight.current = true;
        setIsSubmittingLog(true);
        try {
            const res = await api.post<MonitoringLog>(`/owner-followups/${followupId}/logs`, {
                contact_method: logMethod,
                outcome: logOutcome,
                notes: logNote.trim(),
                client_request_id: logRequestId,
            });
            const saved = res.data;
            if (!saved || typeof saved.contact_log_id !== 'number') {
                throw new Error('Unexpected response while saving the monitoring log.');
            }
            // Show the row the database returned right away, then refetch the full history from the server.
            const addSaved = (it: UnderObservationItem) =>
                it.followup_id === followupId ? { ...it, logs: mergeMonitoringLog(it.logs, saved) } : it;
            setItems((prev) => prev.map(addSaved));
            setSelectedItem((prev) => (prev ? addSaved(prev) : prev));

            // Close popup only after successful database confirmation
            setIsAddLogModalOpen(false);
            resetLogForm();
            setLogErrorMessage(null);
            setSuccessMsg('Monitoring log successfully saved and recorded in history.');
            fetchDashboard(true);
        } catch (err: unknown) {
            const errMsg = getMonitoringLogErrorMessage(err);
            setLogErrorMessage(errMsg);
            setNoticeMsg({
                title: 'Monitoring Log Not Saved',
                message: errMsg,
            });
        } finally {
            logSubmitInFlight.current = false;
            setIsSubmittingLog(false);
        }
    };

    // Handle Marking Case as Verified Resolved (Requirement 3)
    const handleConfirmResolve = async () => {
        if (!selectedItem) return;
        if (!resolveNotes.trim() || resolveNotes.trim().length < 3) {
            setNoticeMsg({
                title: 'Verification Remarks Required',
                message: 'Please provide detailed verification remarks explaining how compliance was checked.',
            });
            return;
        }

        setIsSubmittingResolve(true);
        try {
            await api.post(`/owner-followups/${selectedItem.followup_id}/resolve`, {
                verification_notes: resolveNotes.trim(),
            });
            setIsResolveModalOpen(false);
            setResolveNotes('');
            setSuccessMsg('Observation case successfully marked as Resolved and verified.');
            await fetchDashboard(true);
        } catch (err: any) {
            setNoticeMsg({
                title: 'Resolution Failed',
                message: err?.response?.data?.detail || 'Failed to verify and resolve case.',
            });
        } finally {
            setIsSubmittingResolve(false);
        }
    };

    // Handle Issuing Second Warning (Requirement 4)
    const handleConfirmSecondWarning = async () => {
        if (!selectedItem) return;
        if (!warningDescription.trim()) {
            setNoticeMsg({
                title: 'Citation Remarks Required',
                message: 'Please specify the Second Warning violation description and evidence.',
            });
            return;
        }

        setIsSubmittingWarning(true);
        try {
            const fine = parseFloat(warningFineAmount) || 0.0;
            await api.post(`/owner-followups/${selectedItem.followup_id}/issue-second-warning`, {
                violation_type: warningViolationType,
                description: warningDescription.trim(),
                fine_amount: fine,
            });
            setIsSecondWarningModalOpen(false);
            setWarningDescription('');
            setWarningFineAmount('0');
            setSuccessMsg('Second Warning issued successfully. Case is now eligible for Barangay Endorsement.');
            await fetchDashboard(true);
        } catch (err: any) {
            setNoticeMsg({
                title: 'Warning Issuance Failed',
                message: err?.response?.data?.detail || 'Failed to issue Second Warning.',
            });
        } finally {
            setIsSubmittingWarning(false);
        }
    };

    // Handle Extension
    const handleConfirmExtend = async () => {
        if (!selectedItem) return;
        if (!extendReason.trim()) {
            setNoticeMsg({ title: 'Reason Required', message: 'Please provide a valid reason for extending the observation period.' });
            return;
        }

        setIsSubmittingExtend(true);
        try {
            await api.post(`/owner-followups/${selectedItem.followup_id}/extend`, {
                extension_reason: extendReason.trim(),
            });
            setIsExtendModalOpen(false);
            setExtendReason('');
            setSuccessMsg('Observation period extended by 3 additional calendar days.');
            await fetchDashboard(true);
        } catch (err: any) {
            setNoticeMsg({
                title: 'Extension Failed',
                message: err?.response?.data?.detail || 'Failed to extend observation.',
            });
        } finally {
            setIsSubmittingExtend(false);
        }
    };

    // Handle Endorsement to Barangay San Vicente (Requirement 5)
    const handleConfirmEndorse = async () => {
        if (!selectedItem) return;
        if (!endorseReason.trim()) {
            setNoticeMsg({ title: 'Reason Required', message: 'Please provide the reason for endorsing this case to Barangay San Vicente.' });
            return;
        }

        setIsSubmittingEndorse(true);
        try {
            await api.post(`/owner-followups/${selectedItem.followup_id}/endorse-barangay`, {
                endorsement_reason: endorseReason.trim(),
                notes: endorseNotes.trim() || undefined,
            });
            setIsEndorseModalOpen(false);
            setEndorseReason('');
            setEndorseNotes('');
            setSuccessMsg('Case successfully endorsed to Barangay San Vicente with complete observation and warning records.');
            await fetchDashboard(true);
        } catch (err: any) {
            setNoticeMsg({
                title: 'Endorsement Failed',
                message: err?.response?.data?.detail || 'Failed to endorse case to Barangay.',
            });
        } finally {
            setIsSubmittingEndorse(false);
        }
    };

    // Helper for Status Badge styling based on workflow section
    const renderStatusBadge = (item: UnderObservationItem) => {
        if (item.workflow_section === 'resolved') {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                    Resolved & Verified
                </span>
            );
        }
        if (item.workflow_section === 'endorsed') {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                    Endorsed to Barangay
                </span>
            );
        }
        if (item.workflow_section === 'second_warning_issued') {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200 shadow-2xs">
                    <span className="w-2 h-2 rounded-full bg-orange-600" />
                    Second Warning Issued
                </span>
            );
        }
        if (item.workflow_section === 'for_second_warning') {
            return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-600"></span>
                    </span>
                    Non-Compliant (Expired)
                </span>
            );
        }
        return (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200 shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                Under Observation
            </span>
        );
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            {/* Sidebar */}
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Navbar */}
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        selectedItem ? (
                            <div className="flex items-center gap-3.5">
                                <button
                                    type="button"
                                    onClick={handleBackToList}
                                    className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all shrink-0 cursor-pointer"
                                    title="Back to Under Observation"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                </button>
                                <div className="flex flex-col">
                                    <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">
                                        Observation Details
                                    </h1>
                                    <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                        {getAnimalDisplayName(selectedItem)} · Report #{selectedItem.report_id}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">
                                    Under Observation
                                </h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    First Warning · 3-Day Observation · Second Warning · Barangay Endorsement Workflow
                                </p>
                            </div>
                        )
                    }
                />

                {/* Main Content Area */}
                <main className="flex-1 overflow-y-auto px-3 py-4 sm:p-8 pb-32 md:pb-8 custom-scrollbar">
                    {selectedItem ? (
                        /* FULL-PAGE OBSERVATION DETAILS VIEW */
                        <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-150">
                            {/* SECTION 1: SLIM PAGE BREADCRUMB */}
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <nav className="flex items-center gap-2 text-xs text-gray-500 font-semibold" aria-label="Breadcrumb">
                                    <button
                                        type="button"
                                        onClick={handleBackToList}
                                        className="hover:text-amber-600 text-gray-600 transition-colors cursor-pointer flex items-center gap-1.5 font-bold"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                        </svg>
                                        <span>Under Observation</span>
                                    </button>
                                    <span className="text-gray-300">/</span>
                                    <span className="text-gray-500 font-medium">Case #{selectedItem.followup_id}</span>
                                    <span className="text-gray-300">/</span>
                                    <span className="text-amber-800 font-extrabold">{getAnimalDisplayName(selectedItem)}</span>
                                </nav>

                                <button
                                    type="button"
                                    onClick={handleBackToList}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-gray-200 hover:border-amber-300 hover:text-amber-600 text-gray-700 text-xs font-bold rounded-xl transition-all shadow-2xs cursor-pointer"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                    </svg>
                                    <span>Back to List</span>
                                </button>
                            </div>

                            {/* SECTION 2: PAGE HEADER HERO */}
                            <div className="bg-white rounded-3xl border border-gray-200/80 p-5 sm:p-6 shadow-xs relative overflow-hidden">
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                                    <div className="flex items-start sm:items-center gap-4">
                                        {/* Animal Photo Avatar */}
                                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ring-2 ring-amber-100/80 overflow-hidden bg-amber-500/10 flex items-center justify-center shrink-0 shadow-xs">
                                            {selectedItem.animal_photo || selectedItem.report_photo ? (
                                                <img
                                                    src={cloudinaryResized(selectedItem.animal_photo || selectedItem.report_photo, 160)}
                                                    alt={getAnimalDisplayName(selectedItem)}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                </svg>
                                            )}
                                        </div>

                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/60">
                                                    Observation Case
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-xs text-gray-500 font-medium">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                    <span>{selectedItem.report_landmark || 'Subdivision Premises'}</span>
                                                </span>
                                            </div>

                                            <h1 className="text-xl sm:text-2xl font-black text-gray-950 tracking-tight leading-tight">
                                                {getAnimalDisplayName(selectedItem)}
                                            </h1>

                                            <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs">
                                                <span className="px-2.5 py-1 bg-stone-100 text-stone-700 font-extrabold rounded-lg border border-stone-200/80">
                                                    Case #{selectedItem.followup_id}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/subd/reports/${selectedItem.report_id}`)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 font-extrabold rounded-lg border border-gray-200 transition-colors cursor-pointer"
                                                    title="Open Full Incident Report"
                                                >
                                                    <span>Report #{selectedItem.report_id}</span>
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                </button>
                                                <span className="text-gray-300">|</span>
                                                <span className="text-gray-400 font-semibold text-[11px]">Status:</span>
                                                {renderStatusBadge(selectedItem)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Header Action Buttons */}
                                    <div className="flex flex-wrap items-center gap-2 pt-2 lg:pt-0">
                                        {/* Verify & Mark Resolved */}
                                        {(selectedItem.workflow_section === 'active' || selectedItem.workflow_section === 'for_second_warning') && (
                                            <button
                                                type="button"
                                                onClick={() => setIsResolveModalOpen(true)}
                                                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                                <span>Verify & Mark Resolved</span>
                                            </button>
                                        )}

                                        {/* Issue Second Warning */}
                                        {selectedItem.workflow_section === 'for_second_warning' && (
                                            <button
                                                type="button"
                                                onClick={() => setIsSecondWarningModalOpen(true)}
                                                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                <span>Issue Second Warning</span>
                                            </button>
                                        )}

                                        {/* Endorse to Barangay San Vicente */}
                                        {selectedItem.workflow_section === 'second_warning_issued' && (
                                            <button
                                                type="button"
                                                onClick={() => setIsEndorseModalOpen(true)}
                                                className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-2"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                                <span>Endorse to Barangay San Vicente</span>
                                            </button>
                                        )}

                                        {/* Extend */}
                                        {selectedItem.workflow_section === 'active' && selectedItem.can_extend && (
                                            <button
                                                type="button"
                                                onClick={() => setIsExtendModalOpen(true)}
                                                className="px-3.5 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                </svg>
                                                <span>Extend (+3 Days)</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 3: OBSERVATION COUNTDOWN & PROGRESS BANNER */}
                            <div className="p-6 rounded-3xl bg-white border border-amber-200/80 shadow-xs space-y-5 relative overflow-hidden">
                                <div className="absolute -top-10 -right-10 w-44 h-44 bg-amber-100/40 rounded-full blur-2xl pointer-events-none" />

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
                                    <div className="flex items-center gap-3.5">
                                        <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shrink-0 shadow-2xs">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 block">
                                                3-Day Community Observation Period
                                            </span>
                                            <h3 className="text-xl sm:text-2xl font-black text-gray-950 leading-tight mt-0.5 tracking-tight">
                                                {selectedItem.observation_day_display}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5">
                                        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-black">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span>Remaining: {selectedItem.remaining_time_display}</span>
                                        </div>
                                        {renderStatusBadge(selectedItem)}
                                    </div>
                                </div>

                                <div className="space-y-2.5 pt-1 relative z-10">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs font-bold text-gray-700 gap-1.5">
                                        <span className="flex items-center gap-1.5 text-gray-600">
                                            <span className="text-gray-400 font-semibold text-[11px] uppercase tracking-wider">First Warning Issued:</span>
                                            <span className="text-gray-900 font-black">{formatDateTime(selectedItem.first_warning_date || selectedItem.created_at)}</span>
                                        </span>
                                        <span className="flex items-center gap-1.5 text-gray-600 sm:justify-end">
                                            <span className="text-gray-400 font-semibold text-[11px] uppercase tracking-wider">3-Day Deadline:</span>
                                            <span className="text-amber-950 font-black">{formatDateTime(selectedItem.due_at)}</span>
                                        </span>
                                    </div>
                                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden p-0.5 border border-gray-200/60 shadow-inner relative">
                                        <div
                                            className={`h-full rounded-full transition-all duration-700 shadow-2xs relative overflow-hidden ${selectedItem.workflow_section === 'resolved'
                                                ? 'bg-emerald-500'
                                                : selectedItem.workflow_section === 'for_second_warning'
                                                    ? 'bg-rose-500'
                                                    : selectedItem.workflow_section === 'second_warning_issued'
                                                        ? 'bg-orange-500'
                                                        : 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600'
                                                }`}
                                            style={{ width: `${Math.min(100, Math.max(5, selectedItem.progress_percent))}%` }}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse pointer-events-none" />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-gray-500">
                                        <span className="font-extrabold text-amber-800">
                                            Elapsed Window: {Math.round(selectedItem.progress_percent)}% completed
                                        </span>
                                        <span className="text-[11px] text-gray-400 font-medium">
                                            Subdivision compliance & monitoring active
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* RESOLVED BANNER (If resolved) */}
                            {selectedItem.workflow_section === 'resolved' && (
                                <div className="p-5 rounded-3xl bg-emerald-50 border border-emerald-200 text-xs space-y-2.5 shadow-2xs">
                                    <div className="flex items-center justify-between font-black text-emerald-900 text-sm">
                                        <span className="flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs">✓</span>
                                            <span>Resolution Verified & Case Closed</span>
                                        </span>
                                        {selectedItem.resolved_at && (
                                            <span className="text-xs text-emerald-700 font-bold">
                                                {formatDateTime(selectedItem.resolved_at)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-emerald-800 font-semibold">
                                        <strong>Verified By:</strong> {selectedItem.resolved_by_name || 'Subdivision Leader'}
                                    </div>
                                    {selectedItem.resolved_notes && (
                                        <div className="p-3.5 bg-white/95 rounded-2xl border border-emerald-200 mt-2">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Verification Remarks:</span>
                                            <p className="text-gray-800 italic leading-relaxed">{selectedItem.resolved_notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* BARANGAY ENDORSEMENT BANNER (If endorsed) */}
                            {selectedItem.workflow_section === 'endorsed' && (
                                <div className="p-5 rounded-3xl bg-purple-50 border border-purple-200 text-xs space-y-2.5 shadow-2xs">
                                    <div className="flex items-center justify-between font-black text-purple-900 text-sm">
                                        <span className="flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center text-xs">🏛️</span>
                                            <span>Formally Endorsed to Barangay San Vicente</span>
                                        </span>
                                        {selectedItem.endorsement_date && (
                                            <span className="text-xs text-purple-700 font-bold">
                                                {formatDateTime(selectedItem.endorsement_date)}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-purple-800 font-medium leading-relaxed">
                                        This case has been formally endorsed with complete First and Second Warning history for Barangay-level administrative action.
                                    </p>
                                    {selectedItem.endorsement_letter_content && (
                                        <div className="p-3.5 bg-white/95 rounded-2xl border border-purple-200 mt-2">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">Endorsement Document Details:</span>
                                            <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{selectedItem.endorsement_letter_content}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* SECTION 4: WARNING AND ESCALATION SECTION */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
                                {/* FIRST WARNING CARD */}
                                <div className="p-6 rounded-3xl bg-white border border-gray-200/80 shadow-xs flex flex-col justify-between space-y-4">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-600 flex items-center justify-center shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                    </svg>
                                                </div>
                                                <span>First Warning Citation</span>
                                            </h3>
                                            <span className="px-2.5 py-1 bg-amber-50 text-amber-800 rounded-lg text-[10px] font-black border border-amber-200/80">
                                                Official Start
                                            </span>
                                        </div>

                                        <div className="space-y-2.5 text-xs">
                                            <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                <span className="text-gray-400 font-semibold">Issued Date:</span>
                                                <span className="font-extrabold text-gray-900">{formatDateTime(selectedItem.first_warning_date || selectedItem.created_at)}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                <span className="text-gray-400 font-semibold">Violation Type:</span>
                                                <span className="font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200/60">
                                                    {selectedItem.first_warning_violation || 'Free-Roaming Unleashed'}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                <span className="text-gray-400 font-semibold">Issued By:</span>
                                                <span className="font-bold text-gray-800">{selectedItem.first_warning_issuer_name || selectedItem.leader_name || 'Subdivision Leader'}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                <span className="text-gray-400 font-semibold">Warning Status:</span>
                                                <span className="inline-flex items-center gap-1.5 font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span>Issued & Active</span>
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {selectedItem.first_warning_description && (
                                        <div className="pt-2">
                                            <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider block mb-1">Citation Remarks:</span>
                                            <div className="text-xs text-gray-800 italic leading-relaxed bg-stone-50 p-3.5 rounded-2xl border border-stone-200/70">
                                                "{selectedItem.first_warning_description}"
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* SECOND WARNING CARD */}
                                <div className="p-6 rounded-3xl bg-white border border-gray-200/80 shadow-xs flex flex-col justify-between space-y-4">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 flex items-center justify-center shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                </div>
                                                <span className={selectedItem.has_second_warning ? 'text-orange-950' : selectedItem.is_eligible_for_second_warning ? 'text-rose-950' : 'text-gray-900'}>
                                                    Second Warning
                                                </span>
                                            </h3>
                                            {selectedItem.has_second_warning ? (
                                                <span className="px-2.5 py-1 bg-orange-50 text-orange-800 rounded-lg text-[10px] font-black border border-orange-200">
                                                    Issued
                                                </span>
                                            ) : selectedItem.is_eligible_for_second_warning ? (
                                                <span className="px-2.5 py-1 bg-rose-50 text-rose-800 rounded-lg text-[10px] font-black border border-rose-200 animate-pulse flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <span>Eligible Now</span>
                                                </span>
                                            ) : (
                                                <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-bold border border-gray-200 flex items-center gap-1">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                    </svg>
                                                    <span>Locked</span>
                                                </span>
                                            )}
                                        </div>

                                        {selectedItem.has_second_warning ? (
                                            <div className="space-y-2.5 text-xs">
                                                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                    <span className="text-gray-400 font-semibold">Issued Date:</span>
                                                    <span className="font-extrabold text-gray-900">{formatDateTime(selectedItem.second_warning_date)}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                    <span className="text-gray-400 font-semibold">Violation Type:</span>
                                                    <span className="font-black text-orange-900 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-200/60">
                                                        {selectedItem.second_warning_violation || 'Repeat Violation'}
                                                    </span>
                                                </div>
                                                {selectedItem.second_warning_issuer_name && (
                                                    <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                        <span className="text-gray-400 font-semibold">Issued By:</span>
                                                        <span className="font-bold text-gray-800">{selectedItem.second_warning_issuer_name}</span>
                                                    </div>
                                                )}
                                                {selectedItem.second_warning_description && (
                                                    <div className="pt-2">
                                                        <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-wider block mb-1">Citation Remarks:</span>
                                                        <div className="text-xs text-gray-800 italic leading-relaxed bg-orange-50/60 p-3.5 rounded-2xl border border-orange-200/60">
                                                            "{selectedItem.second_warning_description}"
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedItem.is_eligible_for_endorsement && (
                                                    <div className="pt-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsEndorseModalOpen(true)}
                                                            className="w-full py-2.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                            </svg>
                                                            <span>Endorse to Barangay San Vicente</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : selectedItem.is_eligible_for_second_warning ? (
                                            <div className="p-4 bg-rose-50/70 rounded-2xl border border-rose-200 text-xs space-y-3">
                                                <div className="flex items-start gap-2.5 text-rose-800">
                                                    <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <strong className="block font-black text-rose-950">Observation Period Expired</strong>
                                                        <p className="text-[11px] leading-relaxed text-rose-900 mt-0.5">
                                                            The 3-day observation period has expired without verified resolution. Case is now officially eligible for authorized personnel review and Second Warning issuance.
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsSecondWarningModalOpen(true)}
                                                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
                                                >
                                                    <span>Issue Second Warning</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200/80 text-xs space-y-3 text-gray-600">
                                                <div className="flex items-center gap-2 font-bold text-gray-800">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                    </svg>
                                                    <span>Observation Period Active</span>
                                                </div>
                                                <p className="text-[11px] leading-relaxed text-gray-500">
                                                    Under subdivision enforcement policy, the Second Warning is strictly locked until the 3-day observation countdown expires without verified resolution.
                                                </p>
                                                <div className="pt-1 border-t border-gray-200/60 flex items-center justify-between text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                                    <span>Escalation Rule</span>
                                                    <span>Unlocks after Day 3</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 5: ANIMAL AND OWNER INFORMATION (Two-column layout) */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
                                {/* Animal & Incident Details (Clickable to redirect to original report) */}
                                <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => navigate(`/subd/reports/${selectedItem.report_id}`)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            navigate(`/subd/reports/${selectedItem.report_id}`);
                                        }
                                    }}
                                    title={`Click to view original Report #${selectedItem.report_id}`}
                                    className="p-6 rounded-3xl bg-white border border-gray-200/80 hover:border-amber-400/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 cursor-pointer group focus:outline-hidden focus:ring-2 focus:ring-amber-500/30"
                                >
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-gray-100 gap-2">
                                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-orange-50 border border-orange-200/80 text-orange-600 flex items-center justify-center shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                </div>
                                                <span>Animal & Incident Details</span>
                                            </h3>
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 group-hover:bg-amber-100 border border-amber-200/80 text-amber-900 group-hover:text-amber-950 text-[11px] font-black transition-colors shrink-0">
                                                <span>Report #{selectedItem.report_id}</span>
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                            </span>
                                        </div>

                                        <div className="flex flex-col sm:flex-row items-start gap-4">
                                            {/* Animal Photo with hover cue */}
                                            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gray-100 border border-gray-200 overflow-hidden shrink-0 shadow-2xs relative">
                                                {selectedItem.animal_photo || selectedItem.report_photo ? (
                                                    <img
                                                        src={cloudinaryResized(selectedItem.animal_photo || selectedItem.report_photo, 240)}
                                                        alt={getAnimalDisplayName(selectedItem)}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-amber-50/50">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                                        </svg>
                                                        <span className="text-[9px] font-bold mt-1 text-gray-400">No Photo</span>
                                                    </div>
                                                )}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-end justify-center pb-2 pointer-events-none">
                                                    <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/75 backdrop-blur-xs text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
                                                        <span>View Report</span>
                                                        <span>↗</span>
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex-1 w-full space-y-2 text-xs">
                                                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                    <span className="text-gray-400 font-semibold">Species / Breed:</span>
                                                    <span className="font-extrabold text-gray-900 group-hover:text-amber-900 transition-colors">
                                                        {selectedItem.report_animal_type || 'Animal'} · {selectedItem.report_breed || 'Mixed Breed'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                    <span className="text-gray-400 font-semibold">Incident Category:</span>
                                                    <span className="font-bold text-gray-800">{selectedItem.report_category_name || 'Incident'}</span>
                                                </div>
                                                <div className="flex justify-between items-center py-1 border-b border-gray-50">
                                                    <span className="text-gray-400 font-semibold">Landmark / Location:</span>
                                                    <span className="font-bold text-gray-800 text-right max-w-[200px] truncate" title={selectedItem.report_landmark || ''}>
                                                        {selectedItem.report_landmark || 'Subdivision Premises'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {selectedItem.report_description && (
                                            <div className="pt-2">
                                                <span className="text-gray-400 block text-[10px] font-extrabold uppercase tracking-wider mb-1">Reported Notes:</span>
                                                <div className="text-xs text-gray-700 italic leading-relaxed bg-stone-50 group-hover:bg-amber-50/40 p-3.5 rounded-2xl border border-stone-200/70 transition-colors">
                                                    "{selectedItem.report_description}"
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400 group-hover:text-amber-800 transition-colors">
                                        <span className="font-semibold flex items-center gap-1.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span>Original Incident Report #{selectedItem.report_id}</span>
                                        </span>
                                        <span className="font-extrabold flex items-center gap-1 text-amber-600 group-hover:text-amber-700">
                                            <span>Open Report</span>
                                            <span>→</span>
                                        </span>
                                    </div>
                                </div>

                                {/* Identified Owner Details */}
                                <div className="p-6 rounded-3xl bg-white border border-gray-200/80 shadow-xs flex flex-col justify-between space-y-4">
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-wider flex items-center gap-2.5">
                                                <div className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/80 text-blue-600 flex items-center justify-center shrink-0">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                    </svg>
                                                </div>
                                                <span>Identified Owner Details</span>
                                            </h3>
                                            <span className="px-2.5 py-1 bg-blue-50 text-blue-800 rounded-lg text-[10px] font-black border border-blue-200/80">
                                                Resident On Record
                                            </span>
                                        </div>

                                        <div className="space-y-2.5 text-xs">
                                            <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                                                <span className="text-gray-400 font-semibold">Owner Name:</span>
                                                <span className="font-black text-gray-950 text-sm">{selectedItem.owner_name || 'Identified Owner'}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                                                <span className="text-gray-400 font-semibold">Contact Number:</span>
                                                <span className="font-extrabold text-gray-800">{selectedItem.owner_phone || 'None recorded'}</span>
                                            </div>
                                            <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
                                                <span className="text-gray-400 font-semibold">Address / Location:</span>
                                                <span className="font-bold text-gray-800 text-right max-w-[220px]" title={selectedItem.owner_address || selectedItem.report_landmark || ''}>
                                                    {selectedItem.owner_address || selectedItem.report_landmark || 'Subdivision Premises'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2.5 pt-2">
                                        {selectedItem.owner_acknowledged_at && (
                                            <div className="p-3.5 bg-emerald-50/80 rounded-2xl border border-emerald-200/80 flex items-start gap-3">
                                                <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-xs shrink-0 mt-0.5">
                                                    ✓
                                                </div>
                                                <div className="space-y-0.5">
                                                    <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider block">
                                                        Owner Notice Acknowledged
                                                    </span>
                                                    <p className="text-xs text-emerald-900 font-medium">
                                                        {formatDateTime(selectedItem.owner_acknowledged_at)} ({selectedItem.owner_acknowledgement_method || 'Online Account'})
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                        <div className="p-3 bg-stone-50 rounded-2xl border border-stone-200/60 text-[11px] text-gray-500 font-medium flex items-center gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span>Direct owner communication verified for observation updates.</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 5B: OWNER OBSERVATION UPDATES (owner submissions, separate from staff logs) */}
                            <SubdOwnerUpdatesSection
                                followupId={selectedItem.followup_id}
                                updates={selectedItem.owner_updates || []}
                                canReview={selectedItem.workflow_section !== 'resolved'}
                                onReviewed={handleOwnerUpdateReviewed}
                            />

                            {/* SECTION 6: MONITORING HISTORY (Timeline format matching requested design) */}
                            <div className="bg-white rounded-3xl border border-gray-200/90 p-5 sm:p-7 space-y-6 shadow-xs hover:shadow-md transition-all duration-300">
                                <div className="flex items-start justify-between pb-1">
                                    <div>
                                        <h3 className="text-base font-bold text-gray-900 tracking-tight">
                                            Monitoring History
                                        </h3>
                                        <p className="text-xs text-gray-500 mt-0.5 font-medium">
                                            Official subdivision inspection records
                                        </p>
                                    </div>
                                    <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-semibold border border-gray-200/60">
                                        {selectedItem.logs?.length || 0} {selectedItem.logs?.length === 1 ? 'Record' : 'Records'}
                                    </span>
                                </div>

                                {/* Logs List with Vertical Timeline */}
                                {(!selectedItem.logs || selectedItem.logs.length === 0) ? (
                                    <div className="py-8 text-center text-xs text-gray-400 font-medium bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                                        No official inspection records logged yet.
                                    </div>
                                ) : (
                                    <div className="space-y-0.5">
                                        {selectedItem.logs.map((lg, index) => {
                                            const outcomeLabel = getMonitoringOutcomeLabel(lg);
                                            const isLast = index === (selectedItem.logs?.length ?? 0) - 1;
                                            return (
                                                <div
                                                    key={lg.contact_log_id}
                                                    className="group/log flex items-stretch gap-3.5 sm:gap-4 p-2 sm:p-3 rounded-2xl hover:bg-amber-50/30 transition-all duration-300"
                                                >
                                                    {/* Step Number & Vertical Timeline Connector */}
                                                    <div className="flex flex-col items-center shrink-0 w-6">
                                                        <div className="w-6 h-6 rounded-full bg-stone-100 group-hover/log:bg-amber-500 border border-stone-200/90 group-hover/log:border-amber-500 text-stone-700 group-hover/log:text-white text-[11px] font-black flex items-center justify-center shrink-0 shadow-2xs group-hover/log:scale-110 group-hover/log:shadow-xs transition-all duration-300">
                                                            {index + 1}
                                                        </div>
                                                        {!isLast && (
                                                            <div className="w-0.5 bg-gradient-to-b from-stone-200 via-stone-200 to-transparent flex-1 my-1.5" />
                                                        )}
                                                    </div>

                                                    {/* Content Column */}
                                                    <div className={`flex-1 space-y-2.5 ${!isLast ? 'pb-5' : 'pb-1'}`}>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h4 className="text-sm font-bold text-gray-900 leading-none group-hover/log:text-amber-950 transition-colors">
                                                                {getMonitoringMethodLabel(lg)}
                                                            </h4>
                                                            <span
                                                                className="text-xs text-gray-500 font-medium shrink-0"
                                                                title={formatDateTime(lg.created_at || lg.contact_date)}
                                                            >
                                                                {formatCardTime(lg.created_at || lg.contact_date)}
                                                            </span>
                                                        </div>

                                                        {outcomeLabel && (
                                                            <div>
                                                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold shadow-2xs ${getOutcomeBadgeClass(lg.inspection_outcome, outcomeLabel)}`}>
                                                                    {outcomeLabel}
                                                                </span>
                                                            </div>
                                                        )}

                                                        <p className="text-xs text-gray-500 font-medium flex items-center gap-1.5">
                                                            <span className="text-gray-400">Logged by:</span>
                                                            <span className="font-semibold text-gray-700">{lg.logger_role || lg.logger_name || 'Subdivision Leader'}</span>
                                                        </p>

                                                        <div className="p-3.5 rounded-2xl bg-white border border-stone-200/80 text-gray-800 text-xs font-medium leading-relaxed whitespace-pre-wrap break-words shadow-2xs group-hover/log:border-amber-200/90 group-hover/log:shadow-xs transition-all">
                                                            "{lg.notes}"
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Bottom Full-Width Add Monitoring Log Button */}
                                {selectedItem.workflow_section !== 'resolved' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setLogErrorMessage(null);
                                            setIsAddLogModalOpen(true);
                                        }}
                                        className="w-full py-2.5 sm:py-3 rounded-full border border-gray-300 hover:border-amber-400 bg-white hover:bg-amber-50/40 active:scale-[0.99] text-gray-700 hover:text-amber-900 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-2xs hover:shadow-xs group mt-4"
                                    >
                                        <span className="w-5 h-5 rounded-full bg-gray-100 group-hover:bg-amber-500 group-hover:text-white text-gray-600 font-bold flex items-center justify-center text-xs group-hover:rotate-90 transition-all duration-300">
                                            +
                                        </span>
                                        <span>Add Monitoring Log</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* UNDER OBSERVATION LIST VIEW */
                        <div className="max-w-7xl mx-auto space-y-6">
                            {/* 1. OWNER UPDATE NOTIFICATION BANNER */}
                            {unreviewedOwnerUpdates.length > 0 && (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5 rounded-2xl bg-[#EBF5FF] border border-blue-200 shadow-2xs">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0 text-sm">
                                            📢
                                        </div>
                                        <span className="w-5 h-5 rounded-full bg-[#1D4ED8] text-white text-[11px] font-black flex items-center justify-center shrink-0">
                                            {unreviewedOwnerUpdates.reduce((n, it) => n + (it.unreviewed_owner_updates_count || 0), 0)}
                                        </span>
                                        <span className="text-xs sm:text-sm font-bold text-slate-800">
                                            {unreviewedOwnerUpdates.reduce((n, it) => n + (it.unreviewed_owner_updates_count || 0), 0)} new owner observation update(s) waiting for review across {unreviewedOwnerUpdates.length} {unreviewedOwnerUpdates.length === 1 ? 'case' : 'cases'}.
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleViewDetails(unreviewedOwnerUpdates[0])}
                                        className="self-start sm:self-auto px-4 py-2 rounded-xl bg-[#004B87] hover:bg-[#003865] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors shrink-0"
                                    >
                                        <span>Review {getAnimalDisplayName(unreviewedOwnerUpdates[0])}</span>
                                        <span>→</span>
                                    </button>
                                </div>
                            )}

                            {/* 3. FOUR KPI SUMMARY CARDS */}
                            <div data-observation-summary className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                {/* KPI 1 — ACTIVE OBSERVATION */}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('active')}
                                    className={`text-left w-full relative p-3 sm:p-5 rounded-2xl bg-white border cursor-pointer transition-all duration-200 hover:shadow-md overflow-hidden min-h-[96px] sm:min-h-[110px] flex flex-col justify-between ${
                                        activeTab === 'active'
                                            ? 'border-amber-400 ring-2 ring-amber-400/20 shadow-xs'
                                            : 'border-amber-100/80 hover:border-amber-300 shadow-2xs'
                                    }`}
                                >
                                    <div className="absolute top-2 right-2.5 pointer-events-none select-none text-amber-200/50">
                                        <svg className="w-8 h-8 sm:w-10 sm:h-10 fill-current" viewBox="0 0 24 24">
                                            <ellipse cx="12" cy="15.5" rx="4.5" ry="3.5" />
                                            <circle cx="6.5" cy="10.5" r="2.2" />
                                            <circle cx="10" cy="6.8" r="2" />
                                            <circle cx="14" cy="6.8" r="2" />
                                            <circle cx="17.5" cy="10.5" r="2.2" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
                                            {formatCount(metrics.active_observation_count)}
                                        </div>
                                        <div className="text-xs sm:text-sm font-bold text-slate-800 leading-tight mt-1">Active Observation</div>
                                    </div>
                                    <p className="hidden sm:block text-[11px] text-slate-500 font-medium truncate">
                                        Within 3-day window
                                    </p>
                                </button>

                                {/* KPI 2 — WARNING & ESCALATION */}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('warning_escalation')}
                                    className={`text-left w-full relative p-3 sm:p-5 rounded-2xl bg-white border cursor-pointer transition-all duration-200 hover:shadow-md overflow-hidden min-h-[96px] sm:min-h-[110px] flex flex-col justify-between ${
                                        activeTab === 'warning_escalation' || activeTab === 'for_second_warning' || activeTab === 'second_warning_issued'
                                            ? 'border-rose-400 ring-2 ring-rose-400/20 shadow-xs'
                                            : 'border-rose-100/80 hover:border-rose-300 shadow-2xs'
                                    }`}
                                >
                                    <div className="absolute top-2 right-2.5 pointer-events-none select-none text-rose-200/50">
                                        <svg className="w-8 h-8 sm:w-10 sm:h-10 fill-current" viewBox="0 0 24 24">
                                            <ellipse cx="12" cy="15.5" rx="4.5" ry="3.5" />
                                            <circle cx="6.5" cy="10.5" r="2.2" />
                                            <circle cx="10" cy="6.8" r="2" />
                                            <circle cx="14" cy="6.8" r="2" />
                                            <circle cx="17.5" cy="10.5" r="2.2" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
                                            {formatCount(metrics.for_second_warning_count + metrics.second_warning_issued_count)}
                                        </div>
                                        <div className="text-xs sm:text-sm font-bold text-slate-800 leading-tight mt-1">Warning & Escalation</div>
                                    </div>
                                    <p className="hidden sm:block text-[11px] text-slate-500 font-medium truncate">
                                        2nd Warning & Escalated
                                    </p>
                                </button>

                                {/* KPI 3 — BARANGAY ENDORSED */}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('endorsed')}
                                    className={`text-left w-full relative p-3 sm:p-5 rounded-2xl bg-white border cursor-pointer transition-all duration-200 hover:shadow-md overflow-hidden min-h-[96px] sm:min-h-[110px] flex flex-col justify-between ${
                                        activeTab === 'endorsed'
                                            ? 'border-purple-400 ring-2 ring-purple-400/20 shadow-xs'
                                            : 'border-purple-100/80 hover:border-purple-300 shadow-2xs'
                                    }`}
                                >
                                    <div className="absolute top-2 right-2.5 pointer-events-none select-none text-purple-200/50">
                                        <svg className="w-8 h-8 sm:w-10 sm:h-10 fill-current" viewBox="0 0 24 24">
                                            <ellipse cx="12" cy="15.5" rx="4.5" ry="3.5" />
                                            <circle cx="6.5" cy="10.5" r="2.2" />
                                            <circle cx="10" cy="6.8" r="2" />
                                            <circle cx="14" cy="6.8" r="2" />
                                            <circle cx="17.5" cy="10.5" r="2.2" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
                                            {formatCount(metrics.endorsed_count)}
                                        </div>
                                        <div className="text-xs sm:text-sm font-bold text-slate-800 leading-tight mt-1">Referred to Barangay</div>
                                    </div>
                                    <p className="hidden sm:block text-[11px] text-slate-500 font-medium truncate">
                                        Referred to Barangay
                                    </p>
                                </button>

                                {/* KPI 4 — RESOLVED CASES */}
                                <button
                                    type="button"
                                    onClick={() => setActiveTab('resolved')}
                                    className={`text-left w-full relative p-3 sm:p-5 rounded-2xl bg-white border cursor-pointer transition-all duration-200 hover:shadow-md overflow-hidden min-h-[96px] sm:min-h-[110px] flex flex-col justify-between ${
                                        activeTab === 'resolved'
                                            ? 'border-emerald-400 ring-2 ring-emerald-400/20 shadow-xs'
                                            : 'border-emerald-100/80 hover:border-emerald-300 shadow-2xs'
                                    }`}
                                >
                                    <div className="absolute top-2 right-2.5 pointer-events-none select-none text-emerald-200/50">
                                        <svg className="w-8 h-8 sm:w-10 sm:h-10 fill-current" viewBox="0 0 24 24">
                                            <ellipse cx="12" cy="15.5" rx="4.5" ry="3.5" />
                                            <circle cx="6.5" cy="10.5" r="2.2" />
                                            <circle cx="10" cy="6.8" r="2" />
                                            <circle cx="14" cy="6.8" r="2" />
                                            <circle cx="17.5" cy="10.5" r="2.2" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none">
                                            {formatCount(metrics.resolved_count)}
                                        </div>
                                        <div className="text-xs sm:text-sm font-bold text-slate-800 leading-tight mt-1">Resolved Cases</div>
                                    </div>
                                    <p className="hidden sm:block text-[11px] text-slate-500 font-medium truncate">
                                        Verified compliance
                                    </p>
                                </button>
                            </div>

                            {/* 4. WORKFLOW STATUS CONTROLS (Mobile dropdown & Desktop wrapping tabs) */}
                            <div>
                                {/* Mobile Status Dropdown (below 768px, no horizontal swiping) */}
                                <div className="md:hidden w-full">
                                    <label htmlFor="observation-status" className="sr-only">Status</label>
                                    <select
                                        id="observation-status"
                                        value={activeTab}
                                        onChange={(e) => setActiveTab(e.target.value as any)}
                                        className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-2xs focus:outline-hidden focus:ring-2 focus:ring-amber-500/20"
                                    >
                                        <option value="all">All Cases ({items.length})</option>
                                        <option value="active">Active Observation ({metrics.active_observation_count})</option>
                                        <option value="warning_escalation">Warning & Escalation ({metrics.for_second_warning_count + metrics.second_warning_issued_count})</option>
                                        <option value="for_second_warning">For Second Warning ({metrics.for_second_warning_count})</option>
                                        <option value="second_warning_issued">Second Warning Issued ({metrics.second_warning_issued_count})</option>
                                        <option value="endorsed">Referred to Barangay ({metrics.endorsed_count})</option>
                                        <option value="resolved">Resolved ({metrics.resolved_count})</option>
                                    </select>
                                </div>

                                {/* Desktop Status Tabs (768px and above, wrapping pills without sideways scroll) */}
                                <div data-observation-tabs className="hidden md:flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('all')}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                            activeTab === 'all'
                                                ? 'bg-[#EA580C] text-white shadow-xs'
                                                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80 shadow-2xs'
                                        }`}
                                    >
                                        <span>All Cases</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                            activeTab === 'all' ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {formatCount(items.length)}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('active')}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                            activeTab === 'active'
                                                ? 'bg-[#EA580C] text-white shadow-xs'
                                                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80 shadow-2xs'
                                        }`}
                                    >
                                        <span>Active Observation</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                            activeTab === 'active' ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {formatCount(metrics.active_observation_count)}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('for_second_warning')}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                            activeTab === 'for_second_warning'
                                                ? 'bg-[#EA580C] text-white shadow-xs'
                                                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80 shadow-2xs'
                                        }`}
                                    >
                                        <span>For Second Warning</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                            activeTab === 'for_second_warning' ? 'bg-orange-700 text-white' : 'bg-rose-100 text-rose-800'
                                        }`}>
                                            {formatCount(metrics.for_second_warning_count)}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('second_warning_issued')}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                            activeTab === 'second_warning_issued'
                                                ? 'bg-[#EA580C] text-white shadow-xs'
                                                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80 shadow-2xs'
                                        }`}
                                    >
                                        <span>Second Warning Issued</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                            activeTab === 'second_warning_issued' ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {formatCount(metrics.second_warning_issued_count)}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('endorsed')}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                            activeTab === 'endorsed'
                                                ? 'bg-[#EA580C] text-white shadow-xs'
                                                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80 shadow-2xs'
                                        }`}
                                    >
                                        <span>Referred to Barangay</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                            activeTab === 'endorsed' ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {formatCount(metrics.endorsed_count)}
                                        </span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('resolved')}
                                        className={`px-4 py-2 rounded-full text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                                            activeTab === 'resolved'
                                                ? 'bg-[#EA580C] text-white shadow-xs'
                                                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80 shadow-2xs'
                                        }`}
                                    >
                                        <span>Resolved</span>
                                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                            activeTab === 'resolved' ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-700'
                                        }`}>
                                            {formatCount(metrics.resolved_count)}
                                        </span>
                                    </button>
                                </div>
                            </div>

                            {/* 5. SEARCH AND FILTER TOOLBAR */}
                            <div data-observation-controls className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                {/* Search Box */}
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </div>
                                    <input
                                        type="text"
                                        aria-label="Search observation cases"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Search by animal name, owner, Report ID, or location..."
                                        className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all shadow-2xs"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            aria-label="Clear search"
                                            onClick={() => setSearchQuery('')}
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>

                                {/* Filter Controls */}
                                <div className="flex items-center gap-2 overflow-x-auto shrink-0">
                                    {/* Observation Day Filter */}
                                    <select
                                        value={dayFilter}
                                        onChange={(e) => setDayFilter(e.target.value)}
                                        aria-label="Filter by observation day"
                                        className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 cursor-pointer shadow-2xs"
                                    >
                                        <option value="all">All Days</option>
                                        <option value="1">Day 1 of 3</option>
                                        <option value="2">Day 2 of 3</option>
                                        <option value="3">Day 3 of 3</option>
                                    </select>

                                    {/* Refresh Button */}
                                    <button
                                        type="button"
                                        onClick={() => fetchDashboard(true)}
                                        disabled={refreshing}
                                        aria-label="Refresh records"
                                        className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 shadow-2xs hover:text-amber-600 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                                        title="Refresh records"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-amber-500' : ''}`}
                                            fill="none"
                                            viewBox="0 0 24 24"
                                            stroke="currentColor"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                            />
                                        </svg>
                                        <span className="hidden sm:inline">{refreshing ? 'Refreshing...' : 'Refresh'}</span>
                                    </button>
                                </div>
                            </div>

                            {/* 6. ANIMAL OBSERVATION CASES LIST (CARD-ONLY PRESENTATION) */}
                            {loading ? (
                                <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-2xs">
                                    <div className="inline-block animate-spin text-amber-500 text-3xl mb-3">⏳</div>
                                    <h3 className="text-base font-black text-slate-800">Loading Under Observation Cases...</h3>
                                    <p className="text-xs text-slate-400 mt-1">Retrieving 3-day observation countdown and warning escalation records.</p>
                                </div>
                            ) : filteredItems.length === 0 ? (
                                <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-2xs">
                                    <div className="w-16 h-16 mx-auto mb-4 bg-amber-50 rounded-2xl flex items-center justify-center text-2xl">
                                        🐾
                                    </div>
                                    <h3 className="text-base font-black text-slate-800">
                                        {activeTab === 'active'
                                            ? 'No Active Observation Cases'
                                            : activeTab === 'for_second_warning'
                                                ? 'No Cases Awaiting Second Warning'
                                                : activeTab === 'second_warning_issued'
                                                    ? 'No Cases with Second Warning Issued'
                                                    : activeTab === 'warning_escalation'
                                                        ? 'No Warning or Escalation Cases'
                                                        : activeTab === 'endorsed'
                                                            ? 'No Cases Endorsed to Barangay'
                                                            : activeTab === 'resolved'
                                                                ? 'No Resolved Cases Yet'
                                                                : 'No Cases Found'}
                                    </h3>
                                    <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                                        {activeTab === 'active'
                                            ? 'Reports automatically start the 3-day observation period immediately when subdivision personnel issue a First Warning.'
                                            : activeTab === 'for_second_warning'
                                                ? 'Cases that exceed 3 days without verified compliance will appear here for Second Warning review.'
                                                : activeTab === 'second_warning_issued'
                                                    ? 'Cases with an issued Second Warning will appear here, eligible for Barangay San Vicente endorsement.'
                                                    : activeTab === 'warning_escalation'
                                                        ? 'Cases requiring Second Warning review or eligible for Barangay endorsement.'
                                                        : activeTab === 'endorsed'
                                                            ? 'Cases escalated to Barangay San Vicente are listed here.'
                                                            : 'Resolved cases with verified compliance are archived here.'}
                                    </p>
                                    {(searchQuery || dayFilter !== 'all' || activeTab !== 'all') && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearchQuery('');
                                                setDayFilter('all');
                                                setActiveTab('all');
                                            }}
                                            className="mt-4 px-4 py-2 bg-amber-50 text-amber-700 text-xs font-bold rounded-xl hover:bg-amber-100 transition-colors cursor-pointer"
                                        >
                                            View All Cases
                                        </button>
                                    )}
                                </div>
                            ) : (
                                /* CARDS VIEW: RESPONSIVE GRID (NO TABLE) */
                                <div data-observation-cases className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-5">
                                    {filteredItems.map((item) => {
                                        const photoSrc = item.animal_photo || item.report_photo;
                                        const animalTitle = getAnimalDisplayName(item);
                                        return (
                                            <div
                                                key={item.followup_id}
                                                data-observation-case={item.followup_id}
                                                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs hover:shadow-md transition-all p-3.5 sm:p-5 flex flex-col sm:flex-row gap-3.5 sm:gap-4 group"
                                            >
                                                {/* LEFT SECTION — COMPACT ANIMAL PHOTO */}
                                                <div data-case-photo className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-slate-100 overflow-hidden shrink-0 relative flex items-center justify-center self-start">
                                                    {photoSrc ? (
                                                        <img
                                                            src={cloudinaryResized(photoSrc, 300)}
                                                            alt={animalTitle}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 rounded-2xl"
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-2xl">
                                                            <span className="text-2xl sm:text-3xl">🐾</span>
                                                            <span className="text-[10px] font-bold text-slate-400">No Photo</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* RIGHT SECTION — ANIMAL INFORMATION & ACTIONS */}
                                                <div className="flex-1 flex flex-col justify-between min-w-0 space-y-2.5">
                                                    {/* Top Row: Badges */}
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="px-2.5 py-0.5 rounded-full bg-[#1E293B] text-white text-[11px] font-black">
                                                            Report #{item.report_id}
                                                        </span>

                                                        {item.workflow_section === 'resolved' ? (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold">
                                                                Resolved
                                                            </span>
                                                        ) : item.workflow_section === 'endorsed' ? (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300 text-[11px] font-bold">
                                                                Barangay Endorsed
                                                            </span>
                                                        ) : item.workflow_section === 'second_warning_issued' ? (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300 text-[11px] font-bold">
                                                                Second Warning Issued
                                                            </span>
                                                        ) : item.workflow_section === 'for_second_warning' ? (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[11px] font-bold">
                                                                Non-Compliant
                                                            </span>
                                                        ) : (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800 border border-orange-300 text-[11px] font-bold">
                                                                First Warning Issued
                                                            </span>
                                                        )}

                                                        {item.workflow_section === 'active' && (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold">
                                                                Day {item.current_observation_day || 1} of 3
                                                            </span>
                                                        )}
                                                        {item.workflow_section === 'for_second_warning' && (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-red-500 text-white text-[11px] font-bold">
                                                                Overdue
                                                            </span>
                                                        )}
                                                        {item.workflow_section === 'second_warning_issued' && (
                                                            <span className="px-2.5 py-0.5 rounded-full bg-sky-500 text-white text-[11px] font-bold">
                                                                Endorse to Barangay
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Middle: Info */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                                        <div className="space-y-1">
                                                            <h3 className="text-sm font-black text-slate-900 leading-snug truncate">
                                                                {animalTitle}
                                                            </h3>
                                                            <div className="text-[11px] text-slate-600 truncate">
                                                                <span className="text-slate-400 font-medium">Owner: </span>
                                                                <span className="font-bold text-slate-800">{item.owner_name || 'Resident / Pet Owner'}</span>
                                                            </div>
                                                            <div className="text-[11px] text-slate-600 truncate">
                                                                <span className="text-slate-400 font-medium">Contact: </span>
                                                                <span className="font-semibold text-slate-800">{item.owner_phone || 'No phone recorded'}</span>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-1 sm:pl-3 sm:border-l sm:border-slate-100">
                                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                                {item.workflow_section === 'resolved'
                                                                    ? 'Resolved Date'
                                                                    : item.workflow_section === 'endorsed'
                                                                        ? 'Endorsed Date'
                                                                        : item.workflow_section === 'second_warning_issued'
                                                                            ? 'Second Warning'
                                                                            : 'Observation Period'}
                                                            </div>
                                                            <div className="text-xs font-bold text-slate-800">
                                                                {formatCardDate(item.resolved_at || item.endorsement_date || item.second_warning_date || item.first_warning_date)}
                                                            </div>
                                                            <div className="text-[11px] font-bold text-amber-600">
                                                                {item.remaining_time_display || item.observation_day_display || ''}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Progress / Accent Bar */}
                                                    <div className="w-full pt-1">
                                                        <div
                                                            role="progressbar"
                                                            aria-valuenow={item.progress_percent || 0}
                                                            aria-valuemin={0}
                                                            aria-valuemax={100}
                                                            className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden"
                                                        >
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    item.workflow_section === 'resolved'
                                                                        ? 'bg-emerald-500'
                                                                        : item.workflow_section === 'endorsed' || item.workflow_section === 'second_warning_issued'
                                                                            ? 'bg-purple-500'
                                                                            : item.workflow_section === 'for_second_warning'
                                                                                ? 'bg-red-500'
                                                                                : 'bg-amber-500'
                                                                }`}
                                                                style={{ width: `${Math.min(100, Math.max(5, item.progress_percent || 0))}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Action Buttons */}
                                                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleViewDetails(item)}
                                                            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer shadow-2xs"
                                                        >
                                                            View Details
                                                        </button>

                                                        {item.workflow_section === 'active' && (item.unreviewed_owner_updates_count || 0) > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleViewDetails(item)}
                                                                className="px-3.5 py-1.5 bg-[#004B87] hover:bg-[#003865] text-white rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                                                            >
                                                                Review Owner Update
                                                            </button>
                                                        )}

                                                        {item.workflow_section === 'for_second_warning' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedItem(item);
                                                                    setIsSecondWarningModalOpen(true);
                                                                }}
                                                                className="px-3.5 py-1.5 bg-[#D9531E] hover:bg-[#B84214] text-white rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                                                            >
                                                                Issue Second Warning
                                                            </button>
                                                        )}

                                                        {item.workflow_section === 'second_warning_issued' && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setSelectedItem(item);
                                                                    setIsEndorseModalOpen(true);
                                                                }}
                                                                className="px-3.5 py-1.5 bg-[#4C1D95] hover:bg-[#3B0764] text-white rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                                                            >
                                                                Refer to Barangay
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </main>
            </div>

            {/* Bottom Nav for mobile */}
            <SubdBottomNav />

            {/* ADD MONITORING LOG POPUP PANEL */}
            {isAddLogModalOpen && selectedItem && (
                <div
                    className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="modal-add-log-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !isSubmittingLog) {
                            setIsAddLogModalOpen(false);
                        }
                    }}
                >
                    <div
                        className="bg-white rounded-3xl max-w-[620px] w-full p-6 sm:p-7 shadow-2xl border border-gray-100 space-y-5 animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-start justify-between pb-3.5 border-b border-gray-100 gap-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-black shrink-0">
                                    📋
                                </div>
                                <div>
                                    <h3 id="modal-add-log-title" className="text-base sm:text-lg font-black text-gray-900 tracking-tight">
                                        Add Monitoring Log
                                    </h3>
                                    <p className="text-xs text-gray-500 mt-0.5 font-medium">
                                        Record a daily inspection, owner follow-up, or compliance update.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!isSubmittingLog) setIsAddLogModalOpen(false);
                                }}
                                disabled={isSubmittingLog}
                                aria-label="Close modal"
                                className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 flex items-center justify-center text-sm font-bold transition-colors cursor-pointer disabled:opacity-50"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Error Message if submit failed */}
                        {logErrorMessage && (
                            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                                <span className="text-rose-600 font-bold shrink-0">⚠️</span>
                                <div className="flex-1 leading-relaxed">{logErrorMessage}</div>
                            </div>
                        )}

                        {/* Observation context pill */}
                        <div className="px-3.5 py-2 rounded-xl bg-amber-50/70 border border-amber-200/70 flex flex-wrap items-center justify-between gap-2 text-xs">
                            <span className="font-extrabold text-amber-950">
                                Report #{selectedItem.report_id} · {getAnimalDisplayName(selectedItem)}
                            </span>
                            <span className="text-amber-800 font-bold">
                                {selectedItem.observation_day_display}
                            </span>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleAddLog} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                {/* Field 1: Contact / Inspection Method */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                                        Contact / Inspection Method <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={logMethod}
                                        onChange={(e) => {
                                            setLogMethod(e.target.value);
                                            if (logErrorMessage) setLogErrorMessage(null);
                                        }}
                                        disabled={isSubmittingLog}
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer"
                                    >
                                        {MONITORING_METHOD_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Field 2: Inspection Outcome */}
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide mb-1.5">
                                        Inspection Outcome <span className="text-rose-500">*</span>
                                    </label>
                                    <select
                                        value={logOutcome}
                                        onChange={(e) => {
                                            setLogOutcome(e.target.value);
                                            if (logErrorMessage) setLogErrorMessage(null);
                                        }}
                                        disabled={isSubmittingLog}
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer"
                                    >
                                        {MONITORING_OUTCOME_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Field 3: Staff Notes & Evidence Details */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                                        Staff Notes & Evidence Details <span className="text-rose-500">*</span>
                                    </label>
                                    <span className="text-[11px] text-gray-400 font-medium">
                                        {logNote.length}/2000
                                    </span>
                                </div>
                                <textarea
                                    value={logNote}
                                    onChange={(e) => {
                                        setLogNote(e.target.value);
                                        if (logErrorMessage) setLogErrorMessage(null);
                                    }}
                                    disabled={isSubmittingLog}
                                    rows={4}
                                    maxLength={2000}
                                    placeholder="Describe monitoring findings, owner interaction, animal location, compliance status, and supporting evidence."
                                    className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all leading-relaxed"
                                />
                            </div>

                            {/* Footer Actions */}
                            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!isSubmittingLog) setIsAddLogModalOpen(false);
                                    }}
                                    disabled={isSubmittingLog}
                                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingLog || !logNote.trim()}
                                    className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                                >
                                    {isSubmittingLog ? (
                                        <>
                                            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                                            <span>Saving...</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>💾</span>
                                            <span>Save Monitoring Log</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* RESOLVE / VERIFY COMPLIANCE MODAL (Requirement 3) */}
            {isResolveModalOpen && selectedItem && (
                <div className="fixed inset-0 z-60 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-black">
                                ✓
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">Verify & Resolve Observation Case</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Report #{selectedItem.report_id} · {getAnimalDisplayName(selectedItem)}</p>
                            </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-xs text-emerald-900 leading-relaxed">
                            <strong>Official Verification Rule:</strong> Do not resolve based solely on unverified owner claims. Resolution must be verified by authorized subdivision personnel on-site or via direct confirmation.
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                                Verification Remarks / Notes <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                                value={resolveNotes}
                                onChange={(e) => setResolveNotes(e.target.value)}
                                rows={3}
                                placeholder="State how resolution was verified (e.g., Inspected residence, confirmed dog is leashed inside compound with secure gate installed)..."
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsResolveModalOpen(false);
                                    setResolveNotes('');
                                }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmResolve}
                                disabled={isSubmittingResolve || resolveNotes.trim().length < 3}
                                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                            >
                                {isSubmittingResolve ? 'Verifying...' : 'Confirm Resolution & Close'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ISSUE SECOND WARNING MODAL (Requirement 4) */}
            {isSecondWarningModalOpen && selectedItem && (
                <div className="fixed inset-0 z-60 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center text-lg font-black">
                                ⚠️
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">Issue Official Second Warning</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Report #{selectedItem.report_id} · Owner: {selectedItem.owner_name || 'Resident'}</p>
                            </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 text-xs text-rose-900 leading-relaxed">
                            <strong>Notice:</strong> The 3-day observation period has expired without verified compliance. Authorized personnel review is required before issuing the Second Warning. Issuing this warning makes the case eligible for Barangay Endorsement.
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                    Violation Type <span className="text-rose-500">*</span>
                                </label>
                                <select
                                    value={warningViolationType}
                                    onChange={(e) => setWarningViolationType(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 cursor-pointer"
                                >
                                    <option value="Free-Roaming Unleashed">Free-Roaming Unleashed</option>
                                    <option value="Nuisance / Aggressive Behavior">Nuisance / Aggressive Behavior</option>
                                    <option value="Overdue Vaccination">Overdue Vaccination</option>
                                    <option value="Repeated Impoundment Retrieval">Repeated Impoundment Retrieval</option>
                                    <option value="Other">Other Violation</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                    Second Warning Citation Remarks <span className="text-rose-500">*</span>
                                </label>
                                <textarea
                                    value={warningDescription}
                                    onChange={(e) => setWarningDescription(e.target.value)}
                                    rows={3}
                                    placeholder="State specifics of continued non-compliance following the 3-day observation window..."
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                    Fine Amount (Optional, PHP)
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="50"
                                    value={warningFineAmount}
                                    onChange={(e) => setWarningFineAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-rose-500/20"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsSecondWarningModalOpen(false);
                                    setWarningDescription('');
                                }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmSecondWarning}
                                disabled={isSubmittingWarning || !warningDescription.trim()}
                                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                            >
                                {isSubmittingWarning ? 'Issuing...' : 'Issue Second Warning'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ENDORSEMENT TO BARANGAY SAN VICENTE MODAL (Requirement 5) */}
            {isEndorseModalOpen && selectedItem && (
                <div className="fixed inset-0 z-60 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-lg font-black">
                                ⚖️
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">Endorse to Barangay San Vicente</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Formal escalation following First and Second Warnings</p>
                            </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200 text-xs text-purple-900 leading-relaxed">
                            <strong>Scope Notice:</strong> Subdivision personnel do NOT handle animal custody, rescue operations, or physical handover. Endorsement forwards Report #{selectedItem.report_id}, First Warning, 3-Day Observation logs, and Second Warning records to Barangay San Vicente for next-level intervention.
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                    Reason for Barangay Endorsement <span className="text-rose-500">*</span>
                                </label>
                                <textarea
                                    value={endorseReason}
                                    onChange={(e) => setEndorseReason(e.target.value)}
                                    rows={3}
                                    placeholder="Explain escalation reason (e.g., Owner uncooperative following Second Warning, animal remains unleashed, repeated resident complaints)..."
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase mb-1">
                                    Additional Notes / Handover Context (Optional)
                                </label>
                                <textarea
                                    value={endorseNotes}
                                    onChange={(e) => setEndorseNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Any relevant notes for the Barangay enforcement team..."
                                    className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEndorseModalOpen(false);
                                    setEndorseReason('');
                                    setEndorseNotes('');
                                }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmEndorse}
                                disabled={isSubmittingEndorse || !endorseReason.trim()}
                                className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                            >
                                {isSubmittingEndorse ? 'Endorsing...' : 'Confirm Endorsement'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EXTEND MODAL */}
            {isExtendModalOpen && selectedItem && (
                <div className="fixed inset-0 z-60 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-lg font-black">
                                ⏳
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">Extend Observation (+3 Days)</h3>
                                <p className="text-xs text-gray-500 mt-0.5">Extend monitoring window for verified owner cooperation</p>
                            </div>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            Under subdivision policy, observation may be extended by 3 additional calendar days if the owner is actively cooperating or securing necessary pet enclosures.
                        </p>

                        <div>
                            <label className="block text-xs font-bold text-gray-700 uppercase mb-1.5">
                                Justification for Extension <span className="text-rose-500">*</span>
                            </label>
                            <textarea
                                value={extendReason}
                                onChange={(e) => setExtendReason(e.target.value)}
                                rows={3}
                                placeholder="State reason (e.g. Owner installing permanent fence, requested 3 additional days)..."
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                            />
                        </div>

                        <div className="flex items-center justify-end gap-2.5 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsExtendModalOpen(false);
                                    setExtendReason('');
                                }}
                                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmExtend}
                                disabled={isSubmittingExtend || !extendReason.trim()}
                                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                            >
                                {isSubmittingExtend ? 'Extending...' : 'Confirm Extension'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Notice Modal */}
            {noticeMsg && (
                <NoticeModal
                    isOpen={Boolean(noticeMsg)}
                    title={noticeMsg.title}
                    message={noticeMsg.message}
                    onClose={() => setNoticeMsg(null)}
                />
            )}

            {/* Success Modal */}
            {successMsg && (
                <SuccessModal
                    isOpen={Boolean(successMsg)}
                    message={successMsg}
                    onClose={() => setSuccessMsg(null)}
                />
            )}
        </div>
    );
}
