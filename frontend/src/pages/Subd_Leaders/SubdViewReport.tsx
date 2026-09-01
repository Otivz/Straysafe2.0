import { useState, useEffect } from 'react';
import axios from 'axios';
import api from '../../utils/api';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { useNavigate, useParams, Link, useLocation, useSearchParams } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SuccessModal from '../../components/Modals/SuccessModal';
import MapComponent from '../../components/MapComponent';
import AISuggestionPanel from '../../components/AISuggestionPanel';
import AIPotentialMatchesList from '../../components/AIPotentialMatchesList';
import ResolveLostPetModal from '../../components/Modals/ResolveLostPetModal';
import AddPetModal from '../../components/PetRecords/AddPetModal';
import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import { useReportChatCount } from '../../utils/chatUtils';
import TakeoverReportModal from '../../components/Modals/TakeoverReportModal';
import TransferReportModal from '../../components/Modals/TransferReportModal';
import RejectTransferModal from '../../components/Modals/RejectTransferModal';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import { type PetRecord, mapRawPetToPetRecord } from '../../components/PetRecords/types';
import { getReportStatusLabel, getReportStatusBadgeStyle, REPORT_STATUS_MAP } from '../../utils/reportStatus';

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
    condition: string;
    behavior_tags?: string;
    description: string;
    visibility: string;
    created_at: string;
    user_id: number;
    subdivision_id?: number;
    reporter_name?: string;
    reporter_photo?: string;
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
    pet_id?: number | null;
    pet_name?: string | null;
    pet_qr_code_url?: string | null;
    pet_qr_code_hash?: string | null;
    owner_id?: number | null;
    owner_name?: string | null;
    owner_phone?: string | null;
    owner_email?: string | null;
    owner_address?: string | null;
    is_owner_report?: boolean;
    assigned_leader_id?: number | null;
    assigned_leader_name?: string | null;
    assigned_leader_photo?: string | null;
    claimed_at?: string | null;
    pending_transfer_to_id?: number | null;
    pending_transfer_to_name?: string | null;
    pending_transfer_to_photo?: string | null;
    pending_transfer_from_id?: number | null;
    pending_transfer_from_name?: string | null;
    pending_transfer_notes?: string | null;
    pending_transfer_created_at?: string | null;
    is_takeover_eligible?: boolean;
    takeover_locked_until?: string | null;
    takeover_cooldown_remaining_seconds?: number;
    takeover_inactivity_hours_threshold?: number;
    last_activity_at?: string | null;
    verification_status?: string | null;
    false_alarm_reason?: string | null;
    verification_notes?: string | null;
    verified_by_user_id?: number | null;
    verified_by_name?: string | null;
    verified_at?: string | null;
    disputes?: ReportDispute[];
}

export interface ReportDispute {
    dispute_id: number;
    report_id: number;
    resident_user_id: number;
    pet_id?: number | null;
    dispute_reason: string;
    vaccination_card_url?: string | null;
    supporting_photo_url?: string | null;
    status: string;
    reviewer_id?: number | null;
    reviewer_notes?: string | null;
    created_at: string;
    resolved_at?: string | null;
    resident_name?: string | null;
    pet_name?: string | null;
    reviewer_name?: string | null;
}

const statusMap = REPORT_STATUS_MAP;

const categoryMap: Record<number, string> = {
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
    4: 'Roaming Pack', 5: 'Animal Rescue Needed', 6: 'Lost Pet'
};

