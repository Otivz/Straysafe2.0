import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';

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
    timeline: TimelineEntry[];
    report_media?: {
        media_id: number;
        file_url: string;
        media_type: string;
        is_evidence?: boolean;
        uploaded_at?: string;
    }[];
}

interface Metrics {
    total: number;
    need_treatment: number;
    healthy: number;
    nearing_expiry: number;
    resolved_today: number;
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
    intake: { icon: <span>🏠</span>, color: 'bg-blue-100 text-blue-600' },
    status_change: { icon: <span>🔄</span>, color: 'bg-amber-100 text-amber-700' },
    medical: { icon: <span>💊</span>, color: 'bg-purple-100 text-purple-600' },
    treatment: { icon: <span>🩺</span>, color: 'bg-pink-100 text-pink-600' },
    observation: { icon: <span>📋</span>, color: 'bg-gray-100 text-gray-600' },
    outcome: { icon: <span>✅</span>, color: 'bg-green-100 text-green-700' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number {
    if (!dateStr) return 0;
    const ms = Date.now() - new Date(dateStr).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24)) + 3;
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
    if (type === 'Cat') return '🐱';
    if (type === 'Dog') return '🐶';
    return '🐾';
}

// ─── Component ────────────────────────────────────────────────────────────────

const BrgyHoldingFacility = () => {
    const navigate = useNavigate();
    const [animals, setAnimals] = useState<HoldingAnimal[]>([]);
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
        facility_status: 1,
        kennel_slot: '',
        medical_notes: '',
        stay_duration: 3,
        update_notes: '',
    });

    // Add timeline entry
    const [timelineForm, setTimelineForm] = useState({ event_type: 'observation', title: '', notes: '' });
    const [isAddingTimeline, setIsAddingTimeline] = useState(false);
    const [timelineFiles, setTimelineFiles] = useState<File[]>([]);

    // Lightbox / media preview state
    const [lightboxMedia, setLightboxMedia] = useState<{ mediaList: any[]; index: number } | null>(null);
    const [uploadFiles, setUploadFiles] = useState<File[]>([]);

    const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (!userStr) navigate('/staff/login');
    }, [navigate, userStr]);

    // ── Data Fetching ──────────────────────────────────────────────────────────

    const fetchAll = useCallback(async () => {
        try {
            setLoading(true);
            const [animalsRes, metricsRes] = await Promise.all([
                axios.get('http://localhost:8000/holding/'),
                axios.get('http://localhost:8000/holding/metrics'),
            ]);
            setAnimals(animalsRes.data || []);
            setMetrics(metricsRes.data || { total: 0, need_treatment: 0, healthy: 0, nearing_expiry: 0, resolved_today: 0 });
        } catch (err) {
            console.error('Error fetching holding facility data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Filter ─────────────────────────────────────────────────────────────────

    const filtered = animals.filter(a => {
        if (!showResolved && RESOLVED_IDS.has(a.facility_status)) return false;
        if (statusFilter !== 0 && a.facility_status !== statusFilter) return false;
        const q = searchTerm.toLowerCase();
        return (
            (a.animal_type?.toLowerCase() || '').includes(q) ||
            (a.breed?.toLowerCase() || '').includes(q) ||
            (a.report_landmark?.toLowerCase() || '').includes(q) ||
            (a.kennel_slot?.toLowerCase() || '').includes(q) ||
            String(a.report_id).includes(q)
        );
    });

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
                stay_duration: daysSince(res.data.intake_date),
                update_notes: '',
            });
            setDetailTab('info');
        } catch {
            setSelected(animal);
            setUpdateForm({
                facility_status: animal.facility_status,
                kennel_slot: animal.kennel_slot || '',
                medical_notes: animal.medical_notes || '',
                stay_duration: daysSince(animal.intake_date),
                update_notes: '',
            });
        }
    };

    // ── Update animal ──────────────────────────────────────────────────────────

    const handleUpdate = async () => {
        if (!selected) return;
        setIsUpdating(true);
        try {
            const d = new Date();
            d.setDate(d.getDate() - (updateForm.stay_duration - 3));
            const calculatedIntakeDate = d.toISOString();

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

            // 2. Perform patching
            await axios.patch(`http://localhost:8000/holding/${selected.holding_id}`, {
                facility_status: updateForm.facility_status,
                kennel_slot: updateForm.kennel_slot,
                medical_notes: updateForm.medical_notes,
                intake_date: calculatedIntakeDate,
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
            icon: '🐾',
            color: 'bg-indigo-50 text-indigo-600',
            border: 'border-indigo-100',
        },
        {
            label: 'Need Treatment',
            value: metrics.need_treatment,
            icon: '🩺',
            color: 'bg-red-50 text-red-600',
            border: 'border-red-100',
        },
        {
            label: 'Healthy',
            value: metrics.healthy,
            icon: '✅',
            color: 'bg-green-50 text-green-600',
            border: 'border-green-100',
        },
        {
            label: 'Nearing Expiry',
            value: metrics.nearing_expiry,
            icon: '⏰',
            color: 'bg-amber-50 text-amber-600',
            border: 'border-amber-100',
        },
        {
            label: 'Discharged Today',
            value: metrics.resolved_today,
            icon: '🏁',
            color: 'bg-purple-50 text-purple-600',
            border: 'border-purple-100',
        },
    ];

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            <BrgySidebar />

            <div className="flex-1 flex flex-col overflow-hidden">
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

                <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-6">

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

                        {/* ── Animal Table ──────────────────────────────────── */}
                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                                    <p className="text-sm text-gray-400 font-semibold">Loading facility records...</p>
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-3">
                                    <span className="text-5xl">🏠</span>
                                    <p className="text-gray-400 font-semibold text-sm">No animals in holding facility.</p>
                                    <p className="text-gray-300 text-xs">Animals are automatically admitted when a rescue is marked as "Picked Up".</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="bg-gray-50 border-b border-gray-100">
                                                {['Animal', 'Report', 'Location / Kennel', 'Facility Status', 'Intake Date', 'Stay Duration', 'Impound Deadline', 'Action'].map(h => (
                                                    <th key={h} className="px-5 py-3.5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {filtered.map(animal => {
                                                const statusMeta = getStatusMeta(animal.facility_status);
                                                const days = daysSince(animal.intake_date);
                                                const remaining = daysRemaining(animal.intake_date);
                                                const isResolved = RESOLVED_IDS.has(animal.facility_status);
                                                const isNearExpiry = !isResolved && remaining <= 2;

                                                return (
                                                    <tr
                                                        key={animal.holding_id}
                                                        onClick={() => openDetail(animal)}
                                                        className={`cursor-pointer hover:bg-gray-50/80 transition-colors ${isResolved ? 'opacity-60' : ''}`}
                                                    >
                                                        {/* Animal */}
                                                        <td className="px-5 py-4">
                                                            <div className="flex items-center gap-3">
                                                                {(() => {
                                                                    const firstImage = animal.report_media?.find(
                                                                        m => m.media_type === 'Image' || m.file_url.toLowerCase().match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)
                                                                    );
                                                                    return (
                                                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 overflow-hidden border border-indigo-100 flex items-center justify-center shrink-0">
                                                                            {firstImage ? (
                                                                                <img 
                                                                                    src={firstImage.file_url} 
                                                                                    alt={animal.animal_name || 'Animal'} 
                                                                                    className="w-full h-full object-cover" 
                                                                                />
                                                                            ) : (
                                                                                <span className="text-xl">{animalIcon(animal.animal_type)}</span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })()}
                                                                <div>
                                                                    <p className="font-bold text-gray-900 text-sm">
                                                                        {animal.animal_name || `${animal.animal_type || 'Unknown'} #${animal.holding_id}`}
                                                                    </p>
                                                                    <p className="text-[11px] text-gray-400">{animal.breed || '—'} · {animal.color || '—'}</p>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Report */}
                                                        <td className="px-5 py-4">
                                                            <span className="text-xs font-mono text-gray-400">#{animal.report_id.toString().padStart(4, '0')}</span>
                                                            <p className="text-[11px] text-gray-500 mt-0.5">{animal.report_category || '—'}</p>
                                                        </td>

                                                        {/* Location */}
                                                        <td className="px-5 py-4">
                                                            {animal.kennel_slot ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-lg border border-indigo-100">
                                                                    📍 {animal.kennel_slot}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-gray-400">Not assigned</span>
                                                            )}
                                                            <p className="text-[10px] text-gray-400 mt-1 truncate max-w-[120px]">{animal.report_landmark || '—'}</p>
                                                        </td>

                                                        {/* Status */}
                                                        <td className="px-5 py-4">
                                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusMeta.color}`}>
                                                                {statusMeta.name}
                                                            </span>
                                                        </td>

                                                        {/* Intake date */}
                                                        <td className="px-5 py-4 text-xs text-gray-500 whitespace-nowrap">
                                                            {formatDate(animal.intake_date)}
                                                        </td>

                                                        {/* Stay duration */}
                                                        <td className="px-5 py-4">
                                                            {isResolved ? (
                                                                <span className="text-xs text-gray-400">Discharged</span>
                                                            ) : (
                                                                <span className={`text-sm font-bold ${days >= IMPOUND_DAYS ? 'text-red-600' : 'text-gray-700'}`}>
                                                                    {days} day{days !== 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Impound deadline */}
                                                        <td className="px-5 py-4">
                                                            {isResolved ? (
                                                                <span className="text-xs text-gray-400">—</span>
                                                            ) : isNearExpiry ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-600 text-[10px] font-bold rounded-lg border border-red-100 animate-pulse">
                                                                    ⚠️ {remaining}d left
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-gray-500">{remaining}d remaining</span>
                                                            )}
                                                        </td>

                                                        {/* Action */}
                                                        <td className="px-5 py-4">
                                                            <button
                                                                onClick={e => { e.stopPropagation(); openDetail(animal); }}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg hover:bg-indigo-100 transition-all uppercase tracking-widest"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                </svg>
                                                                Manage
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* ── Info Banner ───────────────────────────────────── */}
                        <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-4 flex items-start gap-4">
                            <div className="w-9 h-9 rounded-xl bg-indigo-500 text-white flex items-center justify-center shrink-0 text-base">ℹ️</div>
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
                                <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center text-2xl">
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
                                ✕
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
                                    {tab === 'info' ? '📋 Animal Info & Update' : `📅 Timeline (${selected.timeline.length})`}
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

                                    {/* Current Info Grid */}
                                    <div className="grid grid-cols-2 gap-4">
                                        {[
                                            { label: 'Animal Type', value: selected.animal_type || '—' },
                                            { label: 'Breed', value: selected.breed || '—' },
                                            { label: 'Color', value: selected.color || '—' },
                                            { label: 'Estimated Size', value: selected.estimated_size || '—' },
                                            { label: 'Kennel Slot', value: selected.kennel_slot || '—' },
                                            { label: 'Stay Duration', value: RESOLVED_IDS.has(selected.facility_status) ? 'Discharged' : `${daysSince(selected.intake_date)} day(s)` },
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
                                                <span>📸</span> Uploaded Media & Evidence
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
                                                                    <span className="text-3xl">📄</span>
                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1 truncate w-full">Document</span>
                                                                </div>
                                                            ) : isVideo ? (
                                                                <div className="w-full h-full relative">
                                                                    <video src={media.file_url} className="w-full h-full object-cover pointer-events-none" />
                                                                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center group-hover:bg-black/35 transition-colors">
                                                                        <span className="text-white text-2xl drop-shadow-md">▶️</span>
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
                                            <p className="text-xs font-bold text-green-800">✅ Discharged on {formatDateTime(selected.discharge_date)}</p>
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
                                                {[3, 4, 5].includes(updateForm.facility_status) && (
                                                    <p className="text-[10px] text-amber-600 font-semibold mt-1.5">
                                                        ⚠️ This will discharge the animal and automatically close the linked report (Resolved).
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

                                            <div>
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1">Stay Duration (days)</label>
                                                <input
                                                    type="number"
                                                    min={3}
                                                    max={365}
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-200 outline-none"
                                                    value={updateForm.stay_duration}
                                                    onChange={e => setUpdateForm(f => ({ ...f, stay_duration: Number(e.target.value) }))}
                                                />
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
                                                                        <span className="truncate flex-1 pr-1">📎 {file.name}</span>
                                                                        <button 
                                                                            type="button" 
                                                                            onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))}
                                                                            className="text-red-500 hover:text-red-750 font-extrabold shrink-0 ml-1"
                                                                        >
                                                                            ✕
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
                                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest block mb-1.5">📎 Attach Media (optional)</label>
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
                                                                        <span className="truncate flex-1 pr-1">📎 {file.name}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setTimelineFiles(prev => prev.filter((_, i) => i !== idx))}
                                                                            className="text-red-500 font-extrabold shrink-0 ml-1"
                                                                        >✕</button>
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
                                                                        <span>👤</span> {log.staff_name}
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

            {/* ─── Lightbox / Media Viewer Modal ───────────────────────────────── */}
            {lightboxMedia && (
                <div 
                    className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-[100] p-4 select-none"
                    onClick={() => setLightboxMedia(null)}
                >
                    {/* Close Button */}
                    <button 
                        onClick={() => setLightboxMedia(null)}
                        className="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-xl transition-colors z-[110]"
                    >
                        ✕
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
                                        <span className="text-6xl mb-4">📄</span>
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
        </div>
    );
};

export default BrgyHoldingFacility;
