import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../utils/api';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import MapComponent from '../../components/MapComponent';
import PetRecoveryModal from '../../components/Modals/PetRecoveryModal';
import type { RecoveryScanData } from '../../components/Modals/PetRecoveryModal';
import {
    History,
    MapPin,
    User,
    CheckCircle2,
    XCircle,
    Clock,
    PawPrint,
    ShieldCheck,
    AlertCircle,
    Map,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Phone
} from 'lucide-react';


interface ScanRecord {
    scan_id: number;
    qr_id: number;
    pet_id: number;
    scanned_by: number | null;
    scanned_by_name: string | null;
    finder_name: string | null;
    finder_contact: string | null;
    scan_lat: number | null;
    scan_lng: number | null;
    street_address: string | null;
    barangay: string | null;
    city: string | null;
    landmark: string | null;
    location_type: string;
    notes: string | null;
    status: string; // PENDING, CONFIRMED, REJECTED
    confirmed_at: string | null;
    confirmed_by_name: string | null;
    rejection_reason: string | null;
    pet_status_at_scan: string | null;
    scanned_at: string;
}

interface PetHistoryRecord {
    history_id: number;
    pet_id: number;
    event_type: string;
    title: string;
    description: string | null;
    recovery_method: string | null;
    scan_id: number | null;
    actor_id: number | null;
    actor_name: string | null;
    actor_role: string | null;
    previous_status: string | null;
    new_status: string | null;
    location_name: string | null;
    latitude: number | null;
    longitude: number | null;
    created_at: string;
}

interface PetDetails {
    pet_id: number;
    pet_name: string;
    pet_type: string;
    breed: string | null;
    gender: string | null;
    status: string;
    photo_url: string;
    owner_id: number | null;
}

// Grouped incident lifecycle data structure
interface TimelineIncident {
    incident_id: string; // unique key
    type: 'ACTIVE_RECOVERY' | 'RESOLVED_RECOVERY' | 'REJECTED_RECOVERY' | 'GENERAL_EVENT';
    title: string;
    subtitle?: string;
    status: 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED' | 'STANDARD';
    latestTimestamp: string;
    primaryScan?: ScanRecord | null;
    resolutionEvent?: PetHistoryRecord | null;
    finderName?: string | null;
    finderContact?: string | null;
    locationDesc?: string | null;
    subEvents: {
        id: string;
        title: string;
        description: string | null;
        timestamp: string;
        actor_name?: string | null;
        actor_role?: string | null;
        location_name?: string | null;
        eventType: string;
        statusBadge?: string;
    }[];
}

/**
 * Group flat scans and history events into coherent Incident Lifecycle cards.
 * If multiple scans happen during an active or completed recovery lifecycle,
 * they are consolidated into one incident card with expandable audit history.
 */
