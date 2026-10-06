import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
    ArrowLeft, MapPin, Calendar, AlertTriangle,
    CheckCircle2, Zap, Trash2, Eye, MessageCircle, ChevronRight,
    Phone, Mail, Sparkles, Navigation, X, Check,
    Building2, Activity, AlertOctagon, Clock, Shield,
    UserCheck, Timer,
    FileText, Plus, AlertCircle, ShieldAlert, FileCheck
} from 'lucide-react';
import axios from 'axios';
import { api } from '../../utils/api';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import RelativeTimestamp from '../../components/RelativeTimestamp';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import { REPORT_STATUS_MAP, getReportStatusLabel, getReportStatusBadgeStyle } from '../../utils/reportStatus';
import { getCachedData, invalidateCache } from '../../utils/cache';
import ReportChatDrawer from '../../components/Chat/ReportChatDrawer';
import { SELERA_POLYGON_BOUNDS, SELERA_BOUNDARY_PATH_OPTIONS, SAN_VICENTE_HQ, isValidLatLng } from '../../utils/coverageArea';
import { MapContainer, TileLayer, Marker, Popup, Polygon } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet icon
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { printElementById } from '../../utils/exportUtils';

import MapAutoResize from '../../components/MapControls/MapAutoResize';
const DefaultIcon = L.icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIconRetina,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

interface ReportMedia {
    media_id?: number;
    file_url?: string;
    url?: string;
    thumbnail_url?: string;
    media_type?: string;
    is_evidence?: boolean;
    created_at?: string;
}

interface StatusHistoryItem {
    history_id?: number;
    previous_status_id?: number;
    new_status_id?: number;
    report_status_id?: number;
    rescue_status_id?: number;
    remarks?: string;
    changed_by?: number;
    created_at: string;
    updater_name?: string;
    updater_photo?: string;
    facility_id?: number;
    facility_name?: string;
    landmark?: string;
    updater?: {
        user_id?: number;
        name?: string;
        email?: string;
        role_id?: number;
    };
    media?: any[];
}

interface HoldingTimelineItem {
    log_id: number;
    holding_id: number;
    event_type: string;
    title: string;
    notes?: string | null;
    logged_by?: number | null;
    staff_name?: string | null;
    logged_at: string;
    media?: any[];
}

interface HoldingAnimalDetails {
    holding_id: number;
    report_id: number;
    rescue_id?: number | null;
    facility_id?: number | null;
    facility_name?: string | null;
    facility_type?: string | null;
    subdivision_id?: number | null;
    barangay_id?: number | null;
    animal_type?: string | null;
    animal_name?: string | null;
    breed?: string | null;
    color?: string | null;
    estimated_size?: string | null;
    facility_status: number;
    facility_status_name?: string | null;
    kennel_slot?: string | null;
    medical_notes?: string | null;
    intake_date?: string | null;
    discharge_date?: string | null;
    intake_staff_id?: number | null;
    intake_staff_name?: string | null;
    subd_intake_date?: string | null;
    subd_discharge_date?: string | null;
    subd_duration_days?: number | null;
    subd_duration_display?: string | null;
    brgy_intake_date?: string | null;
    brgy_discharge_date?: string | null;
    brgy_duration_days?: number | null;
    brgy_duration_display?: string | null;
    total_duration_days?: number | null;
    total_duration_display?: string | null;
    current_facility_duration_display?: string | null;
    custody_status?: string | null;
    is_escalated?: boolean;
    escalation_status?: string | null;
    timeline: HoldingTimelineItem[];
}

interface ReportDetails {
    report_id: number;
    subdivision_name?: string | null;
    barangay_name?: string | null;
    municipality_city?: string | null;
    province?: string | null;
    category_id: number;
    status_id: number;
    priority_level: string;
    latitude: number;
    longitude: number;
    landmark: string;
    location_address?: string | null;
    animal_count: number;
    animal_type?: string;
    breed?: string;
    animal_breed?: string;
    animal_color?: string;
    condition?: string;
    animal_condition?: string;
    behavior_tags?: string | string[];
    description: string;
    visibility: string;
    created_at: string;
    user_id: number;
    reporter_name?: string;
    reporter_photo?: string;
    reporter_phone?: string;
    reporter_email?: string;
    reporter?: {
        user_id: number;
        name?: string;
        email?: string;
        phone_number?: string;
        profile_picture?: string;
    };
    subdivision_id?: number;
    subdivision?: {
        subdivision_id?: number;
        subdivision_name?: string;
    };
    assigned_leader_id?: number | null;
    assigned_leader_name?: string | null;
    assigned_leader?: {
        user_id: number;
        name?: string;
        email?: string;
        profile_picture?: string;
    };
    assigned_staff_id?: number | null;
    assigned_staff_name?: string | null;
    claimed_at?: string | null;
    media?: ReportMedia[];
    history?: StatusHistoryItem[];
    facility_id?: number | null;
    facility?: {
        landmark_id?: number;
        name?: string;
        category?: string;
        facility_type?: string;
        capacity?: number;
        contact_person?: string;
        contact_number?: string;
    } | null;
    custody_status?: string | null;
    endorsement_letter?: {
        letter_id?: number;
        report_id?: number;
        leader_id?: number;
        title?: string;
        letter_content?: string;
        file_url?: string;
        status_id?: number;
        issued_at?: string;
        leader_name?: string;
        leader_position?: string;
    } | string | null;
    ai_animal_type?: string | null;
    ai_dominant_color?: string | null;
    ai_coat_pattern?: string | null;
    ai_estimated_size?: string | null;
    ai_possible_breed?: string | null;
    ai_suggested_risk_level?: string | null;
    ai_suggested_priority?: string | null;
    ai_suggested_priority_reason?: string | null;
    verification_status?: string | null;
    verification_notes?: string | null;
    verified_by_name?: string | null;
    verified_at?: string | null;
    false_alarm_reason?: string | null;
    has_duplicate_flag?: boolean;
    duplicate_of_report_id?: number | null;
    duplicate_match_count?: number;
}

const categoryMap: Record<number, string> = {
    1: 'Injured Animal',
    2: 'Aggressive Stray',
    3: 'Possible Rabies Risk',
    4: 'Roaming Pack',
    5: 'Animal Rescue Needed',
    6: 'Lost Pet'
};