const SubdViewReport = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const location = useLocation();

    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);
    const [selectedPetDetail, setSelectedPetDetail] = useState<PetRecord | null>(null);
    const [isLoadingPetDetail, setIsLoadingPetDetail] = useState(false);

    // False Alarm, Verification & Dispute Management State
    const [isFalseAlarmModalOpen, setIsFalseAlarmModalOpen] = useState(false);
    const [falseAlarmReason, setFalseAlarmReason] = useState('No Animal Found');
    const [falseAlarmNotes, setFalseAlarmNotes] = useState('');
    const [isSubmittingFalseAlarm, setIsSubmittingFalseAlarm] = useState(false);

    const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
    const [verifyNotes, setVerifyNotes] = useState('');
    const [verifyBehaviorFinding, setVerifyBehaviorFinding] = useState('Unsubstantiated / Friendly Dog');
    const [verifyActualBite, setVerifyActualBite] = useState(false);
    const [verifyChasing, setVerifyChasing] = useState(false);
    const [verifyAttemptedBite, setVerifyAttemptedBite] = useState(false);
    const [verifyInjury, setVerifyInjury] = useState(false);
    const [verifyAggressive, setVerifyAggressive] = useState(false);
    const [isSubmittingVerify, setIsSubmittingVerify] = useState(false);

    const [reviewingDisputeId, setReviewingDisputeId] = useState<number | null>(null);
    const [disputeReviewNotes, setDisputeReviewNotes] = useState('');
    const [isReviewingDispute, setIsReviewingDispute] = useState(false);

    const handleOpenPetDetail = async (petId?: number | null) => {
        if (!petId) return;
        setIsLoadingPetDetail(true);
        try {
            const res = await axios.get(`http://localhost:8000/pets/${petId}`);
            setSelectedPetDetail(mapRawPetToPetRecord(res.data));
        } catch (e) {
            console.error("Failed to load pet details:", e);
        } finally {
            setIsLoadingPetDetail(false);
        }
    };

    const handleOpenQrTag = async () => {
        if (report?.pet_qr_code_url) {
            setSelectedQrPreview({
                url: report.pet_qr_code_url,
                petName: report.pet_name || undefined,
                hash: report.pet_qr_code_hash || undefined,
                ownerName: report.owner_name || undefined,
                ownerPhone: report.owner_phone || undefined
            });
            return;
        }

        if (report?.pet_id) {
            try {
                const res = await axios.get(`http://localhost:8000/pets/${report.pet_id}/qr`);
                if (res.data?.qr_image_url) {
                    setSelectedQrPreview({
                        url: res.data.qr_image_url,
                        petName: report.pet_name || undefined,
                        hash: res.data.qr_token ? res.data.qr_token.slice(0, 10).toUpperCase() : undefined,
                        ownerName: report.owner_name || undefined,
                        ownerPhone: report.owner_phone || undefined
                    });
                }
            } catch (err) {
                console.error("Failed to load pet QR tag:", err);
                alert("Could not load QR tag for this pet.");
            }
        }
    };
    
    // Escalation Modal state
    const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
    const [endorsementFile, setEndorsementFile] = useState<File | null>(null);
    const [isEscalating, setIsEscalating] = useState(false);
    const [escalationTitle, setEscalationTitle] = useState('');
    const [escalationDescription, setEscalationDescription] = useState('');
    
    // Resolve Modal state
    const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
    const [isResolveLostModalOpen, setIsResolveLostModalOpen] = useState(false);
    
    // Transfer Modal states
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isRejectTransferModalOpen, setIsRejectTransferModalOpen] = useState(false);
    const [isAcceptingTransfer, setIsAcceptingTransfer] = useState(false);
    const [isCancellingTransfer, setIsCancellingTransfer] = useState(false);

    // Warning Modal state
    const [isWarningModalOpen, setIsWarningModalOpen] = useState(false);
    const [warningOwnerId, setWarningOwnerId] = useState<string>('');
    const [warningTier, setWarningTier] = useState('Notice');
    const [warningViolation, setWarningViolation] = useState('Free-Roaming Unleashed');
    const [warningDescription, setWarningDescription] = useState('');
    const [isIssuingWarning, setIsIssuingWarning] = useState(false);
    const [warningEvidence, setWarningEvidence] = useState(true);
    const [priorWarnings, setPriorWarnings] = useState<any[]>([]);
    const [isLoadingPriorWarnings, setIsLoadingPriorWarnings] = useState(false);

    const openIssueWarningModal = async () => {
        if (!report) return;

        let targetUserId = report.owner_id;
        let targetOwnerName = report.owner_name;

        if (!targetUserId) {
            if (report.is_owner_report) {
                targetUserId = report.user_id;
                targetOwnerName = report.reporter_name;
            } else {
                alert('Cannot issue warning. The owner of this animal has not been identified or matched yet.');
                return;
            }
        }

        setWarningOwnerId(targetOwnerName || `User #${targetUserId}`);
        setIsWarningModalOpen(true);
        setIsLoadingPriorWarnings(true);
        try {
            let res;
            if (report.pet_id) {
                res = await api.get(`/warnings/pet/${report.pet_id}`);
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
    
    // Image gallery state
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : 1;

    // Handler Workflow States
    const [isTakeoverModalOpen, setIsTakeoverModalOpen] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [isUnclaiming, setIsUnclaiming] = useState(false);

    // Chat Drawer state
    const [isChatOpen, setIsChatOpen] = useState(false);
    const chatCount = useReportChatCount(report?.report_id || 0, currentUserId);

    // Comments & Replies state
    const [commentInput, setCommentInput] = useState('');
    const [replyingTo, setReplyingTo] = useState<{ commentId: number, userName: string } | null>(null);
    const [expandedComments, setExpandedComments] = useState(false);

    // Reverse geocoding address state
    const [viewReportAddress, setViewReportAddress] = useState('');
    const [isViewReportAddressLoading, setIsViewReportAddressLoading] = useState(false);

    // Navigation state
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'brgy' | 'current'>('brgy');
    const [selectedQrPreview, setSelectedQrPreview] = useState<{ url: string; petName?: string; hash?: string; ownerName?: string; ownerPhone?: string } | null>(null);
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const BRGY_OFFICE: [number, number] = [14.8069, 121.0039]; // R243+QH Santa Maria, Bulacan

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

    const fetchReportDetails = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const response = await axios.get(`http://localhost:8000/reports/${id}`);
            if (response.data) {
                setReport(response.data);
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

    useEffect(() => {
        fetchReportDetails();
    }, [id]);

    useEffect(() => {
        if (searchParams.get('openChat') === 'true' || (location.state as any)?.openChat) {
            setIsChatOpen(true);
        }
    }, [searchParams, location]);

    useEffect(() => {
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
    }, [report]);

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

    const handleAddComment = async () => {
        if (!report || !commentInput.trim()) return;

        try {
            const parentId = replyingTo?.commentId || null;
            await axios.post(`http://localhost:8000/reports/${report.report_id}/comments`, {
                comment: commentInput.trim(),
                user_id: currentUserId,
                parent_comment_id: parentId
            });

            setCommentInput('');
            setReplyingTo(null);
            fetchReportDetails(); // Refresh report data to load new comments
        } catch (error) {
            console.error('Error adding comment:', error);
            alert('Failed to post comment.');
        }
    };

    const handleEscalate = async () => {
        if (!report || !endorsementFile) {
            alert('Please select an endorsement letter file.');
            return;
        }

        try {
            setIsEscalating(true);

            // 1. Upload the letter
            const formData = new FormData();
            formData.append('file', endorsementFile);
            formData.append('is_evidence', 'true');
            await axios.post(`http://localhost:8000/reports/${report.report_id}/media`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            // 2. Update status to Forwarded (4)
            await axios.patch(`http://localhost:8000/reports/${report.report_id}/status`, {
                status_id: 4,
                user_id: currentUserId,
                remarks: "Report forwarded to Barangay Operations for official review and approval."
            });

            // 3. Create official Rescue Request record
            await axios.post('http://localhost:8000/rescue-requests/', {
                report_id: report.report_id,
                leader_id: currentUserId,
                title: escalationTitle || `Endorsement for Report #${report.report_id}`,
                description: escalationDescription || 'No notes provided.',
                status_id: 1 // Pending
            });

            setIsEscalateModalOpen(false);
            setEndorsementFile(null);
            setEscalationTitle('');
            setEscalationDescription('');
            setShowSuccess(true);
            fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error escalating report:', error);
            alert('Failed to escalate report. Please try again.');
        } finally {
            setIsEscalating(false);
        }
    };


    const handleIssueWarning = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!report) return;
        setIsIssuingWarning(true);
        try {
            let targetUserId = report.owner_id;
            if (!targetUserId && report.is_owner_report) {
                targetUserId = report.user_id;
            }
            if (!targetUserId) {
                throw new Error("Cannot issue warning: The owner of this animal has not been identified.");
            }

            await api.post('/warnings/', {
                user_id: targetUserId,
                pet_id: report.pet_id || null,
                report_id: report.report_id,
                warning_level: warningTier,
                violation_type: warningViolation,
                description: warningDescription,
                fine_amount: 0.0
            });
            setIsWarningModalOpen(false);
            setWarningDescription('');
            alert('Warning Citation Issued Successfully!');
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error: any) {
            console.error('Error issuing warning:', error);
            alert(error.response?.data?.detail || 'Failed to issue warning. Please try again.');
        } finally {
            setIsIssuingWarning(false);
        }
    };

    const handleReject = async () => {
        if (!report) return;
        if (window.confirm('Are you sure you want to reject this incident report?')) {
            try {
                await axios.patch(`http://localhost:8000/reports/${report.report_id}/status`, {
                    status_id: 3,
                    user_id: currentUserId,
                    remarks: "Report rejected based on Subdivision Leader verification criteria."
                });
                navigate('/subd/reports');
            } catch (error) {
                console.error('Error rejecting report:', error);
                alert('Failed to reject report.');
            }
        }
    };

    const handleMarkFalseAlarm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!report) return;
        try {
            setIsSubmittingFalseAlarm(true);
            await axios.post(`http://localhost:8000/reports/${report.report_id}/mark-false-alarm`, {
                user_id: currentUserId,
                reason: falseAlarmReason,
                notes: falseAlarmNotes
            });
            setIsFalseAlarmModalOpen(false);
            setFalseAlarmNotes('');
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error: any) {
            console.error('Error dismissing report as false alarm:', error);
            alert(error.response?.data?.detail || 'Failed to dismiss report.');
        } finally {
            setIsSubmittingFalseAlarm(false);
        }
    };

    const handleVerifyIncident = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!report) return;
        try {
            setIsSubmittingVerify(true);
            await axios.post(`http://localhost:8000/reports/${report.report_id}/verify-incident`, {
                user_id: currentUserId,
                notes: verifyNotes,
                behavior_finding: verifyBehaviorFinding,
                verified_actual_bite: verifyActualBite,
                verified_chasing: verifyChasing,
                verified_attempted_bite: verifyAttemptedBite,
                verified_injury: verifyInjury,
                verified_aggressive: verifyAggressive
            });
            setIsVerifyModalOpen(false);
            setVerifyNotes('');
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error: any) {
            console.error('Error verifying incident report:', error);
            alert(error.response?.data?.detail || 'Failed to verify report.');
        } finally {
            setIsSubmittingVerify(false);
        }
    };

    const handleReviewDispute = async (disputeId: number, status: 'Accepted' | 'Rejected') => {
        if (!report) return;
        const confirmMsg = status === 'Accepted'
            ? 'Are you sure you want to ACCEPT this dispute? This will clear the pet and dismiss the report as a false alarm.'
            : 'Are you sure you want to REJECT this dispute and resume active investigation?';
        if (!window.confirm(confirmMsg)) return;

        try {
            setIsReviewingDispute(true);
            await axios.patch(`http://localhost:8000/reports/${report.report_id}/disputes/${disputeId}/review`, {
                reviewer_id: currentUserId,
                status: status,
                reviewer_notes: disputeReviewNotes || (status === 'Accepted' ? 'Vaccination and pet ownership verified.' : 'Evidence insufficient.')
            });
            setReviewingDisputeId(null);
            setDisputeReviewNotes('');
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error: any) {
            console.error('Error reviewing dispute:', error);
            alert(error.response?.data?.detail || 'Failed to review dispute.');
        } finally {
            setIsReviewingDispute(false);
        }
    };

    const handleClaimReport = async () => {
        if (!report) return;
        try {
            setIsClaiming(true);
            await axios.post(`http://localhost:8000/reports/${report.report_id}/claim`, {
                user_id: currentUserId
            });
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error claiming report:', err);
            const msg = err.response?.data?.detail || 'Failed to claim report. Please try again.';
            alert(msg);
            fetchReportDetails();
        } finally {
            setIsClaiming(false);
        }
    };

    const handleUnclaimReport = async () => {
        if (!report) return;
        if (!window.confirm('Are you sure you want to release this report back to the unassigned queue?')) return;
        try {
            setIsUnclaiming(true);
            await axios.post(`http://localhost:8000/reports/${report.report_id}/unclaim`, {
                user_id: currentUserId
            });
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error releasing report:', err);
            alert(err.response?.data?.detail || 'Failed to release report.');
        } finally {
            setIsUnclaiming(false);
        }
    };

    const handleAcceptTransfer = async () => {
        if (!report) return;
        try {
            setIsAcceptingTransfer(true);
            await api.post(`/reports/${report.report_id}/transfer/accept`, {
                user_id: currentUserId
            });
            setShowSuccess(true);
            await fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err: any) {
            console.error('Error accepting transfer:', err);
            alert(err.response?.data?.detail || 'Failed to accept transfer.');
        } finally {
            setIsAcceptingTransfer(false);
        }
    };

    const handleCancelTransfer = async () => {
        if (!report) return;
        if (!window.confirm('Are you sure you want to withdraw this case transfer request?')) return;
        try {
            setIsCancellingTransfer(true);
            await api.post(`/reports/${report.report_id}/transfer/cancel`, {
                user_id: currentUserId
            });
            await fetchReportDetails();
        } catch (err: any) {
            console.error('Error cancelling transfer:', err);
            alert(err.response?.data?.detail || 'Failed to cancel transfer request.');
        } finally {
            setIsCancellingTransfer(false);
        }
    };

    const formatCooldownTimer = (seconds?: number): string => {
        if (!seconds || seconds <= 0) return '0m';
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        if (hrs > 0) return `${hrs}h ${mins}m`;
        return `${mins}m`;
    };

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

    const getEffectivePriority = (rep: any): string => {
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



    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar
                    leftContent={
                        <div className="flex items-center gap-4">
                            <Link to="/subd/reports" className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </Link>
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Report Detail View</h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">View and manage the details of Report #{id}</p>
                            </div>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">
                        {loading ? (
                            <div className="py-32 flex flex-col items-center justify-center gap-4">
                                <div className="w-12 h-12 border-4 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading Report details...</p>
                            </div>
                        ) : !report ? (
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 p-20 text-center shadow-sm">
                                <span className="text-5xl block mb-4">⚠️</span>
                                <h3 className="text-gray-900 font-black uppercase text-sm tracking-wider">Report Not Found</h3>
                                <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">The report ID you are trying to view does not exist or has been deleted.</p>
                                <Link to="/subd/reports" className="inline-block mt-6 px-6 py-3 bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md">
                                    Go Back to Reports
                                </Link>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                                {/* LEFT COLUMN: Main Report Card */}
                                <div className="lg:col-span-2 space-y-8 bg-white p-8 sm:p-10 rounded-[2.5rem] border border-gray-100 shadow-sm">
                                {/* INCOMING TRANSFER REQUEST: CURRENT USER IS RECIPIENT */}
                                {report.pending_transfer_to_id === currentUserId && ![11, 12, 14, 3].includes(report.status_id) && (
                                    <div className="p-6 rounded-3xl bg-gradient-to-r from-orange-500/15 via-amber-500/10 to-orange-500/15 border-2 border-orange-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 shadow-lg shadow-orange-500/10 animate-in slide-in-from-top duration-300">
                                        <div className="flex items-start gap-4">
                                            <div className="w-12 h-12 rounded-2xl bg-[#F97316] text-white flex items-center justify-center text-2xl font-black shadow-md shadow-orange-500/30 shrink-0">
                                                📨
                                            </div>
                                            <div className="space-y-1">
                                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide flex items-center gap-2">
                                                    Case Handover Request For You
                                                    <span className="px-2.5 py-0.5 rounded-full bg-[#F97316] text-white text-[9px] font-black uppercase tracking-wider animate-pulse">Action Required</span>
                                                </h4>
                                                <p className="text-xs text-gray-700 font-semibold">
                                                    <strong className="text-orange-950 font-black">{report.pending_transfer_from_name || 'An officer'}</strong> has requested to transfer Report #{report.report_id} to you.
                                                </p>
                                                {report.pending_transfer_notes && (
                                                    <div className="mt-2 p-2.5 rounded-xl bg-white/90 border border-orange-200 text-xs text-gray-800 font-medium">
                                                        💬 <span className="text-gray-500 font-bold">Handover Note:</span> "{report.pending_transfer_notes}"
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0">
                                            <button
                                                type="button"
                                                onClick={handleAcceptTransfer}
                                                disabled={isAcceptingTransfer}
                                                className="flex-1 sm:flex-none px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-600/20 transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                                            >
                                                {isAcceptingTransfer ? 'Accepting...' : '✓ Accept Case'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsRejectTransferModalOpen(true)}
                                                className="flex-1 sm:flex-none px-5 py-3 rounded-2xl bg-white hover:bg-red-50 text-red-600 border border-red-200 font-black text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                            >
                                                ✕ Decline
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* PENDING TRANSFER REQUEST: CURRENT USER WAITING FOR RECIPIENT */}
                                {report.pending_transfer_from_id === currentUserId && report.pending_transfer_to_id && ![11, 12, 14, 3].includes(report.status_id) && (
                                    <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
                                        <div className="flex items-center gap-3.5">
                                            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl font-black shadow-md shadow-amber-500/20 shrink-0">
                                                ⏳
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest flex items-center gap-2">
                                                    Case Transfer Pending Acceptance
                                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                                                </h4>
                                                <p className="text-xs text-amber-800 font-semibold mt-0.5">
                                                    Transfer requested to <strong className="font-bold text-amber-950">{report.pending_transfer_to_name || 'Officer'}</strong>. You remain responsible for this report until they accept.
                                                </p>
                                                {report.pending_transfer_notes && (
                                                    <p className="text-[11px] text-amber-700 italic mt-1 font-medium">💬 Note: "{report.pending_transfer_notes}"</p>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleCancelTransfer}
                                            disabled={isCancellingTransfer}
                                            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 font-black text-[11px] uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shrink-0"
                                        >
                                            {isCancellingTransfer ? 'Cancelling...' : 'Cancel Request'}
                                        </button>
                                    </div>
                                )}

                                {/* Case Handler Ownership Banner */}
                                {!report.assigned_leader_id ? (
                                    <div className="p-5 rounded-3xl bg-amber-500/10 border border-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3.5">
                                            <div className="w-11 h-11 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl font-black shadow-md shadow-amber-500/20 shrink-0">
                                                ⚠️
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest flex items-center gap-2">
                                                    Report is Unassigned
                                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                                                </h4>
                                                <p className="text-xs text-amber-800 font-semibold mt-0.5">
                                                    No officer has claimed this case yet. Claiming will assign you as the primary handler.
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleClaimReport}
                                            disabled={isClaiming}
                                            className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#F97316] hover:bg-[#EA580C] text-white font-black text-xs uppercase tracking-wider shadow-md shadow-orange-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shrink-0"
                                        >
                                            {isClaiming ? (
                                                <>
                                                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                                                    <span>Claiming...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span>🛡️ Claim This Report</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                ) : report.assigned_leader_id === currentUserId ? (
                                    <div className="p-5 rounded-3xl bg-emerald-500/10 border border-emerald-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-3.5">
                                            <div className="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-emerald-600/20 shrink-0">
                                                🛡️
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-emerald-950 uppercase tracking-widest flex items-center gap-2">
                                                    You are handling this case
                                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                                </h4>
                                                <p className="text-xs text-emerald-800 font-semibold mt-0.5">
                                                    {report.claimed_at ? (
                                                        <>Claimed <RelativeTimestamp date={report.claimed_at} /> — All investigation & status controls are active.</>
                                                    ) : (
                                                        <>You are the designated handler for this incident report.</>
                                                    )}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleUnclaimReport}
                                            disabled={isUnclaiming}
                                            className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-black text-[11px] uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer shrink-0"
                                        >
                                            {isUnclaiming ? 'Releasing...' : 'Release / Unclaim'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className={`p-5 rounded-3xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                                        report.is_takeover_eligible
                                            ? 'bg-amber-500/10 border-amber-300'
                                            : 'bg-blue-500/10 border-blue-300'
                                    }`}>
                                        <div className="flex items-center gap-3.5">
                                            <div className={`w-11 h-11 rounded-2xl text-white flex items-center justify-center text-xl font-black shadow-md shrink-0 ${
                                                report.is_takeover_eligible
                                                    ? 'bg-amber-600 shadow-amber-600/20'
                                                    : 'bg-blue-600 shadow-blue-600/20'
                                            }`}>
                                                {report.is_takeover_eligible ? '⚠️' : '👤'}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h4 className={`text-xs font-black uppercase tracking-widest ${
                                                        report.is_takeover_eligible ? 'text-amber-950' : 'text-blue-950'
                                                    }`}>
                                                        Handled by {report.assigned_leader_name || `Officer #${report.assigned_leader_id}`}
                                                    </h4>
                                                    {report.is_takeover_eligible ? (
                                                        <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white font-black text-[9px] uppercase tracking-wider shadow-xs animate-pulse">
                                                            ⚠️ Inactive / Stalled ({report.takeover_inactivity_hours_threshold || 24}h No Progress)
                                                        </span>
                                                    ) : (
                                                        <span className="px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[9px] uppercase tracking-wider border border-blue-200">
                                                            Active Response Window
                                                        </span>
                                                    )}
                                                </div>
                                                <p className={`text-xs font-semibold mt-0.5 ${
                                                    report.is_takeover_eligible ? 'text-amber-800' : 'text-blue-800'
                                                }`}>
                                                    {report.claimed_at ? (
                                                        <>Primary handler since <RelativeTimestamp date={report.claimed_at} />. Actions are reserved for the current handler.</>
                                                    ) : (
                                                        <>Assigned to another subdivision officer.</>
                                                    )}
                                                </p>
                                                {!report.is_takeover_eligible && (report.takeover_cooldown_remaining_seconds || 0) > 0 && (
                                                    <p className="text-[11px] font-bold text-blue-600/90 mt-1 flex items-center gap-1">
                                                        <span>🔒</span>
                                                        <span>Takeover unlocks in <strong>{formatCooldownTimer(report.takeover_cooldown_remaining_seconds)}</strong> if no progress is made.</span>
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Takeover Control */}
                                        {report.is_takeover_eligible || currentUser?.role_id === 4 ? (
                                            <button
                                                type="button"
                                                onClick={() => setIsTakeoverModalOpen(true)}
                                                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs uppercase tracking-wider shadow-md shadow-amber-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 animate-in zoom-in-95 hover:scale-105 active:scale-95"
                                            >
                                                <span>🔄 Take Over Report</span>
                                                {currentUser?.role_id === 4 && !report.is_takeover_eligible && (
                                                    <span className="text-[9px] bg-amber-700/50 px-1.5 py-0.5 rounded text-white font-normal">Admin Override</span>
                                                )}
                                            </button>
                                        ) : (
                                            <div className="w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-gray-100 border border-gray-200 text-gray-400 font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-not-allowed opacity-80 shrink-0" title="Takeover is locked while the assigned officer is within the active response period.">
                                                <span>🔒 Takeover Locked ({formatCooldownTimer(report.takeover_cooldown_remaining_seconds)})</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Status Alert Banners: False Alarm / Disputed / Verified */}
                                {report.status_id === 14 || report.verification_status === 'false_alarm' ? (
                                    <div className="p-5 rounded-3xl bg-rose-500/10 border border-rose-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in duration-300">
                                        <div className="flex items-start sm:items-center gap-3.5">
                                            <div className="w-11 h-11 rounded-2xl bg-rose-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-rose-600/20 shrink-0">
                                                🚫
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-xs font-black text-rose-950 uppercase tracking-widest">
                                                        Dismissed as False Alarm
                                                    </h4>
                                                    {report.false_alarm_reason && (
                                                        <span className="px-2 py-0.5 bg-rose-200/80 text-rose-900 rounded-md text-[9px] font-black uppercase">
                                                            {report.false_alarm_reason}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-rose-900/90 font-medium mt-1 leading-relaxed">
                                                    {report.verification_notes || 'Investigation concluded that this report was inaccurate, exaggerated, or invalid.'}
                                                </p>
                                                {report.verified_by_name && (
                                                    <p className="text-[10px] text-rose-700 font-bold mt-1">
                                                        Verified by: {report.verified_by_name} {report.verified_at ? `• ${new Date(report.verified_at).toLocaleDateString()}` : ''}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : report.status_id === 15 || report.verification_status === 'disputed' ? (
                                    <div className="p-5 rounded-3xl bg-amber-500/15 border-2 border-amber-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-pulse">
                                        <div className="flex items-start sm:items-center gap-3.5">
                                            <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center text-xl font-black shadow-md shadow-amber-600/20 shrink-0">
                                                ⚖️
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-xs font-black text-amber-950 uppercase tracking-widest">
                                                        Report Formally Disputed by Pet Owner
                                                    </h4>
                                                    <span className="px-2 py-0.5 bg-amber-300 text-amber-950 rounded-md text-[9px] font-black uppercase">
                                                        Action Paused
                                                    </span>
                                                </div>
                                                <p className="text-xs text-amber-900 font-medium mt-1 leading-relaxed">
                                                    A registered resident pet owner has submitted a counter-claim with proof of anti-rabies vaccination and home confinement. Review the dispute below before proceeding.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ) : report.verification_status === 'verified_true' ? (
                                    <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center text-sm font-black shrink-0">
                                            ✓
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-xs font-black text-emerald-900 uppercase">
                                                Officially Verified Incident
                                            </p>
                                            <p className="text-[11px] text-emerald-700 font-medium">
                                                {report.verification_notes || 'Confirmed via field inspection and witness check.'} {report.verified_by_name ? `(by ${report.verified_by_name})` : ''}
                                            </p>
                                        </div>
                                    </div>
                                ) : null}

                                {/* Header Info */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200 shadow-xs shrink-0 bg-gray-100 flex items-center justify-center">
                                            {report.reporter_photo ? (
                                                <img
                                                    src={getProfilePicture(report.reporter_photo)}
                                                    alt={report.reporter_name || 'Reporter'}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        e.currentTarget.src = DEFAULT_AVATAR;
                                                    }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-lg text-gray-500 font-bold bg-orange-50 text-[#F97316]">
                                                    {(report.reporter_name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900">{report.reporter_name || `User ${report.user_id}`}</h4>
                                            <p className="text-xs text-gray-500"><RelativeTimestamp date={report.created_at} /></p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsChatOpen(true)}
                                            className="px-4 py-1.5 bg-orange-50 hover:bg-orange-100 text-[#F97316] border border-orange-200 rounded-full text-xs font-bold transition-all shadow-2xs hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                                            title="Open Case Chat with Reporter"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                            </svg>
                                            <span>Message {chatCount > 0 ? `(${chatCount})` : ''}</span>
                                        </button>
                                        <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${getReportStatusBadgeStyle(report.status_id)}`}>
                                            {getReportStatusLabel(report.status_id)}
                                        </span>
                                    </div>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                    <div>
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Category</span>
                                        <span className="text-sm font-semibold text-gray-900">{categoryMap[report.category_id] || 'Other'}</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Priority</span>
                                        <span className={`text-sm font-bold ${getPriorityColor(getEffectivePriority(report)).replace('bg-', 'text-').replace('-50', '-600')}`}>
                                            {getEffectivePriority(report)}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Rescue Status</span>
                                        <span className={`text-sm font-bold ${report.status_id >= 5 ? 'text-blue-600' : 'text-gray-400'}`}>
                                            {report.status_id >= 5 ? statusMap[report.status_id] : 'Not Yet Initiated'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Animals</span>
                                        <span className="text-sm font-semibold text-gray-900">{report.animal_count} observed</span>
                                    </div>
                                    <div>
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Landmark</span>
                                        <span className="text-sm font-semibold text-gray-900">{report.landmark || 'N/A'}</span>
                                    </div>
                                    <div className="col-span-2 md:col-span-4">
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Street / Location</span>
                                        <span className="text-sm font-semibold text-[#F97316]">
                                            {isViewReportAddressLoading ? (
                                                <span className="flex items-center gap-1.5">
                                                    <svg className="animate-spin h-3.5 w-3.5 text-[#F97316]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Resolving street address...
                                                </span>
                                            ) : (
                                                viewReportAddress || `${parseFloat(report.latitude.toString()).toFixed(6)}, ${parseFloat(report.longitude.toString()).toFixed(6)}`
                                            )}
                                        </span>
                                    </div>
                                </div>

                                {/* Lost Pet Owner Contact & Digital QR Tag Panel */}
                                {(report.pet_id || report.owner_name || (report.description && report.description.includes('[LOST PET REPORT]'))) && (
                                    <div className="p-6 rounded-3xl bg-gradient-to-br from-amber-50/90 to-orange-50/70 border-2 border-amber-200 shadow-sm space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`px-3 py-1 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm ${
                                                    report.owner_name ? 'bg-amber-600' : 'bg-emerald-600'
                                                }`}>
                                                    <span>🐾</span>
                                                    <span>{report.owner_name ? 'Registered Pet Case' : 'Registered Community Animal Record'}</span>
                                                </span>
                                                {report.pet_name && (
                                                    <span className="text-sm font-black text-amber-950 uppercase">
                                                        {report.pet_name}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {report.pet_id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenPetDetail(report.pet_id)}
                                                        disabled={isLoadingPetDetail}
                                                        className="px-3 py-1 bg-gradient-to-r from-amber-600 to-[#B35D25] hover:from-amber-700 hover:to-[#964E1F] text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm hover:shadow transition-all cursor-pointer"
                                                    >
                                                        {isLoadingPetDetail ? (
                                                            <span className="animate-spin text-xs">⏳</span>
                                                        ) : (
                                                            <span>🐾 View Animal Record</span>
                                                        )}
                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                        </svg>
                                                    </button>
                                                )}
                                                {report.pet_qr_code_hash && (
                                                    <span className="text-[10px] font-mono font-bold text-amber-900 bg-white/90 px-2.5 py-1 rounded-lg border border-amber-200 shadow-xs">
                                                        Tag: {report.pet_qr_code_hash}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                            <div className="bg-white/90 p-4 rounded-2xl border border-amber-100 shadow-xs">
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Registered Owner</p>
                                                <p className="text-sm font-black text-gray-900">
                                                    {report.owner_name ? report.owner_name : <span className="text-gray-500 font-bold italic">No Registered Owner (Community / Unassigned)</span>}
                                                </p>
                                                {report.owner_address && (
                                                    <p className="text-xs text-gray-500 font-medium mt-1">{report.owner_address}</p>
                                                )}
                                                {report.owner_email && (
                                                    <p className="text-[11px] text-amber-800 font-semibold mt-0.5">{report.owner_email}</p>
                                                )}
                                            </div>

                                            <div className="bg-white/90 p-4 rounded-2xl border border-amber-100 shadow-xs flex flex-col justify-between">
                                                <div>
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Owner Contact Hotline</p>
                                                    <p className="text-sm font-black text-amber-900">
                                                        {report.owner_phone ? report.owner_phone : <span className="text-gray-400 font-semibold text-xs italic">No Owner Hotline (Unassigned Animal)</span>}
                                                    </p>
                                                </div>
                                                {report.owner_phone && (
                                                    <a
                                                        href={`tel:${report.owner_phone}`}
                                                        className="mt-3 inline-flex items-center justify-center gap-2 w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                                    >
                                                        📞 Call Pet Owner
                                                    </a>
                                                )}
                                            </div>
                                        </div>

                                        {(report.pet_qr_code_url || report.pet_id) && (
                                            <div className="pt-2 flex items-center justify-between bg-white p-4 rounded-2xl border border-amber-200 gap-4 shadow-xs">
                                                <div className="flex items-center gap-3.5">
                                                    {report.pet_qr_code_url ? (
                                                        <img 
                                                            src={report.pet_qr_code_url} 
                                                            alt="Pet QR Tag" 
                                                            className="w-14 h-14 rounded-xl object-contain bg-white border border-gray-200 p-1 cursor-pointer hover:scale-105 transition-transform"
                                                            onClick={handleOpenQrTag}
                                                        />
                                                    ) : (
                                                        <div 
                                                            onClick={handleOpenQrTag}
                                                            className="w-14 h-14 rounded-xl bg-amber-100 flex items-center justify-center text-2xl cursor-pointer hover:scale-105 transition-transform border border-amber-200"
                                                        >
                                                            🐾
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-xs font-black text-gray-900 uppercase">Pet StraySafe QR Tag</p>
                                                        <p className="text-[11px] text-gray-500 font-medium">Click or scan tag to verify animal registration</p>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={handleOpenQrTag}
                                                    className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 cursor-pointer"
                                                >
                                                    View Tag ↗
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* AI Suggestion Panel */}
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
                                    verifiedByName={report.verified_by_name}
                                    verifiedAt={report.verified_at ? String(report.verified_at) : null}
                                />

                                {/* AI Potential Matches Review Section */}
                                <div className="mt-4">
                                    <AIPotentialMatchesList
                                        reportId={report.report_id}
                                        isStaff={true}
                                        onMatchesUpdated={fetchReportDetails}
                                    />
                                </div>

                                {/* Pet Owner Formal Dispute Review Panel */}
                                {report.disputes && report.disputes.length > 0 && (
                                    <div className="bg-amber-50/50 border-2 border-amber-200 rounded-3xl p-6 sm:p-7 space-y-5 shadow-xs">
                                        <div className="flex items-center justify-between border-b border-amber-200/80 pb-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center text-xl font-black shadow-sm">
                                                    ⚖️
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-black text-amber-950 uppercase tracking-tight">
                                                        Citizen Pet Disputes & Counter-Claims ({report.disputes.length})
                                                    </h4>
                                                    <p className="text-xs text-amber-800 font-medium">
                                                        Review resident vaccination proofs and home confinement evidence to prevent false impoundment.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            {report.disputes.map((dispute) => (
                                                <div key={dispute.dispute_id} className="bg-white p-5 rounded-2xl border border-amber-100 shadow-xs space-y-4">
                                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-3">
                                                        <div>
                                                            <span className="text-xs font-black text-gray-900 uppercase">
                                                                Dispute by {dispute.resident_name || `Resident #${dispute.resident_user_id}`}
                                                            </span>
                                                            {dispute.pet_name && (
                                                                <span className="ml-2 text-xs font-bold text-amber-700">
                                                                    (Pet: {dispute.pet_name})
                                                                </span>
                                                            )}
                                                            <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                                                Submitted <RelativeTimestamp date={dispute.created_at} />
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                                dispute.status === 'Accepted'
                                                                    ? 'bg-emerald-100 text-emerald-800'
                                                                    : dispute.status === 'Rejected'
                                                                    ? 'bg-rose-100 text-rose-800'
                                                                    : 'bg-amber-100 text-amber-800 animate-pulse'
                                                            }`}>
                                                                {dispute.status}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                                            Owner Explanation & Statement:
                                                        </p>
                                                        <p className="text-xs font-semibold text-gray-800 leading-relaxed bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                                                            "{dispute.dispute_reason}"
                                                        </p>
                                                    </div>

                                                    {/* Evidence Attachments */}
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                                        {dispute.vaccination_card_url && (
                                                            <a
                                                                href={dispute.vaccination_card_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-3 p-3 bg-blue-50/50 hover:bg-blue-50 border border-blue-100 rounded-xl transition-all group"
                                                            >
                                                                <span className="text-2xl">💉</span>
                                                                <div className="overflow-hidden">
                                                                    <p className="text-[11px] font-black text-blue-900 uppercase tracking-wider group-hover:text-blue-700">
                                                                        Anti-Rabies Card
                                                                    </p>
                                                                    <p className="text-[10px] text-blue-600 truncate">Click to inspect certificate ↗</p>
                                                                </div>
                                                            </a>
                                                        )}

                                                        {dispute.supporting_photo_url && (
                                                            <a
                                                                href={dispute.supporting_photo_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center gap-3 p-3 bg-emerald-50/50 hover:bg-emerald-50 border border-emerald-100 rounded-xl transition-all group"
                                                            >
                                                                <span className="text-2xl">📸</span>
                                                                <div className="overflow-hidden">
                                                                    <p className="text-[11px] font-black text-emerald-900 uppercase tracking-wider group-hover:text-emerald-700">
                                                                        Home Confinement Photo
                                                                    </p>
                                                                    <p className="text-[10px] text-emerald-600 truncate">Click to inspect photo ↗</p>
                                                                </div>
                                                            </a>
                                                        )}
                                                    </div>

                                                    {/* Review Form if Pending */}
                                                    {dispute.status === 'Pending' && (
                                                        <div className="pt-3 border-t border-gray-100 space-y-3">
                                                            {reviewingDisputeId === dispute.dispute_id ? (
                                                                <div className="space-y-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                                                                    <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest block">
                                                                        Investigation Review Notes:
                                                                    </label>
                                                                    <textarea
                                                                        rows={2}
                                                                        value={disputeReviewNotes}
                                                                        onChange={(e) => setDisputeReviewNotes(e.target.value)}
                                                                        placeholder="State your findings regarding this vaccination/ownership proof..."
                                                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs outline-none focus:border-amber-500"
                                                                    />
                                                                    <div className="flex gap-2">
                                                                        <button
                                                                            type="button"
                                                                            disabled={isReviewingDispute}
                                                                            onClick={() => handleReviewDispute(dispute.dispute_id, 'Accepted')}
                                                                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                                                                        >
                                                                            {isReviewingDispute ? 'Processing...' : '✓ Accept Dispute & Clear Pet'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            disabled={isReviewingDispute}
                                                                            onClick={() => handleReviewDispute(dispute.dispute_id, 'Rejected')}
                                                                            className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50 cursor-pointer"
                                                                        >
                                                                            {isReviewingDispute ? 'Processing...' : '✕ Reject Dispute'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => { setReviewingDisputeId(null); setDisputeReviewNotes(''); }}
                                                                            className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-xl text-xs font-bold cursor-pointer"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setReviewingDisputeId(dispute.dispute_id)}
                                                                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
                                                                >
                                                                    🔍 Review & Resolve This Dispute
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}

                                                    {dispute.reviewer_notes && (
                                                        <div className="text-[11px] text-gray-600 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                                            <strong className="text-gray-900 font-bold">Reviewer Decision Notes: </strong>
                                                            {dispute.reviewer_notes} {dispute.reviewer_name ? `(by ${dispute.reviewer_name})` : ''}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Map Location */}
                                <div>
                                    <div className="flex justify-between items-center mb-3">
                                        <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Incident Location Map</h5>
                                        <button
                                            onClick={() => setIsMapExpanded(true)}
                                            className="px-3.5 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl text-[10px] font-bold border border-gray-200 transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h3a1 1 0 010 2H5v2a1 1 0 01-2 0V4zm14 0a1 1 0 00-1-1h-3a1 1 0 110 2h2v2a1 1 0 112 0V4zM3 16a1 1 0 001 1h3a1 1 0 100-2H5v-2a1 1 0 10-2 0v3zm14 0a1 1 0 01-1 1h-3a1 1 0 100-2h2v-2a1 1 0 102 0v3z" />
                                            </svg>
                                            Expand Map
                                        </button>
                                    </div>
                                    <div className="w-full h-64 rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-gray-50">
                                        <MapComponent
                                            center={[report.latitude, report.longitude]}
                                            zoom={17}
                                            showHeatmap={false}
                                            markers={[
                                                {
                                                    id: report.report_id,
                                                    lat: report.latitude,
                                                    lng: report.longitude,
                                                    title: report.landmark || 'Incident Location',
                                                    category: categoryMap[report.category_id],
                                                    priority: report.priority_level
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
                                            routing={isNavigating ? (() => {
                                                const repLoc: [number, number] = [report.latitude, report.longitude];
                                                const destName = report.landmark || 'Incident Location';
                                                if (navSource === 'current' && userLocation) {
                                                    return {
                                                        start: userLocation,
                                                        end: repLoc,
                                                        waypointNames: ["Your Location", destName] as [string, string],
                                                        onClose: () => setIsNavigating(false)
                                                    };
                                                } else {
                                                    return {
                                                        start: BRGY_OFFICE,
                                                        end: repLoc,
                                                        waypointNames: ["Barangay Office", destName] as [string, string],
                                                        onClose: () => setIsNavigating(false)
                                                    };
                                                }
                                            })() : undefined}
                                            onMarkerClick={(m) => {
                                                setNavSource(m.source || 'brgy');
                                                setIsNavigating(true);
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Description */}
                                <div>
                                    <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Description</h5>
                                    <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
                                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{report.description || 'No description provided.'}</p>
                                    </div>
                                </div>

                                {/* Official Letter Section */}
                                {report.status_id >= 4 && report.media?.some(m => m.media_type === 'Document' || m.file_url.toLowerCase().endsWith('.pdf') || m.file_url.toLowerCase().endsWith('.docx')) && (
                                    <div>
                                        <h5 className="text-[11px] font-black text-[#1a1208] uppercase tracking-[0.2em] mb-4">Official Subdivision Letter</h5>
                                        <div className="bg-orange-50/50 border border-orange-100 rounded-3xl p-6 flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-lg">
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
                                                    const letter = report.media?.find(m => m.media_type === 'Document' || m.file_url.toLowerCase().endsWith('.pdf') || m.file_url.toLowerCase().endsWith('.docx'));
                                                    if (letter) setActiveGallery({ media: [letter], index: 0 });
                                                }}
                                                className="px-6 py-2.5 bg-white border border-orange-200 text-orange-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-600 hover:text-white transition-all shadow-sm"
                                            >
                                                View Letter
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Media Gallery */}
                                {report.media && report.media.filter(m => {
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
                                                    {report.media.filter(m => {
                                                        const url = m.file_url.toLowerCase();
                                                        return m.media_type !== 'Document' &&
                                                            !url.endsWith('.pdf') &&
                                                            !url.endsWith('.doc') &&
                                                            !url.endsWith('.docx') &&
                                                            !url.endsWith('.txt');
                                                    }).length} {report.media.filter(m => {
                                                        const url = m.file_url.toLowerCase();
                                                        return m.media_type !== 'Document' &&
                                                            !url.endsWith('.pdf') &&
                                                            !url.endsWith('.doc') &&
                                                            !url.endsWith('.docx') &&
                                                            !url.endsWith('.txt');
                                                    }).length === 1 ? 'File' : 'Files'} Attached
                                                </span>
                                            </div>

                                            <div className={`grid gap-3 ${report.media.filter(m => {
                                                const url = m.file_url.toLowerCase();
                                                return m.media_type !== 'Document' &&
                                                    !url.endsWith('.pdf') &&
                                                    !url.endsWith('.doc') &&
                                                    !url.endsWith('.docx') &&
                                                    !url.endsWith('.txt');
                                            }).length === 1 ? 'grid-cols-1' :
                                                report.media.filter(m => {
                                                    const url = m.file_url.toLowerCase();
                                                    return m.media_type !== 'Document' &&
                                                        !url.endsWith('.pdf') &&
                                                        !url.endsWith('.doc') &&
                                                        !url.endsWith('.docx') &&
                                                        !url.endsWith('.txt');
                                                }).length === 2 ? 'grid-cols-2' :
                                                    'grid-cols-2 sm:grid-cols-3'
                                                }`}>
                                                {report.media.filter(m => {
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
                                                            const filtered = report.media!.filter(m => {
                                                                const url = m.file_url.toLowerCase();
                                                                return m.media_type !== 'Document' &&
                                                                    !url.endsWith('.pdf') &&
                                                                    !url.endsWith('.doc') &&
                                                                    !url.endsWith('.docx') &&
                                                                    !url.endsWith('.txt');
                                                            });
                                                            setActiveGallery({ media: filtered, index: idx });
                                                        }}
                                                        className={`group relative rounded-2xl overflow-hidden bg-gray-100 border border-gray-100 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-xl active:scale-95 ${report.media!.filter(m => {
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
                                <div className="bg-orange-50/50 rounded-2xl p-6 border border-orange-100/50">
                                    <h5 className="text-[11px] font-bold text-[#F97316] uppercase tracking-widest mb-4 flex items-center gap-2">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        AI Insights & Data Assessment
                                    </h5>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100">
                                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Area Risk Level</span>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                                                <span className="text-sm font-bold text-gray-900">High Risk Hotspot</span>
                                            </div>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100">
                                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Duplicate Check</span>
                                            <div className="flex items-center gap-2">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                <span className="text-sm font-bold text-gray-900">Unique Report</span>
                                            </div>
                                        </div>
                                        <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100">
                                            <span className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">AI Classification</span>
                                            <div className="flex items-center gap-1.5">
                                                <span className="px-2 py-0.5 bg-orange-100 text-[#F97316] text-[10px] font-bold rounded-md">{report.ai_animal_type || 'Unknown'}</span>
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${report.ai_suggested_risk_level?.toLowerCase().includes('high') ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>{report.ai_suggested_risk_level || 'Low Risk'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Comments Section */}
                                <div className="bg-white border border-gray-100 rounded-2xl p-6 pt-5 shadow-sm">
                                    {report.comments && report.comments.length > 0 && (
                                        <button
                                            onClick={() => setExpandedComments(prev => !prev)}
                                            className="text-[10px] font-black text-gray-400 hover:text-[#F97316] uppercase tracking-widest transition-colors flex items-center gap-2 mb-6"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform duration-300 ${expandedComments ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                            </svg>
                                            {expandedComments ? 'Hide Comments' : `View all ${report.comments.length} comments`}
                                        </button>
                                    )}

                                    {(expandedComments || !report.comments || report.comments.length === 0) && (
                                        <div className="space-y-2 mb-6 max-h-72 overflow-y-auto custom-scrollbar pr-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                            {report.comments && report.comments.length > 0 ? (
                                                report.comments
                                                    .filter((c: any) => !c.parent_comment_id)
                                                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                                    .map((c: any) => {
                                                        const replies = report.comments
                                                            ?.filter((reply: any) => reply.parent_comment_id === c.comment_id)
                                                            .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) || [];
                                                        return (
                                                            <div key={c.comment_id} className="mb-4 last:mb-0">
                                                                <div className="flex gap-3 relative">
                                                                    <div className="relative flex flex-col items-center shrink-0">
                                                                        <img 
                                                                            src={getProfilePicture(c.user_photo)} 
                                                                            className="w-8 h-8 rounded-full object-cover z-10 ring-4 ring-white border border-gray-100 shadow-sm" 
                                                                            alt={c.user_name || 'User'} 
                                                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                        />
                                                                        {(replies.length > 0 || replyingTo?.commentId === c.comment_id) && (
                                                                            <div className="absolute top-8 bottom-[-16px] left-1/2 -translate-x-1/2 w-[2px] bg-gray-100 z-0"></div>
                                                                        )}
                                                                    </div>

                                                                    <div className="flex-1 pb-1">
                                                                        <div className="bg-[#FAFAF9] rounded-[1.5rem] p-3.5 px-4 border border-gray-50 shadow-sm inline-block">
                                                                            <span className="block text-[11px] font-black text-[#1a1208] mb-0.5">{c.user_name || 'User'}</span>
                                                                            <p className="text-xs font-semibold text-gray-700 leading-relaxed pr-6">{c.comment}</p>
                                                                        </div>
                                                                        <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest"><RelativeTimestamp date={c.created_at} /></span>
                                                                            <button
                                                                                onClick={() => setReplyingTo({ commentId: c.comment_id, userName: c.user_name || 'User' })}
                                                                                className="text-[10px] font-bold text-gray-500 hover:text-[#F97316] transition-colors"
                                                                            >
                                                                                Reply
                                                                            </button>
                                                                        </div>

                                                                        {replies.length > 0 && (
                                                                            <div className="mt-4 space-y-4">
                                                                                {replies.map((reply: any, index: number) => (
                                                                                    <div key={reply.comment_id} className="flex gap-3 relative">
                                                                                        <div className="absolute top-[-10px] left-[-28px] w-[28px] h-[26px] border-b-[2px] border-l-[2px] border-gray-100 rounded-bl-[12px] z-0 pointer-events-none"></div>
                                                                                        {index === replies.length - 1 && replyingTo?.commentId !== c.comment_id && (
                                                                                            <div className="absolute top-[16px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>
                                                                                        )}

                                                                                        <img 
                                                                                            src={getProfilePicture(reply.user_photo)} 
                                                                                            className="w-6 h-6 rounded-full object-cover z-10 mt-1 ring-4 ring-white border border-gray-100 shadow-sm shrink-0" 
                                                                                            alt={reply.user_name || 'User'} 
                                                                                            onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                                        />

                                                                                        <div className="flex-1">
                                                                                            <div className="bg-[#FAFAF9] rounded-[1.2rem] p-3 px-4 border border-gray-50 shadow-sm inline-block">
                                                                                                <span className="block text-[10px] font-black text-gray-800 mb-0.5">{reply.user_name || 'User'}</span>
                                                                                                <p className="text-[11px] font-semibold text-gray-600 leading-relaxed pr-4">{reply.comment}</p>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-4 mt-1.5 ml-3">
                                                                                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest"><RelativeTimestamp date={reply.created_at} /></span>
                                                                                                <button
                                                                                                    onClick={() => setReplyingTo({ commentId: c.comment_id, userName: reply.user_name || 'User' })}
                                                                                                    className="text-[9px] font-bold text-gray-500 hover:text-[#F97316] transition-colors"
                                                                                                >
                                                                                                    Reply
                                                                                                </button>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}

                                                                        {replyingTo?.commentId === c.comment_id && (
                                                                            <div className="mt-4 flex items-center gap-3 relative z-10 animate-in fade-in slide-in-from-top-2 duration-200">
                                                                                <div className="absolute top-[-10px] left-[-28px] w-[28px] h-[24px] border-b-[2px] border-l-[2px] border-gray-100 rounded-bl-[12px] z-0 pointer-events-none"></div>
                                                                                <div className="absolute top-[14px] bottom-[-100px] left-[-30px] w-[6px] bg-white z-0 pointer-events-none"></div>
                                                                                <img 
                                                                                    src={getProfilePicture(currentUser?.profile_picture)} 
                                                                                    className="w-6 h-6 rounded-full object-cover z-10 mt-1 ring-4 ring-white border border-gray-100 shadow-sm shrink-0" 
                                                                                    alt={currentUser?.name || 'User'} 
                                                                                    onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                                                />
                                                                                <div className="flex-1 relative flex items-center">
                                                                                    <input
                                                                                        type="text"
                                                                                        autoFocus
                                                                                        placeholder={`Replying to ${replyingTo?.userName}...`}
                                                                                        className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.2rem] pl-4 pr-10 py-2 text-[11px] font-semibold text-[#1a1208] focus:outline-none focus:border-orange-200 focus:bg-white transition-all placeholder:text-gray-400 shadow-inner"
                                                                                        value={commentInput}
                                                                                        onChange={(e) => setCommentInput(e.target.value)}
                                                                                        onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                                                                                    />
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setReplyingTo(null);
                                                                                            setCommentInput('');
                                                                                        }}
                                                                                        className="absolute right-3 text-gray-400 hover:text-red-500 transition-colors"
                                                                                    >
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                                                                        </svg>
                                                                                    </button>
                                                                                </div>
                                                                                <button
                                                                                    onClick={handleAddComment}
                                                                                    className="bg-[#F97316] text-white rounded-full w-8 h-8 flex items-center justify-center shadow-md shadow-orange-100 hover:scale-105 active:scale-95 transition-all shrink-0"
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

                                    {!replyingTo && (
                                        <div className="flex items-center gap-3 animate-in fade-in duration-200 border-t border-gray-50 pt-4 mt-2">
                                            <div className="flex-1 relative">
                                                <input
                                                    type="text"
                                                    placeholder="Write a comment as Subdivision Leader..."
                                                    className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[1.5rem] pl-5 pr-12 py-3 text-xs font-semibold text-[#1a1208] focus:outline-none focus:border-orange-200 focus:bg-white transition-all placeholder:text-gray-300 shadow-inner"
                                                    value={commentInput}
                                                    onChange={(e) => setCommentInput(e.target.value)}
                                                    onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
                                                />
                                            </div>
                                            <button
                                                onClick={handleAddComment}
                                                className="bg-[#F97316] text-white rounded-[1.2rem] p-3 shadow-md shadow-orange-100 hover:scale-105 active:scale-95 transition-all flex-shrink-0"
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
                                        {/* CASE NOT HANDLED BY CURRENT USER */}
                                        {report.assigned_leader_id && report.assigned_leader_id !== currentUserId && ![11, 12, 14, 3].includes(report.status_id) && (
                                            <div className={`p-5 rounded-2xl border text-center space-y-2.5 ${
                                                report.is_takeover_eligible ? 'bg-amber-50/80 border-amber-300' : 'bg-blue-50/70 border-blue-200'
                                            }`}>
                                                <p className={`text-xs font-bold ${report.is_takeover_eligible ? 'text-amber-950' : 'text-blue-900'}`}>
                                                    🔒 Operational controls are reserved for the assigned case officer (<span className={`font-black ${report.is_takeover_eligible ? 'text-amber-800' : 'text-blue-700'}`}>{report.assigned_leader_name || `Officer #${report.assigned_leader_id}`}</span>).
                                                </p>
                                                {report.is_takeover_eligible ? (
                                                    <p className="text-[11px] text-amber-800 font-semibold">
                                                        ⚠️ This report has had no updates for over {report.takeover_inactivity_hours_threshold || 24} hours. You can take over handling now.
                                                    </p>
                                                ) : (
                                                    <p className="text-[11px] text-blue-700/80 font-medium">
                                                        Officer is within the active response window. Takeover unlocks in <strong>{formatCooldownTimer(report.takeover_cooldown_remaining_seconds)}</strong> if no progress is made.
                                                    </p>
                                                )}

                                                {report.is_takeover_eligible || currentUser?.role_id === 4 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsTakeoverModalOpen(true)}
                                                        className="mt-2 px-6 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all cursor-pointer hover:scale-105 active:scale-95"
                                                    >
                                                        🔄 Take Over Report (Stalled)
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        disabled
                                                        className="mt-2 px-6 py-2.5 rounded-xl bg-gray-100 border border-gray-200 text-gray-400 text-xs font-black uppercase tracking-wider shadow-xs cursor-not-allowed opacity-80"
                                                    >
                                                        🔒 Takeover Locked ({formatCooldownTimer(report.takeover_cooldown_remaining_seconds)})
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* CASE IS UNASSIGNED */}
                                        {!report.assigned_leader_id && ![11, 12, 14, 3].includes(report.status_id) && (
                                            <div className="p-5 rounded-2xl bg-amber-50/80 border border-amber-200 text-center space-y-2">
                                                <p className="text-xs font-bold text-amber-900">
                                                    ⚠️ Please claim this incident report to unlock verification, warning citations, and resolution actions.
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={handleClaimReport}
                                                    disabled={isClaiming}
                                                    className="mt-2 px-6 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                                                >
                                                    {isClaiming ? 'Claiming...' : '🛡️ Claim This Report'}
                                                </button>
                                            </div>
                                        )}

                                        {/* OPERATIONAL CONTROLS - ACTIVE FOR ASSIGNED HANDLER */}
                                        {report.assigned_leader_id === currentUserId && ![11, 12, 14, 3].includes(report.status_id) && (
                                            <>
                                                {/* OPTION: ADD PET RECORD IF UNREGISTERED */}
                                                {!report.pet_id && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsAddPetModalOpen(true)}
                                                        className="w-full py-3.5 border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 text-[#F97316] rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer hover:scale-[1.01] active:scale-95"
                                                    >
                                                        <span className="text-base">🐾</span>
                                                        <span>Add Record for this Animal in System</span>
                                                    </button>
                                                )}

                                                {/* STEP 1: VERIFY */}
                                                {(report.status_id === 1 || report.status_id === 2 || report.status_id === 16) && (
                                                    <button
                                                        onClick={() => {
                                                            const isAlreadyVerified = report.verification_status === 'verified_true';
                                                            
                                                            const initBite = isAlreadyVerified ? Boolean((report as any).verified_actual_bite) : Boolean((report as any).ai_behavior_actual_bite);
                                                            const initChasing = isAlreadyVerified ? Boolean((report as any).verified_chasing) : Boolean((report as any).ai_behavior_chasing);
                                                            const initAttempted = isAlreadyVerified ? Boolean((report as any).verified_attempted_bite) : Boolean((report as any).ai_behavior_attempted_bite);
                                                            const initInjury = isAlreadyVerified ? Boolean((report as any).verified_injury) : Boolean((report as any).ai_behavior_injury);
                                                            const initAggressive = isAlreadyVerified ? Boolean((report as any).verified_aggressive) : Boolean((report as any).ai_behavior_aggressive);

                                                            setVerifyNotes(isAlreadyVerified ? (report.verification_notes || '') : '');
                                                            setVerifyActualBite(initBite);
                                                            setVerifyChasing(initChasing);
                                                            setVerifyAttemptedBite(initAttempted);
                                                            setVerifyInjury(initInjury);
                                                            setVerifyAggressive(initAggressive);

                                                            if (isAlreadyVerified && (report as any).behavior_finding) {
                                                                setVerifyBehaviorFinding((report as any).behavior_finding);
                                                            } else {
                                                                if (initBite) {
                                                                    setVerifyBehaviorFinding('Confirmed Physical Bite Incident');
                                                                } else if (initAggressive || initChasing || initAttempted || initInjury) {
                                                                    setVerifyBehaviorFinding('Substantiated Aggressive Incident');
                                                                } else {
                                                                    setVerifyBehaviorFinding('Unsubstantiated / Friendly Dog');
                                                                }
                                                            }

                                                            setIsVerifyModalOpen(true);
                                                        }}
                                                        className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        VERIFY INCIDENT REPORT
                                                    </button>
                                                )}

                                                {/* FALSE ALARM DISMISSAL BUTTON */}
                                                {(report.status_id === 1 || report.status_id === 2 || report.status_id === 15 || report.status_id === 16) && (
                                                    <button
                                                        onClick={() => {
                                                            setFalseAlarmReason('No Animal Found');
                                                            setFalseAlarmNotes('');
                                                            setIsFalseAlarmModalOpen(true);
                                                        }}
                                                        className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                                                    >
                                                        <span>🚫</span>
                                                        <span>Mark as False Alarm / Dismiss</span>
                                                    </button>
                                                )}

                                                {/* STEP 2: ESCALATE */}
                                                {report.status_id === 2 && (
                                                    <button
                                                        onClick={() => {
                                                            setEscalationTitle('');
                                                            setEscalationDescription('');
                                                            setIsEscalateModalOpen(true);
                                                        }}
                                                        className="w-full py-4 bg-orange-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-orange-100 hover:bg-orange-700 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                        </svg>
                                                        ESCALATE TO BARANGAY
                                                    </button>
                                                )}

                                                {/* STEP 2.5: ISSUE WARNING */}
                                                {Boolean(report.owner_id || (report.is_owner_report && report.user_id) || report.owner_name || report.pet_id) && (
                                                    <button
                                                        onClick={openIssueWarningModal}
                                                        className="w-full py-4 bg-yellow-500 text-white rounded-2xl text-xs font-bold shadow-lg shadow-yellow-100 hover:bg-yellow-600 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                                                    >
                                                        <span className="text-base">⚠️</span>
                                                        ISSUE OWNER WARNING
                                                    </button>
                                                )}

                                                {/* STEP 3: PENDING BARANGAY */}
                                                {report.status_id === 4 && (
                                                    <div className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-gray-200">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        Pending Barangay Review
                                                    </div>
                                                )}

                                                {(report.status_id === 1 || report.status_id === 2 || report.status_id === 4 || report.status_id === 7) && (
                                                    <button
                                                        onClick={() => {
                                                            setIsResolveLostModalOpen(true);
                                                        }}
                                                        className="w-full py-3.5 border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100 text-emerald-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs"
                                                    >
                                                        <span>{(report.category_id === 6 || !!report.pet_id || (!!report.description && report.description.includes('[LOST PET REPORT]'))) ? '🏠' : '🐾'}</span>
                                                        Update Animal Status
                                                    </button>
                                                )}

                                                {/* STEP 4: TRANSFER CASE TO ANOTHER LEADER */}
                                                {![11, 12, 14, 3].includes(report.status_id) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsTransferModalOpen(true)}
                                                        className="w-full py-3.5 border-2 border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100 hover:to-indigo-100 text-purple-800 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs hover:scale-[1.01] active:scale-95"
                                                    >
                                                        <span className="text-base">🔄</span>
                                                        <span>Transfer Report to Another Leader</span>
                                                    </button>
                                                )}

                                                {(report.status_id === 1 || report.status_id === 2) && (
                                                    <button
                                                        onClick={handleReject}
                                                        className="w-full py-3 border border-gray-100 rounded-2xl text-[10px] font-bold text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all uppercase tracking-widest cursor-pointer"
                                                    >
                                                        Reject Report
                                                    </button>
                                                )}
                                            </>
                                        )}

                                        {/* RESOLVED / HISTORY STATE (Visible to everyone) */}
                                        {report.status_id === 11 && (
                                            <div className="w-full p-5 bg-green-50 border border-green-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-black text-sm shrink-0">
                                                        ✓
                                                    </div>
                                                    <div>
                                                        <h5 className="text-xs font-black text-green-800 uppercase tracking-wide">Incident Resolved</h5>
                                                        <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider">This report is archived and visible in History Reports</p>
                                                    </div>
                                                </div>
                                                <Link 
                                                    to="/subd/history" 
                                                    className="px-5 py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 cursor-pointer shadow-sm hover:scale-105"
                                                >
                                                    View History Reports →
                                                </Link>
                                            </div>
                                        )}

                                        {report.status_id === 14 && (
                                            <div className="w-full p-5 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-black text-sm shrink-0">
                                                        🚫
                                                    </div>
                                                    <div>
                                                        <h5 className="text-xs font-black text-amber-800 uppercase tracking-wide">False Alarm / Dismissed</h5>
                                                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">This report was dismissed and is archived in History Reports</p>
                                                    </div>
                                                </div>
                                                <Link 
                                                    to="/subd/history" 
                                                    className="px-5 py-2.5 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 cursor-pointer shadow-sm hover:scale-105"
                                                >
                                                    View History Reports →
                                                </Link>
                                            </div>
                                        )}

                                        {report.status_id === 3 && (
                                            <div className="w-full p-5 bg-red-50 border border-red-200 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in duration-300">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-black text-sm shrink-0">
                                                        ✕
                                                    </div>
                                                    <div>
                                                        <h5 className="text-xs font-black text-red-800 uppercase tracking-wide">Report Rejected</h5>
                                                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">This report was rejected and is archived in History Reports</p>
                                                    </div>
                                                </div>
                                                <Link 
                                                    to="/subd/history" 
                                                    className="px-5 py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 cursor-pointer shadow-sm hover:scale-105"
                                                >
                                                    View History Reports →
                                                </Link>
                                            </div>
                                        )}

                                        {report.status_id === 12 && (
                                            <div className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-gray-200">
                                                Status: Deceased — Archived in History Reports
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                                {/* RIGHT COLUMN: Report Activity & Handover Timeline */}
                                <div className="lg:col-span-1 space-y-8 sticky top-0">
                                    <div className="bg-white border border-gray-100 rounded-[2.5rem] p-8 sm:p-10 shadow-sm">
                                        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-orange-50 text-[#F97316] flex items-center justify-center text-lg font-black shadow-xs">
                                                    📜
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
                                                {(report.history?.length || 0) + 1} Event{((report.history?.length || 0) + 1) > 1 ? 's' : ''}
                                            </span>
                                        </div>

                                        <div className="relative pl-6 space-y-5 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-gray-100 max-h-[600px] overflow-y-auto pr-2">
                                            {/* Initial Report Submission */}
                                            <div className="relative flex items-start gap-4 group">
                                                <div className="absolute -left-6 mt-1 w-5 h-5 rounded-full bg-blue-500 border-4 border-white shadow-xs flex items-center justify-center text-white text-[8px]">
                                                    📝
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
                                            {report.history && report.history.map((hist: any) => {
                                                const remarksLower = (hist.remarks || '').toLowerCase();
                                                const isTransfer = remarksLower.includes('transfer');
                                                const isClaim = remarksLower.includes('claim');
                                                const isWarning = remarksLower.includes('warning') || remarksLower.includes('notice');
                                                const isResolved = remarksLower.includes('resolved') || hist.report_status_id === 11;
                                                const isVerified = remarksLower.includes('verified') || hist.report_status_id === 2;
                                                const isFalseAlarm = remarksLower.includes('false alarm') || remarksLower.includes('dismiss');
                                                const isEscalated = remarksLower.includes('escalat') || hist.report_status_id === 4;

                                                let icon = '📌';
                                                let dotColor = 'bg-orange-500';
                                                let cardBg = 'bg-gray-50/70';
                                                let borderColor = 'border-gray-100';

                                                if (isTransfer) {
                                                    icon = '🔄';
                                                    dotColor = 'bg-purple-500';
                                                    cardBg = 'bg-purple-50/40';
                                                    borderColor = 'border-purple-100';
                                                } else if (isClaim) {
                                                    icon = '🛡️';
                                                    dotColor = 'bg-emerald-500';
                                                    cardBg = 'bg-emerald-50/40';
                                                    borderColor = 'border-emerald-100';
                                                } else if (isWarning) {
                                                    icon = '⚠️';
                                                    dotColor = 'bg-amber-500';
                                                    cardBg = 'bg-amber-50/40';
                                                    borderColor = 'border-amber-100';
                                                } else if (isResolved) {
                                                    icon = '✅';
                                                    dotColor = 'bg-green-600';
                                                    cardBg = 'bg-green-50/40';
                                                    borderColor = 'border-green-100';
                                                } else if (isVerified) {
                                                    icon = '🔍';
                                                    dotColor = 'bg-blue-500';
                                                    cardBg = 'bg-blue-50/40';
                                                    borderColor = 'border-blue-100';
                                                } else if (isFalseAlarm) {
                                                    icon = '🚫';
                                                    dotColor = 'bg-rose-500';
                                                    cardBg = 'bg-rose-50/40';
                                                    borderColor = 'border-rose-100';
                                                } else if (isEscalated) {
                                                    icon = '🚀';
                                                    dotColor = 'bg-orange-600';
                                                    cardBg = 'bg-orange-50/40';
                                                    borderColor = 'border-orange-100';
                                                }

                                                return (
                                                    <div key={hist.history_id} className="relative flex items-start gap-4 group animate-in fade-in duration-300">
                                                        <div className={`absolute -left-6 mt-1 w-5 h-5 rounded-full ${dotColor} border-4 border-white shadow-xs flex items-center justify-center text-white text-[8px]`}>
                                                            {icon}
                                                        </div>
                                                        <div className={`flex-1 ${cardBg} hover:bg-gray-50 rounded-2xl p-4 border ${borderColor} transition-all`}>
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                                                <span className="text-xs font-black text-gray-900 flex items-center gap-1.5">
                                                                    <span>{icon}</span>
                                                                    <span>{hist.updater_name || 'Subdivision Officer'}</span>
                                                                </span>
                                                                <span className="text-[10px] font-bold text-gray-400">
                                                                    <RelativeTimestamp date={hist.created_at} />
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
                        )}
                    </div>
                </main>
            </div>

            {/* Escalation Modal */}
            {isEscalateModalOpen && report && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="px-8 py-6 border-b border-gray-150 flex justify-between items-center bg-gray-50/50">
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
                                    className="w-full px-5 py-4 bg-white border border-gray-900 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-orange-100 focus:border-[#F97316] outline-none transition-all placeholder:text-gray-300"
                                    value={escalationTitle}
                                    onChange={(e) => setEscalationTitle(e.target.value)}
                                    placeholder="e.g. Endorsement for Report #18"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Additional Notes</label>
                                <textarea required rows={4}
                                    className="w-full px-5 py-4 bg-white border border-orange-400 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-orange-100 focus:border-[#F97316] outline-none transition-all placeholder:text-gray-300 resize-none"
                                    value={escalationDescription}
                                    onChange={(e) => setEscalationDescription(e.target.value)}
                                    placeholder="Provide detailed description of why emergency rescue is needed..."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Endorsement Letter File (PDF/DOCX/IMAGE)</label>
                                <div className="flex items-center gap-3 mt-1">
                                    <label htmlFor="endorsement-file-input-view" className="px-5 py-2 bg-[#FFF3E6] text-[#F97316] hover:bg-orange-100 rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border border-transparent">
                                        Choose File
                                    </label>
                                    <input
                                        id="endorsement-file-input-view"
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
                                    className="flex-1 py-3.5 bg-[#FBB065] hover:bg-[#F99D43] disabled:bg-orange-200 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    {isEscalating ? 'Escalating...' : 'SEND ESCALATION'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Warning Modal */}
            {isWarningModalOpen && report && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300">
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


            {/* Media Gallery Overlay */}
            {activeGallery && (
                <div 
                    onClick={() => setActiveGallery(null)}
                    className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center p-4"
                >
                    {(() => {
                        const currentMedia = activeGallery.media[activeGallery.index];
                        if (!currentMedia) return null;
                        const isVideo = currentMedia.media_type === 'Video' || currentMedia.file_url.toLowerCase().endsWith('.mp4');
                        const isDoc = currentMedia.media_type === 'Document' || currentMedia.file_url.toLowerCase().endsWith('.pdf') || currentMedia.file_url.toLowerCase().endsWith('.docx');

                        if (isVideo) {
                            return <video src={currentMedia.file_url} controls autoPlay className="max-w-full max-h-full rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />;
                        }
                        if (isDoc) {
                            return (
                                <div className="w-full h-full flex flex-col items-center justify-center gap-6" onClick={e => e.stopPropagation()}>
                                    <div className="w-full max-w-5xl h-[85vh] bg-white rounded-[2.5rem] overflow-hidden shadow-2xl border border-gray-100">
                                        <iframe
                                            src={currentMedia.file_url}
                                            className="w-full h-full border-none"
                                            title="Document Viewer"
                                        />
                                    </div>
                                    <div className="flex gap-4">
                                        <a href={currentMedia.file_url} target="_blank" rel="noopener noreferrer" className="px-10 py-4 bg-orange-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-orange-700 transition-all shadow-xl">
                                            Open Direct Link
                                        </a>
                                        <button onClick={() => setActiveGallery(null)} className="px-10 py-4 bg-white/10 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-all border border-white/10 backdrop-blur-md">
                                            Close Preview
                                        </button>
                                    </div>
                                </div>
                            );
                        }
                        return <img src={currentMedia.file_url} className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()} />;
                    })()}
                </div>
            )}

            {/* ENLARGED FULLSCREEN MAP MODAL */}
            {isMapExpanded && report && (
                <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-[95%] h-[92%] flex flex-col p-6 animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Incident Map View</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Expanded View of Report #{report.report_id} and Surroundings</p>
                            </div>
                            <button
                                onClick={() => setIsMapExpanded(false)}
                                className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-700 cursor-pointer"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Map Area */}
                        <div className="flex-1 rounded-2xl overflow-hidden relative border border-gray-100 min-h-0">
                            <MapComponent
                                height="100%"
                                center={[report.latitude, report.longitude]}
                                zoom={18}
                                showHeatmap={false}
                                markers={[
                                    {
                                        id: report.report_id,
                                        lat: report.latitude,
                                        lng: report.longitude,
                                        title: report.landmark || 'Incident Location',
                                        category: categoryMap[report.category_id],
                                        priority: report.priority_level
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
                                routing={isNavigating ? (() => {
                                    const repLoc: [number, number] = [report.latitude, report.longitude];
                                    const destName = report.landmark || 'Incident Location';
                                    if (navSource === 'current' && userLocation) {
                                        return {
                                            start: userLocation,
                                            end: repLoc,
                                            waypointNames: ["Your Location", destName] as [string, string],
                                            onClose: () => setIsNavigating(false)
                                        };
                                    } else {
                                        return {
                                            start: BRGY_OFFICE,
                                            end: repLoc,
                                            waypointNames: ["Barangay Office", destName] as [string, string],
                                            onClose: () => setIsNavigating(false)
                                        };
                                    }
                                })() : undefined}
                                onMarkerClick={(m) => {
                                    setNavSource(m.source || 'brgy');
                                    setIsNavigating(true);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Lost Pet QR Code Lightbox Modal */}
            {selectedQrPreview && (
                <div 
                    className="fixed inset-0 z-[10002] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={() => setSelectedQrPreview(null)}
                >
                    <div 
                        className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-amber-100 animate-in zoom-in-95 duration-200 text-center relative"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={() => setSelectedQrPreview(null)}
                            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 transition-colors"
                        >
                            ✕
                        </button>
                        
                        <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl font-black mx-auto mb-3">
                            🐾
                        </div>
                        <h3 className="text-base font-black text-gray-900 uppercase tracking-tight mb-0.5">
                            {selectedQrPreview.petName || 'Registered Pet'}
                        </h3>
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-4">
                            StraySafe Digital QR Tag
                        </p>

                        <div className="p-4 bg-amber-50/50 rounded-2xl border-2 border-dashed border-amber-200 inline-block mb-4">
                            <img
                                src={selectedQrPreview.url}
                                alt="Pet QR Code"
                                className="w-56 h-56 object-contain rounded-xl shadow-sm bg-white p-2 mx-auto"
                            />
                        </div>

                        {selectedQrPreview.hash && (
                            <p className="text-xs font-mono font-bold text-gray-600 mb-2">
                                Tag ID: {selectedQrPreview.hash}
                            </p>
                        )}

                        {selectedQrPreview.ownerPhone && (
                            <div className="p-3 bg-amber-100/70 rounded-xl text-amber-950 text-xs font-bold mb-4">
                                Owner Hotline: <span className="font-extrabold">{selectedQrPreview.ownerPhone}</span>
                            </div>
                        )}

                        <p className="text-[10px] text-gray-400 font-medium">
                            Scan this tag with the StraySafe Scanner to verify pet registry and contact the registered owner.
                        </p>
                    </div>
                </div>
            )}

            {/* Resolve / Update Animal Status Modal */}
            {(isResolveLostModalOpen || isResolveModalOpen) && report && (
                <ResolveLostPetModal
                    isOpen={isResolveLostModalOpen || isResolveModalOpen}
                    pet={{
                        pet_id: report.pet_id || 0,
                        pet_name: report.pet_name || report.animal_type || 'Animal',
                        photo_url: (report as any).pet_photo_url || (report.media && report.media[0]?.file_url),
                        breed: (report as any).pet_breed || report.breed || (report as any).animal_breed,
                        species: (report as any).pet_type || report.animal_type || 'Animal'
                    }}
                    reportId={report.report_id}
                    onClose={() => {
                        setIsResolveLostModalOpen(false);
                        setIsResolveModalOpen(false);
                    }}
                    onSuccess={() => {
                        window.location.reload();
                    }}
                />
            )}

            {/* Case Chat Drawer */}
            <ReportChatDrawer
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                report={report}
                currentUser={currentUser}
                threadMode="report"
            />

            {/* Add Pet Record Modal */}
            {isAddPetModalOpen && report && (
                <AddPetModal
                    isOpen={isAddPetModalOpen}
                    onClose={() => setIsAddPetModalOpen(false)}
                    initialReportData={report}
                    onPetCreated={() => {
                        fetchReportDetails();
                        setShowSuccess(true);
                    }}
                />
            )}

            {/* Takeover Modal */}
            {isTakeoverModalOpen && report && (
                <TakeoverReportModal
                    isOpen={isTakeoverModalOpen}
                    onClose={() => setIsTakeoverModalOpen(false)}
                    reportId={report.report_id}
                    currentHandlerName={report.assigned_leader_name || `Officer #${report.assigned_leader_id}`}
                    currentUserId={currentUserId}
                    onSuccess={() => {
                        setShowSuccess(true);
                        fetchReportDetails();
                        setTimeout(() => setShowSuccess(false), 3000);
                    }}
                />
            )}

            {/* Transfer Report Modal */}
            {isTransferModalOpen && report && (
                <TransferReportModal
                    isOpen={isTransferModalOpen}
                    onClose={() => setIsTransferModalOpen(false)}
                    reportId={report.report_id}
                    currentUserId={currentUserId}
                    subdivisionId={report.subdivision_id}
                    onTransferSuccess={() => {
                        setShowSuccess(true);
                        fetchReportDetails();
                        setTimeout(() => setShowSuccess(false), 3000);
                    }}
                />
            )}

            {/* Reject Transfer Modal */}
            {isRejectTransferModalOpen && report && (
                <RejectTransferModal
                    isOpen={isRejectTransferModalOpen}
                    onClose={() => setIsRejectTransferModalOpen(false)}
                    reportId={report.report_id}
                    currentUserId={currentUserId}
                    senderName={report.pending_transfer_from_name || undefined}
                    onRejectSuccess={() => {
                        setShowSuccess(true);
                        fetchReportDetails();
                        setTimeout(() => setShowSuccess(false), 3000);
                    }}
                />
            )}

            {/* Success Modal */}
            <SuccessModal
                isOpen={showSuccess}
                onClose={() => setShowSuccess(false)}
                title="Action Successful"
                message="Your action has been processed successfully."
            />

            {/* Registered Pet Detail Modal */}
            {selectedPetDetail && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 sm:p-10 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-6xl rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 bg-white overflow-hidden flex flex-col max-h-[90vh] border border-gray-100">
                        <PetDetailPanel
                            pet={selectedPetDetail}
                            onClose={() => {
                                setSelectedPetDetail(null);
                                fetchReportDetails();
                            }}
                        />
                    </div>
                </div>
            )}

            {/* False Alarm Dismissal Modal */}
            {isFalseAlarmModalOpen && report && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 duration-300 border border-rose-100">
                        <div className="px-8 py-6 border-b border-gray-150 flex justify-between items-center bg-rose-50/50">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">🚫</span>
                                <div>
                                    <h3 className="text-xl font-black text-rose-950 uppercase tracking-tight">Dismiss as False Alarm</h3>
                                    <p className="text-xs text-rose-700/80 mt-0.5 font-medium">Record field inspection findings before closing this report.</p>
                                </div>
                            </div>
                            <button onClick={() => setIsFalseAlarmModalOpen(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleMarkFalseAlarm} className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Dismissal Reason Category</label>
                                <select
                                    value={falseAlarmReason}
                                    onChange={(e) => setFalseAlarmReason(e.target.value)}
                                    className="w-full px-5 py-4 bg-white border border-gray-300 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-rose-100 focus:border-rose-500 outline-none transition-all"
                                >
                                    <option value="No Animal Found">No Animal Found at Reported Location</option>
                                    <option value="Exaggerated / No Bite Occurred">Exaggerated Claim (No Bite / No Injury Occurred)</option>
                                    <option value="Neighbor Dispute / Harassment">Neighbor Dispute / Malicious Harassment Report</option>
                                    <option value="Pet Safely at Home">Owned Resident Pet Safely Inside Property</option>
                                    <option value="Duplicate Report">Duplicate Report Already Being Handled</option>
                                    <option value="Other">Other Reason (Detailed in Notes)</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Staff Field Inspection Notes</label>
                                <textarea
                                    rows={4}
                                    required
                                    value={falseAlarmNotes}
                                    onChange={(e) => setFalseAlarmNotes(e.target.value)}
                                    placeholder="Explain the results of the physical verification or witness interviews that confirm this report is a false alarm..."
                                    className="w-full px-5 py-4 bg-white border border-gray-300 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-rose-100 focus:border-rose-500 outline-none transition-all resize-none"
                                />
                            </div>

                            <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-[11px] text-amber-900 font-medium leading-relaxed">
                                <strong>⚠️ Audit Notice:</strong> This action will update Report #{report.report_id} status to <em>False Alarm / Dismissed</em>, record your officer name in the audit log, and notify the resident reporter.
                            </div>

                            <div className="flex gap-4 pt-1">
                                <button
                                    type="button"
                                    onClick={() => setIsFalseAlarmModalOpen(false)}
                                    className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingFalseAlarm || !falseAlarmNotes.trim()}
                                    className="flex-1 py-3.5 bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-md shadow-rose-600/20 cursor-pointer"
                                >
                                    {isSubmittingFalseAlarm ? 'Dismissing...' : 'CONFIRM DISMISSAL'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Verify Incident Modal */}
            {isVerifyModalOpen && report && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-blue-100 max-h-[92vh] flex flex-col">
                        <div className="px-8 py-5 border-b border-gray-150 flex justify-between items-center bg-blue-50/60">
                            <div className="flex items-center gap-3">
                                <span className="text-3xl">🔍</span>
                                <div>
                                    <h3 className="text-xl font-black text-blue-950 uppercase tracking-tight">On-Site Field Verification</h3>
                                    <p className="text-xs text-blue-700/80 mt-0.5 font-medium">Record ground truth investigation findings to confirm or clear animal records.</p>
                                </div>
                            </div>
                            <button onClick={() => setIsVerifyModalOpen(false)} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <form onSubmit={handleVerifyIncident} className="p-8 space-y-5 overflow-y-auto">
                            {/* Behavioral Ground Truth Finding Category */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">
                                    Investigation Behavioral Finding
                                </label>
                                <select
                                    value={verifyBehaviorFinding}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        setVerifyBehaviorFinding(val);
                                        if (val.includes('Friendly') || val.includes('Exaggerated') || val.includes('Normal Stray')) {
                                            setVerifyActualBite(false);
                                            setVerifyAggressive(false);
                                            setVerifyInjury(false);
                                            setVerifyChasing(false);
                                            setVerifyAttemptedBite(false);
                                        } else if (val.includes('Substantiated Aggressive')) {
                                            setVerifyAggressive(true);
                                        }
                                    }}
                                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all"
                                >
                                    <option value="Unsubstantiated / Friendly Dog">🛡️ Unsubstantiated / Friendly Dog (Keep Record Clean)</option>
                                    <option value="Exaggerated Claim (Playful / No Threat)">🛡️ Exaggerated Claim (Playful / Harmless Behavior)</option>
                                    <option value="Normal Stray (Docile / No Bite)">🛡️ Normal Stray (Docile / Non-Aggressive)</option>
                                    <option value="Substantiated Aggressive Incident">⚠️ Substantiated Aggressive Incident (Hostile / Threat Confirmed)</option>
                                    <option value="Confirmed Physical Bite Incident">🚨 Confirmed Physical Bite Incident (Victim Injured)</option>
                                </select>
                            </div>

                            {/* Observable Behavior Checkbox Toggles */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">
                                        Observed Physical Actions (Ground Truth vs Allegation)
                                    </label>
                                    <span className="text-[10px] text-blue-600 font-semibold">Pre-filled from AI • Uncheck if False</span>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                    <label className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                                        verifyActualBite ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold' : 'bg-gray-50/80 border-gray-200 text-gray-700'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={verifyActualBite}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setVerifyActualBite(checked);
                                                if (checked) {
                                                    setVerifyBehaviorFinding('Confirmed Physical Bite Incident');
                                                } else if (!verifyAggressive && !verifyInjury && !verifyChasing && !verifyAttemptedBite) {
                                                    setVerifyBehaviorFinding('Unsubstantiated / Friendly Dog');
                                                }
                                            }}
                                            className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                                        />
                                        <div className="flex-1 flex items-center justify-between">
                                            <span className="text-xs">Actual Physical Bite Confirmed</span>
                                            {Boolean((report as any).ai_behavior_actual_bite) && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-rose-200/80 text-rose-800 rounded font-bold uppercase">AI Flagged</span>
                                            )}
                                        </div>
                                    </label>

                                    <label className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                                        verifyChasing ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold' : 'bg-gray-50/80 border-gray-200 text-gray-700'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={verifyChasing}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setVerifyChasing(checked);
                                                if (checked && !verifyActualBite) {
                                                    setVerifyBehaviorFinding('Substantiated Aggressive Incident');
                                                } else if (!checked && !verifyActualBite && !verifyAggressive && !verifyInjury && !verifyAttemptedBite) {
                                                    setVerifyBehaviorFinding('Unsubstantiated / Friendly Dog');
                                                }
                                            }}
                                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                                        />
                                        <div className="flex-1 flex items-center justify-between">
                                            <span className="text-xs">Hostile Chasing Observed</span>
                                            {Boolean((report as any).ai_behavior_chasing) && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-200/80 text-amber-800 rounded font-bold uppercase">AI Flagged</span>
                                            )}
                                        </div>
                                    </label>

                                    <label className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                                        verifyAttemptedBite ? 'bg-amber-50 border-amber-300 text-amber-900 font-bold' : 'bg-gray-50/80 border-gray-200 text-gray-700'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={verifyAttemptedBite}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setVerifyAttemptedBite(checked);
                                                if (checked && !verifyActualBite) {
                                                    setVerifyBehaviorFinding('Substantiated Aggressive Incident');
                                                } else if (!checked && !verifyActualBite && !verifyAggressive && !verifyInjury && !verifyChasing) {
                                                    setVerifyBehaviorFinding('Unsubstantiated / Friendly Dog');
                                                }
                                            }}
                                            className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                                        />
                                        <div className="flex-1 flex items-center justify-between">
                                            <span className="text-xs">Attempted Bite / Lunging</span>
                                            {Boolean((report as any).ai_behavior_attempted_bite) && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-200/80 text-amber-800 rounded font-bold uppercase">AI Flagged</span>
                                            )}
                                        </div>
                                    </label>

                                    <label className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                                        verifyInjury ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold' : 'bg-gray-50/80 border-gray-200 text-gray-700'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={verifyInjury}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setVerifyInjury(checked);
                                                if (checked && !verifyActualBite) {
                                                    setVerifyBehaviorFinding('Substantiated Aggressive Incident');
                                                } else if (!checked && !verifyActualBite && !verifyAggressive && !verifyChasing && !verifyAttemptedBite) {
                                                    setVerifyBehaviorFinding('Unsubstantiated / Friendly Dog');
                                                }
                                            }}
                                            className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                                        />
                                        <div className="flex-1 flex items-center justify-between">
                                            <span className="text-xs">Physical Injury / Bleeding</span>
                                            {Boolean((report as any).ai_behavior_injury) && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-rose-200/80 text-rose-800 rounded font-bold uppercase">AI Flagged</span>
                                            )}
                                        </div>
                                    </label>

                                    <label className={`flex items-center gap-3 p-3 rounded-2xl border transition-all cursor-pointer sm:col-span-2 ${
                                        verifyAggressive ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold' : 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={verifyAggressive}
                                            onChange={(e) => {
                                                const checked = e.target.checked;
                                                setVerifyAggressive(checked);
                                                if (checked && !verifyActualBite) {
                                                    setVerifyBehaviorFinding('Substantiated Aggressive Incident');
                                                } else if (!checked && !verifyActualBite && !verifyInjury && !verifyChasing && !verifyAttemptedBite) {
                                                    setVerifyBehaviorFinding('Unsubstantiated / Friendly Dog');
                                                }
                                            }}
                                            className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500"
                                        />
                                        <div className="flex-1 flex items-center justify-between">
                                            <span className="text-xs">
                                                {verifyAggressive ? '⚠️ Confirmed Hostile / Aggressive Temperament Observed' : '✓ Non-Aggressive / Calm & Friendly Demeanor'}
                                            </span>
                                            {Boolean((report as any).ai_behavior_aggressive) && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-rose-200/80 text-rose-800 rounded font-bold uppercase">AI Flagged</span>
                                            )}
                                        </div>
                                    </label>
                                </div>
                            </div>

                            {/* Clean Record Status Banner */}
                            {!verifyActualBite && !verifyAggressive && !verifyInjury ? (
                                <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 flex items-start gap-2">
                                    <span className="text-base flex-shrink-0">🛡️</span>
                                    <p className="leading-relaxed">
                                        <strong>Clean Record Mode:</strong> No biting or aggression observed. This will record the dog as <em>friendly/unsubstantiated</em>, ensuring the pet or animal's registry remains clean and preventing wrongful penalties.
                                    </p>
                                </div>
                            ) : (
                                <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                                    <span className="text-base flex-shrink-0">⚠️</span>
                                    <p className="leading-relaxed">
                                        <strong>Substantiated Threat:</strong> Aggression or bite confirmed. This will be recorded on the animal's permanent profile and may escalate dispatch or rabies observation protocols.
                                    </p>
                                </div>
                            )}

                            {/* Field Notes */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest ml-1">Officer Field Notes</label>
                                <textarea
                                    rows={3}
                                    value={verifyNotes}
                                    onChange={(e) => setVerifyNotes(e.target.value)}
                                    placeholder="Document on-site observations, witness statements, or friendly animal demeanor..."
                                    className="w-full px-4 py-3 bg-white border border-gray-300 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all resize-none"
                                />
                            </div>

                            <div className="flex gap-4 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsVerifyModalOpen(false)}
                                    className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingVerify}
                                    className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-md shadow-blue-600/20 cursor-pointer"
                                >
                                    {isSubmittingVerify ? 'Saving Record...' : 'CONFIRM VERIFIED RECORD'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubdViewReport;
