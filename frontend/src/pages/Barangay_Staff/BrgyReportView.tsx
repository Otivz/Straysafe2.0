import { useState, useEffect } from 'react';
import {
    AlertTriangle, Check, MessageCircle, FileText, Link2, Zap, Search, MapPin,
    User, PawPrint, Home, Flag, Building2, Phone, Mail, Lock, Users, Landmark,
    X, Rocket, Hospital, Settings, ScrollText, Pin, RefreshCw, Shield,
    CheckCircle2, Ban, Ambulance, Heart, Lightbulb, Download, Camera
} from 'lucide-react';
import axios from 'axios';
import { useNavigate, useParams, Link, useSearchParams } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import MapComponent from '../../components/MapComponent';
import AISuggestionPanel from '../../components/AISuggestionPanel';
import AIPotentialMatchesList from '../../components/AIPotentialMatchesList';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import { useReportChatCount } from '../../utils/chatUtils';
import SuccessModal from '../../components/Modals/SuccessModal';
import { api } from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { REPORT_STATUS_MAP, getReportStatusLabel, getReportStatusBadgeStyle } from '../../utils/reportStatus';
import MergeReportModal from '../../components/Modals/MergeReportModal';
import UnmergeReportModal from '../../components/Modals/UnmergeReportModal';
import AIMatchReviewModal from '../../components/Modals/AIMatchReviewModal';

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

const BRGY_OFFICE_COORDS: [number, number] = [14.8069, 121.0039]; // Barangay San Vicente Operations HQ

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

