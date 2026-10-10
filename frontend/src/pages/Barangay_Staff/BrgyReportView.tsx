import { useState, useEffect } from 'react';
import OwnerReturnPicker, { EMPTY_OWNER_RETURN, ownerReturnError, prepareOwnerReturn, type OwnerReturnValue } from '../../components/OwnerReturnPicker';
import {
    AlertTriangle, Check, MessageCircle, FileText, Zap, Search, MapPin,
    PawPrint, Home, Flag, Building2, Phone, Mail, Lock, Users, Landmark,
    X, Rocket, Hospital, Settings, ScrollText, CheckCircle2, Lightbulb, Download, Camera,
    ArrowRightCircle, Sparkles, ArrowLeft, Link2, User
} from 'lucide-react';
import axios from 'axios';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import MapComponent from '../../components/MapComponent';
import AISuggestionPanel from '../../components/AISuggestionPanel';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import { useReportChatCount } from '../../utils/chatUtils';
import SuccessModal from '../../components/Modals/SuccessModal';
import { api } from '../../utils/api';
import { getCachedData } from '../../utils/cache';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { REPORT_STATUS_MAP, getReportStatusLabel, getReportStatusBadgeStyle } from '../../utils/reportStatus';
import NoticeModal from '../../components/Modals/NoticeModal';
import ActivityPhotos from '../../components/ActivityPhotos';
import ReportDescription from '../../components/ReportDescription';
import AddPetModal from '../../components/PetRecords/AddPetModal';
import RescueTimeline from '../../components/RescueTimeline';
import { buildCaseTimeline, useCaseHolding } from '../../utils/caseTimeline';

import { SAN_VICENTE_HQ, isValidLatLng } from '../../utils/coverageArea';
import { reportDescriptionSummary } from '../../utils/reportDescription';
import CasePetBadge from '../../components/CasePetBadge';
import InheritedIdentityNotice from '../../components/InheritedIdentityNotice';
import IdentityDisputePanel from '../../components/IdentityDisputePanel';
import DisputeMatchHistory from '../../components/DisputeMatchHistory';
interface Report {
    report_id: number;
    category_id: number;
    status_id: number;
    priority_level: string;
    latitude: number;
    longitude: number;
    landmark: string;
    animal_count: number;
    animal_type: string;
    animal_color?: string | null;
    breed?: string;
    animal_breed?: string | null;
    condition: string;
    behavior_tags?: string;
    description: string;
    visibility: string;
    created_at: string;
    user_id: number;
    subdivision_id?: number;
    barangay_id?: number | null;
    reporter_name?: string;
    reporter_photo?: string;
    reporter_email?: string;
    reporter_phone?: string;
    media?: any[];
    comments?: any[];
    history?: any[];
    ai_animal_type?: string | null;
    ai_dominant_color?: string | null;
    ai_estimated_size?: string | null;
    ai_suggested_risk_level?: string | null;
    ai_suggested_priority?: string | null;
    ai_possible_breed?: string | null;
    ai_suggested_priority_reason?: string | null;
    ai_behavior_chasing?: boolean | null;
    ai_behavior_actual_bite?: boolean | null;
    ai_behavior_attempted_bite?: boolean | null;
    ai_behavior_injury?: boolean | null;
    ai_behavior_aggressive?: boolean | null;
    ai_behavior_explanation?: string | null;
    pet_id?: number | null;
    pet_name?: string | null;
    owner_id?: number | null;
    owner_name?: string | null;
    owner_phone?: string | null;
    owner_email?: string | null;
    owner_address?: string | null;
    endorsement_letter?: {
        title?: string;
        letter_content?: string;
        leader_name?: string;
        leader_position?: string;
        issued_at?: string;
        file_url?: string;
    };
    verification_status?: string | null;
    verification_notes?: string | null;
    verified_by_user_id?: number | null;
    verified_by_name?: string | null;
    verified_at?: string | null;
    duplicate_of_report_id?: number | null;
    merged_at?: string | null;
    merged_by?: number | null;
    merged_by_name?: string | null;
    merge_notes?: string | null;
    merged_reports?: any[];
    has_duplicate_flag?: boolean;
    duplicate_match_count?: number;
    review_status?: string | null;
    review_type?: string | null;
    reviewed_by_name?: string | null;
    reviewed_by_role?: string | null;
    reviewed_at?: string | null;
    review_notes?: string | null;
    matched_pet_record?: any;
    matched_report_record?: any;
    verified_actual_bite?: boolean | null;
    verified_chasing?: boolean | null;
    verified_attempted_bite?: boolean | null;
    verified_injury?: boolean | null;
    verified_aggressive?: boolean | null;
    behavior_finding?: string | null;
    false_alarm_reason?: string | null;
    initial_latitude?: number | null;
    initial_longitude?: number | null;
    initial_landmark?: string | null;
    facility_id?: number | null;
    custody_status?: string | null;
    facility?: {
        landmark_id?: number;
        name: string;
        contact_person?: string | null;
        contact_number?: string | null;
        caretaker_name?: string | null;
        caretaker_phone?: string | null;
        is_holding_facility?: boolean;
        facility_type?: string | null;
        capacity?: number | null;
        subdivision_id?: number | null;
        subdivision_name?: string | null;
        latitude?: number;
        longitude?: number;
        [key: string]: any;
    } | null;
}

interface RescueAssignmentItem {
    assignment_id: number;
    staff_id?: number | null;
    user_id?: number | null;
    staff_name?: string | null;
    staff_email?: string | null;
    staff_phone?: string | null;
    staff_photo?: string | null;
    assigned_by?: number | null;
    assigned_at?: string | null;
    assignment_status?: string | null;
    remarks?: string | null;
}

interface RescueRequest {
    rescue_id: number;
    report_id: number;
    leader_id?: number | null;
    title?: string;
    description?: string;
    status_id: number;
    notes?: string | null;
    created_at?: string;
    leader_name?: string;
    leader_position?: string;
    assigned_staff_name?: string | null;
    staff_id?: number | null;
    assignments?: RescueAssignmentItem[];
    report?: Report;
}

const statusMap = REPORT_STATUS_MAP;

const categoryMap: Record<number, string> = {
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming Pack',
    5: 'Animal Rescue Needed',
    6: 'Lost Pet'
};

const RESOLVED_STATUS_IDS = [3, 9, 10, 11, 12, 14, 17, 18];

// Progression sequence order for core rescue operation stages
const STAGE_ORDER: Record<number, number> = {
    4: 1,  // Escalated to Barangay / Pending Review
    13: 2, // Approved (Prepare Team)
    5: 3,  // Dispatched (Team in Transit)
    6: 4,  // Picked Up (Animal Secured)
    7: 5,  // Holding Facility (Observation)
    8: 5,  // Impounded
    9: 6,  // Returned to Owner / Reunited (terminal)
    11: 6, // Resolved (Operation Complete)
};

const BRGY_OFFICE_COORDS: [number, number] = SAN_VICENTE_HQ; // Barangay San Vicente Operations HQ

const PREDEFINED_CONDITIONS = [
    'Healthy',
    'Injured',
    'Bleeding',
    'Limping',
    'Weak / Sick',
    'Aggressive',
    'Chasing People',
    'Unable to Walk',
    'Crying',
    'Pregnant / Nursing',
    'Trapped',
    'Wearing Collar / Tag',
    'Deceased',
    'Other'
];

// Same order as the page: filing -> animal -> location/evidence -> assessment -> verification -> mission -> history.
const JUMP_SECTIONS: Array<[string, string]> = [
    ['sec-details', 'Report'], ['sec-animal', 'Animal'], ['sec-map', 'Location'], ['sec-photos', 'Photos'],
    ['sec-ai', 'Assessment'], ['sec-verify', 'Verification'], ['sec-team', 'Team'], ['sec-custody', 'Custody'],
    ['sec-timeline', 'Timeline'], ['sec-actions', 'Actions'],
];

// Numbered group label between record sections, so staff can see where they are in the report.
const SectionStep = ({ n, title }: { n: number; title: string }) => (
    <div className="flex items-center gap-2.5 pt-2 first:pt-0">
        <span className="w-6 h-6 rounded-lg bg-role text-white text-[11px] font-black flex items-center justify-center shrink-0">{n}</span>
        <span className="text-[11px] font-black uppercase tracking-widest text-role-strong">{title}</span>
        <span className="flex-1 h-px bg-role-border/70" />
    </div>
);

// Quick navigation: only sections that exist for this report are shown.
const SectionJumpBar = ({ dep }: { dep: unknown }) => {
    const [present, setPresent] = useState<string[]>([]);
    useEffect(() => {
        const t = setTimeout(() => setPresent(JUMP_SECTIONS.map(([id]) => id).filter((id) => document.getElementById(id))), 300);
        return () => clearTimeout(t);
    }, [dep]);
    if (present.length < 2) return null;
    return (
        <nav aria-label="Jump to section" className="flex items-center gap-1.5 overflow-x-auto bg-white border border-gray-100 rounded-2xl p-2 shadow-2xs [&::-webkit-scrollbar]:hidden">
            <span className="px-2 text-[10px] font-black uppercase tracking-wider text-gray-400 shrink-0">Jump to</span>
            {JUMP_SECTIONS.filter(([id]) => present.includes(id)).map(([id, label]) => (
                <button
                    key={id}
                    type="button"
                    onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-gray-600 bg-gray-50 hover:bg-role-soft hover:text-role-hover whitespace-nowrap cursor-pointer transition-colors"
                >
                    {label}
                </button>
            ))}
        </nav>
    );
};

