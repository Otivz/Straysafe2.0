import { useState, useEffect } from 'react';
import axios from 'axios';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { useNavigate, useParams, Link } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SuccessModal from '../../components/Modals/SuccessModal';
import MapComponent from '../../components/MapComponent';
import AISuggestionPanel from '../../components/AISuggestionPanel';

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
    breed?: string;
    condition: string;
    behavior_tags?: string;
    description: string;
    visibility: string;
    created_at: string;
    user_id: number;
    reporter_name?: string;
    media?: any[];
    comments?: any[];
    ai_animal_type?: string | null;
    ai_dominant_color?: string | null;
    ai_estimated_size?: string | null;
    ai_suggested_risk_level?: string | null;
    ai_suggested_priority?: string | null;
    ai_possible_breed?: string | null;
    ai_suggested_priority_reason?: string | null;
}

const statusMap: Record<number, string> = {
    1: 'Reported',
    2: 'Verified',
    3: 'Rejected',
    4: 'Escalated to Barangay',
    13: 'Approved',
    5: 'Rescue In Progress',
    6: 'Picked Up',
    7: 'Under Observation',
    8: 'Impounded',
    9: 'Claimed by Owner',
    10: 'Released',
    11: 'Resolved',
    12: 'Deceased'
};

const categoryMap: Record<number, string> = {
    1: 'Injured Animal', 2: 'Aggressive Stray', 3: 'Possible Rabies Risk',
    4: 'Roaming Pack', 5: 'Animal Rescue Needed'
};

