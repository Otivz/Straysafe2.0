import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
    PawPrint, Truck, MapPin, RefreshCw, Pill, Stethoscope, ClipboardList,
    CheckCircle2, Cat, Dog, AlertTriangle, ScrollText, PartyPopper, Tag,
    Building2, User, Phone, Info, Timer, X, Hourglass, Home, Camera,
    FileText, PlayCircle, Paperclip, Calendar, Eye
} from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import api, { API_BASE_URL } from '../../utils/api';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';

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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IMPOUND_DAYS = 0; // Temporarily 0 for testing

const FACILITY_STATUSES = [
    { id: 1, name: 'Need Treatment', color: 'bg-red-50 text-red-600 border-red-200' },
    { id: 2, name: 'Healthy', color: 'bg-green-50 text-green-600 border-green-200' },
    { id: 3, name: 'Claimed by Owner', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    { id: 4, name: 'Deceased', color: 'bg-gray-100 text-gray-500 border-gray-200' },
    { id: 5, name: 'Transferred to Shelter', color: 'bg-purple-50 text-purple-600 border-purple-200' },
];

const RESOLVED_IDS = new Set([3, 4, 5]);

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

function daysSince(dateStr: string | null): number {
    if (!dateStr) return 0;
    const ms = Date.now() - new Date(dateStr).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function daysRemaining(dateStr: string | null, maxDays: number = IMPOUND_DAYS): number {
    const days = daysSince(dateStr);
    return Math.max(0, maxDays - days);
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
    if (type?.toLowerCase().includes('cat')) return <Cat className={className} />;
    if (type?.toLowerCase().includes('dog')) return <Dog className={className} />;
    return <PawPrint className={className} />;
}

function getAnimalPhoto(animal: HoldingAnimal): string | undefined {
    // 1. Look for genuine image files in report_media (ignore documents/PDFs/Word docs)
    const imageMedia = animal.report_media?.find(m => {
        if (m.media_type && m.media_type.toLowerCase() === 'document') return false;
        if (m.file_url) {
            const lower = m.file_url.toLowerCase();
            return !lower.endsWith('.pdf') && !lower.endsWith('.doc') && !lower.endsWith('.docx') && !lower.endsWith('.txt');
        }
        return false;
    });

    if (imageMedia?.file_url) return imageMedia.file_url;

    // 2. Look in timeline entries
    if (animal.timeline) {
        for (const t of animal.timeline) {
            const tMedia = (t as any).media;
            if (Array.isArray(tMedia)) {
                const img = tMedia.find((m: any) => {
                    if (m.media_type && m.media_type.toLowerCase() === 'document') return false;
                    if (m.file_url) {
                        const lower = m.file_url.toLowerCase();
                        return !lower.endsWith('.pdf') && !lower.endsWith('.doc') && !lower.endsWith('.docx') && !lower.endsWith('.txt');
                    }
                    return false;
                });
                if (img?.file_url) return img.file_url;
            }
        }
    }

    return undefined;
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SubdHoldingFacility = () => {
    const navigate = useNavigate();
    const [animals, setAnimals] = useState<HoldingAnimal[]>([]);
    const [facilities, setFacilities] = useState<FacilityOption[]>([]);
    const [selectedFacilityId, setSelectedFacilityId] = useState<number | 'all'>('all');
    const [tabMode, setTabMode] = useState<'active' | 'history'>('active');
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState(0); // 0 = All
    const [showResolved, setShowResolved] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Stay duration before handover / impoundment limit (in days)
    const [impoundStayDuration] = useState<number>(() => {
        const saved = localStorage.getItem('subd_holding_stay_duration');
        if (saved) {
            const parsed = parseInt(saved, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 90) return parsed;
        }
        return 0;
    });

    // Selected animal detail modal
    const [selected, setSelected] = useState<HoldingAnimal | null>(null);
    const [detailTab, setDetailTab] = useState<'info' | 'timeline'>('info');

    // Update modal & form state
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateForm, setUpdateForm] = useState({
        facility_status: 2,
        kennel_slot: '',
        medical_notes: '',
        update_notes: '',
    });
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);

    // Timeline form & state
    const [timelineForm, setTimelineForm] = useState({ event_type: 'observation', title: '', notes: '' });
    const [timelineFiles, setTimelineFiles] = useState<File[]>([]);
    const [isAddingTimeline, setIsAddingTimeline] = useState(false);

    // Lightbox modal state
    const [lightboxMedia, setLightboxMedia] = useState<{ mediaList: any[]; index: number } | null>(null);

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;
    const subdivisionId = currentUser?.subdivision_id;

    useEffect(() => {
        if (!userStr) navigate('/staff/login');
    }, [navigate, userStr]);

    // ── Fetch Facilities ───────────────────────────────────────────────────────
    useEffect(() => {
        const fetchFacilities = async () => {
            try {
                const targetSubdId = subdivisionId || 1;
                const url = `/landmarks?subdivision_id=${targetSubdId}&is_holding_facility=true`;
                const res = await api.get(url);
                if (Array.isArray(res.data)) {
                    setFacilities(res.data.filter((f: any) => f.subdivision_id === targetSubdId));
                }
            } catch (e) {
                console.error('Error fetching subdivision holding facilities:', e);
            }
        };
        fetchFacilities();
    }, [subdivisionId]);

    // ── Data Fetching ──────────────────────────────────────────────────────────
    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            const params: any = {};
            if (subdivisionId) params.subdivision_id = subdivisionId;
            if (selectedFacilityId !== 'all') params.facility_id = selectedFacilityId;

            const res = await api.get('/holding/', { params });
            setAnimals(res.data || []);
        } catch (err) {
            console.error('Error fetching subdivision holding facility data:', err);
        } finally {
            setLoading(false);
        }
    }, [subdivisionId, selectedFacilityId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Separate Active vs History Animals ─────────────────────────────────────
    const isCurrentlyInSubd = useCallback((a: HoldingAnimal) => {
        if (RESOLVED_IDS.has(a.facility_status)) return false;
        if (a.facility_type === 'barangay_facility' || (a.facility_name && a.facility_name.toLowerCase().includes('barangay'))) {
            return false;
        }
        if (facilities.length > 0 && a.facility_id) {
            return facilities.some(f => f.landmark_id === a.facility_id);
        }
        return true;
    }, [facilities]);

    const activeAnimals = useMemo(() => animals.filter(isCurrentlyInSubd), [animals, isCurrentlyInSubd]);
    const historyAnimals = useMemo(() => animals.filter(a => !isCurrentlyInSubd(a)), [animals, isCurrentlyInSubd]);

    // ── Filter Animals ─────────────────────────────────────────────────────────
    const currentList = tabMode === 'active' ? activeAnimals : historyAnimals;

    const filtered = currentList.filter(a => {
        if (tabMode === 'active' && !showResolved && RESOLVED_IDS.has(a.facility_status)) return false;
        if (statusFilter !== 0 && a.facility_status !== statusFilter) return false;
        const q = searchTerm.toLowerCase();
        return (
            (a.animal_type?.toLowerCase() || '').includes(q) ||
            (a.breed?.toLowerCase() || '').includes(q) ||
            (a.animal_name?.toLowerCase() || '').includes(q) ||
            (a.report_landmark?.toLowerCase() || '').includes(q) ||
            (a.facility_name?.toLowerCase() || '').includes(q) ||
            (a.kennel_slot?.toLowerCase() || '').includes(q) ||
            String(a.report_id).includes(q)
        );
    });

    // ── Active facility object ─────────────────────────────────────────────────
    const activeFacility = selectedFacilityId !== 'all'
        ? facilities.find(f => f.landmark_id === selectedFacilityId)
        : null;

    // Active occupancy count
    const activeOccupancy = activeAnimals.length;

    // Dynamic overdue and nearing expiry animals based on stay limit
    const overdueAnimals = useMemo(() => {
        return activeAnimals.filter(a => daysSince(a.intake_date) >= impoundStayDuration);
    }, [activeAnimals, impoundStayDuration]);

    const nearingAnimals = useMemo(() => {
        return activeAnimals.filter(a => {
            const days = daysSince(a.intake_date);
            const rem = impoundStayDuration - days;
            return rem > 0 && rem <= 2;
        });
    }, [activeAnimals, impoundStayDuration]);

    // Computed Metrics
    const computedMetrics = useMemo(() => {
        const needTreatment = activeAnimals.filter(a => a.facility_status === 1).length;
        const healthy = activeAnimals.filter(a => a.facility_status === 2).length;
        const nearingExpiry = nearingAnimals.length;
        const needsTransfer = overdueAnimals.length;
        const transferredCount = historyAnimals.filter(a => a.facility_type === 'barangay_facility' || a.facility_name?.toLowerCase().includes('barangay')).length;

        return {
            activeTotal: activeAnimals.length,
            needTreatment,
            healthy,
            nearingExpiry,
            needsTransfer,
            pastTotal: historyAnimals.length,
            transferredToBrgy: transferredCount,
        };
    }, [activeAnimals, historyAnimals, overdueAnimals, nearingAnimals]);

    // ── Open Detail Modal ──────────────────────────────────────────────────────
    const openDetail = async (animal: HoldingAnimal) => {
        try {
            const res = await api.get(`/holding/${animal.holding_id}`);
            setSelected(res.data);
            setUpdateForm({
                facility_status: res.data.facility_status,
                kennel_slot: res.data.kennel_slot || '',
                medical_notes: res.data.medical_notes || '',
                update_notes: '',
            });
            setUploadFiles([]);
            setTimelineFiles([]);
            setDetailTab('info');
        } catch {
            setSelected(animal);
            setUpdateForm({
                facility_status: animal.facility_status,
                kennel_slot: animal.kennel_slot || '',
                medical_notes: animal.medical_notes || '',
                update_notes: '',
            });
            setUploadFiles([]);
            setTimelineFiles([]);
            setDetailTab('info');
        }
    };

    // ── Update Handler ─────────────────────────────────────────────────────────
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
                    const uploadRes = await api.post(`/reports/${selected.report_id}/media`, fd, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    if (uploadRes.data?.media_id) {
                        uploadedMediaIds.push(uploadRes.data.media_id);
                    }
                }
                setUploadFiles([]);
            }

            // 2. Perform patching
            await api.patch(`/holding/${selected.holding_id}`, {
                facility_status: Number(updateForm.facility_status),
                kennel_slot: updateForm.kennel_slot || null,
                medical_notes: updateForm.medical_notes || null,
                update_notes: updateForm.update_notes || undefined,
                updated_by: currentUser?.user_id,
                media_ids: uploadedMediaIds,
            });
            await fetchAll();
            // Refresh selected record
            const res = await api.get(`/holding/${selected.holding_id}`);
            setSelected(res.data);
        } catch (e) {
            console.error('Error updating holding record:', e);
            alert('Failed to update record.');
        } finally {
            setIsUpdating(false);
        }
    };

    // ── Add Timeline Note ──────────────────────────────────────────────────────
    const handleAddTimeline = async () => {
        if (!selected || !timelineForm.title.trim()) return;
        setIsAddingTimeline(true);
        try {
            // 1. Upload attached media if any
            if (timelineFiles.length > 0) {
                for (const file of timelineFiles) {
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('is_evidence', 'true');
                    await api.post(`/reports/${selected.report_id}/media`, fd, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                }
                setTimelineFiles([]);
            }

            // 2. Post timeline entry
            await api.post(`/holding/${selected.holding_id}/timeline`, {
                event_type: timelineForm.event_type,
                title: timelineForm.title.trim(),
                notes: timelineForm.notes?.trim() || null,
                logged_by: currentUser?.user_id,
            });
            setTimelineForm({ event_type: 'observation', title: '', notes: '' });
            const res = await api.get(`/holding/${selected.holding_id}`);
            setSelected(res.data);
            fetchAll();
        } catch (e) {
            console.error('Error adding timeline entry:', e);
            alert('Failed to log observation.');
        } finally {
            setIsAddingTimeline(false);
        }
    };

    const metricCards = tabMode === 'active' ? [
        {
            label: 'Total Animals Held',
            value: computedMetrics.activeTotal,
            icon: PawPrint,
            color: 'bg-orange-50 text-orange-600',
            border: 'border-orange-100',
        },
        {
            label: 'Need Treatment',
            value: computedMetrics.needTreatment,
            icon: Pill,
            color: 'bg-red-50 text-red-600',
            border: 'border-red-100',
        },
        {
            label: 'Healthy / Monitored',
            value: computedMetrics.healthy,
            icon: CheckCircle2,
            color: 'bg-emerald-50 text-emerald-600',
            border: 'border-emerald-100',
        },
        {
            label: computedMetrics.needsTransfer > 0 ? 'Needs Transfer' : 'Nearing Expiry',
            value: computedMetrics.needsTransfer > 0 ? computedMetrics.needsTransfer : computedMetrics.nearingExpiry,
            icon: computedMetrics.needsTransfer > 0 ? AlertTriangle : Hourglass,
            color: computedMetrics.needsTransfer > 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600',
            border: computedMetrics.needsTransfer > 0 ? 'border-red-200 ring-1 ring-red-200' : 'border-amber-100',
        },
        {
            label: 'Past / Transferred History',
            value: computedMetrics.pastTotal,
            icon: ScrollText,
            color: 'bg-indigo-50 text-indigo-600',
            border: 'border-indigo-100',
        },
    ] : [
        {
            label: 'Total Past Records',
            value: computedMetrics.pastTotal,
            icon: ScrollText,
            color: 'bg-indigo-50 text-indigo-600',
            border: 'border-indigo-100',
        },
        {
            label: 'Transferred to Barangay',
            value: computedMetrics.transferredToBrgy,
            icon: Truck,
            color: 'bg-purple-50 text-purple-600',
            border: 'border-purple-100',
        },
        {
            label: 'Claimed by Owner',
            value: historyAnimals.filter(a => a.facility_status === 3).length,
            icon: PartyPopper,
            color: 'bg-blue-50 text-blue-600',
            border: 'border-blue-100',
        },
        {
            label: 'Other Discharges / Shelter',
            value: historyAnimals.filter(a => a.facility_status === 4 || a.facility_status === 5).length,
            icon: Tag,
            color: 'bg-gray-100 text-gray-600',
            border: 'border-gray-200',
        },
        {
            label: 'Active in Shelter Now',
            value: computedMetrics.activeTotal,
            icon: PawPrint,
            color: 'bg-orange-50 text-orange-600',
            border: 'border-orange-100',
        },
    ];

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">
                                Subdivision Holding Facility
                            </h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Temporary shelter monitoring for unclaimed & found neighborhood pets
                            </p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-36 md:pb-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-6">

                        {/* ── Facility Selector & Management Header ─────────── */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
                                    <PawPrint className="w-6 h-6" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-orange-600 bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">
                                            Active Facility Filter
                                        </span>
                                        {activeFacility && (
                                            <span className="text-[10px] font-bold text-gray-400">
                                                {activeFacility.facility_type || 'Temporary Holding Shelter'}
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-lg font-black text-gray-900 leading-snug">
                                        {activeFacility ? activeFacility.name : 'All Subdivision Shelters & Holding Units'}
                                    </h2>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <select
                                    value={selectedFacilityId}
                                    onChange={e => setSelectedFacilityId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                    className="px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:ring-2 focus:ring-orange-200 outline-none"
                                >
                                    <option value="all">All Subdivision Facilities</option>
                                    {facilities.map(f => (
                                        <option key={f.landmark_id} value={f.landmark_id}>{f.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* ── Active Facility Status Detail Card ───────────────── */}
                        {activeFacility && (
                            <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50/50 rounded-2xl border border-orange-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-orange-500 text-white flex items-center justify-center shadow-xs">
                                        <Building2 className="w-4 h-4" />
                                    </div>
                                    <div className="text-xs text-gray-700 flex flex-wrap items-center gap-x-4 gap-y-1">
                                        <span>Facility Caretaker: <strong className="text-gray-900">{activeFacility.contact_person || 'Subdivision Leader / Security'}</strong></span>
                                        {activeFacility.contact_number && (
                                            <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" /> Phone: <strong className="text-gray-900">{activeFacility.contact_number}</strong></span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-orange-200 shadow-xs">
                                    <div className="text-center">
                                        <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Occupied</p>
                                        <p className="text-base font-black text-orange-600">{activeOccupancy}</p>
                                    </div>
                                    <span className="text-gray-300 font-light text-lg">/</span>
                                    <div className="text-center">
                                        <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Capacity</p>
                                        <p className="text-base font-black text-gray-800">{activeFacility.capacity || '—'}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── No Facilities Warning Banner ───────────────────── */}
                        {facilities.length === 0 && !loading && (
                            <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle className="w-6 h-6 text-amber-600" />
                                    <div>
                                        <p className="text-xs font-black text-amber-900 uppercase tracking-wider">No Designated Holding Facility Found in Subdivision</p>
                                        <p className="text-xs text-amber-700 font-medium">Designate a landmark (e.g. Clubhouse Pet Pen, Guardhouse Temporary Unit) in Subdivision Settings so rescued pets can be placed here.</p>
                                    </div>
                                </div>
                                <Link
                                    to="/subd/settings"
                                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl whitespace-nowrap shadow-sm"
                                >
                                    Create Facility Pin
                                </Link>
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

                        {/* ── Overdue Stay Alert Banner ─────────────────────── */}
                        {overdueAnimals.length > 0 && tabMode === 'active' && (
                            <div className="bg-gradient-to-r from-red-500/10 via-amber-500/10 to-orange-500/5 rounded-3xl border-2 border-red-300 p-5 md:p-6 shadow-md animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-red-200/60">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-md shadow-red-500/30 animate-pulse shrink-0">
                                            <AlertTriangle className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="text-base font-black text-red-950 tracking-tight">
                                                    Temporary Stay Exceeded — Handover to Barangay Advised
                                                </h3>
                                                <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-black tracking-wider uppercase shadow-xs">
                                                    {overdueAnimals.length} Action Needed
                                                </span>
                                            </div>
                                            <p className="text-xs font-semibold text-red-800/90 mt-0.5">
                                                {overdueAnimals.length === 1 ? '1 animal has' : `${overdueAnimals.length} animals have`} reached or exceeded the <span className="font-extrabold underline decoration-red-400">{impoundStayDuration}-day temporary holding stay limit</span>. Rescued animals exceeding temporary subdivision holding should be transferred to Barangay shelter facilities for impoundment or official adoption listing.
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-[10px] font-mono font-bold text-red-700 bg-red-100/80 px-3 py-1.5 rounded-xl border border-red-200 self-start sm:self-auto shrink-0">
                                        Threshold: {impoundStayDuration} Days
                                    </div>
                                </div>

                                {/* Mini Cards for Overdue Animals */}
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                                    {overdueAnimals.map((animal) => {
                                        const days = daysSince(animal.intake_date);
                                        const overDays = days - impoundStayDuration;
                                        const thumbImg = getAnimalPhoto(animal);

                                        return (
                                            <div
                                                key={animal.holding_id}
                                                className="bg-white rounded-2xl border border-red-200 p-3.5 shadow-xs flex flex-col justify-between hover:border-red-400 hover:shadow-md transition-all gap-3"
                                            >
                                                <div className="flex items-start gap-3">
                                                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0 border border-gray-200 relative">
                                                        {thumbImg ? (
                                                            <img src={thumbImg.startsWith('http') ? thumbImg : `${API_BASE_URL}${thumbImg}`} alt={animal.animal_name || 'Animal'} className="w-full h-full object-cover" />
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

                                                <div className="pt-1 border-t border-gray-100 flex items-center justify-between gap-2">
                                                    <span className="text-[10px] text-amber-800 font-bold">
                                                        Exceeded stay limit ({days}/{impoundStayDuration}d)
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => openDetail(animal)}
                                                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-black rounded-lg transition-all shadow-xs cursor-pointer"
                                                    >
                                                        View Record
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ── Tabs & View Switcher ────────────────────────────── */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-200 shadow-xs">
                            <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl">
                                <button
                                    type="button"
                                    onClick={() => setTabMode('active')}
                                    className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                        tabMode === 'active'
                                            ? 'bg-white text-orange-600 shadow-sm border border-orange-100'
                                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                                    }`}
                                >
                                    <PawPrint className="w-3.5 h-3.5" />
                                    <span>Currently In Shelter ({activeAnimals.length})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTabMode('history')}
                                    className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                        tabMode === 'history'
                                            ? 'bg-white text-indigo-600 shadow-sm border border-indigo-100'
                                            : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
                                    }`}
                                >
                                    <ScrollText className="w-3.5 h-3.5" />
                                    <span>Past Facility History ({historyAnimals.length})</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                                {tabMode === 'active' ? (
                                    <span className="flex items-center gap-1.5 text-orange-700 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" /> Showing active pets currently residing in subdivision shelter
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                                        <ScrollText className="w-3.5 h-3.5" /> Showing pets previously held here (Transferred to Barangay / Claimed)
                                    </span>
                                )}
                            </div>
                        </div>

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
                                    placeholder="Search by breed, name, landmark, report ID..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 outline-none"
                                />
                            </div>

                            <select
                                value={statusFilter}
                                onChange={e => setStatusFilter(Number(e.target.value))}
                                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-orange-200 outline-none"
                            >
                                <option value={0}>All Health Statuses</option>
                                {FACILITY_STATUSES.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>

                            {tabMode === 'active' && (
                                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={showResolved}
                                        onChange={e => setShowResolved(e.target.checked)}
                                        className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                                    />
                                    Show Discharged / Claimed
                                </label>
                            )}

                            <button
                                onClick={fetchAll}
                                className="ml-auto p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all cursor-pointer"
                                title="Refresh data"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        </div>

                        {/* ── Animals Grid (Modern Barangay-Aligned Card Design) ── */}
                        {loading ? (
                            <div className="p-12 text-center text-gray-400 font-bold">
                                Loading holding facility records...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-3">
                                <div className="flex justify-center text-gray-300">{tabMode === 'active' ? <PawPrint className="w-10 h-10" /> : <ScrollText className="w-10 h-10" />}</div>
                                <p className="text-base font-black text-gray-700">
                                    {tabMode === 'active'
                                        ? 'No animals currently held in the subdivision shelter'
                                        : 'No past or transferred animals found in history'}
                                </p>
                                <p className="text-xs text-gray-400">
                                    {tabMode === 'active'
                                        ? 'Animals admitted to the subdivision shelter or secured here will appear here.'
                                        : 'Animals transferred to Barangay facilities or resolved will be archived in this history view.'}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {filtered.map((animal) => {
                                    const statusMeta = getStatusMeta(animal.facility_status);
                                    const days = daysSince(animal.intake_date);
                                    const remaining = daysRemaining(animal.intake_date, impoundStayDuration);
                                    const isResolved = RESOLVED_IDS.has(animal.facility_status);
                                    const isTransferredToBrgy = animal.facility_type === 'barangay_facility' || (animal.facility_name && animal.facility_name.toLowerCase().includes('barangay'));
                                    const isHistoryItem = !isCurrentlyInSubd(animal);
                                    const isOverdue = !isResolved && !isTransferredToBrgy && days >= impoundStayDuration;
                                    const isNearExpiry = !isResolved && !isOverdue && remaining <= 2;
                                    const photo = getAnimalPhoto(animal);

                                    return (
                                        <div
                                            key={animal.holding_id}
                                            onClick={() => openDetail(animal)}
                                            className={`bg-white rounded-3xl border shadow-sm hover:shadow-xl hover:border-orange-200 transition-all duration-300 flex flex-col overflow-hidden cursor-pointer group ${
                                                isOverdue
                                                    ? 'border-red-300 ring-2 ring-red-200/60 shadow-md'
                                                    : isResolved
                                                        ? 'opacity-75 bg-gray-50/50 border-gray-150'
                                                        : isHistoryItem
                                                            ? 'border-indigo-100/80'
                                                            : 'border-gray-100'
                                            }`}
                                        >
                                            {/* Card Top / Prominent Image Hero */}
                                            <div className="relative w-full h-52 bg-slate-100 overflow-hidden">
                                                {photo ? (
                                                    <>
                                                        <img
                                                            src={photo.startsWith('http') ? photo : `${API_BASE_URL}${photo}`}
                                                            alt={animal.animal_name || 'Animal in Facility'}
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/30 pointer-events-none" />
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-br from-orange-50 via-slate-50 to-amber-50 flex flex-col items-center justify-center relative p-4 text-center">
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
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/90 backdrop-blur-md text-orange-700 text-[11px] font-black rounded-full shadow-sm border border-white/50">
                                                            <MapPin className="w-3 h-3" /> {animal.kennel_slot}
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-black/40 backdrop-blur-md text-white/90 text-[10px] font-semibold rounded-full border border-white/20">
                                                            <MapPin className="w-3 h-3" /> Not Assigned
                                                        </span>
                                                    )}

                                                    {/* Facility Status Badge */}
                                                    {isTransferredToBrgy ? (
                                                        <span className="px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase backdrop-blur-md shadow-sm border bg-indigo-50 text-indigo-700 border-indigo-200">
                                                            In Brgy Holding
                                                        </span>
                                                    ) : (
                                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase backdrop-blur-md shadow-sm border ${
                                                            photo
                                                                ? 'bg-white/95 text-gray-900 border-white/60'
                                                                : statusMeta.color
                                                        }`}>
                                                            {statusMeta.name}
                                                        </span>
                                                    )}
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
                                                                    {animal.report_category || 'Temporary Holding'}
                                                                </span>
                                                            </div>
                                                            <h3 className="font-black text-white text-lg leading-tight truncate drop-shadow-md group-hover:text-orange-200 transition-colors">
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
                                                            <p className={`font-black text-xs mt-0.5 ${days >= impoundStayDuration ? 'text-red-600' : 'text-gray-800'}`}>
                                                                {animal.total_duration_display || `${days} day(s)`}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Facility Stay Breakdown Pills */}
                                                <div className="flex items-center justify-between gap-1.5 p-2 bg-orange-50/50 rounded-xl border border-orange-100/70 text-[10px]">
                                                    <span className="font-bold text-orange-900 truncate inline-flex items-center gap-1">
                                                        <Home className="w-2.5 h-2.5" /> Subd: <strong className="text-orange-700">{animal.subd_duration_display || `${days}d`}</strong>
                                                    </span>
                                                    <span className="text-gray-300">|</span>
                                                    <span className="font-bold text-orange-900 truncate inline-flex items-center gap-1">
                                                        <Building2 className="w-2.5 h-2.5" /> Brgy: <strong className="text-orange-700">{animal.brgy_duration_display || '0 days'}</strong>
                                                    </span>
                                                </div>

                                                {/* Impound / Transfer Deadline */}
                                                <div className="flex items-center justify-between p-2.5 bg-gray-50/50 rounded-xl border border-gray-100/80">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Stay Limit</span>
                                                    <div>
                                                        {isResolved ? (
                                                            <span className="text-xs text-gray-400 font-bold">Completed</span>
                                                        ) : isTransferredToBrgy ? (
                                                            <span className="text-xs text-indigo-700 font-bold">In Barangay Shelter</span>
                                                        ) : isOverdue ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 text-[11px] font-black rounded-lg border border-red-200 animate-pulse shadow-xs">
                                                                <AlertTriangle className="w-2.5 h-2.5" /> Needs Transfer ({days}/{impoundStayDuration}d)
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
                                                <span className="text-[11px] text-gray-400 font-semibold group-hover:text-orange-600 transition-colors">
                                                    {isOverdue ? 'Transfer recommended' : 'Click to view notes & logs'}
                                                </span>
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        openDetail(animal);
                                                    }}
                                                    className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-black text-white bg-orange-600 rounded-xl hover:bg-orange-700 shadow-md hover:shadow-lg transition-all uppercase tracking-wider ml-auto cursor-pointer"
                                                >
                                                    <Eye className="w-3.5 h-3.5" />
                                                    Manage
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                    </div>
                </main>
                <SubdBottomNav />
            </div>

            {/* ─── Detail / Manage Modal (Unified Barangay-Aligned Modal) ────────── */}
            {selected && (() => {
                const isSelectedInHistory = !isCurrentlyInSubd(selected);
                const isSelectedTransferred = selected.facility_type === 'barangay_facility' || (selected.facility_name && selected.facility_name.toLowerCase().includes('barangay'));

                return (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[3000] p-4">
                        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-6 border-b border-gray-100">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 bg-orange-50 rounded-xl flex items-center justify-center">
                                        {animalIcon(selected.animal_type)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-black text-gray-900">
                                                {selected.animal_name || `${selected.animal_type || 'Animal'} #${selected.holding_id}`}
                                            </h2>
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                                isSelectedTransferred ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : getStatusMeta(selected.facility_status).color
                                            }`}>
                                                {isSelectedTransferred ? 'In Brgy Holding' : getStatusMeta(selected.facility_status).name}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400">Report #{selected.report_id.toString().padStart(4, '0')} · {selected.report_landmark || 'Subdivision Shelter'}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setSelected(null)}
                                    className="w-9 h-9 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer"
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
                                        className={`px-4 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 -mb-px cursor-pointer ${detailTab === tab
                                                ? 'border-orange-500 text-orange-600'
                                                : 'border-transparent text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        {tab === 'info'
                                            ? <span className="inline-flex items-center gap-1"><ClipboardList className="w-3.5 h-3.5" /> Animal Info & Update</span>
                                            : <span className="inline-flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> Timeline ({selected.timeline?.length || 0})</span>}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">

                                {/* ── Info Tab ──────────────────────────────────── */}
                                {detailTab === 'info' && (
                                    <div className="space-y-5">

                                        {/* History Banner Notice if Transferred */}
                                        {isSelectedInHistory && (
                                            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-3">
                                                <Info className="w-5 h-5 text-indigo-600 shrink-0" />
                                                <div className="text-xs text-indigo-900">
                                                    <p className="font-black uppercase tracking-wider">Past Facility Record (Read-Only)</p>
                                                    <p className="text-indigo-700 font-medium">
                                                        This animal is currently housed at <strong>{selected.facility_name || 'Barangay Facility'}</strong>. Active daily care and disposition are managed by the receiving shelter.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

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
                                        <div className="bg-gradient-to-br from-orange-50/80 via-white to-amber-50/80 p-4 rounded-2xl border border-orange-100 shadow-sm">
                                            <p className="text-[10px] font-black text-orange-900 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                                                <Timer className="w-3.5 h-3.5" /> Facility Stay & Custody Duration
                                            </p>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-orange-100/60 shadow-2xs">
                                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Home className="w-2.5 h-2.5" /> Subdivision Stay</p>
                                                    <p className="text-sm font-black text-orange-700 mt-1">{selected.subd_duration_display || `${daysSince(selected.intake_date)}d`}</p>
                                                </div>
                                                <div className="bg-white/80 backdrop-blur-xs p-3 rounded-xl border border-orange-100/60 shadow-2xs">
                                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1"><Building2 className="w-2.5 h-2.5" /> Barangay Stay</p>
                                                    <p className="text-sm font-black text-orange-700 mt-1">{selected.brgy_duration_display || '0 days'}</p>
                                                </div>
                                                <div className="bg-orange-600 text-white p-3 rounded-xl shadow-xs">
                                                    <p className="text-[9px] font-bold text-orange-200 uppercase tracking-wider">Total Custody</p>
                                                    <p className="text-sm font-black text-white mt-1">{selected.total_duration_display || `${daysSince(selected.intake_date)}d`}</p>
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
                                                { label: 'Intake Staff / Leader', value: selected.intake_staff_name || 'Leader' },
                                            ].map(row => (
                                                <div key={row.label} className={`bg-gray-50 rounded-xl p-3 ${row.label.includes('Staff') ? 'col-span-2' : ''}`}>
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
                                                                className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer group hover:border-orange-400 hover:shadow-md transition-all duration-200"
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

                                        {/* Overdue Stay Limit Notice in Detail Modal */}
                                        {!isSelectedInHistory && !RESOLVED_IDS.has(selected.facility_status) && daysSince(selected.intake_date) >= impoundStayDuration && (
                                            <div className="bg-red-50/90 border-2 border-red-300 rounded-2xl p-4 shadow-xs space-y-2 animate-in fade-in duration-200">
                                                <div className="flex items-start gap-3">
                                                    <div className="w-9 h-9 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 shadow-sm animate-pulse">
                                                        <AlertTriangle className="w-4 h-4" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-sm font-black text-red-950">Stay Limit Reached: Transfer Recommended</h4>
                                                            <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[9px] font-black uppercase tracking-wider">
                                                                {daysSince(selected.intake_date)} Days Held
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-red-800 mt-1 leading-relaxed">
                                                            This animal has reached or exceeded the <strong>{impoundStayDuration}-day temporary holding stay limit</strong>.
                                                            Coordinate with Barangay responders to transfer this animal to the Barangay Holding Pen for official impoundment or adoption promotion.
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── Update Form (Inline) ──────────────── */}
                                        {!isSelectedInHistory && !RESOLVED_IDS.has(selected.facility_status) && (
                                            <div className="border border-gray-100 rounded-2xl p-5 space-y-4 bg-gray-50/50">
                                                <h3 className="text-sm font-black text-gray-800 uppercase tracking-wider">Update Animal Record</h3>

                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Facility Status</label>
                                                    <select
                                                        value={updateForm.facility_status}
                                                        onChange={e => setUpdateForm(f => ({ ...f, facility_status: Number(e.target.value) }))}
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:ring-2 focus:ring-orange-200 outline-none"
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
                                                        placeholder="e.g. Pen A-1, Bay 2..."
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 outline-none"
                                                        value={updateForm.kennel_slot}
                                                        onChange={e => setUpdateForm(f => ({ ...f, kennel_slot: e.target.value }))}
                                                    />
                                                </div>

                                                {/* Holding Intake & Custody Timeline (Read-Only) */}
                                                <div className="p-3.5 bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Holding Intake Started</span>
                                                            <span className="text-[9px] font-mono font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-sm">
                                                                {formatDateTime(selected.intake_date)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 font-medium mt-0.5">
                                                            Stay limit threshold: <strong className="text-gray-800">{impoundStayDuration} days</strong>
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-right">
                                                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Time in Custody</p>
                                                            <p className="text-sm font-black text-orange-700 leading-none mt-0.5">
                                                                {selected.subd_duration_display || `${daysSince(selected.intake_date)} days`}
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
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 outline-none resize-none"
                                                        value={updateForm.medical_notes}
                                                        onChange={e => setUpdateForm(f => ({ ...f, medical_notes: e.target.value }))}
                                                    />
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Update Notes (for timeline)</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Optional note for this update..."
                                                        className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 outline-none"
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
                                                            className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:bg-orange-50 file:text-orange-600 hover:file:bg-orange-100 cursor-pointer"
                                                        />
                                                        {uploadFiles.length > 0 && (
                                                            <div className="space-y-1.5 mt-1 border-t border-gray-100 pt-2">
                                                                <div className="flex items-center justify-between text-[10px] font-black uppercase text-gray-400">
                                                                    <span>Selected files ({uploadFiles.length})</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setUploadFiles([])}
                                                                        className="text-red-500 hover:text-red-600 font-bold cursor-pointer"
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
                                                                                className="text-red-500 hover:text-red-700 font-extrabold shrink-0 ml-1 cursor-pointer"
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
                                                    className="w-full py-2.5 bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white text-sm font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-orange-600/20"
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

                                        {/* Quick Link to Original Report */}
                                        <div className="pt-2">
                                            <Link
                                                to={`/subd/reports/${selected.report_id}`}
                                                className="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-xs transition-all text-center flex items-center justify-center gap-1.5"
                                            >
                                                <ClipboardList className="w-3.5 h-3.5" />
                                                <span>Open Original Report #{selected.report_id}</span>
                                            </Link>
                                        </div>

                                    </div>
                                )}

                                {/* ── Timeline Tab ──────────────────────────────── */}
                                {detailTab === 'timeline' && (
                                    <div className="space-y-5">

                                        {/* Add manual entry */}
                                        {!isSelectedInHistory && !RESOLVED_IDS.has(selected.facility_status) && (
                                            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 space-y-3">
                                                <h3 className="text-xs font-black text-gray-700 uppercase tracking-widest">Add Timeline Entry</h3>
                                                <div className="flex gap-2">
                                                    <select
                                                        value={timelineForm.event_type}
                                                        onChange={e => setTimelineForm(f => ({ ...f, event_type: e.target.value }))}
                                                        className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs text-gray-700 focus:ring-2 focus:ring-orange-200 outline-none"
                                                    >
                                                        <option value="observation">Observation</option>
                                                        <option value="medical">Medical</option>
                                                        <option value="treatment">Treatment</option>
                                                        <option value="status_change">Status Change</option>
                                                    </select>
                                                    <input
                                                        type="text"
                                                        placeholder="Title / summary..."
                                                        className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-orange-200 outline-none"
                                                        value={timelineForm.title}
                                                        onChange={e => setTimelineForm(f => ({ ...f, title: e.target.value }))}
                                                    />
                                                </div>
                                                <textarea
                                                    rows={2}
                                                    placeholder="Detailed notes..."
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-orange-200 outline-none resize-none"
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
                                                            className="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:bg-orange-50 file:text-orange-600 hover:file:bg-orange-100 cursor-pointer"
                                                        />
                                                        {timelineFiles.length > 0 && (
                                                            <div className="space-y-1.5 border-t border-gray-100 pt-2">
                                                                <div className="flex items-center justify-between text-[10px] font-black uppercase text-gray-400">
                                                                    <span>{timelineFiles.length} file{timelineFiles.length !== 1 ? 's' : ''} selected</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setTimelineFiles([])}
                                                                        className="text-red-500 hover:text-red-600 font-bold cursor-pointer"
                                                                    >Clear all</button>
                                                                </div>
                                                                <div className="flex flex-col gap-1 max-h-20 overflow-y-auto custom-scrollbar">
                                                                    {timelineFiles.map((file, idx) => (
                                                                        <div key={idx} className="flex items-center justify-between bg-gray-50 px-2 py-1 rounded border border-gray-100 text-[10px] text-gray-600">
                                                                            <span className="truncate flex-1 pr-1 inline-flex items-center gap-1"><Paperclip className="w-2.5 h-2.5 shrink-0" /> {file.name}</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setTimelineFiles(prev => prev.filter((_, i) => i !== idx))}
                                                                                className="text-red-500 font-extrabold shrink-0 ml-1 cursor-pointer"
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
                                                    className="w-full py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-orange-600/20"
                                                >
                                                    {isAddingTimeline ? (
                                                        <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading & Saving...</>
                                                    ) : '+ Add Entry'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Timeline list */}
                                        {selected.timeline?.length === 0 ? (
                                            <div className="text-center py-10 text-gray-400 text-sm">No timeline entries yet.</div>
                                        ) : (
                                            <div className="relative">
                                                <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-100" />
                                                <div className="space-y-4">
                                                    {[...(selected.timeline || [])].reverse().map((log) => {
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
                );
            })()}

            {/* ─── Lightbox / Media Viewer Modal ───────────────────────────────── */}
            {lightboxMedia && (
                <div
                    className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-[3500] p-4 select-none"
                    onClick={() => setLightboxMedia(null)}
                >
                    {/* Close Button */}
                    <button
                        onClick={() => setLightboxMedia(null)}
                        className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors z-[3510] cursor-pointer"
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
                                                className="flex-1 py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-orange-100 text-center"
                                            >
                                                Open Document
                                            </a>
                                            <button
                                                onClick={() => setLightboxMedia(null)}
                                                className="flex-1 py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
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
                                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-2xl transition-colors z-[3510] cursor-pointer"
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
                                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-2xl transition-colors z-[3510] cursor-pointer"
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
        </div>
    );
};

export default SubdHoldingFacility;
