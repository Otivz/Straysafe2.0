import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
    PawPrint, Truck, MapPin, RefreshCw, Pill, Stethoscope, ClipboardList,
    CheckCircle2, Cat, Dog, AlertTriangle, Clock, Flag, Building2, Globe,
    Landmark, Home, Settings, BarChart3, User, Phone, Rocket, Scale, Info,
    X, Calendar, Timer, Camera, FileText, Pencil, Sparkles, Paperclip, PlayCircle
} from 'lucide-react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { getStoredToken } from '../../utils/api';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineEntry {
    log_id: number;
    holding_id: number;
    event_type: string;
    title: string;
    notes: string | null;
    logged_by: number | null;
    staff_name: string | null;
    logged_at: string;
}

interface HoldingAnimal {
    holding_id: number;
    report_id: number;
    rescue_id: number | null;
    facility_id: number | null;
    facility_name: string | null;
    facility_type: string | null;
    subdivision_id: number | null;
    barangay_id: number | null;
    animal_type: string | null;
    animal_name: string | null;
    breed: string | null;
    color: string | null;
    estimated_size: string | null;
    facility_status: number;
    facility_status_name: string | null;
    kennel_slot: string | null;
    medical_notes: string | null;
    intake_date: string | null;
    discharge_date: string | null;
    intake_staff_name: string | null;
    report_landmark: string | null;
    report_category: string | null;
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
    timeline: TimelineEntry[];
    adoption_catalog_notes?: string | null;
    promoted_at?: string | null;
    report_media?: {
        media_id: number;
        file_url: string;
        media_type: string;
        is_evidence?: boolean;
        uploaded_at?: string;
    }[];
}

interface FacilityOption {
    landmark_id: number;
    name: string;
    facility_type?: string;
    capacity?: number;
    contact_person?: string;
    contact_number?: string;
    latitude: number;
    longitude: number;
    subdivision_id?: number | null;
    subdivision_name?: string | null;
    barangay_id?: number | null;
    barangay_name?: string | null;
}

interface JurisdictionData {
    barangays: { barangay_id: number; barangay_name: string; city: string }[];
    subdivisions: { subdivision_id: number; subdivision_name: string; barangay_id: number; barangay_name: string | null }[];
}

