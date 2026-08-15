import { useState, useEffect } from 'react';
import axios from 'axios';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { useNavigate, useParams, Link } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import MapComponent from '../../components/MapComponent';

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
    reporter_name?: string;
    media?: any[];
    comments?: any[];
    estimated_size?: string | null;
    ai_animal_type?: string | null;
    ai_dominant_color?: string | null;
    ai_estimated_size?: string | null;
    ai_suggested_risk_level?: string | null;
    ai_suggested_priority?: string | null;
    ai_possible_breed?: string | null;
    ai_suggested_priority_reason?: string | null;
    history?: any[];
    endorsement_letter?: any;
}

interface RescueRequest {
    rescue_id: number;
    report_id: number;
    staff_id: number | null;
    leader_id: number | null;
    status_id: number;
    notes: string | null;
    created_at: string | null;
    title?: string;
    description?: string;
    barangay_status?: 'Pending' | 'In Progress' | 'Picked Up' | 'Resolved' | 'Rejected';
    leader_name?: string;
    leader_position?: string;
    assigned_staff_name?: string | null;
    assignments?: any[];
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
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming Pack',
    5: 'Animal Rescue Needed'
};

const SubdViewHistory = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [report, setReport] = useState<Report | null>(null);
    const [rescue, setRescue] = useState<RescueRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    
    // Image gallery state
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);
    
    // Timeline expand state
    const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

    // Reverse geocoding address state
    const [viewReportAddress, setViewReportAddress] = useState('');
    const [isViewReportAddressLoading, setIsViewReportAddressLoading] = useState(false);

    // Navigation state
    const [isNavigating, setIsNavigating] = useState(false);
    const [navSource, setNavSource] = useState<'brgy' | 'current'>('brgy');
    const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
    const BRGY_OFFICE: [number, number] = [14.8069, 121.0039]; // Santa Maria, Bulacan

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

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

    const fetchData = async () => {
        if (!id) return;
        try {
            setLoading(true);
            // 1. Fetch report details
            const reportResponse = await axios.get(`http://localhost:8000/reports/${id}`);
            if (reportResponse.data) {
                setReport(reportResponse.data);
            }

            // 2. Fetch rescue request details
            try {
                const rescueResponse = await axios.get(`http://localhost:8000/rescue-requests/report/${id}`);
                if (rescueResponse.data) {
                    setRescue(rescueResponse.data);
                }
            } catch (err) {
                console.log('No rescue request associated with this report or error fetching:', err);
                setRescue(null);
            }
        } catch (error) {
            console.error('Error fetching details:', error);
            setReport(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
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

    const getPriorityColor = (priority: string) => {
        switch (priority?.toLowerCase()) {
            case 'emergency':
            case 'high': return 'bg-red-50 text-red-600 border-red-100';
            case 'regular':
            case 'medium': return 'bg-amber-50 text-amber-600 border-amber-100';
            case 'low': return 'bg-blue-50 text-blue-600 border-blue-100';
            default: return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status?.toLowerCase()) {
            case 'resolved':
                return 'bg-green-50 text-green-600 border-green-100';
            case 'claimed by owner':
                return 'bg-emerald-50 text-emerald-700 border-emerald-200';
            case 'released':
                return 'bg-teal-50 text-teal-700 border-teal-200';
            case 'deceased':
                return 'bg-gray-100 text-gray-600 border-gray-200';
            case 'rejected':
                return 'bg-red-50 text-red-600 border-red-100';
            default:
                return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

    interface TimelineStep {
        label: string;
        status: 'Pending' | 'In Progress' | 'Resolved' | 'Not Started';
        timestamp: string;
        note?: string;
    }

    const getTimelineData = () => {
        const steps: TimelineStep[] = [];
        if (!report) return steps;

        // 1. Report Received
        steps.push({
            label: 'Report Received',
            status: 'Resolved',
            timestamp: report.created_at ? new Date(report.created_at).toLocaleString() : 'N/A',
            note: `Initial report registered successfully by ${report.reporter_name || 'Citizen'}.`
        });

        // If rejected, short circuit
        if (report.status_id === 3) {
            const rejectedHistory = report.history?.find((h: any) => h.report_status_id === 3);
            steps.push({
                label: 'Report Rejected',
                status: 'Resolved',
                timestamp: rejectedHistory?.created_at ? new Date(rejectedHistory.created_at).toLocaleString() : 'N/A',
                note: rejectedHistory?.remarks || 'Report was rejected based on verification criteria.'
            });
            return steps;
        }

        // 2. Report Verified
        const verifiedHistory = report.history?.find((h: any) => h.report_status_id === 2);
        const isVerified = !!verifiedHistory || report.status_id >= 2;
        if (isVerified) {
            steps.push({
                label: 'Report Verified',
                status: 'Resolved',
                timestamp: verifiedHistory?.created_at ? new Date(verifiedHistory.created_at).toLocaleString() : '-',
                note: verifiedHistory?.remarks || 'Incident report has been officially verified by the Subdivision Leader.'
            });
        }

        // 3. Endorsed to Barangay (only if escalated or rescue exists)
        const escalatedHistory = report.history?.find((h: any) => h.report_status_id === 4);
        const isEscalated = !!escalatedHistory || (rescue && rescue.status_id >= 1);

        if (isEscalated) {
            steps.push({
                label: 'Endorsed to Barangay',
                status: 'Resolved',
                timestamp: escalatedHistory?.created_at ? new Date(escalatedHistory.created_at).toLocaleString() : '-',
                note: escalatedHistory?.remarks || 'Official subdivision endorsement sent to Barangay.'
            });

            // 4. Rescue Team Assigned
            const assignedHistory = report.history?.find((h: any) => h.report_status_id === 13);
            const hasAssignment = !!assignedHistory || (rescue && (rescue.assigned_staff_name || (rescue.assignments && rescue.assignments.length > 0)));
            steps.push({
                label: 'Rescue Team Assigned',
                status: hasAssignment ? 'Resolved' : 'Not Started',
                timestamp: assignedHistory?.created_at ? new Date(assignedHistory.created_at).toLocaleString() : (rescue?.assignments?.[0]?.assigned_at ? new Date(rescue.assignments[0].assigned_at).toLocaleString() : '-'),
                note: hasAssignment ? (assignedHistory?.remarks || `Dispatched ${rescue?.assigned_staff_name || 'Barangay Rescue Team'}.`) : '-'
            });

            // 5. Rescue In Progress
            const inProgressHistory = report.history?.find((h: any) => h.report_status_id === 5);
            const isInProgress = !!inProgressHistory || (report.status_id >= 5 && report.status_id !== 13);
            steps.push({
                label: 'Rescue In Progress',
                status: isInProgress ? 'Resolved' : 'Not Started',
                timestamp: inProgressHistory?.created_at ? new Date(inProgressHistory.created_at).toLocaleString() : '-',
                note: isInProgress ? (inProgressHistory?.remarks || `Barangay rescue squad dispatched and on-site at ${report.landmark || 'Subdivision Boundary'}.`) : '-'
            });

            // 6. Animal Picked Up
            const pickedUpHistory = report.history?.find((h: any) => h.report_status_id === 6);
            const isPickedUp = !!pickedUpHistory || (report.status_id >= 6 && report.status_id !== 13 && report.status_id !== 5);
            steps.push({
                label: 'Animal Picked Up',
                status: isPickedUp ? 'Resolved' : 'Not Started',
                timestamp: pickedUpHistory?.created_at ? new Date(pickedUpHistory.created_at).toLocaleString() : '-',
                note: isPickedUp ? (pickedUpHistory?.remarks || 'Animal safely secured by the rescue team.') : '-'
            });
        }

        // 7. Mission Resolved
        const resolvedHistory = report.history?.find((h: any) => [9, 10, 11, 12].includes(h.report_status_id));
        const isResolved = !!resolvedHistory || [9, 10, 11, 12].includes(report.status_id);
        steps.push({
            label: 'Mission Resolved',
            status: isResolved ? 'Resolved' : 'Not Started',
            timestamp: resolvedHistory?.created_at ? new Date(resolvedHistory.created_at).toLocaleString() : '-',
            note: isResolved ? (resolvedHistory?.remarks || 'Incident resolved successfully.') : '-'
        });

        return steps;
    };

    const getStepDetails = (stepLabel: string) => {
        if (!report) return null;

        const historyList = report.history || [];
        let matchedHistory = null;
        if (stepLabel === 'Report Received') {
            matchedHistory = historyList.find((h: any) => h.report_status_id === 1);
        } else if (stepLabel === 'Report Verified') {
            matchedHistory = historyList.find((h: any) => h.report_status_id === 2);
        } else if (stepLabel === 'Report Rejected') {
            matchedHistory = historyList.find((h: any) => h.report_status_id === 3);
        } else if (stepLabel === 'Endorsed to Barangay') {
            matchedHistory = historyList.find((h: any) => h.report_status_id === 4);
        } else if (stepLabel === 'Rescue Team Assigned') {
            matchedHistory = historyList.find((h: any) => h.report_status_id === 13) ||
                             historyList.find((h: any) => h.report_status_id === 5);
        } else if (stepLabel === 'Rescue In Progress') {
            matchedHistory = historyList.find((h: any) => h.report_status_id === 5);
        } else if (stepLabel === 'Animal Picked Up') {
            matchedHistory = historyList.find((h: any) => h.report_status_id === 6 || h.report_status_id === 7 || h.report_status_id === 8);
        } else if (stepLabel === 'Mission Resolved') {
            matchedHistory = historyList.find((h: any) => [9, 10, 11, 12].includes(h.report_status_id));
        }

        const getStepMedia = (statusIds: number[]) => {
            return report.media?.filter((m: any) => {
                if (matchedHistory?.history_id && m.history_id === matchedHistory.history_id) {
                    return true;
                }
                return m.status_id && statusIds.includes(m.status_id);
            }) || [];
        };

        let stepStatusIds: number[] = [];
        if (stepLabel === 'Report Received') stepStatusIds = [1];
        else if (stepLabel === 'Report Verified') stepStatusIds = [2];
        else if (stepLabel === 'Report Rejected') stepStatusIds = [3];
        else if (stepLabel === 'Endorsed to Barangay') stepStatusIds = [4];
        else if (stepLabel === 'Rescue Team Assigned') stepStatusIds = [13];
        else if (stepLabel === 'Rescue In Progress') stepStatusIds = [5];
        else if (stepLabel === 'Animal Picked Up') stepStatusIds = [6, 7, 8];
        else if (stepLabel === 'Mission Resolved') stepStatusIds = [9, 10, 11, 12];

        const stepMedia = getStepMedia(stepStatusIds);

        const condition = report.condition || 'No information provided.';
        const message = matchedHistory?.remarks || 'No information provided.';
        const timestamp = matchedHistory?.created_at ? new Date(matchedHistory.created_at).toLocaleString() : '-';
        const updatedBy = matchedHistory?.updater_name || (rescue?.assigned_staff_name && stepLabel === 'Rescue Team Assigned' ? rescue.assigned_staff_name : 'System');

        return {
            media: stepMedia,
            condition,
            message,
            timestamp,
            updatedBy
        };
    };

    const timeline = getTimelineData();
    const missionId = rescue ? `MSN-2026-${rescue.rescue_id.toString().padStart(3, '0')}` : 'N/A';
    const missionTitle = rescue?.title || (report ? `Rescue: ${report.animal_type} at ${report.landmark}` : 'N/A');
    const escalatedDateFormatted = rescue?.created_at ? new Date(rescue.created_at).toLocaleString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }) : (report?.history?.find((h: any) => h.report_status_id === 4)?.created_at ? new Date(report.history.find((h: any) => h.report_status_id === 4).created_at).toLocaleString() : 'N/A');

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar
                    leftContent={
                        <div className="flex items-center gap-4">
                            <Link to="/subd/history" className="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-all shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                </svg>
                            </Link>
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">History Report Archive</h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Viewing Details of Archived Report #{id}</p>
                            </div>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto">
                        {loading ? (
                            <div className="py-32 flex flex-col items-center justify-center gap-4">
                                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Loading archived report...</p>
                            </div>
                        ) : !report ? (
                            <div className="bg-white rounded-[2.5rem] border border-gray-100 p-20 text-center shadow-sm">
                                <span className="text-5xl block mb-4">⚠️</span>
                                <h3 className="text-gray-900 font-black uppercase text-sm tracking-wider">Report Not Found</h3>
                                <p className="text-gray-400 text-xs mt-1.5 leading-relaxed">The archived report ID you are trying to view does not exist or was deleted.</p>
                                <Link to="/subd/history" className="inline-block mt-6 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-md">
                                    Go Back to History
                                </Link>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* LEFT COLUMN: Report Details, Map, Letter */}
                                <div className="lg:col-span-2 space-y-8">
                                    {/* General details Card */}
                                    <div className="bg-white p-8 sm:p-10 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-gray-50 pb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-lg text-gray-500 font-bold border border-gray-200">
                                                    {(report.reporter_name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-gray-900">{report.reporter_name || `User ${report.user_id}`}</h4>
                                                    <p className="text-xs text-gray-500">Reported <RelativeTimestamp date={report.created_at} /></p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className={`px-4 py-1.5 rounded-full text-xs font-bold border ${getStatusColor(statusMap[report.status_id] || 'Pending')}`}>
                                                    {statusMap[report.status_id] || 'Pending'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Details Grid */}
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 bg-gray-50 p-6 rounded-2xl border border-gray-100">
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Category</span>
                                                <span className="text-sm font-semibold text-gray-900">{categoryMap[report.category_id] || 'Other'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Priority</span>
                                                <span className={`text-sm font-bold ${getPriorityColor(report.priority_level).replace('bg-', 'text-').replace('-50', '-600')}`}>
                                                    {report.priority_level}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Animal Type</span>
                                                <span className="text-sm font-semibold text-gray-900">{report.animal_type || 'Unknown'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Detected Animal Type</span>
                                                <span className="text-sm font-semibold text-gray-900">{report.ai_animal_type || 'Unknown'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Dominant Color</span>
                                                <span className="text-sm font-semibold text-gray-900">{report.animal_color || report.ai_dominant_color || 'Unknown'}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Estimated Size</span>
                                                <span className="text-sm font-semibold text-gray-900">
                                                    {report.estimated_size || report.ai_estimated_size || 'Unknown'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Animal Count</span>
                                                <span className="text-sm font-semibold text-gray-900">{report.animal_count} observed</span>
                                            </div>
                                            <div>
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Landmark</span>
                                                <span className="text-sm font-semibold text-gray-900">{report.landmark || 'N/A'}</span>
                                            </div>
                                            <div className="col-span-2 sm:col-span-3">
                                                <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Street / Location</span>
                                                <span className="text-sm font-semibold text-purple-600">
                                                    {isViewReportAddressLoading ? (
                                                        <span className="flex items-center gap-1.5">
                                                            <svg className="animate-spin h-3.5 w-3.5 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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

                                        {/* Description */}
                                        <div>
                                            <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2.5">Case Description</h5>
                                            <div className="bg-gray-50/50 p-5 rounded-2xl border border-gray-100 shadow-inner">
                                                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{report.description || 'No description provided.'}</p>
                                            </div>
                                        </div>

                                        {/* General Media Gallery */}
                                        {report.media && report.media.filter(m => {
                                            const url = m.file_url.toLowerCase();
                                            return m.media_type !== 'Document' &&
                                                !url.endsWith('.pdf') &&
                                                !url.endsWith('.doc') &&
                                                !url.endsWith('.docx') &&
                                                !url.endsWith('.txt');
                                        }).length > 0 && (
                                            <div>
                                                <h5 className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3">Report Evidence Gallery</h5>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    {report.media.filter(m => {
                                                        const url = m.file_url.toLowerCase();
                                                        return m.media_type !== 'Document' &&
                                                            !url.endsWith('.pdf') &&
                                                            !url.endsWith('.doc') &&
                                                            !url.endsWith('.docx') &&
                                                            !url.endsWith('.txt');
                                                    }).map((m: any, idx: number) => {
                                                        const isVideo = m.media_type === 'Video' || m.file_url.toLowerCase().match(/\.(mp4|mov|avi|webm)$/i);
                                                        return (
                                                            <div
                                                                key={m.media_id}
                                                                onClick={() => {
                                                                    const filtered = report.media!.filter(mediaFile => {
                                                                        const url = mediaFile.file_url.toLowerCase();
                                                                        return mediaFile.media_type !== 'Document' &&
                                                                            !url.endsWith('.pdf') &&
                                                                            !url.endsWith('.doc') &&
                                                                            !url.endsWith('.docx') &&
                                                                            !url.endsWith('.txt');
                                                                    });
                                                                    setActiveGallery({ media: filtered, index: idx });
                                                                }}
                                                                className="aspect-square group relative rounded-2xl overflow-hidden bg-gray-100 border border-gray-100 cursor-pointer transition-all hover:scale-[1.02] hover:shadow-md active:scale-95 flex items-center justify-center"
                                                            >
                                                                {isVideo ? (
                                                                    <div className="relative w-full h-full bg-black flex items-center justify-center">
                                                                        <video src={m.file_url} className="w-full h-full object-cover" />
                                                                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                                                                            <div className="w-10 h-10 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-white ring-4 ring-white/20">
                                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 fill-current" viewBox="0 0 20 20">
                                                                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                                                </svg>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <img src={m.file_url} alt="Archived report evidence" className="w-full h-full object-cover" />
                                                                )}
                                                                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                                                                    <span className="text-[9px] font-bold text-white uppercase tracking-widest flex items-center gap-1.5">
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                        </svg>
                                                                        Expand
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Map Card */}
                                    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4">
                                        <div className="flex justify-between items-center">
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

                                    {/* Official Letter Section */}
                                    {report.status_id >= 4 && report.endorsement_letter && (
                                        <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-4">
                                            <h5 className="text-[11px] font-black text-gray-900 uppercase tracking-widest">Official Subdivision Letter</h5>
                                            <div className="bg-purple-50/40 border border-purple-100 rounded-3xl p-6 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-lg">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-gray-900 uppercase tracking-widest">Endorsement Letter</p>
                                                        <p className="text-[10px] font-bold text-gray-400 mt-0.5">Sent to Barangay for Rescue Endorsement</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => {
                                                        if (report.endorsement_letter) {
                                                            setActiveGallery({
                                                                media: [{
                                                                    media_type: 'Document',
                                                                    file_url: report.endorsement_letter.file_url || '',
                                                                    is_evidence: true
                                                                }],
                                                                index: 0
                                                            });
                                                        }
                                                    }}
                                                    className="px-6 py-2.5 bg-white border border-purple-200 text-purple-600 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-purple-600 hover:text-white transition-all shadow-sm"
                                                >
                                                    View Letter
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* RIGHT COLUMN: Mission Tracker Card */}
                                <div className="lg:col-span-1 space-y-8">
                                    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                                        <header className="border-b border-gray-50 pb-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black bg-purple-50 text-purple-600 px-2.5 py-1 rounded-md uppercase tracking-widest">
                                                    Mission Tracker
                                                </span>
                                                <span className="text-xs font-mono text-gray-400 font-bold">
                                                    Report #{report.report_id}
                                                </span>
                                            </div>
                                            <h2 className="text-xl font-black text-gray-900 mt-1.5 tracking-tight leading-none">
                                                {missionId}
                                            </h2>
                                        </header>

                                        {/* Info Details */}
                                        <div className="space-y-4 text-xs font-semibold text-gray-600">
                                            <div className="bg-gray-50/50 border border-gray-100 p-4 rounded-xl">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Mission Title</p>
                                                <p className="text-sm font-bold text-gray-800 leading-tight">{missionTitle}</p>
                                            </div>
                                            <div className="bg-gray-50/50 border border-gray-100 p-4 rounded-xl">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Report Location</p>
                                                <p className="text-sm font-bold text-gray-800 leading-tight">{report.landmark || 'Subdivision Boundary'}</p>
                                            </div>
                                            <div className="bg-gray-50/50 border border-gray-100 p-4 rounded-xl">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Reporter Name</p>
                                                <p className="text-sm font-bold text-gray-800 leading-tight">{report.reporter_name || `User ${report.user_id}`}</p>
                                            </div>
                                            <div className="bg-gray-50/50 border border-gray-100 p-4 rounded-xl">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Escalated Date & Time</p>
                                                <p className="text-sm font-bold text-gray-800 leading-tight">{escalatedDateFormatted}</p>
                                            </div>
                                            <div className="bg-gray-50/50 border border-gray-100 p-4 rounded-xl">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Current Status</p>
                                                <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border mt-1 ${getStatusColor(statusMap[report.status_id])}`}>
                                                    {statusMap[report.status_id] || 'Resolved'}
                                                </span>
                                            </div>
                                            <div className="bg-gray-50/50 border border-gray-100 p-4 rounded-xl">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 leading-none">Assigned Rescue Team</p>
                                                <p className={`text-sm font-black mt-1 ${rescue?.assigned_staff_name ? 'text-purple-600' : 'text-gray-400'}`}>
                                                    {rescue?.assigned_staff_name || 'N/A'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="border-t border-gray-50 my-6"></div>

                                        {/* Timeline */}
                                        <div className="space-y-6">
                                            <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Mission Timeline</h3>
                                            <div className="pl-1">
                                                {timeline.map((step, idx) => {
                                                    const isLast = idx === timeline.length - 1;
                                                    const isCompleted = step.status === 'Resolved';
                                                    const isActive = isCompleted;
                                                    const isExpanded = !!expandedSteps[step.label];
                                                    const stepDetail = isActive ? getStepDetails(step.label) : null;

                                                    let circleBg = 'bg-gray-50 border-gray-200 text-gray-400';
                                                    let lineBg = 'bg-gray-100';

                                                    if (isCompleted) {
                                                        circleBg = 'bg-purple-600 text-white border-purple-600 shadow-lg shadow-purple-500/25';
                                                        lineBg = 'bg-purple-600';
                                                    }

                                                    return (
                                                        <div key={idx} className="flex items-start relative pb-6 last:pb-0">
                                                            {/* Vertical Line */}
                                                            {!isLast && (
                                                                <div className={`absolute left-[13px] top-[26px] bottom-0 w-[2px] ${lineBg} transition-all duration-300`}></div>
                                                            )}

                                                            {/* Circle/Number */}
                                                            <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center z-10 shrink-0 font-extrabold text-[10px] ${circleBg}`}>
                                                                {isCompleted ? (
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                                                    </svg>
                                                                ) : (
                                                                    <span>{idx + 1}</span>
                                                                )}
                                                            </div>

                                                            {/* Content */}
                                                            <div className="ml-3.5 flex-1">
                                                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 mb-0.5">
                                                                    <h4 className="text-xs font-black text-gray-900">{step.label}</h4>
                                                                    {step.timestamp && step.timestamp !== '-' && (
                                                                        <span className="text-[9px] font-bold text-gray-400 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-100">{step.timestamp}</span>
                                                                    )}
                                                                </div>
                                                                {step.note && (
                                                                    <p className="text-[11px] leading-relaxed text-gray-500 font-semibold">{step.note}</p>
                                                                )}

                                                                {/* Expand Toggle */}
                                                                {isActive && (
                                                                    <button
                                                                        onClick={() => setExpandedSteps(prev => ({ ...prev, [step.label]: !prev[step.label] }))}
                                                                        className="mt-2.5 flex items-center gap-1 text-[9px] font-black text-purple-600 hover:text-purple-700 uppercase tracking-wider transition-colors"
                                                                    >
                                                                        <svg className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                                        </svg>
                                                                        {isExpanded ? 'Hide' : 'View More'}
                                                                    </button>
                                                                )}

                                                                {/* Expanded Details Panel */}
                                                                {isActive && isExpanded && stepDetail && (
                                                                    <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50/60 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                                                                        {/* Personnel */}
                                                                        <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-2.5">
                                                                            <div className="w-6.5 h-6.5 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-[9px] shrink-0 border border-purple-200">
                                                                                {(stepDetail.updatedBy || 'S').charAt(0).toUpperCase()}
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-none">Assigned Personnel</p>
                                                                                <p className="text-xs font-bold text-gray-800 mt-0.5">{stepDetail.updatedBy}</p>
                                                                            </div>
                                                                        </div>

                                                                        {/* Message */}
                                                                        <div className="px-4 py-2.5 border-b border-gray-100">
                                                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Status Message</p>
                                                                            <p className="text-xs font-semibold text-gray-700 leading-relaxed">
                                                                                {stepDetail.message || 'No status message provided.'}
                                                                            </p>
                                                                        </div>

                                                                        {/* Condition */}
                                                                        <div className="px-4 py-2.5 border-b border-gray-100">
                                                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5">Current Animal Condition</p>
                                                                            <span className="inline-flex px-2 py-0.5 rounded-md text-[9px] font-black bg-purple-50 text-purple-600 border border-purple-100 uppercase tracking-wide">
                                                                                {stepDetail.condition}
                                                                            </span>
                                                                        </div>

                                                                        {/* Evidence Gallery */}
                                                                        {stepDetail.media && stepDetail.media.length > 0 && (
                                                                            <div className="px-4 py-3">
                                                                                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2">Step Evidence</p>
                                                                                <div className="flex gap-2 flex-wrap">
                                                                                    {stepDetail.media.map((mediaFile: any, mi: number) => {
                                                                                        const isVideo = mediaFile.media_type === 'Video' || mediaFile.file_url.toLowerCase().match(/\.(mp4|mov|avi|webm)$/i);
                                                                                        return (
                                                                                            <div
                                                                                                key={mi}
                                                                                                onClick={() => {
                                                                                                    setActiveGallery({
                                                                                                        media: stepDetail.media,
                                                                                                        index: mi
                                                                                                    });
                                                                                                }}
                                                                                                className="relative w-12 h-12 rounded-lg overflow-hidden border border-gray-100 shadow-sm cursor-pointer hover:border-purple-500 transition-all bg-black flex items-center justify-center group shrink-0"
                                                                                            >
                                                                                                {isVideo ? (
                                                                                                    <div className="flex flex-col items-center justify-center text-white">
                                                                                                        <svg className="w-4 h-4 text-white/80" fill="currentColor" viewBox="0 0 20 20">
                                                                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                                                                                                        </svg>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <img src={mediaFile.file_url} alt="Timeline evidence preview" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                                                                )}
                                                                                            </div>
                                                                                        );
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
            </div>

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
                                        <a href={currentMedia.file_url} target="_blank" rel="noopener noreferrer" className="px-10 py-4 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-purple-700 transition-all shadow-xl">
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
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <div>
                                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Incident Map View</h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Expanded View of Report #{report.report_id} and surroundings</p>
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
        </div>
    );
};

export default SubdViewHistory;
