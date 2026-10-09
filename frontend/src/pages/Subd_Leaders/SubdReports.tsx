import { useState, useEffect, useRef } from 'react';
import NoticeModal from '../../components/Modals/NoticeModal';
import axios from 'axios';
import api from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { useNavigate, useSearchParams } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import Button from '../../components/Button';
import SuccessModal from '../../components/Modals/SuccessModal';
import Select from '../../components/Dropdown';
import MapComponent from '../../components/MapComponent';
import DataTable from '../../components/DataTable';
import AISuggestionPanel from '../../components/AISuggestionPanel';

import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import ReportChatBadge from '../../components/Chat/ReportChatBadge';
import TakeoverReportModal from '../../components/Modals/TakeoverReportModal';
import ResolveLostPetModal from '../../components/Modals/ResolveLostPetModal';
import SubdReportModal from '../../components/Modals/SubdReportModal';
import AddPetModal from '../../components/PetRecords/AddPetModal';
import WarningDetailsModal from '../../components/Modals/WarningDetailsModal';
import { getCachedData, setCachedData } from '../../utils/cache';
import { REPORT_STATUS_MAP } from '../../utils/reportStatus';

import { SAN_VICENTE_HQ } from '../../utils/coverageArea';
import ReportDescription from '../../components/ReportDescription';
import { reportDescriptionSummary } from '../../utils/reportDescription';
interface Report {
    report_id: number;
    subdivision_id?: number;
    subdivision_name?: string | null;
    subdivision?: { subdivision_name?: string; [key: string]: any } | null;
    category_id: number;
    status_id: number;
    priority_level: string;
    latitude: number;
    longitude: number;
    landmark: string;
    initial_landmark?: string | null;
    location_address?: string | null;
    animal_count: number;
    animal_type: string;
    animal_color?: string | null;
    breed?: string;
    condition: string;
    behavior_tags?: string;
    description: string;
    visibility: string;
    created_at: string;
    user_id: number;
    reporter_name?: string;
    reporter_photo?: string;
    media?: any[];
    comments?: any[];
    ai_animal_type?: string | null;
    ai_dominant_color?: string | null;
    ai_coat_pattern?: string | null;
    ai_estimated_size?: string | null;
    ai_possible_breed?: string | null;
    ai_suggested_risk_level?: string | null;
    ai_suggested_priority?: string | null;
    ai_suggested_priority_reason?: string | null;
    assigned_leader_id?: number | null;
    assigned_leader_name?: string | null;
    assigned_leader_photo?: string | null;
    claimed_at?: string | null;
    verification_status?: string | null;
    verification_notes?: string | null;
    verified_by_user_id?: number | null;
    verified_by_name?: string | null;
    verified_at?: string | null;
    false_alarm_reason?: string | null;
    verified_actual_bite?: boolean | null;
    verified_chasing?: boolean | null;
    verified_attempted_bite?: boolean | null;
    verified_injury?: boolean | null;
    verified_aggressive?: boolean | null;
    behavior_finding?: string | null;
    is_takeover_eligible?: boolean;
    takeover_locked_until?: string | null;
    takeover_cooldown_remaining_seconds?: number;
    takeover_inactivity_hours_threshold?: number;
    last_activity_at?: string | null;
    duplicate_of_report_id?: number | null;
    has_duplicate_flag?: boolean;
    duplicate_match_count?: number;
    endorsement_letter?: any;
    rescue?: any;
}

const formatCooldownTimer = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
};

const statusMap = REPORT_STATUS_MAP;
const categoryMap: Record<number, string> = {
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
    4: 'Roaming Pack', 5: 'Animal Rescue Needed', 6: 'Lost Pet'
};

