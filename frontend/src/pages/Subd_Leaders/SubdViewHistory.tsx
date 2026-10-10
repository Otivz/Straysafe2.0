import { useState, useEffect } from 'react';
import axios from 'axios';
import api from '../../utils/api';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { useNavigate, useParams, Link } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import MapComponent from '../../components/MapComponent';
import RescueTimeline from '../../components/RescueTimeline';
import { REPORT_STATUS_MAP } from '../../utils/reportStatus';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';

import { SAN_VICENTE_HQ } from '../../utils/coverageArea';
import ReportDescription from '../../components/ReportDescription';
interface Report {
    report_id: number;
    category_id: number;
    status_id: number;
    priority_level: string;
    latitude: number;
    longitude: number;
    landmark: string;
    initial_latitude?: number | null;
    initial_longitude?: number | null;
    initial_landmark?: string | null;
    facility_id?: number | null;
    facility?: any;
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
    verification_status?: string | null;
    verification_notes?: string | null;
    verified_at?: string | null;
    verified_by_user_id?: number | null;
    verified_by_name?: string | null;
    false_alarm_reason?: string | null;
    subdivision_id?: number | null;
    assigned_leader_name?: string | null;
    current_status_id?: number | null;
    updated_at?: string | null;
    handover_photo_url?: string | null;
    returns?: any[];
    owner_return?: {
        owner_name?: string | null;
        owner_phone?: string | null;
        owner_email?: string | null;
        owner_address?: string | null;
        handover_photo_url?: string | null;
        returned_at?: string | null;
        return_method?: string | null;
        relationship_to_animal?: string | null;
        [key: string]: any;
    } | null;
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
    assigned_staff_photo?: string | null;
    assignments?: any[];
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

const SubdViewHistory = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [report, setReport] = useState<Report | null>(null);
    const [rescue, setRescue] = useState<RescueRequest | null>(null);
    const [holdingAnimal, setHoldingAnimal] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    
    // Image gallery state
    const [activeGallery, setActiveGallery] = useState<{ media: any[], index: number } | null>(null);
    

    // Reverse geocoding address state
    const [viewReportAddress, setViewReportAddress] = useState('');
    const [isViewReportAddressLoading, setIsViewReportAddressLoading] = useState(false);

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const BRGY_OFFICE: [number, number] = SAN_VICENTE_HQ; // Santa Maria, Bulacan

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
            const reportResponse = await api.get(`/reports/${id}`);
            if (reportResponse.data) {
                setReport(reportResponse.data);
            }

            // 2. Fetch rescue request details
            try {
                const rescueResponse = await api.get(`/rescue-requests/report/${id}`);
                if (rescueResponse.data) {
                    setRescue(rescueResponse.data);
                }
            } catch (err) {
                console.log('No rescue request associated with this report or error fetching:', err);
                setRescue(null);
            }

