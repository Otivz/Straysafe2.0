import { useState, useEffect, useCallback, useMemo } from 'react';
import AnimalRecordsPanel from '../../components/AnimalRecordsPanel';
import type { ReactNode } from 'react';
import {
    PawPrint, Truck, MapPin, RefreshCw, Pill, Stethoscope, ClipboardList,
    CheckCircle2, Cat, Dog, AlertTriangle, ScrollText, PartyPopper, Tag,
    Building2, User, Phone, Info, Timer, X, Hourglass, Home, Camera,
    FileText, PlayCircle, Paperclip, Calendar, Eye, Pencil, SlidersHorizontal, ChevronDown
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
    facility_intake_date?: string | null;   // stay-limit clock start at the current facility
    original_photo_url?: string | null;
    pet_photo_url?: string | null;   // photo from the animal's pet record
    report_status_id?: number | null;
    custody_status?: string | null;
    is_escalated?: boolean;
    escalation_status?: string | null;
    timeline: TimelineEntry[];
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
}

// ─── Constants ────────────────────────────────────────────────────────────────

const IMPOUND_DAYS = 0; // Temporarily 0 for testing

const FACILITY_STATUSES = [
    { id: 1, name: 'Need Treatment', color: 'bg-red-50 text-red-600 border-red-200' },
    { id: 2, name: 'Healthy', color: 'bg-green-50 text-green-600 border-green-200' },
    { id: 3, name: 'Claimed by Owner', color: 'bg-blue-50 text-blue-600 border-blue-200' },
    { id: 4, name: 'Deceased', color: 'bg-gray-100 text-gray-500 border-gray-200' },
    { id: 5, name: 'Transferred to Shelter', color: 'bg-purple-50 text-purple-600 border-purple-200' },
    { id: 6, name: 'For Adoption', color: 'bg-teal-50 text-teal-600 border-teal-200' },
    { id: 7, name: 'Adopted/Released', color: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
    { id: 8, name: 'Impounded', color: 'bg-amber-50 text-amber-600 border-amber-200' },
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

function daysSince(dateStr: string | null): number {
    if (!dateStr) return 0;
    const ms = Date.now() - new Date(dateStr).getTime();
    return Math.floor(ms / (1000 * 60 * 60 * 24));
}

// Each holding facility has its own stay clock: it restarts when the animal moves to another facility
function stayStart(a: { facility_intake_date?: string | null; intake_date: string | null }): string | null {
    return a.facility_intake_date || a.intake_date;
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
    if (type?.toLowerCase().includes('cat')) return <Cat className={className} />;
    if (type?.toLowerCase().includes('dog')) return <Dog className={className} />;
    return <PawPrint className={className} />;
}

function sanitizePhotoUrl(url: string | undefined | null): string | undefined {
    if (!url) return undefined;
    if (url.includes('original_reporter_dog.jpg') || url.includes('res.cloudinary.com/test')) {
        return 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop&q=80';
    }
    return url;
}

// Cards show the animal's photo from its pet record; the report's submitted photo is the fallback
function getCardPhoto(animal: HoldingAnimal): string | undefined {
    return sanitizePhotoUrl(animal.pet_photo_url) || getAnimalPhoto(animal);
}

function getAnimalPhoto(animal: HoldingAnimal): string | undefined {
    // 0. Primary: Explicit original photo resolved by backend from initial report submission
    if (animal.original_photo_url) return sanitizePhotoUrl(animal.original_photo_url);

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
        return sanitizePhotoUrl(initialReportImages[0].file_url);
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
        return sanitizePhotoUrl(anyInitialMedia[0].file_url);
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
        return sanitizePhotoUrl(nonEvidenceMedia[0].file_url);
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
        return sanitizePhotoUrl(anyImageMedia[0].file_url);
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
                if (img?.file_url) return sanitizePhotoUrl(img.file_url);
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
    // The subdivision does not hold animals: the page opens on the Barangay holding place. The 'active' tab (a
    // subdivision pen) only appears while an animal is still in one from before.
    const [tabMode, setTabMode] = useState<'active' | 'barangay' | 'history'>('barangay');
    // Every animal at the Barangay holding place (all subdivisions of the leader's barangay)
    const [barangayHeld, setBarangayHeld] = useState<HoldingAnimal[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState(0); // 0 = All
    const [showResolved, setShowResolved] = useState(false);
    const [showFilters, setShowFilters] = useState(false);          // the collapsible filter panel
    const [overdueExpanded, setOverdueExpanded] = useState(false);  // the stay-limit warning details
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    // Stay duration before handover / impoundment limit (in days)
    const [impoundStayDuration, setImpoundStayDuration] = useState<number>(() => {
        const saved = localStorage.getItem('subd_holding_stay_duration');
        if (saved) {
            const parsed = parseInt(saved, 10);
            if (!isNaN(parsed) && parsed >= 0 && parsed <= 90) return parsed;
        }
        return 0;
    });

    const handleDurationChange = (newVal: number) => {
        const clamped = Math.max(0, Math.min(90, isNaN(newVal) ? 0 : newVal));
        setImpoundStayDuration(clamped);
        localStorage.setItem('subd_holding_stay_duration', String(clamped));
    };

    // Periodic refresh for live stay durations (ticks every 10s for real-time live clock updates)
    const [, setStayTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setStayTick(t => t + 1), 10000);
        return () => clearInterval(interval);
    }, []);

    // Selected animal detail modal
    const [selected, setSelected] = useState<HoldingAnimal | null>(null);
    const [detailTab, setDetailTab] = useState<'info' | 'timeline'>('info');

    // Update modal & form state
    const [isUpdating, setIsUpdating] = useState(false);
    const [isEditingCondition, setIsEditingCondition] = useState(false);
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

    // Escalate to Barangay state
    const [barangayFacilities, setBarangayFacilities] = useState<FacilityOption[]>([]);
    const [escalateModalOpen, setEscalateModalOpen] = useState(false);
    const [animalToEscalate, setAnimalToEscalate] = useState<HoldingAnimal | null>(null);
    const [selectedBrgyFacilityId, setSelectedBrgyFacilityId] = useState<number | ''>('');
    const [escalateReason, setEscalateReason] = useState('Stay limit reached in subdivision temporary shelter; transferring to municipal Barangay shelter for impoundment and veterinary care.');
    const [escalateNotes, setEscalateNotes] = useState('');
    const [isEscalating, setIsEscalating] = useState(false);
    const [endorsementFile, setEndorsementFile] = useState<File | null>(null);

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

                // Fetch Barangay holding facilities for escalation
                const brgyRes = await api.get('/landmarks?is_holding_facility=true&barangay_only=true');
                if (Array.isArray(brgyRes.data)) {
                    setBarangayFacilities(brgyRes.data);
                }
            } catch (e) {
                console.error('Error fetching subdivision holding places:', e);
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

            const [res, brgyRes] = await Promise.allSettled([
                api.get('/holding/', { params }),
                // Everything held at the Barangay holding place of this leader's barangay (read-only for the leader)
                api.get('/holding/', { params: { barangay_only: true } }),
            ]);
            if (res.status === 'fulfilled') setAnimals(res.value.data || []);
            if (brgyRes.status === 'fulfilled') setBarangayHeld(brgyRes.value.data || []);
        } catch (err) {
            console.error('Error fetching subdivision holding place data:', err);
        } finally {
            setLoading(false);
        }
    }, [subdivisionId, selectedFacilityId]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // ── Separate Active vs History Animals ─────────────────────────────────────
    const isCurrentlyInSubd = useCallback((a: HoldingAnimal) => {
        if (RESOLVED_IDS.has(a.facility_status)) return false;
        if (a.discharge_date) return false;
        if (a.report_status_id && [9, 10, 11, 12, 14, 17, 18].includes(a.report_status_id)) return false;
        if (a.custody_status && ['claimed', 'released', 'deceased', 'impounded', 'adopted'].some(s => a.custody_status?.toLowerCase().includes(s))) return false;
        if (a.facility_type === 'barangay_facility' || (a.facility_name && a.facility_name.toLowerCase().includes('barangay'))) {
            return false;
        }
        if (facilities.length > 0) {
            if (!a.facility_id) return false;
            return facilities.some(f => f.landmark_id === a.facility_id);
        }
        return Boolean(a.facility_id);
    }, [facilities]);

    // Animals from this subdivision now held at a Barangay holding place (not discharged, not closed): the leader
    // follows them read-only. Held = Need Treatment, Healthy, For Adoption or Impounded, as in the analytics.
    const isHeldAtBarangay = useCallback((a: HoldingAnimal) => {
        const atBarangay = a.facility_type === 'barangay_facility' || Boolean(a.facility_name && a.facility_name.toLowerCase().includes('barangay'));
        if (!atBarangay || a.discharge_date) return false;
        if (a.report_status_id && [9, 10, 11, 12, 14, 17, 18].includes(a.report_status_id)) return false;
        return [1, 2, 6, 8].includes(a.facility_status);
    }, []);

    const activeAnimals = useMemo(() => animals.filter(isCurrentlyInSubd), [animals, isCurrentlyInSubd]);
    // Leave the earlier-pen tab once its last animal is gone
    useEffect(() => {
        if (tabMode === 'active' && activeAnimals.length === 0) setTabMode('barangay');
    }, [tabMode, activeAnimals.length]);
    // The "At Barangay" tab lists everything the Barangay holds, from every subdivision; own animals are tagged
    const barangayAnimals = useMemo(() => barangayHeld.filter(isHeldAtBarangay), [barangayHeld, isHeldAtBarangay]);
    const historyAnimals = useMemo(() => animals.filter(a => !isCurrentlyInSubd(a) && !isHeldAtBarangay(a)), [animals, isCurrentlyInSubd, isHeldAtBarangay]);

    // ── Filter Animals ─────────────────────────────────────────────────────────
    const currentList = tabMode === 'active' ? activeAnimals : tabMode === 'barangay' ? barangayAnimals : historyAnimals;

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
        return activeAnimals.filter(a => daysSince(stayStart(a)) >= impoundStayDuration);
    }, [activeAnimals, impoundStayDuration]);

    const nearingAnimals = useMemo(() => {
        return activeAnimals.filter(a => {
            const days = daysSince(stayStart(a));
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
        // Transferred = every animal of this subdivision that went to a Barangay holding place, still there or not
        const transferredCount = animals.filter(a => a.facility_type === 'barangay_facility' || a.facility_name?.toLowerCase().includes('barangay')).length;

        return {
            activeTotal: activeAnimals.length,
            needTreatment,
            healthy,
            nearingExpiry,
            needsTransfer,
            pastTotal: historyAnimals.length,
            transferredToBrgy: transferredCount,
        };
    }, [animals, activeAnimals, historyAnimals, overdueAnimals, nearingAnimals]);

    // ── Open Detail Modal ──────────────────────────────────────────────────────
    const openDetail = async (animal: HoldingAnimal) => {
        setIsEditingCondition(false);
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

    // ── Escalate to Barangay Handlers ──────────────────────────────────────────
    const handleOpenEscalate = (animal: HoldingAnimal, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setAnimalToEscalate(animal);
        if (barangayFacilities.length > 0) {
            setSelectedBrgyFacilityId(barangayFacilities[0].landmark_id);
        } else {
            setSelectedBrgyFacilityId('');
        }
        setEscalateReason('Stay limit reached in subdivision temporary shelter; transferring to municipal Barangay shelter for impoundment and veterinary care.');
        setEscalateNotes('');
        setEndorsementFile(null);
        setEscalateModalOpen(true);
    };

    const handleConfirmEscalate = async () => {
        if (!animalToEscalate) return;
        if (!endorsementFile) {
            alert('Please select an endorsement letter file.');
            return;
        }
        setIsEscalating(true);
        try {
            // 1. Upload the endorsement letter as report evidence (same as Report escalation).
            //    The escalate endpoint attaches the latest evidence file to the Endorsement Letter.
            const letterForm = new FormData();
            letterForm.append('file', endorsementFile);
            letterForm.append('is_evidence', 'true');
            await api.post(`/reports/${animalToEscalate.report_id}/media`, letterForm, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            // 2. Escalate custody to Barangay
            await api.post(`/holding/${animalToEscalate.holding_id}/escalate`, {
                barangay_facility_id: selectedBrgyFacilityId ? Number(selectedBrgyFacilityId) : undefined,
                reason: escalateReason.trim() || undefined,
                notes: escalateNotes.trim() || undefined,
            });

            setEscalateModalOpen(false);
            setAnimalToEscalate(null);
            setEndorsementFile(null);
            if (selected?.holding_id === animalToEscalate.holding_id) {
                setSelected(null);
            }
            await fetchAll();
        } catch (err: any) {
            console.error('Error escalating animal to barangay:', err);
            alert(err.response?.data?.detail || 'Failed to escalate animal to Barangay.');
        } finally {
            setIsEscalating(false);
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
            setIsEditingCondition(false);
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

    // Manage dialog open: the page behind doesn't scroll
    useEffect(() => {
        if (!selected) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, [selected]);

    const metricCards = tabMode === 'active' ? [
        {
            label: 'Total Animals Held',
            value: computedMetrics.activeTotal,
            icon: PawPrint,
            color: 'bg-role-soft text-role-hover',
            border: 'border-role-muted',
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
            color: 'bg-role-soft text-role-hover',
            border: 'border-role-muted',
        },
    ] : tabMode === 'barangay' ? [
        {
            label: 'Held at Barangay',
            value: barangayAnimals.length,
            icon: Building2,
            color: 'bg-role-soft text-role-hover',
            border: 'border-role-muted',
        },
        {
            label: 'Need Treatment',
            value: barangayAnimals.filter(a => a.facility_status === 1).length,
            icon: Pill,
            color: 'bg-red-50 text-red-600',
            border: 'border-red-100',
        },
        {
            label: 'Healthy / Monitored',
            value: barangayAnimals.filter(a => a.facility_status === 2).length,
            icon: CheckCircle2,
            color: 'bg-emerald-50 text-emerald-600',
            border: 'border-emerald-100',
        },
        {
            label: 'For Adoption',
            value: barangayAnimals.filter(a => a.facility_status === 6).length,
            icon: Home,
            color: 'bg-teal-50 text-teal-600',
            border: 'border-teal-100',
        },
        {
            label: 'Impounded',
            value: barangayAnimals.filter(a => a.facility_status === 8).length,
            icon: AlertTriangle,
            color: 'bg-amber-50 text-amber-600',
            border: 'border-amber-100',
        },
    ] : [
        {
            label: 'Total Past Records',
            value: computedMetrics.pastTotal,
            icon: ScrollText,
            color: 'bg-role-soft text-role-hover',
            border: 'border-role-muted',
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
            color: 'bg-role-soft text-role-hover',
            border: 'border-role-muted',
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
                                Barangay Holding Place
                            </h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Animals held at the Barangay · view only
                            </p>
                        </div>
                    }
                />

                <main className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 md:p-8 pb-36 md:pb-8 custom-scrollbar">
                    <div className="max-w-7xl mx-auto space-y-3 sm:space-y-4">

                        {/* ── Heading + facility selector ── */}
                        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2.5">
                            <div className="min-w-0 md:hidden">
                                <h1 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight leading-tight">Barangay Holding Place</h1>
                                <p className="text-xs font-semibold text-gray-500">Every animal held at the Barangay. The subdivision does not hold animals.</p>
                            </div>
                            {tabMode === 'active' && (
                            <label className="relative block sm:w-72 shrink-0 md:ml-auto">
                                <span className="sr-only">Holding place</span>
                                <Building2 className="w-4 h-4 text-role-hover absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                                <select
                                    value={selectedFacilityId}
                                    onChange={e => setSelectedFacilityId(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                    className="w-full h-10 pl-9 pr-8 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-800 focus:ring-2 focus:ring-role-border outline-none appearance-none cursor-pointer"
                                >
                                    <option value="all">All holding places</option>
                                    {facilities.map(f => (
                                        <option key={f.landmark_id} value={f.landmark_id}>{f.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </label>
                            )}
                        </div>

                        {/* Selected facility: caretaker, phone, occupancy on one line */}
                        {activeFacility && tabMode === 'active' && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 bg-role-soft/50 border border-role-muted rounded-xl px-3 py-2">
                                <span className="inline-flex items-center gap-1 min-w-0"><User className="w-3.5 h-3.5 text-role-hover shrink-0" /> <strong className="text-gray-800 truncate">{activeFacility.contact_person || 'Subdivision Leader / Security'}</strong></span>
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

                        {/* ── Stay-limit warning (compact; details expand) ── */}
                        {overdueAnimals.length > 0 && tabMode === 'active' && (
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
                                        <span className="block text-xs font-semibold text-red-800/90">Handover to the Barangay is advised</span>
                                    </span>
                                    <ChevronDown className={`w-5 h-5 text-red-700 shrink-0 transition-transform ${overdueExpanded ? 'rotate-180' : ''}`} />
                                </button>

                                {overdueExpanded && (
                                    <div className="px-3 pb-3 space-y-2">
                                        <p className="text-xs text-red-900/90 leading-relaxed">
                                            {overdueAnimals.length === 1 ? '1 animal has' : `${overdueAnimals.length} animals have`} reached or exceeded the {impoundStayDuration}-day temporary holding limit. Animals past temporary subdivision holding should be transferred to the Barangay shelter for impoundment or official adoption listing.
                                        </p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                                            {overdueAnimals.map((animal) => {
                                                const days = daysSince(stayStart(animal));
                                                const overDays = days - impoundStayDuration;
                                                const thumbImg = getCardPhoto(animal);
                                                return (
                                                    <div key={animal.holding_id} className="bg-white rounded-xl border border-red-100 p-2 flex items-center gap-2.5">
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
                                                        <button
                                                            type="button"
                                                            onClick={() => openDetail(animal)}
                                                            className="h-9 px-3 shrink-0 bg-role-hover hover:bg-role-strong text-white text-[11px] font-black rounded-lg transition-all cursor-pointer"
                                                        >
                                                            View Record
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Segmented tabs ── */}
                        <div className={`grid ${activeAnimals.length > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-1 p-1 bg-gray-100 rounded-2xl`} role="tablist">
                            {([
                                { key: 'barangay' as const, short: 'At Barangay', long: 'At Barangay Holding Place', count: barangayAnimals.length, icon: Building2 },
                                ...(activeAnimals.length > 0 ? [{ key: 'active' as const, short: 'Earlier Pen', long: 'Earlier Subdivision Pen', count: activeAnimals.length, icon: PawPrint }] : []),
                                { key: 'history' as const, short: 'History', long: 'Past Records', count: historyAnimals.length, icon: ScrollText },
                            ]).map((t) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={tabMode === t.key}
                                    onClick={() => setTabMode(t.key)}
                                    className={`h-10 rounded-xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                        tabMode === t.key ? 'bg-white text-role-hover shadow-2xs' : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    <t.icon className="w-3.5 h-3.5" />
                                    <span className="sm:hidden">{t.short}</span>
                                    <span className="hidden sm:inline">{t.long}</span>
                                    <span className={`min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${tabMode === t.key ? 'bg-role-soft text-role-hover' : 'bg-gray-200 text-gray-600'}`}>
                                        {t.count}
                                    </span>
                                </button>
                            ))}
                        </div>

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
                                        placeholder="Search name, breed, landmark, report #"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                        className="w-full h-11 pl-9 pr-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 placeholder:text-gray-400 focus:ring-2 focus:ring-role-border outline-none"
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
                                            <option value={0}>All health statuses</option>
                                            {FACILITY_STATUSES.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                    </label>

                                    {tabMode === 'active' && (
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
                                    )}

                                    {tabMode === 'active' && (
                                        <label className="flex items-center gap-2.5 h-10 sm:mt-5 px-3 rounded-xl bg-gray-50 border border-gray-200 text-sm font-semibold text-gray-700 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={showResolved}
                                                onChange={e => setShowResolved(e.target.checked)}
                                                className="w-4 h-4 rounded border-gray-300 text-role-hover focus:ring-role"
                                            />
                                            Show discharged / claimed
                                        </label>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Animals Grid (Modern Barangay-Aligned Card Design) ── */}
                        {loading ? (
                            <div className="p-12 text-center text-gray-400 font-bold">
                                Loading holding place records...
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-3">
                                <div className="flex justify-center text-gray-300">{tabMode === 'active' ? <PawPrint className="w-10 h-10" /> : tabMode === 'barangay' ? <Building2 className="w-10 h-10" /> : <ScrollText className="w-10 h-10" />}</div>
                                <p className="text-base font-black text-gray-700">
                                    {tabMode === 'active'
                                        ? 'No animals currently held in the subdivision shelter'
                                        : tabMode === 'barangay'
                                            ? 'No animals from your subdivision are at the Barangay holding place'
                                            : 'No past or transferred animals found in history'}
                                </p>
                                <p className="text-xs text-gray-400">
                                    {tabMode === 'active'
                                        ? 'Animals admitted to the subdivision shelter or secured here will appear here.'
                                        : tabMode === 'barangay'
                                            ? 'Animals your subdivision transferred to the Barangay appear here while they are held there. You can follow their status; the Barangay manages their care.'
                                            : 'Animals transferred to Barangay facilities or resolved will be archived in this history view.'}
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                                {filtered.map((animal) => {
                                    const statusMeta = getStatusMeta(animal.facility_status);
                                    const days = daysSince(stayStart(animal));
                                    const remaining = daysRemaining(stayStart(animal), impoundStayDuration);
                                    const isResolved = RESOLVED_IDS.has(animal.facility_status);
                                    const isTransferredToBrgy = animal.facility_type === 'barangay_facility' || (animal.facility_name && animal.facility_name.toLowerCase().includes('barangay'));
                                    const isHistoryItem = !isCurrentlyInSubd(animal);
                                    const isOverdue = !isResolved && !isTransferredToBrgy && days >= impoundStayDuration;
                                    const isNearExpiry = !isResolved && !isOverdue && remaining <= 2;
                                    const photo = getCardPhoto(animal);

                                    return (
                                        <div
                                            key={animal.holding_id}
                                            onClick={() => openDetail(animal)}
                                            className={`bg-white rounded-2xl border hover:border-role-border transition-all duration-200 flex flex-col overflow-hidden cursor-pointer group active:scale-[0.995] ${
                                                isOverdue
                                                    ? 'border-red-300 ring-1 ring-red-200'
                                                    : isResolved
                                                        ? 'opacity-80 bg-gray-50/50 border-gray-200'
                                                        : isHistoryItem
                                                            ? 'border-role-border/70'
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
                                                        <span className="truncate opacity-90">{animal.report_category || 'Temporary Holding'}</span>
                                                    </span>
                                                    {isTransferredToBrgy && tabMode !== 'barangay' ? (
                                                        <span className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide bg-white/95 text-role-strong">
                                                            In Brgy Holding
                                                        </span>
                                                    ) : tabMode === 'barangay' ? (
                                                        /* At Barangay tab: the animal's live status there */
                                                        <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${statusMeta.color}`}>
                                                            {statusMeta.name}
                                                        </span>
                                                    ) : animal.is_escalated ? (
                                                        <span className="shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide bg-amber-500 text-white inline-flex items-center gap-1">
                                                            <Truck className="w-3 h-3" /> {animal.escalation_status || 'Awaiting Pickup'}
                                                        </span>
                                                    ) : (
                                                        <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide border ${statusMeta.color}`}>
                                                            {statusMeta.name}
                                                        </span>
                                                    )}
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
                                                    {tabMode === 'barangay' && (
                                                        <p className={`mt-0.5 text-[10px] font-black uppercase tracking-wide ${animal.subdivision_id === subdivisionId ? 'text-role-hover' : 'text-gray-400'}`}>
                                                            {animal.subdivision_id === subdivisionId ? 'From your subdivision' : 'From another subdivision'}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Intake, stay at the current facility, and where it is */}
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2">
                                                        <p className="text-[10px] font-bold text-gray-400">Intake</p>
                                                        <p className="font-bold text-gray-800 truncate">{formatDate(animal.intake_date)}</p>
                                                    </div>
                                                    <div className="rounded-xl bg-gray-50 border border-gray-100 px-2.5 py-2">
                                                        <p className="text-[10px] font-bold text-gray-400">{isTransferredToBrgy ? 'Barangay stay' : 'Stay here'}</p>
                                                        <p className={`font-black truncate ${isResolved ? 'text-gray-600' : isOverdue ? 'text-red-600' : 'text-gray-800'}`}>
                                                            {isTransferredToBrgy
                                                                ? formatDynamicDuration(animal.brgy_intake_date, animal.brgy_discharge_date || animal.discharge_date, isResolved || !!animal.brgy_discharge_date, animal.brgy_duration_display)
                                                                : formatDynamicDuration(animal.subd_intake_date || animal.intake_date, animal.subd_discharge_date, isResolved || !!animal.subd_discharge_date, animal.subd_duration_display || `${days}d`)}
                                                        </p>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] text-gray-500 font-semibold flex items-center gap-1.5 min-w-0">
                                                    <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                                    <span className="truncate">{animal.facility_name || animal.report_landmark || 'Holding place'}</span>
                                                    {animal.kennel_slot && <span className="shrink-0 text-gray-400">· Slot {animal.kennel_slot}</span>}
                                                    <span className="shrink-0 text-gray-400">· Total {formatStayDuration(animal.intake_date, animal.discharge_date, isResolved, animal.total_duration_display)}</span>
                                                </p>

                                                {/* Stay limit / transfer status (one line) */}
                                                <div className="flex items-center justify-between gap-2 text-xs">
                                                    <span className="font-bold text-gray-400">Stay limit</span>
                                                    {isResolved ? (
                                                        <span className="font-bold text-gray-500">Completed</span>
                                                    ) : isTransferredToBrgy ? (
                                                        <span className="font-bold text-role-hover">In Barangay shelter</span>
                                                    ) : isOverdue ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-700 font-black rounded-lg border border-red-200">
                                                            <AlertTriangle className="w-3 h-3" /> Needs transfer ({days}/{impoundStayDuration}d)
                                                        </span>
                                                    ) : isNearExpiry ? (
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 font-black rounded-lg border border-amber-200">
                                                            <Hourglass className="w-3 h-3" /> {remaining}d left
                                                        </span>
                                                    ) : (
                                                        <span className="font-bold text-gray-700">{remaining} days left</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions, evenly sized */}
                                            <div className="px-3 pb-3 sm:px-4 sm:pb-4 flex gap-2">
                                                {animal.is_escalated ? (
                                                    <button
                                                        type="button"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            if (animal.report_id) {
                                                                navigate(`/subd/reports/${animal.report_id}`);
                                                            } else {
                                                                navigate('/subd/reports?status=Escalated%20to%20Barangay');
                                                            }
                                                        }}
                                                        className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-xs font-black rounded-xl transition-all cursor-pointer bg-role-soft hover:bg-role-muted text-role-strong border border-role-border"
                                                        title="Track pickup progress in Incident Reports"
                                                    >
                                                        <Truck className="w-3.5 h-3.5 text-role-hover" />
                                                        Track Status
                                                    </button>
                                                ) : !isResolved && !isTransferredToBrgy ? (
                                                    <button
                                                        type="button"
                                                        onClick={e => handleOpenEscalate(animal, e)}
                                                        className={`flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                                                            isOverdue
                                                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                                                : 'bg-role-soft hover:bg-role-muted text-role-strong border border-role-border'
                                                        }`}
                                                        title="Escalate & transfer animal to Barangay Holding Place"
                                                    >
                                                        <Truck className="w-3.5 h-3.5" />
                                                        Escalate
                                                    </button>
                                                ) : null}
                                                <button
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        openDetail(animal);
                                                    }}
                                                    className="flex-1 h-10 inline-flex items-center justify-center gap-1.5 text-xs font-black text-white bg-role-hover rounded-xl hover:bg-role-strong transition-all cursor-pointer"
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
                <SubdBottomNav activeTab="facility" />
            </div>

            {/* ─── Detail / Manage Modal (Unified Barangay-Aligned Modal) ────────── */}
            {selected && (() => {
                const isSelectedInHistory = !isCurrentlyInSubd(selected);
                const isSelectedTransferred = selected.facility_type === 'barangay_facility' || (selected.facility_name && selected.facility_name.toLowerCase().includes('barangay'));
                const isResolved = RESOLVED_IDS.has(selected.facility_status);
                const heldDays = daysSince(stayStart(selected));
                const isOverdueSel = !isSelectedInHistory && !isResolved && heldDays >= impoundStayDuration;
                const inputCls = 'w-full h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-800 focus:ring-2 focus:ring-role-border outline-none';
                const labelCls = 'text-[11px] font-bold text-gray-500 block mb-1';
                const fileCls = 'block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-[11px] file:font-black file:bg-role-soft file:text-role-hover hover:file:bg-role-muted cursor-pointer';

                return (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-[9999] p-0 sm:p-4"
                        role="dialog" aria-modal="true" aria-label="Manage animal">
                        <div className="bg-white sm:rounded-3xl shadow-2xl w-full h-full sm:h-auto max-w-2xl sm:max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 sm:border border-gray-100 pt-[env(safe-area-inset-top)] sm:pt-0">

                            {/* Compact header: name + status, report # · facility, close */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                                <div className="w-9 h-9 bg-role-soft rounded-xl flex items-center justify-center shrink-0">
                                    {animalIcon(selected.animal_type, 'w-5 h-5')}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <h2 className="text-base font-black text-gray-900 truncate">
                                            {selected.animal_name || `${selected.animal_type || 'Animal'} #${selected.holding_id}`}
                                        </h2>
                                        <span className={`shrink-0 px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                            isSelectedTransferred ? 'bg-role-soft text-role-strong border-role-border' : getStatusMeta(selected.facility_status).color
                                        }`}>
                                            {isSelectedTransferred ? 'In Brgy Holding' : getStatusMeta(selected.facility_status).name}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">Report #{selected.report_id.toString().padStart(4, '0')} · {selected.facility_name || selected.report_landmark || 'Subdivision Shelter'}</p>
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
                                            : <><Calendar className="w-3.5 h-3.5" /> Timeline ({selected.timeline?.length || 0})</>}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] sm:px-5 custom-scrollbar">

                                {/* ── Animal Details ─────────────────────────────── */}
                                {detailTab === 'info' && (
                                    <div className="space-y-3.5">

                                        {/* Past record notice */}
                                        {isSelectedInHistory && (
                                            <div className="bg-role-soft border border-role-border rounded-xl p-3 flex items-start gap-2.5">
                                                <Info className="w-4 h-4 text-role-hover shrink-0 mt-0.5" />
                                                <div className="text-xs text-role-strong">
                                                    <p className="font-black">{isHeldAtBarangay(selected) ? 'At the Barangay holding place (view only)' : 'Past facility record (read-only)'}</p>
                                                    <p className="text-role-strong/90 font-medium">
                                                        {isHeldAtBarangay(selected) ? 'This animal is currently held at ' : 'This animal is now at '}<strong>{selected.facility_name || 'Barangay Facility'}</strong>. Daily care and disposition are managed by the receiving shelter.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

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
                                            <AnimalRecordsPanel reportId={selected.report_id} basePath="/subd/reports" onChanged={() => fetchAll()} compact />
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
                                                        {formatDynamicDuration(selected.subd_intake_date || selected.intake_date, selected.subd_discharge_date, isResolved || !!selected.subd_discharge_date, selected.subd_duration_display)}
                                                    </p>
                                                </div>
                                                <div className="bg-white p-2.5 rounded-xl border border-role-muted/60 min-w-0">
                                                    <p className="text-[10px] font-bold text-gray-500 flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" /> Barangay</p>
                                                    <p className="text-sm font-black text-role-strong mt-0.5 truncate">
                                                        {formatDynamicDuration(selected.brgy_intake_date, selected.brgy_discharge_date || selected.discharge_date, isResolved || !!selected.brgy_discharge_date, selected.brgy_duration_display)}
                                                    </p>
                                                </div>
                                                <div className="bg-role-hover text-white p-2.5 rounded-xl min-w-0">
                                                    <p className="text-[10px] font-bold text-role-border">Total</p>
                                                    <p className="text-sm font-black mt-0.5 truncate">{formatStayDuration(selected.intake_date, selected.discharge_date, isResolved, selected.total_duration_display)}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs">
                                                <span className="text-gray-600">
                                                    Intake <strong className="text-gray-900">{formatDate(selected.intake_date)}</strong> · Limit <strong className="text-gray-900">{impoundStayDuration} days</strong>
                                                </span>
                                                {isHeldAtBarangay(selected) ? (
                                                    <span className="px-2 py-0.5 rounded-lg bg-role-soft border border-role-border text-role-strong font-black">In Barangay shelter</span>
                                                ) : isResolved ? (
                                                    <span className="font-bold text-gray-500">Completed</span>
                                                ) : isSelectedTransferred ? (
                                                    <span className="px-2 py-0.5 rounded-lg bg-role-soft border border-role-border text-role-strong font-black">In Barangay shelter</span>
                                                ) : selected.is_escalated ? (
                                                    <span className="px-2 py-0.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-black inline-flex items-center gap-1">
                                                        <Truck className="w-3 h-3" /> Escalated · {selected.escalation_status || 'Awaiting Pickup'}
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
                                                { label: 'Intake staff / leader', value: selected.intake_staff_name || 'Leader', wide: true },
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
                                                                className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50 cursor-pointer group hover:border-role transition-all"
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

                                        {/* Stay limit reached (urgent) */}
                                        {isOverdueSel && (
                                            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2.5">
                                                <div className="w-8 h-8 rounded-lg bg-red-600 text-white flex items-center justify-center shrink-0">
                                                    <AlertTriangle className="w-4 h-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-black text-red-950">Stay limit reached · {heldDays} days held</p>
                                                    <p className="text-xs text-red-800 mt-0.5 leading-relaxed">
                                                        This animal has reached the {impoundStayDuration}-day temporary holding limit. Coordinate with Barangay responders to transfer it to the Barangay Holding Pen for impoundment or adoption.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Escalate custody to Barangay */}
                                        {!isSelectedInHistory && !RESOLVED_IDS.has(selected.facility_status) && (
                                            selected.is_escalated ? (
                                                <div className="border border-role-border bg-role-soft/50 rounded-2xl p-3 space-y-2.5">
                                                    <div className="flex items-start gap-2.5">
                                                        <div className="w-8 h-8 rounded-lg bg-role text-white flex items-center justify-center shrink-0">
                                                            <Truck className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-role-strong">Escalated to Barangay · {selected.escalation_status || 'Awaiting Pickup'}</p>
                                                            <p className="text-xs text-role-strong/90 mt-0.5 leading-relaxed">
                                                                A pickup mission is active with Barangay Operations. The animal stays here until the team picks it up.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const repId = selected.report_id;
                                                            setSelected(null);
                                                            if (repId) {
                                                                navigate(`/subd/reports/${repId}`);
                                                            } else {
                                                                navigate('/subd/reports?status=Escalated%20to%20Barangay');
                                                            }
                                                        }}
                                                        className="w-full h-10 bg-role hover:bg-role-hover text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                    >
                                                        <Truck className="w-4 h-4" />
                                                        View escalated report
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="border border-role-border bg-role-soft/50 rounded-2xl p-3 space-y-2.5">
                                                    <div className="flex items-start gap-2.5">
                                                        <div className="w-8 h-8 rounded-lg bg-role text-white flex items-center justify-center shrink-0">
                                                            <Truck className="w-4 h-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-role-strong flex items-center gap-2 flex-wrap">
                                                                Escalate custody to Barangay
                                                                {heldDays >= impoundStayDuration && (
                                                                    <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-black rounded-md border border-red-200">Overdue</span>
                                                                )}
                                                            </p>
                                                            <p className="text-xs text-role-strong/90 mt-0.5 leading-relaxed">
                                                                Endorse this case to Barangay Operations for pickup and transfer to the municipal animal shelter.
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEscalate(selected)}
                                                        className="w-full h-10 bg-role hover:bg-role-hover text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                                                    >
                                                        <Truck className="w-4 h-4" />
                                                        Escalate to Barangay
                                                    </button>
                                                </div>
                                            )
                                        )}

                                        {/* Update condition */}
                                        {!isSelectedInHistory && !RESOLVED_IDS.has(selected.facility_status) && (
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
                                                <div className="border border-gray-200 rounded-2xl p-3 sm:p-4 space-y-3 bg-gray-50/60 animate-in fade-in duration-200">
                                                    <div className="flex items-center justify-between">
                                                        <h3 className="text-sm font-black text-gray-800 flex items-center gap-1.5">
                                                            <Pencil className="w-4 h-4 text-role-hover" />
                                                            Update animal condition
                                                        </h3>
                                                    </div>

                                                    <div>
                                                        <label className={labelCls}>Facility status</label>
                                                        <select
                                                            value={updateForm.facility_status}
                                                            onChange={e => setUpdateForm(f => ({ ...f, facility_status: Number(e.target.value) }))}
                                                            className={inputCls}
                                                        >
                                                            {FACILITY_STATUSES.filter(s => ![6, 7, 8].includes(s.id)).map(s => (
                                                                <option key={s.id} value={s.id}>{s.name}</option>
                                                            ))}
                                                        </select>
                                                        {RESOLVED_IDS.has(updateForm.facility_status) && (
                                                            <p className="text-[11px] text-amber-700 font-semibold mt-1.5 flex items-start gap-1">
                                                                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> This will discharge the animal and automatically close the linked report (Resolved).
                                                            </p>
                                                        )}
                                                    </div>

                                                    <div>
                                                        <label className={labelCls}>Kennel / bay slot</label>
                                                        <input
                                                            type="text"
                                                            placeholder="e.g. Pen A-1, Bay 2"
                                                            className={inputCls}
                                                            value={updateForm.kennel_slot}
                                                            onChange={e => setUpdateForm(f => ({ ...f, kennel_slot: e.target.value }))}
                                                        />
                                                    </div>

                                                    {/* Holding intake and custody (read-only) */}
                                                    <div className="px-3 py-2.5 bg-white border border-gray-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs">
                                                        <div className="text-gray-600">
                                                            Intake <strong className="text-gray-900">{formatDateTime(selected.intake_date)}</strong>
                                                            <span className="block">Limit <strong className="text-gray-900">{impoundStayDuration} days</strong> · In custody <strong className="text-role-strong">{selected.subd_duration_display || `${heldDays} days`}</strong></span>
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
                                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-role-border outline-none resize-none"
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
                                                            className="h-11 bg-role-hover hover:bg-role-strong disabled:bg-role-border text-white text-sm font-black rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
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

                                        {/* Original report */}
                                        <Link
                                            to={`/subd/reports/${selected.report_id}`}
                                            className="w-full h-11 bg-gray-100 hover:bg-gray-200 text-gray-800 font-black rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"
                                        >
                                            <ClipboardList className="w-3.5 h-3.5" />
                                            Open original report #{selected.report_id}
                                        </Link>

                                    </div>
                                )}

                                {/* ── Timeline ───────────────────────────────────── */}
                                {detailTab === 'timeline' && (
                                    <div className="space-y-4">

                                        {/* Add an entry */}
                                        {!isSelectedInHistory && !RESOLVED_IDS.has(selected.facility_status) && (
                                            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-3 space-y-2.5">
                                                <h3 className="text-xs font-black text-gray-700">Add timeline entry</h3>
                                                <div className="flex flex-col sm:flex-row gap-2">
                                                    <select
                                                        value={timelineForm.event_type}
                                                        onChange={e => setTimelineForm(f => ({ ...f, event_type: e.target.value }))}
                                                        className="h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:ring-2 focus:ring-role-border outline-none sm:w-44"
                                                    >
                                                        <option value="observation">Observation</option>
                                                        <option value="medical">Medical</option>
                                                        <option value="treatment">Treatment</option>
                                                        <option value="status_change">Status Change</option>
                                                    </select>
                                                    <input
                                                        type="text"
                                                        placeholder="Title / summary"
                                                        className="flex-1 h-10 px-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-role-border outline-none"
                                                        value={timelineForm.title}
                                                        onChange={e => setTimelineForm(f => ({ ...f, title: e.target.value }))}
                                                    />
                                                </div>
                                                <textarea
                                                    rows={2}
                                                    placeholder="Detailed notes"
                                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-role-border outline-none resize-none"
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
                                        {selected.timeline?.length === 0 ? (
                                            <div className="text-center py-10 text-gray-400 text-sm">No timeline entries yet.</div>
                                        ) : (
                                            <div className="relative">
                                                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100" />
                                                <div className="space-y-3">
                                                    {[...(selected.timeline || [])].reverse().map((log) => {
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
                                                className="flex-1 py-3 px-4 bg-role-hover hover:bg-role-strong text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-lg shadow-role-muted text-center"
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

            {/* ─── Escalate to Barangay Modal ────────────────────────────────────── */}
            {escalateModalOpen && animalToEscalate && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[10000] p-0 sm:p-4">
                    <div className="bg-white rounded-none sm:rounded-3xl shadow-2xl w-full h-full sm:h-auto max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col sm:max-h-[90vh] border-none sm:border border-gray-100">
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-gradient-to-r from-role-soft via-role-muted/40 to-transparent">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-role text-white flex items-center justify-center shadow-md shadow-role/20">
                                    <Truck className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-gray-900 leading-tight">
                                        Escalate to Barangay Facility
                                    </h3>
                                    <p className="text-[11px] text-gray-500 font-medium">
                                        Transfer custody to municipal animal welfare shelter
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    setEscalateModalOpen(false);
                                    setAnimalToEscalate(null);
                                }}
                                className="w-8 h-8 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
                            {/* Animal Preview Card */}
                            <div className="bg-gray-50 rounded-2xl p-3.5 border border-gray-150 flex items-center gap-3.5">
                                <div className="w-14 h-14 rounded-xl bg-slate-200 overflow-hidden shrink-0 border border-gray-200 flex items-center justify-center">
                                    {getCardPhoto(animalToEscalate) ? (
                                        <img
                                            src={getCardPhoto(animalToEscalate)}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        animalIcon(animalToEscalate.animal_type, 'w-7 h-7 text-gray-400')
                                    )}
                                </div>
                                <div className="min-w-0 flex-1 text-xs">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span className="font-mono font-black text-role-hover bg-role-soft px-1.5 py-0.5 rounded text-[10px]">
                                            #{animalToEscalate.report_id.toString().padStart(4, '0')}
                                        </span>
                                        <span className="font-bold text-gray-700 truncate">
                                            {animalToEscalate.animal_name || `${animalToEscalate.animal_type || 'Animal'} #${animalToEscalate.holding_id}`}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 truncate">
                                        {animalToEscalate.breed || 'Unknown Breed'} · {animalToEscalate.color || 'Unknown Color'}
                                    </p>
                                    <p className="text-[10px] text-gray-400 mt-1 font-medium">
                                        Time in Subd: <strong className="text-gray-700">{animalToEscalate.subd_duration_display || `${daysSince(stayStart(animalToEscalate))} days`}</strong>
                                    </p>
                                </div>
                            </div>

                            {/* Target Barangay Facility Selector */}
                            <div>
                                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider block mb-1.5">
                                    Destination Barangay Holding Place
                                </label>
                                {barangayFacilities.length === 0 ? (
                                    <div className="p-3 bg-role-soft rounded-xl border border-role-border text-xs text-role-strong">
                                        No specific Barangay holding place landmark detected. The system will route to the default Barangay Main Holding Shelter.
                                    </div>
                                ) : (
                                    <select
                                        value={selectedBrgyFacilityId}
                                        onChange={(e) => setSelectedBrgyFacilityId(Number(e.target.value))}
                                        className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 focus:ring-2 focus:ring-role-border focus:border-role outline-none cursor-pointer"
                                    >
                                        {barangayFacilities.map((f) => (
                                            <option key={f.landmark_id} value={f.landmark_id}>
                                                {f.name} {f.capacity ? `(Capacity: ${f.capacity})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            {/* Quick Reason Chips */}
                            <div>
                                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider block mb-1.5">
                                    Escalation Reason
                                </label>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {[
                                        'Stay limit reached (overdue)',
                                        'Requires municipal veterinary treatment',
                                        'Aggressive / specialized handling',
                                        'Subdivision holding unit at full capacity',
                                        'Long-term custody / municipal impoundment',
                                    ].map((chip) => (
                                        <button
                                            key={chip}
                                            type="button"
                                            onClick={() => setEscalateReason(chip)}
                                            className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                                                escalateReason === chip
                                                    ? 'bg-role text-white border-role shadow-2xs'
                                                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                            }`}
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                </div>
                                <input
                                    type="text"
                                    value={escalateReason}
                                    onChange={(e) => setEscalateReason(e.target.value)}
                                    placeholder="Enter reason for escalation..."
                                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:ring-2 focus:ring-role-border focus:border-role outline-none"
                                />
                            </div>

                            {/* Additional Notes */}
                            <div>
                                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider block mb-1.5">
                                    Additional Handover Notes (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    value={escalateNotes}
                                    onChange={(e) => setEscalateNotes(e.target.value)}
                                    placeholder="Provide details about the animal's behavior, treatments given, or handover time..."
                                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-800 focus:ring-2 focus:ring-role-border focus:border-role outline-none resize-none"
                                />
                            </div>

                            {/* Endorsement Letter Upload (same requirement as Report escalation) */}
                            <div>
                                <label className="text-[11px] font-black text-gray-700 uppercase tracking-wider block mb-1.5">
                                    Endorsement Letter File (PDF/DOCX/Image) <span className="text-red-500">*</span>
                                </label>
                                <div className="flex items-center gap-2.5 px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl">
                                    <label
                                        htmlFor="holding-endorsement-file-input"
                                        className="px-3.5 py-1.5 bg-role-soft text-role hover:bg-role-muted rounded-full text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1.5 shrink-0"
                                    >
                                        <Paperclip className="w-3 h-3" /> Choose File
                                    </label>
                                    <input
                                        id="holding-endorsement-file-input"
                                        type="file"
                                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                        onChange={(e) => setEndorsementFile(e.target.files?.[0] || null)}
                                        className="hidden"
                                    />
                                    <span className="text-[11px] font-semibold text-gray-500 truncate">
                                        {endorsementFile ? endorsementFile.name : 'No file chosen'}
                                    </span>
                                    {endorsementFile && (
                                        <button
                                            type="button"
                                            onClick={() => setEndorsementFile(null)}
                                            className="ml-auto text-gray-400 hover:text-gray-700 cursor-pointer shrink-0"
                                            title="Remove file"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                                <p className="text-[10px] text-gray-400 font-medium mt-1">
                                    Attach the signed endorsement letter forwarded to Barangay Operations.
                                </p>
                            </div>

                            {/* Policy Notice Box */}
                            <div className="bg-role-soft/80 rounded-2xl p-3.5 border border-role-border text-xs text-role-strong space-y-1">
                                <p className="font-bold flex items-center gap-1.5 text-role-strong">
                                    <AlertTriangle className="w-3.5 h-3.5 text-role-hover shrink-0" />
                                    Same Procedure as Incident Report Escalation
                                </p>
                                <p className="text-[11px] text-role-strong/90 leading-relaxed font-medium">
                                    Once escalated, an official Rescue & Pickup Mission with Endorsement is forwarded to Barangay Operations. The animal remains safely in your subdivision holding place until Barangay responders accept the mission and pick up the animal.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-gray-100 flex items-center justify-end gap-2.5 bg-gray-50/50">
                            <button
                                type="button"
                                onClick={() => {
                                    setEscalateModalOpen(false);
                                    setAnimalToEscalate(null);
                                }}
                                disabled={isEscalating}
                                className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-800 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmEscalate}
                                disabled={isEscalating || !endorsementFile}
                                className="px-5 py-2.5 bg-role hover:bg-role-hover disabled:bg-role-border text-white text-xs font-black rounded-xl transition-all shadow-md shadow-role/20 flex items-center gap-2 cursor-pointer uppercase tracking-wider"
                            >
                                {isEscalating ? (
                                    <>
                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Escalating...
                                    </>
                                ) : (
                                    <>
                                        <Truck className="w-4 h-4" />
                                        Confirm Escalation
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

export default SubdHoldingFacility;