const BrgyReportView = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [report, setReport] = useState<Report | null>(null);
    const [rescueRequest, setRescueRequest] = useState<RescueRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [resolvedAddress, setResolvedAddress] = useState('');
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [personnel, setPersonnel] = useState<any[]>([]);
    const [roadDistance, setRoadDistance] = useState<number | null>(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [successMessage, setSuccessMessage] = useState('Operation completed successfully.');

    // Gallery / Lightbox state
    const [activeMediaIndex, setActiveMediaIndex] = useState(0);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [isEndorsementModalOpen, setIsEndorsementModalOpen] = useState(false);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [isInlineMapExpanded, setIsInlineMapExpanded] = useState(false);

    // Chat Drawer state
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Status Update Modal State (Supports 2-5 Multi-Personnel Team)
    const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
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

    // Duplicate & Merge State
    const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
    const [isUnmergeModalOpen, setIsUnmergeModalOpen] = useState(false);
    const [duplicateMatches, setDuplicateMatches] = useState<any[]>([]);
    const [activeReviewMatch, setActiveReviewMatch] = useState<any | null>(null);

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
        setLoading(true);
        try {
            let loadedReport: Report | null = null;
            let loadedRescue: RescueRequest | null = null;

            // 1. Try loading directly from /reports/:id
            try {
                const reportRes = await axios.get(`http://localhost:8000/reports/${id}`);
                loadedReport = reportRes.data;
            } catch (err) {
                console.warn(`Could not load report by id ${id}, trying rescue-requests:`, err);
            }

            // 2. Fetch rescue request info
            try {
                const rescueRes = await axios.get('http://localhost:8000/rescue-requests/');
                const allRescues: RescueRequest[] = rescueRes.data || [];

                // Match either by report_id or by rescue_id
                const numericId = parseInt(id);
                loadedRescue = allRescues.find(
                    r => r.report_id === numericId || r.rescue_id === numericId || r.report?.report_id === numericId
                ) || null;

                if (!loadedReport && loadedRescue && loadedRescue.report) {
                    loadedReport = loadedRescue.report;
                }
            } catch (rescueErr) {
                console.warn('Could not load rescue requests:', rescueErr);
            }

            if (loadedReport) {
                setReport(loadedReport);
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

                // Fetch duplicate matches for this report
                try {
                    const dupRes = await axios.get(`http://localhost:8000/matches/duplicates/report/${loadedReport.report_id}`);
                    if (dupRes.data && Array.isArray(dupRes.data)) {
                        setDuplicateMatches(dupRes.data.filter((m: any) => {
                            if (m.status !== 'AI_SUGGESTED') return false;
                            const srcStatus = m.source_report?.current_status_id ?? m.source_report?.status_id;
                            const matchStatus = m.matched_report?.current_status_id ?? m.matched_report?.status_id;
                            const srcResolved = (srcStatus !== undefined && RESOLVED_STATUS_IDS.includes(Number(srcStatus))) || Boolean(m.source_report?.duplicate_of_report_id);
                            const matchResolved = (matchStatus !== undefined && RESOLVED_STATUS_IDS.includes(Number(matchStatus))) || Boolean(m.matched_report?.duplicate_of_report_id);
                            return !srcResolved && !matchResolved;
                        }));
                    }
                } catch (dupErr) {
                    console.error('Error fetching duplicate matches:', dupErr);
                }
            } else {
                setReport(null);
            }
        } catch (error) {
            console.error('Error fetching report details:', error);
            setReport(null);
        } finally {
            setLoading(false);
        }
    };

    const handleDismissDuplicate = async (matchId: number) => {
        try {
            await axios.put(`http://localhost:8000/matches/${matchId}/verify`, {
                status: 'NOT_A_MATCH',
                verified_by_user_id: currentUserId,
                verification_notes: 'Staff dismissed duplicate sighting suggestion: Separate animals'
            });
            setDuplicateMatches(prev => prev.filter(m => m.match_id !== matchId));
            if (report) {
                setReport({ ...report, has_duplicate_flag: false, duplicate_match_count: Math.max(0, (report.duplicate_match_count || 1) - 1) });
            }
        } catch (err) {
            console.error('Failed to dismiss duplicate match:', err);
            alert('Could not dismiss duplicate match. Please try again.');
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
            const res = await axios.get(`http://localhost:8000/landmarks?barangay_id=${bId}&is_holding_facility=true&barangay_only=true`);
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

    const handleQuickApprove = async () => {
        if (!report) return;
        if (!canUpdateStatus) {
            alert('Access restricted: Only personnel assigned to this report (or the Barangay Head Officer) have the ability to update its status.');
            return;
        }
        if (!window.confirm('Approve this rescue request for Barangay response operations?')) return;
        setIsSubmittingStatus(true);
        try {
            const rescueId = rescueRequest?.rescue_id;
            if (rescueId) {
                await axios.patch(`http://localhost:8000/rescue-requests/${rescueId}`, {
                    status_id: 13, // Approved
                    barangay_staff_id: currentUserId,
                    remarks: 'Official rescue request approved by Barangay Operations.'
                });
            } else {
                await axios.patch(`http://localhost:8000/reports/${report.report_id}/status`, {
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

    const handleQuickReject = async () => {
        if (!report) return;
        if (!canUpdateStatus) {
            alert('Access restricted: Only personnel assigned to this report (or the Barangay Head Officer) have the ability to update its status.');
            return;
        }
        const reason = window.prompt('Please enter the reason for rejecting this rescue request:');
        if (!reason) return;
        setIsSubmittingStatus(true);
        try {
            const rescueId = rescueRequest?.rescue_id;
            if (rescueId) {
                await axios.patch(`http://localhost:8000/rescue-requests/${rescueId}`, {
                    status_id: 3, // Rejected
                    barangay_staff_id: currentUserId,
                    remarks: `Request rejected by Barangay: ${reason}`
                });
            } else {
                await axios.patch(`http://localhost:8000/reports/${report.report_id}/status`, {
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

    const openStatusModal = (statusId: number) => {
        if (!canUpdateStatus) {
            alert('Access restricted: Only personnel assigned to this report (or the Barangay Head Officer) have the ability to update its status.');
            return;
        }
        if ((statusId === 7 || statusId === 8) && facilities.length === 0) {
            alert('Notice: No holding facility registered for this Barangay. Please register a facility under Landmarks & Facilities first.');
        }
        setTargetStatusId(statusId);
        setStatusRemarks('');
        const currentRep = report || rescueRequest?.report || null;
        const initialCondition = getEffectiveAnimalCondition(currentRep);
        const isConditionApplicable = ![5, 13, 4, 3, 14, 17].includes(statusId);
        setStatusCondition(isConditionApplicable ? (initialCondition !== 'Unknown' ? initialCondition : 'Healthy') : '');
        
        // Pre-select facility if report already has one and is in the active list, or default to first registered facility
        if (currentRep?.facility_id && facilities.some(f => f.landmark_id === currentRep.facility_id)) {
            setSelectedFacilityId(currentRep.facility_id);
        } else if (facilities.length > 0) {
            setSelectedFacilityId(facilities[0].landmark_id);
        } else {
            setSelectedFacilityId(null);
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

    const handleSubmitStatusUpdate = async () => {
        if (!report) return;
        if (!canUpdateStatus) {
            alert('Access restricted: Only personnel assigned to this report (or the Barangay Head Officer) have the ability to update its status.');
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

        setIsSubmittingStatus(true);
        try {
            const friendlyDefaults: Record<number, string> = {
                4: 'Report under active review by Barangay Operations.',
                13: 'Approved by Barangay Operations. Mission in preparation.',
                5: 'Barangay rescue team dispatched to incident location.',
                6: 'Animal secured and picked up by Barangay response team.',
                7: 'Animal securely placed in holding facility under observation.',
                8: 'Animal impounded at facility.',
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
                await axios.patch(`http://localhost:8000/rescue-requests/${rescueId}`, payload);
            } else {
                const reportPayload: any = {
                    status_id: targetStatusId,
                    user_id: currentUserId,
                    remarks: finalRemarks,
                    assigned_staff_id: primaryStaffId,
                    animal_condition: conditionToSubmit
                };
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
                await axios.patch(`http://localhost:8000/reports/${report.report_id}/status`, reportPayload);

                if (statusSelectedStaffIds.length > 0) {
                    try {
                        await axios.post('http://localhost:8000/rescue-requests/assign-team', {
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
                        await axios.post(`http://localhost:8000/reports/${report.report_id}/media`, fd, {
                            headers: { 'Content-Type': 'multipart/form-data' }
                        });
                    } catch (uploadErr) {
                        console.error('Evidence upload error:', uploadErr);
                    }
                }
            }

            setIsStatusModalOpen(false);
            setSuccessMessage(`Status successfully updated to ${statusMap[targetStatusId] || 'New Status'}.`);
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: any) {
            console.error('Failed to update status:', err);
            alert(err.response?.data?.detail || 'Failed to update operation status.');
        } finally {
            setIsSubmittingStatus(false);
        }
    };

    const openAssignModal = () => {
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
            await axios.post('http://localhost:8000/rescue-requests/assign-team', {
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
            alert(err.response?.data?.detail || 'Failed to assign personnel.');
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

    const effectivePriority = report?.ai_suggested_priority || report?.priority_level || 'Medium';

    const rawImages = (report?.media || []).filter(m => {
        const url = (m.file_url || m.url || '').toLowerCase();
        return !url.endsWith('.docx') && !url.endsWith('.doc') && !url.endsWith('.pdf');
    });
    const imagesList = rawImages.filter(m => !m.is_evidence).length > 0 ? rawImages.filter(m => !m.is_evidence) : rawImages;
    const activeImage = imagesList[activeMediaIndex] || imagesList[0] || null;

    const isRelocatedToFacility = report?.status_id !== 6 && !!(report?.facility_id || report?.facility || report?.custody_status === 'Secured in Facility' || report?.custody_status === 'In Barangay Facility' || report?.custody_status === 'In Subdivision Facility');
    const activeFacilityLat = report?.facility?.latitude != null ? parseFloat(report.facility.latitude.toString()) : null;
    const activeFacilityLng = report?.facility?.longitude != null ? parseFloat(report.facility.longitude.toString()) : null;

    const sightingLat = (isRelocatedToFacility && activeFacilityLat != null)
        ? activeFacilityLat
        : (report?.latitude ? parseFloat(report.latitude.toString()) : BRGY_OFFICE_COORDS[0]);
    const sightingLng = (isRelocatedToFacility && activeFacilityLng != null)
        ? activeFacilityLng
        : (report?.longitude ? parseFloat(report.longitude.toString()) : BRGY_OFFICE_COORDS[1]);

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
                                        <span className="px-2 py-0.5 rounded-md bg-orange-100 text-[#F97316] text-[9px] font-black uppercase tracking-wider">
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

                <main className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-8">
                        {loading ? (
                            <div className="py-32 flex flex-col items-center justify-center gap-4">
                                <div className="w-12 h-12 border-4 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
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
                                    className="inline-block mt-6 px-6 py-3 bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md"
                                >
                                    Back to Rescue Requests
                                </Link>
                            </div>
                        ) : (
                            <>
                                {/* Mission Stage Stepper */}
                                <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center justify-between mb-4 relative overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-r from-orange-50/50 to-transparent"></div>
                                    <div className="relative flex w-full items-center justify-between z-10 px-2 sm:px-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-[#F97316] text-white flex items-center justify-center font-black text-sm shadow-md">1</div>
                                            <span className="text-xs font-black text-gray-900 uppercase tracking-wider">Reported</span>
                                        </div>
                                        <div className="flex-1 h-0.5 bg-gray-200 mx-4">
                                            <div className={`h-full ${report.status_id !== 4 ? 'bg-[#F97316]' : 'bg-transparent'} transition-all`}></div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full ${report.status_id !== 4 ? 'bg-[#F97316] text-white shadow-md' : 'bg-gray-100 text-gray-400'} flex items-center justify-center font-black text-sm transition-all`}>2</div>
                                            <span className={`text-xs font-black uppercase tracking-wider ${report.status_id !== 4 ? 'text-gray-900' : 'text-gray-400'} transition-all`}>Verified</span>
                                        </div>
                                        <div className="flex-1 h-0.5 bg-gray-200 mx-4">
                                            <div className={`h-full ${report.status_id === 5 || report.status_id === 6 || report.status_id === 7 || report.status_id === 11 ? 'bg-[#F97316]' : 'bg-transparent'} transition-all`}></div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full ${report.status_id === 5 || report.status_id === 6 || report.status_id === 7 || report.status_id === 11 ? 'bg-[#F97316] text-white shadow-md' : 'bg-gray-100 text-gray-400'} flex items-center justify-center font-black text-sm transition-all`}>3</div>
                                            <span className={`text-xs font-black uppercase tracking-wider ${report.status_id === 5 || report.status_id === 6 || report.status_id === 7 || report.status_id === 11 ? 'text-gray-900' : 'text-gray-400'} transition-all`}>Escalate</span>
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
                                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-50 text-[#F97316] border border-orange-200">
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
                                            className="px-4 py-2 bg-white hover:bg-orange-50 border border-orange-200 text-[#F97316] text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                                            title="Open Case Coordination Chat"
                                        >
                                            <MessageCircle className="w-3.5 h-3.5" />
                                            <span>Case Chat {chatCount > 0 ? `(${chatCount})` : ''}</span>
                                        </button>

                                        {endorsementFileUrl && (
                                            <button
                                                type="button"
                                                onClick={() => setIsEndorsementModalOpen(true)}
                                                className="px-4 py-2 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#F97316] text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-2 shadow-2xs cursor-pointer"
                                            >
                                                <FileText className="w-3.5 h-3.5" />
                                                <span>Endorsement Letter</span>
                                            </button>
                                        )}

                                        {![3, 9, 10, 11, 12, 14, 18].includes(report.status_id) && !report.duplicate_of_report_id && (
                                            <button
                                                type="button"
                                                onClick={() => setIsMergeModalOpen(true)}
                                                className="px-4 py-2 bg-stone-100 hover:bg-stone-200 border border-stone-300 text-stone-800 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                                                title="Mark as duplicate of another active case"
                                            >
                                                <Link2 className="w-3.5 h-3.5" />
                                                <span>Mark Duplicate</span>
                                            </button>
                                        )}

                                        {![3, 9, 10, 11, 12, 14, 18].includes(report.status_id) && !report.duplicate_of_report_id && (
                                            <button
                                                type="button"
                                                onClick={() => openStatusModal(report.status_id === 4 ? 13 : report.status_id === 13 ? 5 : report.status_id === 5 ? 6 : 11)}
                                                className="px-5 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer"
                                            >
                                                <Zap className="w-3.5 h-3.5" />
                                                <span>Update Status</span>
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* AI Suspected Duplicate Stray Sighting Alert Banner */}
                                {!RESOLVED_STATUS_IDS.includes(report.status_id) && !report.duplicate_of_report_id && (duplicateMatches.length > 0 || report.has_duplicate_flag) && (
                                    <div className="p-5 rounded-3xl bg-amber-500/10 border-2 border-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300 mb-4">
                                        <div className="flex items-start sm:items-center gap-3.5">
                                            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                                                <AlertTriangle className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className="text-xs font-black text-amber-900 uppercase tracking-widest">
                                                        Possible Duplicate Sighting Detected
                                                    </h4>
                                                    <span className="px-2.5 py-0.5 bg-amber-200/80 border border-amber-400 text-amber-900 rounded-full text-[10px] font-black uppercase tracking-wider">
                                                        {duplicateMatches.length > 0 ? `${duplicateMatches.length} Similar Stray Report${duplicateMatches.length > 1 ? 's' : ''}` : 'Suspected Duplicate'}
                                                    </span>
                                                    {duplicateMatches[0] && (
                                                        <span className="px-2 py-0.5 bg-amber-100 border border-amber-300 text-amber-800 rounded-md text-[10px] font-black">
                                                            {Math.round(duplicateMatches[0].similarity_score > 1 ? duplicateMatches[0].similarity_score : duplicateMatches[0].similarity_score * 100)}% Match
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-amber-800 font-medium mt-1 leading-relaxed">
                                                    Straysafe AI identified another active report in this area with matching visual features and timeframe. 
                                                    Compare the sightings side-by-side to consolidate duplicate dispatches.
                                                </p>
                                                {duplicateMatches[0]?.matched_report && (
                                                    <p className="text-[11px] text-amber-700 font-bold mt-1">
                                                        Potential duplicate: Case #{duplicateMatches[0].matched_report.report_id} 
                                                        {duplicateMatches[0].matched_report.animal_name ? ` ("${duplicateMatches[0].matched_report.animal_name}")` : ''} 
                                                        {duplicateMatches[0].matched_report.created_at ? ` • Reported ${new Date(duplicateMatches[0].matched_report.created_at).toLocaleDateString()}` : ''}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                                            {duplicateMatches.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setActiveReviewMatch(duplicateMatches[0])}
                                                    className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-600/20 flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <Search className="w-3.5 h-3.5" /> Compare Side-by-Side
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setIsMergeModalOpen(true)}
                                                className="px-3.5 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm cursor-pointer"
                                            >
<Link2 className="w-3.5 h-3.5" /> Merge Case
                                            </button>
                                            {duplicateMatches[0] && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleDismissDuplicate(duplicateMatches[0].match_id)}
                                                    className="px-3 py-2.5 bg-white hover:bg-amber-50 text-amber-900 border border-amber-300 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                                                    title="Dismiss duplicate alert (separate animals)"
                                                >
                                                    <span>Dismiss</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Merged Duplicate Alert Banner */}
                                {(report.status_id === 18 || report.duplicate_of_report_id) && (
                                    <div className="p-5 rounded-3xl bg-stone-100 border-2 border-stone-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
                                        <div className="flex items-start sm:items-center gap-3.5">
                                            <div className="w-11 h-11 rounded-2xl bg-stone-800 text-white flex items-center justify-center shadow-md shadow-stone-800/20 shrink-0">
                                                <Link2 className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-xs font-black text-stone-900 uppercase tracking-widest">
                                                        Merged Duplicate Report
                                                    </h4>
                                                    <span className="px-2 py-0.5 bg-stone-300 text-stone-900 rounded-md text-[9px] font-black uppercase">
                                                        Case #{report.duplicate_of_report_id || 'Active'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-stone-700 font-medium mt-1 leading-relaxed">
                                                    This sighting has been confirmed as the same animal and consolidated into active Case #{report.duplicate_of_report_id}.
                                                    {report.merge_notes && ` Note: "${report.merge_notes}"`}
                                                </p>
                                                {report.merged_by_name && (
                                                    <p className="text-[10px] text-stone-500 font-bold mt-1">
                                                        Merged by: {report.merged_by_name} {report.merged_at ? `• ${new Date(report.merged_at).toLocaleDateString()}` : ''}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
                                            {report.duplicate_of_report_id && (
                                                <Link
                                                    to={`/barangay/reports/${report.duplicate_of_report_id}`}
                                                    className="px-4 py-2 bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                                                >
                                                    <span>View Primary Case #{report.duplicate_of_report_id}</span>
                                                    <span>→</span>
                                                </Link>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => setIsUnmergeModalOpen(true)}
                                                className="px-3.5 py-2 bg-white hover:bg-stone-50 text-stone-700 border border-stone-300 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                                            >
                                                <span>Separate / Unmerge</span>
                                            </button>
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                    {/* LEFT COLUMN: Main Report Dossier */}
                                    <div className="lg:col-span-2 space-y-8">
                                        {/* Incident Media & Photo Section */}
                                        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-5">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Incident Sighting Evidence</h3>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                                        Visual captures submitted by citizen reporter
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
                                                        <div className="absolute top-4 left-4 flex flex-wrap gap-2">
                                                            <span className="px-3 py-1 rounded-xl bg-black/60 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-wider">
                                                                Sighting Photo
                                                            </span>
                                                            {report.ai_animal_type && (
                                                                <span className="px-3 py-1 rounded-xl bg-[#F97316]/90 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-wider">
                                                                    AI: {report.ai_animal_type}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Multi-photo Thumbnail Selector */}
                                                    {imagesList.length > 1 && (
                                                        <div className="flex items-center gap-3 overflow-x-auto pb-2">
                                                            {imagesList.map((img: any, idx: number) => (
                                                                <button
                                                                    key={idx}
                                                                    onClick={() => setActiveMediaIndex(idx)}
                                                                    className={`relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${activeMediaIndex === idx ? 'border-[#F97316] ring-2 ring-orange-200' : 'border-gray-200 opacity-70 hover:opacity-100'}`}
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

                                        {/* Potential AI Matches Section */}
                                        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-5">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">AI Potential Matches</h3>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                                        AI cross-referenced with lost & registered pet database
                                                    </p>
                                                </div>
                                                <button className="px-4 py-2 bg-blue-50 text-blue-600 hover:bg-blue-100 font-black text-[10px] uppercase tracking-wider rounded-xl transition-all shadow-2xs">
                                                    Scan AI Matches
                                                </button>
                                            </div>
                                            <AIPotentialMatchesList reportId={report.report_id} />
                                        </div>

                                        {/* AI Vision & Behavioral Intelligence */}
                                        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-6">
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

                                        {/* Consolidated Sighting Evidence from Merged Duplicate Reports */}
                                        {report.merged_reports && report.merged_reports.length > 0 && (
                                            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-orange-200/80 shadow-xs space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-2xl bg-orange-50 text-[#F97316] border border-orange-200 flex items-center justify-center shrink-0">
                                                            <Link2 className="w-5 h-5" />
                                                        </div>
                                                        <div>
                                                            <h3 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                                                                Consolidated Sighting Evidence ({report.merged_reports.length} Merged {report.merged_reports.length === 1 ? 'Report' : 'Reports'})
                                                            </h3>
                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                                                Photos and sightings from other residents confirmed for this same animal
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                                    {report.merged_reports.map((mr: any) => (
                                                        <div key={mr.report_id} className="p-4 rounded-2xl bg-stone-50/70 border border-stone-200 space-y-3">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-black text-gray-900">
                                                                        Report #{mr.report_id}
                                                                    </span>
                                                                    <span className="px-2 py-0.5 rounded-md bg-stone-200 text-stone-700 text-[9px] font-black uppercase">
                                                                        Merged Duplicate
                                                                    </span>
                                                                </div>
                                                                <Link
                                                                    to={`/barangay/reports/${mr.report_id}`}
                                                                    className="text-[10px] font-black text-[#F97316] hover:underline"
                                                                >
                                                                    View Report Details →
                                                                </Link>
                                                            </div>

                                                            <div className="flex items-center gap-2.5 text-xs text-gray-600">
                                                                <User className="w-3 h-3" />
                                                                <span className="font-bold text-gray-800">{mr.reporter_name}</span>
                                                                {mr.landmark && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span className="truncate inline-flex items-center gap-1"><MapPin className="w-3 h-3" /> {mr.landmark}</span>
                                                                    </>
                                                                )}
                                                            </div>

                                                            {mr.description && (
                                                                <p className="text-xs text-gray-600 italic bg-white p-2.5 rounded-xl border border-stone-100">
                                                                    "{mr.description}"
                                                                </p>
                                                            )}

                                                            {mr.media && mr.media.length > 0 && (
                                                                <div className="flex gap-2 overflow-x-auto py-1">
                                                                    {mr.media.map((m: any) => (
                                                                        <div
                                                                            key={m.media_id}
                                                                            onClick={() => window.open(m.file_url, '_blank')}
                                                                            className="w-20 h-20 rounded-xl overflow-hidden bg-gray-200 shrink-0 border border-stone-200 cursor-pointer hover:scale-105 transition-transform"
                                                                        >
                                                                            <img src={m.file_url} alt="" className="w-full h-full object-cover" />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Incident Specifications & Citizen Reporter (Consolidated) */}
                                        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-6">
                                            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Incident Specifications & Citizen Reporter</h3>

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

                                            {/* Location & Custody Movement History Card */}
                                            {(report.facility_id || report.custody_status === 'Secured in Facility' || report.custody_status === 'In Barangay Facility' || report.facility || custodyProgression.hasMoved) && (
                                                <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-amber-500/10 border-2 border-amber-300/80 shadow-sm space-y-4 animate-in fade-in duration-300">
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
                                                            <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#F97316] flex items-center justify-center shrink-0">
                                                                <Flag className="w-4 h-4" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-[10px] font-black text-[#F97316] uppercase tracking-wider">
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
                                                        <div className="flex items-start gap-3 bg-gradient-to-r from-orange-50/90 to-amber-50/90 p-4 rounded-2xl border-2 border-[#F97316] shadow-xs">
                                                            <div className="w-8 h-8 rounded-xl bg-[#F97316] text-white flex items-center justify-center shrink-0">
                                                                <Building2 className="w-4 h-4" />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-[10px] font-black text-[#F97316] uppercase tracking-wider flex items-center gap-1.5">
                                                                        <span>• {custodyProgression.steps.length > 1 ? 'Transferred To (Current Facility)' : 'Current Facility Holding Location'}</span>
                                                                        <span className="px-1.5 py-0.2 rounded bg-[#F97316] text-white text-[8px] font-bold uppercase">Active</span>
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
                                                                        <span>Hotline: <a href={`tel:${report.facility?.contact_number || report.facility?.caretaker_phone}`} className="text-[#F97316] underline font-black">{report.facility?.contact_number || report.facility?.caretaker_phone}</a></span>
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

                                            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Sighting Location / Street</p>
                                                <p className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                                    <MapPin className="w-4 h-4 text-[#F97316]" />
                                                    <span>{isGeocoding ? 'Resolving address...' : (resolvedAddress || report.landmark || 'Selera Homes')}</span>
                                                </p>
                                            </div>

                                            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-100 space-y-2">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Reporter's Initial Description</p>
                                                <p className="text-xs font-semibold text-gray-700 leading-relaxed">
                                                    "{report.description || 'No additional notes provided by the citizen.'}"
                                                </p>
                                            </div>

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
                                        </div>
                                    </div>

                                    {/* RIGHT COLUMN: Interactive Map & Quick Action Operations Panel */}
                                    <div className="space-y-8">
                                        {/* Assigned Personnel Card (3-5 Person Response Team) */}
                                        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-8 shadow-sm space-y-5">
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
                                                        className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
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
                                                                        <div className="w-12 h-12 rounded-2xl bg-[#F97316] text-white font-black text-sm flex items-center justify-center shadow-xs overflow-hidden">
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
                                                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#F97316] flex items-center justify-center mx-auto shadow-2xs">
                                                        <Users className="w-6 h-6" />
                                                    </div>
                                                    <p className="text-xs font-black text-gray-800 uppercase tracking-wide">No Personnel Currently Assigned</p>
                                                    <p className="text-[11px] font-medium text-gray-500 max-w-md mx-auto">
                                                        Barangay in-charge can dispatch <strong>1 or more responders</strong> (up to 5) to safely contain and secure the animal.
                                                    </p>
                                                    <button
                                                        type="button"
                                                        onClick={openAssignModal}
                                                        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 bg-[#F97316] text-white text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-[#EA580C] transition-all cursor-pointer shadow-md hover:scale-105"
                                                    >
                                                        <span>+</span>
                                                        <span>Assign Responders Now</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {/* Subdivision Escalation & Endorsement Section */}
                                        <div className="bg-gradient-to-br from-orange-50/70 via-amber-50/40 to-white rounded-[2.5rem] border border-orange-200/80 p-8 shadow-sm space-y-6">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-orange-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-[#F97316] text-white flex items-center justify-center shadow-md shadow-orange-500/20">
                                                        <Landmark className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">Subdivision Escalation Endorsement</h4>
                                                        <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mt-0.5">
                                                            Official transfer from HOA Leadership
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="self-start sm:self-auto px-3 py-1 rounded-full bg-orange-100 text-[#F97316] text-[9px] font-black uppercase tracking-wider inline-flex items-center gap-1">
                                                    Official Endorsement <Check className="w-2.5 h-2.5" />
                                                </span>
                                            </div>

                                            {escalationTitle && (
                                                <p className="text-sm font-black text-gray-900 uppercase tracking-wide">
                                                    {escalationTitle}
                                                </p>
                                            )}

                                            <div className="p-5 rounded-2xl bg-white/90 border border-orange-100 shadow-2xs space-y-3">
                                                <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Leader's Statement & Notes:</p>
                                                <p className="text-sm font-bold text-gray-800 leading-relaxed italic">
                                                    "{escalationNote || 'Escalated for immediate Barangay animal control intervention and handling.'}"
                                                </p>
                                            </div>

                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-orange-200 text-orange-800 font-black text-xs flex items-center justify-center border-2 border-white shadow-xs">
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
                                                        className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md shadow-orange-500/20 flex items-center gap-2 cursor-pointer self-start sm:self-auto"
                                                    >
                                                        <FileText className="w-3.5 h-3.5" />
                                                        <span>View Endorsement Document</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Operations Quick Actions Control Panel */}
                                        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-6 sm:p-8 shadow-sm space-y-6">
                                            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                                                <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Barangay Operations</h3>
                                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                                            </div>

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

                                                        {(report.status_id === 13 || report.status_id === 4) && (
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
                                                                    onClick={() => openStatusModal(11)}
                                                                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
                                                                >
                                                                    <Check className="w-3.5 h-3.5" />
                                                                    <span>Mark Incident Resolved</span>
                                                                </button>
                                                            </div>
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={() => openStatusModal(report.status_id)}
                                                            className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                        >
                                                            <Settings className="w-3.5 h-3.5" />
                                                            <span>Update Operation Status</span>
                                                        </button>
                                                    </>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => setIsChatOpen(true)}
                                                    className="w-full py-3 bg-orange-50 hover:bg-orange-100 text-[#F97316] border border-orange-200 font-black text-xs uppercase tracking-wider rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                                                >
                                                    <MessageCircle className="w-3.5 h-3.5" />
                                                    <span>Open Mission Chat Drawer</span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Incident Location Map Card */}
                                        <div className="bg-white rounded-[2.5rem] border border-gray-100 p-6 sm:p-8 shadow-sm space-y-4">
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
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={isInlineMapExpanded ? "M4 8h16M4 16h16" : "M4 6h16M4 12h16M4 18h16"} />
                                                        </svg>
                                                        <span>{isInlineMapExpanded ? "Compact" : "Resize"}</span>
                                                    </button>
                                                    {/* Fullscreen Expand Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsMapExpanded(true)}
                                                        className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#F97316] border border-orange-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all hover:scale-105 active:scale-95 cursor-pointer shadow-xs flex items-center gap-1.5"
                                                        title="Expand Map to Fullscreen Modal"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                                                        </svg>
                                                        <span>Expand Map</span>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className={`w-full ${isInlineMapExpanded ? 'h-[480px]' : 'h-72'} transition-all duration-300 rounded-3xl overflow-hidden border border-gray-200 shadow-inner relative`}>
                                                {/* Floating Expand Map Button inside canvas */}
                                                <div className="absolute top-3 right-3 z-[400]">
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsMapExpanded(true)}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/95 hover:bg-white text-gray-800 text-xs font-black rounded-xl shadow-md border border-gray-200 backdrop-blur-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
                                                        title="Expand Map to Fullscreen Modal"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-[#F97316]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                                                        </svg>
                                                        <span>Expand</span>
                                                    </button>
                                                </div>

                                                {(() => {
                                                    const isRelocated = report.status_id !== 6 && (!!report.facility_id || report.custody_status === 'Secured in Facility' || report.custody_status === 'In Barangay Facility' || !!report.facility || !!(report.initial_latitude && (report.initial_latitude !== report.latitude || report.initial_longitude !== report.longitude)));
                                                    const initLat = report.initial_latitude ? parseFloat(report.initial_latitude.toString()) : null;
                                                    const initLng = report.initial_longitude ? parseFloat(report.initial_longitude.toString()) : null;
                                                    const isOptionBSecured = report.custody_status === 'Secured' || report.custody_status === 'In Custody';
                                                    const hasDifferentInitialSpot = !isOptionBSecured && isRelocated && initLat != null && initLng != null && (Math.abs(initLat - sightingLat) > 0.0001 || Math.abs(initLng - sightingLng) > 0.0001);

                                                    const brgyMarkers = [
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
                                                            center={[sightingLat, sightingLng]}
                                                            zoom={15}
                                                            showHeatmap={false}
                                                            showGeofence={true}
                                                            showLandmarks={true}
                                                            showConnectingLine={false}
                                                            onRouteCalculated={(dist) => setRoadDistance(dist)}
                                                            markers={brgyMarkers}
                                                        />
                                                    );
                                                })()}
                                            </div>

                                            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 space-y-1.5">
                                                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-gray-500">
                                                    <span>GPS Coordinates</span>
                                                    <span className="text-[#F97316]">Active Pin</span>
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

                                        {/* RIGHT COLUMN: Report Activity & Handover Timeline */}
                                        <div className="bg-white border border-gray-100 rounded-[2.5rem] p-6 sm:p-8 shadow-sm space-y-6">
                                            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-orange-50 text-[#F97316] flex items-center justify-center shadow-xs">
                                                        <ScrollText className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide">
                                                            Report Activity & Handover Timeline
                                                        </h4>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                                            Official Audit Trail & Officer Activity Log
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-black text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                                    {(() => {
                                                        const validHistoryCount = report.history 
                                                            ? report.history.filter((h: any) => h.remarks !== 'Initial report submitted by resident.').length 
                                                            : 0;
                                                        const totalEvents = validHistoryCount + 1;
                                                        return `${totalEvents} Event${totalEvents > 1 ? 's' : ''}`;
                                                    })()}
                                                </span>
                                            </div>

                                            <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-gray-100 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                                {/* Initial Report Submission */}
                                                <div className="relative flex items-start gap-4 group">
                                                    <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full bg-blue-500 border-4 border-white shadow-xs flex items-center justify-center text-white">
                                                        <FileText className="w-2.5 h-2.5" />
                                                    </div>
                                                    <div className="flex-1 bg-gray-50/70 hover:bg-gray-50 rounded-2xl p-4 border border-gray-100 transition-all">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                            <span className="text-xs font-black text-gray-900 uppercase tracking-wide">
                                                                Report Submitted by {report.reporter_name || 'Resident'}
                                                            </span>
                                                            <span className="text-[10px] font-bold text-gray-400">
                                                                <RelativeTimestamp date={report.created_at} />
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-600 font-medium mt-1">
                                                            Incident filed for <strong className="text-gray-900 font-bold">{report.animal_type}</strong> ({report.landmark || 'No landmark specified'}).
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* History / Transfer / Status entries */}
                                                {report.history && report.history.filter((h: any) => h.remarks !== 'Initial report submitted by resident.').map((hist: any, index: number) => {
                                                    const remarksLower = (hist.remarks || '').toLowerCase();
                                                    const isFacilityRelocation = (remarksLower.startsWith('transferred to') || remarksLower.startsWith('relocated to') || remarksLower.startsWith('animal relocated') || hist.report_status_id === 8);
                                                    const isTransfer = remarksLower.includes('transfer');
                                                    const isClaim = remarksLower.includes('claim') || hist.report_status_id === 9;
                                                    const isWarning = remarksLower.includes('warning') || remarksLower.includes('notice');
                                                    const isResolved = remarksLower.includes('resolved') || hist.report_status_id === 11 || hist.report_status_id === 12;
                                                    const isVerified = remarksLower.includes('verified') || hist.report_status_id === 2;
                                                    const isFalseAlarm = remarksLower.includes('false alarm') || remarksLower.includes('dismiss') || hist.report_status_id === 14;
                                                    const isEscalated = remarksLower.includes('escalat') || hist.report_status_id === 4;
                                                    const isApproved = remarksLower.includes('approv') || hist.report_status_id === 13;
                                                    const isDispatched = remarksLower.includes('dispatch') || hist.report_status_id === 5;
                                                    const isPickedUp = remarksLower.includes('picked up') || remarksLower.includes('secure') || hist.report_status_id === 6;
                                                    const isHolding = remarksLower.includes('holding') || hist.report_status_id === 7;
                                                    const isImpounded = remarksLower.includes('impound') || hist.report_status_id === 8;
                                                    const isAdopted = remarksLower.includes('adopt') || hist.report_status_id === 10;
                                                    const isRejected = remarksLower.includes('reject') || hist.report_status_id === 3;

                                                    let Icon: typeof Pin = Pin;
                                                    let dotColor = 'bg-orange-500';
                                                    let cardBg = 'bg-gray-50/70';
                                                    let borderColor = 'border-gray-100';

                                                    if (isFacilityRelocation) {
                                                        Icon = PawPrint;
                                                        dotColor = 'bg-amber-600';
                                                        cardBg = 'bg-gradient-to-br from-amber-50/90 to-orange-50/60';
                                                        borderColor = 'border-amber-300';
                                                    } else if (isTransfer) {
                                                        Icon = RefreshCw;
                                                        dotColor = 'bg-purple-500';
                                                        cardBg = 'bg-purple-50/40';
                                                        borderColor = 'border-purple-100';
                                                    } else if (isClaim) {
                                                        Icon = Shield;
                                                        dotColor = 'bg-emerald-500';
                                                        cardBg = 'bg-emerald-50/40';
                                                        borderColor = 'border-emerald-100';
                                                    } else if (isWarning) {
                                                        Icon = AlertTriangle;
                                                        dotColor = 'bg-amber-500';
                                                        cardBg = 'bg-amber-50/40';
                                                        borderColor = 'border-amber-100';
                                                    } else if (isResolved) {
                                                        Icon = CheckCircle2;
                                                        dotColor = 'bg-green-600';
                                                        cardBg = 'bg-green-50/40';
                                                        borderColor = 'border-green-100';
                                                    } else if (isVerified) {
                                                        Icon = Search;
                                                        dotColor = 'bg-blue-500';
                                                        cardBg = 'bg-blue-50/40';
                                                        borderColor = 'border-blue-100';
                                                    } else if (isFalseAlarm || isRejected) {
                                                        Icon = Ban;
                                                        dotColor = 'bg-rose-500';
                                                        cardBg = 'bg-rose-50/40';
                                                        borderColor = 'border-rose-100';
                                                    } else if (isEscalated) {
                                                        Icon = Rocket;
                                                        dotColor = 'bg-orange-600';
                                                        cardBg = 'bg-orange-50/40';
                                                        borderColor = 'border-orange-100';
                                                    } else if (isApproved) {
                                                        Icon = Pin;
                                                        dotColor = 'bg-orange-600';
                                                        cardBg = 'bg-orange-50/40';
                                                        borderColor = 'border-orange-100';
                                                    } else if (isDispatched) {
                                                        Icon = Ambulance;
                                                        dotColor = 'bg-blue-600';
                                                        cardBg = 'bg-blue-50/40';
                                                        borderColor = 'border-blue-100';
                                                    } else if (isPickedUp) {
                                                        Icon = PawPrint;
                                                        dotColor = 'bg-amber-600';
                                                        cardBg = 'bg-amber-50/40';
                                                        borderColor = 'border-amber-100';
                                                    } else if (isHolding || isImpounded) {
                                                        Icon = Hospital;
                                                        dotColor = 'bg-indigo-600';
                                                        cardBg = 'bg-indigo-50/40';
                                                        borderColor = 'border-indigo-100';
                                                    } else if (isAdopted) {
                                                        Icon = Heart;
                                                        dotColor = 'bg-pink-500';
                                                        cardBg = 'bg-pink-50/40';
                                                        borderColor = 'border-pink-100';
                                                    }

                                                    return (
                                                        <div key={hist.history_id || index} className="relative flex items-start gap-4 group animate-in fade-in duration-300">
                                                            <div className={`absolute -left-6 mt-1 w-5 h-5 rounded-full ${dotColor} border-4 border-white shadow-xs flex items-center justify-center text-white`}>
                                                                <Icon className="w-2.5 h-2.5" />
                                                            </div>
                                                            <div className={`flex-1 ${cardBg} hover:bg-gray-50 rounded-2xl p-4 border ${borderColor} transition-all`}>
                                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                                    <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                                                                        <Icon className="w-3.5 h-3.5 shrink-0" />
                                                                        <span>{hist.updater_name || hist.user_name || hist.staff_name || 'Barangay Officer'}</span>
                                                                    </span>
                                                                    <span className="text-[10px] font-bold text-gray-400">
                                                                        <RelativeTimestamp date={hist.created_at || hist.timestamp} />
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-gray-700 font-semibold mt-1.5 leading-relaxed">
                                                                    {hist.remarks || 'Status updated'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </main>
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
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Next Stage</label>
                                <select
                                    value={targetStatusId}
                                    onChange={(e) => {
                                        const nextId = parseInt(e.target.value);
                                        setTargetStatusId(nextId);
                                        if ((nextId === 7 || nextId === 8) && facilities.length === 0) {
                                            alert('Notice: No holding facility registered for this Barangay. Please register a facility in Landmarks & Facilities first.');
                                        }
                                    }}
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 focus:outline-none focus:border-[#F97316] transition-all"
                                >
                                    <option value={13}>Approved (Prepare Team)</option>
                                    <option value={5}>Dispatched (Team in Transit)</option>
                                    <option value={6}>Picked Up (Animal Secured)</option>
                                    <option value={7}>Holding Facility (Observation)</option>
                                    <option value={8}>Impounded</option>
                                    <option value={11}>Resolved (Operation Complete)</option>
                                    <option value={17}>Animal Cannot Be Found</option>
                                    <option value={3}>Rejected</option>
                                    <option value={12}>Resolved (Deceased)</option>
                                    <option value={14}>False Alarm / Dismissed</option>
                                </select>
                            </div>

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
                                                                ? 'bg-white border-[#F97316] shadow-sm ring-2 ring-orange-200'
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
                                                                            ? 'bg-orange-100 text-orange-800'
                                                                            : 'bg-blue-100 text-blue-800'
                                                                    }`}>
                                                                        {isBarangayCentral ? 'Barangay Central Facility' : (fac.subdivision_name ? `Subdivision • ${fac.subdivision_name}` : 'Subdivision Facility')}
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            <div className="shrink-0">
                                                                {isSelected ? (
                                                                    <span className="text-[9px] font-black uppercase px-2 py-1 rounded-lg bg-[#F97316] text-white shadow-2xs flex items-center gap-1">
                                                                        <Check className="w-2.5 h-2.5" /> Selected
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[9px] font-bold text-gray-400 px-2 py-1 rounded-lg border border-gray-200 hover:border-orange-300">
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
                                <div className="space-y-3 bg-orange-50/50 p-4 sm:p-5 rounded-3xl border border-orange-200/80 shadow-2xs">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-full bg-orange-500 text-white flex items-center justify-center shadow-2xs">
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
                                    <div className="p-2.5 rounded-2xl bg-white border border-orange-100 flex items-center gap-2 text-[10px] text-gray-600">
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
                                            className="w-full pl-8 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-800 focus:outline-none focus:border-[#F97316] transition-all"
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
                                                                ? 'bg-white border-[#F97316] shadow-xs ring-2 ring-orange-100'
                                                                : 'bg-white/90 border-gray-200 hover:border-orange-200 hover:bg-white'
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
                                                                <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded-md bg-[#F97316] text-white shadow-2xs flex items-center gap-0.5">
                                                                    <Check className="w-2 h-2" /> Selected
                                                                </span>
                                                            ) : (
                                                                <span className="w-5 h-5 rounded-lg border border-gray-300 flex items-center justify-center text-gray-400 text-xs hover:border-[#F97316] hover:text-[#F97316]">
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
                                                            ? 'bg-[#F97316] text-white border-[#F97316] shadow-xs'
                                                            : 'bg-white text-gray-700 border-gray-200 hover:border-orange-300 hover:bg-orange-50/50'
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
                                        className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:outline-none focus:border-[#F97316] transition-all"
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
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-[#F97316] transition-all resize-none"
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
                                    className="w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100 cursor-pointer"
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
                                onClick={handleSubmitStatusUpdate}
                                disabled={isSubmittingStatus}
                                className="px-6 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md disabled:opacity-50 cursor-pointer"
                            >
                                {isSubmittingStatus ? 'Updating...' : 'Save & Update Status'}
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
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-900 focus:outline-none focus:border-[#F97316] transition-all"
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
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-medium text-gray-900 focus:outline-none focus:border-[#F97316] transition-all resize-none"
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
                                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-widest mt-0.5">
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
                                        className="px-6 py-3 bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2"
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
                                className="px-6 py-2.5 bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2"
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

            {/* Merge Duplicate Report Modal */}
            {report && (
                <MergeReportModal
                    isOpen={isMergeModalOpen}
                    onClose={() => setIsMergeModalOpen(false)}
                    secondaryReport={report}
                    currentUserId={currentUserId}
                    onSuccess={(updated) => {
                        setReport(updated);
                        setSuccessMessage('Report successfully merged into primary active case.');
                        setShowSuccess(true);
                    }}
                />
            )}

            {/* Unmerge Report Modal */}
            {report && (
                <UnmergeReportModal
                    isOpen={isUnmergeModalOpen}
                    onClose={() => setIsUnmergeModalOpen(false)}
                    reportId={report.report_id}
                    primaryReportId={report.duplicate_of_report_id}
                    currentUserId={currentUserId}
                    onSuccess={(updated) => {
                        setReport(updated);
                        setSuccessMessage('Report successfully separated back into an independent active case.');
                        setShowSuccess(true);
                    }}
                />
            )}

            {/* AI Duplicate Match Review Modal */}
            {activeReviewMatch && (
                <AIMatchReviewModal
                    isOpen={!!activeReviewMatch}
                    onClose={() => setActiveReviewMatch(null)}
                    match={activeReviewMatch}
                    isStaff={true}
                    onVerified={(updated) => {
                        setActiveReviewMatch(null);
                        setDuplicateMatches(prev => prev.filter(m => m.match_id !== updated.match_id));
                        if (report) {
                            fetchReportDetails();
                        }
                    }}
                    onMerged={(mergedRep) => {
                        setActiveReviewMatch(null);
                        setReport(mergedRep);
                        setSuccessMessage('Report successfully merged into primary active case.');
                        setShowSuccess(true);
                        fetchReportDetails();
                    }}
                />
            )}

            {/* ENLARGED FULLSCREEN MAP MODAL */}
            {isMapExpanded && report && (
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl w-[98%] sm:w-[95%] h-[95%] sm:h-[92%] flex flex-col p-4 sm:p-6 animate-in zoom-in-95 duration-200 border border-gray-100 overflow-hidden">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-3 sm:mb-4 shrink-0 pb-3 border-b border-gray-100">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-orange-100 text-[#F97316] rounded-2xl">
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
                        <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-3 mb-3 bg-orange-50/60 border border-orange-100 rounded-2xl shrink-0 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400">GPS Coordinates:</span>
                                <span className="font-mono font-black text-[#F97316]">
                                    {sightingLat.toFixed(6)}, {sightingLng.toFixed(6)}
                                </span>
                                {report.status_id === 6 ? (
                                    <span className="bg-blue-600 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                                        <PawPrint className="w-2.5 h-2.5" /> Picked Up (In Transit)
                                    </span>
                                ) : (report.status_id !== 6 && (report.facility_id || report.facility)) ? (
                                    <span className="bg-orange-500 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
                                        <Building2 className="w-2.5 h-2.5" /> {report.facility?.name || report.landmark}
                                    </span>
                                ) : report.landmark ? (
                                    <span className="bg-orange-500 text-white font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase tracking-wider inline-flex items-center gap-1">
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
                                const isRelocated = report.status_id !== 6 && (!!report.facility_id || report.custody_status === 'Secured in Facility' || report.custody_status === 'In Barangay Facility' || !!report.facility || !!(report.initial_latitude && (report.initial_latitude !== report.latitude || report.initial_longitude !== report.longitude)));
                                const initLat = report.initial_latitude ? parseFloat(report.initial_latitude.toString()) : null;
                                const initLng = report.initial_longitude ? parseFloat(report.initial_longitude.toString()) : null;
                                const isOptionBSecured = report.custody_status === 'Secured' || report.custody_status === 'In Custody';
                                const hasDifferentInitialSpot = !isOptionBSecured && isRelocated && initLat != null && initLng != null && (Math.abs(initLat - sightingLat) > 0.0001 || Math.abs(initLng - sightingLng) > 0.0001);

                                const brgyMarkers = [
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
                                        center={[sightingLat, sightingLng]}
                                        zoom={16.5}
                                        showHeatmap={false}
                                        showGeofence={true}
                                        showLandmarks={true}
                                        showConnectingLine={false}
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