const SubdReports = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [reports, setReports] = useState<Report[]>(() => getCachedData<Report[]>('subd_reports_list') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<Report[]>('subd_reports_list'));
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all');
    const [reportQueue, setReportQueue] = useState<'all' | 'unassigned' | 'my_reports'>('my_reports');
    const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
    const [takeoverTarget, setTakeoverTarget] = useState<{ id: number; currentHandlerName: string } | null>(null);
    const [claimingReportId, setClaimingReportId] = useState<number | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [openMenuId, setOpenMenuId] = useState<number | null>(null);
    const [viewingReportId, setViewingReportId] = useState<number | null>(null);
    const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
    // Report id whose Escalate click was stopped because the animal has no record yet (the notice shows only after that click)
    const [escalateBlockedFor, setEscalateBlockedFor] = useState<number | null>(null);
    const [rejectingReportId, setRejectingReportId] = useState<number | null>(null);
    const [rejectReason, setRejectReason] = useState('');
    const [isRejecting, setIsRejecting] = useState(false);
    const [escalatingReportId, setEscalatingReportId] = useState<number | null>(null);
    const [endorsementFile, setEndorsementFile] = useState<File | null>(null);
    const [isEscalating, setIsEscalating] = useState(false);
    const [escalationTitle, setEscalationTitle] = useState('');
    const [escalationDescription, setEscalationDescription] = useState('');
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);
    const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
    const [resolvingReportId, setResolvingReportId] = useState<number | null>(null);
    const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);
    
    // Warning Modal state
    const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
    const [isWarningDetailsModalOpen, setIsWarningDetailsModalOpen] = useState(false);
    const [selectedWarningDetails, setSelectedWarningDetails] = useState<any | null>(null);
    const [warningOwnerId, setWarningOwnerId] = useState<string>('');
    const [warningTier, setWarningTier] = useState('Notice');
    const [warningViolation, setWarningViolation] = useState('Free-Roaming Unleashed');
    const [warningDescription, setWarningDescription] = useState('');
    const [isIssuingWarning, setIsIssuingWarning] = useState(false);
    const [warningEvidence, setWarningEvidence] = useState(true);
    const [selectedWarningReport, setSelectedWarningReport] = useState<Report | null>(null);
    const [priorWarnings, setPriorWarnings] = useState<any[]>([]);
    const [isLoadingPriorWarnings, setIsLoadingPriorWarnings] = useState(false);

    const [noOwnerNotice, setNoOwnerNotice] = useState(false);

    const openIssueWarningModal = async (rep: Report) => {
        let targetUserId = (rep as any).owner_id;
        let targetOwnerName = (rep as any).owner_name;

        if (!targetUserId) {
            if ((rep as any).is_owner_report) {
                targetUserId = rep.user_id;
                targetOwnerName = rep.reporter_name;
            } else {
                setNoOwnerNotice(true);
                return;
            }
        }

        setWarningOwnerId(targetOwnerName || `User #${targetUserId}`);
        setSelectedWarningReport(rep);
        setIsWarningModalOpen(true);
        setIsLoadingPriorWarnings(true);
        try {
            let res;
            if ((rep as any).pet_id) {
                res = await api.get(`/warnings/pet/${(rep as any).pet_id}`);
            } else {
                res = await api.get(`/warnings/user/${targetUserId}`);
            }
            const history = res.data || [];
            setPriorWarnings(history);
            
            // Calculate next tier in progression: Notice -> 1st Warning -> 2nd Warning -> Final Notice / Escalation
            if (history.length === 0) {
                setWarningTier('Notice');
            } else {
                const tierOrder = ['Notice', '1st Warning', '2nd Warning', 'Final Notice / Escalation'];
                const maxIdx = history.reduce((max: number, w: any) => {
                    const idx = tierOrder.indexOf(w.warning_level);
                    return Math.max(max, idx);
                }, -1);

                if (maxIdx === 0) setWarningTier('1st Warning');
                else if (maxIdx === 1) setWarningTier('2nd Warning');
                else if (maxIdx >= 2) setWarningTier('Final Notice / Escalation');
                else {
                    const count = history.length;
                    if (count === 1) setWarningTier('1st Warning');
                    else if (count === 2) setWarningTier('2nd Warning');
                    else setWarningTier('Final Notice / Escalation');
                }
            }
        } catch (err) {
            console.error('Error fetching prior warnings:', err);
            setPriorWarnings([]);
            setWarningTier('Notice');
        } finally {
            setIsLoadingPriorWarnings(false);
        }
    };

    const handleIssueWarning = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedWarningReport) return;
        setIsIssuingWarning(true);
        try {
            let targetUserId = (selectedWarningReport as any).owner_id;
            if (!targetUserId && (selectedWarningReport as any).is_owner_report) {
                targetUserId = selectedWarningReport.user_id;
            }
            if (!targetUserId) {
                throw new Error("Cannot issue warning: The owner of this animal has not been identified.");
            }
            
            const res = await api.post('/warnings/', {
                user_id: targetUserId,
                pet_id: (selectedWarningReport as any).pet_id || null,
                report_id: selectedWarningReport.report_id,
                warning_level: warningTier,
                violation_type: warningViolation,
                description: warningDescription,
                fine_amount: 0.0
            });
            setIsWarningModalOpen(false);
            setWarningDescription('');
            alert('Warning citation successfully issued to resident!');

            // Update local reports list immediately
            setReports(prev => prev.map(r => r.report_id === selectedWarningReport.report_id ? ({
                ...r,
                has_issued_warning: true,
                latest_warning: res.data,
                issued_warnings: [res.data, ...((r as any).issued_warnings || [])]
            }) : r));

            fetchReports();
        } catch (error: any) {
            console.error('Failed to issue warning:', error);
            alert(error.response?.data?.detail || 'Failed to issue warning. Please try again.');
        } finally {
            setIsIssuingWarning(false);
        }
    };

    const menuRef = useRef<HTMLDivElement>(null);

    const [viewReportAddress, setViewReportAddress] = useState('');
    const [isViewReportAddressLoading, setIsViewReportAddressLoading] = useState(false);

    useEffect(() => {
        if (viewingReportId === null) {
            setViewReportAddress('');
            return;
        }

        const report = reports.find(r => r.report_id === viewingReportId);
        if (!report) return;

        const fetchAddress = async () => {
            setIsViewReportAddressLoading(true);
            try {
                const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                    params: {
                        format: 'jsonv2',
                        lat: report.latitude,
                        lon: report.longitude,
                        addressdetails: 1
                    },
                    headers: {
                        'Accept-Language': 'en'
                    }
                });
                if (response.data && response.data.address) {
                    const addr = response.data.address;
                    const parts = [];
                    const road = addr.road || addr.pedestrian || addr.path || '';
                    if (road) parts.push(road);
                    const neighbourhood = addr.neighbourhood || addr.village || addr.suburb || '';
                    if (neighbourhood && neighbourhood !== road) {
                        parts.push(neighbourhood);
                    }
                    const city = addr.city || addr.town || addr.municipality || '';
                    if (city) parts.push(city);

                    const addressStr = parts.join(', ') || response.data.display_name;
                    setViewReportAddress(addressStr);
                } else {
                    setViewReportAddress(`${parseFloat(report.latitude.toString()).toFixed(6)}, ${parseFloat(report.longitude.toString()).toFixed(6)}`);
                }
            } catch (err) {
                console.error('Error reverse geocoding report:', err);
                setViewReportAddress(`${parseFloat(report.latitude.toString()).toFixed(6)}, ${parseFloat(report.longitude.toString()).toFixed(6)}`);
            } finally {
                setIsViewReportAddressLoading(false);
            }
        };

        fetchAddress();
    }, [viewingReportId, reports]);

    const [reportAddresses, setReportAddresses] = useState<Record<number, string>>({});

    useEffect(() => {
        if (!reports || reports.length === 0) return;

        const mapped: Record<number, string> = {};
        for (const r of reports) {
            if (r.location_address && r.location_address.trim()) {
                mapped[r.report_id] = r.location_address.trim();
            } else if (r.landmark && r.landmark.trim() && !r.landmark.toLowerCase().includes('no landmark')) {
                mapped[r.report_id] = r.landmark.trim();
            } else if (r.initial_landmark && r.initial_landmark.trim()) {
                mapped[r.report_id] = r.initial_landmark.trim();
            } else if (r.latitude && r.longitude) {
                const cacheKey = `straysafe_geo_${parseFloat(r.latitude.toString()).toFixed(4)}_${parseFloat(r.longitude.toString()).toFixed(4)}`;
                try {
                    const cached = sessionStorage.getItem(cacheKey);
                    if (cached) mapped[r.report_id] = cached;
                } catch {
                    // Ignore storage errors
                }
            }
        }
        setReportAddresses(prev => ({ ...mapped, ...prev }));
    }, [reports]);

    const getExactLocationText = (rep: Report) => {
        if (reportAddresses[rep.report_id]) {
            return reportAddresses[rep.report_id];
        }
        if (rep.landmark && rep.landmark.trim() && rep.landmark.toLowerCase() !== 'no landmark specified' && rep.landmark.toLowerCase() !== 'no landmark') {
            return `${rep.landmark}`;
        }
        return `${parseFloat(rep.latitude.toString()).toFixed(5)}, ${parseFloat(rep.longitude.toString()).toFixed(5)}`;
    };

    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'brgy' | 'current'>('brgy');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const BRGY_OFFICE: [number, number] = SAN_VICENTE_HQ; // R243+QH Santa Maria, Bulacan

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : 1;

    const [commentInputs, setCommentInputs] = useState<Record<number, string>>({});
    const [replyingTo, setReplyingTo] = useState<Record<number, { commentId: number, userName: string } | null>>({});
    const [expandedComments, setExpandedComments] = useState<Record<number, boolean>>({});

    // Chat Drawer state
    const [isChatOpen, setIsChatOpen] = useState(false);
    const [selectedChatReport, setSelectedChatReport] = useState<Report | null>(null);

    useEffect(() => {
        const statusParam = searchParams.get('status');
        if (statusParam) {
            setStatusFilter(statusParam);
        }
    }, [searchParams]);

    useEffect(() => {
        if (!userStr) {
            navigate('/staff/login');
        } else {
            try {
                if (currentUser.role_id !== 2) {
                    navigate('/staff/login');
                }
            } catch {
                navigate('/staff/login');
            }
        }
    }, [navigate, userStr, currentUser]);

    useEffect(() => {
        if (isNavigating && navSource === 'current') {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        setUserLocation([position.coords.latitude, position.coords.longitude]);
                    },
                    (error) => {
                        console.error("Error getting location:", error);
                        setNavSource('brgy');
                    }
                );
            }
        }
    }, [isNavigating, navSource]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const API_URL = '/reports';

    const fetchReports = async (forceLoading = false) => {
        try {
            if (forceLoading || !getCachedData('subd_reports_list')) {
                setLoading(true);
            }
            const subId = currentUser?.subdivision_id;
            const url = subId ? `${API_URL}/?subdivision_id=${subId}` : `${API_URL}/`;
            const response = await api.get(url);
            // Sort by report_id descending to show new reports at the top
            const sortedData = (response.data || []).sort((a: any, b: any) => b.report_id - a.report_id);
            // Ensure unique reports by ID to prevent doubling
            const uniqueReports = sortedData.filter((report: any, index: number, self: any[]) =>
                index === self.findIndex((t: any) => t.report_id === report.report_id)
            );
            setReports(uniqueReports);
            setCachedData('subd_reports_list', uniqueReports);

            // Mark current reports as viewed so sidebar notification count clears after viewing
            try {
                const viewed = JSON.parse(localStorage.getItem('straysafe_viewed_subd_reports') || '[]');
                const reportIds = uniqueReports.map((r: any) => r.report_id);
                const updatedViewed = Array.from(new Set([...viewed, ...reportIds]));
                localStorage.setItem('straysafe_viewed_subd_reports', JSON.stringify(updatedViewed));
                window.dispatchEvent(new Event('straysafe_reports_viewed'));
            } catch (e) {
                console.warn('Could not mark reports as viewed', e);
            }
        } catch (error) {
            console.error('Error fetching reports:', error);
            if (!getCachedData('subd_reports_list')) {
                setReports([]);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    const handleAddComment = async (reportId: number) => {
        const text = commentInputs[reportId];
        if (!text || !text.trim()) return;

        try {
            const parentId = replyingTo[reportId]?.commentId || null;
            await api.post(`${API_URL}/${reportId}/comments`, {
                comment: text.trim(),
                user_id: currentUserId,
                parent_comment_id: parentId
            });

            setCommentInputs(prev => ({ ...prev, [reportId]: '' }));
            setReplyingTo(prev => ({ ...prev, [reportId]: null }));
            fetchReports(); // Refresh to get the latest comments
        } catch (error) {
            console.error('Error adding comment:', error);
            alert('Failed to post comment.');
        }
    };

    const handleUpdateStatus = async (id: number, newStatusId: number) => {
        try {
            await api.patch(`${API_URL}/${id}/status`, {
                status_id: newStatusId,
                user_id: currentUserId,
                remarks: newStatusId === 2 ? "Incident report has been officially verified by the Subdivision Leader." : undefined
            });
            fetchReports();
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status. Please try again.');
        }
    };

    const handleEscalate = async () => {
        if (!escalatingReportId || !endorsementFile) {
            alert('Please select an endorsement letter file.');
            return;
        }

        try {
            setIsEscalating(true);

            // 1. Upload the letter
            const formData = new FormData();
            formData.append('file', endorsementFile);
            formData.append('is_evidence', 'true'); // Mark as evidence so it does NOT appear in the public feed
            await api.post(`${API_URL}/${escalatingReportId}/media`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            const targetRep = reports.find(r => r.report_id === escalatingReportId);
            const isInjured = Boolean(
                targetRep?.verified_injury ||
                targetRep?.category_id === 1 ||
                (targetRep?.condition && targetRep.condition.toLowerCase().includes('injured'))
            );
            const preservedCondition = targetRep?.condition ? targetRep.condition : (isInjured ? 'Injured' : undefined);

            // 2. Update status to Forwarded (4)
            await api.patch(`${API_URL}/${escalatingReportId}/status`, {
                status_id: 4,
                user_id: currentUserId,
                remarks: "Report forwarded to Barangay Operations for official review and approval.",
                ...(preservedCondition ? { animal_condition: preservedCondition } : {})
            });

            // 3. Create official Rescue Request record
            await api.post('/rescue-requests/', {
                report_id: escalatingReportId,
                leader_id: currentUserId,
                title: escalationTitle,
                description: escalationDescription,
                status_id: 1 // Pending
            });

            setIsEscalateModalOpen(false);
            setEscalatingReportId(null);
            setEndorsementFile(null);
            setEscalationTitle('');
            setEscalationDescription('');
            setShowSuccess(true);
            fetchReports();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error escalating report:', error);
            alert('Failed to escalate report. Please try again.');
        } finally {
            setIsEscalating(false);
        }
    };


    // Reports before escalation that a Subdivision Leader may reject (never deleted; moved to History as Rejected).
    // The leader must have CLAIMED the report first (an unclaimed case cannot be touched).
    const canRejectReport = (r: Report) =>
        [1, 2, 15, 16].includes(r.status_id) && !r.duplicate_of_report_id &&
        r.assigned_leader_id === currentUserId;

    const openRejectModal = (id: number) => {
        setRejectingReportId(id);
        setRejectReason('');
    };

    const handleRejectReport = async () => {
        if (!rejectingReportId) return;
        if (rejectReason.trim().length < 5) {
            alert('Please enter a reason for rejecting this report (at least 5 characters).');
            return;
        }
        setIsRejecting(true);
        try {
            await api.patch(`${API_URL}/${rejectingReportId}/status`, {
                status_id: 3, // Rejected
                user_id: currentUserId,
                remarks: `Report rejected by Subdivision Leader: ${rejectReason.trim()}`
            });
            setRejectingReportId(null);
            setRejectReason('');
            setViewingReportId(null);
            await fetchReports();
        } catch (error: any) {
            console.error('Error rejecting report:', error);
            alert(error.response?.data?.detail || 'Failed to reject the report. Please try again.');
        } finally {
            setIsRejecting(false);
        }
    };

    const handleClaimReport = async (reportId: number, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            setClaimingReportId(reportId);
            await api.post(`/reports/${reportId}/claim`, {
                user_id: currentUserId
            });
            setShowSuccess(true);
            await fetchReports();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error claiming report:', err);
            const msg = err.response?.data?.detail || 'Failed to claim report. Please try again.';
            alert(msg);
            fetchReports();
        } finally {
            setClaimingReportId(null);
        }
    };

    // Helper to identify terminal (closed/resolved/rejected) or merged duplicate reports
    const isTerminalOrMerged = (r: Report) => [11, 12, 3, 9, 10, 14, 18].includes(r.status_id) || Boolean(r.duplicate_of_report_id);

    // Queue counts (excluding resolved/inactive/dismissed/merged)
    const unassignedCount = reports.filter(r => !r.assigned_leader_id && !isTerminalOrMerged(r)).length;
    const myReportsCount = reports.filter(r => r.assigned_leader_id === currentUserId && !isTerminalOrMerged(r)).length;
    const allActiveCount = reports.filter(r => !isTerminalOrMerged(r)).length;

    const filteredReports = reports.filter(rep => {
        const catName = categoryMap[rep.category_id]?.toLowerCase() || '';
        const land = (rep.landmark || '').toLowerCase();
        const exactLoc = getExactLocationText(rep).toLowerCase();
        const reporter = (rep.reporter_name || '').toLowerCase();
        const handlerName = (rep.assigned_leader_name || '').toLowerCase();
        const matchesSearch =
            catName.includes(searchTerm.toLowerCase()) ||
            land.includes(searchTerm.toLowerCase()) ||
            exactLoc.includes(searchTerm.toLowerCase()) ||
            reporter.includes(searchTerm.toLowerCase()) ||
            handlerName.includes(searchTerm.toLowerCase());
        const statName = statusMap[rep.status_id] || '';
        const matchesStatus = statusFilter === 'all' || statName.toLowerCase() === statusFilter.toLowerCase();

        // Queue filter
        let matchesQueue = true;
        if (reportQueue === 'unassigned') {
            matchesQueue = !rep.assigned_leader_id && !isTerminalOrMerged(rep);
        } else if (reportQueue === 'my_reports') {
            matchesQueue = rep.assigned_leader_id === currentUserId;
        }

        // Exclude resolved (11), deceased (12), rejected (3), claimed (9), released (10), false alarm/dismissed (14), and merged (18) reports from active ongoing list
        const isActive = !isTerminalOrMerged(rep);

        return matchesSearch && matchesStatus && matchesQueue && isActive;
    });

    const getPriorityColor = (priority: string) => {
        switch (priority.toLowerCase()) {
            case 'emergency':
            case 'high': return 'bg-red-50 text-red-600 border-red-100';
            case 'regular':
            case 'medium': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'low': return 'bg-blue-50 text-blue-600 border-blue-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const getEffectivePriority = (rep: Report): string => {
        if (!rep) return 'Medium';
        if (rep.ai_suggested_priority && rep.ai_suggested_priority.trim()) {
            const raw = rep.ai_suggested_priority.trim();
            if (raw.toLowerCase().includes('emergency')) return 'Emergency';
            if (raw.toLowerCase().includes('high')) return 'High';
            if (raw.toLowerCase().includes('medium') || raw.toLowerCase().includes('regular')) return 'Medium';
            if (raw.toLowerCase().includes('low')) return 'Low';
            return raw.replace(/priority/i, '').trim();
        }
        if (rep.ai_suggested_risk_level && rep.ai_suggested_risk_level.trim()) {
            const raw = rep.ai_suggested_risk_level.trim();
            if (raw.toLowerCase().includes('high')) return 'High';
            if (raw.toLowerCase().includes('medium')) return 'Medium';
            if (raw.toLowerCase().includes('low')) return 'Low';
        }
        return rep.priority_level || 'Medium';
    };

    const getStatusColor = (status: string) => {
        switch (status.toLowerCase()) {
            case 'reported':
                return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'verified':
                return 'bg-blue-50 text-blue-600 border-blue-100';
            case 'escalated to barangay':
                return 'bg-purple-50 text-purple-600 border-purple-100';
            case 'approved':
                return 'bg-indigo-50 text-indigo-600 border-indigo-100';
            case 'in action':
            case 'ongoing':
            case 'rescue in progress':
                return 'bg-role-soft text-role-hover border-role-muted';
            case 'resolved':
                return 'bg-green-50 text-green-600 border-green-100';
            case 'claimed by owner':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'released':
                return 'bg-teal-50 text-teal-700 border-teal-200';
            default:
                return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <div className="flex-1 flex flex-col overflow-hidden">
                {/* TOP NAVIGATION */}
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Incident Reports</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Monitor and manage reported animal incidents in your subdivision</p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-4 sm:p-8 pb-36 md:pb-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">
                        {viewingReportId === null ? (
                            <>
                                {/* Action Toolbar */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                                    <div className="flex items-center space-x-3 ml-auto">
                                        <Button variant="light" className="flex items-center space-x-2" onClick={() => fetchReports(true)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            <span>Refresh</span>
                                        </Button>
                                        <Button variant="primary" className="flex items-center space-x-2 px-6 !bg-[#F97316] hover:!bg-[#EA580C] !border-[#F97316]" onClick={() => setIsModalOpen(true)}>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                            </svg>
                                            <span>Report Incident</span>
                                        </Button>
                                    </div>
                                </div>

                                {/* Workflow Queues Segmented Tabs (3 Box Columns beside each other) */}
                                <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-4 sm:mb-6">
                                    <button
                                        type="button"
                                        onClick={() => setReportQueue('all')}
                                        className={`p-2.5 sm:p-4 rounded-2xl border transition-all text-center sm:text-left flex flex-col justify-between cursor-pointer min-h-[76px] sm:min-h-[96px] ${
                                            reportQueue === 'all'
                                                ? 'bg-white border-role ring-2 ring-role/20 shadow-xs'
                                                : 'bg-white/80 border-gray-100 hover:bg-white hover:border-gray-200'
                                        }`}
                                    >
                                        <span className="text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wider truncate">All Active</span>
                                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mt-1 sm:mt-2">
                                            <span className="text-xl sm:text-2xl font-black text-gray-900 leading-tight">{allActiveCount}</span>
                                            <span className="text-[9px] sm:text-xs text-gray-400 font-bold mt-0.5 sm:mt-0">Total</span>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setReportQueue('unassigned')}
                                        className={`p-2.5 sm:p-4 rounded-2xl border transition-all text-center sm:text-left flex flex-col justify-between relative overflow-hidden cursor-pointer min-h-[76px] sm:min-h-[96px] ${
                                            reportQueue === 'unassigned'
                                                ? 'bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 shadow-xs'
                                                : 'bg-white border-gray-100 hover:bg-amber-50/50 hover:border-amber-200'
                                        }`}
                                    >
                                        <div className="flex items-center justify-center sm:justify-between w-full">
                                            <span className="text-[9px] sm:text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1 truncate">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0"></span>
                                                <span className="truncate">Unassigned</span>
                                            </span>
                                            {unassignedCount > 0 && (
                                                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-black">
                                                    Claim Now
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mt-1 sm:mt-2">
                                            <span className="text-xl sm:text-2xl font-black text-amber-950 leading-tight">{unassignedCount}</span>
                                            <span className="text-[9px] sm:text-xs text-amber-700 font-bold mt-0.5 sm:mt-0">Unclaimed</span>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setReportQueue('my_reports')}
                                        className={`p-2.5 sm:p-4 rounded-2xl border transition-all text-center sm:text-left flex flex-col justify-between cursor-pointer min-h-[76px] sm:min-h-[96px] ${
                                            reportQueue === 'my_reports'
                                                ? 'bg-emerald-500/10 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                                                : 'bg-white border-gray-100 hover:bg-emerald-50/50 hover:border-emerald-200'
                                        }`}
                                    >
                                        <span className="text-[9px] sm:text-[10px] font-black text-emerald-800 uppercase tracking-wider flex items-center justify-center sm:justify-start gap-1 truncate">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>
                                            <span className="truncate">My Reports</span>
                                        </span>
                                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between mt-1 sm:mt-2">
                                            <span className="text-xl sm:text-2xl font-black text-emerald-950 leading-tight">{myReportsCount}</span>
                                            <span className="text-[9px] sm:text-xs text-emerald-700 font-bold mt-0.5 sm:mt-0">Your Cases</span>
                                        </div>
                                    </button>

                                </div>

                                {/* Search & Filters */}
                                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="relative flex-1 max-w-md">
                                        <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-400">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Search by category, exact location, or landmark..."
                                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-role outline-none transition-all"
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <Select
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                            options={[
                                                { value: 'all', label: 'All Status' },
                                                { value: 'Reported', label: 'Reported' },
                                                { value: 'Verified', label: 'Verified' },
                                                { value: 'Escalated to Barangay', label: 'Escalated' },
                                                { value: 'Approved', label: 'Approved' },
                                                { value: 'Rescue In Progress', label: 'In Progress' }
                                            ]}
                                            className="min-w-[130px] sm:min-w-[145px]"
                                        />

                                        <Select
                                            value={reportQueue}
                                            onChange={(e) => {
                                                setReportQueue(e.target.value as 'all' | 'unassigned' | 'my_reports');
                                            }}
                                            options={[
                                                { value: 'all', label: 'All Cases' },
                                                { value: 'my_reports', label: 'My Cases' },
                                                { value: 'unassigned', label: 'Unassigned' }
                                            ]}
                                            className="min-w-[125px] sm:min-w-[140px]"
                                        />

                                        {/* View Mode Switcher (Desktop Only) */}
                                        <div className="hidden md:flex items-center bg-gray-100 p-1 rounded-xl shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('cards')}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${viewMode === 'cards'
                                                        ? 'bg-white text-role shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                                title="Card View"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                                                </svg>
                                                <span>Cards</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setViewMode('table')}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5 ${viewMode === 'table'
                                                        ? 'bg-white text-role shadow-sm'
                                                        : 'text-gray-500 hover:text-gray-700'
                                                    }`}
                                                title="Table View"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                                </svg>
                                                <span>Table</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {viewMode === 'cards' ? (
                                    loading ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {[1, 2, 3, 4, 5, 6].map((n) => (
                                                <div key={n} className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm animate-pulse space-y-4">
                                                    <div className="flex justify-between items-center">
                                                        <div className="h-4 w-16 bg-gray-200 rounded"></div>
                                                        <div className="h-5 w-20 bg-gray-200 rounded-full"></div>
                                                    </div>
                                                    <div className="h-6 w-3/4 bg-gray-200 rounded"></div>
                                                    <div className="h-4 w-1/2 bg-gray-200 rounded"></div>
                                                    <div className="h-10 w-full bg-gray-100 rounded-xl"></div>
                                                    <div className="pt-4 border-t border-gray-100 flex justify-between">
                                                        <div className="h-4 w-24 bg-gray-200 rounded"></div>
                                                        <div className="h-4 w-16 bg-gray-200 rounded"></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : filteredReports.length === 0 ? (
                                        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
                                            <div className="w-16 h-16 bg-role-soft text-role rounded-full flex items-center justify-center mx-auto mb-4">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-base font-bold text-gray-900">No incident reports found</h3>
                                            <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">There are no reports matching your current search or filter criteria.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {filteredReports.map((rep) => (
                                                <div
                                                    key={rep.report_id}
                                                    onClick={() => navigate(`/subd/reports/${rep.report_id}`)}
                                                    className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 p-6 flex flex-col justify-between cursor-pointer group hover:border-role-border relative"
                                                >
                                                    <div>
                                                        {/* Top Card Header */}
                                                        <div className="flex items-center justify-between gap-2 mb-3">
                                                            <div className="flex items-center space-x-2 flex-wrap">
                                                                <span className="text-xs font-mono font-bold text-gray-400">#{rep.report_id.toString().padStart(4, '0')}</span>
                                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getPriorityColor(getEffectivePriority(rep))}`}>
                                                                    {getEffectivePriority(rep)}
                                                                </span>
                                                                {(rep.status_id === 18 || rep.duplicate_of_report_id) && (
                                                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-stone-100 text-stone-700 border border-stone-300 flex items-center gap-1 shadow-xs" title={`Merged duplicate into Case #${rep.duplicate_of_report_id}`}>
                                                                        <span>🔗</span>
                                                                        <span>Merged</span>
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="flex items-center space-x-2">
                                                                <ReportChatBadge
                                                                    reportId={rep.report_id}
                                                                    currentUserId={currentUserId}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setSelectedChatReport(rep);
                                                                        setIsChatOpen(true);
                                                                    }}
                                                                />

                                                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusColor(statusMap[rep.status_id] || 'Pending')}`}>
                                                                    {statusMap[rep.status_id] || 'Pending'}
                                                                </span>

                                                                <div className="relative" ref={openMenuId === rep.report_id ? menuRef : null}>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setOpenMenuId(openMenuId === rep.report_id ? null : rep.report_id);
                                                                        }}
                                                                        className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                            <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                                                                        </svg>
                                                                    </button>

                                                                    {openMenuId === rep.report_id && (
                                                                        <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    navigate(`/subd/reports/${rep.report_id}`);
                                                                                    setOpenMenuId(null);
                                                                                }}
                                                                                className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                                </svg>
                                                                                View Report
                                                                            </button>
                                                                            {(rep.status_id === 1 || rep.status_id === 2) && (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setResolvingReportId(rep.report_id);
                                                                                        setIsResolveModalOpen(true);
                                                                                        setOpenMenuId(null);
                                                                                    }}
                                                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors"
                                                                                >
                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                                    </svg>
                                                                                    Mark Resolved
                                                                                </button>
                                                                            )}
                                                                            {Boolean((rep as any).has_issued_warning || ((rep as any).issued_warnings && (rep as any).issued_warnings.length > 0)) ? (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setOpenMenuId(null);
                                                                                        setSelectedWarningDetails((rep as any).latest_warning || (rep as any).issued_warnings[0]);
                                                                                        setIsWarningDetailsModalOpen(true);
                                                                                    }}
                                                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
                                                                                >
                                                                                    <span className="h-4 w-4 flex items-center justify-center text-xs font-bold text-amber-600">✓</span>
                                                                                    Warning Issued
                                                                                </button>
                                                                            ) : Boolean((rep as any).owner_id || ((rep as any).is_owner_report && rep.user_id) || (rep as any).owner_name || (rep as any).pet_id) ? (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        setOpenMenuId(null);
                                                                                        openIssueWarningModal(rep);
                                                                                    }}
                                                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-yellow-600 hover:bg-yellow-50 transition-colors"
                                                                                >
                                                                                    <span className="h-4 w-4 flex items-center justify-center text-xs">⚠️</span>
                                                                                    Issue Warning
                                                                                </button>
                                                                            ) : null}
                                                                            {canRejectReport(rep) && (
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    openRejectModal(rep.report_id);
                                                                                    setOpenMenuId(null);
                                                                                }}
                                                                                className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                                                            >
                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                                                </svg>
                                                                                Reject
                                                                            </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Animal Photo Preview */}
                                                        {(() => {
                                                            const rawImages = (rep.media || []).filter((m: any) => {
                                                                const url = (m.file_url || m.url || '').toLowerCase();
                                                                return (
                                                                    m.media_type !== 'Document' &&
                                                                    !url.endsWith('.pdf') &&
                                                                    !url.endsWith('.docx') &&
                                                                    !url.endsWith('.doc')
                                                                );
                                                            });

                                                            const sightingImages = rawImages.filter((m: any) => !m.is_evidence);
                                                            const imagesList = sightingImages.length > 0 ? sightingImages : rawImages;
                                                            const firstMedia = imagesList[0] || null;

                                                            const isVideo = firstMedia?.media_type === 'Video' || firstMedia?.file_url?.toLowerCase().match(/\.(mp4|mov|webm)$/i);
                                                            const mediaCount = imagesList.length;

                                                            if (!firstMedia) {
                                                                return (
                                                                    <div className="w-full h-40 rounded-2xl mb-4 bg-gradient-to-br from-role-soft to-amber-100 flex flex-col items-center justify-center text-role border border-role-muted">
                                                                        <span className="text-3xl mb-1">🐾</span>
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-role-hover">No Photo Uploaded</span>
                                                                    </div>
                                                                );
                                                            }

                                                            return (
                                                                <div className="w-full h-44 rounded-2xl overflow-hidden mb-4 bg-gray-100 border border-gray-100 relative group-hover:shadow-inner transition-all">
                                                                    {isVideo ? (
                                                                        <video src={firstMedia.file_url} className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <img src={firstMedia.file_url} alt="Animal evidence" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                    )}
                                                                    {mediaCount > 1 && (
                                                                        <span className="absolute bottom-2.5 right-2.5 bg-black/60 backdrop-blur-md text-white text-[9px] font-extrabold px-2.5 py-1 rounded-full border border-white/20">
                                                                            +{mediaCount - 1} photos
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}

                                                        {/* Category Title & Info */}
                                                        <div className="flex items-start space-x-3 mb-3">
                                                            <div className="w-9 h-9 rounded-xl bg-role-soft text-role flex items-center justify-center shrink-0 font-black text-base border border-role-muted/60">
                                                                🐾
                                                            </div>
                                                            <div>
                                                                <h3 className="text-base font-bold text-gray-900 group-hover:text-role transition-colors leading-snug">
                                                                    {categoryMap[rep.category_id] || 'Other Incident'}
                                                                </h3>
                                                                <p className="text-xs text-gray-500 font-medium mt-0.5">
                                                                    {rep.animal_type || 'Animal'} • {rep.animal_count || 1} count • <span className="font-semibold text-gray-700">{rep.condition || 'Healthy'}</span>
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {/* Location Badge */}
                                                        <div className="flex items-center space-x-1.5 text-gray-600 bg-gray-50/80 p-2.5 rounded-xl border border-gray-100 mb-3 text-xs">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-role shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            </svg>
                                                            <span className="truncate font-semibold text-gray-800" title={getExactLocationText(rep)}>
                                                                {getExactLocationText(rep)}
                                                            </span>
                                                        </div>

                                                        {/* Description Preview */}
                                                        {rep.description && (
                                                            <p className="text-xs text-gray-600 line-clamp-2 mb-3 leading-relaxed bg-gray-50/50 p-2 rounded-lg italic">
                                                                "{reportDescriptionSummary(rep.description)}"
                                                            </p>
                                                        )}

                                                        {/* Active Rescue Badge */}
                                                        {rep.status_id >= 5 && (
                                                            <div className="inline-flex items-center space-x-2 bg-blue-50 border border-blue-100 px-3 py-1 rounded-lg text-xs text-blue-700 font-semibold mb-3">
                                                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                                                <span>Rescue: {statusMap[rep.status_id]}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Card Footer - Reporter & Timestamp */}
                                                    <div className="pt-3.5 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 mb-3">
                                                        <div className="flex items-center space-x-2">
                                                            <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0">
                                                                {rep.reporter_photo ? (
                                                                    <img src={getProfilePicture(rep.reporter_photo)} alt={rep.reporter_name || 'Reporter'} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                                ) : (
                                                                    <span className="text-[10px] text-gray-500 font-bold">{(rep.reporter_name || 'U').charAt(0).toUpperCase()}</span>
                                                                )}
                                                            </div>
                                                            <span className="font-medium text-gray-700 truncate max-w-[110px]">
                                                                {rep.reporter_name || `User ${rep.user_id}`}
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center space-x-2.5">
                                                            <span className="text-[11px] text-gray-400">
                                                                <RelativeTimestamp date={rep.created_at} />
                                                            </span>
                                                            <span className="text-role font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                                                                Details
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                </svg>
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Handler Ownership Footer */}
                                                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                                                        {(rep.status_id === 18 || rep.duplicate_of_report_id) ? (
                                                            <div className="flex items-center justify-between w-full">
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-stone-100 text-stone-700 text-[11px] font-bold border border-stone-200">
                                                                    🔗 Merged into #{rep.duplicate_of_report_id || 'Active'}
                                                                </span>
                                                                <span className="text-[10px] text-gray-400 font-bold">
                                                                    Claim Linked
                                                                </span>
                                                            </div>
                                                        ) : !rep.assigned_leader_id ? (
                                                            <div className="flex items-center justify-between w-full">
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-amber-50 text-amber-800 text-[11px] font-black border border-amber-200/60">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping"></span>
                                                                    Unassigned
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => handleClaimReport(rep.report_id, e)}
                                                                    disabled={claimingReportId === rep.report_id}
                                                                    className="px-3 py-1.5 rounded-xl bg-role hover:bg-role-hover text-white text-xs font-black shadow-xs transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                                                >
                                                                    {claimingReportId === rep.report_id ? (
                                                                        <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                                                                    ) : (
                                                                        <span>🛡️ Claim Report</span>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        ) : rep.assigned_leader_id === currentUserId ? (
                                                            <div className="flex items-center justify-between w-full">
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 text-[11px] font-black border border-emerald-200/60">
                                                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                                    Handled by You
                                                                </span>
                                                                <span className="text-[10px] text-gray-400 font-bold">
                                                                    {rep.claimed_at ? <RelativeTimestamp date={rep.claimed_at} /> : 'Active'}
                                                                </span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex items-center justify-between w-full gap-2">
                                                                <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                                                                    <span className="text-xs">👤</span>
                                                                    <span className="text-xs font-black text-gray-700 truncate max-w-[110px]" title={rep.assigned_leader_name || ''}>
                                                                        {rep.assigned_leader_name || `Officer #${rep.assigned_leader_id}`}
                                                                    </span>
                                                                </div>
                                                                {rep.is_takeover_eligible ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setTakeoverTarget({
                                                                                id: rep.report_id,
                                                                                currentHandlerName: rep.assigned_leader_name || `Officer #${rep.assigned_leader_id}`
                                                                            });
                                                                        }}
                                                                        className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-black shadow-xs transition-all cursor-pointer shrink-0 animate-in zoom-in-95 hover:scale-105"
                                                                        title="This case is stalled with no updates. Click to take over."
                                                                    >
                                                                        🔄 Take Over
                                                                    </button>
                                                                ) : (
                                                                    <span
                                                                        className="px-2 py-0.5 rounded-lg bg-gray-100 text-gray-400 text-[10px] font-bold border border-gray-200 shrink-0 cursor-not-allowed"
                                                                        title={`Locked during handler's response window (${formatCooldownTimer(rep.takeover_cooldown_remaining_seconds)} remaining)`}
                                                                    >
                                                                        🔒 {formatCooldownTimer(rep.takeover_cooldown_remaining_seconds)}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                ) : (
                                    <DataTable
                                        loading={loading}
                                        data={filteredReports}
                                        emptyMessage="No incident reports found."
                                        loadingMessage="Synchronizing reports..."
                                        onRowClick={(rep) => navigate(`/subd/reports/${rep.report_id}`)}
                                        columns={[
                                            {
                                                header: "ID",
                                                key: "report_id",
                                                render: (rep) => (
                                                    <span className="text-xs font-mono text-gray-400">#{rep.report_id.toString().padStart(4, '0')}</span>
                                                )
                                            },
                                            {
                                                header: "Photo",
                                                key: "photo",
                                                render: (rep) => {
                                                    const firstMedia = rep.media?.find((m: any) =>
                                                        m.media_type !== 'Document' &&
                                                        !m.file_url?.toLowerCase().endsWith('.pdf') &&
                                                        !m.file_url?.toLowerCase().endsWith('.docx') &&
                                                        !m.file_url?.toLowerCase().endsWith('.doc')
                                                    );
                                                    return firstMedia ? (
                                                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-100 border border-gray-100 shrink-0">
                                                            {firstMedia.media_type === 'Video' || firstMedia.file_url?.toLowerCase().match(/\.(mp4|mov|webm)$/i) ? (
                                                                <video src={firstMedia.file_url} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <img src={firstMedia.file_url} alt="Animal" className="w-full h-full object-cover" />
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div className="w-10 h-10 rounded-xl bg-role-soft text-role flex items-center justify-center font-bold text-xs border border-role-muted shrink-0">
                                                            🐾
                                                        </div>
                                                    );
                                                }
                                            },
                                            {
                                                header: "Category",
                                                key: "category",
                                                render: (rep) => (
                                                    <div className="flex items-center space-x-2">
                                                        <span className="w-2 h-2 rounded-full bg-role"></span>
                                                        <span className="text-sm font-bold text-gray-900">{categoryMap[rep.category_id] || 'Other'}</span>
                                                    </div>
                                                )
                                            },
                                            {
                                                header: "Priority",
                                                key: "priority",
                                                render: (rep) => (
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getPriorityColor(getEffectivePriority(rep))}`}>
                                                        {getEffectivePriority(rep)}
                                                    </span>
                                                )
                                            },
                                            {
                                                header: "Exact Location",
                                                key: "location",
                                                render: (rep) => (
                                                    <div className="flex items-center space-x-1.5 text-gray-700 font-medium">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-role shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                        <span className="text-xs truncate max-w-[220px]" title={getExactLocationText(rep)}>{getExactLocationText(rep)}</span>
                                                    </div>
                                                )
                                            },
                                            {
                                                header: "Rescue Status",
                                                key: "rescue_status",
                                                render: (rep) => (
                                                    <div className="flex items-center space-x-2">
                                                        {rep.status_id >= 5 ? (
                                                            <>
                                                                <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                                                                <span className="text-xs font-bold text-blue-700">{statusMap[rep.status_id]}</span>
                                                            </>
                                                        ) : (
                                                            <span className="text-xs text-gray-400 italic">Not started</span>
                                                        )}
                                                    </div>
                                                )
                                            },
                                            {
                                                header: "Status",
                                                key: "status",
                                                render: (rep) => {
                                                    return (
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <ReportChatBadge
                                                                reportId={rep.report_id}
                                                                currentUserId={currentUserId}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedChatReport(rep);
                                                                    setIsChatOpen(true);
                                                                }}
                                                            />
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-bold border ${getStatusColor(statusMap[rep.status_id] || 'Pending')}`}>
                                                                {statusMap[rep.status_id] || 'Pending'}
                                                            </span>
                                                            {(rep.status_id === 18 || rep.duplicate_of_report_id) && (
                                                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-stone-100 text-stone-700 border border-stone-300" title={`Merged duplicate into Case #${rep.duplicate_of_report_id}`}>
                                                                    🔗 Merged
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                            },
                                            {
                                                header: "Handler",
                                                key: "handler",
                                                render: (rep) => {
                                                    if (!rep.assigned_leader_id) {
                                                        if (rep.status_id === 18 || rep.duplicate_of_report_id || [3, 9, 10, 11, 12, 14, 18].includes(rep.status_id)) {
                                                            return (
                                                                <span className="text-xs text-gray-400 font-bold italic">
                                                                    {rep.status_id === 18 || rep.duplicate_of_report_id ? 'Merged' : 'Closed'}
                                                                </span>
                                                            );
                                                        }
                                                        return (
                                                            <button
                                                                type="button"
                                                                onClick={(e) => handleClaimReport(rep.report_id, e)}
                                                                disabled={claimingReportId === rep.report_id}
                                                                className="px-2.5 py-1 rounded-xl bg-role hover:bg-role-hover text-white text-[11px] font-black shadow-2xs transition-all flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                                            >
                                                                {claimingReportId === rep.report_id ? (
                                                                    <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                                                                ) : (
                                                                    <span>🛡️ Claim</span>
                                                                )}
                                                            </button>
                                                        );
                                                    }
                                                    if (rep.assigned_leader_id === currentUserId) {
                                                        return (
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 text-emerald-800 text-[11px] font-black border border-emerald-200/60">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                                You
                                                            </span>
                                                        );
                                                    }
                                                    return (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-xs font-bold text-gray-700 truncate max-w-[85px]" title={rep.assigned_leader_name || ''}>
                                                                {rep.assigned_leader_name || `Officer #${rep.assigned_leader_id}`}
                                                            </span>
                                                            {rep.is_takeover_eligible ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setTakeoverTarget({
                                                                            id: rep.report_id,
                                                                            currentHandlerName: rep.assigned_leader_name || `Officer #${rep.assigned_leader_id}`
                                                                        });
                                                                    }}
                                                                    className="px-2 py-0.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 text-[10px] font-black border border-amber-300 transition-all cursor-pointer hover:scale-105"
                                                                    title="Case is stalled. Click to take over."
                                                                >
                                                                    🔄 Take Over
                                                                </button>
                                                            ) : (
                                                                <span
                                                                    className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-400 text-[9px] font-bold border border-gray-200 cursor-not-allowed"
                                                                    title={`Takeover locked (${formatCooldownTimer(rep.takeover_cooldown_remaining_seconds)} remaining)`}
                                                                >
                                                                    🔒 {formatCooldownTimer(rep.takeover_cooldown_remaining_seconds)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                            },
                                            {
                                                header: "Submitted By",
                                                key: "reporter",
                                                render: (rep) => (
                                                    <div className="flex items-center space-x-2">
                                                        <div className="w-6 h-6 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center border border-gray-200 shrink-0">
                                                            {rep.reporter_photo ? (
                                                                <img src={getProfilePicture(rep.reporter_photo)} alt={rep.reporter_name || 'Reporter'} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                            ) : (
                                                                <span className="text-[10px] text-gray-500 font-bold">{(rep.reporter_name || 'U').charAt(0).toUpperCase()}</span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs font-semibold text-gray-700">{rep.reporter_name || `User ${rep.user_id}`}</span>
                                                    </div>
                                                )
                                            },
                                            {
                                                header: "Action",
                                                key: "action",
                                                className: "text-right",
                                                render: (rep) => (
                                                    <div className="relative inline-block text-left" ref={openMenuId === rep.report_id ? menuRef : null}>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOpenMenuId(openMenuId === rep.report_id ? null : rep.report_id);
                                                            }}
                                                            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg transition-colors"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z" />
                                                            </svg>
                                                        </button>

                                                        {openMenuId === rep.report_id && (
                                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        navigate(`/subd/reports/${rep.report_id}`);
                                                                        setOpenMenuId(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                    </svg>
                                                                    View Report
                                                                </button>
                                                                {(rep.status_id === 1 || rep.status_id === 2) && (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setResolvingReportId(rep.report_id);
                                                                            setIsResolveModalOpen(true);
                                                                            setOpenMenuId(null);
                                                                        }}
                                                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 transition-colors"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                        Mark Resolved
                                                                    </button>
                                                                )}
                                                                {Boolean((rep as any).has_issued_warning || ((rep as any).issued_warnings && (rep as any).issued_warnings.length > 0)) ? (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setOpenMenuId(null);
                                                                            setSelectedWarningDetails((rep as any).latest_warning || (rep as any).issued_warnings[0]);
                                                                            setIsWarningDetailsModalOpen(true);
                                                                        }}
                                                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors"
                                                                    >
                                                                        <span className="h-4 w-4 flex items-center justify-center text-xs font-bold text-amber-600">✓</span>
                                                                        Warning Issued
                                                                    </button>
                                                                ) : Boolean((rep as any).owner_id || ((rep as any).is_owner_report && rep.user_id) || (rep as any).owner_name || (rep as any).pet_id) ? (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setOpenMenuId(null);
                                                                            openIssueWarningModal(rep);
                                                                        }}
                                                                        className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-yellow-600 hover:bg-yellow-50 transition-colors"
                                                                    >
                                                                        <span className="h-4 w-4 flex items-center justify-center text-xs">⚠️</span>
                                                                        Issue Warning
                                                                    </button>
                                                                ) : null}
                                                                {canRejectReport(rep) && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        openRejectModal(rep.report_id);
                                                                        setOpenMenuId(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                                    </svg>
                                                                    Reject
                                                                </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            }
                                        ]}
                                    />
                                )}
                            </>
                        ) : (
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col animate-in fade-in duration-200">
                                {(() => {
                                    const viewReport = reports.find(r => r.report_id === viewingReportId);
                                    if (!viewReport) return null;
                                    return (
                                        <>
                                            {/* Header Info */}
                                            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 shrink-0">
                                                <div>
                                                    <button
                                                        onClick={() => setViewingReportId(null)}
                                                        className="flex items-center gap-2 text-[10px] font-black text-role uppercase tracking-widest hover:text-role-hover transition-colors mb-2.5 w-fit"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                                        </svg>
                                                        Back to Reports
                                                    </button>
                                                    <h3 className="text-xl font-bold text-gray-900">Incident Report Details</h3>
                                                    <p className="text-xs text-gray-500 mt-1">Full view of the resident's report</p>
                                                </div>
                                                <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${getStatusColor(statusMap[viewReport.status_id] || 'Pending')}`}>
                                                    {statusMap[viewReport.status_id] || 'Pending'}
                                                </span>
                                            </div>

                                            {/* Details Body */}
                                            <div className="p-8 space-y-8">
                                                <div className="flex items-start justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200 shadow-xs shrink-0 bg-gray-100 flex items-center justify-center">
                                                            {viewReport.reporter_photo ? (
                                                                <img src={getProfilePicture(viewReport.reporter_photo)} alt={viewReport.reporter_name || 'Reporter'} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center text-lg text-gray-500 font-bold bg-role-soft text-role">
                                                                    {(viewReport.reporter_name || 'U').charAt(0).toUpperCase()}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h4 className="text-sm font-bold text-gray-900">{viewReport.reporter_name || `User ${viewReport.user_id}`}</h4>
                                                            <p className="text-xs text-gray-500"><RelativeTimestamp date={viewReport.created_at} /></p>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* Details Grid */}
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                                    <div>
                                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Category</span>
                                                        <span className="text-sm font-semibold text-gray-900">{categoryMap[viewReport.category_id] || 'Other'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Priority</span>
                                                        <span className={`text-sm font-bold ${getPriorityColor(getEffectivePriority(viewReport)).replace('bg-', 'text-').replace('-50', '-600')}`}>
                                                            {getEffectivePriority(viewReport)}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rescue Status</span>
                                                        <span className={`text-sm font-bold ${viewReport.status_id >= 5 ? 'text-blue-600' : 'text-gray-400'}`}>
                                                            {viewReport.status_id >= 5 ? statusMap[viewReport.status_id] : 'Not Yet Initiated'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Animals</span>
                                                        <span className="text-sm font-semibold text-gray-900">{viewReport.animal_count} observed</span>
                                                    </div>
                                                    <div>
                                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Landmark</span>
                                                        <span className="text-sm font-semibold text-gray-900">{viewReport.landmark || 'N/A'}</span>
                                                    </div>
                                                    <div className="col-span-2 md:col-span-4">
                                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Street / Location</span>
                                                        <span className="text-sm font-semibold text-role">
                                                            {isViewReportAddressLoading ? (
                                                                <span className="flex items-center gap-1.5">
                                                                    <svg className="animate-spin h-3.5 w-3.5 text-role" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                    </svg>
                                                                    Resolving street address...
                                                                </span>
                                                            ) : (
                                                                viewReportAddress || `${parseFloat(viewReport.latitude.toString()).toFixed(6)}, ${parseFloat(viewReport.longitude.toString()).toFixed(6)}`
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* AI Suggestion Panel */}
                                                <AISuggestionPanel
                                                    aiReport={viewReport}
                                                    animalType={viewReport.ai_animal_type || viewReport.animal_type}
                                                    dominantColor={viewReport.ai_dominant_color || (viewReport as any).animal_color}
                                                    coatPattern={viewReport.ai_coat_pattern}
                                                    estimatedSize={viewReport.ai_estimated_size || (viewReport as any).estimated_size}
                                                    suggestedRiskLevel={viewReport.ai_suggested_risk_level}
                                                    suggestedPriority={viewReport.ai_suggested_priority}
                                                    possibleBreed={(viewReport as any).animal_breed || (viewReport as any).breed || viewReport.ai_possible_breed}
                                                    description={viewReport.description}
                                                    categoryName={categoryMap[viewReport.category_id]}
                                                    suggestedPriorityReason={viewReport.ai_suggested_priority_reason}
                                                    behaviorChasing={(viewReport as any).ai_behavior_chasing}
                                                    behaviorActualBite={(viewReport as any).ai_behavior_actual_bite}
                                                    behaviorAttemptedBite={(viewReport as any).ai_behavior_attempted_bite}
                                                    behaviorInjury={(viewReport as any).ai_behavior_injury}
                                                    behaviorAggressive={(viewReport as any).ai_behavior_aggressive}
                                                    behaviorExplanation={(viewReport as any).ai_behavior_explanation}
                                                    aiPhotoLikelihood={(viewReport as any).ai_photo_likelihood}
                                                    aiPhotoStatus={(viewReport as any).ai_photo_status}
                                                    aiPhotoRecommendation={(viewReport as any).ai_photo_recommendation}
                                                    aiPhotoDetails={(viewReport as any).ai_photo_details}
                                                    verificationStatus={viewReport.verification_status}
                                                    verifiedActualBite={(viewReport as any).verified_actual_bite}
                                                    verifiedChasing={(viewReport as any).verified_chasing}
                                                    verifiedAttemptedBite={(viewReport as any).verified_attempted_bite}
                                                    verifiedInjury={(viewReport as any).verified_injury}
                                                    verifiedAggressive={(viewReport as any).verified_aggressive}
                                                    behaviorFinding={(viewReport as any).behavior_finding}
                                                    verificationNotes={viewReport.verification_notes}
                                                    verifiedByName={viewReport.verified_by_name}
                                                    verifiedAt={viewReport.verified_at ? String(viewReport.verified_at) : null}
                                                />

                                                {/* Map Location */}
                                                <div>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Incident Location Map</h5>
                                                        {isNavigating ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsNavigating(false)}
                                                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                                            >
                                                                <span>✕ Clear Route</span>
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setNavSource('current');
                                                                    if ("geolocation" in navigator) {
                                                                        navigator.geolocation.getCurrentPosition(
                                                                            (position) => {
                                                                                setUserLocation([position.coords.latitude, position.coords.longitude]);
                                                                                setIsNavigating(true);
                                                                            },
                                                                            (error) => {
                                                                                console.error("Error getting location:", error);
                                                                                setIsNavigating(false);
                                                                                alert("Unable to retrieve your current location. Please enable GPS permissions in your browser.");
                                                                            },
                                                                            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                                                                        );
                                                                    } else {
                                                                        alert("Geolocation is not supported by your browser.");
                                                                        setIsNavigating(false);
                                                                    }
                                                                }}
                                                                className="px-3 py-1.5 bg-role-soft hover:bg-role-muted text-role border border-role-border text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                                                            >
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                </svg>
                                                                <span>Directions from Me</span>
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="w-full h-64 rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                                                        <MapComponent
                                                            center={[viewReport.latitude, viewReport.longitude]}
                                                            zoom={17}
                                                            showHeatmap={false}
                                                            showGeofence={true}
                                                            showLandmarks={true}
                                                            showHQ={true}
                                                            markers={[
                                                                {
                                                                    id: viewReport.report_id,
                                                                    lat: viewReport.latitude,
                                                                    lng: viewReport.longitude,
                                                                    title: viewReport.landmark || 'Incident Location',
                                                                    category: categoryMap[viewReport.category_id],
                                                                    priority: viewReport.priority_level
                                                                },
                                                                {
                                                                    id: -1,
                                                                    lat: BRGY_OFFICE[0],
                                                                    lng: BRGY_OFFICE[1],
                                                                    title: "Barangay Hall HQ",
                                                                    category: "Barangay Office"
                                                                },
                                                                ...(userLocation ? [{
                                                                    id: -2,
                                                                    lat: userLocation[0],
                                                                    lng: userLocation[1],
                                                                    title: "Your Location",
                                                                    category: "User Location"
                                                                }] : [])
                                                            ]}
                                                            routing={isNavigating && userLocation ? (() => {
                                                                const repLoc: [number, number] = [viewReport.latitude, viewReport.longitude];
                                                                const destName = viewReport.landmark || 'Incident Location';
                                                                return {
                                                                    start: userLocation,
                                                                    end: repLoc,
                                                                    waypointNames: ["My Current Location", destName] as [string, string],
                                                                    onClose: () => setIsNavigating(false)
                                                                };
                                                            })() : undefined}
                                                            onMarkerClick={() => {
                                                                // Marker clicked: do not automatically start directions
                                                            }}
                                                            onDirectionsClick={() => {
                                                                setNavSource('current');
                                                                if ("geolocation" in navigator) {
                                                                    navigator.geolocation.getCurrentPosition(
                                                                        (pos) => {
                                                                            setUserLocation([pos.coords.latitude, pos.coords.longitude]);
                                                                            setIsNavigating(true);
                                                                        },
                                                                        (err) => {
                                                                            console.error("Error getting user location:", err);
                                                                            setIsNavigating(false);
                                                                            alert("Unable to retrieve your current location. Please enable GPS permissions in your browser.");
                                                                        },
                                                                        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
                                                                    );
                                                                } else {
                                                                    alert("Geolocation is not supported by your browser.");
                                                                    setIsNavigating(false);
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Description */}
                                                <div>
                                                    <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Description</h5>
                                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                                        <ReportDescription description={viewReport.description} emptyText="No description provided." />
                                                    </div>
                                                </div>

                                                {/* Official Letter Section (Only for Escalated Reports) */}
                                                {viewReport.status_id >= 4 && viewReport.media?.some(m => m.media_type === 'Document' || m.file_url.toLowerCase().endsWith('.pdf') || m.file_url.toLowerCase().endsWith('.docx')) && (
                                                    <div>
                                                        <h5 className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] mb-4">Official Subdivision Letter</h5>
                                                        <div className="bg-role-soft/50 border border-role-muted rounded-3xl p-6 flex items-center justify-between">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-12 h-12 rounded-2xl bg-role-hover flex items-center justify-center text-white shadow-lg">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                    </svg>
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-black text-gray-900 uppercase tracking-widest">Endorsement Letter</p>
                                                                    <p className="text-[10px] font-bold text-gray-400 mt-0.5">Sent to Barangay for Rescue Request</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => {
                                                                    const letter = viewReport.media?.find(m => m.media_type === 'Document' || m.file_url.toLowerCase().endsWith('.pdf') || m.file_url.toLowerCase().endsWith('.docx'));
                                                                    if (letter) setActiveGallery({ media: [letter], index: 0 });
                                                                }}
                                                                className="px-6 py-2.5 bg-white border border-role-border text-role-hover text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-role-hover hover:text-white transition-all shadow-sm"
                                                            >
                                                                View Letter
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Media Gallery */}
                                                {viewReport.media && viewReport.media.filter(m => {
                                                    const url = m.file_url.toLowerCase();
                                                    return m.media_type !== 'Document' &&
                                                        !url.endsWith('.pdf') &&
                                                        !url.endsWith('.doc') &&
                                                        !url.endsWith('.docx') &&
                                                        !url.endsWith('.txt');
                                                }).length > 0 && (
                                                        <div>
                                                            <div className="flex items-center justify-between mb-4">
                                                                <h5 className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em]">Evidence Gallery</h5>
                                                                <span className="text-[10px] font-bold text-gray-400 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                                                                    {viewReport.media.filter(m => {
                                                                        const url = m.file_url.toLowerCase();
                                                                        return m.media_type !== 'Document' &&
                                                                            !url.endsWith('.pdf') &&
                                                                            !url.endsWith('.doc') &&
                                                                            !url.endsWith('.docx') &&
                                                                            !url.endsWith('.txt');
                                                                    }).length} {viewReport.media.filter(m => {
                                                                        const url = m.file_url.toLowerCase();
                                                                        return m.media_type !== 'Document' &&
                                                                            !url.endsWith('.pdf') &&
                                                                            !url.endsWith('.doc') &&
                                                                            !url.endsWith('.docx') &&
                                                                            !url.endsWith('.txt');
                                                                    }).length === 1 ? 'File' : 'Files'} Attached
                                                                </span>
                                                            </div>

                                                            <div className={`grid gap-3 ${viewReport.media.filter(m => {
                                                                const url = m.file_url.toLowerCase();
                                                                return m.media_type !== 'Document' &&
                                                                    !url.endsWith('.pdf') &&
                                                                    !url.endsWith('.doc') &&
                                                                    !url.endsWith('.docx') &&
                                                                    !url.endsWith('.txt');
                                                            }).length === 1 ? 'grid-cols-1' :
                                                                viewReport.media.filter(m => {
                                                                    const url = m.file_url.toLowerCase();
                                                                    return m.media_type !== 'Document' &&
                                                                        !url.endsWith('.pdf') &&
                                                                        !url.endsWith('.doc') &&
                                                                        !url.endsWith('.docx') &&
                                                                        !url.endsWith('.txt');
                                                                }).length === 2 ? 'grid-cols-2' :
                                                                    'grid-cols-2 sm:grid-cols-3'
                                                                }`}>
                                                                {viewReport.media.filter(m => {
                                                                    const url = m.file_url.toLowerCase();
                                                                    return m.media_type !== 'Document' &&
                                                                        !url.endsWith('.pdf') &&
                                                                        !url.endsWith('.doc') &&
                                                                        !url.endsWith('.docx') &&
                                                                        !url.endsWith('.txt');
                                                                }).map((m: any, idx: number) => (
                                                                    <div
                                                                        key={m.media_id}
                                                                        onClick={() => {
                                                                            const filtered = viewReport.media!.filter(m => {
                                                                                const url = m.file_url.toLowerCase();
                                                                                return m.media_type !== 'Document' &&
                                                                                    !url.endsWith('.pdf') &&
                                                                                    !url.endsWith('.doc') &&
                                                                                    !url.endsWith('.docx') &&
                                                                                    !url.endsWith('.txt');
                                                                            });
                                                                            setActiveGallery({ media: filtered, index: idx });
                                                                        }}
                                                                        className={`group relative rounded-2xl overflow-hidden bg-gray-100 border border-gray-100 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl active:scale-95 ${viewReport.media!.filter(m => {
                                                                            const url = m.file_url.toLowerCase();
                                                                            return m.media_type !== 'Document' &&
                                                                                !url.endsWith('.pdf') &&
                                                                                !url.endsWith('.doc') &&
                                                                                !url.endsWith('.docx') &&
                                                                                !url.endsWith('.txt');
                                                                        }).length === 3 && idx === 0 ? 'sm:row-span-2 sm:h-full' : 'aspect-square'
                                                                            }`}
                                                                    >
                                                                        {m.media_type === 'Video' ? (
                                                                            <div className="relative w-full h-full">
                                                                                <video src={m.file_url} className="w-full h-full object-cover" />
                                                                                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                                                                                    <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-white ring-4 ring-white/20">
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 fill-current" viewBox="0 0 20 20">
                                                                                            <path d="M4.516 7.548c0-.446.362-.809.808-.809.446 0 .808.363.808.809v4.904c0 .446-.362.809-.808.809-.446 0-.808-.363-.808-.809V7.548zm5.281 0c0-.446.362-.809.808-.809.446 0 .808.363.808.809v4.904c0 .446-.362.809-.808.809-.446 0-.808-.363-.808-.809V7.548z" />
                                                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                                                        </svg>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <img src={m.file_url} alt="Report evidence" className="w-full h-full object-cover" />
                                                                        )}

                                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                                                            <span className="text-[10px] font-bold text-white uppercase tracking-widest flex items-center gap-2">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                                </svg>
                                                                                Click to Expand
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                {/* AI Insights & Data Assessment */}
                                                <div className="bg-role-soft/50 rounded-2xl p-6 border border-role-muted/50">
                                                    <h5 className="text-[11px] font-bold text-role uppercase tracking-widest mb-4 flex items-center gap-2">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                                        </svg>
                                                        AI Insights & Data Assessment
                                                    </h5>
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        <div className="bg-white p-4 rounded-xl shadow-sm border border-role-muted">
                                                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Area Risk Level</span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                                <span className="text-sm font-bold text-gray-900">High Risk Hotspot</span>
                                                            </div>
                                                        </div>
                                                        <div className="bg-white p-4 rounded-xl shadow-sm border border-role-muted">
                                                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Duplicate Check</span>
                                                            <div className="flex items-center gap-2">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                                <span className="text-sm font-bold text-gray-900">Unique Report</span>
                                                            </div>
                                                        </div>
                                                        <div className="bg-white p-4 rounded-xl shadow-sm border border-role-muted">
                                                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">AI Classification</span>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="px-2 py-0.5 bg-role-muted text-role text-[10px] font-bold rounded-md">Dog</span>
                                                                <span className="px-2 py-0.5 bg-blue-100 text-blue-600 text-[10px] font-bold rounded-md">Injured</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Comments Section */}
                                                <div className="bg-white border border-gray-100 rounded-2xl p-6 pt-5 shadow-sm">
                                                    {viewReport.comments && viewReport.comments.length > 0 && (
                                                        <button
                                                            onClick={() => setExpandedComments(prev => ({ ...prev, [viewReport.report_id]: !prev[viewReport.report_id] }))}
                                                            className="text-[10px] font-black text-gray-400 hover:text-role uppercase tracking-widest transition-colors flex items-center gap-2 mb-6"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${expandedComments[viewReport.report_id] ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                            {expandedComments[viewReport.report_id] ? 'Hide Comments' : `View all ${viewReport.comments.length} comments`}
                                                        </button>
                                                    )}

                                                    {(expandedComments[viewReport.report_id] || !viewReport.comments || viewReport.comments.length === 0) && (
                                                        <div className="space-y-2 mb-6 max-h-72 overflow-y-auto custom-scrollbar pr-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                                            {viewReport.comments && viewReport.comments.length > 0 ? (
                                                                viewReport.comments
                                                                    .filter((c: any) => !c.parent_comment_id)
                                                                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                                                    .map((c: any) => {
                                                                        const replies = viewReport.comments
                                                                            ?.filter((reply: any) => reply.parent_comment_id === c.comment_id)
                                                                            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) || [];
                                                                        return (
                                                                            <div key={c.comment_id} className="mb-4 last:mb-0">
                                                                                <div className="flex gap-3 relative">
                                                                                    {/* Parent Avatar & Vertical Line */}
                                                                                    <div className="relative flex flex-col items-center shrink-0">
                                                                                        <img
                                                                                            src={getProfilePicture(c.user_photo)}
                                                                                            className="w-8 h-8 rounded-full object-cover z-10 ring-4 ring-white border border-gray-100 shadow-sm"
                                                                                            alt={c.user_name || 'User'}
                                                                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                                        />
                                                                                        {(replies.length > 0 || replyingTo[viewReport.report_id]?.commentId === c.comment_id) && (
                                                                                            <div className="absolute top-8 bottom-[-16px] left-1/2 -translate-x-1/2 w-[2px] bg-gray-100 z-0"></div>
                                                                                        )}
                                                                                    </div>

                                                                                    <div className="flex-1 pb-1">
                                                                                        {/* Parent Bubble */}
                                                                                        <div className="bg-[#FAFAF9] rounded-[1.5rem] p-3.5 px-4 border border-gray-50 shadow-sm inline-block">
                                                                                            <span className="block text-[11px] font-black text-[#1a1208] mb-0.5">{c.user_name || 'User'}</span>
                                                                                            <p className="text-xs font-semibold text-gray-700 leading-relaxed pr-6">{c.comment}</p>
                                                                                        </div>
                                                                                        {/* Parent Actions */}
                                                                                        <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest"><RelativeTimestamp date={c.created_at} /></span>
                                                                                            <button
                                                                                                onClick={() => setReplyingTo(prev => ({ ...prev, [viewReport.report_id]: { commentId: c.comment_id, userName: c.user_name || 'User' } }))}
                                                                                                className="text-[10px] font-bold text-gray-500 hover:text-role transition-colors"
                                                                                            >
                                                                                                Reply
                                                                                            </button>
                                                                                        </div>

                                                                                        {/* Replies Container */}
                                                                                        {replies.length > 0 && (
                                                                                            <div className="mt-4 space-y-4">
                                                                                                {replies.map((reply: any, index: number) => (
                                                                                                    <div key={reply.comment_id} className="flex gap-3 relative">
                                                                                                        {/* Horizontal connector curve */}
                                                                                                        <div className="absolute top-[-10px] left-[-28px] w-[28px] h-[26px] border-b-[2px] border-l-[2px] border-gray-100 rounded-bl-[12px] z-0 pointer-events-none"></div>

                                                                                                        {/* Mask to hide vertical line below the last reply */}
                                                                                                        {index === replies.length - 1 && replyingTo[viewReport.report_id]?.commentId !== c.comment_id && (
                                                                                                            <div className="absolute top-[16px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>
                                                                                                        )}

                                                                                                        {/* Child Avatar */}
                                                                                                        <img
                                                                                                            src={getProfilePicture(reply.user_photo)}
                                                                                                            className="w-6 h-6 rounded-full object-cover z-10 mt-1 ring-4 ring-white border border-gray-100 shadow-sm shrink-0"
                                                                                                            alt={reply.user_name || 'User'}
                                                                                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                                                        />

                                                                                                        <div className="flex-1">
                                                                                                            {/* Child Bubble */}
                                                                                                            <div className="bg-[#FAFAF9] rounded-[1.2rem] p-3 px-4 border border-gray-50 shadow-sm inline-block">
                                                                                                                <span className="block text-[10px] font-black text-gray-800 mb-0.5">{reply.user_name || 'User'}</span>
                                                                                                                <p className="text-[11px] font-semibold text-gray-600 leading-relaxed pr-4">{reply.comment}</p>
                                                                                                            </div>
                                                                                                            {/* Child Actions */}
                                                                                                            <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                                                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest"><RelativeTimestamp date={reply.created_at} /></span>
                                                                                                                <button
                                                                                                                    onClick={() => setReplyingTo(prev => ({ ...prev, [viewReport.report_id]: { commentId: c.comment_id, userName: reply.user_name || 'User' } }))}
                                                                                                                    className="text-[9px] font-bold text-gray-500 hover:text-role transition-colors"
                                                                                                                >
                                                                                                                    Reply
                                                                                                                </button>
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    </div>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}

                                                                                        {/* Inline Reply Input */}
                                                                                        {replyingTo[viewReport.report_id]?.commentId === c.comment_id && (
                                                                                            <div className="mt-4 flex items-center gap-3 relative z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                                                                                                <div className="absolute top-[-10px] left-[-28px] w-[28px] h-[24px] border-b-[2px] border-l-[2px] border-gray-100 rounded-bl-[12px] z-0 pointer-events-none"></div>
                                                                                                <div className="absolute top-[14px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>

                                                                                                <div className="w-6 h-6 rounded-full bg-role-muted flex items-center justify-center text-role font-black text-[10px] shrink-0 border border-role-border z-10 bg-white ring-4 ring-white">
                                                                                                    {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'S'}
                                                                                                </div>
                                                                                                <div className="flex-1 relative flex items-center">
                                                                                                    <input
                                                                                                        type="text"
                                                                                                        autoFocus
                                                                                                        placeholder={`Replying to ${replyingTo[viewReport.report_id]?.userName}...`}
                                                                                                        className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.2rem] pl-4 pr-10 py-2 text-[11px] font-semibold text-[#1a1208] focus:outline-none focus:border-role-border focus:bg-white transition-all placeholder:text-gray-400 shadow-inner"
                                                                                                        value={commentInputs[viewReport.report_id] || ''}
                                                                                                        onChange={(e) => setCommentInputs(prev => ({ ...prev, [viewReport.report_id]: e.target.value }))}
                                                                                                        onKeyPress={(e) => e.key === 'Enter' && handleAddComment(viewReport.report_id)}
                                                                                                    />
                                                                                                    <button
                                                                                                        onClick={() => {
                                                                                                            setReplyingTo(prev => ({ ...prev, [viewReport.report_id]: null }));
                                                                                                            setCommentInputs(prev => ({ ...prev, [viewReport.report_id]: '' }));
                                                                                                        }}
                                                                                                        className="absolute right-3 text-gray-400 hover:text-red-500 transition-colors"
                                                                                                    >
                                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                                                                        </svg>
                                                                                                    </button>
                                                                                                </div>
                                                                                                <button
                                                                                                    onClick={() => handleAddComment(viewReport.report_id)}
                                                                                                    className="bg-role text-white rounded-full w-8 h-8 flex items-center justify-center shadow-md shadow-role-muted hover:scale-105 active:scale-95 transition-all shrink-0"
                                                                                                >
                                                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 relative left-[1px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                                                                    </svg>
                                                                                                </button>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })
                                                            ) : (
                                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest italic text-center py-4">No comments yet. Be the first to comment!</p>
                                                            )}
                                                        </div>
                                                    )}

                                                    {!replyingTo[viewReport.report_id] && (
                                                        <div className="flex items-center gap-3 animate-in fade-in duration-200 border-t border-gray-50 pt-4 mt-2">
                                                            <div className="flex-1 relative">
                                                                <input
                                                                    type="text"
                                                                    placeholder="Write a comment as Subdivision Leader..."
                                                                    className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.5rem] pl-5 pr-12 py-3 text-xs font-semibold text-[#1a1208] focus:outline-none focus:border-role-border focus:bg-white transition-all placeholder:text-gray-300 shadow-inner"
                                                                    value={commentInputs[viewReport.report_id] || ''}
                                                                    onChange={(e) => setCommentInputs(prev => ({ ...prev, [viewReport.report_id]: e.target.value }))}
                                                                    onKeyPress={(e) => e.key === 'Enter' && handleAddComment(viewReport.report_id)}
                                                                />
                                                            </div>
                                                            <button
                                                                onClick={() => handleAddComment(viewReport.report_id)}
                                                                className="bg-role text-white rounded-[1.2rem] p-3 shadow-md shadow-role-muted hover:scale-105 active:scale-95 transition-all flex-shrink-0"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* ACTION PANEL */}
                                                <div className="mt-8 pt-8 border-t border-gray-100">
                                                    <div className="flex flex-col gap-3">
                                                        {((viewReport as any).pet_id || (viewReport as any).case_pet_id) ? (
                                                            <button
                                                                type="button"
                                                                disabled
                                                                className="w-full py-3.5 border-2 border-gray-700 bg-gray-800 text-gray-200 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-xs cursor-not-allowed opacity-90"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                </svg>
                                                                <span>Record Already Added</span>
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setIsAddPetModalOpen(true);
                                                                }}
                                                                className="w-full py-3.5 border-2 border-role-border bg-gradient-to-r from-role-soft to-amber-50 hover:from-role-muted hover:to-amber-100 text-role rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer hover:scale-[1.01] active:scale-95"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                                </svg>
                                                                <span>Add Record for this Animal in System</span>
                                                            </button>
                                                        )}

                                                        {/* STEP 1: VERIFY (Only for Pending reports) */}
                                                        {viewReport.status_id === 1 && (
                                                            <button
                                                                onClick={() => {
                                                                    handleUpdateStatus(viewReport.report_id, 2);
                                                                    setViewingReportId(null);
                                                                }}
                                                                className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                                VERIFY ANIMAL ACTION
                                                            </button>
                                                        )}

                                                        {/* STEP 2: ESCALATE (When Verified or Under Observation / Secured and not yet Escalated) */}
                                                        {escalateBlockedFor === viewReport.report_id && ([2, 16].includes(viewReport.status_id)) && !(viewReport as any).pet_id && !Boolean(viewReport.endorsement_letter || (viewReport as any).rescue) && (
                                                            <p role="alert" className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                                                🐾 Add a record for this animal first. A report can't be escalated or resolved until the animal is in the records.
                                                            </p>
                                                        )}
                                                        {([2, 7, 8, 16].includes(viewReport.status_id)) && !Boolean(viewReport.status_id === 4 || viewReport.status_id === 13 || viewReport.endorsement_letter || (viewReport as any).rescue) && (
                                                            <button
                                                                onClick={() => {
                                                                    // No animal record yet: explain why instead of opening the escalation form
                                                                    if ([2, 16].includes(viewReport.status_id) && !(viewReport as any).pet_id) {
                                                                        setEscalateBlockedFor(viewReport.report_id);
                                                                        return;
                                                                    }
                                                                    setEscalateBlockedFor(null);
                                                                    setEscalatingReportId(viewReport.report_id);
                                                                    setIsEscalateModalOpen(true);
                                                                    setViewingReportId(null);
                                                                }}
                                                                className="w-full py-4 bg-role-hover text-white rounded-2xl text-xs font-bold shadow-lg shadow-role-muted hover:bg-role-strong transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                                </svg>
                                                                ESCALATE TO BARANGAY
                                                            </button>
                                                        )}

                                                        {/* STEP 3: PENDING BARANGAY (After escalation) */}
                                                        {Boolean(viewReport.status_id === 4 || viewReport.status_id === 13 || viewReport.endorsement_letter || (viewReport as any).rescue) && (
                                                            <div className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-gray-200">
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                </svg>
                                                                Pending Barangay Review
                                                            </div>
                                                        )}

                                                        {([1, 2, 7, 8, 15, 16].includes(viewReport.status_id)) && !Boolean(viewReport.status_id === 4 || viewReport.status_id === 13 || viewReport.endorsement_letter || (viewReport as any).rescue) && (
                                                            <button
                                                                onClick={() => {
                                                                    setResolvingReportId(viewReport.report_id);
                                                                    setIsResolveModalOpen(true);
                                                                }}
                                                                className="w-full py-3 border border-gray-100 rounded-2xl text-[10px] font-bold text-gray-400 hover:bg-green-50 hover:text-green-600 hover:border-green-100 transition-all uppercase tracking-widest cursor-pointer"
                                                            >
                                                                Update Animal Status / Resolve
                                                            </button>
                                                        )}

                                                        {canRejectReport(viewReport as any) && (
                                                        <button
                                                            onClick={() => {
                                                                openRejectModal(viewReport.report_id);
                                                            }}
                                                            className="w-full py-3 border border-gray-100 rounded-2xl text-[10px] font-bold text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all uppercase tracking-widest"
                                                        >
                                                            Reject
                                                        </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        )}                    </div>
                </main>
            </div>


            {/* Modal Overlay */}
            {isWarningModalOpen && selectedWarningReport && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-none sm:rounded-[2.5rem] shadow-2xl w-full h-full sm:h-auto max-w-xl overflow-y-auto border-none sm:border border-yellow-100 animate-in zoom-in-95 duration-300">
                        <div className="px-8 py-6 border-b border-gray-150 flex justify-between items-center bg-yellow-50/50">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">⚠️</span>
                                <div>
                                    <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Issue Owner Warning</h3>
                                    <p className="text-xs text-gray-500 mt-1 font-medium">Issue a formal notice to the registered pet owner.</p>
                                </div>
                            </div>
                            <button onClick={() => setIsWarningModalOpen(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleIssueWarning} className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Pet Owner (Recipient)</label>
                                <input
                                    type="text"
                                    readOnly
                                    className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold text-gray-500 outline-none"
                                    value={warningOwnerId}
                                />
                            </div>

                            {/* Prior Offenses & Escalation Status */}
                            {isLoadingPriorWarnings ? (
                                <div className="p-3 bg-gray-50 border border-gray-100 rounded-2xl text-xs text-gray-400 font-bold flex items-center gap-2 animate-pulse">
                                    <span className="w-3.5 h-3.5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                                    Checking resident's previous warning history...
                                </div>
                            ) : priorWarnings.length > 0 ? (
                                <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-2xl text-[11px] text-amber-900 flex flex-col gap-1.5 animate-in fade-in duration-200">
                                    <div className="font-black flex items-center justify-between text-amber-900 uppercase tracking-wider text-[10px]">
                                        <span className="flex items-center gap-1.5">📋 Prior Citations ({priorWarnings.length})</span>
                                        <span className="text-amber-700 font-medium">auto-escalated to: <strong className="uppercase">{warningTier}</strong></span>
                                    </div>
                                    <div className="max-h-24 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar text-[10px]">
                                        {priorWarnings.map((w: any, idx: number) => (
                                            <div key={w.warning_id || idx} className="flex justify-between items-center bg-white/90 px-3 py-1.5 rounded-xl border border-amber-100 shadow-sm">
                                                <span className="font-bold text-gray-800">{w.warning_level} <span className="font-normal text-gray-500">• {w.violation_type}</span></span>
                                                <span className="text-gray-400 font-mono text-[9px]">{new Date(w.created_at).toLocaleDateString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl text-[10px] font-bold text-blue-800 flex items-center gap-2">
                                    <span>✨</span> First recorded violation for this resident. Defaulted to Notice (Friendly Reminder).
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Warning Tier</label>
                                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 tracking-wider">
                                            {priorWarnings.length === 0 ? '✨ Notice' : `⚡ Step ${Math.min(priorWarnings.length + 1, 4)}/4`}
                                        </span>
                                    </div>
                                    <select
                                        className="w-full px-5 py-4 bg-white border border-gray-300 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-yellow-100 focus:border-yellow-500 outline-none transition-all"
                                        value={warningTier}
                                        onChange={(e) => setWarningTier(e.target.value)}
                                    >
                                        <option value="Notice">Notice (Initial Friendly Reminder)</option>
                                        <option value="1st Warning">1st Warning (Official 1st Citation)</option>
                                        <option value="2nd Warning">2nd Warning (Strict 2nd Citation)</option>
                                        <option value="Final Notice / Escalation">Final Notice / Escalation (Barangay Action)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Violation Category</label>
                                    <select
                                        className="w-full px-5 py-4 bg-white border border-gray-300 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-yellow-100 focus:border-yellow-500 outline-none transition-all"
                                        value={warningViolation}
                                        onChange={(e) => setWarningViolation(e.target.value)}
                                    >
                                        <option value="Free-Roaming Unleashed">Free-Roaming Unleashed</option>
                                        <option value="Nuisance / Aggressive Behavior">Nuisance / Aggressive Behavior</option>
                                        <option value="Overdue Vaccination">Overdue Vaccination</option>
                                        <option value="Repeated Impoundment Retrieval">Repeated Impoundment Retrieval</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Incident Description / Remarks</label>
                                <textarea required rows={3}
                                    className="w-full px-5 py-4 bg-white border border-gray-300 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-yellow-100 focus:border-yellow-500 outline-none transition-all resize-none"
                                    value={warningDescription}
                                    onChange={(e) => setWarningDescription(e.target.value)}
                                    placeholder="Provide specific details about the incident..."
                                />
                            </div>
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="attach-evidence"
                                    checked={warningEvidence}
                                    onChange={(e) => setWarningEvidence(e.target.checked)}
                                    className="w-5 h-5 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                                />
                                <label htmlFor="attach-evidence" className="text-xs font-semibold text-gray-700 cursor-pointer">
                                    Attach incident photos from this report as evidence
                                </label>
                            </div>
                            <div className="w-full h-[1px] bg-gray-150 my-6" />
                            <div className="flex gap-4 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setIsWarningModalOpen(false)}
                                    className="flex-1 py-3.5 bg-[#F1F3F6] hover:bg-gray-200 text-gray-700 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isIssuingWarning}
                                    className="flex-1 py-3.5 bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-200 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    {isIssuingWarning ? 'Issuing...' : 'ISSUE WARNING'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* 9-Step Resident Reporting Modal Process */}
            <SubdReportModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSuccess={() => fetchReports(true)}
            />

            {/* Escalate to Barangay Modal */}
            <NoticeModal
                isOpen={noOwnerNotice}
                title="Can't issue a warning yet"
                message="The owner of this animal has not been identified or matched yet, so there is no one to send the warning to."
                hint="Link the animal to a registered pet record first (Add Record, or confirm a potential match). Once the owner is known you can issue the warning."
                onClose={() => setNoOwnerNotice(false)}
            />

            {/* Reject Report Modal (report is moved to History as Rejected, never deleted) */}
            {rejectingReportId !== null && (
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => !isRejecting && setRejectingReportId(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-5 py-4 border-b border-gray-100 bg-red-50/60">
                            <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Reject Report #{rejectingReportId}</h3>
                            <p className="text-[11px] text-gray-500 mt-0.5 font-medium">
                                The report moves to History Reports and is removed from the resident's active list. It is kept for audit.
                            </p>
                        </div>
                        <div className="p-5 space-y-3">
                            <label className="text-[9px] font-black text-gray-900 uppercase tracking-widest block">
                                Reason for rejection <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                rows={3}
                                autoFocus
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="e.g. Not a stray animal / duplicate of another report / outside our subdivision..."
                                className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-red-100 focus:border-red-400 outline-none transition-all placeholder:text-gray-300 resize-none"
                            />
                            <p className="text-[10px] text-gray-400 font-medium">The resident is notified with this reason.</p>
                            <div className="flex gap-3 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setRejectingReportId(null)}
                                    disabled={isRejecting}
                                    className="flex-1 py-2.5 bg-[#F1F3F6] hover:bg-gray-200 text-gray-700 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleRejectReport}
                                    disabled={isRejecting || rejectReason.trim().length < 5}
                                    className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer"
                                >
                                    {isRejecting ? 'Rejecting...' : 'Reject Report'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isEscalateModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-none sm:rounded-[2.5rem] shadow-2xl w-full h-full sm:h-auto max-w-xl overflow-y-auto border-none sm:border border-role-muted animate-in zoom-in-95 duration-300">
                        <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Escalation Letter</h3>
                                <p className="text-xs text-gray-400 mt-1 font-medium">Attach endorsement document to forward request to Barangay.</p>
                            </div>
                            <button onClick={() => setIsEscalateModalOpen(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Request Title</label>
                                <input
                                    type="text" required
                                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-role-muted focus:border-role outline-none transition-all placeholder:text-gray-300"
                                    value={escalationTitle}
                                    onChange={(e) => setEscalationTitle(e.target.value)}
                                    placeholder="e.g. Endorsement for Report #18"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Additional Notes</label>
                                <textarea required rows={4}
                                    className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-role-muted focus:border-role outline-none transition-all placeholder:text-gray-300 resize-none"
                                    value={escalationDescription}
                                    onChange={(e) => setEscalationDescription(e.target.value)}
                                    placeholder="Provide detailed description of why emergency rescue is needed..."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Endorsement Letter File (PDF/DOCX/IMAGE)</label>
                                <div className="flex items-center gap-3 mt-1">
                                    <label htmlFor="endorsement-file-input-reports" className="px-5 py-2 bg-[#FFF3E6] text-role hover:bg-role-muted rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border border-transparent">
                                        Choose File
                                    </label>
                                    <input
                                        id="endorsement-file-input-reports"
                                        type="file"
                                        required
                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                        onChange={(e) => setEndorsementFile(e.target.files?.[0] || null)}
                                        className="hidden"
                                    />
                                    <span className="text-xs font-semibold text-gray-500">
                                        {endorsementFile ? endorsementFile.name : 'No file chosen'}
                                    </span>
                                </div>
                            </div>
                            <div className="w-full h-[1px] bg-gray-150 my-6" />
                            <div className="flex gap-4 pt-1">
                                <button
                                    onClick={() => setIsEscalateModalOpen(false)}
                                    className="flex-1 py-3.5 bg-[#F1F3F6] hover:bg-gray-200 text-gray-700 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEscalate}
                                    disabled={isEscalating || !endorsementFile}
                                    className="flex-1 py-3.5 bg-[#FBB065] hover:bg-[#F99D43] disabled:bg-role-border text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    {isEscalating ? 'Escalating...' : 'SEND ESCALATION'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Resolve / Update Animal Status Modal */}
            {isResolveModalOpen && resolvingReportId && (
                (() => {
                    const resolvingReport = reports.find(r => r.report_id === resolvingReportId);
                    if (!resolvingReport) return null;
                    return (
                        <ResolveLostPetModal
                            isOpen={isResolveModalOpen}
                            pet={{
                                pet_id: (resolvingReport as any).pet_id || 0,
                                pet_name: (resolvingReport as any).pet_name || resolvingReport.animal_type || 'Animal',
                                photo_url: (resolvingReport as any).pet_photo_url || (resolvingReport.media && resolvingReport.media[0]?.file_url),
                                breed: (resolvingReport as any).pet_breed || (resolvingReport as any).breed || (resolvingReport as any).animal_breed,
                                species: (resolvingReport as any).pet_type || resolvingReport.animal_type || 'Animal'
                            }}
                            reportId={resolvingReport.report_id}
                            report={resolvingReport}
                            isEscalated={Boolean((resolvingReport as any).endorsement_letter || resolvingReport.status_id === 4 || resolvingReport.status_id === 5)}
                            subdivisionName={(resolvingReport as any).subdivision_name || (resolvingReport as any).subdivision?.subdivision_name}
                            onClose={() => {
                                setIsResolveModalOpen(false);
                                setResolvingReportId(null);
                            }}
                            onSuccess={() => {
                                fetchReports();
                                setIsResolveModalOpen(false);
                                setResolvingReportId(null);
                            }}
                        />
                    );
                })()
            )}

            <SuccessModal
                isOpen={showSuccess}
                message="Action completed successfully!"
            />

            {/* Premium Media Gallery Modal */}
            {activeGallery && (
                <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-xl flex flex-col animate-in fade-in duration-300">
                    {/* Gallery Header */}
                    <div className="p-6 flex items-center justify-between border-b border-white/10 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-role-hover flex items-center justify-center text-white font-black text-lg shadow-lg">
                                {currentUser?.name?.charAt(0).toUpperCase() || 'S'}
                            </div>
                            <div>
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">Incident Evidence</h3>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <span className="w-2 h-2 rounded-full bg-role animate-pulse"></span>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Viewing File {activeGallery.index + 1} of {activeGallery.media.length}</p>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setActiveGallery(null)}
                            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all border border-white/10 hover:rotate-90"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Main Viewport */}
                    <div className="flex-1 relative flex items-center justify-center p-4 md:p-12 overflow-hidden">
                        {/* Navigation Controls */}
                        {activeGallery.media.length > 1 && (
                            <>
                                <button
                                    onClick={() => setActiveGallery(prev => prev ? { ...prev, index: (prev.index - 1 + prev.media.length) % prev.media.length } : null)}
                                    className="absolute left-4 md:left-8 w-12 h-12 rounded-full bg-white/10 hover:bg-role-hover flex items-center justify-center text-white transition-all border border-white/10 backdrop-blur-md z-20"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>
                                <button
                                    onClick={() => setActiveGallery(prev => prev ? { ...prev, index: (prev.index + 1) % prev.media.length } : null)}
                                    className="absolute right-4 md:right-8 w-12 h-12 rounded-full bg-white/10 hover:bg-role-hover flex items-center justify-center text-white transition-all border border-white/10 backdrop-blur-md z-20"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </>
                        )}

                        {/* Media Content */}
                        <div className="w-full h-full max-w-5xl flex items-center justify-center">
                            {activeGallery.media[activeGallery.index].media_type === 'Video' ? (
                                <video
                                    src={activeGallery.media[activeGallery.index].file_url}
                                    controls
                                    autoPlay
                                    className="max-w-full max-h-full rounded-2xl shadow-2xl border border-white/5"
                                />
                            ) : (() => {
                                const currentMedia = activeGallery.media[activeGallery.index];
                                const isDoc = currentMedia.media_type === 'Document' ||
                                    currentMedia.file_url.toLowerCase().endsWith('.pdf') ||
                                    currentMedia.file_url.toLowerCase().endsWith('.docx');

                                if (isDoc) {
                                    return (
                                        <div className="w-full h-full flex flex-col items-center justify-center gap-8">
                                            <div className="w-32 h-32 rounded-3xl bg-role-hover flex items-center justify-center text-white shadow-2xl ring-8 ring-role-hover/20">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <div className="text-center">
                                                <h4 className="text-xl font-black text-white uppercase tracking-widest mb-4">Official Document</h4>
                                                <div className="flex flex-wrap justify-center gap-4">
                                                    <a
                                                        href={currentMedia.file_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-8 py-3 bg-white text-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-role hover:text-white transition-all flex items-center gap-2"
                                                    >
                                                        Open in New Tab
                                                    </a>
                                                    <a
                                                        href={currentMedia.file_url.replace('/upload/', `/upload/fl_attachment:StraySafe_Doc_${currentMedia.media_id}/`)}
                                                        className="px-8 py-3 bg-role-hover text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-role-strong transition-all flex items-center gap-2"
                                                    >
                                                        Download File
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <img
                                        src={currentMedia.file_url}
                                        alt="Gallery item"
                                        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl border border-white/5"
                                    />
                                );
                            })()}
                        </div>
                    </div>

                    {/* Progress Bar (at bottom) */}
                    <div className="h-1 bg-white/5 w-full shrink-0">
                        <div
                            className="h-full bg-role-hover transition-all duration-500"
                            style={{ width: `${((activeGallery.index + 1) / activeGallery.media.length) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Case Chat Drawer */}
            <ReportChatDrawer
                isOpen={isChatOpen}
                onClose={() => {
                    setIsChatOpen(false);
                    setSelectedChatReport(null);
                }}
                report={selectedChatReport}
                currentUser={currentUser}
            />

            {/* Takeover Modal */}
            {takeoverTarget && (
                <TakeoverReportModal
                    isOpen={Boolean(takeoverTarget)}
                    onClose={() => setTakeoverTarget(null)}
                    reportId={takeoverTarget.id}
                    currentHandlerName={takeoverTarget.currentHandlerName}
                    currentUserId={currentUserId}
                    onSuccess={() => {
                        setShowSuccess(true);
                        fetchReports();
                        setTimeout(() => setShowSuccess(false), 3000);
                    }}
                />
            )}

            {/* Add Pet Record Modal */}
            {isAddPetModalOpen && viewingReportId && (() => {
                const rep = reports.find(r => r.report_id === viewingReportId);
                if (!rep) return null;
                return (
                    <AddPetModal
                        isOpen={isAddPetModalOpen}
                        onClose={() => setIsAddPetModalOpen(false)}
                        initialReportData={rep}
                        onPetCreated={(createdPet: any) => {
                            if (createdPet?.pet_id) {
                                setReports(prev => prev.map(r => r.report_id === viewingReportId ? {
                                    ...r,
                                    pet_id: createdPet.pet_id,
                                    pet_name: createdPet.pet_name || (r as any).pet_name
                                } : r));
                            }
                            fetchReports();
                            setShowSuccess(true);
                            setTimeout(() => setShowSuccess(false), 3000);
                        }}
                    />
                );
            })()}

            {/* Warning Details Modal */}
            <WarningDetailsModal
                isOpen={isWarningDetailsModalOpen}
                onClose={() => setIsWarningDetailsModalOpen(false)}
                warning={selectedWarningDetails}
                onViewPet={(petId) => {
                    navigate(`/subd/pets?pet_id=${petId}`);
                }}
                onViewReport={(reportId) => {
                    navigate(`/subd/reports/${reportId}`);
                }}
            />

            {/* Reusable Mobile Bottom Navigation */}
            <SubdBottomNav activeTab="reports" />
        </div>
    );
};

export default SubdReports;