const groupTimelineEvents = (
    historyList: PetHistoryRecord[],
    scanList: ScanRecord[]
): TimelineIncident[] => {
    const incidents: TimelineIncident[] = [];
    const usedScanIds = new Set<number>();
    const usedHistoryIds = new Set<number>();

    // 1. Group by scan_id where recovery was confirmed or rejected
    const recoveryConfirmEvents = historyList.filter(
        h => h.event_type === 'OWNER_CONFIRMED_RECOVERY' && h.scan_id !== null
    );

    recoveryConfirmEvents.forEach(confirmEvent => {
        const scanId = confirmEvent.scan_id!;
        usedHistoryIds.add(confirmEvent.history_id);
        usedScanIds.add(scanId);

        const primaryScan = scanList.find(s => s.scan_id === scanId) || null;
        const relatedScans = scanList.filter(s => s.scan_id === scanId);
        const relatedHistory = historyList.filter(h => h.scan_id === scanId && h.history_id !== confirmEvent.history_id);

        relatedHistory.forEach(h => usedHistoryIds.add(h.history_id));

        // Build audit sub-events sorted chronologically
        const subEvents: TimelineIncident['subEvents'] = [];

        // Add scan sub-events
        relatedScans.forEach(s => {
            subEvents.push({
                id: `scan-${s.scan_id}`,
                title: `QR Tag Scanned by ${s.finder_name || 'Citizen'}`,
                description: s.notes ? `Finder Note: "${s.notes}"` : `Collar scanned at ${s.landmark || s.barangay || 'Reported Location'}`,
                timestamp: s.scanned_at,
                actor_name: s.finder_name || 'Guest Finder',
                actor_role: 'Finder',
                location_name: [s.street_address, s.barangay, s.city].filter(Boolean).join(', ') || s.landmark || 'Location Logged',
                eventType: 'QR_TAG_SCANNED',
                statusBadge: 'Scanned'
            });
        });

        // Add other history logs attached to this scan
        relatedHistory.forEach(h => {
            subEvents.push({
                id: `hist-${h.history_id}`,
                title: h.title,
                description: h.description,
                timestamp: h.created_at,
                actor_name: h.actor_name,
                actor_role: h.actor_role,
                location_name: h.location_name,
                eventType: h.event_type,
                statusBadge: h.new_status || undefined
            });
        });

        // Add the confirmation event itself
        subEvents.push({
            id: `confirm-${confirmEvent.history_id}`,
            title: `Owner Confirmed Retrieval`,
            description: confirmEvent.description,
            timestamp: confirmEvent.created_at,
            actor_name: confirmEvent.actor_name,
            actor_role: confirmEvent.actor_role,
            location_name: confirmEvent.location_name,
            eventType: confirmEvent.event_type,
            statusBadge: 'Recovered'
        });

        // Sort subEvents chronologically (oldest to newest)
        subEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const finderName = primaryScan?.finder_name || confirmEvent.actor_name || 'Citizen Finder';
        const locationDesc = primaryScan?.landmark || primaryScan?.barangay || confirmEvent.location_name || 'Reported Location';

        incidents.push({
            incident_id: `resolved-incident-${scanId}`,
            type: 'RESOLVED_RECOVERY',
            title: 'PET SAFELY RECOVERED',
            subtitle: confirmEvent.description || `Retrieved by owner following collar scan near ${locationDesc}`,
            status: 'RESOLVED',
            latestTimestamp: confirmEvent.created_at,
            primaryScan,
            resolutionEvent: confirmEvent,
            finderName,
            finderContact: primaryScan?.finder_contact,
            locationDesc,
            subEvents
        });
    });

    // 2. Active in-progress recoveries (Scans with status 'PENDING')
    const pendingScans = scanList.filter(s => s.status === 'PENDING');
    if (pendingScans.length > 0) {
        // Group all active pending scans into one active recovery lifecycle
        const activeSubEvents: TimelineIncident['subEvents'] = [];
        pendingScans.forEach(s => {
            usedScanIds.add(s.scan_id);
            // Also mark any QR_TAG_SCANNED history logs with this scan_id as used
            const matchHists = historyList.filter(h => h.scan_id === s.scan_id);
            matchHists.forEach(h => usedHistoryIds.add(h.history_id));

            activeSubEvents.push({
                id: `active-scan-${s.scan_id}`,
                title: `Collar Sighting #${s.scan_id} by ${s.finder_name || 'Citizen'}`,
                description: s.notes ? `Finder Note: "${s.notes}"` : `Reported at ${s.landmark || s.barangay || 'Reported Location'}`,
                timestamp: s.scanned_at,
                actor_name: s.finder_name || 'Finder',
                actor_role: 'Finder',
                location_name: [s.street_address, s.barangay, s.city].filter(Boolean).join(', ') || s.landmark,
                eventType: 'QR_TAG_SCANNED',
                statusBadge: 'Pending Owner Confirmation'
            });
        });

        // Sort subEvents newest to oldest
        activeSubEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const primary = pendingScans[0];

        incidents.push({
            incident_id: `active-recovery-${primary.scan_id}`,
            type: 'ACTIVE_RECOVERY',
            title: 'RECOVERY IN PROGRESS',
            subtitle: `Active pet sighting submitted by ${primary.finder_name || 'citizen finder'}`,
            status: 'IN_PROGRESS',
            latestTimestamp: primary.scanned_at,
            primaryScan: primary,
            finderName: primary.finder_name || 'Citizen Finder',
            finderContact: primary.finder_contact,
            locationDesc: primary.landmark || primary.barangay || 'Reported Location',
            subEvents: activeSubEvents
        });
    }

    // 3. Handle remaining scans that might have been rejected
    const rejectedScans = scanList.filter(s => s.status === 'REJECTED' && !usedScanIds.has(s.scan_id));
    rejectedScans.forEach(s => {
        usedScanIds.add(s.scan_id);
        const matchHists = historyList.filter(h => h.scan_id === s.scan_id);
        matchHists.forEach(h => usedHistoryIds.add(h.history_id));

        incidents.push({
            incident_id: `rejected-scan-${s.scan_id}`,
            type: 'REJECTED_RECOVERY',
            title: 'RECOVERY REQUEST DISMISSED',
            subtitle: s.rejection_reason ? `Reason: ${s.rejection_reason}` : 'Owner confirmed sighting was unrelated or misidentified.',
            status: 'REJECTED',
            latestTimestamp: s.scanned_at,
            primaryScan: s,
            finderName: s.finder_name,
            finderContact: s.finder_contact,
            locationDesc: s.landmark || s.barangay,
            subEvents: [{
                id: `sub-rej-${s.scan_id}`,
                title: `Scan #${s.scan_id} Rejected by Owner`,
                description: s.rejection_reason || 'Dismissed by pet owner',
                timestamp: s.scanned_at,
                actor_name: s.finder_name,
                actor_role: 'Finder',
                location_name: s.landmark || s.barangay,
                eventType: 'RECOVERY_REJECTED',
                statusBadge: 'Rejected'
            }]
        });
    });

    // 4. Any remaining history logs (e.g. initial registration, status shifts, unmatched scans)
    const remainingHistory = historyList.filter(h => !usedHistoryIds.has(h.history_id));
    remainingHistory.forEach(h => {
        incidents.push({
            incident_id: `general-hist-${h.history_id}`,
            type: 'GENERAL_EVENT',
            title: h.title,
            subtitle: h.description || undefined,
            status: 'STANDARD',
            latestTimestamp: h.created_at,
            resolutionEvent: h,
            locationDesc: h.location_name || undefined,
            subEvents: [{
                id: `gen-${h.history_id}`,
                title: h.title,
                description: h.description,
                timestamp: h.created_at,
                actor_name: h.actor_name,
                actor_role: h.actor_role,
                location_name: h.location_name,
                eventType: h.event_type,
                statusBadge: h.new_status || undefined
            }]
        });
    });

    // Sort all incident lifecycle cards descending by latestTimestamp (newest first)
    incidents.sort((a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime());

    return incidents;
};

const PetScanHistoryPage = () => {
    const { petId } = useParams<{ petId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const rawStaffUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
    const rawAdminUser = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user');
    const rawResidentUser = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const currentUser = JSON.parse(rawStaffUser || rawAdminUser || rawResidentUser || 'null');

    const isSubdMode = searchParams.get('mode') === 'subd' || window.location.pathname.startsWith('/subd') || currentUser?.role_id === 2 || currentUser?.role_id === 3 || currentUser?.role_id === 4;

    const [activeTab, setActiveTab] = useState<'timeline' | 'sightings'>('timeline');
    const [scans, setScans] = useState<ScanRecord[]>([]);
    const [historyLogs, setHistoryLogs] = useState<PetHistoryRecord[]>([]);
    const [pet, setPet] = useState<PetDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Recovery Modal State
    const [selectedScanForModal, setSelectedScanForModal] = useState<RecoveryScanData | null>(null);
    const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);

    // Expandable Accordion state for Incident Lifecycle cards (keyed by incident_id)
    const [expandedIncidents, setExpandedIncidents] = useState<Record<string, boolean>>({});

    const toggleIncidentAccordion = (incidentId: string) => {
        setExpandedIncidents(prev => ({
            ...prev,
            [incidentId]: !prev[incidentId]
        }));
    };

    const backPath = isSubdMode ? '/subd/pet-records' : '/resident/pets';
    const loginPath = isSubdMode ? '/staff/login' : '/login';

    useEffect(() => {
        if (!currentUser) {
            navigate(loginPath);
            return;
        }
        fetchAllData();
    }, [petId]);

    const fetchAllData = async () => {
        try {
            setLoading(true);
            let targetPetId = petId;
            let petData = null;

            try {
                const petRes = await api.get(`/pets/${targetPetId}`);
                petData = petRes.data;
            } catch (err: any) {
                // If 403 or 404, check if the ID passed in URL was actually a scan_id from an older notification
                if (err?.response?.status === 403 || err?.response?.status === 404) {
                    try {
                        const recoveryRes = await api.get(`/pet-qr/recovery-requests/${targetPetId}`);
                        if (recoveryRes.data?.pet_id && recoveryRes.data.pet_id !== Number(targetPetId)) {
                            targetPetId = String(recoveryRes.data.pet_id);
                            const correctedPetRes = await api.get(`/pets/${targetPetId}`);
                            petData = correctedPetRes.data;
                            const basePath = isSubdMode ? `/subd/pet/${targetPetId}/scan-history` : `/resident/pet/${targetPetId}/scan-history`;
                            navigate(basePath, { replace: true });
                        } else {
                            throw err;
                        }
                    } catch {
                        throw err;
                    }
                } else {
                    throw err;
                }
            }

            setPet(petData);

            const [scansRes, historyRes] = await Promise.all([
                api.get(`/pets/${targetPetId}/scan-history`).catch(() => ({ data: [] })),
                api.get(`/pets/${targetPetId}/history`).catch(() => ({ data: [] }))
            ]);

            setScans(scansRes.data || []);
            setHistoryLogs(historyRes.data || []);
            setError(null);
        } catch (err) {
            console.error("Failed to fetch pet history logs:", err);
            setError("Failed to retrieve pet history logs.");
        } finally {
            setLoading(false);
        }
    };

    const handleOpenRecoveryModal = (scan: ScanRecord) => {
        setSelectedScanForModal({
            ...scan,
            pet_name: pet?.pet_name,
            pet_photo: pet?.photo_url
        });
        setIsRecoveryModalOpen(true);
    };

    const handleRecoveryConfirmed = () => {
        fetchAllData();
    };

    const handleRecoveryRejected = () => {
        fetchAllData();
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] dark:bg-[#121212] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#F97316]/20 border-t-[#F97316] rounded-full animate-spin mb-4 mx-auto"></div>
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest animate-pulse">Syncing Pet Timeline</span>
                </div>
            </div>
        );
    }

    if (error || !pet) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] dark:bg-[#121212] flex items-center justify-center p-6">
                <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-gray-100 dark:border-slate-800 shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-black text-[#1a1208] dark:text-white uppercase">Retrieval Failed</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">{error || "Pet not found."}</p>
                    <button
                        onClick={() => navigate(backPath)}
                        className="mt-6 px-6 py-3.5 bg-[#1a1208] dark:bg-orange-600 text-white text-xs font-black uppercase tracking-widest rounded-xl cursor-pointer"
                    >
                        Back to Pets
                    </button>
                </div>
            </div>
        );
    }

    const pendingScan = scans.find(s => s.status === 'PENDING');

    // Convert scan logs to Leaflet map markers
    const mapMarkers = scans
        .filter(s => s.scan_lat !== null && s.scan_lng !== null)
        .map(s => ({
            id: s.scan_id,
            lat: Number(s.scan_lat),
            lng: Number(s.scan_lng),
            title: s.notes || `Scanned by ${s.finder_name || 'Guest'} (${s.status})`,
            priority: s.status === 'PENDING' ? 'High' : s.status === 'CONFIRMED' ? 'Low' : 'Medium',
            time: new Date(s.scanned_at).toLocaleString(),
            category: s.location_type || 'Found Location'
        }));

    const defaultCenter: [number, number] = [14.806906, 121.0039297];
    const mapCenter: [number, number] = mapMarkers.length > 0
        ? [mapMarkers[0].lat, mapMarkers[0].lng]
        : defaultCenter;

    return (
        <div className="min-h-screen bg-[#FAFAF9] dark:bg-[#121212] font-sans pb-24 transition-colors">
            {isSubdMode ? <SubdNavbar /> : <ResiNavbar />}

            <main className="max-w-6xl mx-auto p-4 sm:p-8 pt-24 sm:pt-32 space-y-6 sm:space-y-8">

                {/* Header block */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <button
                            onClick={() => navigate(backPath)}
                            className="text-xs font-black uppercase text-gray-400 hover:text-[#F97316] tracking-widest flex items-center gap-2 mb-2 transition-colors cursor-pointer"
                        >
                            ← Back to Pet Records
                        </button>
                        <div className="flex items-center gap-4">
                            <div className="w-16 h-16 rounded-2xl overflow-hidden border border-gray-100 dark:border-slate-800 shadow-sm bg-gray-50 dark:bg-slate-800 shrink-0">
                                <img
                                    src={getPetPicture(pet.photo_url)}
                                    alt={pet.pet_name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-2xl sm:text-3xl font-black text-[#1a1208] dark:text-white uppercase tracking-tighter">
                                        {pet.pet_name} <span className="text-[#F97316]">History & Timeline</span>
                                    </h1>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                        pet.status === 'Lost'
                                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                    }`}>
                                        {pet.status}
                                    </span>
                                </div>
                                <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                                    {pet.breed || 'Registered Companion'} • Permanent Immutable Event Logs
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* View Switcher Tabs */}
                    <div className="flex items-center p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/80 dark:border-slate-800 shadow-xs self-start md:self-auto">
                        <button
                            type="button"
                            onClick={() => setActiveTab('timeline')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                activeTab === 'timeline'
                                    ? 'bg-orange-500 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <History className="w-3.5 h-3.5" />
                            <span>Audit Timeline</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('sightings')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                activeTab === 'sightings'
                                    ? 'bg-orange-500 text-white shadow-sm'
                                    : 'text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white'
                            }`}
                        >
                            <Map className="w-3.5 h-3.5" />
                            <span>Sighting Map ({scans.length})</span>
                        </button>
                    </div>
                </div>

                {/* Pending Recovery Alert Card */}
                {pendingScan && (
                    <div className="p-5 sm:p-6 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border-2 border-amber-500/40 rounded-3xl sm:rounded-[2.5rem] shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-in fade-in">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                                <PawPrint className="w-6 h-6 animate-pulse" />
                            </div>
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
                                    Action Required • Recovery Request
                                </span>
                                <h3 className="text-base sm:text-lg font-black text-gray-900 dark:text-white uppercase tracking-tight">
                                    Someone scanned {pet.pet_name}'s QR Tag
                                </h3>
                                <p className="text-xs font-semibold text-gray-600 dark:text-slate-300 mt-0.5">
                                    Scanned near <strong className="text-gray-900 dark:text-white">{pendingScan.landmark || pendingScan.barangay || 'Reported Location'}</strong> on {new Date(pendingScan.scanned_at).toLocaleString()}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => handleOpenRecoveryModal(pendingScan)}
                            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center gap-2 shrink-0 cursor-pointer"
                        >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Review & Confirm Retrieval</span>
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* Tab: Timeline View */}
                {activeTab === 'timeline' && (
                    <div className="space-y-6">
                        {(() => {
                            const incidents = groupTimelineEvents(historyLogs, scans);

                            if (incidents.length === 0) {
                                return (
                                    <div className="py-20 bg-white dark:bg-slate-900 rounded-[3rem] border-2 border-dashed border-gray-200 dark:border-slate-800 flex flex-col items-center justify-center text-center p-6">
                                        <div className="w-16 h-16 bg-orange-50 dark:bg-orange-950/40 rounded-full flex items-center justify-center text-[#F97316] mb-4">
                                            <History className="w-8 h-8" />
                                        </div>
                                        <h3 className="text-lg font-black text-[#1a1208] dark:text-white uppercase">No Incident Events Yet</h3>
                                        <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-2 max-w-sm">
                                            When {pet.pet_name}'s QR collar is scanned or recovery lifecycle updates occur, they will appear grouped here.
                                        </p>
                                    </div>
                                );
                            }

                            return (
                                <div className="relative border-l-2 border-orange-500/20 dark:border-slate-800 ml-4 sm:ml-8 pl-6 sm:pl-8 space-y-6 sm:space-y-8">
                                    {incidents.map((incident) => {
                                        const isExpanded = !!expandedIncidents[incident.incident_id];
                                        const isResolved = incident.status === 'RESOLVED';
                                        const isInProgress = incident.status === 'IN_PROGRESS';
                                        const isRejected = incident.status === 'REJECTED';

                                        const formattedDate = new Date(incident.latestTimestamp).toLocaleString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                            hour: 'numeric',
                                            minute: '2-digit',
                                            hour12: true
                                        });

                                        return (
                                            <div key={incident.incident_id} className="relative group">
                                                {/* Node Marker */}
                                                <div className={`absolute -left-[35px] sm:-left-[43px] top-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full border-4 border-white dark:border-[#121212] flex items-center justify-center shadow-md transition-transform group-hover:scale-110 z-10 ${
                                                    isResolved
                                                        ? 'bg-emerald-500 text-white'
                                                        : isInProgress
                                                        ? 'bg-orange-500 text-white animate-pulse'
                                                        : isRejected
                                                        ? 'bg-rose-500 text-white'
                                                        : 'bg-blue-500 text-white'
                                                }`}>
                                                    {isResolved ? (
                                                        <CheckCircle2 className="w-3.5 h-3.5" />
                                                    ) : isInProgress ? (
                                                        <PawPrint className="w-3.5 h-3.5" />
                                                    ) : isRejected ? (
                                                        <XCircle className="w-3.5 h-3.5" />
                                                    ) : (
                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                    )}
                                                </div>

                                                {/* Incident Lifecycle Card */}
                                                <div className={`bg-white dark:bg-[#151C2C] rounded-2xl sm:rounded-3xl border shadow-md p-5 sm:p-6 space-y-4 hover:shadow-xl transition-all ${
                                                    isResolved
                                                        ? 'border-emerald-500/30'
                                                        : isInProgress
                                                        ? 'border-orange-500/40 ring-2 ring-orange-500/20'
                                                        : 'border-gray-100 dark:border-slate-800'
                                                }`}>
                                                    {/* Card Header & Badge */}
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider ${
                                                                isResolved
                                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                                    : isInProgress
                                                                    ? 'bg-orange-500 text-white shadow-xs'
                                                                    : isRejected
                                                                    ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                                                    : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                                            }`}>
                                                                {incident.title}
                                                            </span>

                                                            {isInProgress && (
                                                                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-lg text-[9px] font-black uppercase tracking-wider animate-pulse">
                                                                    Action Required
                                                                </span>
                                                            )}

                                                            {incident.subEvents.length > 1 && (
                                                                <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded-lg text-[9px] font-bold">
                                                                    {incident.subEvents.length} Lifecycle Events
                                                                </span>
                                                            )}
                                                        </div>

                                                        <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {formattedDate}
                                                        </span>
                                                    </div>

                                                    {/* Incident Summary Description */}
                                                    {incident.subtitle && (
                                                        <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-slate-200 leading-relaxed">
                                                            {incident.subtitle}
                                                        </p>
                                                    )}

                                                    {/* In-Progress Finder Details & Action Button */}
                                                    {isInProgress && incident.primaryScan && (
                                                        <div className="bg-orange-50/70 dark:bg-orange-950/20 border border-orange-200/80 dark:border-orange-800/50 rounded-2xl p-4 sm:p-5 space-y-3">
                                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                                <div>
                                                                    <span className="text-[8px] font-black uppercase tracking-widest text-[#F97316] block">
                                                                        Finder Information
                                                                    </span>
                                                                    <p className="text-xs sm:text-sm font-black text-gray-900 dark:text-white uppercase mt-0.5">
                                                                        {incident.finderName || 'Guest Scanner'}
                                                                    </p>
                                                                    {incident.finderContact && (
                                                                        <p className="text-[11px] font-bold text-gray-600 dark:text-slate-300 flex items-center gap-1 mt-0.5">
                                                                            <Phone className="w-3 h-3 text-[#F97316]" />
                                                                            {incident.finderContact}
                                                                        </p>
                                                                    )}
                                                                </div>

                                                                {/* Retrieval Confirmation Action Button */}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenRecoveryModal(incident.primaryScan!)}
                                                                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap self-start sm:self-auto"
                                                                >
                                                                    <CheckCircle2 className="w-4 h-4" />
                                                                    <span>Confirm Retrieval</span>
                                                                </button>
                                                            </div>

                                                            {incident.locationDesc && (
                                                                <div className="pt-2 border-t border-orange-200/50 dark:border-orange-800/40 text-[11px] text-gray-700 dark:text-slate-300 font-bold flex items-center gap-1.5">
                                                                    <MapPin className="w-3.5 h-3.5 text-[#F97316] shrink-0" />
                                                                    <span>Reported Location: {incident.locationDesc}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Meta Details Pills */}
                                                    <div className="pt-2 border-t border-gray-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-[11px]">
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            {incident.finderName && !isInProgress && (
                                                                <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1 font-bold">
                                                                    <User className="w-3 h-3" />
                                                                    Finder: {incident.finderName}
                                                                </span>
                                                            )}
                                                            {incident.locationDesc && !isInProgress && (
                                                                <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1 font-bold">
                                                                    <MapPin className="w-3 h-3" />
                                                                    {incident.locationDesc}
                                                                </span>
                                                            )}
                                                            {isResolved && (
                                                                <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                                                                    Status: Recovered & Active
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Expand / Collapse Stepper Toggle */}
                                                        {incident.subEvents.length > 0 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => toggleIncidentAccordion(incident.incident_id)}
                                                                className="text-xs font-black uppercase text-[#F97316] hover:text-[#EA580C] tracking-wider flex items-center gap-1 transition-colors cursor-pointer ml-auto"
                                                            >
                                                                <span>{isExpanded ? 'Hide Audit Log' : `Audit Details (${incident.subEvents.length})`}</span>
                                                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                            </button>
                                                        )}
                                                    </div>

                                                    {/* Expandable Nested Audit Stepper */}
                                                    {isExpanded && (
                                                        <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-900/50 rounded-2xl p-4 sm:p-5 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                                            <div className="flex items-center justify-between pb-2 border-b border-gray-200/60 dark:border-slate-800">
                                                                <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-slate-400">
                                                                    Chronological Audit Trail (Immutable)
                                                                </span>
                                                                <span className="text-[9px] font-bold text-gray-400 dark:text-slate-500">
                                                                    {incident.subEvents.length} Verified Records
                                                                </span>
                                                            </div>

                                                            <div className="relative border-l-2 border-gray-200 dark:border-slate-800 ml-2.5 pl-4 sm:pl-5 space-y-4">
                                                                {incident.subEvents.map((step) => {
                                                                    const stepDate = new Date(step.timestamp).toLocaleString('en-US', {
                                                                        month: 'short',
                                                                        day: 'numeric',
                                                                        hour: 'numeric',
                                                                        minute: '2-digit',
                                                                        hour12: true
                                                                    });

                                                                    return (
                                                                        <div key={step.id} className="relative">
                                                                            {/* Sub-node point */}
                                                                            <div className={`absolute -left-[23px] sm:-left-[27px] top-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#151C2C] shadow-xs ${
                                                                                step.eventType === 'OWNER_CONFIRMED_RECOVERY'
                                                                                    ? 'bg-emerald-500'
                                                                                    : step.eventType === 'RECOVERY_REJECTED'
                                                                                    ? 'bg-rose-500'
                                                                                    : 'bg-orange-500'
                                                                            }`} />

                                                                            <div className="bg-white dark:bg-[#1E293B] rounded-xl p-3 sm:p-3.5 border border-gray-100 dark:border-slate-800 shadow-2xs space-y-1">
                                                                                <div className="flex flex-wrap items-center justify-between gap-1">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="text-xs font-black text-gray-800 dark:text-white uppercase">
                                                                                            {step.title}
                                                                                        </span>
                                                                                        {step.statusBadge && (
                                                                                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300">
                                                                                                {step.statusBadge}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <span className="text-[10px] font-bold text-gray-400 dark:text-slate-400">
                                                                                        {stepDate}
                                                                                    </span>
                                                                                </div>

                                                                                {step.description && (
                                                                                    <p className="text-[11px] font-medium text-gray-600 dark:text-slate-300">
                                                                                        {step.description}
                                                                                    </p>
                                                                                )}

                                                                                <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-gray-400 dark:text-slate-400">
                                                                                    {step.actor_name && (
                                                                                        <span className="flex items-center gap-1 font-semibold">
                                                                                            <User className="w-2.5 h-2.5" />
                                                                                            {step.actor_role ? `${step.actor_role}: ` : ''}{step.actor_name}
                                                                                        </span>
                                                                                    )}
                                                                                    {step.location_name && (
                                                                                        <span className="flex items-center gap-1 font-semibold">
                                                                                            <MapPin className="w-2.5 h-2.5" />
                                                                                            {step.location_name}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Tab: Sightings & Map View */}
                {activeTab === 'sightings' && (
                    <div>
                        {scans.length === 0 ? (
                            <div className="py-20 bg-white dark:bg-slate-900 rounded-[3rem] border-2 border-dashed border-gray-200 dark:border-slate-800 flex flex-col items-center justify-center text-center p-6">
                                <div className="w-16 h-16 bg-orange-50 dark:bg-orange-950/40 rounded-full flex items-center justify-center text-[#F97316] mb-4">
                                    <MapPin className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-black text-[#1a1208] dark:text-white uppercase">No Scan Locations Yet</h3>
                                <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-2 max-w-sm">
                                    When someone scans {pet.pet_name}'s smart QR tag, geographic pin locations will populate here.
                                </p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                                {/* Left Column: Scan Cards */}
                                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                                    {scans.map((scan) => {
                                        const isPending = scan.status === 'PENDING';
                                        const isConfirmed = scan.status === 'CONFIRMED';


                                        return (
                                            <div
                                                key={scan.scan_id}
                                                className={`bg-white dark:bg-[#151C2C] rounded-3xl border p-5 sm:p-6 space-y-4 shadow-sm hover:shadow-md transition-all ${
                                                    isPending
                                                        ? 'border-amber-400/50 ring-2 ring-amber-400/20'
                                                        : 'border-gray-100 dark:border-slate-800'
                                                }`}
                                            >
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[9px] font-black text-[#F97316] bg-orange-50 dark:bg-orange-950/40 px-2.5 py-1 rounded-full uppercase tracking-widest">
                                                                {scan.location_type}
                                                            </span>
                                                            <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider ${
                                                                isConfirmed
                                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                                    : isPending
                                                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                                                    : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                                            }`}>
                                                                {scan.status}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-2">
                                                            {new Date(scan.scanned_at).toLocaleString()}
                                                        </p>
                                                    </div>
                                                    <span className="text-[9px] font-black text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded uppercase">
                                                        Scan #{scan.scan_id}
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 border-t border-gray-50 dark:border-slate-800 pt-3">
                                                    <div>
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Finder</span>
                                                        <span className="text-xs font-black text-gray-800 dark:text-white uppercase">{scan.finder_name || "Guest Finder"}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Contact</span>
                                                        <span className="text-xs font-black text-gray-800 dark:text-white">{scan.finder_contact || "No phone provided"}</span>
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Location</span>
                                                    <span className="text-xs font-bold text-gray-700 dark:text-slate-300 block">
                                                        {[scan.street_address, scan.barangay, scan.city].filter(Boolean).join(', ') || "Coordinates Captured"}
                                                    </span>
                                                    {scan.landmark && (
                                                        <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400 block">
                                                            📍 {scan.landmark}
                                                        </span>
                                                    )}
                                                </div>

                                                {scan.notes && (
                                                    <div className="bg-gray-50 dark:bg-slate-900 rounded-xl p-3 border border-gray-100 dark:border-slate-800">
                                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">Finder Notes</span>
                                                        <p className="text-xs font-medium text-gray-600 dark:text-slate-400">"{scan.notes}"</p>
                                                    </div>
                                                )}

                                                {isPending && (
                                                    <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleOpenRecoveryModal(scan)}
                                                            className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                                                        >
                                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                                            <span>Confirm Recovery</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Right Column: Sighting Map */}
                                <div className="h-[70vh] rounded-[2.5rem] overflow-hidden border border-gray-100 dark:border-slate-800 shadow-xl bg-gray-50 dark:bg-slate-900 relative">
                                    <MapComponent
                                        center={mapCenter}
                                        zoom={15}
                                        markers={mapMarkers}
                                        showHeatmap={false}
                                        showGeofence={false}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* Reusable Pet Recovery Confirmation Modal */}
            <PetRecoveryModal
                isOpen={isRecoveryModalOpen}
                onClose={() => setIsRecoveryModalOpen(false)}
                scanData={selectedScanForModal}
                onConfirmed={handleRecoveryConfirmed}
                onRejected={handleRecoveryRejected}
            />
        </div>
    );
};

export default PetScanHistoryPage;