const getConditionBadgeStyle = (condition?: string) => {
    const c = (condition || '').toLowerCase();
    if (c.includes('rabies') || c.includes('aggressive') || c.includes('chasing') || c.includes('bite')) {
        return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (c.includes('injured') || c.includes('bleeding') || c.includes('limping') || c.includes('weak') || c.includes('sick') || c.includes('trapped')) {
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    if (c.includes('deceased')) {
        return 'bg-stone-100 text-stone-700 border-stone-300';
    }
    if (c.includes('healthy')) {
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    return 'bg-slate-50 text-slate-700 border-slate-200';
};

const formatDateTime = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

const getPriorityBadgeStyle = (priority?: string) => {
    const p = (priority || '').toLowerCase();
    if (['emergency', 'critical', 'high'].includes(p)) {
        return 'bg-rose-50 text-rose-700 border-rose-200';
    }
    if (['medium', 'regular'].includes(p)) {
        return 'bg-amber-50 text-amber-700 border-amber-200';
    }
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
};

const getRoleBadge = (roleId?: number, updaterName?: string, remarks?: string) => {
    const text = `${updaterName || ''} ${remarks || ''}`.toLowerCase();
    if (roleId === 4 || text.includes('administrator') || text.includes('admin override') || text.includes('system admin') || text.includes('admin')) {
        return { label: 'System Admin', bg: 'bg-purple-100 text-purple-800 border-purple-200', icon: '⚡' };
    }
    if (roleId === 3 || text.includes('barangay') || text.includes('brgy') || text.includes('municipal')) {
        return { label: 'Barangay Staff', bg: 'bg-blue-100 text-blue-800 border-blue-200', icon: '🏛️' };
    }
    if (roleId === 2 || text.includes('subdivision') || text.includes('leader') || text.includes('hoa') || text.includes('selera')) {
        return { label: 'Subd. Leader', bg: 'bg-amber-100 text-amber-800 border-amber-200', icon: '🛡️' };
    }
    if (roleId === 1 || text.includes('resident') || text.includes('citizen')) {
        return { label: 'Resident', bg: 'bg-slate-100 text-slate-700 border-slate-200', icon: '👤' };
    }
    return { label: 'Officer / Staff', bg: 'bg-slate-100 text-slate-700 border-slate-200', icon: '🛡️' };
};

const getActionTitle = (statusId?: number, remarks?: string) => {
    const rem = (remarks || '').toLowerCase();
    if (rem.includes('verified') || rem.includes('verification')) return 'FIELD VERIFICATION COMPLETED';
    if (rem.includes('escalat') || rem.includes('endorse')) return 'OFFICIAL ESCALATION / ENDORSEMENT';
    if (rem.includes('picked up') || rem.includes('secured')) return 'ANIMAL PICKED UP / SECURED';
    if (rem.includes('holding') || rem.includes('pen') || rem.includes('admitted')) return 'ADMITTED TO HOLDING FACILITY';
    if (rem.includes('observation') || statusId === 7) return 'TRANSFERRED TO OBSERVATION';
    if (rem.includes('direct action') || rem.includes('override') || rem.includes('admin')) return 'ADMIN DIRECT STATUS OVERRIDE';
    if (rem.includes('resolved') || statusId === 11) return 'INCIDENT RESOLVED';
    if (statusId === 1) return 'INCIDENT REPORT FILED';
    if (statusId === 2) return 'INCIDENT VERIFIED';
    if (statusId === 4) return 'ESCALATED TO BARANGAY';
    if (statusId === 5) return 'RESCUERS DISPATCHED';
    if (statusId === 6) return 'ANIMAL PICKED UP';
    if (statusId === 8) return 'TRANSFERRED TO IMPOUND';
    if (statusId === 14) return 'DISMISSED AS FALSE ALARM';
    return REPORT_STATUS_MAP[statusId || 1] || 'STATUS UPDATED';
};

const getCareEventMeta = (eventType?: string) => {
    switch (eventType) {
        case 'feeding':
            return { title: 'FEEDING & HYDRATION', icon: '🥣', color: 'bg-amber-50 text-amber-800 border-amber-200' };
        case 'medical':
            return { title: 'MEDICAL ASSESSMENT', icon: '💊', color: 'bg-purple-50 text-purple-800 border-purple-200' };
        case 'treatment':
            return { title: 'WOUND & HEALTH TREATMENT', icon: '🩺', color: 'bg-pink-50 text-pink-800 border-pink-200' };
        case 'transfer':
            return { title: 'FACILITY TRANSFER / RELOCATION', icon: '🚚', color: 'bg-indigo-50 text-indigo-800 border-indigo-200' };
        case 'intake':
            return { title: 'FACILITY ADMISSION', icon: '🐾', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
        default:
            return { title: 'OBSERVATION NOTE', icon: '📋', color: 'bg-slate-50 text-slate-800 border-slate-200' };
    }
};

const STAGES = [
    { id: 1, label: 'Reported' },
    { id: 2, label: 'Verified' },
    { id: 5, label: 'Dispatched' },
    { id: 6, label: 'Picked Up' },
    { id: 7, label: 'Observation' },
    { id: 11, label: 'Resolved' }
];

export const AdminReportView: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();

    const [report, setReport] = useState<ReportDetails | null>(() => {
        if (!id) return null;
        const cached = getCachedData<ReportDetails[]>('admin_reports_list') || [];
        return cached.find(r => r.report_id.toString() === id.toString()) || null;
    });
    const [holdingRecord, setHoldingRecord] = useState<HoldingAnimalDetails | null>(null);
    const [loading, setLoading] = useState<boolean>(!report);
    const [activeMediaIndex, setActiveMediaIndex] = useState<number>(0);
    const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
    const [resolvedAddress, setResolvedAddress] = useState<string>('');
    const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
    const [isEndorsementModalOpen, setIsEndorsementModalOpen] = useState<boolean>(false);
    const [timelineFilter, setTimelineFilter] = useState<'all' | 'status' | 'care'>('all');

    // Care log modal state
    const [isCareLogModalOpen, setIsCareLogModalOpen] = useState<boolean>(false);
    const [careLogEventType, setCareLogEventType] = useState<'observation' | 'feeding' | 'medical' | 'treatment' | 'transfer'>('observation');
    const [careLogTitle, setCareLogTitle] = useState<string>('');
    const [careLogNotes, setCareLogNotes] = useState<string>('');
    const [isSubmittingCareLog, setIsSubmittingCareLog] = useState<boolean>(false);

    // Direct Action / Override Modal state
    const [isActionModalOpen, setIsActionModalOpen] = useState<boolean>(false);
    const [targetStatusId, setTargetStatusId] = useState<number>(5);
    const [selectedStaffId, setSelectedStaffId] = useState<number | ''>('');
    const [actionRemarks, setActionRemarks] = useState<string>('');
    const [staffList, setStaffList] = useState<Array<{ user_id: number; name: string; email: string; role_id: number }>>([]);
    const [isSubmittingAction, setIsSubmittingAction] = useState<boolean>(false);

    const userStr = localStorage.getItem('admin_user') || localStorage.getItem('user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const currentUserId = currentUser ? currentUser.user_id : 1;

    const fetchReport = async () => {
        if (!id) return;
        try {
            const [res, holdingRes] = await Promise.allSettled([
                api.get(`/reports/${id}`),
                api.get(`/holding/?report_id=${id}`)
            ]);

            if (res.status === 'fulfilled') {
                const data: ReportDetails = res.value.data;
                setReport(data);

                // Reverse geocode if coordinates available
                if (data.latitude && data.longitude) {
                    try {
                        const geoRes = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                            params: {
                                format: 'jsonv2',
                                lat: data.latitude,
                                lon: data.longitude,
                                addressdetails: 1
                            },
                            headers: { 'Accept-Language': 'en' },
                            timeout: 5000
                        });
                        if (geoRes.data?.address) {
                            const addr = geoRes.data.address;
                            const parts = [addr.road || addr.pedestrian || addr.path, addr.neighbourhood || addr.suburb || addr.village, addr.city || addr.town || addr.municipality].filter(Boolean);
                            setResolvedAddress(parts.join(', ') || geoRes.data.display_name);
                        } else {
                            setResolvedAddress(data.landmark || 'Location not named');
                        }
                    } catch {
                        setResolvedAddress(data.landmark || `${data.latitude.toFixed(5)}, ${data.longitude.toFixed(5)}`);
                    }
                }
            }

            if (holdingRes.status === 'fulfilled') {
                const hData = holdingRes.value.data;
                if (Array.isArray(hData) && hData.length > 0) {
                    setHoldingRecord(hData[0]);
                } else if (hData && typeof hData === 'object' && (hData as any).holding_id) {
                    setHoldingRecord(hData as HoldingAnimalDetails);
                } else {
                    // Fallback search
                    try {
                        const allH = await api.get('/holding/');
                        if (Array.isArray(allH.data)) {
                            const match = allH.data.find((h: any) => h.report_id === Number(id));
                            setHoldingRecord(match || null);
                        }
                    } catch {}
                }
            }
        } catch (err) {
            console.error('Failed to fetch report details:', err);
        } finally {
            setLoading(false);
        }
    };

    const fetchStaffList = async () => {
        try {
            const res = await api.get('/users/');
            const users = Array.isArray(res.data) ? res.data : [];
            const staff = users.filter((u: any) => u.role_id === 3 || u.role_id === 2);
            setStaffList(staff.length > 0 ? staff : users);
            if (staff.length > 0 && !selectedStaffId) {
                setSelectedStaffId(staff[0].user_id);
            }
        } catch (e) {
            console.error('Error fetching staff list:', e);
        }
    };

    useEffect(() => {
        if (id) {
            try {
                const viewed = JSON.parse(localStorage.getItem('straysafe_viewed_admin_reports') || '[]');
                const reportIdNum = Number(id);
                if (!viewed.includes(reportIdNum)) {
                    const updatedViewed = Array.from(new Set([...viewed, reportIdNum]));
                    localStorage.setItem('straysafe_viewed_admin_reports', JSON.stringify(updatedViewed));
                    window.dispatchEvent(new Event('straysafe_admin_viewed'));
                }
            } catch (e) {
                console.warn('Could not mark admin report as viewed', e);
            }
        }
        fetchReport();
        fetchStaffList();
    }, [id]);

    const handleSaveCareLog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!holdingRecord) return;
        try {
            setIsSubmittingCareLog(true);
            await api.post(`/holding/${holdingRecord.holding_id}/timeline`, {
                event_type: careLogEventType,
                title: careLogTitle.trim(),
                notes: careLogNotes.trim() || undefined
            });
            setIsCareLogModalOpen(false);
            setCareLogTitle('');
            setCareLogNotes('');
            await fetchReport();
            alert('Care log successfully recorded to animal custody timeline.');
        } catch (err: any) {
            console.error('Failed to log care entry:', err);
            alert(err.response?.data?.detail || 'Failed to record care log.');
        } finally {
            setIsSubmittingCareLog(false);
        }
    };

    const handleApplyAction = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!report) return;

        try {
            setIsSubmittingAction(true);
            const payload: any = {
                status_id: targetStatusId,
                remarks: actionRemarks.trim() || undefined
            };

            if (selectedStaffId) {
                payload.assigned_staff_id = Number(selectedStaffId);
            }

            await api.put(`/reports/${report.report_id}/status`, payload);
            invalidateCache('admin_reports_list');
            invalidateCache('admin_dashboard_stats');

            setIsActionModalOpen(false);
            setActionRemarks('');
            await fetchReport();
            alert('Incident status updated directly by Administrator.');
        } catch (error: any) {
            console.error('Error applying direct action:', error);
            alert(error.response?.data?.detail || 'Failed to update status.');
        } finally {
            setIsSubmittingAction(false);
        }
    };

    const handleFastStatusChange = async (statusId: number, remarks: string) => {
        if (!report) return;
        const confirmMsg = `Are you sure you want to mark this incident as "${REPORT_STATUS_MAP[statusId] || 'Updated'}"?`;
        if (!window.confirm(confirmMsg)) return;

        try {
            await api.patch(`/reports/${report.report_id}/status`, {
                status_id: statusId,
                remarks
            });
            invalidateCache('admin_reports_list');
            invalidateCache('admin_dashboard_stats');
            await fetchReport();
        } catch (err: any) {
            console.error('Error updating status:', err);
            alert(err.response?.data?.detail || 'Failed to update incident status.');
        }
    };

    const handleDeleteReport = async () => {
        if (!report) return;
        if (window.confirm(`Are you sure you want to permanently delete Incident Report #${report.report_id.toString().padStart(4, '0')}? This action cannot be undone.`)) {
            try {
                await api.delete(`/reports/${report.report_id}`);
                invalidateCache('admin_reports_list');
                invalidateCache('admin_dashboard_stats');
                alert('Report deleted successfully.');
                navigate('/admin/incidents');
            } catch (err: any) {
                console.error('Error deleting report:', err);
                alert(err.response?.data?.detail || 'Failed to delete report.');
            }
        }
    };

    if (loading) {
        return (
            <div className="flex h-screen bg-[#F8FAFC]">
                <AdminSidebar />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <AdminNavbar />
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-10 h-10 border-3 border-[#F97316] border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs font-black uppercase tracking-wider text-slate-500">Loading incident dossier...</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="flex h-screen bg-[#F8FAFC]">
                <AdminSidebar />
                <div className="flex-1 flex flex-col overflow-hidden">
                    <AdminNavbar />
                    <div className="flex-1 flex items-center justify-center p-8">
                        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-200 text-center shadow-sm">
                            <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
                            <h2 className="text-lg font-black text-slate-900">Incident Dossier Not Found</h2>
                            <p className="text-xs text-slate-500 mt-1 mb-6">The requested report ID #{id} does not exist or has been removed from the registry.</p>
                            <button
                                onClick={() => navigate('/admin/incidents')}
                                className="px-5 py-2.5 rounded-xl bg-[#F97316] text-white text-xs font-black uppercase tracking-wider shadow-sm hover:bg-[#ea580c] transition-all"
                            >
                                Return to Incident Reports
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const mediaList = (report.media || []).filter(m => {
        const url = (m.file_url || m.url || '').toLowerCase();
        return !url.endsWith('.pdf') && !url.endsWith('.docx') && !url.endsWith('.doc');
    });
    const currentMedia = mediaList[activeMediaIndex] || mediaList[0] || null;
    const currentMediaUrl = currentMedia?.file_url || currentMedia?.url || null;
    const isVideo = currentMedia?.media_type === 'Video' || currentMediaUrl?.toLowerCase().match(/\.(mp4|mov|webm)$/i);

    const animalCondition = report.condition || report.animal_condition || 'Healthy';
    const effectivePriority = report.priority_level || 'Medium';
    const isTerminalStatus = [3, 9, 10, 11, 12, 14, 17, 18].includes(report.status_id);

    // Active stage index in progress tracker
    const activeStageIndex = (() => {
        if ([11, 9, 10].includes(report.status_id)) return 5;
        if ([7, 8].includes(report.status_id)) return 4;
        if (report.status_id === 6) return 3;
        if ([5, 13].includes(report.status_id)) return 2;
        if ([2, 4].includes(report.status_id)) return 1;
        return 0; // Reported
    })();

    // Rabies observation watchdog calculation
    const isRabiesRisk = useMemo(() => {
        if (!report) return false;
        const isBiteCat = report.category_id === 2 || report.category_id === 3;
        const hasBiteRemark = (report.description || '').toLowerCase().includes('bite') || 
                              (report.behavior_tags ? String(report.behavior_tags).toLowerCase().includes('bite') : false);
        return isBiteCat || hasBiteRemark || report.status_id === 7;
    }, [report]);

    const rabiesQuarantineData = useMemo(() => {
        if (!report || !isRabiesRisk) return null;
        const standardWindowDays = 14; // Standard rabies clinical observation window under RA 9482
        const baseDate = holdingRecord?.intake_date || holdingRecord?.subd_intake_date || report.created_at;
        const startMs = new Date(baseDate).getTime();
        const nowMs = Date.now();
        const elapsedDays = Math.max(0, Math.floor((nowMs - startMs) / (1000 * 60 * 60 * 24)));
        const remainingDays = Math.max(0, standardWindowDays - elapsedDays);
        const percentCompleted = Math.min(100, Math.round((elapsedDays / standardWindowDays) * 100));
        const isCompleted = remainingDays === 0;

        return {
            standardWindowDays,
            elapsedDays,
            remainingDays,
            percentCompleted,
            isCompleted,
            startDate: baseDate
        };
    }, [report, holdingRecord, isRabiesRisk]);

    // Unified Operational Audit Trail combining Status History & Holding Care Events
    const unifiedTimeline = useMemo(() => {
        const list: Array<{
            id: string;
            type: 'status' | 'care';
            timestamp: string;
            title: string;
            authorName: string;
            roleInfo: { label: string; bg: string; icon: string };
            notes?: string | null;
            eventType?: string;
            media?: any[];
            facilityName?: string | null;
            isOverride?: boolean;
        }> = [];

        // 1. Report Status History
        if (report?.history && report.history.length > 0) {
            report.history.forEach((h, idx) => {
                const rem = (h.remarks || '').trim();
                const updaterName = h.updater?.name || (h as any).updater_name || 'Subdivision / Municipal Staff';
                const roleId = h.updater?.role_id;
                const roleInfo = getRoleBadge(roleId, updaterName, rem);
                const title = getActionTitle(h.new_status_id || (h as any).report_status_id, rem);
                const isOverride = rem.toLowerCase().includes('admin') || rem.toLowerCase().includes('override') || roleId === 4;

                list.push({
                    id: `status-${h.history_id || idx}`,
                    type: 'status',
                    timestamp: h.created_at,
                    title,
                    authorName: updaterName,
                    roleInfo,
                    notes: rem || null,
                    media: h.media,
                    facilityName: h.facility_name,
                    isOverride
                });
            });
        }

        // 2. Holding Facility Care Timeline
        if (holdingRecord?.timeline && holdingRecord.timeline.length > 0) {
            holdingRecord.timeline.forEach((log, idx) => {
                const author = log.staff_name || 'Facility Caretaker';
                const eventType = log.event_type || 'observation';
                const meta = getCareEventMeta(eventType);

                list.push({
                    id: `care-${log.log_id || idx}`,
                    type: 'care',
                    timestamp: log.logged_at,
                    title: log.title || meta.title,
                    authorName: author,
                    roleInfo: { label: 'Facility Caretaker', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: '🐾' },
                    notes: log.notes || null,
                    eventType,
                    media: log.media
                });
            });
        }

        // Sort descending (newest first)
        list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        return list;
    }, [report?.history, holdingRecord?.timeline]);

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <AdminSidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
                <AdminNavbar
                    leftContent={
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => navigate('/admin/incidents')}
                                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-2xs"
                                title="Back to Reports"
                            >
                                <ArrowLeft className="w-4 h-4" />
                            </button>
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono font-bold text-slate-400">
                                        #{report.report_id.toString().padStart(4, '0')}
                                    </span>
                                    <h1 className="text-lg font-black text-slate-900 tracking-tight leading-none">
                                        {categoryMap[report.category_id] || report.animal_type || 'Incident Details'}
                                    </h1>
                                </div>
                                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-bold mt-1">
                                    <Link to="/admin/incidents" className="hover:text-slate-600">Incident Reports</Link>
                                    <ChevronRight className="w-3 h-3 text-slate-300" />
                                    <span className="text-slate-600">Dossier #{report.report_id}</span>
                                </div>
                            </div>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-6 lg:p-8">
                    <div className="max-w-7xl mx-auto space-y-6">

                        {/* Top Banner Card: ID, Badges, Direct Actions */}
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex flex-wrap items-center gap-2.5">
                                {/* Canonical Status Badge */}
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border shadow-2xs ${getReportStatusBadgeStyle(report.status_id)}`}>
                                    <span className="w-2 h-2 rounded-full bg-current opacity-80" />
                                    <span>{getReportStatusLabel(report.status_id)}</span>
                                </span>

                                {/* Priority Badge */}
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border shadow-2xs ${getPriorityBadgeStyle(effectivePriority)}`}>
                                    <AlertOctagon className="w-3.5 h-3.5" />
                                    <span>{effectivePriority} Priority</span>
                                </span>

                                {/* Animal Condition Badge */}
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border shadow-2xs ${getConditionBadgeStyle(animalCondition)}`}>
                                    <Activity className="w-3.5 h-3.5" />
                                    <span>Animal: {animalCondition}</span>
                                </span>

                                {/* Duplicate Flag */}
                                {report.has_duplicate_flag && (
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                                        <span>⚠️</span>
                                        <span>Duplicate Flagged</span>
                                    </span>
                                )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => setIsChatOpen(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wider border border-slate-200 transition-all shadow-2xs"
                                    title="Open Incident Chat"
                                >
                                    <MessageCircle className="w-3.5 h-3.5 text-[#F97316]" />
                                    <span>Live Chat</span>
                                </button>

                                <button
                                    onClick={() => {
                                        setTargetStatusId(report.status_id < 5 ? 5 : report.status_id);
                                        setIsActionModalOpen(true);
                                    }}
                                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-black uppercase tracking-wider border border-amber-200 transition-all shadow-2xs"
                                >
                                    <Zap className="w-3.5 h-3.5 text-amber-600" />
                                    <span>Direct Override</span>
                                </button>

                                {!isTerminalStatus && (
                                    <button
                                        onClick={() => handleFastStatusChange(11, 'Incident marked resolved by System Administrator.')}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-all shadow-xs"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                        <span>Mark Resolved</span>
                                    </button>
                                )}

                                <button
                                    onClick={handleDeleteReport}
                                    className="p-2 rounded-xl hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-200 transition-all"
                                    title="Delete Incident Dossier"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Progression Stage Pipeline Tracker */}
                        <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Incident Response Pipeline</h3>
                                    <p className="text-[11px] text-slate-400 font-medium">Standard emergency workflow from report filing to resolution</p>
                                </div>
                                <span className="text-[11px] font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200/60">
                                    Stage {activeStageIndex + 1} of {STAGES.length}
                                </span>
                            </div>

                            <div className="relative pt-2 pb-2">
                                <div className="absolute top-5 left-6 right-6 h-1 bg-slate-100 -z-0 rounded-full">
                                    <div
                                        className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-emerald-500 transition-all duration-500 rounded-full"
                                        style={{ width: `${(activeStageIndex / (STAGES.length - 1)) * 100}%` }}
                                    />
                                </div>

                                <div className="flex justify-between items-center relative z-10">
                                    {STAGES.map((stage, idx) => {
                                        const isCompleted = idx < activeStageIndex;
                                        const isCurrent = idx === activeStageIndex;
                                        return (
                                            <div key={stage.id} className="flex flex-col items-center">
                                                <div
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all ${
                                                        isCurrent
                                                            ? 'bg-[#F97316] text-white ring-4 ring-orange-100 shadow-sm scale-110'
                                                            : isCompleted
                                                            ? 'bg-emerald-500 text-white shadow-2xs'
                                                            : 'bg-white text-slate-400 border-2 border-slate-200'
                                                    }`}
                                                >
                                                    {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                                                </div>
                                                <span className={`text-[10.5px] mt-2 font-black uppercase tracking-wider ${
                                                    isCurrent ? 'text-[#F97316]' : isCompleted ? 'text-slate-800' : 'text-slate-400'
                                                }`}>
                                                    {stage.label}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Animal Custody Telemetry & Multi-Jurisdictional Care Monitor */}
                        {holdingRecord ? (
                            <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-6">
                                {/* Header with Active Enclosure Badges */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold text-lg shadow-2xs">
                                            🐾
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                                    Animal Custody Telemetry & Multi-Jurisdictional Care Monitor
                                                </h3>
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                    Active Custody
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                                Subdivision holding pen metrics, municipal stay timers, and on-site welfare monitoring
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        {/* Current Facility Pill */}
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-indigo-700 bg-indigo-50 border border-indigo-200">
                                            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                                            <span>{holdingRecord.facility_name || report.facility?.name || 'Designated Holding Facility'}</span>
                                        </span>

                                        {/* Kennel Slot Pill */}
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-amber-700 bg-amber-50 border border-amber-200">
                                            <span>Enclosure:</span>
                                            <span className="text-slate-900">{holdingRecord.kennel_slot || 'Temporary Enclosure'}</span>
                                        </span>

                                        {/* Facility Status */}
                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black text-emerald-700 bg-emerald-50 border border-emerald-200">
                                            <Activity className="w-3.5 h-3.5 text-emerald-600" />
                                            <span>{holdingRecord.facility_status_name || (holdingRecord.facility_status === 1 ? 'Needs Treatment' : 'Healthy')}</span>
                                        </span>
                                    </div>
                                </div>

                                {/* 3-Column Stay Duration & Care Telemetry Matrix */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* 1. Subdivision Care & Stay */}
                                    <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50/60 to-orange-50/30 border border-amber-200/70 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 flex items-center gap-1">
                                                <Shield className="w-3 h-3" />
                                                <span>Subdivision Holding Pen</span>
                                            </span>
                                            <span className="text-[9.5px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-800">
                                                HOA Care
                                            </span>
                                        </div>
                                        <div className="text-xl font-black text-slate-900 tracking-tight">
                                            {holdingRecord.subd_duration_display || '0 minutes'}
                                        </div>
                                        <div className="pt-1 border-t border-amber-200/50 space-y-1 text-[11px] text-slate-600">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">Intake:</span>
                                                <span className="font-bold">{holdingRecord.subd_intake_date ? formatDateTime(holdingRecord.subd_intake_date) : 'Not in Subdivision Pen'}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">Caretaker:</span>
                                                <span className="font-bold truncate max-w-[150px]">{holdingRecord.intake_staff_name || report.assigned_leader_name || 'Subdivision Leader'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 2. Barangay Municipal Custody */}
                                    <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/60 to-indigo-50/30 border border-blue-200/70 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-700 flex items-center gap-1">
                                                <Building2 className="w-3 h-3" />
                                                <span>Barangay Municipal Facility</span>
                                            </span>
                                            <span className="text-[9.5px] font-black px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                                                Municipal Care
                                            </span>
                                        </div>
                                        <div className="text-xl font-black text-slate-900 tracking-tight">
                                            {holdingRecord.brgy_duration_display || '0 minutes'}
                                        </div>
                                        <div className="pt-1 border-t border-blue-200/50 space-y-1 text-[11px] text-slate-600">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">Intake:</span>
                                                <span className="font-bold">{holdingRecord.brgy_intake_date ? formatDateTime(holdingRecord.brgy_intake_date) : 'Pending Barangay Intake'}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">Care Staff:</span>
                                                <span className="font-bold truncate max-w-[150px]">Municipal Animal Control</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Total Cumulative Custody Time */}
                                    <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-50/40 border border-slate-200 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 flex items-center gap-1">
                                                <Timer className="w-3 h-3 text-emerald-600" />
                                                <span>Total Custody Time</span>
                                            </span>
                                            <span className="text-[9.5px] font-black px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
                                                Total Care
                                            </span>
                                        </div>
                                        <div className="text-xl font-black text-emerald-900 tracking-tight">
                                            {holdingRecord.total_duration_display || '0 minutes'}
                                        </div>
                                        <div className="pt-1 border-t border-slate-200 space-y-1 text-[11px] text-slate-600">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">Oversight:</span>
                                                <span className="font-bold text-emerald-700">Official Jurisdiction</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-400">Custody Status:</span>
                                                <span className="font-bold">{holdingRecord.custody_status || (report.status_id >= 6 ? 'Secured in Custody' : 'In Field Transit')}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Active Rabies Quarantine Watchdog (Mandatory Clinical Window under RA 9482) */}
                                {isRabiesRisk && rabiesQuarantineData && (
                                    <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 via-orange-50 to-amber-50 border border-rose-200/80 space-y-3">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-xl bg-rose-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                                                    <ShieldAlert className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-xs font-black text-rose-950 uppercase tracking-wider">
                                                            Mandatory Rabies Observation Watchdog (RA 9482)
                                                        </h4>
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${rabiesQuarantineData.isCompleted ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-rose-100 text-rose-800 border-rose-300'}`}>
                                                            {rabiesQuarantineData.isCompleted ? '✓ Quarantine Cleared / Asymptomatic' : '⏳ Active Clinical Watch'}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-rose-800 font-medium">
                                                        Mandated observation period for bite or high-risk aggressive animals to verify clinical rabies status before release or adoption.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className="text-xs font-black text-rose-900">
                                                    {rabiesQuarantineData.remainingDays > 0 ? `${rabiesQuarantineData.remainingDays} days remaining` : 'Quarantine Window Complete'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Progress Bar */}
                                        <div className="space-y-1">
                                            <div className="w-full h-2.5 bg-rose-200/60 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-orange-500 to-rose-600 transition-all duration-500 rounded-full"
                                                    style={{ width: `${rabiesQuarantineData.percentCompleted}%` }}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center text-[10px] font-bold text-rose-700">
                                                <span>Elapsed: {rabiesQuarantineData.elapsedDays} day(s) since intake</span>
                                                <span>Target: {rabiesQuarantineData.standardWindowDays} Days Mandatory Quarantine</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Daily Welfare & Caring Stream */}
                                <div className="space-y-3 pt-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-7 h-7 rounded-lg bg-orange-50 text-[#F97316] flex items-center justify-center font-bold text-xs">
                                                🥣
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                                                    Daily Animal Caring, Feeding & Medical Check Stream
                                                </h4>
                                                <p className="text-[11px] text-slate-400 font-medium">
                                                    Accountability logs of feedings, health checks, medication, and behavioral notes
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setIsCareLogModalOpen(true)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#F97316] text-xs font-black uppercase tracking-wider border border-orange-200 transition-all shadow-2xs"
                                        >
                                            <Plus className="w-3.5 h-3.5" />
                                            <span>Log Care Check as Admin</span>
                                        </button>
                                    </div>

                                    {holdingRecord.timeline && holdingRecord.timeline.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-64 overflow-y-auto pr-1">
                                            {holdingRecord.timeline.map((log) => {
                                                const meta = getCareEventMeta(log.event_type);
                                                return (
                                                    <div key={log.log_id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-start justify-between gap-3 hover:bg-white hover:border-slate-200 transition-all">
                                                        <div className="flex items-start gap-2.5 min-w-0">
                                                            <span className="p-2 rounded-xl bg-white border border-slate-200 text-sm shrink-0 shadow-2xs">
                                                                {meta.icon}
                                                            </span>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <span className="text-xs font-black text-slate-900 truncate">
                                                                        {log.title}
                                                                    </span>
                                                                    <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-md border ${meta.color}`}>
                                                                        {log.event_type}
                                                                    </span>
                                                                </div>
                                                                {log.notes && (
                                                                    <p className="text-[11px] text-slate-600 mt-1 italic leading-relaxed">
                                                                        "{log.notes}"
                                                                    </p>
                                                                )}
                                                                <div className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1.5 font-medium">
                                                                    <span>Cared by:</span>
                                                                    <strong className="text-slate-700">{log.staff_name || `Staff #${log.logged_by || 'Unknown'}`}</strong>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <span className="text-[10px] font-bold text-slate-400 shrink-0">
                                                            <RelativeTimestamp date={log.logged_at} />
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 text-center space-y-2">
                                            <p className="text-xs text-slate-500 font-semibold">No daily care logs registered in the holding timeline yet.</p>
                                            <button
                                                onClick={() => setIsCareLogModalOpen(true)}
                                                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100"
                                            >
                                                Record First Feeding / Observation Check
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* Animal Not in Facility Card */
                            <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-base shrink-0">
                                        ℹ️
                                    </div>
                                    <div>
                                        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                                            Animal Not Yet Placed in Facility Custody
                                        </h4>
                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                            This incident report is currently in field reporting or dispatch stage. Custody telemetry, duration clocks, and care logs will automatically activate once the animal is admitted into a holding pen.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setTargetStatusId(7); // Observation
                                        setIsActionModalOpen(true);
                                    }}
                                    className="px-4 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-black uppercase tracking-wider border border-amber-200 transition-all shrink-0"
                                >
                                    Admit Animal to Holding
                                </button>
                            </div>
                        )}

                        {/* Main Grid: 2 Columns */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                            {/* Left Column (2 Cols wide): Media, Animal Profile, AI Vision, Map, History */}
                            <div className="lg:col-span-2 space-y-6">

                                {/* Media Gallery Card */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center font-bold">
                                                📸
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Sighting Evidence & Photos</h3>
                                                <p className="text-[11px] text-slate-400 font-medium">Uploaded by resident during reporting</p>
                                            </div>
                                        </div>
                                        {mediaList.length > 0 && (
                                            <span className="text-[11px] font-black text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                                                {mediaList.length} {mediaList.length === 1 ? 'file' : 'files'}
                                            </span>
                                        )}
                                    </div>

                                    {currentMediaUrl ? (
                                        <div className="space-y-3">
                                            <div
                                                onClick={() => setIsLightboxOpen(true)}
                                                className="w-full h-80 sm:h-96 rounded-2xl overflow-hidden bg-slate-900 relative cursor-pointer group shadow-inner border border-slate-100"
                                            >
                                                {isVideo ? (
                                                    <video src={currentMediaUrl} controls className="w-full h-full object-contain" />
                                                ) : (
                                                    <img
                                                        src={currentMediaUrl}
                                                        alt="Animal Sighting"
                                                        className="w-full h-full object-contain group-hover:scale-102 transition-transform duration-300"
                                                    />
                                                )}
                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                                    <span className="opacity-0 group-hover:opacity-100 px-3.5 py-2 rounded-xl bg-black/70 backdrop-blur-md text-white text-xs font-bold transition-opacity flex items-center gap-1.5 shadow-lg">
                                                        <Eye className="w-3.5 h-3.5" />
                                                        <span>View Fullscreen</span>
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Thumbnail Strip */}
                                            {mediaList.length > 1 && (
                                                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                                                    {mediaList.map((m, idx) => {
                                                        const url = m.file_url || m.url;
                                                        const isVid = m.media_type === 'Video' || url?.toLowerCase().match(/\.(mp4|mov|webm)$/i);
                                                        return (
                                                            <button
                                                                key={idx}
                                                                onClick={() => setActiveMediaIndex(idx)}
                                                                className={`w-16 h-16 rounded-xl overflow-hidden border-2 shrink-0 transition-all ${
                                                                    activeMediaIndex === idx
                                                                        ? 'border-[#F97316] ring-2 ring-orange-200 scale-105'
                                                                        : 'border-slate-200 opacity-70 hover:opacity-100'
                                                                }`}
                                                            >
                                                                {isVid ? (
                                                                    <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white text-xs">🎥</div>
                                                                ) : (
                                                                    <img src={url} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="w-full h-48 rounded-2xl bg-gradient-to-br from-orange-50/50 to-amber-50/50 border border-orange-100/80 flex flex-col items-center justify-center text-slate-400">
                                            <span className="text-3xl mb-1">🐾</span>
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">No Photo Uploaded</span>
                                            <span className="text-[10px] text-slate-400 mt-0.5">Resident did not attach media to this incident report</span>
                                        </div>
                                    )}
                                </div>

                                {/* Animal Profile & Description */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center font-bold">
                                            📋
                                        </div>
                                        <div>
                                            <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Animal Profile & Characteristics</h3>
                                            <p className="text-[11px] text-slate-400 font-medium">Recorded specifications of the animal involved</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Species</span>
                                            <p className="text-xs font-black text-slate-800 mt-0.5">{report.animal_type || 'Stray / Unknown'}</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Breed</span>
                                            <p className="text-xs font-black text-slate-800 mt-0.5">{report.breed || report.animal_breed || 'Aspin / Mixed'}</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Count</span>
                                            <p className="text-xs font-black text-slate-800 mt-0.5">{report.animal_count || 1} animal(s)</p>
                                        </div>
                                        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Condition</span>
                                            <p className="text-xs font-black text-slate-800 mt-0.5">{animalCondition}</p>
                                        </div>
                                    </div>

                                    {/* Resident Description */}
                                    <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-1">
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Resident Incident Description</span>
                                        <p className="text-xs font-semibold text-slate-700 leading-relaxed italic">
                                            "{report.description || 'No detailed description provided by resident.'}"
                                        </p>
                                    </div>

                                    {/* Behavior Tags */}
                                    {report.behavior_tags && (
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Reported Behavior Tags</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {(Array.isArray(report.behavior_tags)
                                                    ? report.behavior_tags
                                                    : String(report.behavior_tags).split(',')
                                                ).filter(Boolean).map((tag, idx) => (
                                                    <span key={idx} className="px-2.5 py-1 rounded-xl bg-orange-50 text-orange-800 text-[10.5px] font-bold border border-orange-200/60">
                                                        #{tag.trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Field Verification Dossier Card */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                                                <UserCheck className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Subdivision Field Verification Dossier</h3>
                                                <p className="text-[11px] text-slate-400 font-medium">On-site physical inspection & community validation provenance</p>
                                            </div>
                                        </div>
                                        {report.status_id >= 2 && report.status_id !== 3 ? (
                                            <span className="px-3 py-1 rounded-xl bg-emerald-100 text-emerald-800 text-[11px] font-black uppercase tracking-wider border border-emerald-200 flex items-center gap-1.5">
                                                <CheckCircle2 className="w-3.5 h-3.5" />
                                                Verified On-Site
                                            </span>
                                        ) : report.status_id === 3 ? (
                                            <span className="px-3 py-1 rounded-xl bg-rose-100 text-rose-800 text-[11px] font-black uppercase tracking-wider border border-rose-200 flex items-center gap-1.5">
                                                <AlertOctagon className="w-3.5 h-3.5" />
                                                Verification Rejected
                                            </span>
                                        ) : (
                                            <span className="px-3 py-1 rounded-xl bg-amber-100 text-amber-800 text-[11px] font-black uppercase tracking-wider border border-amber-200 flex items-center gap-1.5 animate-pulse">
                                                <Clock className="w-3.5 h-3.5" />
                                                Pending HOA Inspection
                                            </span>
                                        )}
                                    </div>

                                    {report.status_id >= 2 && report.status_id !== 3 ? (
                                        <div className="space-y-3 pt-1">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Inspecting Officer / First Responder</span>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center text-xs font-black">
                                                            🛡️
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-black text-slate-800">
                                                                {report.verified_by_name || report.assigned_leader_name || 'Designated Subdivision Officer'}
                                                            </p>
                                                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/60">
                                                                {report.subdivision_name ? `${report.subdivision_name} Leader` : 'Subdivision Leader'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Verification Recorded At</span>
                                                    <div className="flex items-center gap-1.5 mt-2">
                                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                        <p className="text-xs font-bold text-slate-700">
                                                            {report.verified_at ? formatDateTime(report.verified_at) : (report.created_at ? formatDateTime(report.created_at) : 'Recorded During Triage')}
                                                        </p>
                                                    </div>
                                                    {report.verified_at && (
                                                        <span className="text-[10.5px] text-slate-400 font-semibold block mt-0.5">
                                                            <RelativeTimestamp date={report.verified_at} />
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Verification Findings & Notes */}
                                            <div className="p-3.5 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                                                        <FileText className="w-3 h-3" />
                                                        On-Site Physical Inspection Notes & Findings
                                                    </span>
                                                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                                        Protocol Compliant
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-700 font-medium leading-relaxed italic bg-white/70 p-2.5 rounded-xl border border-emerald-200/50">
                                                    "{report.verification_notes || 'Physical inspection confirmed presence, health indicators, and reported behavior of stray animal matching citizen complaint.'}"
                                                </p>
                                            </div>
                                        </div>
                                    ) : report.status_id === 3 ? (
                                        <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200">
                                            <p className="text-xs text-rose-800 font-bold mb-1">Incident Marked as Invalid / Duplicate</p>
                                            <p className="text-xs text-rose-700 italic">
                                                "{report.verification_notes || 'On-site investigation determined animal was either claimed by resident owner or could not be found within subdivision perimeter.'}"
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200 flex items-start gap-3">
                                            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                            <div>
                                                <h4 className="text-xs font-black text-amber-900">Awaiting Physical Field Inspection</h4>
                                                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                                                    This citizen incident report is currently queued for physical dispatch and validation by designated {report.subdivision_name || 'subdivision'} officers before inter-jurisdictional escalation.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Official Escalation & Endorsement Sign-off Card */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                                <FileCheck className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Official Escalation & Custodial Endorsement</h3>
                                                <p className="text-[11px] text-slate-400 font-medium">Inter-jurisdictional formal endorsement and custody handover</p>
                                            </div>
                                        </div>
                                        {report.status_id >= 4 && (
                                            <button
                                                onClick={() => setIsEndorsementModalOpen(true)}
                                                className="px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200 flex items-center gap-1.5 transition-all shadow-2xs"
                                            >
                                                <FileText className="w-3.5 h-3.5" />
                                                View Official Document
                                            </button>
                                        )}
                                    </div>

                                    {report.status_id >= 4 ? (
                                        <div className="space-y-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Endorsing Subdivision Officer</span>
                                                    <p className="text-xs font-black text-slate-800 mt-1">
                                                        {typeof report.endorsement_letter === 'object' && report.endorsement_letter?.leader_name
                                                            ? report.endorsement_letter.leader_name
                                                            : (report.assigned_leader_name || 'Subdivision Leader')}
                                                    </p>
                                                    <span className="text-[10.5px] font-semibold text-slate-500">
                                                        {typeof report.endorsement_letter === 'object' && report.endorsement_letter?.leader_position
                                                            ? report.endorsement_letter.leader_position
                                                            : 'HOA Executive Committee'}
                                                    </span>
                                                </div>

                                                <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100">
                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">Receiving Municipal Authority</span>
                                                    <p className="text-xs font-black text-slate-800 mt-1">
                                                        {report.barangay_name ? `Barangay ${report.barangay_name}` : 'Barangay'} Animal Care & Control
                                                    </p>
                                                    <span className="text-[10.5px] font-semibold text-slate-500">
                                                        Municipal Holding & Observation Facility
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="p-3.5 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                                <div className="flex items-center justify-between mb-1.5">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1">
                                                        <Shield className="w-3 h-3 text-indigo-600" />
                                                        Formal Transfer Statement Excerpt
                                                    </span>
                                                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                                                        RA 9482 Endorsed
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-700 font-medium leading-relaxed italic bg-white/70 p-2.5 rounded-xl border border-indigo-200/50">
                                                    "{typeof report.endorsement_letter === 'object' && report.endorsement_letter?.letter_content
                                                        ? (report.endorsement_letter.letter_content.length > 180 ? report.endorsement_letter.letter_content.substring(0, 180) + '...' : report.endorsement_letter.letter_content)
                                                        : (typeof report.endorsement_letter === 'string' && report.endorsement_letter
                                                            ? (report.endorsement_letter.length > 180 ? report.endorsement_letter.substring(0, 180) + '...' : report.endorsement_letter)
                                                            : `Official endorsement transferring custody from ${report.subdivision_name || 'the subdivision'} holding to ${report.barangay_name ? `Barangay ${report.barangay_name}` : 'the Barangay'} Animal Care & Control Facility for clinical observation, quarantine, and municipal disposition under Anti-Rabies Act.`)}"
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-500 font-medium flex items-center gap-2.5">
                                            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                                            <span>
                                                This incident currently remains within {report.subdivision_name || 'the subdivision'}'s local jurisdiction. Official endorsement to {report.barangay_name ? `Barangay ${report.barangay_name}` : 'the Barangay'} will be generated upon escalation or formal transfer request.
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {/* AI Computer Vision & Intelligent Analysis */}
                                {(report.ai_animal_type || report.ai_dominant_color || report.ai_possible_breed || report.ai_suggested_priority) && (
                                    <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/40 rounded-3xl p-6 border border-indigo-100 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
                                                <Sparkles className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">AI Vision & Biometric Analysis</h3>
                                                <p className="text-[11px] text-indigo-700 font-semibold">Automated multi-modal model analysis results</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                                            {report.ai_dominant_color && (
                                                <div className="p-2.5 bg-white/80 rounded-xl border border-indigo-100">
                                                    <span className="text-[9.5px] font-bold uppercase text-slate-400">Color Pattern</span>
                                                    <p className="text-xs font-black text-slate-800 mt-0.5">{report.ai_dominant_color} {report.ai_coat_pattern ? `(${report.ai_coat_pattern})` : ''}</p>
                                                </div>
                                            )}
                                            {report.ai_possible_breed && (
                                                <div className="p-2.5 bg-white/80 rounded-xl border border-indigo-100">
                                                    <span className="text-[9.5px] font-bold uppercase text-slate-400">Likely Breed</span>
                                                    <p className="text-xs font-black text-slate-800 mt-0.5">{report.ai_possible_breed}</p>
                                                </div>
                                            )}
                                            {report.ai_estimated_size && (
                                                <div className="p-2.5 bg-white/80 rounded-xl border border-indigo-100">
                                                    <span className="text-[9.5px] font-bold uppercase text-slate-400">Est. Size</span>
                                                    <p className="text-xs font-black text-slate-800 mt-0.5">{report.ai_estimated_size}</p>
                                                </div>
                                            )}
                                            {report.ai_suggested_priority && (
                                                <div className="p-2.5 bg-white/80 rounded-xl border border-indigo-100">
                                                    <span className="text-[9.5px] font-bold uppercase text-slate-400">AI Urgency</span>
                                                    <p className="text-xs font-black text-indigo-800 mt-0.5">{report.ai_suggested_priority}</p>
                                                </div>
                                            )}
                                        </div>

                                        {report.ai_suggested_priority_reason && (
                                            <p className="text-[11px] text-indigo-950 font-medium bg-white/60 p-2.5 rounded-xl border border-indigo-100/60 leading-relaxed">
                                                <strong>AI Reasoning:</strong> {report.ai_suggested_priority_reason}
                                            </p>
                                        )}
                                    </div>
                                )}

                                {/* Location & Interactive Map */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center font-bold">
                                                <MapPin className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Geographic Location</h3>
                                                <p className="text-[11px] text-slate-400 font-medium">Incident coordinates & community coverage</p>
                                            </div>
                                        </div>
                                        <span className="text-xs font-mono font-bold text-slate-500 bg-slate-50 px-3 py-1 rounded-xl border border-slate-200">
                                            {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
                                        </span>
                                    </div>

                                    {/* Landmark & Address */}
                                    <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-2.5">
                                        <Navigation className="w-4 h-4 text-[#F97316] shrink-0 mt-0.5" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black text-slate-800">
                                                {report.landmark || 'Landmark not specified'}
                                            </p>
                                            {resolvedAddress && (
                                                <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate">
                                                    {resolvedAddress}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Leaflet Map Preview */}
                                    {isValidLatLng(report.latitude, report.longitude) ? (
                                    <div className="w-full h-64 rounded-2xl overflow-hidden border border-slate-200 shadow-inner relative z-0">
                                        <MapContainer
                                            center={[report.latitude, report.longitude]}
                                            zoom={16}
                                            scrollWheelZoom={false}
                                            className="w-full h-full"
                                        >
                                            <MapAutoResize />
                                            <TileLayer
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                attribution='&copy; OpenStreetMap contributors'
                                            />
                                            {/* Selera Homes Boundary */}
                                            <Polygon
                                                positions={SELERA_POLYGON_BOUNDS}
                                                pathOptions={SELERA_BOUNDARY_PATH_OPTIONS}
                                            />
                                            {/* San Vicente HQ */}
                                            <Marker position={SAN_VICENTE_HQ}>
                                                <Popup>{report.barangay_name ? `Barangay ${report.barangay_name} HQ` : 'Barangay HQ'}</Popup>
                                            </Marker>
                                            {/* Incident Location Marker */}
                                            <Marker position={[report.latitude, report.longitude]}>
                                                <Popup>
                                                    <div className="text-xs font-bold">
                                                        <span>Case #{report.report_id}</span>
                                                        <br />
                                                        <span>{categoryMap[report.category_id] || 'Incident'}</span>
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        </MapContainer>
                                    </div>
                                    ) : (
                                        <div className="w-full h-24 rounded-2xl border border-dashed border-slate-200 flex items-center justify-center text-xs font-semibold text-slate-400">No map location was recorded for this report.</div>
                                    )}
                                </div>

                                {/* Comprehensive Unified Operational Audit Trail & Custody Chain */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-xl bg-orange-50 text-[#F97316] flex items-center justify-center font-bold">
                                                📜
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                                                    Unified Operational Audit Trail & Personnel Provenance
                                                </h3>
                                                <p className="text-[11px] text-slate-400 font-medium">
                                                    Temporal log of status transitions, officer actions, administrative overrides & caretaker logs
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-start sm:self-auto">
                                            {holdingRecord && (
                                                <button
                                                    onClick={() => setIsCareLogModalOpen(true)}
                                                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-black border border-emerald-200 flex items-center gap-1.5 transition-all shadow-2xs"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    Record Care Log
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Filter Tabs */}
                                    <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl w-fit">
                                        <button
                                            onClick={() => setTimelineFilter('all')}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                timelineFilter === 'all'
                                                    ? 'bg-white text-slate-900 shadow-xs'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            All Operations ({unifiedTimeline.length})
                                        </button>
                                        <button
                                            onClick={() => setTimelineFilter('status')}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                timelineFilter === 'status'
                                                    ? 'bg-white text-slate-900 shadow-xs'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            Status & Officer Actions ({unifiedTimeline.filter(t => t.type === 'status').length})
                                        </button>
                                        <button
                                            onClick={() => setTimelineFilter('care')}
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                                                timelineFilter === 'care'
                                                    ? 'bg-white text-slate-900 shadow-xs'
                                                    : 'text-slate-500 hover:text-slate-800'
                                            }`}
                                        >
                                            Care & Welfare Stream ({unifiedTimeline.filter(t => t.type === 'care').length})
                                        </button>
                                    </div>

                                    {/* Timeline Items List */}
                                    {(() => {
                                        const filteredItems = unifiedTimeline.filter(item => {
                                            if (timelineFilter === 'status') return item.type === 'status';
                                            if (timelineFilter === 'care') return item.type === 'care';
                                            return true;
                                        });

                                        if (filteredItems.length === 0) {
                                            return (
                                                <div className="p-6 bg-slate-50 rounded-2xl text-center space-y-1">
                                                    <p className="text-xs font-black text-slate-600">No events found for this filter category.</p>
                                                    <p className="text-[11px] text-slate-400">
                                                        {timelineFilter === 'care' 
                                                            ? 'No caretaker health, feeding, or observation logs have been recorded yet for this animal.'
                                                            : 'All recorded operations will display chronologically.'}
                                                    </p>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="space-y-3.5 relative before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-0.5 before:bg-slate-100">
                                                {filteredItems.map((event, idx) => (
                                                    <div key={event.id || idx} className="flex items-start gap-3.5 relative group">
                                                        {/* Node Indicator */}
                                                        <div
                                                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ring-4 ring-white shadow-2xs ${
                                                                event.type === 'care'
                                                                    ? 'bg-emerald-600 text-white'
                                                                    : event.isOverride
                                                                    ? 'bg-purple-600 text-white'
                                                                    : 'bg-slate-900 text-white'
                                                            }`}
                                                        >
                                                            {event.type === 'care' ? '🐾' : event.isOverride ? '⚡' : idx + 1}
                                                        </div>

                                                        {/* Content Card */}
                                                        <div
                                                            className={`flex-1 p-3.5 rounded-2xl border transition-all ${
                                                                event.type === 'care'
                                                                    ? 'bg-emerald-50/30 border-emerald-100 hover:border-emerald-200'
                                                                    : event.isOverride
                                                                    ? 'bg-purple-50/30 border-purple-100 hover:border-purple-200'
                                                                    : 'bg-slate-50/80 border-slate-100 hover:border-slate-200'
                                                            }`}
                                                        >
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-black text-slate-900">
                                                                        {event.title}
                                                                    </span>
                                                                    {event.isOverride && (
                                                                        <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 text-[10px] font-black uppercase tracking-wider">
                                                                            Admin Override
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-400">
                                                                    <Clock className="w-3 h-3 text-slate-300" />
                                                                    <span>{formatDateTime(event.timestamp)}</span>
                                                                    <span className="text-slate-300">•</span>
                                                                    <RelativeTimestamp date={event.timestamp} />
                                                                </div>
                                                            </div>

                                                            {/* Personnel Provenance & Role Badge */}
                                                            <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                                                <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                                    <span className="text-slate-400 font-semibold">Action by:</span>
                                                                    <strong className="text-slate-800 font-black">{event.authorName}</strong>
                                                                </div>

                                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border flex items-center gap-1 ${event.roleInfo.bg}`}>
                                                                    <span>{event.roleInfo.icon}</span>
                                                                    <span>{event.roleInfo.label}</span>
                                                                </span>

                                                                {event.facilityName && (
                                                                    <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold border border-blue-100">
                                                                        Facility: {event.facilityName}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Remarks / Clinical Notes */}
                                                            {event.notes && (
                                                                <div className="mt-2.5 p-2.5 rounded-xl bg-white/80 border border-slate-100 text-xs text-slate-700 italic leading-relaxed">
                                                                    "{event.notes}"
                                                                </div>
                                                            )}

                                                            {/* Attached Media */}
                                                            {event.media && event.media.length > 0 && (
                                                                <div className="mt-2.5 flex items-center gap-2 overflow-x-auto py-1">
                                                                    {event.media.map((med: any, mIdx: number) => {
                                                                        const mUrl = med.file_url || med.url;
                                                                        if (!mUrl) return null;
                                                                        return (
                                                                            <img
                                                                                key={mIdx}
                                                                                src={mUrl}
                                                                                alt="Log attachment"
                                                                                onClick={() => setIsLightboxOpen(true)}
                                                                                className="w-14 h-14 object-cover rounded-xl border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity"
                                                                            />
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    })()}
                                </div>

                            </div>

                            {/* Right Column (1 Col wide): Handler, Reporter, Admin Direct Actions */}
                            <div className="space-y-6">

                                {/* Assigned Handler / Officer Card */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Assigned Handler</h3>
                                        <button
                                            onClick={() => {
                                                setTargetStatusId(report.status_id < 5 ? 5 : report.status_id);
                                                setIsActionModalOpen(true);
                                            }}
                                            className="text-[10.5px] font-black text-[#F97316] hover:underline"
                                        >
                                            Reassign
                                        </button>
                                    </div>

                                    {report.assigned_leader_name || report.assigned_staff_name ? (
                                        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-200 border border-slate-200 shrink-0">
                                                <img
                                                    src={getProfilePicture(report.assigned_leader?.profile_picture)}
                                                    alt="Handler"
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                />
                                            </div>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-xs font-black text-slate-800 truncate">
                                                    {report.assigned_leader_name || report.assigned_staff_name}
                                                </span>
                                                <span className="text-[10.5px] font-bold text-slate-400">
                                                    {report.claimed_at ? `Claimed on ${new Date(report.claimed_at).toLocaleDateString()}` : 'Assigned Officer'}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-amber-50/60 rounded-2xl border border-amber-200/60 text-center">
                                            <span className="text-xs font-black text-amber-800 block">Unassigned Incident</span>
                                            <p className="text-[11px] text-amber-700/80 mt-1 mb-3">No subdivision leader or barangay personnel has claimed this case yet.</p>
                                            <button
                                                onClick={() => {
                                                    setTargetStatusId(5);
                                                    setIsActionModalOpen(true);
                                                }}
                                                className="w-full py-2 bg-[#F97316] hover:bg-[#ea580c] text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-xs transition-all"
                                            >
                                                Dispatch Personnel
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Reporter Profile Card */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-4">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Reporter Details</h3>

                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0 shadow-2xs">
                                            {report.reporter_photo ? (
                                                <img
                                                    src={getProfilePicture(report.reporter_photo)}
                                                    alt={report.reporter_name || 'Reporter'}
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center font-black text-slate-500 text-sm">
                                                    {(report.reporter_name || 'U').charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-black text-slate-900 truncate">
                                                {report.reporter_name || report.reporter?.name || `Resident #${report.user_id}`}
                                            </span>
                                            <span className="text-[11px] font-bold text-slate-400">
                                                Resident • User ID #{report.user_id}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                                        {(report.reporter_phone || report.reporter?.phone_number) && (
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                <span className="font-semibold">{report.reporter_phone || report.reporter?.phone_number}</span>
                                            </div>
                                        )}
                                        {(report.reporter_email || report.reporter?.email) && (
                                            <div className="flex items-center gap-2 text-slate-600">
                                                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                                <span className="font-semibold truncate">{report.reporter_email || report.reporter?.email}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                                            <Calendar className="w-3.5 h-3.5 shrink-0" />
                                            <span>Reported on {new Date(report.created_at).toLocaleString()}</span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => setIsChatOpen(true)}
                                        className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wider border border-slate-200 transition-all flex items-center justify-center gap-2"
                                    >
                                        <MessageCircle className="w-4 h-4 text-[#F97316]" />
                                        <span>Message Reporter</span>
                                    </button>
                                </div>

                                {/* Administrative Fast Actions */}
                                <div className="bg-white rounded-3xl p-6 shadow-xs border border-slate-100 space-y-3">
                                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Fast Actions</h3>

                                    <button
                                        onClick={() => handleFastStatusChange(2, 'Verified by System Administrator')}
                                        className="w-full py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-800 text-xs font-black uppercase tracking-wider border border-sky-200 transition-all text-left px-3.5 flex items-center justify-between"
                                    >
                                        <span>Mark Verified</span>
                                        <Check className="w-4 h-4" />
                                    </button>

                                    <button
                                        onClick={() => handleFastStatusChange(6, 'Secured / Picked up confirmed by Admin')}
                                        className="w-full py-2.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-black uppercase tracking-wider border border-purple-200 transition-all text-left px-3.5 flex items-center justify-between"
                                    >
                                        <span>Mark Picked Up</span>
                                        <Building2 className="w-4 h-4" />
                                    </button>

                                    <button
                                        onClick={() => handleFastStatusChange(7, 'Transferred to Observation')}
                                        className="w-full py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-black uppercase tracking-wider border border-amber-200 transition-all text-left px-3.5 flex items-center justify-between"
                                    >
                                        <span>Move to Observation</span>
                                        <Activity className="w-4 h-4" />
                                    </button>

                                    <button
                                        onClick={() => handleFastStatusChange(14, 'Dismissed as False Alarm by Admin')}
                                        className="w-full py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-800 text-xs font-black uppercase tracking-wider border border-rose-200 transition-all text-left px-3.5 flex items-center justify-between"
                                    >
                                        <span>Dismiss / False Alarm</span>
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>

                            </div>
                        </div>

                    </div>
                </main>
            </div>

            {/* Direct Action Override Modal */}
            {isActionModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden border border-slate-100 animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <div>
                                <h3 className="text-base font-black text-slate-900">Direct Admin Action Override</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Override status and dispatch responders for Case #{report.report_id}</p>
                            </div>
                            <button
                                onClick={() => setIsActionModalOpen(false)}
                                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleApplyAction} className="p-6 space-y-4">
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                    Target Status
                                </label>
                                <select
                                    value={targetStatusId}
                                    onChange={(e) => setTargetStatusId(Number(e.target.value))}
                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#F97316]"
                                >
                                    <option value={2}>Verified</option>
                                    <option value={4}>Escalated to Barangay</option>
                                    <option value={5}>Rescue in Progress / Dispatched</option>
                                    <option value={6}>Picked Up</option>
                                    <option value={7}>Under Observation</option>
                                    <option value={8}>Impounded</option>
                                    <option value={11}>Incident Resolved</option>
                                    <option value={3}>Rejected</option>
                                    <option value={14}>False Alarm / Dismissed</option>
                                </select>
                            </div>

                            {targetStatusId === 5 && (
                                <div>
                                    <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                        Dispatch Responder / Officer
                                    </label>
                                    <select
                                        value={selectedStaffId}
                                        onChange={(e) => setSelectedStaffId(Number(e.target.value))}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-[#F97316]"
                                    >
                                        <option value="">-- Select Personnel to Dispatch --</option>
                                        {staffList.map(st => (
                                            <option key={st.user_id} value={st.user_id}>
                                                {st.name} ({st.role_id === 3 ? 'Barangay Staff' : st.role_id === 2 ? 'Subdivision Leader' : 'Officer'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                    Administrative Remarks
                                </label>
                                <textarea
                                    value={actionRemarks}
                                    onChange={(e) => setActionRemarks(e.target.value)}
                                    placeholder="Provide notes or specific instructions for this administrative override..."
                                    rows={3}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-[#F97316] resize-none"
                                />
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsActionModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingAction}
                                    className="px-5 py-2.5 rounded-xl bg-[#F97316] hover:bg-[#ea580c] text-white text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                                >
                                    {isSubmittingAction ? 'Applying...' : 'Apply Override'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Media Lightbox */}
            {isLightboxOpen && currentMediaUrl && (
                <div
                    onClick={() => setIsLightboxOpen(false)}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-200"
                >
                    <button
                        onClick={() => setIsLightboxOpen(false)}
                        className="absolute top-6 right-6 p-2 rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                    <div onClick={(e) => e.stopPropagation()} className="max-w-4xl max-h-[85vh] overflow-hidden rounded-2xl shadow-2xl">
                        {isVideo ? (
                            <video src={currentMediaUrl} controls autoPlay className="max-w-full max-h-[85vh] object-contain" />
                        ) : (
                            <img src={currentMediaUrl} alt="Enlarged evidence" className="max-w-full max-h-[85vh] object-contain" />
                        )}
                    </div>
                </div>
            )}

            {/* Incident Chat Drawer */}
            <ReportChatDrawer
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                report={{
                    report_id: report.report_id,
                    user_id: report.user_id,
                    reporter_name: report.reporter_name,
                    reporter_photo: report.reporter_photo,
                    animal_type: report.animal_type,
                    category_id: report.category_id,
                    status_id: report.status_id,
                    landmark: report.landmark,
                    created_at: report.created_at
                }}
                currentUser={{
                    user_id: currentUserId,
                    name: currentUser?.name || 'Administrator',
                    role_id: 4,
                    profile_picture: currentUser?.profile_picture
                }}
            />

            {/* Add Care Log Modal */}
            {isCareLogModalOpen && holdingRecord && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                                    🐾
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Record Care & Welfare Log</h3>
                                    <p className="text-[11px] text-slate-400 font-medium">Log feeding, treatment, or clinical observation for Case #{report.report_id}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsCareLogModalOpen(false)}
                                className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveCareLog} className="space-y-4">
                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                    Event Type
                                </label>
                                <select
                                    value={careLogEventType}
                                    onChange={(e: any) => setCareLogEventType(e.target.value)}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                >
                                    <option value="observation">📋 Daily Observation & Vitals Check</option>
                                    <option value="feeding">🍖 Feeding & Nutrition Log</option>
                                    <option value="treatment">💊 Medical Treatment & Medication</option>
                                    <option value="medical">🩺 Veterinary Inspection</option>
                                    <option value="transfer">🚚 Facility Relocation / Transfer</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                    Activity Title
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={careLogTitle}
                                    onChange={(e) => setCareLogTitle(e.target.value)}
                                    placeholder="e.g., Morning Feeding & Hydration Check"
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                    Detailed Clinical & Behavioral Observations
                                </label>
                                <textarea
                                    value={careLogNotes}
                                    onChange={(e) => setCareLogNotes(e.target.value)}
                                    placeholder="Document physical condition, appetite, temperament, or specific medication administered..."
                                    rows={4}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                                />
                            </div>

                            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                                <button
                                    type="button"
                                    onClick={() => setIsCareLogModalOpen(false)}
                                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingCareLog}
                                    className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
                                >
                                    {isSubmittingCareLog ? 'Saving Log...' : 'Save Care Log'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Official Endorsement Letter Modal */}
            {isEndorsementModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl max-w-2xl w-full p-8 shadow-2xl border border-slate-100 space-y-6 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                                    <FileCheck className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Official Endorsement & Transfer Certificate</h3>
                                    <p className="text-[11px] text-slate-400 font-medium">Inter-jurisdictional municipal legal documentation under RA 9482</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsEndorsementModalOpen(false)}
                                className="p-2 rounded-xl text-slate-400 hover:bg-slate-50 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Certificate Body Styled as Official Government / HOA Letterhead */}
                        <div id="admin-endorsement-certificate" className="p-6 bg-slate-50/80 rounded-2xl border border-slate-200/80 space-y-5 font-serif text-slate-800">
                            {/* Letterhead */}
                            <div className="text-center border-b border-slate-200 pb-4">
                                <p className="text-[11px] tracking-widest font-sans font-bold uppercase text-slate-500">Republic of the Philippines</p>
                                <p className="text-xs font-bold font-sans text-slate-700">
                                    {[report.municipality_city && `Municipality of ${report.municipality_city}`, report.province && `Province of ${report.province}`].filter(Boolean).join(' • ') || '—'}
                                </p>
                                <h4 className="text-sm font-black font-sans uppercase tracking-tight text-slate-900 mt-1">
                                    {[report.barangay_name && `Barangay ${report.barangay_name}`, report.subdivision_name].filter(Boolean).join(' • ') || '—'}
                                </h4>
                                <p className="text-[10px] font-sans font-semibold text-slate-400 mt-0.5">Joint Stray Animal Management & Rabies Prevention Taskforce</p>
                            </div>

                            <div className="text-center py-1">
                                <h5 className="text-xs font-sans font-black uppercase tracking-wider text-slate-900 bg-white py-1 px-4 rounded-xl border border-slate-200 inline-block">
                                    OFFICIAL ENDORSEMENT AND CUSTODIAL TRANSFER CERTIFICATE
                                </h5>
                            </div>

                            <div className="font-sans text-xs space-y-2 text-slate-700">
                                <div className="grid grid-cols-2 gap-2 p-3 bg-white rounded-xl border border-slate-200 font-mono text-[11px]">
                                    <div><strong>Incident Reference:</strong> #{report.report_id.toString().padStart(4, '0')}</div>
                                    <div><strong>Date Issued:</strong> {typeof report.endorsement_letter === 'object' && report.endorsement_letter?.issued_at ? formatDateTime(report.endorsement_letter.issued_at) : formatDateTime(report.created_at)}</div>
                                    <div><strong>Animal Type:</strong> {report.animal_type || 'Canine / Stray'}</div>
                                    <div><strong>Category:</strong> {categoryMap[report.category_id] || 'Stray Report'}</div>
                                </div>

                                <p className="leading-relaxed pt-2">
                                    <strong>MEMORANDUM FOR:</strong> Office of the Barangay Animal Control Officer{report.barangay_name ? `, Barangay ${report.barangay_name}` : ''}
                                </p>
                                <p className="leading-relaxed">
                                    <strong>FROM:</strong> {report.subdivision_name ? `Executive Board, ${report.subdivision_name}` : 'Subdivision Executive Board'}
                                </p>
                                <p className="leading-relaxed">
                                    <strong>SUBJECT:</strong> Formal Custodial Endorsement of Impounded Animal for Rabies Watch & Quarantine
                                </p>

                                <div className="mt-3 p-3.5 bg-white rounded-xl border border-slate-200 leading-relaxed space-y-2 text-slate-800 text-xs">
                                    <p>
                                        {typeof report.endorsement_letter === 'object' && report.endorsement_letter?.letter_content
                                            ? report.endorsement_letter.letter_content
                                            : (typeof report.endorsement_letter === 'string' && report.endorsement_letter
                                                ? report.endorsement_letter
                                                : `In strict accordance with Republic Act No. 9482 (Anti-Rabies Act of 2007) and the memorandum of agreement between ${report.subdivision_name || 'the subdivision'} and the ${report.barangay_name ? `Barangay ${report.barangay_name}` : 'Barangay'} Animal Care Unit, the animal documented under Incident #${report.report_id.toString().padStart(4, '0')} has undergone initial temporary holding within subdivision facilities and is hereby officially endorsed and transferred to the custody of ${report.barangay_name ? `Barangay ${report.barangay_name}` : 'the Barangay'} for mandatory observation, medical assessment, and appropriate municipal disposition.`
                                            )
                                        }
                                    </p>
                                    {report.verification_notes && (
                                        <p className="text-[11px] text-slate-600 pt-1 border-t border-slate-100">
                                            <strong>On-Site Investigation Findings:</strong> {report.verification_notes}
                                        </p>
                                    )}
                                </div>

                                {/* Signatures block */}
                                <div className="pt-4 grid grid-cols-2 gap-4 font-sans">
                                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                                        <div className="h-8 flex items-center justify-center">
                                            <span className="font-serif italic text-xs text-indigo-800 font-bold">~ Digitally Certified ~</span>
                                        </div>
                                        <p className="text-xs font-black text-slate-900 border-t border-slate-200 pt-1">
                                            {typeof report.endorsement_letter === 'object' && report.endorsement_letter?.leader_name
                                                ? report.endorsement_letter.leader_name
                                                : (report.assigned_leader_name || 'Subdivision HOA Executive')}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-semibold">
                                            {typeof report.endorsement_letter === 'object' && report.endorsement_letter?.leader_position
                                                ? report.endorsement_letter.leader_position
                                                : 'HOA Executive Committee Officer'}
                                        </p>
                                        <p className="text-[9.5px] text-emerald-600 font-bold mt-1">✓ Endorsement Certified</p>
                                    </div>

                                    <div className="p-3 bg-white rounded-xl border border-slate-200 text-center">
                                        <div className="h-8 flex items-center justify-center">
                                            <span className="font-serif italic text-xs text-blue-800 font-bold">~ Custody Acknowledged ~</span>
                                        </div>
                                        <p className="text-xs font-black text-slate-900 border-t border-slate-200 pt-1">
                                            {report.barangay_name ? `Barangay ${report.barangay_name}` : 'Barangay Office'}
                                        </p>
                                        <p className="text-[10px] text-slate-500 font-semibold">
                                            Animal Care & Control Section
                                        </p>
                                        <p className="text-[9.5px] text-blue-600 font-bold mt-1">✓ Formal Municipal Record</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                onClick={() => printElementById('admin-endorsement-certificate', `Endorsement Certificate #${report.report_id}`)}
                                className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center gap-1.5"
                            >
                                <FileText className="w-3.5 h-3.5" />
                                Print Certificate
                            </button>
                            <button
                                onClick={() => setIsEndorsementModalOpen(false)}
                                className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800 transition-all"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminReportView;