            // 3. Fetch holding animal details if report has/had holding records
            try {
                const holdingRes = await api.get('/holding/');
                const targetReportId = reportResponse.data?.duplicate_of_report_id ? Number(reportResponse.data.duplicate_of_report_id) : Number(id);
                const matchingAnimal = (holdingRes.data || []).find((a: any) => a.report_id === Number(id) || a.report_id === targetReportId);
                if (matchingAnimal) {
                    const detailRes = await api.get(`/holding/${matchingAnimal.holding_id}`);
                    setHoldingAnimal(detailRes.data);
                } else {
                    setHoldingAnimal(null);
                }
            } catch (err) {
                console.log('No holding record for this report or error fetching:', err);
                setHoldingAnimal(null);
            }
        } catch (error) {
            console.error('Error fetching details:', error);
            setReport(null);
            setHoldingAnimal(null);
        } finally {
            setLoading(false);
        }
    };

    const mergedHistory = (() => {
        if (!report) return [];
        const h = [...(report.history || [])];
        if (holdingAnimal && holdingAnimal.timeline) {
            holdingAnimal.timeline.forEach((log: any) => {
                let logMedia = log.media || [];
                if (logMedia.length === 0) {
                    logMedia = report.media?.filter((m: any) => {
                        if (!m.is_evidence) return false;
                        if (m.media_type === 'Document' || (m.file_url && m.file_url.toLowerCase().endsWith('.pdf'))) return false;
                        if (m.status_id === 4) return false;
                        if (m.holding_log_id) return m.holding_log_id === log.log_id;
                        return false;
                    }) || [];
                }
                logMedia = logMedia.filter((m: any) => m && m.file_url && typeof m.file_url === 'string' && m.file_url.trim() !== '' && m.file_url !== 'null' && m.file_url !== 'undefined');

                if (log.event_type === 'intake' || log.event_type === 'transfer') {
                    const existingHistIndex = h.findIndex((rh: any) => {
                        const isFac = rh.report_status_id === 7 || rh.report_status_id === 8 ||
                            (rh.remarks && (rh.remarks.toLowerCase().includes('holding') || rh.remarks.toLowerCase().includes('facility') || rh.remarks.toLowerCase().includes('relocat') || rh.remarks.toLowerCase().includes('transfer')));
                        if (!isFac) return false;
                        const timeDiff = Math.abs(new Date(rh.created_at || rh.timestamp || 0).getTime() - new Date(log.logged_at).getTime());
                        return timeDiff <= 300000;
                    });

                    if (existingHistIndex !== -1) {
                        if (logMedia.length > 0) {
                            const existingMedia = h[existingHistIndex].media || [];
                            const existingIds = new Set(existingMedia.map((m: any) => m.media_id || m.file_url));
                            const freshMedia = logMedia.filter((m: any) => !existingIds.has(m.media_id || m.file_url));
                            h[existingHistIndex].media = [...existingMedia, ...freshMedia];
                        }
                        return;
                    }
                }

                let statusId = 16;
                const titleLower = (log.title || '').toLowerCase();
                if (log.event_type === 'outcome') {
                    if (titleLower.includes('deceased')) statusId = 12;
                    else if (titleLower.includes('claimed')) statusId = 9;
                    else if (titleLower.includes('released')) statusId = 10;
                    else statusId = 11;
                } else if (log.event_type === 'intake') {
                    statusId = 7;
                }

                const fallbackAuthor = (report as any).assigned_leader_name || (report.subdivision_id ? 'Subdivision Officer' : 'Facility Caretaker');
                const effectiveUpdater = log.staff_name || (log.logged_by ? fallbackAuthor : 'System Monitor');

                h.push({
                    history_id: 100000 + log.log_id,
                    report_status_id: statusId,
                    remarks: `${log.title}${log.notes ? ` — ${log.notes}` : ''}`,
                    created_at: log.logged_at,
                    updater_name: effectiveUpdater,
                    media: logMedia
                });
            });
        }

        // Ensure handover/reunion photo is present in the claimed event
        const handoverPhoto = report?.owner_return?.handover_photo_url || 
                              report?.returns?.[0]?.handover_photo_url || 
                              report?.handover_photo_url ||
                              (report?.media || []).find((m: any) => m.status_id === 9 && m.file_url)?.file_url;

        if (handoverPhoto) {
            const isPetReunionItem = (item: any) => {
                if (item.report_status_id === 9 || item.rescue_status_id === 9) return true;
                const rem = (item.remarks || '').toLowerCase();
                if (rem.includes('claimed the report') || rem.includes('report claimed') || rem.includes('officer claimed')) {
                    return false;
                }
                return rem.includes('returned to owner') || 
                       rem.includes('reunited') || 
                       rem.includes('pet received') || 
                       rem.includes('claimed by owner') ||
                       rem.includes('safely claimed') ||
                       rem.includes('safely recovered');
            };

            let claimedIndex = -1;
            for (let i = h.length - 1; i >= 0; i--) {
                if (isPetReunionItem(h[i])) {
                    claimedIndex = i;
                    break;
                }
            }

            // Clean up: if handover photo was erroneously attached to an officer's report-claim entry, remove it
            h.forEach((item: any, idx: number) => {
                if (idx !== claimedIndex && item.media) {
                    item.media = item.media.filter((m: any) => m.file_url !== handoverPhoto);
                }
            });

            if (claimedIndex !== -1) {
                const existingMedia = h[claimedIndex].media || [];
                if (!existingMedia.some((m: any) => m.file_url === handoverPhoto)) {
                    h[claimedIndex].media = [
                        ...existingMedia,
                        {
                            media_id: 999999,
                            file_url: handoverPhoto,
                            media_type: 'Image',
                            uploaded_at: h[claimedIndex].created_at || new Date().toISOString()
                        }
                    ];
                }
            } else if (report?.status_id === 9 || report?.current_status_id === 9) {
                h.push({
                    history_id: 999999,
                    report_status_id: 9,
                    remarks: `Pet safely claimed and reunited with owner${report?.owner_return?.owner_name ? ` (${report.owner_return.owner_name})` : ''}. Custody confirmed.`,
                    created_at: report?.owner_return?.returned_at || report?.updated_at || new Date().toISOString(),
                    updater_name: report?.owner_return?.owner_name || (report as any)?.assigned_leader_name || 'Registered Owner',
                    media: [{
                        media_id: 999999,
                        file_url: handoverPhoto,
                        media_type: 'Image',
                        uploaded_at: report?.updated_at || new Date().toISOString()
                    }]
                });
            }
        }

        return h.sort((a: any, b: any) => new Date(a.created_at || a.timestamp || 0).getTime() - new Date(b.created_at || b.timestamp || 0).getTime());
    })();

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
            case 'false alarm / dismissed':
            case 'dismissed':
                return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'rejected':
                return 'bg-red-50 text-red-600 border-red-100';
            default:
                return 'bg-gray-50 text-gray-600 border-gray-100';
        }
    };

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
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
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

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-36 md:pb-8 custom-scrollbar">
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
                                                <div className="w-12 h-12 rounded-full overflow-hidden border border-gray-200 shadow-xs shrink-0 bg-gray-100 flex items-center justify-center">
                                                    {report.reporter_photo ? (
                                                        <img src={getProfilePicture(report.reporter_photo)} alt={report.reporter_name || 'Reporter'} className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }} />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-lg text-gray-500 font-bold bg-role-soft text-role">
                                                            {(report.reporter_name || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
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
                                                <ReportDescription description={report.description} emptyText="No description provided." />
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
                                            {(() => {
                                                const initLat = report.initial_latitude ? parseFloat(report.initial_latitude.toString()) : (report.latitude ? parseFloat(report.latitude.toString()) : 14.8018);
                                                const initLng = report.initial_longitude ? parseFloat(report.initial_longitude.toString()) : (report.longitude ? parseFloat(report.longitude.toString()) : 121.0028);
                                                const hadHoldingHistory = report.history?.some((h: any) => 
                                                    [7, 8].includes(h.status_id) || [7, 8].includes(h.report_status_id) || 
                                                    (h.notes && (h.notes.toLowerCase().includes('holding facility') || h.notes.toLowerCase().includes('holding pen'))) ||
                                                    (h.action && h.action.toLowerCase().includes('holding'))
                                                ) || Boolean(report.facility_id) || Boolean(report.facility);
                                                const histFacLat = 14.8069;
                                                const histFacLng = 121.0039;
                                                const histFacName = 'Barangay Holding Pen';

                                                const histMarkers = [
                                                    {
                                                        id: report.report_id,
                                                        lat: initLat,
                                                        lng: initLng,
                                                        title: `1. Reported Incident Location: ${report.initial_landmark || report.landmark || 'Incident Location'}`,
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
                                                        id: -1,
                                                        lat: BRGY_OFFICE[0],
                                                        lng: BRGY_OFFICE[1],
                                                        title: "Barangay Hall HQ",
                                                        category: "Barangay Office"
                                                    }
                                                ];

                                                return (
                                                    <MapComponent
                                                        center={[initLat, initLng]}
                                                        zoom={17}
                                                        showHeatmap={false}
                                                        hideViewDetailsButton={true}
                                                        markers={histMarkers}
                                                    />
                                                );
                                            })()}
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
                                            <div className="flex items-center justify-between gap-4 border-b border-gray-50 pb-4">
                                                <div>
                                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">
                                                        Mission & Activity Timeline
                                                    </h3>
                                                    <p className="text-[10px] font-bold text-gray-500 mt-0.5">
                                                        Official Audit Trail & Officer Activity Log
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {(() => {
                                                        const validHistory = (report.history || []).filter((h: any) => h.report_status_id !== 1);
                                                        const holdingCount = (holdingAnimal && holdingAnimal.timeline) ? holdingAnimal.timeline.length : 0;
                                                        const totalEvents = validHistory.length + holdingCount + 1;
                                                        return (
                                                            <span className="text-[10px] font-black text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full border border-gray-200">
                                                                {totalEvents} {totalEvents === 1 ? 'Event' : 'Events'}
                                                            </span>
                                                        );
                                                    })()}
                                                    <div className="flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full border border-green-100">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                                        <span className="text-[8px] font-black text-green-600 uppercase tracking-widest">Live</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="pl-1">
                                                <RescueTimeline
                                                    history={mergedHistory}
                                                    currentStatusId={report.status_id}
                                                    assignedLeaderName={report.assigned_leader_name || undefined}
                                                    reporterName={report.reporter_name}
                                                    reportCreatedAt={report.created_at}
                                                    animalType={report.animal_type}
                                                    landmark={report.landmark}
                                                    endorsementLetter={report.endorsement_letter}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </main>
                <SubdBottomNav />
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
                            {(() => {
                                const initLat = report.initial_latitude ? parseFloat(report.initial_latitude.toString()) : (report.latitude ? parseFloat(report.latitude.toString()) : 14.8018);
                                const initLng = report.initial_longitude ? parseFloat(report.initial_longitude.toString()) : (report.longitude ? parseFloat(report.longitude.toString()) : 121.0028);
                                const hadHoldingHistory = report.history?.some((h: any) => 
                                    [7, 8].includes(h.status_id) || [7, 8].includes(h.report_status_id) || 
                                    (h.notes && (h.notes.toLowerCase().includes('holding facility') || h.notes.toLowerCase().includes('holding pen'))) ||
                                    (h.action && h.action.toLowerCase().includes('holding'))
                                ) || Boolean(report.facility_id) || Boolean(report.facility);
                                const histFacLat = 14.8069;
                                const histFacLng = 121.0039;
                                const histFacName = 'Barangay Holding Pen';

                                const histMarkers = [
                                    {
                                        id: report.report_id,
                                        lat: initLat,
                                        lng: initLng,
                                        title: `1. Reported Incident Location: ${report.initial_landmark || report.landmark || 'Incident Location'}`,
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
                                        id: -1,
                                        lat: BRGY_OFFICE[0],
                                        lng: BRGY_OFFICE[1],
                                        title: "Barangay Hall HQ",
                                        category: "Barangay Office"
                                    }
                                ];

                                return (
                                    <MapComponent
                                        height="100%"
                                        center={[initLat, initLng]}
                                        zoom={18}
                                        showHeatmap={false}
                                        markers={histMarkers}
                                    />
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubdViewHistory;