interface Metrics {
    total: number;
    need_treatment: number;
    healthy: number;
    nearing_expiry: number;
    resolved_today: number;
    needs_impoundment?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IMPOUND_DAYS = 0; // Temporarily 0 for testing adoption & impound

const FACILITY_STATUSES = [
    { id: 1, name: 'Need Treatment', color: 'bg-red-50 text-red-600 border-red-200' },
    { id: 2, name: 'Healthy', color: 'bg-green-50 text-green-600 border-green-200' },
    { id: 3, name: 'Claimed by Owner', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    { id: 4, name: 'Deceased', color: 'bg-gray-100 text-gray-500 border-gray-200' },
    { id: 5, name: 'Transferred to Shelter', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    { id: 6, name: 'For Adoption', color: 'bg-indigo-50 text-indigo-600 border-indigo-200' },
    { id: 7, name: 'Adopted/Released', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    { id: 8, name: 'Impounded', color: 'bg-amber-50 text-amber-700 border-amber-200' },
];

const RESOLVED_IDS = new Set([3, 4, 5, 7, 8]);

const EVENT_TYPE_META: Record<string, { icon: ReactNode; color: string }> = {
    intake: { icon: <PawPrint className="w-3.5 h-3.5" />, color: 'bg-emerald-100 text-emerald-700' },
    transfer: { icon: <Truck className="w-3.5 h-3.5" />, color: 'bg-indigo-100 text-indigo-700' },
    relocation: { icon: <MapPin className="w-3.5 h-3.5" />, color: 'bg-indigo-100 text-indigo-700' },
    status_change: { icon: <RefreshCw className="w-3.5 h-3.5" />, color: 'bg-amber-100 text-amber-700' },
    medical: { icon: <Pill className="w-3.5 h-3.5" />, color: 'bg-purple-100 text-purple-600' },
    treatment: { icon: <Stethoscope className="w-3.5 h-3.5" />, color: 'bg-pink-100 text-pink-600' },
    observation: { icon: <ClipboardList className="w-3.5 h-3.5" />, color: 'bg-gray-100 text-gray-600' },
    outcome: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'bg-green-100 text-green-700' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
    if (!dateStr) return 0;
    const ms = Date.now() - new Date(dateStr).getTime();
    return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}

function daysRemaining(dateStr: string | null, limit: number = IMPOUND_DAYS): number {
    const days = daysSince(dateStr);
    return Math.max(0, limit - days);
}

function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr: string | null): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-PH', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}



function getStatusMeta(statusId: number) {
    return FACILITY_STATUSES.find(s => s.id === statusId) || {
        id: statusId, name: 'Unknown', color: 'bg-gray-50 text-gray-500 border-gray-200'
    };
}

function animalIcon(type: string | null, className = 'w-6 h-6'): ReactNode {
    if (type === 'Cat') return <Cat className={className} />;
    if (type === 'Dog') return <Dog className={className} />;
    return <PawPrint className={className} />;
}

// ─── Component ────────────────────────────────────────────────────────────────

const BrgyHoldingFacility = () => {
    const navigate = useNavigate();
    const [animals, setAnimals] = useState<HoldingAnimal[]>([]);
    const [facilities, setFacilities] = useState<FacilityOption[]>([]);
    const [jurisdictions, setJurisdictions] = useState<JurisdictionData>({ barangays: [], subdivisions: [] });
    const [selectedScope, setSelectedScope] = useState<string>('all'); // 'all' | 'brgy_<id>' | 'subd_<id>'
    const [selectedFacilityId, setSelectedFacilityId] = useState<number | 'all'>('all');
    const [metrics, setMetrics] = useState<Metrics>({ total: 0, need_treatment: 0, healthy: 0, nearing_expiry: 0, resolved_today: 0 });
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState(0); // 0 = All
    const [showResolved, setShowResolved] = useState(false);

    // Selected animal detail modal
    const [selected, setSelected] = useState<HoldingAnimal | null>(null);
    const [detailTab, setDetailTab] = useState<'info' | 'timeline'>('info');

    // Update modal state
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateForm, setUpdateForm] = useState({
        facility_status: 2,
        kennel_slot: '',
        medical_notes: '',
        update_notes: '',
    });

    // Add timeline entry
    const [timelineForm, setTimelineForm] = useState({ event_type: 'observation', title: '', notes: '' });
    const [isAddingTimeline, setIsAddingTimeline] = useState(false);
    const [timelineFiles, setTimelineFiles] = useState<File[]>([]);

    // Lightbox / media preview state
    const [lightboxMedia, setLightboxMedia] = useState<{ mediaList: any[]; index: number } | null>(null);
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);

    // Promote to adoption state
    const [promoteModalOpen, setPromoteModalOpen] = useState(false);
    const [promoteNotes, setPromoteNotes] = useState('');
    const [isPromoting, setIsPromoting] = useState(false);
    const [promoteError, setPromoteError] = useState<string | null>(null);
    const [promoteSuccess, setPromoteSuccess] = useState<string | null>(null);

    // Number spinner for stay duration before impoundment (Default 0 days for testing)
    const [impoundStayDuration, setImpoundStayDuration] = useState<number>(() => {
        const saved = localStorage.getItem('holding_impound_stay_duration');
        if (saved !== null) {
            const parsed = parseInt(saved, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 90) return parsed;
        }
        const brgySettings = localStorage.getItem('straysafe_brgy_settings');
        if (brgySettings) {
            try {
                const parsedObj = JSON.parse(brgySettings);
                if (typeof parsedObj?.adoptionGraceDays === 'number' && parsedObj.adoptionGraceDays >= 0) return parsedObj.adoptionGraceDays;
            } catch {}
        }
        return 0;
    });

    const handleDurationChange = (newVal: number) => {
        const clamped = Math.max(0, Math.min(90, isNaN(newVal) ? 0 : newVal));
        setImpoundStayDuration(clamped);
        localStorage.setItem('holding_impound_stay_duration', String(clamped));
    };

    // Quick Impound Confirmation State
    const userStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user') || localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const isAdmin = currentUser?.role_id === 4;
    const isSubdLeader = currentUser?.role_id === 2;
    const isHeadOfficer = Boolean(currentUser?.is_head_officer || isAdmin);
    const defaultSubdId = currentUser?.subdivision_id;
    const defaultBrgyId = currentUser?.barangay_id;

    const [quickImpoundAnimal, setQuickImpoundAnimal] = useState<HoldingAnimal | null>(null);
    const [isQuickImpounding, setIsQuickImpounding] = useState(false);

    const handleConfirmImpound = async (animal: HoldingAnimal) => {
        setIsQuickImpounding(true);
        try {
            await axios.patch(`http://localhost:8000/holding/${animal.holding_id}`, {
                facility_status: 8, // Impounded
                updated_by: currentUser?.user_id,
                update_notes: `Animal officially impounded after reaching ${impoundStayDuration}-day holding stay limit at ${animal.facility_name || 'holding facility'}.`,
            });
            setQuickImpoundAnimal(null);
            await fetchAll();
            if (selected?.holding_id === animal.holding_id) {
                setSelected(null);
            }
        } catch (err: any) {
            console.error('Failed to impound animal:', err);
            const errMsg = err?.response?.data?.detail || err?.message || 'Failed to impound animal';
            alert(`Impoundment failed: ${errMsg}`);
        } finally {
            setIsQuickImpounding(false);
        }
    };

    const openPromoteModalForAnimal = (animal: HoldingAnimal) => {
        setSelected(animal);
        setPromoteNotes(animal.medical_notes || animal.adoption_catalog_notes || '');
        setPromoteError(null);
        setPromoteSuccess(null);
        setPromoteModalOpen(true);
    };

    useEffect(() => {
        if (!userStr) {
            navigate('/staff/login');
        }
    }, [navigate, userStr]);

    // ── Fetch Facilities & Jurisdictions ────────────────────────────────────────
    useEffect(() => {
        const fetchFacilityMetadata = async () => {
            try {
                if (isAdmin) {
                    const [facRes, jurisRes] = await Promise.all([
                        axios.get('http://localhost:8000/landmarks?is_holding_facility=true'),
                        axios.get('http://localhost:8000/landmarks/jurisdictions'),
                    ]);
                    if (Array.isArray(facRes.data)) setFacilities(facRes.data);
                    if (jurisRes.data) setJurisdictions(jurisRes.data);
                } else if (isSubdLeader && defaultSubdId) {
                    const res = await axios.get(`http://localhost:8000/landmarks?subdivision_id=${defaultSubdId}&is_holding_facility=true`);
                    if (Array.isArray(res.data)) {
                        setFacilities(res.data.filter((f: any) => f.subdivision_id === defaultSubdId));
                    }
                } else if (defaultBrgyId) {
                    const res = await axios.get(`http://localhost:8000/landmarks?barangay_id=${defaultBrgyId}&is_holding_facility=true&barangay_only=true`);
                    if (Array.isArray(res.data)) {
                        setFacilities(res.data.filter((f: any) => f.subdivision_id == null));
                    }
                } else {
                    const res = await axios.get('http://localhost:8000/landmarks?is_holding_facility=true&barangay_only=true');
                    if (Array.isArray(res.data)) {
                        setFacilities(res.data.filter((f: any) => f.subdivision_id == null));
                    }
                }
            } catch (e) {
                console.error('Error fetching holding facilities and jurisdictions:', e);
            }
        };
        fetchFacilityMetadata();
    }, [isAdmin, isSubdLeader, defaultSubdId, defaultBrgyId]);

    // ── Filtered Facilities based on Admin Jurisdiction Selection ──────────────
    const filteredFacilities = useMemo(() => {
        if (!isAdmin) {
            if (isSubdLeader && defaultSubdId) {
                return facilities.filter(f => f.subdivision_id === defaultSubdId);
            }
            return facilities.filter(f => f.subdivision_id == null);
        }
        if (selectedScope === 'all') return facilities;
        if (selectedScope.startsWith('brgy_')) {
            const bId = Number(selectedScope.replace('brgy_', ''));
            return facilities.filter(f => f.barangay_id === bId && f.subdivision_id == null);
        }
        if (selectedScope.startsWith('subd_')) {
            const sId = Number(selectedScope.replace('subd_', ''));
            return facilities.filter(f => f.subdivision_id === sId);
        }
        return facilities;
    }, [isAdmin, isSubdLeader, defaultSubdId, selectedScope, facilities]);

    // ── Data Fetching ──────────────────────────────────────────────────────────

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (isAdmin) {
                if (selectedFacilityId !== 'all') {
                    params.facility_id = selectedFacilityId;
                } else if (selectedScope.startsWith('subd_')) {
                    params.subdivision_id = Number(selectedScope.replace('subd_', ''));
                } else if (selectedScope.startsWith('brgy_')) {
                    params.barangay_id = Number(selectedScope.replace('brgy_', ''));
                    params.barangay_only = true;
                }
            } else if (isSubdLeader) {
                if (defaultSubdId) params.subdivision_id = defaultSubdId;
                if (selectedFacilityId !== 'all') params.facility_id = selectedFacilityId;
            } else {
                if (defaultBrgyId) {
                    params.barangay_id = defaultBrgyId;
                    params.barangay_only = true;
                }
                if (selectedFacilityId !== 'all') params.facility_id = selectedFacilityId;
            }
            params.impound_days = impoundStayDuration;

            const [animalsRes, metricsRes] = await Promise.all([
                axios.get('http://localhost:8000/holding/', { params }),
                axios.get('http://localhost:8000/holding/metrics', { params }),
            ]);
            setAnimals(animalsRes.data || []);
            setMetrics(metricsRes.data || { total: 0, need_treatment: 0, healthy: 0, nearing_expiry: 0, resolved_today: 0, needs_impoundment: 0 });
        } catch (err) {
            console.error('Error fetching holding facility data:', err);
        } finally {
            setLoading(false);
        }
    }, [isAdmin, isSubdLeader, defaultSubdId, defaultBrgyId, selectedScope, selectedFacilityId, impoundStayDuration]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Active facility object ─────────────────────────────────────────────────
    const activeFacility = selectedFacilityId !== 'all'
        ? facilities.find(f => f.landmark_id === selectedFacilityId)
        : null;

    // Active occupancy count
    const activeOccupancy = animals.filter(a => !RESOLVED_IDS.has(a.facility_status)).length;

    // ── Filter ─────────────────────────────────────────────────────────────────

    const filtered = animals.filter(a => {
        if (!showResolved && RESOLVED_IDS.has(a.facility_status)) return false;
        if (statusFilter !== 0 && a.facility_status !== statusFilter) return false;
        const q = searchTerm.toLowerCase();
        return (
            (a.animal_type?.toLowerCase() || '').includes(q) ||
            (a.breed?.toLowerCase() || '').includes(q) ||
            (a.report_landmark?.toLowerCase() || '').includes(q) ||
            (a.facility_name?.toLowerCase() || '').includes(q) ||
            (a.kennel_slot?.toLowerCase() || '').includes(q) ||
            String(a.report_id).includes(q)
        );
    });

    // Overdue and nearing expiry animals based on dynamic spinner duration
    const overdueAnimals = useMemo(() => {
        return filtered.filter(a => !RESOLVED_IDS.has(a.facility_status) && daysSince(a.intake_date) >= impoundStayDuration);
    }, [filtered, impoundStayDuration]);

    const nearingAnimals = useMemo(() => {
        return filtered.filter(a => {
            if (RESOLVED_IDS.has(a.facility_status)) return false;
            const days = daysSince(a.intake_date);
            const rem = impoundStayDuration - days;
            return rem > 0 && rem <= 2;
        });
    }, [filtered, impoundStayDuration]);

    // ── Open detail modal ──────────────────────────────────────────────────────

    const openDetail = async (animal: HoldingAnimal) => {
        // Fetch fresh with full timeline
        try {
            const res = await axios.get(`http://localhost:8000/holding/${animal.holding_id}`);
            setSelected(res.data);
            setUpdateForm({
                facility_status: res.data.facility_status,
                kennel_slot: res.data.kennel_slot || '',
                medical_notes: res.data.medical_notes || '',
                update_notes: '',
            });
            setDetailTab('info');
        } catch {
            setSelected(animal);
            setUpdateForm({
                facility_status: animal.facility_status,
                kennel_slot: animal.kennel_slot || '',
                medical_notes: animal.medical_notes || '',
                update_notes: '',
            });
        }
    };

    // ── Update animal ──────────────────────────────────────────────────────────

    const handleUpdate = async () => {
        if (!selected) return;
        setIsUpdating(true);
        try {
            // 1. Upload files first if any
            const uploadedMediaIds: number[] = [];
            if (uploadFiles.length > 0) {
                for (const file of uploadFiles) {
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('is_evidence', 'true');
                    const uploadRes = await axios.post(`http://localhost:8000/reports/${selected.report_id}/media`, fd, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    if (uploadRes.data?.media_id) {
                        uploadedMediaIds.push(uploadRes.data.media_id);
                    }
                }
                setUploadFiles([]);
            }

            // 2. Perform patching (preserving intake_date genuine start time)
            await axios.patch(`http://localhost:8000/holding/${selected.holding_id}`, {
                facility_status: updateForm.facility_status,
                kennel_slot: updateForm.kennel_slot,
                medical_notes: updateForm.medical_notes,
                update_notes: updateForm.update_notes,
                updated_by: currentUser?.user_id,
                media_ids: uploadedMediaIds,
            });
            await fetchAll();
            // Refresh the selected modal too
            const res = await axios.get(`http://localhost:8000/holding/${selected.holding_id}`);
            setSelected(res.data);
        } catch (err) {
            console.error('Update failed:', err);
        } finally {
            setIsUpdating(false);
        }
    };

    // ── Promote to adoption ───────────────────────────────────────────────────

    const handlePromoteToAdoption = async () => {
        if (!selected) return;
        setIsPromoting(true);
        setPromoteError(null);
        setPromoteSuccess(null);
        try {
            const token = getStoredToken();
            await axios.post(
                `http://localhost:8000/adoptions/promote/${selected.holding_id}`,
                {
                    adoption_catalog_notes: promoteNotes,
                    notes: promoteNotes,
                    min_stay_days: impoundStayDuration,
                },
                { headers: token ? { Authorization: `Bearer ${token}` } : {} }
            );
            setPromoteSuccess('Animal successfully promoted to public Adoption Catalog!');
            await fetchAll();
            const res = await axios.get(`http://localhost:8000/holding/${selected.holding_id}`);
            setSelected(res.data);
            setTimeout(() => {
                setPromoteModalOpen(false);
                setPromoteSuccess(null);
            }, 1200);
        } catch (err: any) {
            console.error('Promotion error:', err);
            setPromoteError(err.response?.data?.detail || 'Failed to promote animal to adoption.');
        } finally {
            setIsPromoting(false);
        }
    };

    // ── Add timeline entry ─────────────────────────────────────────────────────

    const handleAddTimeline = async () => {
        if (!selected || !timelineForm.title.trim()) return;
        setIsAddingTimeline(true);
        try {
            // 1. Upload any attached files first
            if (timelineFiles.length > 0) {
                for (const file of timelineFiles) {
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('is_evidence', 'true');
                    await axios.post(`http://localhost:8000/reports/${selected.report_id}/media`, fd, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                }
                setTimelineFiles([]);
            }

            // 2. Add the timeline entry
            await axios.post(`http://localhost:8000/holding/${selected.holding_id}/timeline`, {
                ...timelineForm,
                logged_by: currentUser?.user_id,
            });
            const res = await axios.get(`http://localhost:8000/holding/${selected.holding_id}`);
            setSelected(res.data);
            setTimelineForm({ event_type: 'observation', title: '', notes: '' });
        } catch (err) {
            console.error('Timeline add failed:', err);
        } finally {
            setIsAddingTimeline(false);
        }
    };

    // ─── Render ────────────────────────────────────────────────────────────────

    const metricCards = [
        {
            label: 'Total Animals',
            value: metrics.total,
            icon: PawPrint,
            color: 'bg-indigo-50 text-indigo-600',
            border: 'border-indigo-100',
        },
        {
            label: 'Need Treatment',
            value: metrics.need_treatment,
            icon: Stethoscope,
            color: 'bg-red-50 text-red-600',
            border: 'border-red-100',
        },
        {
            label: 'Healthy',
            value: metrics.healthy,
            icon: CheckCircle2,
            color: 'bg-green-50 text-green-600',
            border: 'border-green-100',
        },
        {
            label: (metrics.needs_impoundment || overdueAnimals.length > 0) ? 'Needs Impound' : 'Nearing Expiry',
            value: (metrics.needs_impoundment || overdueAnimals.length > 0) ? (metrics.needs_impoundment ?? overdueAnimals.length) : (metrics.nearing_expiry || nearingAnimals.length),
            icon: (metrics.needs_impoundment || overdueAnimals.length > 0) ? AlertTriangle : Clock,
            color: (metrics.needs_impoundment || overdueAnimals.length > 0) ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
            border: (metrics.needs_impoundment || overdueAnimals.length > 0) ? 'border-red-200 ring-1 ring-red-200' : 'border-amber-100',
        },
        {
            label: 'Discharged Today',
            value: metrics.resolved_today,
            icon: Flag,
            color: 'bg-purple-50 text-purple-600',
            border: 'border-purple-100',
        },
    ];

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            {isAdmin ? <AdminSidebar /> : <BrgySidebar />}

            <div className="flex-1 flex flex-col overflow-hidden">
                {isAdmin ? (
                    <AdminNavbar
                        leftContent={
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Holding Facility</h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Cross-jurisdiction animal holding facilities, intake & duration tracking
                                </p>
                            </div>
                        }
                    />
                ) : (
                    <BrgyNavbar
                        leftContent={
                            <div className="flex flex-col">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Holding Facility</h1>
                                <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                    Animal intake, monitoring & case resolution
                                </p>
                            </div>
                        }
                    />
                )}

                <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-6">

                        {/* ── Facility Selector & Management Header ─────────── */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
                                    <Building2 className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                                            Holding Facility Selector
                                        </span>
                                        {activeFacility && (
                                            <span className="text-[10px] font-bold text-gray-400">
                                                {activeFacility.facility_type || 'Holding Facility'}
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-lg font-black text-gray-900 leading-snug">
                                        {activeFacility ? activeFacility.name : (
                                            isAdmin
                                                ? (selectedScope === 'all' ? 'All Holding Facilities Across Jurisdictions' : 'Filtered Jurisdiction Facilities')
                                                : 'Assigned Barangay Holding Facilities'
                                        )}
                                    </h2>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-3">
                                {/* Admin Step 1: Select Subdivision / Barangay */}
                                {isAdmin && (
                                    <div className="relative min-w-[220px]">
                                        <label className="block text-[9px] font-black uppercase text-indigo-700 tracking-wider mb-1">
                                            1. Subdivision / Barangay
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={selectedScope}
                                                onChange={(e) => {
                                                    setSelectedScope(e.target.value);
                                                    setSelectedFacilityId('all');
                                                }}
                                                className="w-full appearance-none bg-indigo-50/70 hover:bg-indigo-50 border-2 border-indigo-200 focus:border-indigo-500 text-indigo-950 text-xs font-black rounded-xl px-4 py-2.5 pr-8 transition-all cursor-pointer outline-none shadow-xs"
                                            >
                                                <option value="all">All Subdivisions & Barangays</option>
                                                {jurisdictions.barangays.length > 0 && (
                                                    <optgroup label="Barangay Central Jurisdictions">
                                                        {jurisdictions.barangays.map(b => (
                                                            <option key={`brgy_${b.barangay_id}`} value={`brgy_${b.barangay_id}`}>
                                                                Barangay {b.barangay_name} ({b.city})
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                                {jurisdictions.subdivisions.length > 0 && (
                                                    <optgroup label="Subdivisions">
                                                        {jurisdictions.subdivisions.map(s => (
                                                            <option key={`subd_${s.subdivision_id}`} value={`subd_${s.subdivision_id}`}>
                                                                {s.subdivision_name} {s.barangay_name ? `(${s.barangay_name})` : ''}
                                                            </option>
                                                        ))}
                                                    </optgroup>
                                                )}
                                            </select>
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400 text-xs">
                                                ▼
                                            </span>
                                        </div>
                                    </div>
                                )}

                                {/* Step 2 (or Direct for Staff): Select Holding Facility */}
                                <div className="relative min-w-[240px]">
                                    {isAdmin && (
                                        <label className="block text-[9px] font-black uppercase text-gray-500 tracking-wider mb-1">
                                            2. Holding Facility
                                        </label>
                                    )}
                                    <div className="relative">
                                        <select
                                            value={selectedFacilityId}
                                            onChange={(e) => setSelectedFacilityId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                            className="w-full appearance-none bg-gray-50 hover:bg-gray-100 border-2 border-indigo-200 focus:border-indigo-500 text-gray-900 text-xs font-black rounded-xl px-4 py-2.5 pr-8 transition-all cursor-pointer outline-none shadow-xs"
                                        >
                                            <option value="all">
                                                All Facilities in Scope ({filteredFacilities.length})
                                            </option>
                                            {filteredFacilities.map((fac) => (
                                                <option key={fac.landmark_id} value={fac.landmark_id}>
                                                    {fac.name} {fac.capacity ? `(Cap: ${fac.capacity})` : ''} {isAdmin && (fac.subdivision_name ? `• ${fac.subdivision_name}` : (fac.barangay_name ? `• Brgy ${fac.barangay_name}` : ''))}
                                                </option>
                                            ))}
                                        </select>
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">
                                            ▼
                                        </span>
                                    </div>
                                </div>

                                {isHeadOfficer && (
                                    <button
                                        type="button"
                                        onClick={() => navigate('/brgy/settings')}
                                        className="px-4 py-2.5 bg-orange-50 hover:bg-orange-100 border border-orange-200 text-orange-700 text-xs font-black rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer self-end md:self-auto"
                                        title="Add, edit, or remove Barangay landmarks and holding facilities"
                                    >
                                        <Settings className="w-3.5 h-3.5" />
                                        <span>Manage Facilities</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* ── Active Facility Status Card (if specific facility selected) ── */}
                        {activeFacility && (
                            <div className="bg-gradient-to-r from-indigo-500/10 via-blue-500/5 to-transparent rounded-2xl border border-indigo-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs font-black text-indigo-900 uppercase tracking-wide">
                                        {activeFacility.name} — Status & Occupancy
                                    </p>
                                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 font-semibold">
                                        <span className="inline-flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Type: <strong className="text-gray-900">{activeFacility.facility_type || 'Holding Facility'}</strong></span>
                                        {activeFacility.contact_person && (
                                            <span className="inline-flex items-center gap-1"><User className="w-3 h-3" /> Caretaker: <strong className="text-gray-900">{activeFacility.contact_person}</strong></span>
                                        )}
                                        {activeFacility.contact_number && (
                                            <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> Phone: <strong className="text-gray-900">{activeFacility.contact_number}</strong></span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-indigo-200 shadow-xs">
                                    <div className="text-center">
                                        <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Occupied</p>
                                        <p className="text-base font-black text-indigo-600">{activeOccupancy}</p>
                                    </div>
                                    <span className="text-gray-300 font-light text-lg">/</span>
                                    <div className="text-center">
                                        <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Capacity</p>
                                        <p className="text-base font-black text-gray-800">{activeFacility.capacity || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Metrics Row ───────────────────────────────────── */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            {metricCards.map((m, i) => (
                                <div
                                    key={i}
                                    className={`bg-white rounded-2xl border ${m.border} shadow-sm p-5 flex items-center gap-3 hover:shadow-md transition-all`}
                                >
                                    <div className={`w-11 h-11 rounded-xl ${m.color} flex items-center justify-center shrink-0`}>
                                        <m.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">{m.label}</p>
                                        <p className="text-2xl font-black text-gray-900 mt-1 leading-none">{m.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── Overdue Impoundment & Adoption Alert Banner ─────────────── */}
                        {overdueAnimals.length > 0 && (
                            <div className="bg-gradient-to-r from-red-500/10 via-amber-500/10 to-orange-500/5 rounded-3xl border-2 border-red-300 p-5 md:p-6 shadow-md animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-red-200/60">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-500/30 animate-pulse shrink-0">
                                            <AlertTriangle className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-base font-black text-red-950 tracking-tight">
                                                    Impoundment & Adoption Alert
                                                </h3>
                                                <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black tracking-wider uppercase shadow-xs">
                                                    {overdueAnimals.length} Action Needed
                                                </span>
                                            </div>
                                            <p className="text-xs font-semibold text-red-800/90 mt-0.5">
                                                {overdueAnimals.length === 1 ? '1 animal has' : `${overdueAnimals.length} animals have`} reached or exceeded the <span className="font-extrabold underline decoration-red-400">{impoundStayDuration}-day maximum holding stay limit</span>. Review and choose: promote for adoption or mark as impounded.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-mono font-bold text-red-700 bg-red-100/80 px-3 py-1.5 rounded-xl border border-red-200 self-start sm:self-auto shrink-0">
                                        Threshold: {impoundStayDuration} Days
                                    </div>
                                </div>

                                {/* Overdue Animal Mini-Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                                    {overdueAnimals.map((animal) => {
                                        const days = daysSince(animal.intake_date);
                                        const overDays = days - impoundStayDuration;
                                        const thumbImg = animal.report_media?.find(
                                            m => m.media_type === 'Image' || m.file_url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)
                                        );

                                        return (
                                            <div 
                                                key={animal.holding_id}
                                                className="bg-white rounded-2xl border border-red-200 p-3.5 shadow-xs flex flex-col justify-between hover:border-red-400 hover:shadow-md transition-all gap-3"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-200 relative">
                                                        {thumbImg ? (
                                                            <img src={thumbImg.file_url} alt={animal.animal_name || 'Animal'} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center">
                                                                {animalIcon(animal.animal_type)}
                                                            </div>
                                                        )}
                                                        <span className="absolute bottom-0 inset-x-0 bg-red-600 text-white text-[8px] font-black text-center uppercase tracking-wider py-0.5">
                                                            {days}d held
                                                        </span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center justify-between gap-1">
                                                            <span className="text-[9px] font-mono font-bold text-gray-400">
                                                                #{animal.report_id.toString().padStart(4, '0')}
                                                            </span>
                                                            <span className="text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                                                                {overDays > 0 ? `+${overDays}d over` : 'Due today'}
                                                            </span>
                                                        </div>
                                                        <h4 className="text-xs font-black text-gray-900 truncate mt-0.5">
                                                            {animal.animal_name || `${animal.animal_type || 'Animal'} #${animal.holding_id}`}
                                                        </h4>
                                                        <p className="text-[10px] text-gray-500 font-medium truncate flex items-center gap-1">
                                                            {animal.breed || 'Unknown Breed'} • <MapPin className="w-2.5 h-2.5" /> {animal.facility_name || animal.report_landmark || 'Facility'}
                                                        </p>
                                                    </div>
                                                </div>

                                                {/* Dual Action Buttons: Adopt vs Impound */}
                                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-gray-100">
                                                    <button
                                                        type="button"
                                                        onClick={() => openPromoteModalForAnimal(animal)}
                                                        className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-black rounded-lg border border-emerald-200 transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs hover:scale-102"
                                                        title="Make animal available for public adoption"
                                                    >
                                                        <Rocket className="w-3 h-3" />
                                                        <span>Adopt Out</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuickImpoundAnimal(animal)}
                                                        className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer shadow-2xs hover:scale-102"
                                                        title="Officially impound animal and close case"
                                                    >
                                                        <Scale className="w-3 h-3" />
                                                        <span>Impound</span>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── Toolbar ───────────────────────────────────────── */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex flex-col md:flex-row md:items-center gap-3">
                            <div className="relative flex-1 max-w-sm">
                                <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </span>
                                <input
                                    type="text"
                                    placeholder="Search by type, breed, location, report ID..."
                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>

                            {/* ── Stay Duration Before Impoundment Number Spinner ── */}
                            <div className="flex items-center gap-2.5 bg-amber-50/80 border border-amber-200/90 px-3 py-1.5 rounded-xl shadow-2xs">
                                <div className="flex flex-col">
                                    <span className="text-[9px] font-black uppercase tracking-wider text-amber-950 leading-none">
                                        Impound Stay Limit
                                    </span>
                                    <span className="text-[8px] font-bold text-amber-700/80 mt-0.5">
                                        Duration Spinner
                                    </span>
                                </div>
                                <div className="flex items-center bg-white rounded-lg border border-amber-300 shadow-2xs overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => handleDurationChange(impoundStayDuration - 1)}
                                        disabled={impoundStayDuration <= 0}
                                        className="w-7 h-7 flex items-center justify-center text-amber-900 hover:bg-amber-100 disabled:opacity-30 disabled:hover:bg-transparent font-black text-sm transition-colors cursor-pointer"
                                        title="Decrease stay limit"
                                    >
                                        −
                                    </button>
                                    <input
                                        type="number"
                                        min={0}
                                        max={90}
                                        value={impoundStayDuration}
                                        onChange={(e) => handleDurationChange(Number(e.target.value))}
                                        className="w-10 text-center font-black text-xs text-amber-950 focus:outline-none bg-transparent"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleDurationChange(impoundStayDuration + 1)}
                                        disabled={impoundStayDuration >= 90}
                                        className="w-7 h-7 flex items-center justify-center text-amber-900 hover:bg-amber-100 disabled:opacity-30 disabled:hover:bg-transparent font-black text-sm transition-colors cursor-pointer"
                                        title="Increase stay limit"
                                    >
                                        +
                                    </button>
                                </div>
                                <span className="text-xs font-black text-amber-900">days</span>
                            </div>

                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(Number(e.target.value))}
                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-indigo-200 outline-none"
                            >
                                <option value={0}>All Statuses</option>
                                {FACILITY_STATUSES.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>

                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={showResolved}
                                    onChange={e => setShowResolved(e.target.checked)}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                Show Discharged
                            </label>

                            <button
                                onClick={fetchAll}
                                className="ml-auto flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Refresh
                            </button>
                        </div>

                        {/* ── Animal Cards Grid ─────────────────────────────── */}
                        {loading ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 gap-3">
                                <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                <p className="text-sm text-gray-400 font-semibold">Loading facility records...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 gap-3">
                                <PawPrint className="w-12 h-12 text-gray-300" />
                                <p className="text-gray-400 font-semibold text-sm">No animals in holding facility.</p>
                                <p className="text-gray-300 text-xs">Animals are automatically admitted when a rescue is marked as "Picked Up".</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filtered.map(animal => {
                                    const statusMeta = getStatusMeta(animal.facility_status);
                                    const days = daysSince(animal.intake_date);
                                    const remaining = daysRemaining(animal.intake_date, impoundStayDuration);
                                    const isResolved = RESOLVED_IDS.has(animal.facility_status);
                                    const isOverdue = !isResolved && days >= impoundStayDuration;
                                    const isNearExpiry = !isResolved && !isOverdue && remaining <= 2;
                                    const firstImage = animal.report_media?.find(
                                        m => m.media_type === 'Image' || m.file_url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)
                                    ) || (animal.timeline ? animal.timeline.flatMap(t => (t as any).media || []).find((m: any) => m.file_url) : undefined);

                                    return (
                                        <div
                                            key={animal.holding_id}
                                            onClick={() => openDetail(animal)}
                                            className={`bg-white rounded-3xl border shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300 flex flex-col overflow-hidden cursor-pointer group ${
                                                isOverdue 
                                                    ? 'border-red-300 ring-2 ring-red-200/60 shadow-md' 
                                                    : isResolved 
                                                        ? 'opacity-75 bg-gray-50/50 border-gray-150' 
                                                        : 'border-gray-100'
                                            }`}
                                        >
                                            {/* Card Top / Prominent Image Hero */}
                                            <div className="relative w-full h-52 bg-slate-100 overflow-hidden">
                                                {firstImage ? (
                                                    <>
                                                        <img
                                                            src={firstImage.file_url}
                                                            alt={animal.animal_name || 'Animal in Facility'}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30 pointer-events-none" />
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-br from-indigo-50 via-slate-50 to-purple-50 flex flex-col items-center justify-center relative p-4 text-center">
                                                        <span className="drop-shadow-sm transform group-hover:scale-110 transition-transform duration-300">
                                                            {animalIcon(animal.animal_type, 'w-16 h-16')}
                                                        </span>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-2">
                                                            No Photo Uploaded
                                                        </span>
                                                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900/60 via-transparent to-transparent pointer-events-none" />
                                                    </div>
                                                )}

                                                {/* Top Badges Overlay */}
                                                <div className="absolute top-3 inset-x-3 flex items-center justify-between gap-2 pointer-events-none">
                                                    {/* Kennel Slot Pill */}
                                                    {animal.kennel_slot ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/90 backdrop-blur-md text-indigo-700 text-[11px] font-black rounded-full shadow-sm border border-white/50">
                                                            <MapPin className="w-3 h-3" /> {animal.kennel_slot}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-black/40 backdrop-blur-md text-white/90 text-[10px] font-semibold rounded-full border border-white/20">
                                                            <MapPin className="w-3 h-3" /> Not Assigned
                                                        </span>
                                                    )}

                                                    {/* Facility Status Badge */}
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase backdrop-blur-md shadow-sm border ${
                                                        firstImage 
                                                            ? 'bg-white/95 text-gray-900 border-white/60' 
                                                            : statusMeta.color
                                                    }`}>
                                                        {statusMeta.name}
                                                    </span>
                                                </div>

                                                {/* Bottom Animal Name & Category on Image */}
                                                <div className="absolute bottom-3 inset-x-4 pointer-events-none">
                                                    <div className="flex items-end justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-2 mb-0.5">
                                                                <span className="text-[10px] font-mono font-black text-white bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/20">
                                                                    #{animal.report_id.toString().padStart(4, '0')}
                                                                </span>
                                                                <span className="text-[11px] font-bold text-white/90 truncate drop-shadow-sm">
                                                                    {animal.report_category || 'Rescue'}
                                                                </span>
                                                            </div>
                                                            <h3 className="font-black text-white text-lg leading-tight truncate drop-shadow-md group-hover:text-indigo-200 transition-colors">
                                                                {animal.animal_name || `${animal.animal_type || 'Animal'} #${animal.holding_id}`}
                                                            </h3>
                                                            <p className="text-xs text-white/80 font-medium truncate drop-shadow-sm">
                                                                {animal.breed || 'Unknown Breed'} · {animal.color || 'Unknown Color'}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card Body - Details */}
                                            <div className="p-5 space-y-3 flex-1 text-xs">
                                                {/* Grid for Dates & Stay Durations */}
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div className="bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Intake Date</p>
                                                        <p className="font-bold text-gray-800 text-xs mt-0.5">{formatDate(animal.intake_date)}</p>
                                                    </div>
                                                    <div className="bg-gray-50/70 p-2.5 rounded-xl border border-gray-100">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Custody</p>
                                                        {isResolved ? (
                                                            <p className="font-bold text-gray-400 text-xs mt-0.5">Discharged ({animal.total_duration_display || '—'})</p>
                                                        ) : (
                                                            <p className={`font-black text-xs mt-0.5 ${days >= IMPOUND_DAYS ? 'text-red-600' : 'text-gray-800'}`}>
                                                                {animal.total_duration_display || `${days} day(s)`}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Facility Stay Breakdown Pills */}
                                                <div className="flex items-center justify-between gap-1.5 p-2 bg-indigo-50/40 rounded-xl border border-indigo-100/60 text-[10px]">
                                                    <span className="font-bold text-indigo-900 truncate inline-flex items-center gap-1">
                                                        <Home className="w-2.5 h-2.5" /> Subd: <strong className="text-indigo-700">{animal.subd_duration_display || '0 days'}</strong>
                                                    </span>
                                                    <span className="text-gray-300">|</span>
                                                    <span className="font-bold text-indigo-900 truncate inline-flex items-center gap-1">
                                                        <Building2 className="w-2.5 h-2.5" /> Brgy: <strong className="text-indigo-700">{animal.brgy_duration_display || '0 days'}</strong>
                                                    </span>
                                                </div>

                                                {/* Impound Deadline */}
                                                <div className="flex items-center justify-between p-2.5 bg-gray-50/50 rounded-xl border border-gray-100/80">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Impound Deadline</span>
                                                    <div>
                                                        {isResolved ? (
                                                            <span className="text-xs text-gray-400 font-bold">Completed</span>
                                                        ) : isOverdue ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-[11px] font-black rounded-lg border border-red-200 animate-pulse shadow-xs">
                                                                <AlertTriangle className="w-2.5 h-2.5" /> Needs Impound / Adopt ({days}/{impoundStayDuration}d)
                                                            </span>
                                                        ) : isNearExpiry ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-600 text-[11px] font-black rounded-lg border border-amber-200 shadow-xs">
                                                                <AlertTriangle className="w-2.5 h-2.5" /> {remaining}d left
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs font-bold text-gray-700">
                                                                {remaining} days remaining
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Location Landmark */}
                                                {(animal.facility_name || animal.report_landmark) && (
                                                    <div className="text-[11px] text-gray-500 font-medium truncate flex items-center gap-1.5 px-1">
                                                        <MapPin className="w-3 h-3 text-gray-400" />
                                                        <span className="truncate">{animal.facility_name || animal.report_landmark}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Card Action Footer */}
                                            <div className="p-4 pt-3 bg-gray-50/60 border-t border-gray-100 flex items-center justify-between mt-auto gap-2 flex-wrap">
                                                {isOverdue && !isSubdLeader ? (
                                                    <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                                        <button
                                                            type="button"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                openPromoteModalForAnimal(animal);
                                                            }}
                                                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black rounded-xl transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                                                            title="Promote to Public Adoption Catalog"
                                                        >
                                                            <Rocket className="w-3 h-3" />
                                                            <span>Adopt</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                setQuickImpoundAnimal(animal);
                                                            }}
                                                            className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black rounded-xl transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                                                            title="Officially Impound Animal"
                                                        >
                                                            <Scale className="w-3 h-3" />
                                                            <span>Impound</span>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-gray-400 font-semibold group-hover:text-indigo-600 transition-colors">
                                                        Click to view notes & logs
                                                    </span>
                                                )}
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        openDetail(animal);
                                                    }}
                                                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all uppercase tracking-wider ml-auto cursor-pointer"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                    Manage
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* ── Info Banner ───────────────────────────────────── */}
                        <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 flex items-start gap-4">
                            <div className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0"><Info className="w-4 h-4" /></div>
                            <div>
                                <h4 className="text-sm font-bold text-indigo-900">Automatic Intake</h4>
                                <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                                    Animals are automatically admitted when a rescue is marked as <strong>Picked Up</strong> in the Rescue Requests page.
                                    All intakes start with status <strong>Need Treatment</strong>. Update the status and add notes below to monitor the animal's progress.
                                    Setting the status to <strong>Claimed by Owner</strong>, <strong>Deceased</strong>, or <strong>Transferred to Shelter</strong> automatically closes the linked report.
                                </p>
                            </div>
                        </div>

                    </div>
                </main>
            </div>

            {/* ─── Detail / Manage Modal ────────────────────────────────────── */}
            {selected && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-100">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center">
                                    {animalIcon(selected.animal_type)}
                                </div>
                                <div>
                                    <h2 className="text-lg font-black text-gray-900">
                                        {selected.animal_name || `${selected.animal_type || 'Animal'} #${selected.holding_id}`}
                                    </h2>
                                    <p className="text-xs text-gray-400">Report #{selected.report_id.toString().padStart(4, '0')} · {selected.report_landmark || 'Unknown location'}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelected(null)}
                                className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-gray-100 px-6">
                            {(['info', 'timeline'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setDetailTab(tab)}
                                    className={`px-4 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 -mb-px ${detailTab === tab
                                            ? 'border-indigo-500 text-indigo-600'
                                            : 'border-transparent text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    {tab === 'info'
                                        ? <span className="inline-flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" /> Animal Info & Update</span>
                                        : <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Timeline ({selected.timeline.length})</span>}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto p-6">

                            {/* ── Info Tab ──────────────────────────────────── */}
                            {detailTab === 'info' && (
                                <div className="space-y-5">

                                    {/* Resident Uploaded Image */}
                                    {(() => {
                                        const residentImage = selected.report_media?.find(
                                            m => !m.is_evidence && (m.media_type === 'Image' || m.file_url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i))
                                        );
                                        if (!residentImage) return null;
                                        return (
                                            <div className="relative w-full h-52 rounded-2xl overflow-hidden border border-gray-150 shadow-sm bg-gray-50 group">
                                                <img 
                                                    src={residentImage.file_url} 
                                                    alt="Resident Uploaded Animal" 
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent flex flex-col justify-end p-4">
                                                    <span className="text-[9px] font-black text-white/80 uppercase tracking-widest leading-none">Resident Uploaded Photo</span>
                                                    <h4 className="text-white font-bold text-sm mt-1">Stray Animal from Report #{selected.report_id}</h4>
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    {/* Stay Duration Breakdown Highlight Card */}
                                    <div className="bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/80 p-4 rounded-2xl border border-indigo-100 shadow-sm">
                                        <p className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                                            <Timer className="w-3.5 h-3.5" /> Facility Stay & Custody Duration
                                        </p>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-indigo-100/60 shadow-2xs">
                                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Home className="w-2.5 h-2.5" /> Subdivision Stay</p>
                                                <p className="text-sm font-black text-indigo-700 mt-1">{selected.subd_duration_display || '0 days'}</p>
                                            </div>
                                            <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-indigo-100/60 shadow-2xs">
                                                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Building2 className="w-2.5 h-2.5" /> Barangay Stay</p>
                                                <p className="text-sm font-black text-indigo-700 mt-1">{selected.brgy_duration_display || '0 days'}</p>
                                            </div>
                                            <div className="bg-indigo-600 text-white p-3 rounded-xl shadow-xs">
                                                <p className="text-[9px] font-bold text-indigo-200 uppercase tracking-wider">Total Custody</p>
                                                <p className="text-sm font-black text-white mt-1">{selected.total_duration_display || '0 days'}</p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Current Info Grid */}
                                    <div className="grid grid-cols-2 gap-3.5">
                                        {[
                                            { label: 'Animal Type', value: selected.animal_type || '—' },
                                            { label: 'Breed', value: selected.breed || '—' },
                                            { label: 'Color', value: selected.color || '—' },
                                            { label: 'Estimated Size', value: selected.estimated_size || '—' },
                                            { label: 'Kennel Slot', value: selected.kennel_slot || '—' },
                                            { label: 'Current Facility', value: selected.facility_name || selected.report_landmark || '—' },
                                            { label: 'Intake Staff', value: selected.intake_staff_name || '—' },
                                        ].map(row => (
                                            <div key={row.label} className={`bg-gray-50 rounded-xl p-3 ${row.label === 'Intake Staff' ? 'col-span-2' : ''}`}>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{row.label}</p>
                                                <p className="text-sm font-semibold text-gray-800 mt-0.5">{row.value}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Uploaded Media & Evidence Gallery */}
                                    {selected.report_media && selected.report_media.length > 0 && (
                                        <div className="border border-gray-100 rounded-2xl p-5 bg-white space-y-3">
                                            <h3 className="text-xs font-black text-gray-800 uppercase tracking-widest flex items-center gap-1.5">
                                                <Camera className="w-3.5 h-3.5" /> Uploaded Media & Evidence
                                            </h3>
                                            <div className="grid grid-cols-3 gap-3">
                                                {selected.report_media.map((media, idx) => {
                                                    const isVideo = media.media_type === 'Video' || media.file_url.toLowerCase().match(/\.(mp4|mov|avi|webm)$/i);
                                                    const isDoc = media.media_type === 'Document' || media.file_url.toLowerCase().endsWith('.pdf') || media.file_url.toLowerCase().endsWith('.docx');
                                                    
                                                    return (
                                                        <div 
                                                            key={media.media_id} 
                                                            onClick={() => setLightboxMedia({ mediaList: selected.report_media || [], index: idx })}
                                                            className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer group hover:border-indigo-400 hover:shadow-md transition-all duration-200"
                                                        >
                                                            {isDoc ? (
                                                                <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                                                                    <FileText className="w-8 h-8 text-gray-400" />
                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1 truncate w-full">Document</span>
                                                                </div>
                                                            ) : isVideo ? (
                                                                <div className="w-full h-full relative">
                                                                    <video src={media.file_url} className="w-full h-full object-cover pointer-events-none" />
                                                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/35 transition-colors">
                                                                        <PlayCircle className="w-6 h-6 text-white drop-shadow-md" />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="w-full h-full relative">
                                                                    <img src={media.file_url} alt="Animal evidence" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}


                                    {/* Discharge info */}
                                    {selected.discharge_date && (
                                        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                            <p className="text-xs font-bold text-green-800 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Discharged on {formatDateTime(selected.discharge_date)}</p>
                                        </div>
                                    )}

                                    {/* ── Adoption Management (Barangay Exclusive) ──────── */}
                                    {selected.facility_status === 6 && (
                                        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-5 space-y-3 shadow-xs">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                                                        <PawPrint className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-sm font-black text-indigo-950">Active in Adoption Catalog</h4>
                                                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-bold rounded-full">Status: For Adoption</span>
                                                        </div>
                                                        <p className="text-xs text-indigo-700 mt-0.5">
                                                            This animal is actively listed for public citizen adoption.
                                                        </p>
                                                    </div>
                                                </div>
                                                {!isSubdLeader && (
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate('/brgy/adoptions')}
                                                        className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 shrink-0"
                                                    >
                                                        Adoptions Portal →
                                                    </button>
                                                )}
                                            </div>
                                            {selected.adoption_catalog_notes && (
                                                <div className="bg-white/90 p-3 rounded-xl border border-indigo-100/80 text-xs text-indigo-900">
                                                    <span className="font-bold text-indigo-700 text-[10px] uppercase tracking-wider block mb-0.5">Catalog Highlights:</span>
                                                    {selected.adoption_catalog_notes}
                                                </div>
                                            )}
                                            {isHeadOfficer && !isSubdLeader && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setPromoteNotes(selected.adoption_catalog_notes || '');
                                                        setPromoteError(null);
                                                        setPromoteSuccess(null);
                                                        setPromoteModalOpen(true);
                                                    }}
                                                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer inline-flex items-center gap-1"
                                                >
                                                    <Pencil className="w-3 h-3" /> Edit Catalog Highlights
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {!RESOLVED_IDS.has(selected.facility_status) && selected.facility_status !== 6 && !isSubdLeader && (
                                        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-200 rounded-2xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm shrink-0 mt-0.5">
                                                    <Sparkles className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-sm font-black text-emerald-950">Promote to Adoption Catalog</h4>
                                                        {daysSince(selected.intake_date) >= impoundStayDuration ? (
                                                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">
                                                                Ready ({impoundStayDuration}+ Days)
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">
                                                                Day {daysSince(selected.intake_date)} of {impoundStayDuration}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-emerald-700 mt-1 leading-relaxed">
                                                        {daysSince(selected.intake_date) >= impoundStayDuration
                                                            ? `${impoundStayDuration}-day stay limit reached. Make this pet available for public citizen adoption.`
                                                            : `Holding period in progress (stay limit: ${impoundStayDuration} days). Head Officers can promote early if medical evaluation is complete.`}
                                                    </p>
                                                </div>
                                            </div>
                                            {(isHeadOfficer || daysSince(selected.intake_date) >= impoundStayDuration) ? (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setPromoteNotes(selected.medical_notes || '');
                                                        setPromoteError(null);
                                                        setPromoteSuccess(null);
                                                        setPromoteModalOpen(true);
                                                    }}
                                                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all shadow-md shadow-emerald-200 uppercase tracking-wider shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                                                >
                                                    <Rocket className="w-3.5 h-3.5" /> Promote Now
                                                </button>
                                            ) : (
                                                <span className="text-[11px] font-bold text-gray-500 bg-white/80 px-3 py-1.5 rounded-xl border border-gray-200 shrink-0 text-center">
                                                    Available at {impoundStayDuration} days or Head Officer Approval
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Overdue Stay Limit Notice in Detail Modal ────── */}
                                    {!RESOLVED_IDS.has(selected.facility_status) && daysSince(selected.intake_date) >= impoundStayDuration && (
                                        <div className="bg-red-50/90 border-2 border-red-300 rounded-2xl p-4 shadow-xs space-y-3 animate-in fade-in duration-200">
                                            <div className="flex items-start gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                                                    <AlertTriangle className="w-4 h-4" />
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="text-sm font-black text-red-950">Action Required: Stay Limit Reached</h4>
                                                        <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black uppercase tracking-wider">
                                                            {daysSince(selected.intake_date)} Days Held
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-red-800 mt-1 leading-relaxed">
                                                        This animal has reached or exceeded the <strong>{impoundStayDuration}-day impoundment stay limit</strong>.
                                                        Barangay staff can make this pet available for public adoption or officially record its impoundment.
                                                    </p>
                                                </div>
                                            </div>
                                            {!isSubdLeader && (
                                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-red-200/60">
                                                    <button
                                                        type="button"
                                                        onClick={() => openPromoteModalForAnimal(selected)}
                                                        className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                                                    >
                                                        <Rocket className="w-3.5 h-3.5" />
                                                        <span>Promote for Adoption</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setQuickImpoundAnimal(selected)}
                                                        className="py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer uppercase tracking-wider"
                                                    >
                                                        <Scale className="w-3.5 h-3.5" />
                                                        <span>Mark as Impounded</span>
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Update Form ──────────────────────── */}
                                    {!RESOLVED_IDS.has(selected.facility_status) && (
                                        <div className="border border-gray-100 rounded-2xl p-5 space-y-4 bg-gray-50/50">
                                            <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Update Animal Record</h3>

                                            <div>
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Facility Status</label>
                                                <select
                                                    value={updateForm.facility_status}
                                                    onChange={e => setUpdateForm(f => ({ ...f, facility_status: Number(e.target.value) }))}
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:ring-2 focus:ring-indigo-200 outline-none"
                                                >
                                                    {FACILITY_STATUSES.map(s => (
                                                        <option key={s.id} value={s.id}>{s.name}</option>
                                                    ))}
                                                </select>
                                                {RESOLVED_IDS.has(updateForm.facility_status) && (
                                                    <p className="text-[10px] text-amber-600 font-semibold mt-1.5 flex items-start gap-1">
                                                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> This will discharge the animal and automatically close the linked report (Resolved).
                                                    </p>
                                                )}
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Kennel / Bay Slot</label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. B-02, Ward 3..."
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                                                    value={updateForm.kennel_slot}
                                                    onChange={e => setUpdateForm(f => ({ ...f, kennel_slot: e.target.value }))}
                                                />
                                            </div>

                                            {/* Holding Intake & Custody Timeline (Read-Only) */}
                                            <div className="p-3.5 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Holding Intake Started</span>
                                                        <span className="text-[9px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-sm">
                                                            {formatDateTime(selected.intake_date)}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 font-medium mt-0.5">
                                                        Stay limit: <strong className="text-gray-800">{impoundStayDuration} days</strong> (configured in Station Settings)
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="text-right">
                                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Time in Custody</p>
                                                        <p className="text-sm font-black text-indigo-700 leading-none mt-0.5">
                                                            {selected.brgy_duration_display || `${daysSince(selected.intake_date)} days`}
                                                        </p>
                                                    </div>
                                                    {daysSince(selected.intake_date) >= impoundStayDuration ? (
                                                        <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-lg border border-red-200 uppercase tracking-wider animate-pulse inline-flex items-center gap-1">
                                                            <AlertTriangle className="w-2.5 h-2.5" /> Overdue
                                                        </span>
                                                    ) : (
                                                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-200 uppercase tracking-wider">
                                                            Active ({Math.max(0, impoundStayDuration - daysSince(selected.intake_date))}d left)
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Medical Notes</label>
                                                <textarea
                                                    rows={2}
                                                    placeholder="Vaccination status, injuries, treatments..."
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
                                                    value={updateForm.medical_notes}
                                                    onChange={e => setUpdateForm(f => ({ ...f, medical_notes: e.target.value }))}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Update Notes (for timeline)</label>
                                                <input
                                                    type="text"
                                                    placeholder="Optional note for this update..."
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                                                    value={updateForm.update_notes}
                                                    onChange={e => setUpdateForm(f => ({ ...f, update_notes: e.target.value }))}
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Upload Media (for more proof)</label>
                                                <div className="flex flex-col gap-2 bg-white border border-gray-200 rounded-xl p-3">
                                                    <input
                                                        type="file"
                                                        accept="image/*,video/*"
                                                        multiple
                                                        onChange={e => {
                                                            if (e.target.files) {
                                                                setUploadFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                                            }
                                                        }}
                                                        className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                                                    />
                                                    {uploadFiles.length > 0 && (
                                                        <div className="space-y-1.5 mt-1 border-t border-gray-100 pt-2">
                                                            <div className="flex items-center justify-between text-[10px] font-black uppercase text-gray-400">
                                                                <span>Selected files ({uploadFiles.length})</span>
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => setUploadFiles([])}
                                                                    className="text-red-500 hover:text-red-600 font-bold"
                                                                >
                                                                    Clear all
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                                                                {uploadFiles.map((file, idx) => (
                                                                    <div key={idx} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded border border-gray-100 text-[10px] text-gray-600">
                                                                        <span className="truncate flex-1 pr-1 inline-flex items-center gap-1"><Paperclip className="w-2.5 h-2.5 shrink-0" /> {file.name}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))}
                                                                            className="text-red-500 hover:text-red-750 font-extrabold shrink-0 ml-1"
                                                                        >
                                                                            <X className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                onClick={handleUpdate}
                                                disabled={isUpdating}
                                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                                            >
                                                {isUpdating ? (
                                                    <>
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                        Saving...
                                                    </>
                                                ) : 'Save Changes'}
                                            </button>
                                        </div>
                                    )}

                                </div>
                            )}

                            {/* ── Timeline Tab ──────────────────────────────── */}
                            {detailTab === 'timeline' && (
                                <div className="space-y-5">

                                    {/* Add manual entry */}
                                    {!RESOLVED_IDS.has(selected.facility_status) && (
                                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
                                            <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest">Add Timeline Entry</h3>
                                            <div className="flex gap-2">
                                                <select
                                                    value={timelineForm.event_type}
                                                    onChange={e => setTimelineForm(f => ({ ...f, event_type: e.target.value }))}
                                                    className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:ring-2 focus:ring-indigo-200 outline-none"
                                                >
                                                    <option value="observation">Observation</option>
                                                    <option value="medical">Medical</option>
                                                    <option value="treatment">Treatment</option>
                                                    <option value="status_change">Status Change</option>
                                                </select>
                                                <input
                                                    type="text"
                                                    placeholder="Title / summary..."
                                                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-200 outline-none"
                                                    value={timelineForm.title}
                                                    onChange={e => setTimelineForm(f => ({ ...f, title: e.target.value }))}
                                                />
                                            </div>
                                            <textarea
                                                rows={2}
                                                placeholder="Detailed notes..."
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
                                                value={timelineForm.notes}
                                                onChange={e => setTimelineForm(f => ({ ...f, notes: e.target.value }))}
                                            />

                                            {/* Upload Media for timeline */}
                                            <div>
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1 mb-1.5"><Paperclip className="w-3 h-3" /> Attach Media (optional)</label>
                                                <div className="flex flex-col gap-2 bg-white border border-gray-200 rounded-xl p-3">
                                                    <input
                                                        type="file"
                                                        accept="image/*,video/*"
                                                        multiple
                                                        onChange={e => {
                                                            if (e.target.files) {
                                                                setTimelineFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                        className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer"
                                                    />
                                                    {timelineFiles.length > 0 && (
                                                        <div className="space-y-1.5 border-t border-gray-100 pt-2">
                                                            <div className="flex items-center justify-between text-[10px] font-black uppercase text-gray-400">
                                                                <span>{timelineFiles.length} file{timelineFiles.length !== 1 ? 's' : ''} selected</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setTimelineFiles([])}
                                                                    className="text-red-500 hover:text-red-600 font-bold"
                                                                >Clear all</button>
                                                            </div>
                                                            <div className="flex flex-col gap-1 max-h-20 overflow-y-auto custom-scrollbar">
                                                                {timelineFiles.map((file, idx) => (
                                                                    <div key={idx} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded border border-gray-100 text-[10px] text-gray-600">
                                                                        <span className="truncate flex-1 pr-1 inline-flex items-center gap-1"><Paperclip className="w-2.5 h-2.5 shrink-0" /> {file.name}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setTimelineFiles(prev => prev.filter((_, i) => i !== idx))}
                                                                            className="text-red-500 font-extrabold shrink-0 ml-1"
                                                                        ><X className="w-3 h-3" /></button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <button
                                                onClick={handleAddTimeline}
                                                disabled={isAddingTimeline || !timelineForm.title.trim()}
                                                className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                                            >
                                                {isAddingTimeline ? (
                                                    <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading & Saving...</>
                                                ) : '+ Add Entry'}
                                            </button>
                                        </div>
                                    )}

                                    {/* Timeline list */}
                                    {selected.timeline.length === 0 ? (
                                        <div className="text-center py-10 text-gray-400 text-sm">No timeline entries yet.</div>
                                    ) : (
                                        <div className="relative">
                                            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />
                                            <div className="space-y-4">
                                                {[...selected.timeline].reverse().map((log) => {
                                                    const meta = EVENT_TYPE_META[log.event_type] || EVENT_TYPE_META['observation'];
                                                    return (
                                                        <div key={log.log_id} className="flex gap-4 relative">
                                                            <div className={`w-10 h-10 rounded-xl ${meta.color} flex items-center justify-center text-sm shrink-0 z-10`}>
                                                                {meta.icon}
                                                            </div>
                                                            <div className="flex-1 bg-white border border-gray-100 rounded-xl p-3.5 shadow-sm">
                                                                <div className="flex items-start justify-between gap-2">
                                                                    <p className="text-sm font-bold text-gray-900">{log.title}</p>
                                                                    <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">{formatDateTime(log.logged_at)}</span>
                                                                </div>
                                                                {log.notes && <p className="text-xs text-gray-500 mt-1 leading-relaxed">{log.notes}</p>}
                                                                {log.staff_name && (
                                                                    <p className="text-[10px] text-gray-400 mt-2 flex items-center gap-1">
                                                                        <User className="w-2.5 h-2.5" /> {log.staff_name}
                                                                    </p>
                                                                )}
                                                            </div>
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
                </div>
            )}

            {/* ─── Promote to Adoption Modal (Barangay Exclusive) ─────────────── */}
            {promoteModalOpen && selected && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[70] p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scale-up">
                        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <PawPrint className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-black text-gray-900 text-sm">Promote to Adoption</h3>
                                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Barangay Adoption Portal</p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    if (!isPromoting) setPromoteModalOpen(false);
                                }}
                                className="w-8 h-8 rounded-lg bg-gray-100 text-gray-400 hover:text-gray-600 flex items-center justify-center text-xs"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>

                        <p className="text-xs text-gray-600 leading-relaxed">
                            Promoting <strong className="text-gray-900">{selected.animal_name || `Animal #${selected.holding_id}`}</strong> will set its status to <strong className="text-indigo-600 font-bold">For Adoption</strong> and publish its profile to the citizen <strong>Adopt a Pet</strong> catalog.
                        </p>

                        {promoteError && (
                            <div className="p-3 bg-red-50 text-red-700 text-xs font-bold rounded-xl border border-red-200 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {promoteError}
                            </div>
                        )}
                        {promoteSuccess && (
                            <div className="p-3 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-200 flex items-center gap-1.5">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {promoteSuccess}
                            </div>
                        )}

                        <div>
                            <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 block mb-1">
                                Personality & Highlights for Citizens
                            </label>
                            <textarea
                                rows={3}
                                placeholder="e.g. Friendly, playful, great with kids, fully vaccinated..."
                                value={promoteNotes}
                                onChange={e => setPromoteNotes(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-800 focus:ring-2 focus:ring-indigo-200 outline-none resize-none"
                            />
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                type="button"
                                disabled={isPromoting}
                                onClick={() => setPromoteModalOpen(false)}
                                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={isPromoting}
                                onClick={handlePromoteToAdoption}
                                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-md shadow-emerald-200 transition-all"
                            >
                                {isPromoting ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Publishing...
                                    </>
                                ) : (
                                    'Publish to Catalog'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Lightbox / Media Viewer Modal ───────────────────────────────── */}
            {lightboxMedia && (
                <div 
                    className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-[100] p-4 select-none"
                    onClick={() => setLightboxMedia(null)}
                >
                    {/* Close Button */}
                    <button 
                        onClick={() => setLightboxMedia(null)}
                        className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-[110]"
                    >
                        <X className="w-5 h-5" />
                    </button>

                    {/* Media Container */}
                    <div 
                        className="w-full max-w-4xl max-h-[80vh] flex items-center justify-center p-2 relative"
                        onClick={e => e.stopPropagation()}
                    >
                        {(() => {
                            const current = lightboxMedia.mediaList[lightboxMedia.index];
                            if (!current) return null;
                            const isVideo = current.media_type === 'Video' || current.file_url.toLowerCase().match(/\.(mp4|mov|avi|webm)$/i);
                            const isDoc = current.media_type === 'Document' || current.file_url.toLowerCase().endsWith('.pdf') || current.file_url.toLowerCase().endsWith('.docx');

                            if (isDoc) {
                                return (
                                    <div className="bg-white rounded-3xl p-8 max-w-md w-full flex flex-col items-center text-center shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
                                        <FileText className="w-16 h-16 mb-4 text-gray-300" />
                                        <h3 className="text-lg font-black text-gray-900">Document Evidence</h3>
                                        <p className="text-xs text-gray-400 mt-1 mb-6">This attachment is a document or verification letter.</p>
                                        <div className="flex gap-3 w-full">
                                            <a 
                                                href={current.file_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-indigo-100 text-center"
                                            >
                                                Open Document
                                            </a>
                                            <button 
                                                onClick={() => setLightboxMedia(null)}
                                                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                                            >
                                                Close
                                            </button>
                                        </div>
                                    </div>
                                );
                            }

                            if (isVideo) {
                                return (
                                    <video 
                                        src={current.file_url} 
                                        controls 
                                        autoPlay 
                                        className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl animate-scale-up" 
                                        onClick={e => e.stopPropagation()} 
                                    />
                                );
                            }

                            return (
                                <img 
                                    src={current.file_url} 
                                    alt="Evidence view" 
                                    className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl animate-scale-up" 
                                    onClick={e => e.stopPropagation()} 
                                />
                            );
                        })()}

                        {/* Navigation Arrows */}
                        {lightboxMedia.mediaList.length > 1 && (
                            <>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setLightboxMedia(prev => {
                                            if (!prev) return null;
                                            const newIndex = (prev.index - 1 + prev.mediaList.length) % prev.mediaList.length;
                                            return { ...prev, index: newIndex };
                                        });
                                    }}
                                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-2xl transition-colors z-[110]"
                                >
                                    ◀
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setLightboxMedia(prev => {
                                            if (!prev) return null;
                                            const newIndex = (prev.index + 1) % prev.mediaList.length;
                                            return { ...prev, index: newIndex };
                                        });
                                    }}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-2xl transition-colors z-[110]"
                                >
                                    ▶
                                </button>
                            </>
                        )}
                    </div>

                    {/* Image Counter / Caption */}
                    <div className="mt-4 text-xs font-bold text-gray-400 tracking-wider">
                        {lightboxMedia.index + 1} of {lightboxMedia.mediaList.length}
                    </div>
                </div>
            )}

            {/* ─── Quick Impound Confirmation Modal ─────────────────────────────── */}
            {quickImpoundAnimal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-gray-150">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs">
                                <Scale className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-gray-900">
                                    Confirm Official Impoundment
                                </h3>
                                <p className="text-xs text-gray-500 font-semibold">
                                    Report #{quickImpoundAnimal.report_id} • {quickImpoundAnimal.animal_name || `${quickImpoundAnimal.animal_type || 'Animal'} #${quickImpoundAnimal.holding_id}`}
                                </p>
                            </div>
                        </div>

                        <div className="bg-amber-50/90 border border-amber-200/80 p-4 rounded-2xl text-xs text-amber-900 space-y-2">
                            <p className="font-bold">
                                Animal has reached <span className="font-black text-amber-950 underline">{daysSince(quickImpoundAnimal.intake_date)} days</span> of holding stay (Threshold: {impoundStayDuration} days).
                            </p>
                            <p className="text-[11px] text-amber-800/90 leading-relaxed">
                                Officially impounding will record its transfer to the Barangay impound custody log, update the status to <strong>Impounded</strong>, and resolve the linked incident report.
                            </p>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                            <button
                                type="button"
                                onClick={() => setQuickImpoundAnimal(null)}
                                disabled={isQuickImpounding}
                                className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-bold hover:bg-gray-100 transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => handleConfirmImpound(quickImpoundAnimal)}
                                disabled={isQuickImpounding}
                                className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                            >
                                {isQuickImpounding ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        <span>Impounding...</span>
                                    </>
                                ) : (
                                    <>
                                        <Scale className="w-3.5 h-3.5" />
                                        <span>Confirm Impoundment</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyHoldingFacility;