const SubdViewReport = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [report, setReport] = useState<Report | null>(null);
    const [loading, setLoading] = useState(true);
    const [showSuccess, setShowSuccess] = useState(false);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    
    // Escalation Modal state
    const [isEscalateModalOpen, setIsEscalateModalOpen] = useState(false);
    const [endorsementFile, setEndorsementFile] = useState<File | null>(null);
    const [isEscalating, setIsEscalating] = useState(false);
    const [escalationTitle, setEscalationTitle] = useState('');
    const [escalationDescription, setEscalationDescription] = useState('');
    
    // Resolve Modal state
    const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
    const [resolveRemarks, setResolveRemarks] = useState('');
    const [resolveCondition, setResolveCondition] = useState('Healthy');
    const [resolveMediaFiles, setResolveMediaFiles] = useState<File[]>([]);
    const [isResolving, setIsResolving] = useState(false);
    
    // Image gallery state
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);

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
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const BRGY_OFFICE: [number, number] = [14.8069, 121.0039]; // R243+QH Santa Maria, Bulacan

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : 1;

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

    const handleUpdateStatus = async (newStatusId: number) => {
        if (!report) return;
        try {
            await axios.patch(`http://localhost:8000/reports/${report.report_id}/status`, {
                status_id: newStatusId,
                user_id: currentUserId,
                remarks: newStatusId === 2 ? "Incident report has been officially verified by the Subdivision Leader." : undefined
            });
            fetchReportDetails();
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Failed to update status. Please try again.');
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
                description: escalationDescription || report.description,
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

    const handleResolveReport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!report) return;

        try {
            setIsResolving(true);

            // 1. Update status to 11 (Resolved)
            const statusResponse = await axios.patch(`http://localhost:8000/reports/${report.report_id}/status`, {
                status_id: 11,
                user_id: currentUserId,
                remarks: resolveRemarks || "Incident has been resolved by the Subdivision Leader.",
                animal_condition: resolveCondition
            });

            // 2. Upload any evidence files if present
            if (resolveMediaFiles && resolveMediaFiles.length > 0) {
                const historyList = statusResponse.data.history || [];
                const latestHistory = historyList[historyList.length - 1];
                const historyId = latestHistory ? latestHistory.history_id : undefined;

                for (const file of resolveMediaFiles) {
                    const formData = new FormData();
                    formData.append('file', file);
                    formData.append('is_evidence', 'true');
                    formData.append('status_id', '11');
                    if (historyId) {
                        formData.append('history_id', historyId.toString());
                    }

                    await axios.post(`http://localhost:8000/reports/${report.report_id}/media`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                }
            }

            setIsResolveModalOpen(false);
            setResolveRemarks('');
            setResolveCondition('Healthy');
            setResolveMediaFiles([]);
            setShowSuccess(true);
            fetchReportDetails();
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (error) {
            console.error('Error resolving report:', error);
            alert('Failed to resolve report. Please try again.');
        } finally {
            setIsResolving(false);
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
                return 'bg-orange-50 text-orange-600 border-orange-100';
            case 'resolved':
                return 'bg-green-50 text-green-600 border-green-100';
            default:
                return 'bg-gray-50 text-gray-600 border-gray-100';
        }
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
                    <div className="max-w-4xl mx-auto">
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
                            <div className="space-y-8 bg-white p-8 sm:p-10 rounded-[2.5rem] border border-gray-100 shadow-sm">
                                {/* Header Info */}
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-lg text-gray-500 font-bold border border-gray-200">
                                            {(report.reporter_name || 'U').charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900">{report.reporter_name || `User ${report.user_id}`}</h4>
                                            <p className="text-xs text-gray-500"><RelativeTimestamp date={report.created_at} /></p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${getStatusColor(statusMap[report.status_id] || 'Pending')}`}>
                                            {statusMap[report.status_id] || 'Pending'}
                                        </span>
                                    </div>
                                </div>

                                {/* Details Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                    <div>
                                        <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Category</span>
                                        <span className="text-sm font-semibold text-gray-900">{categoryMap[report.category_id] || 'Other'}</span>
                                    </div>
                                    {!(report.ai_suggested_priority &&
                                        ((p1, p2) => p1.toLowerCase().replace('priority', '').replace('level', '').trim() === p2.toLowerCase().replace('priority', '').replace('level', '').trim())(report.ai_suggested_priority, report.priority_level)) && (
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Priority</span>
                                                <span className={`text-sm font-bold ${getPriorityColor(report.priority_level).replace('bg-', 'text-').replace('-50', '-600')}`}>
                                                    {report.priority_level}
                                                </span>
                                            </div>
                                        )}
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

                                {/* AI Suggestion Panel */}
                                <AISuggestionPanel
                                    animalType={report.ai_animal_type}
                                    dominantColor={report.ai_dominant_color}
                                    estimatedSize={report.ai_estimated_size}
                                    suggestedRiskLevel={report.ai_suggested_risk_level}
                                    suggestedPriority={report.ai_suggested_priority}
                                    possibleBreed={report.ai_possible_breed}
                                    description={report.description}
                                    categoryName={categoryMap[report.category_id]}
                                    suggestedPriorityReason={report.ai_suggested_priority_reason}
                                />

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
                                                    title: "Barangay Hall",
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
                                            routing={isNavigating ? {
                                                start: navSource === 'brgy' ? BRGY_OFFICE : (userLocation || BRGY_OFFICE),
                                                end: [report.latitude, report.longitude],
                                                waypointNames: [navSource === 'brgy' ? "Barangay Office" : "Your Location", report.landmark],
                                                onClose: () => setIsNavigating(false)
                                            } : undefined}
                                            onMarkerClick={(m) => {
                                                if (m.source) {
                                                    setNavSource(m.source);
                                                    setIsNavigating(true);
                                                } else {
                                                    setIsNavigating(true);
                                                    setNavSource('brgy');
                                                }
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
                                                                        {c.user_photo ? (
                                                                            <img src={c.user_photo} className="w-8 h-8 rounded-full object-cover z-10 ring-4 ring-white border border-gray-100 shadow-sm" alt={c.user_name} />
                                                                        ) : (
                                                                            <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center text-[#F97316] font-black text-xs z-10 ring-4 ring-white border border-orange-100">
                                                                                {c.user_name?.charAt(0).toUpperCase() || 'U'}
                                                                            </div>
                                                                        )}
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

                                                                                        {reply.user_photo ? (
                                                                                            <img src={reply.user_photo} className="w-6 h-6 rounded-full object-cover z-10 mt-1 ring-4 ring-white border border-gray-100 shadow-sm shrink-0" alt={reply.user_name} />
                                                                                        ) : (
                                                                                            <div className="w-6 h-6 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 font-bold text-[10px] z-10 mt-1 ring-4 ring-white border border-gray-100 shrink-0">
                                                                                                {reply.user_name?.charAt(0).toUpperCase() || 'U'}
                                                                                            </div>
                                                                                        )}

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

                                                                                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[#F97316] font-black text-[10px] shrink-0 border border-orange-200 z-10 bg-white ring-4 ring-white">
                                                                                    {currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'S'}
                                                                                </div>
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
                                        {/* STEP 1: VERIFY */}
                                        {report.status_id === 1 && (
                                            <button
                                                onClick={() => handleUpdateStatus(2)}
                                                className="w-full py-4 bg-blue-600 text-white rounded-2xl text-xs font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all transform hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-2"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                VERIFY INCIDENT REPORT
                                            </button>
                                        )}

                                        {/* STEP 2: ESCALATE */}
                                        {report.status_id === 2 && (
                                            <button
                                                onClick={() => {
                                                    setEscalationTitle(`Endorsement for Report #${report.report_id}`);
                                                    setEscalationDescription(report.description);
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

                                        {/* STEP 3: PENDING BARANGAY */}
                                        {report.status_id === 4 && (
                                            <div className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-gray-200">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                Pending Barangay Review
                                            </div>
                                        )}

                                        {(report.status_id === 1 || report.status_id === 2) && (
                                            <button
                                                onClick={() => setIsResolveModalOpen(true)}
                                                className="w-full py-3 border border-gray-100 rounded-2xl text-[10px] font-bold text-gray-400 hover:bg-green-50 hover:text-green-600 hover:border-green-100 transition-all uppercase tracking-widest cursor-pointer"
                                            >
                                                Mark as Resolved
                                            </button>
                                        )}

                                        <button
                                            onClick={handleReject}
                                            className="w-full py-3 border border-gray-100 rounded-2xl text-[10px] font-bold text-gray-400 hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all uppercase tracking-widest"
                                        >
                                            Reject Report
                                        </button>
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

            {/* Resolve Modal */}
            {isResolveModalOpen && report && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
                        {/* Title block from the image */}
                        <div className="pt-10 pb-4 flex flex-col items-center border-b border-gray-100/50 bg-gray-50/20">
                            <h3 className="text-xl font-black text-gray-900 tracking-tight uppercase leading-none">Update Rescue Status</h3>
                            <p className="text-[9px] font-extrabold text-[#F97316] uppercase tracking-widest mt-2">
                                New Status: Resolved
                            </p>
                        </div>

                        <form onSubmit={handleResolveReport} className="p-8 flex flex-col gap-6">
                            {/* Scrollable form body */}
                            <div className="max-h-[50vh] overflow-y-auto px-1 custom-scrollbar space-y-6">
                                {/* STATUS MESSAGE / TITLE */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Status Message / Title</label>
                                    <textarea 
                                        required 
                                        rows={3}
                                        className="w-full px-5 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-semibold focus:ring-4 focus:ring-orange-100 focus:border-[#F97316] outline-none transition-all placeholder:text-gray-300 resize-none"
                                        value={resolveRemarks}
                                        onChange={(e) => setResolveRemarks(e.target.value)}
                                        placeholder="Describe the update or findings..."
                                    />
                                </div>

                                {/* CURRENT ANIMAL CONDITION */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Current Animal Condition</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {['Healthy', 'Injured', 'Aggressive', 'Thin', 'Nursing', 'Deceased'].map((cond) => (
                                            <button
                                                key={cond}
                                                type="button"
                                                onClick={() => setResolveCondition(cond)}
                                                className={`py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${resolveCondition === cond
                                                    ? 'bg-orange-50 border-orange-200 text-[#F97316] shadow-sm'
                                                    : 'bg-white border-gray-100 text-gray-400 hover:border-gray-200 hover:text-gray-600'
                                                    }`}
                                            >
                                                {cond}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* ADD EVIDENCE PHOTOS/VIDEOS */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Add Evidence Photos/Videos</label>
                                    <div className="relative border-2 border-dashed border-gray-200 rounded-3xl bg-white p-8 flex flex-col items-center justify-center cursor-pointer hover:border-orange-500 hover:bg-orange-50/5 transition-all group min-h-[160px]">
                                        <input
                                            type="file" 
                                            multiple 
                                            accept="image/*,video/*"
                                            onChange={(e) => {
                                                if (e.target.files) {
                                                    setResolveMediaFiles(Array.from(e.target.files));
                                                }
                                            }}
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                        />
                                        <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-orange-100 group-hover:text-[#F97316] transition-all mb-3">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                            </svg>
                                        </div>
                                        <span className="text-[9px] font-black text-gray-400 group-hover:text-gray-600 uppercase tracking-widest leading-none">Tap to select multiple</span>
                                        {resolveMediaFiles.length > 0 && (
                                            <div className="mt-4 text-center">
                                                <p className="text-[10px] font-bold text-[#F97316] uppercase tracking-wider">{resolveMediaFiles.length} file(s) selected</p>
                                                <div className="text-[9px] text-gray-400 truncate max-w-[250px] mt-1">
                                                    {resolveMediaFiles.map(f => f.name).join(', ')}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Footer Buttons */}
                            <div className="pt-4 border-t border-gray-100 flex flex-col gap-2">
                                <button
                                    type="submit"
                                    disabled={isResolving}
                                    className="w-full py-4 bg-[#F97316] hover:bg-[#EA580C] disabled:bg-orange-300 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-orange-100/50 flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    {isResolving ? 'Resolving...' : 'Confirm Status Update'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsResolveModalOpen(false)}
                                    className="py-3 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-900 transition-colors cursor-pointer mt-2 block mx-auto"
                                >
                                    Cancel
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
                                        title: "Barangay Hall",
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
                                routing={isNavigating ? {
                                    start: navSource === 'brgy' ? BRGY_OFFICE : (userLocation || BRGY_OFFICE),
                                    end: [report.latitude, report.longitude],
                                    waypointNames: [navSource === 'brgy' ? "Barangay Office" : "Your Location", report.landmark],
                                    onClose: () => setIsNavigating(false)
                                } : undefined}
                                onMarkerClick={(m) => {
                                    if (m.source) {
                                        setNavSource(m.source);
                                        setIsNavigating(true);
                                    } else {
                                        setIsNavigating(true);
                                        setNavSource('brgy');
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            <SuccessModal
                isOpen={showSuccess}
                onClose={() => setShowSuccess(false)}
                title="Action Successful"
                message="Your action has been processed successfully."
            />
        </div>
    );
};

export default SubdViewReport;