const BrgyReportView = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [report, setReport] = useState<Report | null>(() => {
        if (!id) return null;
        const cachedList = getCachedData<Report[]>('brgy_dashboard_reports') || [];
        return cachedList.find(r => r.report_id.toString() === id.toString()) || null;
    });
    const [rescueRequest, setRescueRequest] = useState<RescueRequest | null>(null);
    const [loading, setLoading] = useState<boolean>(() => {
        if (!id) return false;
        const cachedList = getCachedData<Report[]>('brgy_dashboard_reports') || [];
        return !cachedList.some(r => r.report_id.toString() === id.toString());
    });
    const [resolvedAddress, setResolvedAddress] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [personnel, setPersonnel] = useState<any[]>(() => getCachedData<any[]>('brgy_dashboard_personnel') || []);
    const [roadDistance, setRoadDistance] = useState<number | null>(null);
    // Subdivision Leaders review duplicates, matches and animal records; the Barangay may act only on cases in its hands
    // (or where the subdivision has no active leader). The server decides; this just hides buttons that would be refused.
    const [canReview, setCanReview] = useState(false);
    const [reviewNote, setReviewNote] = useState<string | null>(null);
    useEffect(() => {
        if (!report?.report_id) return;
        let cancelled = false;
        api.get(`/reports/${report.report_id}/review-permission`)
            .then((res) => {
                if (cancelled) return;
                setCanReview(Boolean(res.data?.can_review));
                setReviewNote(res.data?.reason || null);
            })
            .catch(() => { if (!cancelled) setCanReview(false); });
        return () => { cancelled = true; };
    }, [report?.report_id, report?.status_id]);

    // Directions are only drawn after the user picks "Directions from Me" / "From Brgy Hall" on the pin card.
    const [routeFrom, setRouteFrom] = useState<'brgy' | 'current' | null>(null);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

    useEffect(() => {
        if (routeFrom !== 'current' || userLocation) return;
        if (!('geolocation' in navigator)) {
            setRouteFrom('brgy');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => setUserLocation([position.coords.latitude, position.coords.longitude]),
            () => setRouteFrom('brgy')
        );
    }, [routeFrom, userLocation]);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('Operation completed successfully.');

    // Gallery / Lightbox state
    const [activeMediaIndex, setActiveMediaIndex] = useState(0);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [isEndorsementModalOpen, setIsEndorsementModalOpen] = useState(false);
    const [isMapExpanded, setIsMapExpanded] = useState(false);

    // True full screen: use the browser Fullscreen API too, and close the viewer when the user exits it (Esc).
    useEffect(() => {
        if (!isMapExpanded) return;
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
        const onChange = () => { if (!document.fullscreenElement) setIsMapExpanded(false); };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsMapExpanded(false); };
        document.addEventListener('fullscreenchange', onChange);
        window.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('fullscreenchange', onChange);
            window.removeEventListener('keydown', onKey);
            if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
        };
    }, [isMapExpanded]);
    const [isInlineMapExpanded, setIsInlineMapExpanded] = useState(false);

    // Chat Drawer state
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Status Update Modal State (Supports 2-5 Multi-Personnel Team)
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [targetStatusId, setTargetStatusId] = useState<number>(5);
    const [statusRemarks, setStatusRemarks] = useState('');
    const [statusCondition, setStatusCondition] = useState('');
    const [selectedPersonnelId, setSelectedPersonnelId] = useState<number | null>(null);
    const [statusSelectedStaffIds, setStatusSelectedStaffIds] = useState<number[]>([]);
    const [statusPersonnelSearch, setStatusPersonnelSearch] = useState('');
    const [statusFiles, setStatusFiles] = useState<File[]>([]);
    const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);

    // Holding Facility Selection State (Admin configured facilities)
    const [facilities, setFacilities] = useState<any[]>([]);
    const [selectedFacilityId, setSelectedFacilityId] = useState<number | null>(null);
    const [isLoadingFacilities, setIsLoadingFacilities] = useState<boolean>(false);

    // Assign Personnel Standalone Modal State (Supports 1 to 5 responders)
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedStaffIds, setSelectedStaffIds] = useState<number[]>([]);
    const [assignRemarks, setAssignRemarks] = useState('');
    const [personnelSearch, setPersonnelSearch] = useState('');
    const [isSubmittingAssign, setIsSubmittingAssign] = useState(false);


    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : 1;
    const isHeadOfficer = Boolean(currentUser?.is_head_officer || currentUser?.role_id === 4 || currentUser?.role_id === 5);
    const chatCount = useReportChatCount(report?.report_id || 0, currentUserId);

    const activeAssignments = (rescueRequest?.assignments && rescueRequest.assignments.length > 0)
        ? rescueRequest.assignments.filter(a => a.assignment_status === 'Assigned' || !a.assignment_status)
        : (rescueRequest?.assigned_staff_name ? [{
            assignment_id: 1,
            staff_id: rescueRequest.staff_id,
            user_id: rescueRequest.staff_id,
            staff_name: rescueRequest.assigned_staff_name,
            remarks: 'Team Lead'
        }] : []);

    const isUserAssignedToReport = Boolean(
        activeAssignments.some(a => Number(a.staff_id || a.user_id) === Number(currentUserId)) ||
        (rescueRequest && (Number(rescueRequest.staff_id) === Number(currentUserId) || Number(rescueRequest.leader_id) === Number(currentUserId)))
    );
    const canUpdateStatus = isHeadOfficer || isUserAssignedToReport;

    useEffect(() => {
        if (!userStr || currentUser?.role_id !== 3) {
            navigate('/staff/login');
        }
    }, [navigate, userStr, currentUser]);

    useEffect(() => {
        if (searchParams.get('openChat') === 'true' || searchParams.get('chat') === 'true') {
            setIsChatOpen(true);
        }
    }, [searchParams]);

    const fetchReportDetails = async () => {
        if (!id) return;
        if (!report) setLoading(true);
        try {
            let loadedReport: Report | null = null;
            let loadedRescue: RescueRequest | null = null;

            // 1. Try loading directly from /reports/:id
            try {
                const reportRes = await api.get(`/reports/${id}`);
                loadedReport = reportRes.data;
            } catch (err) {
                console.warn(`Could not load report by id ${id}, trying rescue-requests:`, err);
            }

            // 2. Fetch rescue request info
            try {
                // If loadedReport exists, attempt direct lookup by report_id
                if (loadedReport?.report_id) {
                    try {
                        const directRescue = await api.get(`/rescue-requests/report/${loadedReport.report_id}`);
                        if (directRescue.data) {
                            loadedRescue = directRescue.data;
                        }
                    } catch {
                        // ignore if not found
                    }
                }

                // If loadedRescue still not found, check if id is a rescue_id
                if (!loadedRescue) {
                    try {
                        const directRescueById = await api.get(`/rescue-requests/${id}`);
                        const resData = directRescueById.data as RescueRequest;
                        if (resData) {
                            loadedRescue = resData;
                            if (!loadedReport && resData.report) {
                                loadedReport = resData.report;
                            }
                        }
                    } catch {
                        // ignore if not found
                    }
                }

                // Fallback: list all rescue requests
                if (!loadedRescue) {
                    const rescueRes = await api.get('/rescue-requests/');
                    const allRescues: RescueRequest[] = rescueRes.data || [];

                    const numericId = parseInt(id);
                    loadedRescue = allRescues.find(
                        r => r.report_id === numericId || r.rescue_id === numericId || r.report?.report_id === numericId
                    ) || null;

                    if (!loadedReport && loadedRescue && loadedRescue.report) {
                        loadedReport = loadedRescue.report;
                    }
                }
            } catch (rescueErr) {
                console.warn('Could not load rescue requests:', rescueErr);
            }

            if (loadedReport) {
                setReport(loadedReport);
                // Fetch authoritative return record if one already exists for this report or case
                try {
                    const retRes = await api.get(`/report-returns/by-report/${loadedReport.report_id}`);
                    setExistingReportReturn(retRes.data || null);
                } catch {
                    setExistingReportReturn(null);
                }
                if (loadedRescue) {
                    setRescueRequest(loadedRescue);
                }

                // Reverse geocoding for clean address
                if (loadedReport.latitude && loadedReport.longitude) {
                    setIsGeocoding(true);
                    try {
                        const geoRes = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                            params: {
                                format: 'jsonv2',
                                lat: loadedReport.latitude,
                                lon: loadedReport.longitude,
                                addressdetails: 1
                            },
                            headers: { 'Accept-Language': 'en' }
                        });
                        if (geoRes.data?.address) {
                            const addr = geoRes.data.address;
                            const parts = [];
                            const road = addr.road || addr.pedestrian || addr.path || '';
                            if (road) parts.push(road);
                            const neighbourhood = addr.neighbourhood || addr.village || addr.suburb || '';
                            if (neighbourhood && neighbourhood !== road) parts.push(neighbourhood);
                            const city = addr.city || addr.town || addr.municipality || '';
                            if (city) parts.push(city);
                            setResolvedAddress(parts.join(', ') || geoRes.data.display_name);
                        } else {
                            setResolvedAddress(loadedReport.landmark || 'Selera Homes');
                        }
                    } catch (e) {
                        setResolvedAddress(loadedReport.landmark || `${loadedReport.latitude.toFixed(5)}, ${loadedReport.longitude.toFixed(5)}`);
                    } finally {
                        setIsGeocoding(false);
                    }
                }

            } else {
                setReport(null);
                setExistingReportReturn(null);
            }
        } catch (error) {
            console.error('Error fetching report details:', error);
            setReport(null);
            setExistingReportReturn(null);
        } finally {
            setLoading(false);
        }
    };

    const fetchPersonnel = async () => {
        try {
            const response = await api.get('/users/?role_id=3');
            setPersonnel(response.data || []);
        } catch (error) {
            console.error('Error fetching personnel:', error);
        }
    };

    const fetchFacilities = async () => {
        setIsLoadingFacilities(true);
        try {
            const bId = currentUser?.barangay_id || report?.barangay_id || 1;
            const res = await api.get(`/landmarks?barangay_id=${bId}&is_holding_facility=true&barangay_only=true`);
            const list = (res.data || []).filter((f: any) => f.subdivision_id == null);
            setFacilities(list);
            if (list.length > 0) {
                const currentFacId = report?.facility_id;
                const match = list.find((f: any) => f.landmark_id === currentFacId);
                setSelectedFacilityId(match ? match.landmark_id : list[0].landmark_id);
            } else {
                setSelectedFacilityId(null);
            }
        } catch (err) {
            console.warn('Could not fetch holding facilities:', err);
        } finally {
            setIsLoadingFacilities(false);
        }
    };

    useEffect(() => {
        fetchReportDetails();
        fetchPersonnel();
        fetchFacilities();
    }, [id]);

    // Approve / reject use an in-page dialog (not the browser's native popup at the top of the screen)
    const [quickDecision, setQuickDecision] = useState<'approve' | 'reject' | null>(null);
    const [rejectReason, setRejectReason] = useState('');

    const handleQuickApprove = () => {
        if (!report) return;
        if (!canUpdateStatus) {
            alert('Access restricted: Only personnel assigned to this report (or the Barangay Head Officer) have the ability to update its status.');
            return;
        }
        setQuickDecision('approve');
    };

    const confirmQuickApprove = async () => {
        if (!report) return;
        setQuickDecision(null);
        setIsSubmittingStatus(true);
        try {
            const rescueId = rescueRequest?.rescue_id;
            if (rescueId) {
                await api.patch(`/rescue-requests/${rescueId}`, {
                    status_id: 13, // Approved
                    barangay_staff_id: currentUserId,
                    remarks: 'Official rescue request approved by Barangay Operations.'
                });
            } else {
                await api.patch(`/reports/${report.report_id}/status`, {
                    status_id: 13,
                    user_id: currentUserId,
                    remarks: 'Official rescue request approved by Barangay Operations.'
                });
            }
            setSuccessMessage('Rescue request approved successfully.');
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error approving request:', err);
            alert(err.response?.data?.detail || 'Failed to approve rescue request.');
        } finally {
            setIsSubmittingStatus(false);
        }
    };

    const handleQuickReject = () => {
        if (!report) return;
        if (!canUpdateStatus) {
            alert('Access restricted: Only personnel assigned to this report (or the Barangay Head Officer) have the ability to update its status.');
            return;
        }
        setRejectReason('');
        setQuickDecision('reject');
    };

    const confirmQuickReject = async () => {
        if (!report) return;
        const reason = rejectReason.trim();
        if (reason.length < 5) return;
        setQuickDecision(null);
        setIsSubmittingStatus(true);
        try {
            const rescueId = rescueRequest?.rescue_id;
            if (rescueId) {
                await api.patch(`/rescue-requests/${rescueId}`, {
                    status_id: 3, // Rejected
                    barangay_staff_id: currentUserId,
                    remarks: `Request rejected by Barangay: ${reason}`
                });
            } else {
                await api.patch(`/reports/${report.report_id}/status`, {
                    status_id: 3,
                    user_id: currentUserId,
                    remarks: `Request rejected by Barangay: ${reason}`
                });
            }
            setSuccessMessage('Rescue request rejected.');
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error rejecting request:', err);
            alert(err.response?.data?.detail || 'Failed to reject rescue request.');
        } finally {
            setIsSubmittingStatus(false);
        }
    };

    const getEffectiveAnimalCondition = (rep: Report | null): string => {
        if (!rep) return 'Unknown';
        
        const rawCond = (rep.condition || '').trim();
        if (rawCond && rawCond.toLowerCase() !== 'unknown') {
            return rawCond;
        }

        // 1. If verified by official on-site investigation
        if (rep.verified_injury) return 'Injured';

        // 2. Check category for injured animal (category_id 1 is Injured Animal)
        const isInjuredCategory = rep.category_id === 1 || (categoryMap[rep.category_id] || '').toLowerCase().includes('injured');
        if (isInjuredCategory) {
            return 'Injured';
        }

        return 'Healthy';
    };

    const isReportFinalized = Boolean(report && RESOLVED_STATUS_IDS.includes(report.status_id));

    // Determines if a mission step has already been completed or cannot be clicked
    const isStepDone = (statusId: number): boolean => {
        if (!report) return false;
        const currentStatus = report.status_id;

        // If an authoritative return record already exists for this report or case, status 9 (Returned to Owner) is done
        if (statusId === 9 && existingReportReturn) return true;

        // Current status is already active/done
        if (statusId === currentStatus) return true;

        // Special exception: If animal is Picked Up (6), transferring to Holding Facility (7) or Impounded (8) is the valid NEXT step,
        // regardless of whether the animal was temporarily held in a subdivision holding pen before escalation.
        if (currentStatus === 6 && (statusId === 7 || statusId === 8)) {
            return false;
        }

        // Exception: moving between holding facility (7) and impounded (8)
        if ((currentStatus === 7 && statusId === 8) || (currentStatus === 8 && statusId === 7)) {
            return false;
        }

        const currentOrder = STAGE_ORDER[currentStatus] || 0;
        const targetOrder = STAGE_ORDER[statusId] || 0;

        // Linear mission stages cannot regress
        if (currentOrder > 0 && targetOrder > 0 && targetOrder <= currentOrder) {
            return true;
        }

        // If animal is already picked up (6) or in facility (7, 8): cannot reject, mark false alarm, or animal not found
        if (currentOrder >= 4) {
            if (statusId === 3 || statusId === 14 || statusId === 17) {
                return true;
            }
        } else if (currentOrder >= 3) {
            // If dispatched, cannot reject or mark false alarm
            if (statusId === 3 || statusId === 14) {
                return true;
            }
        }

        // For non-core stages (like early dismissal/rejection), check if recorded in status history
        // (Do NOT block stages 7, 8, or 11 based on older pre-escalation history entries)
        if (![7, 8, 11].includes(statusId) && report.history && report.history.some((h: any) => (h.report_status_id || h.status_id) === statusId)) {
            return true;
        }

        return false;
    };

    const getStepLabel = (statusId: number, baseLabel: string): string => {
        if (!report) return baseLabel;
        if (statusId === report.status_id) {
            return `${baseLabel} — (Current Stage - Done)`;
        }
        if (isStepDone(statusId)) {
            return `${baseLabel} — (Completed)`;
        }
        return baseLabel;
    };

    const getNextValidStatusId = (currentStatusId: number): number => {
        if (currentStatusId === 4) return 13;
        if (currentStatusId === 13) return 5;
        if (currentStatusId === 5) return 6;
        if (currentStatusId === 6) return 7;
        if (currentStatusId === 7) return 8;
        if (currentStatusId === 8) return 9;
        return 9;
    };

    // An escalated case (status 4) is locked for Barangay operations until it is approved.
    const awaitingApproval = report?.status_id === 4;
    const [approveFirstNotice, setApproveFirstNotice] = useState(false);
    const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);
    const caseHolding = useCaseHolding(report?.report_id, report?.duplicate_of_report_id, `${report?.status_id}-${report?.history?.length ?? 0}`);
    // The server refuses operations on an unapproved case; show that as a dialog too
    const isApproveFirstError = (detail: unknown) => typeof detail === 'string' && detail.startsWith('Approve this rescue request first');

    const [ownerReturn, setOwnerReturn] = useState<OwnerReturnValue>(EMPTY_OWNER_RETURN);
    const [existingReportReturn, setExistingReportReturn] = useState<any | null>(null);

    const openStatusModal = (statusId: number) => {
        if (awaitingApproval) {
            setApproveFirstNotice(true);
            return;
        }
        if (!canUpdateStatus) {
            alert('Access restricted: Only personnel assigned to this report (or the Barangay Head Officer) have the ability to update its status.');
            return;
        }
        if (isReportFinalized) {
            alert('This operation has already been resolved and finalized. Status updates are locked.');
            return;
        }

        // If the requested status is already completed or is current, select next valid stage
        const initialStatusId = (report && (statusId === report.status_id || isStepDone(statusId)))
            ? getNextValidStatusId(report.status_id)
            : statusId;

        if ((initialStatusId === 7 || initialStatusId === 8) && facilities.length === 0) {
            alert('Notice: No holding facility registered for this Barangay. Please register a facility under Landmarks & Facilities first.');
        }

        setTargetStatusId(initialStatusId);
        setStatusRemarks('');
        const currentRep = report || rescueRequest?.report || null;
        const initialCondition = getEffectiveAnimalCondition(currentRep);
        const isConditionApplicable = ![5, 13, 4, 3, 14, 17].includes(initialStatusId);
        setStatusCondition(isConditionApplicable ? (initialCondition !== 'Unknown' ? initialCondition : 'Healthy') : '');
        
        // Pre-select facility if report already has one and is in the active list, or default to first registered facility
        if (currentRep?.facility_id && facilities.some(f => f.landmark_id === currentRep.facility_id)) {
            setSelectedFacilityId(currentRep.facility_id);
        } else if (facilities.length > 0) {
            setSelectedFacilityId(facilities[0].landmark_id);
        } else {
            setSelectedFacilityId(null);
        }

        // If stage is Returned to Owner (9), auto-detect registered owner and pre-fill ownerReturn
        if (initialStatusId === 9) {
            const regOwner = (currentRep?.owner_id) ? {
                user_id: currentRep.owner_id,
                name: currentRep.owner_name || currentRep.matched_pet_record?.owner_name || 'Registered Owner',
                phone: currentRep.owner_phone,
                email: currentRep.owner_email,
                address: currentRep.owner_address,
            } : null;
            if (regOwner) {
                setOwnerReturn({
                    has_account: true,
                    owner_user_id: regOwner.user_id,
                    relationship_to_animal: 'Owner'
                });
            } else {
                setOwnerReturn(EMPTY_OWNER_RETURN);
            }
        }

        // Pre-populate with currently assigned responders
        const activeIds: number[] = [];
        if (rescueRequest?.assignments && rescueRequest.assignments.length > 0) {
            rescueRequest.assignments.forEach(a => {
                if (a.assignment_status === 'Assigned') {
                    const staffId = a.staff_id || a.user_id;
                    if (staffId && !activeIds.includes(staffId)) {
                        activeIds.push(staffId);
                    }
                }
            });
        }
        if (activeIds.length === 0 && rescueRequest?.staff_id) {
            activeIds.push(rescueRequest.staff_id);
        }
        setStatusSelectedStaffIds(activeIds);
        setSelectedPersonnelId(activeIds[0] || null);
        setStatusPersonnelSearch('');
        setStatusFiles([]);
        setIsConfirmModalOpen(false);
        setIsStatusModalOpen(true);
    };

    const toggleStatusStaffSelection = (staffId: number) => {
        if (statusSelectedStaffIds.includes(staffId)) {
            const next = statusSelectedStaffIds.filter(id => id !== staffId);
            setStatusSelectedStaffIds(next);
            setSelectedPersonnelId(next[0] || null);
        } else {
            if (statusSelectedStaffIds.length >= 5) {
                alert('A maximum of 5 field responders can be assigned to a rescue team.');
                return;
            }
            const next = [...statusSelectedStaffIds, staffId];
            setStatusSelectedStaffIds(next);
            setSelectedPersonnelId(next[0] || null);
        }
    };

    // Pre-validation before showing the Confirmation Modal
    const handleInitiateStatusUpdate = () => {
        if (!report) return;
        if (!canUpdateStatus) {
            alert('Access restricted: Only personnel assigned to this report (or the Barangay Head Officer) have the ability to update its status.');
            return;
        }
        if (isReportFinalized) {
            alert('This operation has already been resolved and finalized. Status updates are locked.');
            return;
        }
        if (isStepDone(targetStatusId)) {
            alert('This operational stage has already been completed or is the current stage. Please select an upcoming stage.');
            return;
        }
        if (targetStatusId === 5 && statusSelectedStaffIds.length === 0 && !selectedPersonnelId) {
            alert('Please select at least 1 responder to handle this dispatch operation.');
            return;
        }
        if ((targetStatusId === 7 || targetStatusId === 8) && (!selectedFacilityId || facilities.length === 0)) {
            alert('No holding facility registered! Please register a holding facility under Landmarks & Facilities before moving this animal to a facility.');
            return;
        }
        if (targetStatusId === 9) {
            if (existingReportReturn) {
                alert('This animal has already been reunited with its owner. Duplicate handovers are not allowed.');
                return;
            }
            const effOwnerId = (report as any)?.owner_id || (report as any)?.pet?.owner_id || (report as any)?.matched_pet_record?.owner_id;
            const err = ownerReturnError(ownerReturn, effOwnerId, ownerReturn.has_proof_on_file);
            if (err) {
                alert(err);
                return;
            }
        }

        // Open confirmation modal
        setIsConfirmModalOpen(true);
    };

    // Actual execution after user confirms in the Confirmation Modal
    const handleExecuteStatusUpdate = async () => {
        if (!report) return;
        if (!canUpdateStatus) {
            alert('Access restricted: Only personnel assigned to this report (or the Barangay Head Officer) have the ability to update its status.');
            return;
        }
        if (isStepDone(targetStatusId)) {
            alert('This operational stage has already been completed. Please select a valid next stage.');
            return;
        }

        setIsSubmittingStatus(true);
        try {
            const friendlyDefaults: Record<number, string> = {
                4: 'Report under active review by Barangay Operations.',
                13: 'Approved by Barangay Operations. Mission in preparation.',
                5: 'Barangay rescue team dispatched to incident location.',
                6: 'Animal secured and picked up by Barangay response team.',
                7: 'Animal securely placed in holding facility under observation.',
                8: 'Animal impounded at facility.',
                9: 'Animal returned to its owner / reunited.',
                11: 'Incident officially resolved by Barangay Staff.',
                12: 'Case resolved (animal deceased).',
                14: 'Case dismissed (false alarm).',
                17: 'Animal cannot be found at the reported location.'
            };

            const selectedFac = (targetStatusId === 7 || targetStatusId === 8) 
                ? facilities.find(f => f.landmark_id === selectedFacilityId) 
                : null;

            let finalRemarks = statusRemarks.trim() || friendlyDefaults[targetStatusId] || `Status updated to ${statusMap[targetStatusId] || 'In Progress'}`;
            if (selectedFac && !statusRemarks.trim()) {
                const caretakerInfo = selectedFac.contact_person ? ` • Caretaker: ${selectedFac.contact_person}` : '';
                finalRemarks = `${friendlyDefaults[targetStatusId] || 'Animal admitted to holding facility.'} Secured in holding facility (${selectedFac.name})${caretakerInfo}.`;
            }

            const rescueId = rescueRequest?.rescue_id;
            const primaryStaffId = statusSelectedStaffIds[0] || selectedPersonnelId || null;
            const isConditionApplicable = ![5, 13, 4, 3, 14, 17].includes(targetStatusId);
            const conditionToSubmit = (isConditionApplicable && statusCondition.trim()) ? statusCondition.trim() : undefined;

            if (rescueId) {
                const payload: any = {
                    status_id: targetStatusId,
                    barangay_staff_id: currentUserId,
                    assigned_personnel_id: primaryStaffId,
                    assigned_personnel_ids: statusSelectedStaffIds.length > 0 ? statusSelectedStaffIds : (primaryStaffId ? [primaryStaffId] : undefined),
                    remarks: finalRemarks,
                    animal_condition: conditionToSubmit
                };
                if (targetStatusId === 9) payload.owner_return = await prepareOwnerReturn(report.report_id, ownerReturn);
                if (targetStatusId === 6) {
                    payload.custody_status = 'Animal Picked Up';
                    payload.facility_id = null;
                } else if (selectedFac) {
                    payload.facility_id = selectedFac.landmark_id;
                    payload.latitude = parseFloat(selectedFac.latitude.toString());
                    payload.longitude = parseFloat(selectedFac.longitude.toString());
                    payload.landmark = selectedFac.name;
                    payload.custody_status = selectedFac.subdivision_id == null ? 'In Barangay Facility' : 'In Subdivision Facility';
                }
                await api.patch(`/rescue-requests/${rescueId}`, payload);
            } else {
                const reportPayload: any = {
                    status_id: targetStatusId,
                    user_id: currentUserId,
                    remarks: finalRemarks,
                    assigned_staff_id: primaryStaffId,
                    animal_condition: conditionToSubmit
                };
                if (targetStatusId === 9) {
                    reportPayload.owner_return = await prepareOwnerReturn(report.report_id, ownerReturn);
                    reportPayload.custody_status = 'Reunited';
                }
                if (targetStatusId === 6) {
                    reportPayload.custody_status = 'Animal Picked Up';
                    reportPayload.facility_id = null;
                } else if (selectedFac) {
                    reportPayload.facility_id = selectedFac.landmark_id;
                    reportPayload.latitude = parseFloat(selectedFac.latitude.toString());
                    reportPayload.longitude = parseFloat(selectedFac.longitude.toString());
                    reportPayload.landmark = selectedFac.name;
                    reportPayload.custody_status = selectedFac.subdivision_id == null ? 'In Barangay Facility' : 'In Subdivision Facility';
                }
                await api.patch(`/reports/${report.report_id}/status`, reportPayload);

                if (statusSelectedStaffIds.length > 0) {
                    try {
                        await api.post('/rescue-requests/assign-team', {
                            report_id: report.report_id,
                            assigned_personnel_ids: statusSelectedStaffIds,
                            barangay_staff_id: currentUserId,
                            remarks: finalRemarks
                        });
                    } catch (assignErr) {
                        console.warn('Assign team alongside status update:', assignErr);
                    }
                }
            }

            // Upload operational evidence photos if any
            if (statusFiles.length > 0) {
                for (const file of statusFiles) {
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('is_evidence', 'true');
                    fd.append('status_id', targetStatusId.toString());
                    try {
                        await api.post(`/reports/${report.report_id}/media`, fd, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });
                    } catch (uploadErr) {
                        console.error('Evidence upload error:', uploadErr);
                    }
                }
            }

            setIsConfirmModalOpen(false);
            setIsStatusModalOpen(false);
            setOwnerReturn(EMPTY_OWNER_RETURN);
            setSuccessMessage(`Status successfully updated to ${statusMap[targetStatusId] || 'New Status'}.`);
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: any) {
            console.error('Failed to update status:', err);
            if (isApproveFirstError(err.response?.data?.detail)) setApproveFirstNotice(true);
            else alert(err.response?.data?.detail || 'Failed to update operation status.');
        } finally {
            setIsSubmittingStatus(false);
        }
    };

    const openAssignModal = () => {
        if (awaitingApproval) {
            setApproveFirstNotice(true);
            return;
        }
        if (!isHeadOfficer) {
            alert('Access restricted: Only the Barangay Head Officer can assign responders to this operation.');
            return;
        }
        // Preload currently active assigned responders
        const activeIds: number[] = [];
        if (rescueRequest?.assignments && rescueRequest.assignments.length > 0) {
            rescueRequest.assignments.forEach(a => {
                if (a.assignment_status === 'Assigned') {
                    const staffId = a.staff_id || a.user_id;
                    if (staffId && !activeIds.includes(staffId)) {
                        activeIds.push(staffId);
                    }
                }
            });
        }
        if (activeIds.length === 0 && rescueRequest?.staff_id) {
            activeIds.push(rescueRequest.staff_id);
        }
        setSelectedStaffIds(activeIds);
        setAssignRemarks('');
        setPersonnelSearch('');
        setIsAssignModalOpen(true);
    };

    const toggleStaffSelection = (staffId: number) => {
        if (selectedStaffIds.includes(staffId)) {
            setSelectedStaffIds(selectedStaffIds.filter(id => id !== staffId));
        } else {
            if (selectedStaffIds.length >= 5) {
                alert('A maximum of 5 field responders can be assigned to a rescue team.');
                return;
            }
            setSelectedStaffIds([...selectedStaffIds, staffId]);
        }
    };

    const handleAssignStaff = async () => {
        if (!report || selectedStaffIds.length === 0) {
            alert('Please select at least 1 responder to assign to this operation.');
            return;
        }
        if (selectedStaffIds.length > 5) {
            alert('A maximum of 5 field responders can be assigned.');
            return;
        }
        setIsSubmittingAssign(true);
        try {
            await api.post('/rescue-requests/assign-team', {
                report_id: report.report_id,
                rescue_id: rescueRequest?.rescue_id,
                assigned_personnel_ids: selectedStaffIds,
                barangay_staff_id: currentUserId,
                user_id: currentUserId,
                remarks: assignRemarks.trim() || `Assigned ${selectedStaffIds.length}-responder team to handle operation.`
            });
            setIsAssignModalOpen(false);
            setSuccessMessage(`Assigned ${selectedStaffIds.length} field responder(s) to mission successfully.`);
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error assigning staff team:', err);
            if (isApproveFirstError(err.response?.data?.detail)) setApproveFirstNotice(true);
            else alert(err.response?.data?.detail || 'Failed to assign personnel.');
        } finally {
            setIsSubmittingAssign(false);
        }
    };

    const getPriorityBadgeClass = (priority?: string) => {
        const p = (priority || '').toLowerCase();
        if (p.includes('emergency') || p.includes('high')) return 'bg-red-50 text-red-600 border-red-200';
        if (p.includes('medium') || p.includes('regular')) return 'bg-amber-50 text-amber-600 border-amber-200';
        return 'bg-blue-50 text-blue-600 border-blue-200';
    };

    // The AI sometimes stores "Low Priority"; the badge adds "Priority" itself, so drop a trailing one.
    const effectivePriority = String(report?.ai_suggested_priority || report?.priority_level || 'Medium').replace(/\s*priority\s*$/i, '') || 'Medium';

    const rawImages = (report?.media || []).filter(m => {
        const url = (m.file_url || m.url || '').toLowerCase();
        return !url.endsWith('.docx') && !url.endsWith('.doc') && !url.endsWith('.pdf');
    });
    // Reporter photos only: staff activity photos are shown separately (Activity Photos) and on timeline entries
    const imagesList = rawImages.filter(m => !m.is_evidence);
    const activeImage = imagesList[activeMediaIndex] || imagesList[0] || null;

    const isResolvedCase = [9, 10, 11, 12, 14, 17, 18].includes(report?.status_id as number) || ['Adopted', 'Impounded', 'Claimed', 'Claimed by Owner', 'Released', 'Deceased', 'Resolved', 'Dismissed'].includes(report?.custody_status || '');
    const isRelocatedToFacility = !isResolvedCase && report?.status_id !== 6 && [7, 8].includes(report?.status_id as number) && !!(report?.facility_id || report?.facility || report?.custody_status === 'Secured in Facility' || report?.custody_status === 'In Barangay Facility' || report?.custody_status === 'In Subdivision Facility');
    const activeFacilityLat = report?.facility?.latitude != null ? parseFloat(report.facility.latitude.toString()) : null;
    const activeFacilityLng = report?.facility?.longitude != null ? parseFloat(report.facility.longitude.toString()) : null;

    const sightingLat = (isRelocatedToFacility && activeFacilityLat != null)
        ? activeFacilityLat
        : ((report?.initial_latitude || report?.latitude) ? parseFloat((report.initial_latitude || report.latitude).toString()) : BRGY_OFFICE_COORDS[0]);
    const sightingLng = (isRelocatedToFacility && activeFacilityLng != null)
        ? activeFacilityLng
        : ((report?.initial_longitude || report?.longitude) ? parseFloat((report.initial_longitude || report.longitude).toString()) : BRGY_OFFICE_COORDS[1]);

    // Compute Location and Custody Progression Steps
    const custodyProgression = (() => {
        const originLandmark = report?.initial_landmark || (report?.history && report.history[0]?.landmark) || report?.landmark || 'Reported Sighting Location';
        
        // Find distinct facility movements in chronological order
        const facilitySteps: { name: string; date?: string; remarks?: string; isCurrent: boolean }[] = [];
        const seenFacs = new Set<string>();

        if (report?.history && report.history.length > 0) {
            report.history.forEach((h: any) => {
                // Ignore status 6 (Picked Up) as a facility step
                if (h.report_status_id === 6) return;
                const facName = h.facility_name || (h.facility_id ? h.landmark : null);
                if (facName && facName !== originLandmark && !seenFacs.has(facName)) {
                    seenFacs.add(facName);
                    const isLatest = (report?.facility?.name === facName) || (report?.facility_id === h.facility_id);
                    facilitySteps.push({
                        name: facName,
                        date: h.created_at,
                        remarks: h.remarks,
                        isCurrent: isLatest
                    });
                }
            });
        }

        const curFacName = (report?.status_id !== 6) ? (report?.facility?.name || (report?.facility_id ? report.landmark : null)) : null;
        if (curFacName && curFacName !== originLandmark && !seenFacs.has(curFacName)) {
            facilitySteps.push({
                name: curFacName,
                isCurrent: true
            });
        }

        return {
            origin: originLandmark,
            hasMoved: report?.status_id !== 6 && !!(report?.facility_id || report?.facility || facilitySteps.length > 0),
            steps: facilitySteps,
            currentFacility: curFacName || (facilitySteps.length > 0 ? facilitySteps[facilitySteps.length - 1].name : null)
        };
    })();

    const escalationNote = report?.endorsement_letter?.letter_content || rescueRequest?.description || rescueRequest?.notes || report?.description;
    const escalationTitle = report?.endorsement_letter?.title || rescueRequest?.title || 'Subdivision Rescue Request';
    const leaderName = report?.endorsement_letter?.leader_name || rescueRequest?.leader_name || 'Subdivision Leader';
    const leaderPos = report?.endorsement_letter?.leader_position || rescueRequest?.leader_position || 'Subdivision Officer';
    const leaderDate = report?.endorsement_letter?.issued_at || rescueRequest?.created_at || report?.created_at;

    const endorsementFileUrl = report?.endorsement_letter?.file_url || (report?.media?.find(m => m.is_evidence)?.file_url);

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <BrgySidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <BrgyNavbar
                    leftContent={
                        <div className="flex items-center gap-4">
                            <Link
                                to="/brgy/rescue-requests"
                                className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-all shrink-0 shadow-2xs"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </Link>
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">
                                        Rescue Request #{report?.report_id || id}
                                    </h1>
                                    {rescueRequest?.rescue_id && (
                                        <span className="px-2 py-0.5 rounded-md bg-role-muted text-role text-[9px] font-black uppercase tracking-wider">
                                            Mission #{rescueRequest.rescue_id}
                                        </span>
                                    )}
                                </div>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Barangay Operations • Full Incident Review & Response
                                </p>
                            </div>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-4 sm:p-8 pb-32 lg:pb-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-8">
                        {loading ? (
                            <div className="py-32 flex flex-col items-center justify-center gap-4">
                                <div className="w-12 h-12 border-4 border-role border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    Loading Barangay Incident Intelligence...
                                </p>
                            </div>
                        ) : !report ? (
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 p-20 text-center shadow-sm">
                                <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                <h3 className="text-gray-900 font-black uppercase text-sm tracking-wider">Report Not Found</h3>
                                <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">
                                    The report ID #{id} you are trying to view does not exist or has been removed.
                                </p>
                                <Link
                                    to="/brgy/rescue-requests"
                                    className="inline-block mt-6 px-6 py-3 bg-role hover:bg-role-hover text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md"
                                >
                                    Back to Rescue Requests
                                </Link>
                            </div>
                        ) : (
                            <>
                                {/* Mobile Hero Banner (block md:hidden) */}
                                <div className="block md:hidden relative overflow-hidden rounded-3xl bg-gradient-to-br from-role-hover via-role to-[#FB923C] p-5 shadow-lg shadow-role/20 text-white animate-in fade-in slide-in-from-top-3 duration-300 mb-4">
                                    {/* Decorative glowing backdrops */}
                                    <div className="absolute -right-8 -top-8 w-36 h-36 bg-white/15 rounded-full blur-2xl pointer-events-none" />
                                    <div className="absolute right-10 -bottom-8 w-32 h-32 bg-amber-300/20 rounded-full blur-xl pointer-events-none" />
                                    <div className="absolute right-3 top-3 text-2xl opacity-85 select-none animate-bounce duration-1000">
                                        🚨
                                    </div>

                                    <div className="relative z-10 space-y-3.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2.5">
                                                <Link
                                                    to="/brgy/rescue-requests"
                                                    className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 flex items-center justify-center text-white active:scale-95 transition-transform shrink-0"
                                                >
                                                    <ArrowLeft className="w-4 h-4" />
                                                </Link>
                                                <div>
                                                    <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-black uppercase tracking-wider text-role-muted border border-white/25 shadow-2xs mb-0.5">
                                                        <Sparkles className="w-2.5 h-2.5 text-amber-200" /> Incident #{report.report_id}
                                                    </div>
                                                    <h1 className="text-base font-black tracking-tight leading-none text-white truncate max-w-[200px]">
                                                        {categoryMap[report.category_id] || report.landmark || 'Rescue Operation'}
                                                    </h1>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Mobile Quick Status & Details Strip */}
                                        <div className="grid grid-cols-2 gap-2 pt-0.5">
                                            <div className="bg-white/15 backdrop-blur-md p-2.5 rounded-2xl border border-white/30 flex items-center gap-2 shadow-2xs">
                                                <div className="w-2 h-2 rounded-full bg-emerald-300 animate-ping shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="text-[9px] font-extrabold text-role-muted uppercase tracking-wider truncate">Status</div>
                                                    <div className="text-xs font-black text-white leading-tight truncate">{getReportStatusLabel(report.status_id)}</div>
                                                </div>
                                            </div>
                                            <div className="bg-white/15 backdrop-blur-md p-2.5 rounded-2xl border border-white/30 flex items-center gap-2 shadow-2xs">
                                                <MapPin className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                                                <div className="min-w-0">
                                                    <div className="text-[9px] font-extrabold text-role-muted uppercase tracking-wider truncate">Landmark</div>
                                                    <div className="text-xs font-black text-white leading-tight truncate">{report.landmark || 'On Site'}</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Top Summary Bar */}
                                <div className="bg-white rounded-[2.5rem] border border-gray-100 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className={`px-3.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border shadow-2xs ${getReportStatusBadgeStyle(report.status_id)}`}>
                                            {getReportStatusLabel(report.status_id)}
                                        </span>
                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${getPriorityBadgeClass(effectivePriority)}`}>
                                            {effectivePriority} Priority
                                        </span>
                                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-role-soft text-role border border-role-border">
                                            {categoryMap[report.category_id] || 'Stray Report'}
                                        </span>
                                        {report.verification_status && (
                                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
<Check className="w-3 h-3" /> Leader Verified
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsChatOpen(true)}
                                            className="px-4 py-2 bg-white hover:bg-role-soft border border-role-border text-role text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                                            title="Open Case Coordination Chat"
                                        >
                                            <MessageCircle className="w-3.5 h-3.5" />
                                            <span>Case Chat {chatCount > 0 ? `(${chatCount})` : ''}</span>
                                        </button>

                                        {endorsementFileUrl && (
                                            <button
                                                type="button"
                                                onClick={() => setIsEndorsementModalOpen(true)}
                                                className="px-4 py-2 bg-role-soft hover:bg-role-muted border border-role-border text-role text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                                            >
                                                <FileText className="w-3.5 h-3.5" />
                                                <span>Endorsement Letter</span>
                                            </button>
                                        )}

                                        {![3, 9, 10, 11, 12, 14, 18].includes(report.status_id) && !report.duplicate_of_report_id && !awaitingApproval && (
                                            <button
                                                type="button"
                                                onClick={() => openStatusModal(getNextValidStatusId(report.status_id))}
                                                className="px-5 py-2 bg-role hover:bg-role-hover text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                                            >
                                                <Zap className="w-3.5 h-3.5" />
                                                <span>Update Status</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <SectionJumpBar dep={report.report_id} />

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                    {/* LEFT COLUMN: the report record, read top to bottom from filing to the latest status */}
                                    <div className="lg:col-span-2 space-y-6">
                                        <SectionStep n={1} title="Report Information" />
                                        <div id="sec-details" className="scroll-mt-24 bg-white rounded-[2.5rem] border border-gray-100 p-6 sm:p-8 shadow-sm space-y-5">
                                            <div>
                                                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Report Information</h3>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Who filed it, when, and what they saw</p>
                                            </div>
                                            {/* A merged duplicate points back to its main case (the first-filed report) */}
                                            {report.duplicate_of_report_id && (
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(`/brgy/reports/${report.duplicate_of_report_id}`)}
                                                    className="w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl border-2 border-stone-200 bg-stone-50/70 hover:border-orange-300 hover:bg-orange-50/40 text-left transition-all cursor-pointer"
                                                >
                                                    <span className="flex items-center gap-2.5 min-w-0">
                                                        <Link2 className="w-4 h-4 text-role shrink-0" />
                                                        <span className="text-xs font-bold text-gray-700">
                                                            Merged into <strong className="text-gray-900">Report #{report.duplicate_of_report_id}</strong>, the first report of this animal.
                                                        </span>
                                                    </span>
                                                    <span className="text-[9px] font-black text-role uppercase tracking-wider shrink-0">Open report →</span>
                                                </button>
                                            )}

                                            <IdentityDisputePanel report={report} canDecide={canReview} onChanged={fetchReportDetails} />
                                            {(((report as any).disputes || []) as any[]).filter((d: any) => (d.dispute_type || 'false_report') === 'false_report').map((d: any) => (
                                                <div key={d.dispute_id} className="p-3 rounded-xl border border-amber-200 bg-amber-50/40 space-y-2">
                                                    <p className="text-xs font-bold text-amber-900">
                                                        Formal dispute by {d.resident_name || `Resident #${d.resident_user_id}`}
                                                        {d.pet_name ? ` (Pet: ${d.pet_name})` : ''} · {d.status}
                                                    </p>
                                                    <p className="text-xs text-gray-800 bg-white p-2 rounded-lg border border-gray-100">"{d.dispute_reason}"</p>
                                                    <DisputeMatchHistory history={d.match_history} />
                                                </div>
                                            ))}
                                            {/* Consolidated Sighting Evidence: reports merged into this case, numbered in the order they were filed */}
                                            {report.merged_reports && report.merged_reports.length > 0 && (() => {
                                                const isResidentSightingMedia = (m: any) => {
                                                    if (!m) return false;
                                                    if (m.is_evidence) return false;
                                                    if (m.media_type === 'Document') return false;
                                                    const url = (m.file_url || m.url || '').toLowerCase();
                                                    if (/\.(pdf|docx?|txt)$/i.test(url) || url.includes('/raw/')) return false;
                                                    return true;
                                                };
                                                // The first-filed report is the case itself, so it is listed too, as the 1st report.
                                                const self = { report_id: report.report_id, created_at: report.created_at, reporter_name: (report as any).reporter_name, landmark: report.landmark, description: report.description, media: (report.media || []).filter(isResidentSightingMedia), isCurrent: true };
                                                const merged = [self, ...report.merged_reports.filter((m: any) => m.report_id !== report.report_id)].sort((a: any, b: any) => {
                                                    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
                                                    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
                                                    return ta - tb || (a.report_id || 0) - (b.report_id || 0);
                                                });
                                                const ordinal = (n: number) => {
                                                    const s = ['th', 'st', 'nd', 'rd'];
                                                    const v = n % 100;
                                                    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
                                                };
                                                return (
                                                    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-role-border/80 shadow-xs space-y-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-8 h-8 rounded-xl bg-role-soft text-role border border-role-border flex items-center justify-center shrink-0">
                                                                <Link2 className="w-4 h-4" />
                                                            </div>
                                                            <div>
                                                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-wide">
                                                                    Consolidated Sighting Evidence ({merged.length} Merged Reports)
                                                                </h3>
                                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                                                    Photos and sightings from other residents confirmed for this same animal
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                                                            {merged.map((mr: any, mrIdx: number) => {
                                                                // The report being viewed is the highlighted card; clicking another card opens that report.
                                                                    const isSelected = !!mr.isCurrent;
                                                                    const openReport = () => { if (!mr.isCurrent && mr.report_id) navigate(`/brgy/reports/${mr.report_id}`); };
                                                                    return (
                                                                        <div
                                                                            key={mr.report_id || mr.id || `merged-report-${mrIdx}`}
                                                                            role="link"
                                                                            tabIndex={0}
                                                                            aria-current={isSelected ? 'page' : undefined}
                                                                            title={isSelected ? 'You are viewing this report' : `Open Report #${mr.report_id}`}
                                                                            onClick={openReport}
                                                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openReport(); } }}
                                                                            className={`p-3 rounded-xl border-2 space-y-2 transition-all ${isSelected
                                                                                ? 'border-[#F97316] bg-orange-50 ring-2 ring-[#F97316]/25 shadow-sm cursor-default'
                                                                                : 'border-stone-200 bg-stone-50/70 hover:border-orange-300 hover:bg-orange-50/40 cursor-pointer'}`}
                                                                        >
                                                                            <div className="flex items-center justify-between gap-2">
                                                                                <span className={`text-[10px] font-black uppercase tracking-wider ${isSelected ? 'text-[#C2410C]' : 'text-gray-500'}`}>
                                                                                    {ordinal(mrIdx + 1)} Report
                                                                                </span>
                                                                                {isSelected && (
                                                                                    <span className="px-2 py-0.5 rounded-full bg-[#F97316] text-white text-[9px] font-black uppercase tracking-wider">
                                                                                        ✓ Selected
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                
                                                                            <div className="flex items-center justify-between">
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <span className="text-xs font-black text-gray-900">
                                                                                        Report #{mr.report_id}
                                                                                    </span>
                                                                                    {mr.isCurrent ? (
                                                                                        <span className="px-1.5 py-0.5 rounded bg-role-soft text-role-strong text-[8px] font-black uppercase">
                                                                                            This Report
                                                                                        </span>
                                                                                    ) : mr.report_id === report.duplicate_of_report_id ? (
                                                                                    <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[8px] font-black uppercase">
                                                                                        Original Report
                                                                                    </span>
                                                                                    ) : (
                                                                                        <span className="px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 text-[8px] font-black uppercase">
                                                                                            Merged Duplicate
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <span className={`text-[9px] font-black ${mr.isCurrent ? 'text-gray-400' : 'text-role'}`}>
                                                                                    {mr.isCurrent ? 'Viewing now' : 'Open report →'}
                                                                                </span>
                                                                        </div>

                                                                        <div className="flex items-center gap-2 text-[11px] text-gray-600">
                                                                            <User className="w-3 h-3 shrink-0" />
                                                                            <span className="font-bold text-gray-800">{mr.reporter_name}</span>
                                                                            {mr.landmark && (
                                                                                <>
                                                                                    <span>•</span>
                                                                                    <span className="truncate inline-flex items-center gap-1"><MapPin className="w-2.5 h-2.5 shrink-0" /> {mr.landmark}</span>
                                                                                </>
                                                                            )}
                                                                        </div>

                                                                        {mr.description && (
                                                                            <p className="text-[11px] text-gray-600 italic bg-white p-2 rounded-lg border border-stone-100">
                                                                                "{reportDescriptionSummary(mr.description)}"
                                                                            </p>
                                                                        )}

                                                                        {(() => {
                                                                            const residentMedia = (mr.media || []).filter(isResidentSightingMedia);
                                                                            if (residentMedia.length === 0) return null;
                                                                            return (
                                                                                <div className="flex gap-1.5 overflow-x-auto py-0.5">
                                                                                    {residentMedia.map((m: any, mIdx: number) => {
                                                                                        const url = (m.file_url || m.url || '').toLowerCase();
                                                                                        const isVideo = m.media_type === 'Video' || /\.(mp4|webm|mov|ogg|m4v)$/i.test(url);
                                                                                        return (
                                                                                            <div
                                                                                                key={m.media_id || m.id || m.file_url || `merged-media-${mIdx}`}
                                                                                                onClick={(e) => { e.stopPropagation(); window.open(m.file_url, '_blank'); }}
                                                                                                className="relative w-14 h-14 rounded-lg overflow-hidden bg-stone-900 shrink-0 border border-stone-200 cursor-pointer hover:scale-105 transition-transform group"
                                                                                                title={isVideo ? "Click to view resident sighting video" : "Click to view resident sighting photo"}
                                                                                            >
                                                                                                {isVideo ? (
                                                                                                    <>
                                                                                                        <video src={m.file_url} className="w-full h-full object-cover" muted playsInline />
                                                                                                        <div className="absolute inset-0 bg-black/35 flex items-center justify-center">
                                                                                                            <span className="w-5 h-5 rounded-full bg-white/90 text-gray-900 flex items-center justify-center text-[9px] font-black pl-0.5 shadow-sm group-hover:scale-110 transition-transform">
                                                                                                                ▶
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    </>
                                                                                                ) : (
                                                                                                    <img src={m.file_url} alt="Resident sighting" className="w-full h-full object-cover" />
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            <div className="flex items-center gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                                                <img
                                                    src={getProfilePicture(report.reporter_photo)}
                                                    alt={report.reporter_name || 'Citizen'}
                                                    className="w-12 h-12 rounded-2xl object-cover border border-gray-200 shadow-2xs"
                                                    onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-black text-gray-900 uppercase truncate">
                                                        {report.reporter_name || 'Citizen Reporter'}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-3 mt-1 text-[10px] font-bold text-gray-500">
                                                        {report.reporter_phone && (
                                                            <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> {report.reporter_phone}</span>
                                                        )}
                                                        {report.reporter_email && (
                                                            <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" /> {report.reporter_email}</span>
                                                        )}
                                                        <span className="text-gray-400">
                                                            Reported <RelativeTimestamp date={report.created_at} />
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Reporter's Initial Description</p>
                                                <ReportDescription description={report.description} notesOnly />
                                            </div>
                                        </div>

                                        <SectionStep n={2} title="Animal Details" />
                                        <div id="sec-animal" className="scroll-mt-24 bg-white rounded-[2.5rem] border border-gray-100 p-6 sm:p-8 shadow-sm space-y-5">
                                            <div>
                                                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Animal Details</h3>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Category, type, condition and count</p>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Category</p>
                                                    <p className="text-xs font-black text-gray-900 mt-1 uppercase">
                                                        {categoryMap[report.category_id] || 'Stray Sighting'}
                                                    </p>
                                                </div>
                                                <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Animal Type</p>
                                                    <p className="text-xs font-black text-gray-900 mt-1 uppercase">
                                                        {report.animal_type || report.ai_animal_type || 'Unknown'}
                                                    </p>
                                                </div>
                                                <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Condition</p>
                                                    <p className={`text-xs font-black mt-1 uppercase ${
                                                        getEffectiveAnimalCondition(report).toLowerCase().includes('injured') || getEffectiveAnimalCondition(report).toLowerCase().includes('sick')
                                                            ? 'text-red-600'
                                                            : 'text-gray-900'
                                                    }`}>
                                                        {getEffectiveAnimalCondition(report)}
                                                    </p>
                                                </div>
                                                <div className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Animal Count</p>
                                                    <p className="text-xs font-black text-gray-900 mt-1">
                                                        {report.animal_count || 1} Stray{report.animal_count > 1 ? 's' : ''}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <SectionStep n={3} title="Location & Evidence" />
                                        {/* Incident Location Map Card */}
                                        <div id="sec-map" className="scroll-mt-24 bg-white rounded-[2.5rem] border border-gray-100 p-6 sm:p-8 shadow-sm space-y-4">
                                            <div className="flex items-center justify-between gap-2 flex-wrap">
                                                <div>
                                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Sighting Geolocation</h3>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                                        Route from Barangay Operations HQ
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {roadDistance !== null && (
                                                        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider border border-emerald-200">
                                                            {roadDistance < 1000 ? `${Math.round(roadDistance)}m` : `${(roadDistance / 1000).toFixed(1)}km`} away
                                                        </span>
                                                    )}
                                                    {/* Inline Resize Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsInlineMapExpanded(prev => !prev)}
                                                        className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                                                        title={isInlineMapExpanded ? "Compact map view" : "Taller map view"}
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-role-hover" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={isInlineMapExpanded ? "M4 8h16M4 16h16" : "M4 6h16M4 12h16M4 18h16"} />
                                                        </svg>
                                                        <span>{isInlineMapExpanded ? "Compact" : "Resize"}</span>
                                                    </button>
                                                    {/* Fullscreen Expand Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsMapExpanded(true)}
                                                        className="px-3 py-1.5 bg-role-soft hover:bg-role-muted text-role border border-role-border rounded-xl text-xs font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xs flex items-center gap-1.5"
                                                        title="Expand Map to Fullscreen Modal"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                                                        </svg>
                                                        <span>Expand Map</span>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Sighting Location / Street</p>
                                                <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-role" />
                                                    <span>{isGeocoding ? 'Resolving address...' : (resolvedAddress || report.landmark || 'Selera Homes')}</span>
                                                </p>
                                            </div>
                                            <div className={`w-full ${isInlineMapExpanded ? 'h-[500px] sm:h-[560px]' : 'h-[400px] sm:h-[460px] md:h-72'} transition-all duration-300 rounded-3xl overflow-hidden border border-gray-200 shadow-inner relative`}>
                                                {/* Floating Expand Map Button inside canvas */}
                                                <div className="absolute top-3 right-3 z-[400]">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsMapExpanded(true)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 hover:bg-white text-gray-800 text-xs font-black rounded-xl shadow-md border border-gray-200 backdrop-blur-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                                                        title="Expand Map to Fullscreen Modal"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-role" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                                                        </svg>
                                                        <span>Expand</span>
                                                    </button>
                                                </div>

                                                {(() => {
                                                    const isRelocated = !isResolvedCase && [7, 8].includes(report.status_id) && (!!report.facility_id || report.custody_status === 'Secured in Facility' || report.custody_status === 'In Barangay Facility' || !!report.facility);
                                                    const initLat = report.initial_latitude ? parseFloat(report.initial_latitude.toString()) : (report.latitude ? parseFloat(report.latitude.toString()) : null);
                                                    const initLng = report.initial_longitude ? parseFloat(report.initial_longitude.toString()) : (report.longitude ? parseFloat(report.longitude.toString()) : null);
                                                    const isOptionBSecured = report.custody_status === 'Secured' || report.custody_status === 'In Custody';
                                                    const hasDifferentInitialSpot = !isOptionBSecured && isRelocated && initLat != null && initLng != null && (Math.abs(initLat - sightingLat) > 0.0001 || Math.abs(initLng - sightingLng) > 0.0001);

                                                    const hadHoldingHistory = report.history?.some((h: any) => 
                                                        [7, 8].includes(h.status_id) || [7, 8].includes(h.report_status_id) || 
                                                        (h.notes && (h.notes.toLowerCase().includes('holding facility') || h.notes.toLowerCase().includes('holding pen'))) ||
                                                        (h.action && h.action.toLowerCase().includes('holding'))
                                                    ) || Boolean(report.facility_id) || Boolean(report.facility);
                                                    const histFacLat = 14.8069;
                                                    const histFacLng = 121.0039;
                                                    const histFacName = 'Barangay Holding Pen';

                                                    const brgyMarkers = isResolvedCase ? [
                                                        {
                                                            id: 1,
                                                            lat: initLat ?? sightingLat,
                                                            lng: initLng ?? sightingLng,
                                                            title: `1. Reported Incident Location: ${report.initial_landmark || resolvedAddress || report.landmark || 'Incident Location'}`,
                                                            category: 'Historical Sighting',
                                                            priority: report.priority_level || 'Medium',
                                                            color: 'slate',
                                                            rawData: { ...report, landmark: report.initial_landmark || report.landmark, is_resolved: true }
                                                        },
                                                        ...(hadHoldingHistory ? [{
                                                            id: -999,
                                                            lat: histFacLat,
                                                            lng: histFacLng,
                                                            title: `2. Holding Pen: ${histFacName}`,
                                                            category: 'Historical Holding',
                                                            priority: 'Low',
                                                            color: 'slate',
                                                            rawData: { ...report, landmark: histFacName, is_resolved: true }
                                                        }] : []),
                                                        {
                                                            id: 2,
                                                            lat: BRGY_OFFICE_COORDS[0],
                                                            lng: BRGY_OFFICE_COORDS[1],
                                                            title: 'Barangay San Vicente HQ',
                                                            category: 'HQ'
                                                        }
                                                    ] : [
                                                        {
                                                            id: 1,
                                                            lat: sightingLat,
                                                            lng: sightingLng,
                                                            title: isRelocated 
                                                                ? `Secured: ${report.facility?.name || report.landmark}` 
                                                                : (report.status_id === 6 
                                                                    ? `Animal Picked Up: ${resolvedAddress || report.landmark || 'Incident Location'}` 
                                                                    : (resolvedAddress || report.landmark || 'Sighting Location')),
                                                            category: isRelocated ? 'Holding Facility' : (report.animal_type || 'Stray Animal'),
                                                            color: report.status_id === 6 ? 'blue' : 'orange',
                                                            rawData: report
                                                        },
                                                        ...(hasDifferentInitialSpot ? [{
                                                            id: -999,
                                                            lat: initLat!,
                                                            lng: initLng!,
                                                            title: `Found Location: ${report.initial_landmark || 'Initial Sighting Spot'}`,
                                                            category: 'Initial Sighting',
                                                            priority: 'Medium',
                                                            rawData: { ...report, landmark: report.initial_landmark || 'Initial Sighting Spot' }
                                                        }] : []),
                                                        {
                                                            id: 2,
                                                            lat: BRGY_OFFICE_COORDS[0],
                                                            lng: BRGY_OFFICE_COORDS[1],
                                                            title: 'Barangay San Vicente HQ',
                                                            category: 'HQ'
                                                        }
                                                    ];

                                                    return (
                                                        <MapComponent
                                                            height="100%"
                                                            center={[isResolvedCase && initLat ? initLat : sightingLat, isResolvedCase && initLng ? initLng : sightingLng]}
                                                            zoom={15}
                                                            showHeatmap={false}
                                                            showGeofence={true}
                                                            showLandmarks={true}
                                                            showConnectingLine={false}
                                                            hideViewDetailsButton={true}
                                                            routing={!isResolvedCase && routeFrom && isValidLatLng(sightingLat, sightingLng) ? {
                                                                start: routeFrom === 'current' && userLocation ? userLocation : BRGY_OFFICE_COORDS,
                                                                end: [sightingLat, sightingLng] as [number, number],
                                                                waypointNames: [routeFrom === 'current' && userLocation ? 'Your Location' : 'Barangay Hall', report.landmark || 'Incident Location'] as [string, string],
                                                                onClose: () => setRouteFrom(null)
                                                            } : undefined}
                                                            onDirectionsClick={!isResolvedCase ? () => setRouteFrom('current') : undefined}
                                                            onDirectionsFromBrgyClick={!isResolvedCase ? () => setRouteFrom('brgy') : undefined}
                                                            onRouteCalculated={(dist) => setRoadDistance(dist)}
                                                            markers={brgyMarkers}
                                                        />
                                                    );
                                                })()}
                                            </div>

                                            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-1.5">
                                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-500">
                                                    <span>GPS Coordinates</span>
                                                    <span className="text-role">Active Pin</span>
                                                </div>
                                                <p className="text-xs font-mono font-bold text-gray-800">
                                                    {sightingLat.toFixed(6)}, {sightingLng.toFixed(6)}
                                                </p>
                                                <div className="pt-1 flex flex-col gap-1 text-[11px] font-bold">
                                                    {report.status_id === 6 ? (
                                                        <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200/60 text-blue-900 space-y-1">
                                                            <div className="flex items-center gap-1.5 font-black text-xs text-blue-900 uppercase tracking-wide">
                                                                <PawPrint className="w-3.5 h-3.5" />
                                                                <span>Animal Picked Up (In Transit)</span>
                                                            </div>
                                                            <p className="text-[11px] text-blue-800 leading-relaxed font-semibold">
                                                                Animal has been secured by the Barangay Response Team. Click <span className="font-extrabold text-blue-950">"Move to Holding Facility"</span> below once delivered to a holding pen or facility.
                                                            </p>
                                                            <p className="text-[10px] text-blue-700/80 font-medium flex items-center gap-1">
                                                                <MapPin className="w-2.5 h-2.5" /> Pickup Origin: <span className="font-bold text-blue-900">{resolvedAddress || report.landmark || 'Incident Location'}</span>
                                                            </p>
                                                        </div>
                                                    ) : (report.status_id !== 6 && (report.facility_id || report.custody_status === 'Secured in Facility' || report.custody_status === 'In Barangay Facility' || report.facility || custodyProgression.hasMoved)) ? (
                                                        <>
                                                            <p className="text-amber-900 flex items-center gap-1">
                                                                <Building2 className="w-3 h-3 shrink-0" /> Current Holding Facility: <span className="font-extrabold">{report.facility?.name || custodyProgression.currentFacility || report.landmark}</span>
                                                                {(report.facility?.contact_person || report.facility?.caretaker_name) && (
                                                                    <span className="block text-[10px] text-amber-800 font-semibold mt-0.5">
                                                                        Caretaker: {report.facility?.contact_person || report.facility?.caretaker_name} {(report.facility?.contact_number || report.facility?.caretaker_phone) ? `(${report.facility.contact_number || report.facility.caretaker_phone})` : ''}
                                                                    </span>
                                                                )}
                                                            </p>
                                                            {custodyProgression.steps.filter(s => !s.isCurrent).map((prev, pIdx) => (
                                                                <p key={pIdx} className="text-amber-800/90 text-[10px] flex items-center gap-1">
                                                                    <Home className="w-2.5 h-2.5 shrink-0" /> Previous Facility: <span className="font-extrabold">{prev.name}</span>
                                                                </p>
                                                            ))}
                                                            <p className="text-gray-500 text-[10px] flex items-center gap-1">
                                                                <Flag className="w-2.5 h-2.5 shrink-0" /> Spotted (Preserved Incident Origin): <span className="font-extrabold text-gray-700">{custodyProgression.origin}</span>
                                                            </p>
                                                        </>
                                                    ) : (
                                                        <p className="text-gray-500 text-[10px]">
                                                            Subdivision Landmark: <span className="text-gray-900 font-extrabold">{report.landmark || 'Selera Homes'}</span>
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Incident Media & Photo Section */}
                                        <div id="sec-photos" className="scroll-mt-24 bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-5">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Incident Sighting Evidence</h3>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                                        Photos submitted by the citizen reporter
                                                    </p>
                                                </div>
                                                {imagesList.length > 1 && (
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                                        {activeMediaIndex + 1} of {imagesList.length} Photos
                                                    </span>
                                                )}
                                            </div>

                                            {activeImage ? (
                                                <div className="space-y-3">
                                                    <div
                                                        onClick={() => setIsLightboxOpen(true)}
                                                        className="relative h-80 sm:h-96 w-full rounded-3xl overflow-hidden bg-gray-900 group cursor-pointer shadow-xs border border-gray-100"
                                                    >
                                                        <img
                                                            src={activeImage.file_url || activeImage.url}
                                                            alt={`Incident ${report.report_id}`}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                        />
                                                        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                            <span className="px-4 py-2 bg-white/95 text-gray-900 text-xs font-black uppercase tracking-wider rounded-2xl shadow-lg flex items-center gap-2">
<Search className="w-3.5 h-3.5" /> Click to Expand Fullscreen
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Multi-photo Thumbnail Selector */}
                                                    {imagesList.length > 1 && (
                                                        <div className="flex items-center gap-3 overflow-x-auto pb-2">
                                                            {imagesList.map((img: any, idx: number) => (
                                                                <button
                                                                    key={idx}
                                                                    onClick={() => setActiveMediaIndex(idx)}
                                                                    className={`relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${activeMediaIndex === idx ? 'border-role ring-2 ring-role-border' : 'border-gray-200 opacity-70 hover:opacity-100'}`}
                                                                >
                                                                    <img src={img.file_url || img.url} alt="Thumbnail" className="w-full h-full object-cover" />
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="h-64 rounded-3xl bg-gray-50 border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400">
                                                    <Camera className="w-10 h-10 mb-2" />
                                                    <p className="text-xs font-black uppercase tracking-widest">No photo provided</p>
                                                </div>
                                            )}
                                        </div>

                                        <SectionStep n={4} title="Assessment" />
                                        {/* AI Vision & Behavioral Intelligence */}
                                        <div id="sec-ai" className="scroll-mt-24 bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-6">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">AI Vision & Behavioral Intelligence</h3>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                                        Automated multi-modal animal classification
                                                    </p>
                                                </div>
                                                <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-[9px] font-black uppercase tracking-wider border border-blue-100">
                                                    AI Copilot Active
                                                </span>
                                            </div>

                                            <AISuggestionPanel
                                                aiReport={report}
                                                animalType={report.animal_type || report.ai_animal_type}
                                                dominantColor={(report as any).animal_color || report.ai_dominant_color}
                                                coatPattern={(report as any).coat_pattern || (report as any).animal_pattern || (report as any).ai_coat_pattern}
                                                estimatedSize={(report as any).estimated_size || report.ai_estimated_size}
                                                suggestedRiskLevel={report.ai_suggested_risk_level}
                                                suggestedPriority={report.ai_suggested_priority}
                                                possibleBreed={(report as any).animal_breed || (report as any).breed || report.ai_possible_breed}
                                                description={report.description}
                                                categoryName={categoryMap[report.category_id]}
                                                suggestedPriorityReason={report.ai_suggested_priority_reason}
                                                behaviorChasing={(report as any).ai_behavior_chasing}
                                                behaviorActualBite={(report as any).ai_behavior_actual_bite}
                                                behaviorAttemptedBite={(report as any).ai_behavior_attempted_bite}
                                                behaviorInjury={(report as any).ai_behavior_injury}
                                                behaviorAggressive={(report as any).ai_behavior_aggressive}
                                                behaviorExplanation={(report as any).ai_behavior_explanation}
                                                aiPhotoLikelihood={(report as any).ai_photo_likelihood}
                                                aiPhotoStatus={(report as any).ai_photo_status}
                                                aiPhotoRecommendation={(report as any).ai_photo_recommendation}
                                                aiPhotoDetails={(report as any).ai_photo_details}
                                                verificationStatus={report.verification_status}
                                                verifiedActualBite={(report as any).verified_actual_bite}
                                                verifiedChasing={(report as any).verified_chasing}
                                                verifiedAttemptedBite={(report as any).verified_attempted_bite}
                                                verifiedInjury={(report as any).verified_injury}
                                                verifiedAggressive={(report as any).verified_aggressive}
                                                behaviorFinding={(report as any).behavior_finding}
                                                verificationNotes={report.verification_notes}
                                                verifiedByName={(report as any).verified_by_name}
                                                verifiedAt={report.verified_at ? String(report.verified_at) : null}
                                            />
                                        </div>

                                        <SectionStep n={5} title="Verification & Endorsement" />
                                        {/* Subdivision Escalation & Endorsement Section */}
                                        <div id="sec-verify" className="scroll-mt-24 bg-gradient-to-br from-role-soft/70 via-amber-50/40 to-white rounded-[2.5rem] border border-role-border/80 p-8 shadow-sm space-y-6">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-role-muted">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-role text-white flex items-center justify-center shadow-md shadow-role/20">
                                                        <Landmark className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">Subdivision Escalation Endorsement</h4>
                                                        <p className="text-[10px] font-bold text-role-hover uppercase tracking-widest mt-0.5">
                                                            Official transfer from HOA Leadership
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-role-muted text-role text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                                                    Official Endorsement <Check className="w-2.5 h-2.5" />
                                                </span>
                                            </div>

                                            {escalationTitle && (
                                                <p className="text-sm font-black text-gray-900 uppercase tracking-wide">
                                                    {escalationTitle}
                                                </p>
                                            )}

                                            <div className="p-5 rounded-2xl bg-white/90 border border-role-muted shadow-2xs space-y-3">
                                                <p className="text-[10px] font-black text-role-hover uppercase tracking-widest">Leader's Statement & Notes:</p>
                                                <p className="text-sm font-bold text-gray-800 leading-relaxed italic">
                                                    "{escalationNote || 'Escalated for immediate Barangay animal control intervention and handling.'}"
                                                </p>
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-role-border text-role-strong font-black text-xs flex items-center justify-center border-2 border-white shadow-xs">
                                                        {leaderName.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-gray-900 uppercase">{leaderName}</p>
                                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">
                                                            {leaderPos} • {leaderDate ? new Date(leaderDate).toLocaleDateString() : 'Active Escalation'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {endorsementFileUrl && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsEndorsementModalOpen(true)}
                                                        className="px-4 py-2.5 bg-role hover:bg-role-hover text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-role/20 flex items-center gap-2 cursor-pointer self-start sm:self-auto"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" />
                                                        <span>View Endorsement Document</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        <SectionStep n={6} title="Rescue & Mission" />
                                        {/* Assigned Personnel Card (3-5 Person Response Team) */}
                                        <div id="sec-team" className="scroll-mt-24 bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-5">
                                            {!canUpdateStatus && (
                                                <div className="p-4 bg-amber-50/90 border border-amber-200/80 rounded-2xl text-amber-900 space-y-2 mb-4 shadow-2xs">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center"><Lock className="w-2.5 h-2.5" /></span>
                                                        <span className="font-black text-[10px] uppercase tracking-wider text-amber-900">Status Update Restricted</span>
                                                    </div>
                                                    <p className="text-[10px] text-amber-800 font-medium leading-relaxed">
                                                        Only field responders assigned to this report (or the Barangay Head Officer) have the ability to update its operational status.
                                                    </p>
                                                </div>
                                            )}

                                            <div className="flex flex-col gap-4">
                                                <div>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-base font-black text-gray-900 uppercase tracking-tight leading-tight">Assigned Operations Team</h3>
                                                        {activeAssignments.length > 0 && (
                                                            <span className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                                                                {activeAssignments.length} {activeAssignments.length === 1 ? 'Responder' : 'Responders'}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                                        Barangay Field Responders
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsChatOpen(true)}
                                                        className="px-4 py-2.5 bg-gradient-to-r from-role to-amber-500 hover:from-role-hover hover:to-amber-600 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                                                        title="Open Case Coordination Chat"
                                                    >
                                                        <MessageCircle className="w-3.5 h-3.5" />
                                                        <span>Team Chat {chatCount > 0 ? `(${chatCount})` : ''}</span>
                                                    </button>
                                                    {isHeadOfficer && (
                                                        <button
                                                            type="button"
                                                            onClick={openAssignModal}
                                                            className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all border border-blue-200 cursor-pointer flex items-center gap-1.5 shadow-2xs"
                                                        >
                                                            <Users className="w-3.5 h-3.5" />
                                                            <span>{activeAssignments.length > 0 ? 'Manage Responders' : '+ Assign Responders'}</span>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {activeAssignments.length > 0 ? (
                                                <div className="space-y-3 pt-2">
                                                    <div className="grid grid-cols-1 gap-3">
                                                        {activeAssignments.map((member, index) => {
                                                            return (
                                                                <div key={member.assignment_id || index} className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-blue-50/40 border border-blue-100/80 hover:bg-blue-50/70 transition-all">
                                                                    <div className="relative shrink-0">
                                                                        <div className="w-12 h-12 rounded-2xl bg-role text-white font-black text-sm flex items-center justify-center shadow-xs overflow-hidden">
                                                                            {member.staff_photo ? (
                                                                                <img src={getProfilePicture(member.staff_photo)} alt={member.staff_name || 'Responder'} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                                            ) : (
                                                                                (member.staff_name || 'R').charAt(0).toUpperCase()
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <h4 className="text-sm font-black text-gray-900 uppercase truncate">
                                                                                {member.staff_name || 'Barangay Responder'}
                                                                            </h4>
                                                                        </div>
                                                                        <div className="flex items-center gap-1.5 mt-1">
                                                                            <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                                                                                Field Responder
                                                                            </span>
                                                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                        </div>
                                                                        {member.staff_phone && (
                                                                            <p className="text-[10px] text-gray-500 font-bold truncate mt-1 flex items-center gap-1">
                                                                                <Phone className="w-2.5 h-2.5" /> {member.staff_phone}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="p-8 rounded-2xl bg-gray-50 border border-dashed border-gray-200 text-center space-y-2">
                                                    <div className="w-12 h-12 rounded-2xl bg-role-soft text-role flex items-center justify-center mx-auto shadow-2xs">
                                                        <Users className="w-6 h-6" />
                                                    </div>
                                                    <p className="text-xs font-black text-gray-800 uppercase tracking-wide">No Personnel Currently Assigned</p>
                                                    <p className="text-[11px] font-medium text-gray-500 max-w-md mx-auto">
                                                        Barangay in-charge can dispatch <strong>1 or more responders</strong> (up to 5) to safely contain and secure the animal.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={openAssignModal}
                                                        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-role text-white text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-role-hover transition-all cursor-pointer shadow-md hover:scale-105"
                                                    >
                                                        <span>+</span>
                                                        <span>Assign Responders Now</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        {/* Location & Custody Movement History */}
                                        {(report.facility_id || report.custody_status === 'Secured in Facility' || report.custody_status === 'In Barangay Facility' || report.facility || custodyProgression.hasMoved) && (
                                            <div id="sec-custody" className="scroll-mt-24 p-6 rounded-[2.5rem] bg-gradient-to-br from-amber-500/10 via-role/5 to-amber-500/10 border-2 border-amber-300/80 shadow-sm space-y-4 animate-in fade-in duration-300">
                                                <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-amber-200/60">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="w-10 h-10 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-md shadow-amber-600/20">
                                                            <PawPrint className="w-5 h-5" />
                                                        </span>
                                                        <div>
                                                            <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black uppercase tracking-wider shadow-xs">
                                                                {report.custody_status || 'Secured in Facility'}
                                                            </span>
                                                            <h4 className="text-base font-black text-amber-950 uppercase mt-0.5">
                                                                Location & Custody Flow
                                                            </h4>
                                                        </div>
                                                    </div>
                                                    {report.facility?.subdivision_name ? (
                                                        <span className="px-3 py-1 bg-white border border-amber-200 text-amber-900 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                                                            <MapPin className="w-3 h-3" /> {report.facility.subdivision_name}
                                                        </span>
                                                    ) : (
                                                        <span className="px-3 py-1 bg-white border border-amber-200 text-amber-900 rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                                                            <MapPin className="w-3 h-3" /> Barangay San Vicente Facility
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Step-by-Step Movement Chain */}
                                                <div className="space-y-3">
                                                    {/* 1. Spotted (Preserved Incident Origin) */}
                                                    <div className="flex items-start gap-3 bg-white/95 p-3.5 rounded-2xl border border-amber-200 shadow-2xs">
                                                        <div className="w-8 h-8 rounded-xl bg-role-muted text-role flex items-center justify-center shrink-0">
                                                            <Flag className="w-4 h-4" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-[10px] font-black text-role uppercase tracking-wider">
                                                                    • Spotted (Preserved Incident Origin)
                                                                </span>
                                                                {report.created_at && (
                                                                    <span className="text-[9px] font-bold text-gray-400">
                                                                        {new Date(report.created_at).toLocaleDateString()}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs font-black text-gray-900 mt-0.5">
                                                                {custodyProgression.origin}
                                                            </p>
                                                            <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                                                Initial Sighting Spot where animal was originally reported
                                                            </p>
                                                        </div>
                                                    </div>

                                                    {/* 2. Previous Facility Holding Location(s) */}
                                                    {custodyProgression.steps.filter(s => !s.isCurrent).map((prevStep, idx) => (
                                                        <div key={idx} className="flex items-start gap-3 bg-white/80 p-3.5 rounded-2xl border border-amber-200/80 shadow-2xs">
                                                            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                                                                <Home className="w-4 h-4" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
                                                                        • Facility Holding Location
                                                                    </span>
                                                                    {prevStep.date && (
                                                                        <span className="text-[9px] font-bold text-gray-400">
                                                                            {new Date(prevStep.date).toLocaleDateString()}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="text-xs font-black text-gray-900 mt-0.5">
                                                                    {prevStep.name}
                                                                </p>
                                                                <p className="text-[10px] text-gray-500 font-medium mt-0.5">
                                                                    Temporary Holding Pen / Initial Shelter Custody
                                                                </p>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {/* 3. Current Facility Holding Location / Transferred To */}
                                                    <div className="flex items-start gap-3 bg-gradient-to-r from-role-soft/90 to-amber-50/90 p-4 rounded-2xl border-2 border-role shadow-xs">
                                                        <div className="w-8 h-8 rounded-xl bg-role text-white flex items-center justify-center shrink-0">
                                                            <Building2 className="w-4 h-4" />
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-[10px] font-black text-role uppercase tracking-wider flex items-center gap-1.5">
                                                                    <span>• {custodyProgression.steps.length > 1 ? 'Transferred To (Current Facility)' : 'Current Facility Holding Location'}</span>
                                                                    <span className="px-1.5 py-0.2 rounded bg-role text-white text-[8px] font-bold uppercase">Active</span>
                                                                </span>
                                                            </div>
                                                            <p className="text-sm font-black text-gray-900 mt-0.5">
                                                                {report.facility?.name || custodyProgression.currentFacility || report.landmark || 'Holding Facility'}
                                                            </p>
                                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[10px] font-bold text-gray-600">
                                                                {(report.facility?.contact_person || report.facility?.caretaker_name) && (
                                                                    <span>Caretaker: <strong className="text-gray-900">{report.facility?.contact_person || report.facility?.caretaker_name}</strong></span>
                                                                )}
                                                                {(report.facility?.contact_number || report.facility?.caretaker_phone) && (
                                                                    <span>Hotline: <a href={`tel:${report.facility?.contact_number || report.facility?.caretaker_phone}`} className="text-role underline font-black">{report.facility?.contact_number || report.facility?.caretaker_phone}</a></span>
                                                                )}
                                                                {report.facility?.capacity && (
                                                                    <span>Capacity: <strong className="text-gray-900">{report.facility.capacity} animals</strong></span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {/* Staff activity photos, kept apart from the reporter's photos */}
                                        <ActivityPhotos media={report.media as any} />

                                        <SectionStep n={7} title="History & Status" />
                                        {/* Report Activity & Handover Timeline */}
                                        <div id="sec-timeline" className="scroll-mt-24 bg-white border border-gray-100 rounded-[2.5rem] p-6 sm:p-7 shadow-sm space-y-5">
                                            {/* Header */}
                                            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-role-soft text-role flex items-center justify-center shadow-xs shrink-0">
                                                        <ScrollText className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                                                            Report Activity & Handover Timeline
                                                        </h4>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                                            Official Audit Trail & Officer Activity Log
                                                        </p>
                                                    </div>
                                                </div>
                                                {(() => {
                                                    const validHistory = buildCaseTimeline(report, caseHolding).filter((h: any) => (h.remarks || '').trim() !== 'Initial report submitted by resident.');
                                                    const totalEvents = validHistory.length + 1;
                                                    return (
                                                        <span className="text-[10px] font-black text-gray-600 bg-gray-100/90 px-2.5 py-1 rounded-full border border-gray-200/60 shadow-2xs whitespace-nowrap">
                                                            {totalEvents} {totalEvents === 1 ? 'Event' : 'Events'}
                                                        </span>
                                                    );
                                                })()}
                                            </div>

                                            {/* Shared activity timeline (same entries as the resident view) */}
                                            <div className="max-h-[600px] overflow-y-auto pr-1 custom-scrollbar">
                                                <RescueTimeline
                                                    history={buildCaseTimeline(report, caseHolding)}
                                                    currentStatusId={report.status_id}
                                                    assignedLeaderName={(report as any).assigned_leader_name}
                                                    reporterName={(report as any).reporter_name}
                                                    reportCreatedAt={report.created_at}
                                                    animalType={report.animal_type}
                                                    landmark={report.landmark}
                                                    endorsementLetter={(report as any).endorsement_letter}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN: operations panel, kept in view while reading the record */}
                                    <div className="space-y-6 lg:self-stretch">
                                        {/* Operations Quick Actions Control Panel */}
                                        <div id="sec-actions" className="scroll-mt-24 lg:sticky lg:top-24 bg-white rounded-[2.5rem] border border-gray-100 p-6 sm:p-8 shadow-sm space-y-6">
                                            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                                                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Barangay Operations</h3>
                                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                                            </div>

                                            {awaitingApproval && (
                                                <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5" data-testid="awaiting-approval-banner">
                                                    <Lock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                                                    <div className="text-xs text-amber-900">
                                                        <p className="font-black">Awaiting your approval</p>
                                                        <p className="mt-0.5">This case was escalated by the Subdivision. Approve or reject it below. Assigning a team, dispatching and status updates unlock once it is approved.</p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Animal record (pet record / community animal) */}
                                            {![3, 14, 18].includes(report.status_id) && !report.duplicate_of_report_id && (
                                                (report.pet_id || (report as any).case_pet_id) ? (
                                                    <div className="space-y-2">
                                                        <CasePetBadge report={report} />
                                                        <InheritedIdentityNotice report={report} onDone={fetchReportDetails} />
                                                    </div>
                                                ) : !canReview ? (
                                                    <p className="text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-200 rounded-2xl px-3 py-2.5">
                                                        👁 {reviewNote || 'The Subdivision Leader adds the animal record for this report.'}
                                                    </p>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => (awaitingApproval ? setApproveFirstNotice(true) : setIsAddPetModalOpen(true))}
                                                        className="w-full py-3 border border-role-border bg-gradient-to-r from-role-soft to-amber-50 hover:from-role-muted hover:to-amber-100 text-role-hover rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition-all"
                                                        title="Register this animal in Pet Records (owner optional)"
                                                    >
                                                        <PawPrint className="w-3.5 h-3.5" />
                                                        <span>Add Record for this Animal</span>
                                                    </button>
                                                )
                                            )}

                                            {/* Contextual Action Buttons based on status */}
                                            <div className="space-y-3">
                                                {canUpdateStatus && (
                                                    <>
                                                        {report.status_id === 4 && (
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleQuickApprove}
                                                                    disabled={isSubmittingStatus}
                                                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                >
                                                                    <Check className="w-3.5 h-3.5" />
                                                                    <span>Approve Request</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={handleQuickReject}
                                                                    disabled={isSubmittingStatus}
                                                                    className="w-full py-3 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                                                >
                                                                    <X className="w-3.5 h-3.5" />
                                                                    <span>Reject</span>
                                                                </button>
                                                            </div>
                                                        )}

                                                        {report.status_id === 13 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openStatusModal(5)}
                                                                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer"
                                                            >
                                                                <Rocket className="w-3.5 h-3.5" />
                                                                <span>Dispatch Response Team</span>
                                                            </button>
                                                        )}

                                                        {report.status_id === 5 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => openStatusModal(6)}
                                                                className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
                                                            >
                                                                <PawPrint className="w-3.5 h-3.5" />
                                                                <span>Mark Animal Picked Up</span>
                                                            </button>
                                                        )}

                                                        {report.status_id === 6 && (
                                                            <div className="space-y-3">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openStatusModal(7)}
                                                                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-purple-600/20 flex items-center justify-center gap-2 cursor-pointer"
                                                                >
                                                                    <Hospital className="w-3.5 h-3.5" />
                                                                    <span>Move to Holding Facility</span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openStatusModal(9)}
                                                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
                                                                >
                                                                    <Check className="w-3.5 h-3.5" />
                                                                    <span>Return to Owner / Reunited</span>
                                                                </button>
                                                            </div>
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusModal(report.status_id)}
                                                            disabled={isReportFinalized || awaitingApproval}
                                                            className={`w-full py-3 font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 ${
                                                                isReportFinalized
                                                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed opacity-60 border border-gray-200'
                                                                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800 cursor-pointer'
                                                            }`}
                                                        >
                                                            {isReportFinalized ? (
                                                                <>
                                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                                                    <span>Mission Finalized ({getReportStatusLabel(report.status_id)})</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Settings className="w-3.5 h-3.5" />
                                                                    <span>Update Operation Status</span>
                                                                </>
                                                            )}
                                                        </button>
                                                    </>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => setIsChatOpen(true)}
                                                    className="w-full py-3 bg-role-soft hover:bg-role-muted text-role border border-role-border font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    <span>Open Mission Chat Drawer</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </main>
                <BrgyBottomNav />
            </div>

            {/* Case Chat Drawer */}
            <ReportChatDrawer
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                report={{
                    ...report,
                    report_id: report?.report_id || parseInt(id || '0'),
                    rescue_id: rescueRequest?.rescue_id,
                    title: escalationTitle,
                    reporter_name: report?.reporter_name || leaderName
                }}
                currentUser={currentUser}
            />

            {/* Status Update Modal */}
            {isStatusModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 sm:p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">
                                    Update Operation Status
                                </h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                    Report #{report?.report_id} • Mission Stage
                                </p>
                            </div>
                            <button
                                onClick={() => setIsStatusModalOpen(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-6 sm:p-8 overflow-y-auto custom-scrollbar space-y-5">
                            {/* Status Selector */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Next Stage</label>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                                        Current: <strong className="text-role-hover">{getReportStatusLabel(report?.status_id)}</strong>
                                    </span>
                                </div>
                                <select
                                    value={targetStatusId}
                                    onChange={(e) => {
                                        const nextId = parseInt(e.target.value);
                                        setTargetStatusId(nextId);
                                        if (nextId === 9) {
                                            const currentRep = report || rescueRequest?.report || null;
                                            const regOwner = (currentRep?.owner_id) ? {
                                                user_id: currentRep.owner_id,
                                                name: currentRep.owner_name || currentRep.matched_pet_record?.owner_name || 'Registered Owner',
                                                phone: currentRep.owner_phone,
                                                email: currentRep.owner_email,
                                                address: currentRep.owner_address,
                                            } : null;
                                            if (regOwner) {
                                                setOwnerReturn({
                                                    has_account: true,
                                                    owner_user_id: regOwner.user_id,
                                                    relationship_to_animal: 'Owner'
                                                });
                                            }
                                        }
                                        if ((nextId === 7 || nextId === 8) && facilities.length === 0) {
                                            alert('Notice: No holding facility registered for this Barangay. Please register a facility in Landmarks & Facilities first.');
                                        }
                                    }}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 focus:outline-none focus:border-role transition-all"
                                >
                                    <option value={13} disabled={isStepDone(13)}>
                                        {getStepLabel(13, 'Approved (Prepare Team)')}
                                    </option>
                                    <option value={5} disabled={isStepDone(5)}>
                                        {getStepLabel(5, 'Dispatched (Team in Transit)')}
                                    </option>
                                    <option value={6} disabled={isStepDone(6)}>
                                        {getStepLabel(6, 'Picked Up (Animal Secured)')}
                                    </option>
                                    <option value={7} disabled={isStepDone(7)}>
                                        {getStepLabel(7, 'Holding Facility (Observation)')}
                                    </option>
                                    <option value={8} disabled={isStepDone(8)}>
                                        {getStepLabel(8, 'Impounded')}
                                    </option>
                                    <option value={9} disabled={isStepDone(9)}>
                                        {getStepLabel(9, 'Returned to Owner / Reunited')}
                                    </option>
                                    <option value={17} disabled={isStepDone(17)}>
                                        {getStepLabel(17, 'Animal Cannot Be Found')}
                                    </option>
                                    <option value={3} disabled={isStepDone(3)}>
                                        {getStepLabel(3, 'Rejected')}
                                    </option>
                                    <option value={12} disabled={isStepDone(12)}>
                                        {getStepLabel(12, 'Resolved (Deceased)')}
                                    </option>
                                    <option value={14} disabled={isStepDone(14)}>
                                        {getStepLabel(14, 'False Alarm / Dismissed')}
                                    </option>
                                </select>
                            </div>

                            {/* Warning if current selection is already completed */}
                            {isStepDone(targetStatusId) && (
                                <div className="p-3.5 bg-gray-100 border border-gray-300 rounded-2xl text-xs text-gray-700 flex items-center gap-2 animate-in fade-in">
                                    <AlertTriangle className="w-4 h-4 text-gray-500 shrink-0" />
                                    <span>This stage has already been completed or is the active stage. Please choose an upcoming stage.</span>
                                </div>
                            )}

                            {targetStatusId === 9 && (
                                <OwnerReturnPicker
                                    value={ownerReturn}
                                    reportId={report?.report_id}
                                    existingReturn={existingReportReturn}
                                    onAlreadyReturned={setExistingReportReturn}
                                    petOwnerId={(report as any)?.owner_id}
                                    petId={(report as any)?.pet_id}
                                    registeredOwner={
                                        ((report as any)?.owner_id) ? {
                                            user_id: (report as any).owner_id,
                                            name: (report as any).owner_name || (report as any).matched_pet_record?.owner_name || 'Registered Owner',
                                            phone: (report as any).owner_phone,
                                            email: (report as any).owner_email,
                                            address: (report as any).owner_address,
                                        } : null
                                    }
                                    petRecord={
                                        (report as any)?.pet_id ? {
                                            pet_id: (report as any).pet_id,
                                            pet_name: (report as any).pet_name || (report as any).matched_pet_record?.pet_name || (report as any).animal_type || 'Animal',
                                            photo_url: (report as any).pet_photo_url || (report as any).matched_pet_record?.photo_url || (report?.media && report.media[0]?.file_url),
                                            breed: (report as any).pet_breed || (report as any).animal_breed || (report as any).breed || (report as any).matched_pet_record?.breed,
                                            species: (report as any).animal_type || 'Animal',
                                            color: (report as any).animal_color || (report as any).matched_pet_record?.color,
                                        } : null
                                    }
                                    onChange={setOwnerReturn}
                                />
                            )}

                            {/* Warning if trying to resolve an unregistered Dog/Cat */}
                            {(targetStatusId === 11 || targetStatusId === 9) && (() => {
                                const rawSp = (report?.animal_type || report?.ai_animal_type || '').toLowerCase();
                                const isDc = rawSp.includes('dog') || rawSp.includes('cat');
                                const hasRec = Boolean(report?.pet_id);
                                if (isDc && !hasRec) {
                                    return (
                                        <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-xs text-amber-900 space-y-1 animate-in fade-in">
                                            <p className="font-bold flex items-center gap-1.5">
                                                <span>⚠️</span> <span>Registration Required Before Resolution</span>
                                            </p>
                                            <p className="text-[11px] text-amber-800">
                                                This {rawSp.includes('cat') ? 'Cat' : 'Dog'} must be registered in the Pet Records before this report can be marked as resolved.
                                            </p>
                                        </div>
                                    );
                                }
                                return null;
                            })()}


                            {/* Holding Facility Selector (Stage 7: Holding Facility or Stage 8: Impounded) */}
                            {(targetStatusId === 7 || targetStatusId === 8) && (
                                <div className="space-y-3 bg-amber-50/60 p-4 sm:p-5 rounded-3xl border border-amber-200/90 shadow-2xs">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center shadow-2xs">
                                                <PawPrint className="w-3.5 h-3.5" />
                                            </span>
                                            <label className="text-[10px] font-black text-amber-950 uppercase tracking-widest">
                                                Select Facility Location <span className="text-red-500">*</span>
                                            </label>
                                        </div>
                                        <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                                            facilities.length > 0
                                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                                : 'bg-red-50 text-red-600 border-red-200'
                                        }`}>
                                            {facilities.length} Registered
                                        </span>
                                    </div>

                                    <div className="p-2.5 rounded-2xl bg-white/90 border border-amber-200 flex items-center gap-2 text-[10px] text-amber-900 leading-tight">
                                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                                        <span>
                                            Facilities are managed by the Barangay / Admin. Moving this animal updates its live GPS pin to the selected facility while preserving the original sighting spot.
                                        </span>
                                    </div>

                                    {isLoadingFacilities ? (
                                        <div className="p-6 text-center text-xs font-bold text-gray-500">
                                            Loading registered facilities...
                                        </div>
                                    ) : facilities.length === 0 ? (
                                        <div className="p-5 rounded-2xl bg-white border-2 border-dashed border-red-300 text-center space-y-2 animate-in fade-in">
                                            <div className="w-10 h-10 mx-auto rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center shadow-2xs">
                                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                            </div>
                                            <p className="text-xs font-black text-red-700 uppercase tracking-wider">No Facility Registered</p>
                                            <p className="text-[11px] text-gray-600 leading-relaxed max-w-sm mx-auto">
                                                There are currently no holding facilities registered for this Barangay. Please register a facility under <strong>Landmarks & Facilities</strong> before placing an animal in a holding facility.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-2.5 max-h-56 overflow-y-auto custom-scrollbar pr-1">
                                            {facilities.map((fac: any) => {
                                                const isSelected = selectedFacilityId === fac.landmark_id;
                                                const isBarangayCentral = fac.subdivision_id == null;

                                                return (
                                                    <div
                                                        key={fac.landmark_id}
                                                        onClick={() => setSelectedFacilityId(fac.landmark_id)}
                                                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-2 ${
                                                            isSelected
                                                                ? 'bg-white border-role shadow-sm ring-2 ring-role-border'
                                                                : 'bg-white/90 border-gray-200 hover:border-amber-300 hover:bg-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between gap-2">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                {isBarangayCentral ? <Landmark className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
                                                                <div className="min-w-0">
                                                                    <p className="text-xs font-black text-gray-900 truncate">
                                                                        {fac.name}
                                                                    </p>
                                                                    <span className={`inline-block text-[8px] font-black uppercase px-2 py-0.5 rounded-md mt-0.5 ${
                                                                        isBarangayCentral
                                                                            ? 'bg-role-muted text-role-strong'
                                                                            : 'bg-blue-100 text-blue-800'
                                                                    }`}>
                                                                        {isBarangayCentral ? 'Barangay Central Facility' : (fac.subdivision_name ? `Subdivision • ${fac.subdivision_name}` : 'Subdivision Facility')}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0">
                                                                {isSelected ? (
                                                                    <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-role text-white shadow-2xs flex items-center gap-1">
                                                                        <Check className="w-2.5 h-2.5" /> Selected
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[9px] font-bold text-gray-400 px-2 py-1 rounded-lg border border-gray-200 hover:border-role-border">
                                                                        Select
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Details: Caretaker, Type, Capacity, GPS */}
                                                        <div className="grid grid-cols-2 gap-1.5 pt-1 border-t border-gray-100 text-[10px] text-gray-600">
                                                            <div>
                                                                <span className="text-gray-400 font-semibold">Caretaker: </span>
                                                                <span className="font-bold text-gray-800">
                                                                    {fac.contact_person || fac.caretaker_name || 'Designated Staff'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-400 font-semibold">Hotline: </span>
                                                                <span className="font-bold text-gray-800">
                                                                    {fac.contact_number || fac.caretaker_phone || 'No phone'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-400 font-semibold">Type: </span>
                                                                <span className="font-bold text-gray-800">
                                                                    {fac.facility_type || 'Holding Area'}
                                                                </span>
                                                                {fac.capacity && <span className="text-gray-500"> ({fac.capacity} cap)</span>}
                                                            </div>
                                                            <div>
                                                                <span className="text-gray-400 font-semibold">GPS: </span>
                                                                <span className="font-mono text-[9px] font-bold text-gray-700">
                                                                    {parseFloat(fac.latitude).toFixed(4)}, {parseFloat(fac.longitude).toFixed(4)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Multi-Personnel Team Assignment (2 to 5 Responders) */}
                            {(targetStatusId === 5 || targetStatusId === 13 || targetStatusId === 6) && (
                                <div className="space-y-3 bg-role-soft/50 p-4 sm:p-5 rounded-3xl border border-role-border/80 shadow-2xs">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-role text-white flex items-center justify-center shadow-2xs">
                                                <Users className="w-3.5 h-3.5" />
                                            </span>
                                            <label className="text-[10px] font-black text-gray-800 uppercase tracking-widest">
                                                Assign Responders (1 or more) <span className="text-red-500">*</span>
                                            </label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                                                statusSelectedStaffIds.length >= 1 && statusSelectedStaffIds.length <= 5
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold'
                                                    : 'bg-amber-50 text-amber-700 border-amber-200'
                                            }`}>
                                                {statusSelectedStaffIds.length} / 5 Selected
                                            </span>
                                            {statusSelectedStaffIds.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setStatusSelectedStaffIds([]);
                                                        setSelectedPersonnelId(null);
                                                    }}
                                                    className="text-[9px] font-bold text-gray-400 hover:text-red-500 underline cursor-pointer"
                                                >
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Recommendation guidance */}
                                    <div className="p-2.5 rounded-2xl bg-white border border-role-muted flex items-center gap-2 text-[10px] text-gray-600">
                                        <Lightbulb className="w-3.5 h-3.5 shrink-0" />
                                        <span>Assign <strong>1 or more responders</strong> (up to 5) to handle physical animal containment and safe transport.</span>
                                    </div>

                                    {/* Search Filter */}
                                    <div className="relative">
                                        <input
                                            type="text"
                                            placeholder="Filter staff by name or email..."
                                            value={statusPersonnelSearch}
                                            onChange={(e) => setStatusPersonnelSearch(e.target.value)}
                                            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:border-role transition-all"
                                        />
                                        <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
                                    </div>

                                    {/* Personnel Selectable Cards List */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                                        {personnel
                                            .filter((p: any) => {
                                                if (!statusPersonnelSearch.trim()) return true;
                                                const q = statusPersonnelSearch.toLowerCase();
                                                const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
                                                const email = (p.email || '').toLowerCase();
                                                return fullName.includes(q) || email.includes(q);
                                            })
                                            .map((p: any) => {
                                                const isSelected = statusSelectedStaffIds.includes(p.user_id);

                                                return (
                                                    <div
                                                        key={p.user_id}
                                                        onClick={() => toggleStatusStaffSelection(p.user_id)}
                                                        className={`p-2.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                                            isSelected
                                                                ? 'bg-white border-role shadow-xs ring-2 ring-role-muted'
                                                                : 'bg-white/90 border-gray-200 hover:border-role-border hover:bg-white'
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <img
                                                                src={getProfilePicture(p.profile_photo_url || p.profile_picture)}
                                                                alt={p.first_name}
                                                                className="w-8 h-8 rounded-xl object-cover border border-gray-200 shrink-0"
                                                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                            />
                                                            <div className="min-w-0">
                                                                <p className="text-xs font-black text-gray-900 truncate leading-tight">
                                                                    {p.first_name} {p.last_name}
                                                                </p>
                                                                <p className="text-[9px] text-gray-400 truncate">
                                                                    {p.email}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-1 shrink-0">
                                                            {isSelected ? (
                                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-role text-white shadow-2xs flex items-center gap-0.5">
                                                                    <Check className="w-2 h-2" /> Selected
                                                                </span>
                                                            ) : (
                                                                <span className="w-5 h-5 rounded-lg border border-gray-300 flex items-center justify-center text-gray-400 text-xs hover:border-role hover:text-role">
                                                                    +
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                </div>
                            )}

                            {/* Animal Condition (Predefined Choices & Custom Field) */}
                            {targetStatusId !== 5 && targetStatusId !== 13 && targetStatusId !== 4 && targetStatusId !== 3 && targetStatusId !== 14 && targetStatusId !== 17 && (
                                <div className="space-y-3 bg-gray-50/70 p-4 rounded-2xl border border-gray-200/80">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
                                            Animal Observed Health / Condition
                                        </label>
                                        {statusCondition && (
                                            <button
                                                type="button"
                                                onClick={() => setStatusCondition('')}
                                                className="text-[9px] font-bold text-gray-400 hover:text-red-500 underline cursor-pointer"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>

                                    {/* Predefined Quick-Select Chips */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {PREDEFINED_CONDITIONS.map((cond) => {
                                            const isSelected = statusCondition.trim().toLowerCase() === cond.toLowerCase();
                                            return (
                                                <button
                                                    key={cond}
                                                    type="button"
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            setStatusCondition('');
                                                        } else {
                                                            setStatusCondition(cond);
                                                        }
                                                    }}
                                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer border ${
                                                        isSelected
                                                            ? 'bg-role text-white border-role shadow-xs'
                                                            : 'bg-white text-gray-700 border-gray-200 hover:border-role-border hover:bg-role-soft/50'
                                                    }`}
                                                >
                                                    {isSelected && <Check className="w-2.5 h-2.5 inline mr-1" />}
                                                    {cond}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* Custom Notes / Input Field */}
                                    <input
                                        type="text"
                                        placeholder="e.g. Healthy, slight limp on left paw, secured safely"
                                        value={statusCondition}
                                        onChange={(e) => setStatusCondition(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-role transition-all"
                                    />
                                </div>
                            )}

                            {/* Remarks */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Operation Remarks & Notes</label>
                                <textarea
                                    rows={3}
                                    placeholder="Enter details on operational activity, team actions, or handover notes..."
                                    value={statusRemarks}
                                    onChange={(e) => setStatusRemarks(e.target.value)}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-role transition-all resize-none"
                                />
                            </div>

                            {/* File Upload for Operational Evidence */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    Upload Mission Photo Evidence (Optional)
                                </label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => {
                                        if (e.target.files) {
                                            setStatusFiles(Array.from(e.target.files));
                                        }
                                    }}
                                    className="w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-role-soft file:text-role hover:file:bg-role-muted cursor-pointer"
                                />
                            </div>
                        </div>

                        <div className="p-6 sm:p-8 border-t border-gray-100 flex items-center justify-end gap-3 bg-gray-50/50">
                            <button
                                type="button"
                                onClick={() => setIsStatusModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-black text-xs uppercase tracking-wider hover:bg-gray-100 transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleInitiateStatusUpdate}
                                disabled={isSubmittingStatus || isStepDone(targetStatusId) || (targetStatusId === 9 && Boolean(existingReportReturn))}
                                className="px-6 py-2.5 bg-role hover:bg-role-hover text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                            >
                                <span>
                                    {targetStatusId === 9 && existingReportReturn
                                        ? 'Handover Already Completed'
                                        : 'Continue to Confirmation'}
                                </span>
                                <ArrowRightCircle className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal before applying status change */}
            {isConfirmModalOpen && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden flex flex-col p-6 sm:p-8 space-y-5 animate-in zoom-in-95 duration-200 border border-gray-100">
                        {/* Header with Icon */}
                        <div className="flex flex-col items-center text-center space-y-3">
                            <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shadow-lg ${
                                (targetStatusId === 9 || targetStatusId === 11)
                                    ? 'bg-emerald-50 text-emerald-600 shadow-emerald-500/10 border-2 border-emerald-200'
                                    : [3, 12, 14, 17].includes(targetStatusId)
                                    ? 'bg-rose-50 text-rose-600 shadow-rose-500/10 border-2 border-rose-200'
                                    : 'bg-role-soft text-role shadow-role/10 border-2 border-role-border'
                            }`}>
                                {(targetStatusId === 9 || targetStatusId === 11) ? (
                                    <CheckCircle2 className="w-8 h-8" />
                                ) : [3, 12, 14, 17].includes(targetStatusId) ? (
                                    <AlertTriangle className="w-8 h-8" />
                                ) : targetStatusId === 6 ? (
                                    <PawPrint className="w-8 h-8" />
                                ) : (targetStatusId === 7 || targetStatusId === 8) ? (
                                    <Hospital className="w-8 h-8" />
                                ) : (
                                    <Rocket className="w-8 h-8" />
                                )}
                            </div>

                            <div className="space-y-1">
                                <span className="inline-block px-3 py-1 rounded-full bg-role-muted text-role text-[10px] font-black uppercase tracking-wider mb-1">
                                    Report #{report?.report_id}
                                </span>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                                    Confirm Stage Update?
                                </h3>
                                <p className="text-xs text-gray-500 font-medium max-w-xs mx-auto">
                                    Are you sure you want to transition this mission to the selected stage?
                                </p>
                            </div>
                        </div>

                        {/* Progression Badge Strip */}
                        <div className="bg-gray-50 p-3.5 rounded-2xl border border-gray-200 flex items-center justify-center gap-3">
                            <div className="text-center">
                                <p className="text-[9px] font-black text-gray-400 uppercase">From</p>
                                <span className="text-xs font-black text-gray-800">
                                    {getReportStatusLabel(report?.status_id)}
                                </span>
                            </div>
                            <ArrowRightCircle className="w-4 h-4 text-role shrink-0" />
                            <div className="text-center">
                                <p className="text-[9px] font-black text-role uppercase">To Next Stage</p>
                                <span className="text-xs font-black text-role-hover">
                                    {statusMap[targetStatusId] || 'New Stage'}
                                </span>
                            </div>
                        </div>

                        {/* Key Action Summary Details */}
                        <div className="space-y-2 text-xs bg-role-soft/40 p-4 rounded-2xl border border-role-muted text-gray-700">
                            {(targetStatusId === 5 || targetStatusId === 13 || targetStatusId === 6) && statusSelectedStaffIds.length > 0 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500 font-semibold">Assigned Responders:</span>
                                    <span className="font-bold text-gray-900">{statusSelectedStaffIds.length} Personnel</span>
                                </div>
                            )}

                            {(targetStatusId === 7 || targetStatusId === 8) && (
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500 font-semibold">Designated Facility:</span>
                                    <span className="font-bold text-gray-900 truncate max-w-[180px]">
                                        {facilities.find(f => f.landmark_id === selectedFacilityId)?.name || 'Central Facility'}
                                    </span>
                                </div>
                            )}

                            {targetStatusId === 9 && (
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500 font-semibold">Returned To:</span>
                                    <span className="font-bold text-gray-900 truncate max-w-[200px]">
                                        {ownerReturn.has_account ? 'StraySafe account (linked)' : `${ownerReturn.owner_name || ''} (no account)`}
                                    </span>
                                </div>
                            )}

                            {statusCondition && (
                                <div className="flex items-center justify-between">
                                    <span className="text-gray-500 font-semibold">Animal Condition:</span>
                                    <span className="font-bold text-gray-900">{statusCondition}</span>
                                </div>
                            )}

                            {statusRemarks && (
                                <div className="pt-1 border-t border-role-muted text-[11px] text-gray-600 italic">
                                    "{statusRemarks}"
                                </div>
                            )}

                            {statusFiles.length > 0 && (
                                <div className="flex items-center justify-between pt-1 border-t border-role-muted text-[11px]">
                                    <span className="text-gray-500">Mission Photos:</span>
                                    <span className="font-bold text-role-hover">{statusFiles.length} file(s) attached</span>
                                </div>
                            )}
                        </div>

                        {/* Notice for Terminal / Outcome Stages */}
                        {targetStatusId === 9 && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 leading-tight">
                                <strong>Notice:</strong> Animal will be returned to owner and operation marked as reunited.
                            </div>
                        )}

                        {targetStatusId === 11 && (
                            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-[11px] text-emerald-900 leading-tight">
                                <strong>Notice:</strong> Marking as Resolved completes the operation and finalizes the incident record.
                            </div>
                        )}

                        {[3, 12, 14, 17].includes(targetStatusId) && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-900 leading-tight">
                                <strong>Warning:</strong> This will close the rescue request as {statusMap[targetStatusId]}.
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center gap-3 pt-1">
                            <button
                                type="button"
                                onClick={() => setIsConfirmModalOpen(false)}
                                disabled={isSubmittingStatus}
                                className="flex-1 py-3 px-4 rounded-xl border border-gray-200 text-gray-700 font-black text-xs uppercase tracking-wider hover:bg-gray-100 transition-all cursor-pointer disabled:opacity-50"
                            >
                                Back & Edit
                            </button>
                            <button
                                type="button"
                                onClick={handleExecuteStatusUpdate}
                                disabled={isSubmittingStatus}
                                className="flex-1 py-3 px-4 bg-role hover:bg-role-hover text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-role/20 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                            >
                                {isSubmittingStatus ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-3.5 h-3.5" />
                                        <span>Yes, Confirm</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Standalone Multi-Personnel Assign Modal (3-5 Responders) */}
            {isAssignModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 sm:p-7 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-xs">
                                    <Users className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">
                                        Assign Field Responder Team
                                    </h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                        Rescue Mission #{rescueRequest?.rescue_id || report?.report_id} • Select 1 or More Responders
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsAssignModalOpen(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-6 sm:p-7 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                            {/* Search Bar */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    Filter Available Barangay Personnel
                                </label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-gray-400">
                                        <Search className="w-3.5 h-3.5" />
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Search by responder name or email..."
                                        value={personnelSearch}
                                        onChange={(e) => setPersonnelSearch(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-role transition-all"
                                    />
                                </div>
                            </div>

                            {/* Personnel Selection List */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                                    <span>Click to Select / Deselect Responders</span>
                                    <span>(Select up to 5 personnel)</span>
                                </label>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                                    {personnel
                                        .filter((p: any) => {
                                            const q = personnelSearch.toLowerCase();
                                            const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
                                            const email = (p.email || '').toLowerCase();
                                            return fullName.includes(q) || email.includes(q);
                                        })
                                        .map((p: any) => {
                                            const isSelected = selectedStaffIds.includes(p.user_id);

                                            return (
                                                <div
                                                    key={p.user_id}
                                                    onClick={() => toggleStaffSelection(p.user_id)}
                                                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center gap-3 select-none ${isSelected ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-100 shadow-xs' : 'bg-gray-50/60 border-gray-100 hover:bg-gray-100/70 hover:border-gray-200'}`}
                                                >
                                                    <div className="relative">
                                                        <div className={`w-10 h-10 rounded-xl ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'} font-black text-xs flex items-center justify-center shadow-2xs overflow-hidden`}>
                                                            {p.profile_picture ? (
                                                                <img src={getProfilePicture(p.profile_picture)} alt={p.first_name} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                            ) : (
                                                                (p.first_name || 'P').charAt(0).toUpperCase()
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-black text-gray-900 uppercase truncate">
                                                            {p.first_name} {p.last_name}
                                                        </p>
                                                        <p className="text-[9px] font-bold text-gray-400 truncate">
                                                            {p.email}
                                                        </p>
                                                        {isSelected && (
                                                            <span className="inline-block mt-0.5 text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-blue-600 text-white shadow-2xs">
                                                                Selected
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className={`w-5 h-5 rounded-lg border flex items-center justify-center text-xs transition-all ${isSelected ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'}`}>
                                                        {isSelected && <Check className="w-3 h-3" />}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            </div>

                            {/* Mission Remarks */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    Mission Briefing / Handover Notes
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="Optional instructions for team (e.g., bring safety leash, trap cage, first aid kit)..."
                                    value={assignRemarks}
                                    onChange={(e) => setAssignRemarks(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-medium text-gray-900 focus:outline-none focus:border-role transition-all resize-none"
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 flex items-center justify-between gap-3 bg-gray-50/50">
                            <button
                                type="button"
                                onClick={() => setSelectedStaffIds([])}
                                className="text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-wider cursor-pointer"
                            >
                                Clear All
                            </button>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsAssignModalOpen(false)}
                                    className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-black text-xs uppercase tracking-wider hover:bg-gray-100 transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleAssignStaff}
                                    disabled={isSubmittingAssign || selectedStaffIds.length === 0}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer flex items-center gap-2"
                                >
                                    <Users className="w-3.5 h-3.5" />
                                    <span>{isSubmittingAssign ? 'Assigning...' : `Confirm Team (${selectedStaffIds.length} Selected)`}</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Endorsement Document Lightbox Modal */}
            {isEndorsementModalOpen && endorsementFileUrl && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">
                                    Official Subdivision Endorsement Document
                                </h3>
                                <p className="text-[10px] font-bold text-role-hover uppercase tracking-widest mt-0.5">
                                    Issued by {leaderName} ({leaderPos})
                                </p>
                            </div>
                            <button
                                onClick={() => setIsEndorsementModalOpen(false)}
                                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-all cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto custom-scrollbar flex items-center justify-center bg-gray-100 min-h-[300px]">
                            {endorsementFileUrl.toLowerCase().endsWith('.pdf') ? (
                                <iframe src={endorsementFileUrl} className="w-full h-[65vh] rounded-2xl border border-gray-200" title="Endorsement PDF" />
                            ) : endorsementFileUrl.toLowerCase().endsWith('.docx') || endorsementFileUrl.toLowerCase().endsWith('.doc') ? (
                                <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl border border-gray-200 shadow-sm max-w-md text-center">
                                    <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
                                        <FileText className="w-10 h-10" />
                                    </div>
                                    <h4 className="text-base font-black text-gray-900 mb-1 uppercase">Microsoft Word Document</h4>
                                    <p className="text-xs text-gray-500 font-medium mb-6">
                                        This endorsement letter is saved as a Word document (.docx). Click the download button below to open or view it.
                                    </p>
                                    <a
                                        href={endorsementFileUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-6 py-3 bg-role hover:bg-role-hover text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        <span>Download Endorsement File</span>
                                    </a>
                                </div>
                            ) : (
                                <img src={endorsementFileUrl} alt="Endorsement Document" className="max-h-[65vh] w-auto object-contain rounded-2xl border border-gray-200 shadow-md" />
                            )}
                        </div>

                        <div className="p-6 border-t border-gray-100 flex items-center justify-between bg-white">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">
                                Endorsement Archive Document
                            </span>
                            <a
                                href={endorsementFileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-6 py-2.5 bg-role hover:bg-role-hover text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span>Open in New Tab / Download</span>
                            </a>
                        </div>
                    </div>
                </div>
            )}

            {/* Gallery Lightbox Modal */}
            {isLightboxOpen && activeImage && (
                <div
                    onClick={() => setIsLightboxOpen(false)}
                    className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
                >
                    <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center">
                        <img
                            src={activeImage.file_url || activeImage.url}
                            alt="Full incident photo"
                            className="max-h-[85vh] w-auto object-contain rounded-3xl shadow-2xl border border-white/10"
                        />
                        <button
                            onClick={() => setIsLightboxOpen(false)}
                            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 text-white font-black flex items-center justify-center transition-all cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            <SuccessModal
                isOpen={showSuccess}
                onClose={() => setShowSuccess(false)}
                message={successMessage}
            />

            {/* Case Chat Drawer */}
            {report && (
                <ReportChatDrawer
                    isOpen={isChatOpen}
                    onClose={() => setIsChatOpen(false)}
                    report={report}
                    currentUser={currentUser ? {
                        user_id: currentUser.user_id,
                        name: currentUser.name || 'Barangay Staff',
                        role_id: currentUser.role_id || 3,
                        profile_picture: currentUser.profile_picture
                    } : null}
                    threadMode="report"
                />
            )}

            {isAddPetModalOpen && report && (
                <AddPetModal
                    isOpen={isAddPetModalOpen}
                    onClose={() => setIsAddPetModalOpen(false)}
                    initialReportData={report}
                    onPetCreated={(createdPet: any) => {
                        if (createdPet?.pet_id) {
                            setReport((prev: any) => prev ? { ...prev, pet_id: createdPet.pet_id, pet_name: createdPet.pet_name || prev.pet_name } : prev);
                        }
                        fetchReportDetails();
                        setSuccessMessage('Animal record added and linked to this report.');
                        setShowSuccess(true);
                        setTimeout(() => setShowSuccess(false), 3000);
                    }}
                />
            )}

            <NoticeModal
                isOpen={approveFirstNotice}
                title="Approve this request first"
                message="This case was escalated by the Subdivision and is waiting for your approval. It cannot be operated on until it is approved."
                hint="Use Approve Request (or Reject) in the Barangay Operations panel. Assigning a team, dispatching and status updates unlock once it is approved."
                buttonLabel="Go to approval"
                onClose={() => {
                    setApproveFirstNotice(false);
                    document.getElementById('sec-actions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
            />

            {/* Approve / Reject rescue request dialog */}
            {quickDecision && (
                <div className="fixed inset-0 z-[10000] bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={quickDecision === 'approve' ? 'Approve rescue request' : 'Reject rescue request'}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in zoom-in-95 duration-150">
                        <div className="flex items-start gap-3">
                            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${quickDecision === 'approve' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                {quickDecision === 'approve' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">
                                    {quickDecision === 'approve' ? 'Approve this rescue request?' : 'Reject this rescue request?'}
                                </h3>
                                <p className="text-xs text-gray-500 mt-1">
                                    {quickDecision === 'approve'
                                        ? 'It will be approved for Barangay response operations and the team can be dispatched.'
                                        : 'The reporter and the subdivision are notified. Please state the reason.'}
                                </p>
                            </div>
                        </div>
                        {quickDecision === 'reject' && (
                            <div className="space-y-1">
                                <label className="block text-xs font-black text-gray-800">
                                    Reason for rejection <span className="text-rose-600">*</span>
                                </label>
                                <textarea
                                    autoFocus
                                    value={rejectReason}
                                    onChange={(e) => setRejectReason(e.target.value)}
                                    rows={3}
                                    maxLength={500}
                                    placeholder="Explain why this request is being rejected (required)"
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium focus:outline-none focus:border-rose-400"
                                />
                                <p className={`text-[11px] font-semibold ${rejectReason.trim().length < 5 ? 'text-rose-600' : 'text-gray-400'}`}>
                                    {rejectReason.trim().length < 5
                                        ? `A reason is required (at least 5 characters) — ${rejectReason.trim().length}/5`
                                        : `${rejectReason.trim().length}/500`}
                                </p>
                            </div>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                            <button type="button" onClick={() => setQuickDecision(null)}
                                className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer">
                                Cancel
                            </button>
                            {quickDecision === 'approve' ? (
                                <button type="button" onClick={confirmQuickApprove}
                                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black cursor-pointer">
                                    Approve request
                                </button>
                            ) : (
                                <button type="button" onClick={confirmQuickReject} disabled={rejectReason.trim().length < 5}
                                    className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black cursor-pointer disabled:opacity-50">
                                    Reject request
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ENLARGED FULLSCREEN MAP MODAL */}
            {isMapExpanded && report && (
                <div className="fixed inset-0 z-[9999] bg-white flex items-stretch justify-stretch p-0 animate-in fade-in duration-200">
                    <div className="bg-white rounded-none w-full h-full flex flex-col p-3 sm:p-5 overflow-hidden">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-3 sm:mb-4 shrink-0 pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-role-muted text-role rounded-2xl">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-black text-gray-900 uppercase tracking-tight">
                                        Incident Geospatial Map View
                                    </h3>
                                    <p className="text-[10px] sm:text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                        Expanded view of Case #{report.report_id} & Barangay Route
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {roadDistance !== null && (
                                    <span className="hidden sm:inline-flex px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-black uppercase tracking-wider border border-emerald-200">
                                        {roadDistance < 1000 ? `${Math.round(roadDistance)}m` : `${(roadDistance / 1000).toFixed(1)}km`} from HQ
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsMapExpanded(false)}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-700 cursor-pointer"
                                    title="Close Map"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Info badge strip */}
                        <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 mb-3 bg-role-soft/60 border border-role-muted rounded-2xl shrink-0 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">GPS Coordinates:</span>
                                <span className="font-mono font-black text-role">
                                    {sightingLat.toFixed(6)}, {sightingLng.toFixed(6)}
                                </span>
                                {report.status_id === 6 ? (
                                    <span className="bg-blue-600 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                                        <PawPrint className="w-2.5 h-2.5" /> Picked Up (In Transit)
                                    </span>
                                ) : (report.status_id !== 6 && (report.facility_id || report.facility)) ? (
                                    <span className="bg-role text-white font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                                        <Building2 className="w-2.5 h-2.5" /> {report.facility?.name || report.landmark}
                                    </span>
                                ) : report.landmark ? (
                                    <span className="bg-role text-white font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                                        <MapPin className="w-2.5 h-2.5" /> {report.landmark}
                                    </span>
                                ) : null}
                            </div>
                            <div className="text-[11px] font-bold text-gray-600 truncate max-w-xs sm:max-w-md flex items-center gap-1">
                                {report.status_id === 6
                                    ? <><PawPrint className="w-3 h-3 shrink-0" /> Animal Picked Up • Origin: {resolvedAddress || report.landmark || 'Incident Location'}</>
                                    : <><Home className="w-3 h-3 shrink-0" /> {resolvedAddress || report.landmark || 'Sighting Location'}</>}
                            </div>
                        </div>

                        {/* Map Area */}
                        <div className="flex-1 rounded-2xl overflow-hidden relative border border-gray-200 min-h-0 shadow-inner">
                            {(() => {
                                const isRelocated = !isResolvedCase && [7, 8].includes(report.status_id) && (!!report.facility_id || report.custody_status === 'Secured in Facility' || report.custody_status === 'In Barangay Facility' || !!report.facility);
                                const initLat = report.initial_latitude ? parseFloat(report.initial_latitude.toString()) : (report.latitude ? parseFloat(report.latitude.toString()) : null);
                                const initLng = report.initial_longitude ? parseFloat(report.initial_longitude.toString()) : (report.longitude ? parseFloat(report.longitude.toString()) : null);
                                const isOptionBSecured = report.custody_status === 'Secured' || report.custody_status === 'In Custody';
                                const hasDifferentInitialSpot = !isOptionBSecured && isRelocated && initLat != null && initLng != null && (Math.abs(initLat - sightingLat) > 0.0001 || Math.abs(initLng - sightingLng) > 0.0001);

                                const hadHoldingHistory = report.history?.some((h: any) => 
                                    [7, 8].includes(h.status_id) || [7, 8].includes(h.report_status_id) || 
                                    (h.notes && (h.notes.toLowerCase().includes('holding facility') || h.notes.toLowerCase().includes('holding pen'))) ||
                                    (h.action && h.action.toLowerCase().includes('holding'))
                                ) || Boolean(report.facility_id) || Boolean(report.facility);
                                const histFacLat = 14.8069;
                                const histFacLng = 121.0039;
                                const histFacName = 'Barangay Holding Pen';

                                const brgyMarkers = isResolvedCase ? [
                                    {
                                        id: 1,
                                        lat: initLat ?? sightingLat,
                                        lng: initLng ?? sightingLng,
                                        title: `1. Reported Incident Location: ${report.initial_landmark || resolvedAddress || report.landmark || 'Incident Location'}`,
                                        category: 'Historical Sighting',
                                        priority: report.priority_level || 'Medium',
                                        color: 'slate',
                                        rawData: { ...report, landmark: report.initial_landmark || report.landmark, is_resolved: true }
                                    },
                                    ...(hadHoldingHistory ? [{
                                        id: -999,
                                        lat: histFacLat,
                                        lng: histFacLng,
                                        title: `2. Holding Pen: ${histFacName}`,
                                        category: 'Historical Holding',
                                        priority: 'Low',
                                        color: 'slate',
                                        rawData: { ...report, landmark: histFacName, is_resolved: true }
                                    }] : []),
                                    {
                                        id: 2,
                                        lat: BRGY_OFFICE_COORDS[0],
                                        lng: BRGY_OFFICE_COORDS[1],
                                        title: 'Barangay San Vicente HQ',
                                        category: 'HQ'
                                    }
                                ] : [
                                    {
                                        id: 1,
                                        lat: sightingLat,
                                        lng: sightingLng,
                                        title: isRelocated 
                                            ? `Secured: ${report.facility?.name || report.landmark}` 
                                            : (report.status_id === 6 
                                                ? `Animal Picked Up: ${resolvedAddress || report.landmark || 'Incident Location'}` 
                                                : (resolvedAddress || report.landmark || 'Sighting Location')),
                                        category: isRelocated ? 'Holding Facility' : (report.animal_type || 'Stray Animal'),
                                        color: report.status_id === 6 ? 'blue' : 'orange',
                                        rawData: report
                                    },
                                    ...(hasDifferentInitialSpot ? [{
                                        id: -999,
                                        lat: initLat!,
                                        lng: initLng!,
                                        title: `Found Location: ${report.initial_landmark || 'Initial Sighting Spot'}`,
                                        category: 'Initial Sighting',
                                        priority: 'Medium',
                                        rawData: { ...report, landmark: report.initial_landmark || 'Initial Sighting Spot' }
                                    }] : []),
                                    {
                                        id: 2,
                                        lat: BRGY_OFFICE_COORDS[0],
                                        lng: BRGY_OFFICE_COORDS[1],
                                        title: 'Barangay San Vicente HQ',
                                        category: 'HQ'
                                    }
                                ];

                                return (
                                    <MapComponent
                                        height="100%"
                                        center={[isResolvedCase && initLat ? initLat : sightingLat, isResolvedCase && initLng ? initLng : sightingLng]}
                                        zoom={16.5}
                                        showHeatmap={false}
                                        showGeofence={true}
                                        showLandmarks={true}
                                        showConnectingLine={false}
                                        hideViewDetailsButton={true}
                                        routing={!isResolvedCase && routeFrom && isValidLatLng(sightingLat, sightingLng) ? {
                                                                start: routeFrom === 'current' && userLocation ? userLocation : BRGY_OFFICE_COORDS,
                                                                end: [sightingLat, sightingLng] as [number, number],
                                                                waypointNames: [routeFrom === 'current' && userLocation ? 'Your Location' : 'Barangay Hall', report.landmark || 'Incident Location'] as [string, string],
                                                                onClose: () => setRouteFrom(null)
                                                            } : undefined}
                                                            onDirectionsClick={!isResolvedCase ? () => setRouteFrom('current') : undefined}
                                                            onDirectionsFromBrgyClick={!isResolvedCase ? () => setRouteFrom('brgy') : undefined}
                                        onRouteCalculated={(dist) => setRoadDistance(dist)}
                                        markers={brgyMarkers}
                                    />
                                );
                            })()}
                        </div>

                        {/* Footer Controls */}
                        <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-gray-100 shrink-0 gap-3">
                            <span className="text-xs text-gray-400 font-medium hidden sm:inline-flex items-center gap-1">
                                <Lightbulb className="w-3.5 h-3.5" /> Tip: Zoom in or pan to inspect surroundings, routes, and registered holding facility landmarks.
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsMapExpanded(false)}
                                className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ml-auto"
                            >
                                Close Map View
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyReportView;
