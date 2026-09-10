import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { useNavigate, Link } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';

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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IMPOUND_DAYS = 7;

const FACILITY_STATUSES = [
    { id: 1, name: 'Need Treatment', color: 'bg-red-50 text-red-600 border-red-200' },
    { id: 2, name: 'Healthy', color: 'bg-green-50 text-green-600 border-green-200' },
    { id: 3, name: 'Claimed by Owner', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    { id: 4, name: 'Deceased', color: 'bg-gray-100 text-gray-500 border-gray-200' },
    { id: 5, name: 'Transferred to Shelter', color: 'bg-purple-50 text-purple-600 border-purple-200' },
];

const RESOLVED_IDS = new Set([3, 4, 5]);

const EVENT_TYPE_META: Record<string, { icon: ReactNode; color: string }> = {
    intake: { icon: <span>🐾</span>, color: 'bg-emerald-100 text-emerald-700' },
    transfer: { icon: <span>🚚</span>, color: 'bg-indigo-100 text-indigo-700' },
    relocation: { icon: <span>📍</span>, color: 'bg-indigo-100 text-indigo-700' },
    status_change: { icon: <span>🔄</span>, color: 'bg-amber-100 text-amber-700' },
    medical: { icon: <span>💊</span>, color: 'bg-purple-100 text-purple-600' },
    treatment: { icon: <span>🩺</span>, color: 'bg-pink-100 text-pink-600' },
    observation: { icon: <span>📋</span>, color: 'bg-gray-100 text-gray-600' },
    outcome: { icon: <span>✅</span>, color: 'bg-green-100 text-green-700' },
};

function daysSince(dateStr: string | null): number {
    if (!dateStr) return 0;
    const ms = Date.now() - new Date(dateStr).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function daysRemaining(dateStr: string | null): number {
    const days = daysSince(dateStr);
    return Math.max(0, IMPOUND_DAYS - days);
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

function animalIcon(type: string | null): string {
    if (type?.toLowerCase().includes('cat')) return '🐱';
    if (type?.toLowerCase().includes('dog')) return '🐶';
    return '🐾';
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

    // Selected animal detail modal
    const [selected, setSelected] = useState<HoldingAnimal | null>(null);
    const [detailTab, setDetailTab] = useState<'info' | 'timeline'>('info');

    // Update modal state
    const [isUpdating, setIsUpdating] = useState(false);
    const [updateForm, setUpdateForm] = useState({
        facility_status: 1,
        kennel_slot: '',
        medical_notes: '',
        update_notes: '',
    });

    // Add timeline entry
    const [timelineForm, setTimelineForm] = useState({ event_type: 'observation', title: '', notes: '' });
    const [isAddingTimeline, setIsAddingTimeline] = useState(false);

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
                const url = `http://localhost:8000/landmarks?subdivision_id=${targetSubdId}&is_holding_facility=true`;
                const res = await axios.get(url);
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

            const res = await axios.get('http://localhost:8000/holding/', { params });
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

    // Computed Metrics
    const computedMetrics = useMemo(() => {
        const needTreatment = activeAnimals.filter(a => a.facility_status === 1).length;
        const healthy = activeAnimals.filter(a => a.facility_status === 2).length;
        const nearingExpiry = activeAnimals.filter(a => daysRemaining(a.intake_date) <= 2).length;
        const transferredCount = historyAnimals.filter(a => a.facility_type === 'barangay_facility' || a.facility_name?.toLowerCase().includes('barangay')).length;

        return {
            activeTotal: activeAnimals.length,
            needTreatment,
            healthy,
            nearingExpiry,
            pastTotal: historyAnimals.length,
            transferredToBrgy: transferredCount,
        };
    }, [activeAnimals, historyAnimals]);

    // ── Update Handler ─────────────────────────────────────────────────────────
    const handleUpdate = async () => {
        if (!selected) return;
        try {
            const payload: any = {
                facility_status: Number(updateForm.facility_status),
                kennel_slot: updateForm.kennel_slot || null,
                medical_notes: updateForm.medical_notes || null,
                updated_by: currentUser?.user_id,
                update_notes: updateForm.update_notes || undefined,
            };

            await axios.patch(`http://localhost:8000/holding/${selected.holding_id}`, payload);
            setIsUpdating(false);
            fetchAll();
            // Refresh selected record
            const res = await axios.get(`http://localhost:8000/holding/${selected.holding_id}`);
            setSelected(res.data);
        } catch (e) {
            console.error('Error updating holding record:', e);
            alert('Failed to update record.');
        }
    };

    // ── Add Timeline Note ──────────────────────────────────────────────────────
    const handleAddTimeline = async () => {
        if (!selected || !timelineForm.title.trim()) return;
        try {
            await axios.post(`http://localhost:8000/holding/${selected.holding_id}/timeline`, {
                event_type: timelineForm.event_type,
                title: timelineForm.title.trim(),
                notes: timelineForm.notes?.trim() || null,
                logged_by: currentUser?.user_id,
            });
            setTimelineForm({ event_type: 'observation', title: '', notes: '' });
            setIsAddingTimeline(false);
            const res = await axios.get(`http://localhost:8000/holding/${selected.holding_id}`);
            setSelected(res.data);
            fetchAll();
        } catch (e) {
            console.error('Error adding timeline entry:', e);
            alert('Failed to log observation.');
        }
    };

    const metricCards = tabMode === 'active' ? [
        {
            label: 'Total Animals Held',
            value: computedMetrics.activeTotal,
            icon: '🐾',
            color: 'bg-orange-50 text-orange-600',
            border: 'border-orange-100',
        },
        {
            label: 'Need Treatment',
            value: computedMetrics.needTreatment,
            icon: '💊',
            color: 'bg-red-50 text-red-600',
            border: 'border-red-100',
        },
        {
            label: 'Healthy / Monitored',
            value: computedMetrics.healthy,
            icon: '✅',
            color: 'bg-emerald-50 text-emerald-600',
            border: 'border-emerald-100',
        },
        {
            label: 'Nearing Expiry (≤2d)',
            value: computedMetrics.nearingExpiry,
            icon: '⚠️',
            color: 'bg-amber-50 text-amber-600',
            border: 'border-amber-100',
        },
        {
            label: 'Past / Transferred History',
            value: computedMetrics.pastTotal,
            icon: '📜',
            color: 'bg-indigo-50 text-indigo-600',
            border: 'border-indigo-100',
        },
    ] : [
        {
            label: 'Total Past Records',
            value: computedMetrics.pastTotal,
            icon: '📜',
            color: 'bg-indigo-50 text-indigo-600',
            border: 'border-indigo-100',
        },
        {
            label: 'Transferred to Barangay',
            value: computedMetrics.transferredToBrgy,
            icon: '🚚',
            color: 'bg-purple-50 text-purple-600',
            border: 'border-purple-100',
        },
        {
            label: 'Claimed by Owner',
            value: historyAnimals.filter(a => a.facility_status === 3).length,
            icon: '🎉',
            color: 'bg-blue-50 text-blue-600',
            border: 'border-blue-100',
        },
        {
            label: 'Other Discharges / Shelter',
            value: historyAnimals.filter(a => a.facility_status === 4 || a.facility_status === 5).length,
            icon: '🏷️',
            color: 'bg-gray-100 text-gray-600',
            border: 'border-gray-200',
        },
        {
            label: 'Active in Shelter Now',
            value: computedMetrics.activeTotal,
            icon: '🐾',
            color: 'bg-orange-50 text-orange-600',
            border: 'border-orange-100',
        },
    ];

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            <div className="flex-1 flex flex-col overflow-hidden">
                <SubdNavbar
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

                <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-6">

                        {/* ── Facility Selector & Management Header ─────────── */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-2xl bg-orange-500 text-white flex items-center justify-center text-2xl shadow-md shadow-orange-500/20">
                                    🐾
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

                            <div className="flex flex-wrap items-center gap-3">
                                {/* Facility Dropdown */}
                                <div className="relative min-w-[240px]">
                                    <select
                                        value={selectedFacilityId}
                                        onChange={(e) => setSelectedFacilityId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                        className="w-full appearance-none bg-gray-50 hover:bg-gray-100 border-2 border-orange-200 focus:border-orange-500 text-gray-900 text-xs font-black rounded-xl px-4 py-2.5 pr-8 transition-all cursor-pointer outline-none shadow-xs"
                                    >
                                        <option value="all">
                                            🏢 All Subdivision Facilities ({facilities.length})
                                        </option>
                                        {facilities.map((fac) => (
                                            <option key={fac.landmark_id} value={fac.landmark_id}>
                                                📍 {fac.name} {fac.capacity ? `(Cap: ${fac.capacity})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">
                                        ▼
                                    </span>
                                </div>

                                <Link
                                    to="/subd/settings"
                                    className="px-4 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 shadow-xs"
                                >
                                    <span>⚙️</span>
                                    <span>Manage Facilities</span>
                                </Link>
                            </div>
                        </div>

                        {/* ── Active Facility Status Card (if specific facility selected) ── */}
                        {activeFacility && (
                            <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent rounded-2xl border border-orange-200 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="text-xs font-black text-orange-900 uppercase tracking-wide">
                                        {activeFacility.name} — Status & Occupancy
                                    </p>
                                    <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600 font-semibold">
                                        <span>📊 Type: <strong className="text-gray-900">{activeFacility.facility_type || 'Temporary Pen'}</strong></span>
                                        {activeFacility.contact_person && (
                                            <span>👤 Caretaker: <strong className="text-gray-900">{activeFacility.contact_person}</strong></span>
                                        )}
                                        {activeFacility.contact_number && (
                                            <span>📞 Phone: <strong className="text-gray-900">{activeFacility.contact_number}</strong></span>
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
                                    <span className="text-2xl">⚠️</span>
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
                                    <div className={`w-11 h-11 rounded-xl ${m.color} flex items-center justify-center text-lg shrink-0`}>
                                        {m.icon}
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none">{m.label}</p>
                                        <p className="text-2xl font-black text-gray-900 mt-1 leading-none">{m.value}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

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
                                    <span>🐾</span>
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
                                    <span>📜</span>
                                    <span>Past Facility History ({historyAnimals.length})</span>
                                </button>
                            </div>

                            <div className="flex items-center gap-2 text-xs font-bold text-gray-500">
                                {tabMode === 'active' ? (
                                    <span className="flex items-center gap-1.5 text-orange-700 bg-orange-50 px-3 py-1.5 rounded-xl border border-orange-100">
                                        <span>🟢</span> Showing active pets currently residing in subdivision shelter
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1.5 text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">
                                        <span>📜</span> Showing pets previously held here (Transferred to Barangay / Claimed)
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
                                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-200 outline-none"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
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
                                className="ml-auto p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
                                title="Refresh data"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                            </button>
                        </div>

                        {/* ── Animals Grid ──────────────────────────────────── */}
                        {loading ? (
                            <div className="p-12 text-center text-gray-400 font-bold">
                                Loading holding facility records...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-3">
                                <div className="text-4xl">{tabMode === 'active' ? '🐾' : '📜'}</div>
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
                                    const daysLeft = daysRemaining(animal.intake_date);
                                    const isResolved = RESOLVED_IDS.has(animal.facility_status);
                                    const isTransferredToBrgy = animal.facility_type === 'barangay_facility' || (animal.facility_name && animal.facility_name.toLowerCase().includes('barangay'));
                                    const isHistoryItem = !isCurrentlyInSubd(animal);
                                    const photo = getAnimalPhoto(animal);

                                    return (
                                        <div
                                            key={animal.holding_id}
                                            className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all flex flex-col overflow-hidden ${
                                                isHistoryItem ? 'border-indigo-100/80' : 'border-gray-100'
                                            }`}
                                        >
                                            {/* Photo Header */}
                                            <div className="h-44 bg-gray-100 relative overflow-hidden flex items-center justify-center">
                                                {photo ? (
                                                    <img
                                                        src={photo.startsWith('http') ? photo : `http://localhost:8000${photo}`}
                                                        alt={animal.animal_name || animal.breed || 'Held animal'}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            (e.target as HTMLElement).style.display = 'none';
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="text-5xl opacity-40">
                                                        🐾
                                                    </div>
                                                )}

                                                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-xs text-white px-2.5 py-1 rounded-lg text-xs font-black">
                                                    <span>{animalIcon(animal.animal_type)}</span>
                                                    <span>#{animal.report_id}</span>
                                                </div>

                                                <div className="absolute top-3 right-3 flex items-center gap-1">
                                                    {isTransferredToBrgy ? (
                                                        <span className="px-2.5 py-1 rounded-lg text-xs font-black border border-indigo-200 bg-indigo-50 text-indigo-700 shadow-xs">
                                                            🚚 In Brgy Holding
                                                        </span>
                                                    ) : (
                                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${statusMeta.color} bg-white shadow-xs`}>
                                                            {statusMeta.name}
                                                        </span>
                                                    )}
                                                </div>

                                                {animal.kennel_slot && (
                                                    <div className="absolute bottom-3 left-3 bg-orange-600 text-white px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider shadow-xs">
                                                        Cage: {animal.kennel_slot}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Info Body */}
                                            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                                                <div>
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="font-black text-gray-900 text-base">
                                                            {animal.breed || animal.animal_type || 'Unspecified Stray'}
                                                        </h3>
                                                        <span className="text-xs font-bold text-gray-400">
                                                            {animal.color || 'Mixed Color'}
                                                        </span>
                                                    </div>

                                                    <p className="text-xs text-gray-500 font-medium mt-1 flex items-center gap-1.5">
                                                        <span>{isTransferredToBrgy ? '🏢' : '📍'}</span>
                                                        <span className={`truncate ${isTransferredToBrgy ? 'text-indigo-700 font-bold' : ''}`}>
                                                            {animal.facility_name || animal.report_landmark || 'Subdivision Shelter'}
                                                        </span>
                                                    </p>

                                                    {animal.medical_notes && (
                                                        <p className="text-xs text-gray-600 bg-gray-50 p-2.5 rounded-xl mt-3 line-clamp-2 italic">
                                                            "{animal.medical_notes}"
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Bottom Metadata & Button */}
                                                <div className="space-y-2.5 pt-3 border-t border-gray-100">
                                                    {/* Stay Breakdown Pill */}
                                                    <div className="flex items-center justify-between gap-1 p-2 bg-orange-50/50 rounded-xl border border-orange-100/70 text-[10px]">
                                                        <span className="font-bold text-orange-900 truncate">
                                                            🏡 Subd: <strong className="text-orange-700">{animal.subd_duration_display || `${daysSince(animal.intake_date)}d`}</strong>
                                                        </span>
                                                        <span className="text-gray-300">|</span>
                                                        <span className="font-bold text-orange-900 truncate">
                                                            🏢 Brgy: <strong className="text-orange-700">{animal.brgy_duration_display || '0 days'}</strong>
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                                                        <span>Admitted: {formatDate(animal.intake_date)}</span>
                                                        {!isResolved && !isTransferredToBrgy && (
                                                            <span className={daysLeft <= 2 ? 'text-amber-600 font-extrabold' : 'text-gray-500'}>
                                                                ⏳ {daysLeft}d left
                                                            </span>
                                                        )}
                                                        {isTransferredToBrgy && (
                                                            <span className="text-indigo-600 font-extrabold">
                                                                Transferred
                                                            </span>
                                                        )}
                                                    </div>

                                                    <button
                                                        onClick={() => {
                                                            setSelected(animal);
                                                            setDetailTab('info');
                                                        }}
                                                        className={`w-full py-2.5 font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 ${
                                                            isHistoryItem
                                                                ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                                                                : 'bg-orange-50 hover:bg-orange-100 text-orange-700'
                                                        }`}
                                                    >
                                                        <span>{isHistoryItem ? '📜' : '📋'}</span>
                                                        <span>{isHistoryItem ? 'View Past History & Custody Logs' : 'View Details & Log Care'}</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                    </div>
                </main>
            </div>

            {/* ── DETAIL & CARE MODAL ──────────────────────────────────────── */}
            {selected && (() => {
                const isSelectedInHistory = !isCurrentlyInSubd(selected);
                const isSelectedTransferred = selected.facility_type === 'barangay_facility' || (selected.facility_name && selected.facility_name.toLowerCase().includes('barangay'));

                return (
                    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                            {/* Header */}
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-orange-500/10 via-amber-500/5 to-transparent">
                                <div className="flex items-center gap-3">
                                    <span className="text-3xl">{animalIcon(selected.animal_type)}</span>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-lg font-black text-gray-900">
                                                {selected.breed || selected.animal_type} (Report #{selected.report_id})
                                            </h2>
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                                isSelectedTransferred ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : getStatusMeta(selected.facility_status).color
                                            }`}>
                                                {isSelectedTransferred ? 'Transferred to Brgy' : getStatusMeta(selected.facility_status).name}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500 font-medium">
                                            Current Facility: <strong className="text-gray-800">{selected.facility_name || 'Subdivision Holding Pen'}</strong>
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setSelected(null)}
                                    className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 font-bold transition-all"
                                >
                                    ✕
                                </button>
                            </div>

                            {/* History Banner Notice if Transferred */}
                            {isSelectedInHistory && (
                                <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-3 flex items-center gap-3">
                                    <span className="text-xl">ℹ️</span>
                                    <div className="text-xs text-indigo-900">
                                        <p className="font-black uppercase tracking-wider">Past Facility Record (Read-Only)</p>
                                        <p className="text-indigo-700 font-medium">
                                            This animal is currently housed at <strong>{selected.facility_name || 'Barangay Facility'}</strong>. Active daily updates are logged by the receiving facility.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Tab Switcher */}
                            <div className="flex border-b border-gray-100 px-6 gap-6 text-xs font-black">
                                <button
                                    onClick={() => setDetailTab('info')}
                                    className={`py-3 border-b-2 transition-all ${detailTab === 'info' ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                                >
                                    Animal Profile & Medical
                                </button>
                                <button
                                    onClick={() => setDetailTab('timeline')}
                                    className={`py-3 border-b-2 transition-all ${detailTab === 'timeline' ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                                >
                                    Custody & Timeline ({selected.timeline?.length || 0})
                                </button>
                            </div>

                            {/* Content Body */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
                                {detailTab === 'info' ? (
                                    <div className="space-y-5">
                                        {/* Stay Duration Highlight Banner */}
                                        <div className="bg-gradient-to-br from-orange-50/80 via-amber-50/40 to-white p-4 rounded-2xl border border-orange-100 shadow-sm">
                                            <p className="text-[10px] font-black text-orange-950 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
                                                <span>⏱️</span> Stay Duration Breakdown
                                            </p>
                                            <div className="grid grid-cols-3 gap-2.5">
                                                <div className="bg-white/90 p-3 rounded-xl border border-orange-100 shadow-2xs">
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">🏡 Subd Stay</p>
                                                    <p className="text-sm font-black text-orange-700 mt-0.5">{selected.subd_duration_display || `${daysSince(selected.intake_date)}d`}</p>
                                                </div>
                                                <div className="bg-white/90 p-3 rounded-xl border border-orange-100 shadow-2xs">
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">🏢 Brgy Stay</p>
                                                    <p className="text-sm font-black text-orange-700 mt-0.5">{selected.brgy_duration_display || '0 days'}</p>
                                                </div>
                                                <div className="bg-orange-600 text-white p-3 rounded-xl shadow-xs">
                                                    <p className="text-[9px] font-bold text-orange-200 uppercase tracking-wider">Total Custody</p>
                                                    <p className="text-sm font-black text-white mt-0.5">{selected.total_duration_display || `${daysSince(selected.intake_date)}d`}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Stats grid */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                                                <p className="text-[10px] font-black uppercase text-gray-400">Cage / Slot</p>
                                                <p className="text-sm font-bold text-gray-900 mt-0.5">{selected.kennel_slot || 'Unassigned'}</p>
                                            </div>
                                            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                                                <p className="text-[10px] font-black uppercase text-gray-400">Color & Size</p>
                                                <p className="text-sm font-bold text-gray-900 mt-0.5">{selected.color || '—'}, {selected.estimated_size || '—'}</p>
                                            </div>
                                            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                                                <p className="text-[10px] font-black uppercase text-gray-400">Intake Date</p>
                                                <p className="text-sm font-bold text-gray-900 mt-0.5">{formatDate(selected.intake_date)}</p>
                                            </div>
                                            <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100">
                                                <p className="text-[10px] font-black uppercase text-gray-400">Admitted By</p>
                                                <p className="text-sm font-bold text-gray-900 mt-0.5">{selected.intake_staff_name || 'Leader'}</p>
                                            </div>
                                        </div>

                                        {/* Medical Notes */}
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-gray-900 uppercase tracking-wider">Medical & Temperament Notes</label>
                                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs text-gray-700 leading-relaxed">
                                                {selected.medical_notes || 'No active medical flags recorded.'}
                                            </div>
                                        </div>

                                        {/* Quick Actions */}
                                        <div className="flex gap-3">
                                            {!isSelectedInHistory && (
                                                <button
                                                    onClick={() => {
                                                        setUpdateForm({
                                                            facility_status: selected.facility_status,
                                                            kennel_slot: selected.kennel_slot || '',
                                                            medical_notes: selected.medical_notes || '',
                                                            update_notes: '',
                                                        });
                                                        setIsUpdating(true);
                                                    }}
                                                    className="flex-1 py-3 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl text-xs transition-all shadow-md shadow-orange-600/20"
                                                >
                                                    Update Health / Status
                                                </button>
                                            )}
                                            <Link
                                                to={`/subd/reports/${selected.report_id}`}
                                                className={`${
                                                    isSelectedInHistory ? 'w-full' : 'px-5'
                                                } py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-xs transition-all text-center flex items-center justify-center gap-1.5`}
                                            >
                                                <span>📋</span>
                                                <span>Open Original Report</span>
                                            </Link>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs font-black text-gray-900 uppercase tracking-wider">Activity Log</p>
                                            {!isSelectedInHistory && (
                                                <button
                                                    onClick={() => setIsAddingTimeline(true)}
                                                    className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-xs font-black transition-all"
                                                >
                                                    + Log Observation
                                                </button>
                                            )}
                                        </div>

                                        <div className="space-y-3">
                                            {selected.timeline?.map((log) => {
                                                const meta = EVENT_TYPE_META[log.event_type] || EVENT_TYPE_META.observation;
                                                return (
                                                    <div key={log.log_id} className="p-3.5 bg-gray-50 rounded-2xl border border-gray-100 flex items-start gap-3">
                                                        <div className={`w-8 h-8 rounded-xl ${meta.color} flex items-center justify-center text-sm shrink-0`}>
                                                            {meta.icon}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center justify-between">
                                                                <p className="text-xs font-black text-gray-900">{log.title}</p>
                                                                <span className="text-[10px] text-gray-400 font-semibold">{formatDateTime(log.logged_at)}</span>
                                                            </div>
                                                            {log.notes && <p className="text-xs text-gray-600 mt-1">{log.notes}</p>}
                                                            {log.staff_name && (
                                                                <p className="text-[10px] text-gray-400 font-bold mt-1">Logged by {log.staff_name}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ── UPDATE STATUS MODAL ───────────────────────────────────────── */}
            {isUpdating && selected && (
                <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
                        <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Update Animal Health & Status</h3>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Status</label>
                                <select
                                    value={updateForm.facility_status}
                                    onChange={e => setUpdateForm({ ...updateForm, facility_status: Number(e.target.value) })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold"
                                >
                                    {FACILITY_STATUSES.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Kennel / Cage Slot</label>
                                <input
                                    type="text"
                                    value={updateForm.kennel_slot}
                                    onChange={e => setUpdateForm({ ...updateForm, kennel_slot: e.target.value })}
                                    placeholder="e.g. Pen A-1"
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                                />
                            </div>

                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Medical / Condition Notes</label>
                                <textarea
                                    value={updateForm.medical_notes}
                                    onChange={e => setUpdateForm({ ...updateForm, medical_notes: e.target.value })}
                                    rows={2}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                                />
                            </div>

                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Activity Log Reason (Optional)</label>
                                <input
                                    type="text"
                                    value={updateForm.update_notes}
                                    onChange={e => setUpdateForm({ ...updateForm, update_notes: e.target.value })}
                                    placeholder="e.g. Owner verified and claimed pet"
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setIsUpdating(false)}
                                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdate}
                                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-black rounded-xl text-xs shadow-md shadow-orange-600/20"
                            >
                                Save Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── ADD OBSERVATION MODAL ─────────────────────────────────────── */}
            {isAddingTimeline && selected && (
                <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
                        <h3 className="text-base font-black text-gray-900 uppercase tracking-tight">Log Observation / Treatment</h3>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Category</label>
                                <select
                                    value={timelineForm.event_type}
                                    onChange={e => setTimelineForm({ ...timelineForm, event_type: e.target.value })}
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold"
                                >
                                    <option value="observation">📋 General Observation</option>
                                    <option value="medical">💊 Medical Checkup</option>
                                    <option value="treatment">🩺 Treatment Given</option>
                                    <option value="status_change">🔄 Status Update</option>
                                </select>
                            </div>

                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Title</label>
                                <input
                                    type="text"
                                    value={timelineForm.title}
                                    onChange={e => setTimelineForm({ ...timelineForm, title: e.target.value })}
                                    placeholder="e.g. Fed and administered vitamins"
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold"
                                />
                            </div>

                            <div>
                                <label className="font-bold text-gray-700 block mb-1">Details & Remarks</label>
                                <textarea
                                    value={timelineForm.notes}
                                    onChange={e => setTimelineForm({ ...timelineForm, notes: e.target.value })}
                                    rows={3}
                                    placeholder="Provide any relevant observations..."
                                    className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                                />
                            </div>
                        </div>

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setIsAddingTimeline(false)}
                                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddTimeline}
                                disabled={!timelineForm.title.trim()}
                                className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white font-black rounded-xl text-xs shadow-md shadow-orange-600/20"
                            >
                                Save Entry
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubdHoldingFacility;
