import { useState, useEffect, useCallback, useMemo } from 'react';
import AnimalRecordsPanel from '../../components/AnimalRecordsPanel';
import type { ReactNode } from 'react';
import OwnerReturnPicker, { EMPTY_OWNER_RETURN, ownerReturnError, prepareOwnerReturn, type OwnerReturnValue } from '../../components/OwnerReturnPicker';
import {
    PawPrint, Truck, MapPin, RefreshCw, Pill, Stethoscope, ClipboardList,
    CheckCircle2, Cat, Dog, AlertTriangle, Clock, Flag, Building2,
    Home, Settings, BarChart3, User, Phone, Rocket, Scale, Info,
    X, Calendar, Timer, Camera, FileText, Pencil, Sparkles, Paperclip, PlayCircle,
    RotateCcw, AlertOctagon, SlidersHorizontal, ChevronDown
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api, { API_BASE_URL } from '../../utils/api';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import { useCachedState, usePersistentState, hasCachedData } from '../../utils/useCachedState';

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
    facility_intake_date?: string | null;   // stay-limit clock start at the current facility
    current_facility_level?: 'Subdivision' | 'Barangay' | null;   // where the animal is now
    original_photo_url?: string | null;
    pet_photo_url?: string | null;   // photo from the animal's pet record
    timeline: TimelineEntry[];
    adoption_catalog_notes?: string | null;
    promoted_at?: string | null;
    report_media?: {
        media_id: number;
        file_url: string;
        media_type: string;
        is_evidence?: boolean;
        history_id?: number | null;
        holding_log_id?: number | null;
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

const IMPOUND_DAYS = 7;

const FACILITY_STATUSES = [
    { id: 1, name: 'Need Treatment', color: 'bg-red-50 text-red-600 border-red-200' },
    { id: 2, name: 'Healthy', color: 'bg-green-50 text-green-600 border-green-200' },
    { id: 3, name: 'Claimed by Owner', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    { id: 4, name: 'Deceased', color: 'bg-gray-100 text-gray-500 border-gray-200' },
    { id: 5, name: 'Transferred to Shelter', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    { id: 6, name: 'For Adoption', color: 'bg-teal-50 text-teal-600 border-teal-200' },
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

// Each holding facility has its own stay clock: it restarts when the animal moves to another facility
function stayStart(a: { facility_intake_date?: string | null; intake_date: string | null }): string | null {
    return a.facility_intake_date || a.intake_date;
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

function formatStayDuration(
    intakeDate?: string | null,
    dischargeDate?: string | null,
    isResolved?: boolean,
    backendDisplay?: string | null
): string {
    if (!intakeDate) return backendDisplay || '0 hours';
    const start = new Date(intakeDate).getTime();
    if (isNaN(start)) return backendDisplay || '0 hours';

    const end = (isResolved && dischargeDate) ? new Date(dischargeDate).getTime() : Date.now();
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));

    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);

    if (isResolved) {
        if (mins > 0 || parts.length === 0) {
            parts.push(`${mins} minute${mins !== 1 ? 's' : ''}`);
        }
    } else {
        if (parts.length === 0) {
            const singleM = Math.max(mins, 1);
            parts.push(`${singleM} minute${singleM !== 1 ? 's' : ''}`);
        }
    }

    return parts.join(', ');
}

function formatDynamicDuration(
    startDate?: string | null,
    endDate?: string | null,
    isResolved?: boolean,
    fallback?: string | null
): string {
    if (!startDate) return fallback || '0 mins';
    const start = new Date(startDate).getTime();
    if (isNaN(start)) return fallback || '0 mins';

    const end = (isResolved && endDate) ? new Date(endDate).getTime() : Date.now();
    const diffSec = Math.max(0, Math.floor((end - start) / 1000));

    const days = Math.floor(diffSec / 86400);
    const hours = Math.floor((diffSec % 86400) / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
    if (days === 0 || mins > 0 || parts.length === 0) {
        parts.push(`${mins} min${mins !== 1 ? 's' : ''}`);
    }

    return parts.join(', ');
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

// Cards show the animal's photo from its pet record; the report's submitted photo is the fallback
function getCardPhoto(animal: HoldingAnimal): string | undefined {
    return animal.pet_photo_url || getAnimalPhoto(animal);
}

function getAnimalPhoto(animal: HoldingAnimal): string | undefined {
    // 0. Primary: Explicit original photo resolved by backend from initial report submission
    if (animal.original_photo_url) return animal.original_photo_url;

    // 1. Initial report submission images (no history_id, no holding_log_id, not is_evidence, image file)
    const initialReportImages = animal.report_media
        ?.filter(m => {
            if (m.is_evidence) return false;
            if (m.history_id || m.holding_log_id) return false;
            if (m.media_type && m.media_type.toLowerCase() === 'document') return false;
            if (m.file_url) {
                const lower = m.file_url.toLowerCase();
                return !lower.endsWith('.pdf') && !lower.endsWith('.doc') && !lower.endsWith('.docx') && !lower.endsWith('.txt') && !lower.endsWith('.mp4') && !lower.endsWith('.mov') && !lower.endsWith('.webm') && !lower.endsWith('.avi');
            }
            return false;
        })
        .sort((a, b) => (a.media_id || 0) - (b.media_id || 0));

    if (initialReportImages && initialReportImages.length > 0 && initialReportImages[0].file_url) {
        return initialReportImages[0].file_url;
    }

    // 2. Fallback: Any initial report media without history_id or holding_log_id
    const anyInitialMedia = animal.report_media
        ?.filter(m => {
            if (m.history_id || m.holding_log_id) return false;
            if (m.media_type && m.media_type.toLowerCase() === 'document') return false;
            if (m.file_url) {
                const lower = m.file_url.toLowerCase();
                return !lower.endsWith('.pdf') && !lower.endsWith('.doc') && !lower.endsWith('.docx') && !lower.endsWith('.txt') && !lower.endsWith('.mp4') && !lower.endsWith('.mov') && !lower.endsWith('.webm') && !lower.endsWith('.avi');
            }
            return false;
        })
        .sort((a, b) => (a.media_id || 0) - (b.media_id || 0));

    if (anyInitialMedia && anyInitialMedia.length > 0 && anyInitialMedia[0].file_url) {
        return anyInitialMedia[0].file_url;
    }

    // 3. Fallback: Earliest non-evidence image in report_media
    const nonEvidenceMedia = animal.report_media
        ?.filter(m => {
            if (m.is_evidence) return false;
            if (m.media_type && m.media_type.toLowerCase() === 'document') return false;
            if (m.file_url) {
                const lower = m.file_url.toLowerCase();
                return !lower.endsWith('.pdf') && !lower.endsWith('.doc') && !lower.endsWith('.docx') && !lower.endsWith('.txt') && !lower.endsWith('.mp4') && !lower.endsWith('.mov') && !lower.endsWith('.webm') && !lower.endsWith('.avi');
            }
            return false;
        })
        .sort((a, b) => (a.media_id || 0) - (b.media_id || 0));

    if (nonEvidenceMedia && nonEvidenceMedia.length > 0 && nonEvidenceMedia[0].file_url) {
        return nonEvidenceMedia[0].file_url;
    }

    // 4. Fallback: Earliest image in report_media
    const anyImageMedia = animal.report_media
        ?.filter(m => {
            if (m.media_type && m.media_type.toLowerCase() === 'document') return false;
            if (m.file_url) {
                const lower = m.file_url.toLowerCase();
                return !lower.endsWith('.pdf') && !lower.endsWith('.doc') && !lower.endsWith('.docx') && !lower.endsWith('.txt') && !lower.endsWith('.mp4') && !lower.endsWith('.mov') && !lower.endsWith('.webm') && !lower.endsWith('.avi');
            }
            return false;
        })
        .sort((a, b) => (a.media_id || 0) - (b.media_id || 0));

    if (anyImageMedia && anyImageMedia.length > 0 && anyImageMedia[0].file_url) {
        return anyImageMedia[0].file_url;
    }

    // 5. Fallback: Timeline entries
    if (animal.timeline) {
        for (const t of animal.timeline) {
            const tMedia = (t as any).media;
            if (Array.isArray(tMedia)) {
                const img = tMedia.find((m: any) => {
                    if (m.media_type && m.media_type.toLowerCase() === 'document') return false;
                    if (m.file_url) {
                        const lower = m.file_url.toLowerCase();
                        return !lower.endsWith('.pdf') && !lower.endsWith('.doc') && !lower.endsWith('.docx') && !lower.endsWith('.txt') && !lower.endsWith('.mp4') && !lower.endsWith('.mov') && !lower.endsWith('.webm') && !lower.endsWith('.avi');
                    }
                    return false;
                });
                if (img?.file_url) return img.file_url;
            }
        }
    }

    return undefined;
}

// ─── Component ────────────────────────────────────────────────────────────────

const BrgyHoldingFacility = () => {
    const navigate = useNavigate();
    const [animals, setAnimals] = useCachedState<HoldingAnimal[]>('holding_animals', []);
    const [facilities, setFacilities] = useState<FacilityOption[]>([]);
    const [jurisdictions, setJurisdictions] = useState<JurisdictionData>({ barangays: [], subdivisions: [] });
    const [selectedScope, setSelectedScope] = usePersistentState<string>('holding_scope', 'all'); // 'all' | 'brgy_<id>' | 'subd_<id>'
    const [selectedFacilityId, setSelectedFacilityId] = usePersistentState<number | 'all'>('holding_facility', 'all');
    const [metrics, setMetrics] = useCachedState<Metrics>('holding_metrics', { total: 0, need_treatment: 0, healthy: 0, nearing_expiry: 0, resolved_today: 0 });
    const [loading, setLoading] = useState(() => !hasCachedData('data:holding_animals'));
    const [searchTerm, setSearchTerm] = usePersistentState('holding_search', '');
    const [statusFilter, setStatusFilter] = usePersistentState<number>('holding_status', 0); // 0 = All
    const [showResolved, setShowResolved] = useState(false);
    const [showFilters, setShowFilters] = useState(false);          // the collapsible filter panel
    const [overdueExpanded, setOverdueExpanded] = useState(false);  // the stay-limit warning details

    // Selected animal detail modal
    const [selected, setSelected] = useState<HoldingAnimal | null>(null);
    const [detailTab, setDetailTab] = useState<'info' | 'timeline'>('info');

    // Update modal state
    const [isUpdating, setIsUpdating] = useState(false);
    const [isEditingCondition, setIsEditingCondition] = useState(false);
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
            } catch { }
        }
        return 0;
    });

    const handleDurationChange = (newVal: number) => {
        const clamped = Math.max(0, Math.min(90, isNaN(newVal) ? 0 : newVal));
        setImpoundStayDuration(clamped);
        localStorage.setItem('holding_impound_stay_duration', String(clamped));
    };

    // Periodic refresh for live stay durations (ticks every 10s for real-time live clock updates)
    const [, setStayTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setStayTick(t => t + 1), 10000);
        return () => clearInterval(interval);
    }, []);

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
    const [impoundNotes, setImpoundNotes] = useState('');
    const [earlyImpoundAcknowledged, setEarlyImpoundAcknowledged] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

    const openImpoundModal = (animal: HoldingAnimal) => {
        setQuickImpoundAnimal(animal);
        setImpoundNotes('');
        setEarlyImpoundAcknowledged(false);
    };

    const handleConfirmImpound = async (animal: HoldingAnimal) => {
        setIsQuickImpounding(true);
        try {
            const stayDays = daysSince(stayStart(animal));
            const isEarly = stayDays < impoundStayDuration;
            const defaultNote = isEarly
                ? `Animal officially impounded prior to stay limit (${stayDays} of ${impoundStayDuration} days elapsed; authorized by Head Officer) at ${animal.facility_name || 'holding facility'}.`
                : `Animal officially impounded after reaching ${impoundStayDuration}-day holding stay limit at ${animal.facility_name || 'holding facility'}.`;
            const finalNote = impoundNotes.trim() ? `${defaultNote} Notes: ${impoundNotes.trim()}` : defaultNote;

            await api.patch(`/holding/${animal.holding_id}`, {
                facility_status: 8, // Impounded
                updated_by: currentUser?.user_id,
                update_notes: finalNote,
            });
            setQuickImpoundAnimal(null);
            setImpoundNotes('');
            setEarlyImpoundAcknowledged(false);
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

    const [isWithdrawing, setIsWithdrawing] = useState(false);

    const handleWithdrawFromAdoption = async () => {
        if (!selected) return;
        if (!window.confirm(`Withdraw ${selected.animal_name || `Animal #${selected.holding_id}`} from the public Adoption Catalog and return to holding custody?`)) {
            return;
        }
        setIsWithdrawing(true);
        try {
            await api.post(`/adoptions/withdraw/${selected.holding_id}`);
            await fetchAll();
            const res = await api.get(`/holding/${selected.holding_id}`);
            setSelected(res.data);
        } catch (err: any) {
            console.error('Failed to withdraw from adoption:', err);
            const errMsg = err?.response?.data?.detail || err?.message || 'Failed to withdraw animal from adoption catalog';
            alert(`Withdrawal failed: ${errMsg}`);
        } finally {
            setIsWithdrawing(false);
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
                        api.get('/landmarks?is_holding_facility=true'),
                        api.get('/landmarks/jurisdictions'),
                    ]);
                    if (Array.isArray(facRes.data)) setFacilities(facRes.data);
                    if (jurisRes.data) setJurisdictions(jurisRes.data);
                } else if (isSubdLeader && defaultSubdId) {
                    const res = await api.get(`/landmarks?subdivision_id=${defaultSubdId}&is_holding_facility=true`);
                    if (Array.isArray(res.data)) {
                        setFacilities(res.data.filter((f: any) => f.subdivision_id === defaultSubdId));
                    }
                } else if (defaultBrgyId) {
                    const res = await api.get(`/landmarks?barangay_id=${defaultBrgyId}&is_holding_facility=true&barangay_only=true`);
                    if (Array.isArray(res.data)) {
                        setFacilities(res.data.filter((f: any) => f.subdivision_id == null));
                    }
                } else {
                    const res = await api.get('/landmarks?is_holding_facility=true&barangay_only=true');
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
            if (!hasCachedData('data:holding_animals')) setLoading(true);
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
                api.get('/holding/', { params }),
                api.get('/holding/metrics', { params }),
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
        return filtered.filter(a => !RESOLVED_IDS.has(a.facility_status) && a.facility_status !== 6 && daysSince(stayStart(a)) >= impoundStayDuration);
    }, [filtered, impoundStayDuration]);

    const nearingAnimals = useMemo(() => {
        return filtered.filter(a => {
            if (RESOLVED_IDS.has(a.facility_status) || a.facility_status === 6) return false;
            const days = daysSince(stayStart(a));
            const rem = impoundStayDuration - days;
            return rem > 0 && rem <= 2;
        });
    }, [filtered, impoundStayDuration]);

    // ── Open detail modal ──────────────────────────────────────────────────────

    const openDetail = async (animal: HoldingAnimal) => {
        // Fetch fresh with full timeline
        try {
            const res = await api.get(`/holding/${animal.holding_id}`);
            setSelected(res.data);
            setIsEditingCondition(false);
            setUpdateForm({
                facility_status: res.data.facility_status,
                kennel_slot: res.data.kennel_slot || '',
                medical_notes: res.data.medical_notes || '',
                update_notes: '',
            });
            setDetailTab('info');
        } catch {
            setSelected(animal);
            setIsEditingCondition(false);
            setUpdateForm({
                facility_status: animal.facility_status,
                kennel_slot: animal.kennel_slot || '',
                medical_notes: animal.medical_notes || '',
                update_notes: '',
            });
        }
    };

    // ── Update animal ──────────────────────────────────────────────────────────

    const [ownerReturn, setOwnerReturn] = useState<OwnerReturnValue>(EMPTY_OWNER_RETURN);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const isClaimingByOwner = !!selected && updateForm.facility_status === 3 && selected.facility_status !== 3;

    const handleUpdate = async () => {
        if (!selected) return;
        setUpdateError(null);
        if (updateForm.facility_status === 8 && selected.facility_status !== 8) {
            openImpoundModal(selected);
            return;
        }
        if (isClaimingByOwner) {
            const effOwnerId = (selected as any)?.owner_id || (selected as any)?.pet?.owner_id;
            const err = ownerReturnError(ownerReturn, effOwnerId, ownerReturn.has_proof_on_file);
            if (err) {
                setUpdateError(err);
                return;
            }
        }
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

            // 2. Perform patching (preserving intake_date genuine start time)
            await api.patch(`/holding/${selected.holding_id}`, {
                facility_status: updateForm.facility_status,
                kennel_slot: updateForm.kennel_slot,
                medical_notes: updateForm.medical_notes,
                update_notes: updateForm.update_notes,
                updated_by: currentUser?.user_id,
                media_ids: uploadedMediaIds,
                ...(isClaimingByOwner ? { owner_return: await prepareOwnerReturn(selected.report_id, ownerReturn) } : {}),
            });
            setOwnerReturn(EMPTY_OWNER_RETURN);
            await fetchAll();
            // Refresh the selected modal too
            const res = await api.get(`/holding/${selected.holding_id}`);
            setSelected(res.data);
            setIsEditingCondition(false);
        } catch (err: any) {
            console.error('Update failed:', err);
            const detail = err?.response?.data?.detail;
            setUpdateError(typeof detail === 'string' ? detail : 'Update failed. Please try again.');
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
            await api.post(
                `/adoptions/promote/${selected.holding_id}`,
                {
                    adoption_catalog_notes: promoteNotes,
                    notes: promoteNotes,
                    min_stay_days: impoundStayDuration,
                }
            );
            setPromoteSuccess('Animal successfully promoted to public Adoption Catalog!');
            await fetchAll();
            const res = await api.get(`/holding/${selected.holding_id}`);
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
            // 1. Upload any attached files first and remember their ids so the entry owns them
            const uploadedMediaIds: number[] = [];
            if (timelineFiles.length > 0) {
                for (const file of timelineFiles) {
                    const fd = new FormData();
                    fd.append('file', file);
                    fd.append('is_evidence', 'true');
                    const up = await api.post(`/reports/${selected.report_id}/media`, fd, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                    if (up.data?.media_id) uploadedMediaIds.push(up.data.media_id);
                }
                setTimelineFiles([]);
            }

            // 2. Add the timeline entry (media_ids attaches the photos to this entry in every timeline view)
            await api.post(`/holding/${selected.holding_id}/timeline`, {
                ...timelineForm,
                logged_by: currentUser?.user_id,
                media_ids: uploadedMediaIds,
            });
            const res = await api.get(`/holding/${selected.holding_id}`);
            setSelected(res.data);
            setTimelineForm({ event_type: 'observation', title: '', notes: '' });
        } catch (err) {
            console.error('Timeline add failed:', err);
        } finally {
            setIsAddingTimeline(false);
        }
    };

    // ─── Render ────────────────────────────────────────────────────────────────

    // Manage dialog open: the page behind doesn't scroll
    useEffect(() => {
        if (!selected) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [selected]);

    const metricCards = [
        {
            label: 'Total Animals',
            value: metrics.total,
            icon: PawPrint,
            color: 'bg-role-soft text-role-strong',
            border: 'border-role-muted',
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
            {isAdmin ? (
                <AdminSidebar />
            ) : (
                <BrgySidebar
                    isMobileOpen={isMobileSidebarOpen}
                    onCloseMobile={() => setIsMobileSidebarOpen(false)}
                />
            )}

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
                        onMenuToggle={() => setIsMobileSidebarOpen(true)}
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

                <main className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 md:p-8 pb-32 lg:pb-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">

                        {/* ── Heading (phones; desktop shows it in the top bar) + facility selector ── */}
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-2.5">
                            <div className="min-w-0 md:hidden">
                                <h1 className="text-lg font-black text-gray-900 tracking-tight leading-tight">Holding Facility</h1>
                                <p className="text-xs font-semibold text-gray-500">Animal intake, monitoring and case resolution</p>
                            </div>
                            <div className={`grid gap-2 md:ml-auto md:flex md:items-center ${isAdmin ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                                {/* Admin: area first, then the facility */}
                                {isAdmin && (
                                    <label className="relative block md:w-64">
                                        <span className="sr-only">Subdivision or Barangay</span>
                                        <select
                                            value={selectedScope}
                                            onChange={(e) => {
                                                setSelectedScope(e.target.value);
                                                setSelectedFacilityId('all');
                                            }}
                                            className="w-full h-10 pl-3 pr-8 bg-role-soft/70 border border-role-border rounded-xl text-sm font-bold text-role-strong focus:ring-2 focus:ring-role-border outline-none appearance-none cursor-pointer"
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
                                        <ChevronDown className="w-4 h-4 text-role-hover absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </label>
                                )}
                                <div className="flex items-center gap-2">
                                    <label className="relative block flex-1 md:w-72">
                                        <span className="sr-only">Holding facility</span>
                                        <Building2 className="w-4 h-4 text-role-hover absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                        <select
                                            value={selectedFacilityId}
                                            onChange={(e) => setSelectedFacilityId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                            className="w-full h-10 pl-9 pr-8 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-role-border outline-none appearance-none cursor-pointer"
                                        >
                                            <option value="all">All facilities ({filteredFacilities.length})</option>
                                            {filteredFacilities.map((fac) => (
                                                <option key={fac.landmark_id} value={fac.landmark_id}>
                                                    {fac.name} {fac.capacity ? `(Cap: ${fac.capacity})` : ''} {isAdmin && (fac.subdivision_name ? `• ${fac.subdivision_name}` : (fac.barangay_name ? `• Brgy ${fac.barangay_name}` : ''))}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                    </label>
                                    {isHeadOfficer && (
                                        <button
                                            type="button"
                                            onClick={() => navigate('/brgy/settings')}
                                            className="h-10 w-10 md:w-auto md:px-3 shrink-0 inline-flex items-center justify-center gap-1.5 bg-role-soft hover:bg-role-muted border border-role-border text-role-strong text-xs font-black rounded-xl transition-all cursor-pointer"
                                            title="Add, edit, or remove Barangay landmarks and holding facilities"
                                            aria-label="Manage facilities"
                                        >
                                            <Settings className="w-4 h-4" />
                                            <span className="hidden md:inline">Manage Facilities</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Selected facility: type, caretaker, phone, occupancy on one line */}
                        {activeFacility && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 bg-role-soft/50 border border-role-muted rounded-xl px-3 py-2">
                                <span className="inline-flex items-center gap-1"><BarChart3 className="w-3.5 h-3.5 text-role-hover" /> {activeFacility.facility_type || 'Holding Facility'}</span>
                                {activeFacility.contact_person && (
                                    <span className="inline-flex items-center gap-1 min-w-0"><User className="w-3.5 h-3.5 text-role-hover shrink-0" /> <strong className="text-gray-800 truncate">{activeFacility.contact_person}</strong></span>
                                )}
                                {activeFacility.contact_number && (
                                    <span className="inline-flex items-center gap-1"><Phone className="w-3.5 h-3.5 text-role-hover" /> {activeFacility.contact_number}</span>
                                )}
                                <span className="ml-auto inline-flex items-center gap-1 font-bold text-role-strong">
                                    Occupied <strong className="text-sm font-black">{activeOccupancy}</strong> / {activeFacility.capacity || '—'}
                                </span>
                            </div>
                        )}

                        {/* ── Statistics: four primary counts, the fifth as a small summary ── */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
                            {metricCards.slice(0, 4).map((m, i) => (
                                <div key={i} className={`bg-white rounded-2xl border ${m.border} p-3 flex items-center gap-2.5 min-w-0`}>
                                    <div className={`w-9 h-9 rounded-xl ${m.color} flex items-center justify-center shrink-0`}>
                                        <m.icon className="w-4.5 h-4.5" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-2xl font-black text-gray-900 leading-none">{m.value}</p>
                                        <p className="text-[11px] font-bold text-gray-500 leading-tight mt-1">{m.label}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        {metricCards[4] && (() => {
                            const m = metricCards[4];
                            return (
                                <div className="flex items-center justify-between gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2 text-xs">
                                    <span className="inline-flex items-center gap-1.5 font-bold text-gray-500 min-w-0">
                                        <m.icon className="w-3.5 h-3.5 text-role-hover shrink-0" /> <span className="truncate">{m.label}</span>
                                    </span>
                                    <span className="text-sm font-black text-gray-900">{m.value}</span>
                                </div>
                            );
                        })()}

                        {/* ── Stay-limit warning (compact; details with Adopt / Impound expand) ── */}
                        {overdueAnimals.length > 0 && (
                            <div className="rounded-2xl border border-red-200 bg-red-50/70 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setOverdueExpanded(v => !v)}
                                    aria-expanded={overdueExpanded}
                                    className="w-full flex items-center gap-3 p-3 text-left cursor-pointer"
                                >
                                    <span className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 text-base font-black">
                                        {overdueAnimals.length}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-black text-red-950 leading-tight">
                                            {overdueAnimals.length === 1 ? 'Animal' : 'Animals'} past the {impoundStayDuration}-day stay limit
                                        </span>
                                        <span className="block text-xs font-semibold text-red-800/90">Choose: promote for adoption or impound</span>
                                    </span>
                                    <ChevronDown className={`w-5 h-5 text-red-700 shrink-0 transition-transform ${overdueExpanded ? 'rotate-180' : ''}`} />
                                </button>

                                {overdueExpanded && (
                                    <div className="px-3 pb-3 space-y-2">
                                        <p className="text-xs text-red-900/90 leading-relaxed">
                                            {overdueAnimals.length === 1 ? '1 animal has' : `${overdueAnimals.length} animals have`} reached or exceeded the {impoundStayDuration}-day maximum holding stay limit. Review and choose: promote for adoption or mark as impounded.
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                            {overdueAnimals.map((animal) => {
                                                const days = daysSince(stayStart(animal));
                                                const overDays = days - impoundStayDuration;
                                                const thumbImg = getCardPhoto(animal);
                                                return (
                                                    <div key={animal.holding_id} className="bg-white rounded-xl border border-red-100 p-2 space-y-2">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-11 h-11 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-200 flex items-center justify-center">
                                                                {thumbImg ? (
                                                                    <img src={thumbImg.startsWith('http') ? thumbImg : `${API_BASE_URL}${thumbImg}`} alt={animal.animal_name || 'Animal'} className="w-full h-full object-cover" />
                                                                ) : animalIcon(animal.animal_type, 'w-5 h-5')}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-black text-gray-900 truncate">
                                                                    <span className="font-mono text-gray-400 mr-1">#{animal.report_id.toString().padStart(4, '0')}</span>
                                                                    {animal.animal_name || `${animal.animal_type || 'Animal'} #${animal.holding_id}`}
                                                                </p>
                                                                <p className="text-[11px] font-bold text-red-700">
                                                                    {overDays > 0 ? `${overDays}d over` : 'Due today'} · {days}/{impoundStayDuration} days
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => openPromoteModalForAnimal(animal)}
                                                                className="h-9 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-black rounded-lg border border-emerald-200 transition-all flex items-center justify-center gap-1 cursor-pointer"
                                                                title="Make animal available for public adoption"
                                                            >
                                                                <Rocket className="w-3.5 h-3.5" /> Adopt Out
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => openImpoundModal(animal)}
                                                                className="h-9 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                                                                title="Officially impound animal and close case"
                                                            >
                                                                <Scale className="w-3.5 h-3.5" /> Impound
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Search + filter button + refresh ── */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="relative flex-1 min-w-0">
                                    <span className="absolute inset-y-0 left-3 flex items-center text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                    </span>
                                    <input
                                        type="text"
                                        placeholder="Search type, breed, location, report #"
                                        className="w-full h-11 pl-9 pr-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-role-border outline-none"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowFilters(v => !v)}
                                    aria-expanded={showFilters}
                                    className={`relative h-11 px-3 shrink-0 inline-flex items-center gap-1.5 rounded-xl border text-sm font-bold transition-all cursor-pointer ${
                                        showFilters ? 'bg-role-soft border-role-border text-role-strong' : 'bg-white border-gray-200 text-gray-600 hover:border-role-border'
                                    }`}
                                    title="Filters"
                                >
                                    <SlidersHorizontal className="w-4 h-4" />
                                    <span className="hidden sm:inline">Filters</span>
                                    {(statusFilter !== 0 || showResolved) && (
                                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-role border-2 border-white" />
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={fetchAll}
                                    className="h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-role hover:border-role-border transition-all cursor-pointer"
                                    title="Refresh data"
                                    aria-label="Refresh data"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </button>
                            </div>

                            {showFilters && (
                                <div className="bg-white border border-gray-100 rounded-2xl p-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <label className="block">
                                        <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Health status</span>
                                        <select
                                            value={statusFilter}
                                            onChange={e => setStatusFilter(Number(e.target.value))}
                                            className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-role-border outline-none"
                                        >
                                            <option value={0}>All statuses</option>
                                            {FACILITY_STATUSES.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </label>

                                    <div>
                                        <span className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">Stay limit (days)</span>
                                        <div className="flex items-center h-10 bg-white rounded-xl border border-role-border overflow-hidden w-full">
                                            <button
                                                type="button"
                                                onClick={() => handleDurationChange(impoundStayDuration - 1)}
                                                disabled={impoundStayDuration <= 0}
                                                className="w-11 h-full flex items-center justify-center text-role-strong hover:bg-role-muted disabled:opacity-30 font-black text-lg transition-colors cursor-pointer"
                                                title="Decrease stay limit"
                                                aria-label="Decrease stay limit"
                                            >
                                                −
                                            </button>
                                            <input
                                                type="number"
                                                min={0}
                                                max={90}
                                                value={impoundStayDuration}
                                                onChange={(e) => handleDurationChange(Number(e.target.value))}
                                                className="flex-1 min-w-0 text-center font-black text-sm text-role-strong focus:outline-none bg-transparent"
                                                aria-label="Stay limit in days"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleDurationChange(impoundStayDuration + 1)}
                                                disabled={impoundStayDuration >= 90}
                                                className="w-11 h-full flex items-center justify-center text-role-strong hover:bg-role-muted disabled:opacity-30 font-black text-lg transition-colors cursor-pointer"
                                                title="Increase stay limit"
                                                aria-label="Increase stay limit"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>

                                    <label className="flex items-center gap-2.5 h-10 sm:mt-5 px-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 cursor-pointer select-none">
                                        <input
                                            type="checkbox"
                                            checked={showResolved}
                                            onChange={e => setShowResolved(e.target.checked)}
                                            className="w-4 h-4 rounded border-gray-300 text-role focus:ring-role-border"
                                        />
                                        Show discharged
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* ── Animal Cards Grid ─────────────────────────────── */}
                        {loading ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 gap-3">
                                <div className="w-10 h-10 border-4 border-role-border border-t-role rounded-full animate-spin" />
                                <p className="text-sm text-gray-400 font-semibold">Loading facility records...</p>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-20 gap-3">
                                <PawPrint className="w-12 h-12 text-gray-300" />
                                <p className="text-gray-400 font-semibold text-sm">No animals in holding facility.</p>
                                <p className="text-gray-300 text-xs">Animals are automatically admitted when a rescue is marked as "Picked Up".</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                                {filtered.map(animal => {
                                    const statusMeta = getStatusMeta(animal.facility_status);
                                    const days = daysSince(stayStart(animal));
                                    const remaining = daysRemaining(stayStart(animal), impoundStayDuration);
                                    const isResolved = RESOLVED_IDS.has(animal.facility_status);
                                    const isForAdoption = animal.facility_status === 6;
                                    const isOverdue = !isResolved && !isForAdoption && days >= impoundStayDuration;
                                    const isNearExpiry = !isResolved && !isForAdoption && !isOverdue && remaining <= 2;
                                    const photo = getCardPhoto(animal);

                                    return (
                                        <div
                                            key={animal.holding_id}
                                            onClick={() => openDetail(animal)}
                                            className={`bg-white rounded-2xl border hover:border-role-border transition-all duration-200 flex flex-col overflow-hidden cursor-pointer group active:scale-[0.995] ${isOverdue
                                                ? 'border-red-300 ring-1 ring-red-200'
                                                : isResolved
                                                    ? 'opacity-80 bg-gray-50/50 border-gray-200'
                                                    : isForAdoption
                                                        ? 'border-role-border'
                                                        : 'border-gray-100'
                                                }`}
                                        >
                                            {/* Banner photo with report ID / case label and the status badge */}
                                            <div className="relative w-full h-36 bg-slate-100 overflow-hidden">
                                                {photo ? (
                                                    <>
                                                        <img
                                                            src={photo.startsWith('http') ? photo : `${API_BASE_URL}${photo}`}
                                                            alt={animal.animal_name || 'Animal in facility'}
                                                            loading="lazy"
                                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                        />
                                                        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent pointer-events-none" />
                                                    </>
                                                ) : (
                                                    <div className="w-full h-full bg-gradient-to-br from-role-soft via-slate-50 to-role-muted/40 flex flex-col items-center justify-center text-gray-400">
                                                        {animalIcon(animal.animal_type, 'w-10 h-10')}
                                                        <span className="text-[10px] font-bold uppercase tracking-widest mt-1">No photo</span>
                                                    </div>
                                                )}
                                                <div className="absolute top-2 inset-x-2 flex items-start justify-between gap-2 pointer-events-none">
                                                    <span className="inline-flex items-center gap-1.5 min-w-0 px-2 py-1 rounded-lg bg-black/55 backdrop-blur-sm text-white text-[10px] font-bold">
                                                        <span className="font-mono font-black">#{animal.report_id.toString().padStart(4, '0')}</span>
                                                        <span className="truncate opacity-90">{animal.report_category || 'Rescue'}</span>
                                                    </span>
                                                    <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${statusMeta.color}`}>
                                                        {statusMeta.name}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Name and identifying details */}
                                            <div className="p-3 sm:p-4 flex-1 space-y-2.5">
                                                <div className="min-w-0">
                                                    <h3 className="font-black text-gray-900 text-base leading-tight truncate group-hover:text-role-hover transition-colors">
                                                        {animal.animal_name || `${animal.animal_type || 'Animal'} #${animal.holding_id}`}
                                                    </h3>
                                                    <p className="text-xs text-gray-500 font-semibold truncate">
                                                        {[animal.animal_type, animal.breed || 'Unknown breed', animal.color || 'Unknown color'].filter(Boolean).join(' · ')}
                                                    </p>
                                                </div>

                                                {/* Intake, stay at the current facility, and where it is */}
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2">
                                                        <p className="text-[10px] font-bold text-gray-400">Intake</p>
                                                        <p className="font-bold text-gray-800 truncate">{formatDate(animal.intake_date)}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2">
                                                        {/* the stay at the facility the animal is in now (each facility has its own clock) */}
                                                        <p className="text-[10px] font-bold text-gray-400">{animal.current_facility_level || 'Facility'} stay</p>
                                                        <p className={`font-black truncate ${isResolved ? 'text-gray-600' : isForAdoption ? 'text-role-strong' : days >= impoundStayDuration ? 'text-red-600' : 'text-gray-800'}`}>
                                                            {formatStayDuration(stayStart(animal), animal.discharge_date, isResolved, animal.current_facility_duration_display)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] text-gray-500 font-semibold flex items-center gap-1.5 min-w-0 flex-wrap">
                                                    <span className="inline-flex items-center gap-1.5 min-w-0">
                                                        <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                        <span className="truncate">{animal.facility_name || animal.report_landmark || 'Holding facility'}</span>
                                                    </span>
                                                    {animal.kennel_slot && <span className="text-gray-400">· Slot {animal.kennel_slot}</span>}
                                                    <span className="text-gray-400">· Total {formatStayDuration(animal.intake_date, animal.discharge_date, isResolved, animal.total_duration_display)}</span>
                                                    {animal.current_facility_level === 'Barangay' && animal.subd_intake_date && animal.subd_duration_display && !['0 minutes', '0 mins'].includes(animal.subd_duration_display) && (
                                                        <span className="text-amber-700">· Subd {animal.subd_duration_display}</span>
                                                    )}
                                                </p>

                                                {/* Impound deadline (one line) */}
                                                <div className="flex items-center justify-between gap-2 text-xs">
                                                    <span className="font-bold text-gray-400">Impound deadline</span>
                                                    {isResolved ? (
                                                        <span className="font-bold text-gray-500">Completed</span>
                                                    ) : isForAdoption ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-role-soft text-role-strong font-black rounded-lg border border-role-border">
                                                            <Rocket className="w-3 h-3 text-role-hover" /> In adoption catalog
                                                        </span>
                                                    ) : isOverdue ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 font-black rounded-lg border border-red-200">
                                                            <AlertTriangle className="w-3 h-3" /> Needs impound / adopt ({days}/{impoundStayDuration}d)
                                                        </span>
                                                    ) : isNearExpiry ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 font-black rounded-lg border border-amber-200">
                                                            <Clock className="w-3 h-3" /> {remaining}d left
                                                        </span>
                                                    ) : (
                                                        <span className="font-bold text-gray-700">{remaining} days left</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions, evenly sized */}
                                            <div className="px-3 pb-3 sm:px-4 sm:pb-4 flex gap-2">
                                                {isOverdue && !isSubdLeader ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                openPromoteModalForAnimal(animal);
                                                            }}
                                                            className="flex-1 h-10 inline-flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer"
                                                            title="Promote to Public Adoption Catalog"
                                                        >
                                                            <Rocket className="w-3.5 h-3.5" /> Adopt
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                openImpoundModal(animal);
                                                            }}
                                                            className="flex-1 h-10 inline-flex items-center justify-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer"
                                                            title="Officially Impound Animal"
                                                        >
                                                            <Scale className="w-3.5 h-3.5" /> Impound
                                                        </button>
                                                    </>
                                                ) : isForAdoption && !isSubdLeader ? (
                                                    <button
                                                        type="button"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            openImpoundModal(animal);
                                                        }}
                                                        className="flex-1 h-10 inline-flex items-center justify-center gap-1 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition-all cursor-pointer"
                                                        title="If not adopted, officially impound this animal"
                                                    >
                                                        <Scale className="w-3.5 h-3.5" /> Impound
                                                    </button>
                                                ) : null}
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        openDetail(animal);
                                                    }}
                                                    className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-xs font-black text-white bg-role-hover rounded-xl hover:bg-role-strong transition-all cursor-pointer"
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
                        <div className="bg-role-soft/50 border border-role-muted rounded-2xl p-3 flex items-start gap-3">
                            <div className="w-8 h-8 rounded-lg bg-role text-white flex items-center justify-center shrink-0"><Info className="w-4 h-4" /></div>
                            <div>
                                <h4 className="text-sm font-bold text-role-strong">Automatic Intake</h4>
                                <p className="text-xs text-role-strong/85 mt-1 leading-relaxed">
                                    Animals are automatically admitted when a rescue is marked as <strong>Picked Up</strong> in the Rescue Requests page.
                                    All intakes start with status <strong>Need Treatment</strong>. Update the status and add notes below to monitor the animal's progress.
                                    Setting the status to <strong>Claimed by Owner</strong>, <strong>Deceased</strong>, or <strong>Transferred to Shelter</strong> automatically closes the linked report.
                                </p>
                            </div>
                        </div>

                    </div>
                    {!isSubdLeader && <BrgyBottomNav />}
                </main>
            </div>

            {/* ─── Detail / Manage Modal ────────────────────────────────────── */}
            {selected && (() => {
                const isResolved = RESOLVED_IDS.has(selected.facility_status);
                const isForAdoptionSel = selected.facility_status === 6;
                const heldDays = daysSince(stayStart(selected));
                const isOverdueSel = !isResolved && !isForAdoptionSel && heldDays >= impoundStayDuration;
                const statusMetaSel = getStatusMeta(selected.facility_status);
                const inputCls = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:ring-2 focus:ring-role-border focus:border-role outline-none';
                const labelCls = 'text-[11px] font-bold text-gray-500 block mb-1';
                const fileCls = 'block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-black file:bg-role-soft file:text-role-hover hover:file:bg-role-muted cursor-pointer';
                return (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
                        role="dialog" aria-modal="true" aria-label="Manage animal">
                        <div className="bg-white sm:rounded-3xl shadow-2xl w-full h-full sm:h-auto max-w-2xl sm:max-h-[90vh] flex flex-col overflow-hidden sm:border border-gray-100 pt-[env(safe-area-inset-top)] sm:pt-0">

                            {/* Compact header: name + status, report # · facility, close */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                                <div className="w-9 h-9 bg-role-soft text-role-hover rounded-xl flex items-center justify-center shrink-0">
                                    {animalIcon(selected.animal_type, 'w-5 h-5')}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <h2 className="text-base font-black text-gray-900 truncate">
                                            {selected.animal_name || `${selected.animal_type || 'Animal'} #${selected.holding_id}`}
                                        </h2>
                                        <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black border ${statusMetaSel.color}`}>
                                            {statusMetaSel.name}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">Report #{selected.report_id.toString().padStart(4, '0')} · {selected.facility_name || selected.report_landmark || 'Unknown location'}</p>
                                </div>
                                <button
                                    onClick={() => setSelected(null)}
                                    className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer shrink-0"
                                    aria-label="Close"
                                >
                                    <X className="w-4.5 h-4.5" />
                                </button>
                            </div>

                            {/* Tabs */}
                            <div className="grid grid-cols-2 border-b border-gray-100" role="tablist">
                                {(['info', 'timeline'] as const).map(tab => (
                                    <button
                                        key={tab}
                                        role="tab"
                                        aria-selected={detailTab === tab}
                                        onClick={() => setDetailTab(tab)}
                                        className={`h-11 text-xs font-black transition-colors border-b-2 -mb-px cursor-pointer inline-flex items-center justify-center gap-1.5 ${detailTab === tab
                                            ? 'border-role text-role-hover'
                                            : 'border-transparent text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        {tab === 'info'
                                            ? <><ClipboardList className="w-3.5 h-3.5" /> Animal Details</>
                                            : <><Calendar className="w-3.5 h-3.5" /> Timeline ({selected.timeline.length})</>}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:px-5 custom-scrollbar">

                                {/* ── Animal Details ─────────────────────────────── */}
                                {detailTab === 'info' && (
                                    <div className="space-y-3.5">

                                        {/* Photo: the whole animal, in a shorter frame */}
                                        {(() => {
                                            // the pet record's photo when there is one; otherwise the reporter's original photo
                                            const fromPetRecord = Boolean(selected.pet_photo_url);
                                            const residentImage = getCardPhoto(selected);
                                            if (!residentImage) return null;
                                            return (
                                                <div className="relative w-full aspect-[16/10] max-h-60 rounded-2xl overflow-hidden border border-gray-100 bg-gray-100">
                                                    <img src={residentImage} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover blur-xl scale-110 opacity-40" />
                                                    <img
                                                        src={residentImage}
                                                        alt={fromPetRecord ? 'Pet record photo' : 'Original reporter photo'}
                                                        className="relative w-full h-full object-contain"
                                                    />
                                                    <span className="absolute left-2 bottom-2 px-2 py-1 rounded-lg bg-black/60 text-white text-[10px] font-bold">
                                                        {fromPetRecord ? 'Pet record photo' : 'Original reporter photo'} · Report #{selected.report_id}
                                                    </span>
                                                </div>
                                            );
                                        })()}

                                        {/* Animals in this report (tap to expand): add records per animal, replace photo */}
                                        {!isResolved && (
                                            <AnimalRecordsPanel reportId={selected.report_id} basePath="/brgy/reports" onChanged={() => fetchAll()} compact />
                                        )}

                                        {/* Facility stay */}
                                        <div className="rounded-2xl border border-role-muted bg-role-soft/40 p-3 space-y-2.5">
                                            <div className="flex items-center justify-between">
                                                <p className="text-xs font-black text-role-strong flex items-center gap-1.5">
                                                    <Timer className="w-3.5 h-3.5" /> Facility stay
                                                </p>
                                                {isResolved && (
                                                    <span className="text-[10px] font-black px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                                                        Finalized
                                                    </span>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div className="bg-white p-2.5 rounded-xl border border-role-muted/60 min-w-0">
                                                    <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1"><Home className="w-3 h-3 shrink-0" /> Subdivision</p>
                                                    <p className="text-sm font-black text-role-strong mt-0.5 truncate">
                                                        {formatDynamicDuration(selected.subd_intake_date, selected.subd_discharge_date, isResolved || !!selected.subd_discharge_date, selected.subd_duration_display)}
                                                    </p>
                                                </div>
                                                <div className="bg-white p-2.5 rounded-xl border border-role-muted/60 min-w-0">
                                                    <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" /> Barangay</p>
                                                    <p className="text-sm font-black text-role-strong mt-0.5 truncate">
                                                        {formatDynamicDuration(selected.brgy_intake_date || selected.intake_date, selected.brgy_discharge_date || selected.discharge_date, isResolved || !!selected.brgy_discharge_date, selected.brgy_duration_display)}
                                                    </p>
                                                </div>
                                                <div className="bg-role-hover text-white p-2.5 rounded-xl min-w-0">
                                                    <p className="text-[10px] font-bold text-role-soft">Total</p>
                                                    <p className="text-sm font-black mt-0.5 truncate">{formatStayDuration(selected.intake_date, selected.discharge_date, isResolved, selected.total_duration_display)}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs">
                                                <span className="text-gray-600">
                                                    Intake <strong className="text-gray-900">{formatDate(selected.intake_date)}</strong> · Limit <strong className="text-gray-900">{impoundStayDuration} days</strong>
                                                </span>
                                                {isResolved ? (
                                                    <span className="font-bold text-gray-500">Completed</span>
                                                ) : isForAdoptionSel ? (
                                                    <span className="px-2 py-0.5 rounded-lg bg-role-soft border border-role-border text-role-strong font-black inline-flex items-center gap-1">
                                                        <Rocket className="w-3 h-3" /> In adoption catalog
                                                    </span>
                                                ) : isOverdueSel ? (
                                                    <span className="px-2 py-0.5 rounded-lg bg-red-50 border border-red-200 text-red-700 font-black inline-flex items-center gap-1">
                                                        <AlertTriangle className="w-3 h-3" /> Overdue · {heldDays}/{impoundStayDuration}d
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-black">
                                                        {Math.max(0, impoundStayDuration - heldDays)}d left
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Details */}
                                        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 rounded-2xl border border-gray-100 p-3">
                                            {[
                                                { label: 'Animal type', value: selected.animal_type || '—' },
                                                { label: 'Breed', value: selected.breed || '—' },
                                                { label: 'Color', value: selected.color || '—' },
                                                { label: 'Estimated size', value: selected.estimated_size || '—' },
                                                { label: 'Kennel slot', value: selected.kennel_slot || '—' },
                                                { label: 'Current facility', value: selected.facility_name || selected.report_landmark || '—' },
                                                { label: 'Intake staff', value: selected.intake_staff_name || '—', wide: true },
                                            ].map(row => (
                                                <div key={row.label} className={`min-w-0 ${row.wide ? 'col-span-2' : ''}`}>
                                                    <dt className="text-[11px] font-bold text-gray-400">{row.label}</dt>
                                                    <dd className="text-sm font-semibold text-gray-800 break-words">{row.value}</dd>
                                                </div>
                                            ))}
                                        </dl>

                                        {/* Uploaded media & evidence */}
                                        {selected.report_media && selected.report_media.length > 0 && (
                                            <div className="space-y-2">
                                                <h3 className="text-xs font-black text-gray-700 flex items-center gap-1.5">
                                                    <Camera className="w-3.5 h-3.5" /> Uploaded media & evidence ({selected.report_media.length})
                                                </h3>
                                                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                                                    {selected.report_media.map((media, idx) => {
                                                        const isVideo = media.media_type === 'Video' || media.file_url.toLowerCase().match(/\.(mp4|mov|avi|webm)$/i);
                                                        const isDoc = media.media_type === 'Document' || media.file_url.toLowerCase().endsWith('.pdf') || media.file_url.toLowerCase().endsWith('.docx');
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={media.media_id}
                                                                onClick={() => setLightboxMedia({ mediaList: selected.report_media || [], index: idx })}
                                                                className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer group hover:border-role-border transition-all"
                                                                aria-label={`Open media ${idx + 1}`}
                                                            >
                                                                {isDoc ? (
                                                                    <span className="w-full h-full flex flex-col items-center justify-center p-1 text-center">
                                                                        <FileText className="w-6 h-6 text-gray-400" />
                                                                        <span className="text-[9px] font-bold text-gray-400 mt-0.5">Document</span>
                                                                    </span>
                                                                ) : isVideo ? (
                                                                    <span className="w-full h-full relative block">
                                                                        <video src={media.file_url} className="w-full h-full object-cover pointer-events-none" />
                                                                        <span className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                                                            <PlayCircle className="w-6 h-6 text-white drop-shadow-md" />
                                                                        </span>
                                                                    </span>
                                                                ) : (
                                                                    <img src={media.file_url} alt="Animal evidence" loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Discharge info */}
                                        {selected.discharge_date && (
                                            <div className="bg-green-50 border border-green-200 rounded-xl px-3 py-2.5">
                                                <p className="text-xs font-bold text-green-800 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Discharged on {formatDateTime(selected.discharge_date)}</p>
                                            </div>
                                        )}

                                        {/* Adoption catalog (Barangay) */}
                                        {isForAdoptionSel && (
                                            <div className="border border-role-border bg-role-soft/50 rounded-2xl p-3 space-y-2.5">
                                                <div className="flex items-start gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-role text-white flex items-center justify-center shrink-0">
                                                        <PawPrint className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-role-strong">Active in adoption catalog</p>
                                                        <p className="text-xs text-role-strong/90 mt-0.5">This animal is listed for public citizen adoption.</p>
                                                    </div>
                                                </div>
                                                {selected.adoption_catalog_notes && (
                                                    <div className="bg-white p-2.5 rounded-xl border border-role-border/80 text-xs text-role-strong">
                                                        <span className="font-bold text-role-hover text-[11px] block mb-0.5">Catalog highlights</span>
                                                        {selected.adoption_catalog_notes}
                                                    </div>
                                                )}
                                                {!isSubdLeader && (
                                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={isWithdrawing}
                                                            onClick={handleWithdrawFromAdoption}
                                                            className="h-10 bg-white hover:bg-stone-100 text-stone-700 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-stone-200 disabled:opacity-50"
                                                            title="Withdraw from public adoption catalog and return to holding custody"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5 text-stone-500" />
                                                            {isWithdrawing ? 'Withdrawing...' : 'Withdraw'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openImpoundModal(selected)}
                                                            className="h-10 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                                            title="Officially impound this animal if not adopted"
                                                        >
                                                            <Scale className="w-3.5 h-3.5" /> Impound
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate('/brgy/adoptions')}
                                                            className="h-10 bg-role hover:bg-role-hover text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                                        >
                                                            Adoptions portal →
                                                        </button>
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
                                                        className="text-xs text-role-hover hover:text-role-strong font-bold underline cursor-pointer inline-flex items-center gap-1"
                                                    >
                                                        <Pencil className="w-3 h-3" /> Edit catalog highlights
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Promote to adoption catalog (Barangay) */}
                                        {!RESOLVED_IDS.has(selected.facility_status) && !isForAdoptionSel && !isSubdLeader && (
                                            <div className="border border-emerald-200 bg-emerald-50/70 rounded-2xl p-3 space-y-2.5">
                                                <div className="flex items-start gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                                                        <Sparkles className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-emerald-950 flex items-center gap-2 flex-wrap">
                                                            Promote to adoption catalog
                                                            {heldDays >= impoundStayDuration ? (
                                                                <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full">Ready ({impoundStayDuration}+ days)</span>
                                                            ) : (
                                                                <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full">Day {heldDays} of {impoundStayDuration}</span>
                                                            )}
                                                        </p>
                                                        <p className="text-xs text-emerald-800 mt-0.5 leading-relaxed">
                                                            {heldDays >= impoundStayDuration
                                                                ? `${impoundStayDuration}-day stay limit reached. Make this pet available for public citizen adoption.`
                                                                : `Holding period in progress (stay limit: ${impoundStayDuration} days). Head Officers can promote early if medical evaluation is complete.`}
                                                        </p>
                                                    </div>
                                                </div>
                                                {(isHeadOfficer || heldDays >= impoundStayDuration) ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setPromoteNotes(selected.medical_notes || '');
                                                            setPromoteError(null);
                                                            setPromoteSuccess(null);
                                                            setPromoteModalOpen(true);
                                                        }}
                                                        className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                                    >
                                                        <Rocket className="w-3.5 h-3.5" /> Promote now
                                                    </button>
                                                ) : (
                                                    <p className="text-[11px] font-bold text-gray-500 bg-white px-3 py-2 rounded-xl border border-gray-200 text-center">
                                                        Available at {impoundStayDuration} days or with Head Officer approval
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {/* Stay limit reached (urgent): promote or impound */}
                                        {isOverdueSel && (
                                            <div className="bg-red-50 border border-red-200 rounded-2xl p-3 space-y-2.5">
                                                <div className="flex items-start gap-2.5">
                                                    <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0">
                                                        <AlertTriangle className="w-4 h-4" />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-black text-red-950">Action required · {heldDays} days held</p>
                                                        <p className="text-xs text-red-800 mt-0.5 leading-relaxed">
                                                            This animal has reached the {impoundStayDuration}-day impoundment stay limit. Make it available for public adoption or record its impoundment.
                                                        </p>
                                                    </div>
                                                </div>
                                                {!isSubdLeader && (
                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => openPromoteModalForAnimal(selected)}
                                                            className="h-10 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                                        >
                                                            <Rocket className="w-3.5 h-3.5" /> Promote
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => openImpoundModal(selected)}
                                                            className="h-10 px-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                                        >
                                                            <Scale className="w-3.5 h-3.5" /> Mark impounded
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Update condition */}
                                        {!RESOLVED_IDS.has(selected.facility_status) && (
                                            !isEditingCondition ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setIsEditingCondition(true)}
                                                    className="w-full h-11 bg-role-hover hover:bg-role-strong text-white font-black text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                    Update condition
                                                </button>
                                            ) : (
                                                <div className="border border-gray-200 rounded-2xl p-3 sm:p-4 space-y-3 bg-gray-50/60">
                                                    <h3 className="text-sm font-black text-gray-800 flex items-center gap-1.5">
                                                        <Pencil className="w-4 h-4 text-role-hover" />
                                                        Update animal condition
                                                    </h3>

                                                    <div>
                                                        <label className={labelCls}>Facility status</label>
                                                        <select
                                                            value={updateForm.facility_status}
                                                            onChange={e => setUpdateForm(f => ({ ...f, facility_status: Number(e.target.value) }))}
                                                            className={inputCls}
                                                        >
                                                            {FACILITY_STATUSES.map(s => (
                                                                <option key={s.id} value={s.id}>{s.name}</option>
                                                            ))}
                                                        </select>
                                                        {RESOLVED_IDS.has(updateForm.facility_status) && (
                                                            <p className="text-[11px] text-amber-700 font-semibold mt-1.5 flex items-start gap-1">
                                                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> This will discharge the animal and automatically close the linked report (Resolved).
                                                            </p>
                                                        )}
                                                    </div>

                                                    {isClaimingByOwner && (
                                                        <OwnerReturnPicker
                                                            value={ownerReturn}
                                                            reportId={selected.report_id}
                                                            petOwnerId={(selected as any)?.owner_id}
                                                            petId={(selected as any)?.pet_id}
                                                            registeredOwner={
                                                                ((selected as any)?.owner_id) ? {
                                                                    user_id: (selected as any).owner_id,
                                                                    name: (selected as any).owner_name || 'Registered Resident',
                                                                    phone: (selected as any).owner_phone,
                                                                    email: (selected as any).owner_email,
                                                                    address: (selected as any).owner_address,
                                                                } : null
                                                            }
                                                            petRecord={{
                                                                pet_id: (selected as any)?.pet_id || selected.holding_id,
                                                                pet_name: selected.animal_name || selected.animal_type || 'Animal',
                                                                photo_url: getAnimalPhoto(selected),
                                                                breed: selected.breed,
                                                                species: selected.animal_type || 'Animal',
                                                                color: selected.color,
                                                            }}
                                                            onChange={(v) => { setOwnerReturn(v); setUpdateError(null); }}
                                                        />
                                                    )}
                                                    {updateError && (
                                                        <p className="text-[11px] font-bold text-rose-600">{updateError}</p>
                                                    )}

                                                    <div>
                                                        <label className={labelCls}>Kennel / bay slot</label>
                                                        <input
                                                            type="text"
                                                            placeholder="e.g. B-02, Ward 3"
                                                            className={inputCls}
                                                            value={updateForm.kennel_slot}
                                                            onChange={e => setUpdateForm(f => ({ ...f, kennel_slot: e.target.value }))}
                                                        />
                                                    </div>

                                                    {/* Holding intake and custody (read-only) */}
                                                    <div className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                                                        <div className="text-gray-600">
                                                            Intake <strong className="text-gray-900">{formatDateTime(selected.intake_date)}</strong>
                                                            <span className="block">Limit <strong className="text-gray-900">{impoundStayDuration} days</strong> (Station Settings) · In custody <strong className="text-role-strong">{selected.brgy_duration_display || `${heldDays} days`}</strong></span>
                                                        </div>
                                                        {heldDays >= impoundStayDuration ? (
                                                            <span className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-black rounded-lg border border-red-200 inline-flex items-center gap-1">
                                                                <AlertTriangle className="w-3 h-3" /> Overdue
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-lg border border-emerald-200">
                                                                Active ({Math.max(0, impoundStayDuration - heldDays)}d left)
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div>
                                                        <label className={labelCls}>Medical notes</label>
                                                        <textarea
                                                            rows={2}
                                                            placeholder="Vaccination status, injuries, treatments"
                                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-role-border focus:border-role outline-none resize-none"
                                                            value={updateForm.medical_notes}
                                                            onChange={e => setUpdateForm(f => ({ ...f, medical_notes: e.target.value }))}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className={labelCls}>Update note (for the timeline)</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Optional note for this update"
                                                            className={inputCls}
                                                            value={updateForm.update_notes}
                                                            onChange={e => setUpdateForm(f => ({ ...f, update_notes: e.target.value }))}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className={labelCls}>Upload media (more proof)</label>
                                                        <div className="flex flex-col gap-2 bg-white border border-gray-200 rounded-xl p-2.5">
                                                            <input
                                                                type="file"
                                                                accept="image/*,video/*"
                                                                multiple
                                                                onChange={e => {
                                                                    if (e.target.files) {
                                                                        setUploadFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                                                                    }
                                                                }}
                                                                className={fileCls}
                                                            />
                                                            {uploadFiles.length > 0 && (
                                                                <div className="space-y-1.5 border-t border-gray-100 pt-2">
                                                                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                                                                        <span>Selected files ({uploadFiles.length})</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setUploadFiles([])}
                                                                            className="text-red-500 hover:text-red-600 font-bold cursor-pointer"
                                                                        >
                                                                            Clear all
                                                                        </button>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-28 overflow-y-auto custom-scrollbar">
                                                                        {uploadFiles.map((file, idx) => (
                                                                            <div key={idx} className="flex items-center justify-between bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100 text-[11px] text-gray-600">
                                                                                <span className="truncate flex-1 pr-1 inline-flex items-center gap-1"><Paperclip className="w-3 h-3 shrink-0" /> {file.name}</span>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setUploadFiles(prev => prev.filter((_, i) => i !== idx))}
                                                                                    className="w-6 h-6 inline-flex items-center justify-center text-red-500 hover:text-red-700 shrink-0 cursor-pointer"
                                                                                    aria-label={`Remove ${file.name}`}
                                                                                >
                                                                                    <X className="w-3.5 h-3.5" />
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2 pt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsEditingCondition(false)}
                                                            className="h-11 bg-white border border-gray-200 hover:bg-gray-100 text-gray-700 text-sm font-bold rounded-xl transition-colors cursor-pointer"
                                                        >
                                                            Cancel
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={handleUpdate}
                                                            disabled={isUpdating}
                                                            className="h-11 bg-role-hover hover:bg-role-strong disabled:bg-role-muted text-white text-sm font-black rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                                        >
                                                            {isUpdating ? (
                                                                <>
                                                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                                    Saving...
                                                                </>
                                                            ) : 'Save changes'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )
                                        )}

                                    </div>
                                )}

                                {/* ── Timeline ───────────────────────────────────── */}
                                {detailTab === 'timeline' && (
                                    <div className="space-y-4">

                                        {/* Add an entry */}
                                        {!RESOLVED_IDS.has(selected.facility_status) && (
                                            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 space-y-2.5">
                                                <h3 className="text-xs font-black text-gray-700">Add timeline entry</h3>
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <select
                                                        value={timelineForm.event_type}
                                                        onChange={e => setTimelineForm(f => ({ ...f, event_type: e.target.value }))}
                                                        className="h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-role-border focus:border-role outline-none sm:w-44"
                                                    >
                                                        <option value="observation">Observation</option>
                                                        <option value="medical">Medical</option>
                                                        <option value="treatment">Treatment</option>
                                                        <option value="status_change">Status Change</option>
                                                    </select>
                                                    <input
                                                        type="text"
                                                        placeholder="Title / summary"
                                                        className="flex-1 h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-role-border focus:border-role outline-none"
                                                        value={timelineForm.title}
                                                        onChange={e => setTimelineForm(f => ({ ...f, title: e.target.value }))}
                                                    />
                                                </div>
                                                <textarea
                                                    rows={2}
                                                    placeholder="Detailed notes"
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-role-border focus:border-role outline-none resize-none"
                                                    value={timelineForm.notes}
                                                    onChange={e => setTimelineForm(f => ({ ...f, notes: e.target.value }))}
                                                />

                                                <div>
                                                    <label className={`${labelCls} flex items-center gap-1`}><Paperclip className="w-3 h-3" /> Attach media (optional)</label>
                                                    <div className="flex flex-col gap-2 bg-white border border-gray-200 rounded-xl p-2.5">
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
                                                            className={fileCls}
                                                        />
                                                        {timelineFiles.length > 0 && (
                                                            <div className="space-y-1.5 border-t border-gray-100 pt-2">
                                                                <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                                                                    <span>{timelineFiles.length} file{timelineFiles.length !== 1 ? 's' : ''} selected</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setTimelineFiles([])}
                                                                        className="text-red-500 hover:text-red-600 font-bold cursor-pointer"
                                                                    >Clear all</button>
                                                                </div>
                                                                <div className="flex flex-col gap-1 max-h-24 overflow-y-auto custom-scrollbar">
                                                                    {timelineFiles.map((file, idx) => (
                                                                        <div key={idx} className="flex items-center justify-between bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100 text-[11px] text-gray-600">
                                                                            <span className="truncate flex-1 pr-1 inline-flex items-center gap-1"><Paperclip className="w-3 h-3 shrink-0" /> {file.name}</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setTimelineFiles(prev => prev.filter((_, i) => i !== idx))}
                                                                                className="w-6 h-6 inline-flex items-center justify-center text-red-500 shrink-0 cursor-pointer"
                                                                                aria-label={`Remove ${file.name}`}
                                                                            ><X className="w-3.5 h-3.5" /></button>
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
                                                    className="w-full h-10 bg-role-hover hover:bg-role-strong disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-black rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                                >
                                                    {isAddingTimeline ? (
                                                        <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Uploading & saving...</>
                                                    ) : '+ Add entry'}
                                                </button>
                                            </div>
                                        )}

                                        {/* Entries */}
                                        {selected.timeline.length === 0 ? (
                                            <div className="text-center py-10 text-gray-400 text-sm">No timeline entries yet.</div>
                                        ) : (
                                            <div className="relative">
                                                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100" />
                                                <div className="space-y-3">
                                                    {[...selected.timeline].reverse().map((log) => {
                                                        const meta = EVENT_TYPE_META[log.event_type] || EVENT_TYPE_META['observation'];
                                                        return (
                                                            <div key={log.log_id} className="flex gap-3 relative">
                                                                <div className={`w-8 h-8 rounded-lg ${meta.color} flex items-center justify-center text-sm shrink-0 z-10`}>
                                                                    {meta.icon}
                                                                </div>
                                                                <div className="flex-1 min-w-0 bg-white border border-gray-100 rounded-xl p-3">
                                                                    <div className="flex items-start justify-between gap-2">
                                                                        <p className="text-sm font-bold text-gray-900 break-words">{log.title}</p>
                                                                        <span className="text-[10px] text-gray-400 whitespace-nowrap shrink-0">{formatDateTime(log.logged_at)}</span>
                                                                    </div>
                                                                    {log.notes && <p className="text-xs text-gray-500 mt-1 leading-relaxed break-words">{log.notes}</p>}
                                                                    {log.staff_name && (
                                                                        <p className="text-[11px] text-gray-400 mt-1.5 flex items-center gap-1">
                                                                            <User className="w-3 h-3" /> {log.staff_name}
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
                            Promoting <strong className="text-gray-900">{selected.animal_name || `Animal #${selected.holding_id}`}</strong> will set its status to <strong className="text-role-strong font-bold">For Adoption</strong> and publish its profile to the citizen <strong>Adopt a Pet</strong> catalog.
                        </p>

                        {daysSince(stayStart(selected)) < impoundStayDuration && (
                            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-xs flex items-start gap-2.5 animate-in fade-in">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-black text-amber-950 uppercase tracking-tight text-[11px]">Early Promotion Authorization</p>
                                    <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                                        The configured <strong>{impoundStayDuration}-day stay limit</strong> has not elapsed yet ({selected.brgy_duration_display || `${daysSince(stayStart(selected))} days`} in custody).
                                        As a Head Officer, publishing now will bypass the holding stay limit and make this animal publicly available for adoption immediately.
                                    </p>
                                </div>
                            </div>
                        )}

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
                                className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs text-gray-800 focus:ring-2 focus:ring-role-border focus:border-role outline-none resize-none"
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
                                                className="flex-1 py-3 px-4 bg-role-hover hover:bg-role-strong text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-role-muted text-center"
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
            {quickImpoundAnimal && (() => {
                const stayDays = daysSince(stayStart(quickImpoundAnimal));
                const isUnderStayLimit = stayDays < impoundStayDuration;
                const canProceed = !isUnderStayLimit || (isHeadOfficer && earlyImpoundAcknowledged);
                const animalPhoto = getCardPhoto(quickImpoundAnimal);

                return (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
                        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-gray-150 max-h-[90vh] overflow-y-auto">
                            {/* Modal Header */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 shadow-2xs">
                                        <Scale className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-black text-gray-900">
                                            Confirm Official Impoundment
                                        </h3>
                                        <p className="text-xs text-gray-500 font-semibold">
                                            Report #{quickImpoundAnimal.report_id.toString().padStart(4, '0')} • {quickImpoundAnimal.animal_name || `${quickImpoundAnimal.animal_type || 'Animal'} #${quickImpoundAnimal.holding_id}`}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setQuickImpoundAnimal(null)}
                                    disabled={isQuickImpounding}
                                    className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Animal Mini Card */}
                            <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200/80 flex items-center gap-3">
                                <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-200 shrink-0 border border-gray-300">
                                    {animalPhoto ? (
                                        <img
                                            src={animalPhoto.startsWith('http') ? animalPhoto : `${API_BASE_URL}${animalPhoto}`}
                                            alt={quickImpoundAnimal.animal_name || 'Animal'}
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-500">
                                            {animalIcon(quickImpoundAnimal.animal_type, 'w-6 h-6')}
                                        </div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1 text-xs">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="font-black text-gray-800 truncate">
                                            {quickImpoundAnimal.animal_name || 'Animal'}
                                        </span>
                                        <span className="text-gray-400 font-semibold">•</span>
                                        <span className="text-gray-600 font-medium">
                                            {quickImpoundAnimal.breed || 'Unknown Breed'} ({quickImpoundAnimal.color || 'Unknown Color'})
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                                        <span>Intake: <strong>{formatDate(quickImpoundAnimal.intake_date)}</strong></span>
                                        <span>•</span>
                                        <span>Current Stay: <strong className={isUnderStayLimit ? 'text-amber-700' : 'text-red-700'}>{formatStayDuration(quickImpoundAnimal.intake_date, quickImpoundAnimal.discharge_date, false, quickImpoundAnimal.total_duration_display)}</strong></span>
                                    </div>
                                </div>
                            </div>

                            {/* Stay Limit Assessment & Rules */}
                            {isUnderStayLimit ? (
                                isHeadOfficer ? (
                                    <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-2xl text-xs space-y-2">
                                        <div className="flex items-start gap-2 text-amber-900 font-black">
                                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                            <span>Early Impoundment Authorization Required</span>
                                        </div>
                                        <p className="text-[11px] text-amber-800 leading-relaxed">
                                            This animal has only stayed for <strong>{formatStayDuration(quickImpoundAnimal.intake_date, quickImpoundAnimal.discharge_date, false, quickImpoundAnimal.total_duration_display)}</strong> ({stayDays} of the {impoundStayDuration}-day mandatory stay limit).
                                            As a Head Officer / Admin, you have authority to approve early impoundment.
                                        </p>
                                        <label className="flex items-start gap-2 pt-1.5 border-t border-amber-200/80 cursor-pointer text-[11px] text-amber-950 font-bold">
                                            <input
                                                type="checkbox"
                                                checked={earlyImpoundAcknowledged}
                                                onChange={e => setEarlyImpoundAcknowledged(e.target.checked)}
                                                className="mt-0.5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                                            />
                                            <span>I authorize early official impoundment before the {impoundStayDuration}-day stay limit expires.</span>
                                        </label>
                                    </div>
                                ) : (
                                    <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-2xl text-xs space-y-2">
                                        <div className="flex items-start gap-2 text-rose-900 font-black">
                                            <AlertOctagon className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                            <span>Holding Stay Limit Not Reached</span>
                                        </div>
                                        <p className="text-[11px] text-rose-800 leading-relaxed">
                                            This animal has stayed for <strong>{formatStayDuration(quickImpoundAnimal.intake_date, quickImpoundAnimal.discharge_date, false, quickImpoundAnimal.total_duration_display)}</strong>. Under facility policy, rescued animals must remain in temporary holding for at least <strong>{impoundStayDuration} days</strong> before official impoundment.
                                        </p>
                                        <p className="text-[10px] text-rose-700 font-bold">
                                            Only a designated Head Officer can authorize premature impoundment.
                                        </p>
                                    </div>
                                )
                            ) : (
                                <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl text-xs space-y-1 text-emerald-900">
                                    <div className="flex items-center gap-2 font-black">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <span>Stay Limit Threshold Elapsed</span>
                                    </div>
                                    <p className="text-[11px] text-emerald-800 leading-relaxed">
                                        This animal has been held for <strong>{stayDays} days</strong>, meeting or exceeding the {impoundStayDuration}-day threshold. It is eligible for official impoundment.
                                    </p>
                                </div>
                            )}

                            {/* Impoundment Notes Input */}
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-1">
                                    Impoundment Notes & Destination / Reason (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. Transferred to Barangay San Vicente Animal Impound Facility; persistent unclaimed stray..."
                                    value={impoundNotes}
                                    onChange={e => setImpoundNotes(e.target.value)}
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:bg-white focus:ring-2 focus:ring-amber-200 outline-none resize-none"
                                />
                            </div>

                            {/* Consequence callout */}
                            <div className="text-[11px] text-gray-500 bg-gray-50/70 p-2.5 rounded-xl border border-gray-150 leading-relaxed">
                                <strong>What happens next:</strong> The animal's status will update to <strong>Impounded</strong>, custody will transfer to official impound logs, and the linked incident report will be resolved.
                            </div>

                            {/* Actions */}
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
                                    disabled={isQuickImpounding || !canProceed}
                                    className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer"
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
                );
            })()}
        </div>
    );
};

export default BrgyHoldingFacility;
