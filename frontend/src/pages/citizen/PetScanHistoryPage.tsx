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
    ChevronRight
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
            const petRes = await api.get(`/pets/${petId}`);
            setPet(petRes.data);

            const [scansRes, historyRes] = await Promise.all([
                api.get(`/pets/${petId}/scan-history`).catch(() => ({ data: [] })),
                api.get(`/pets/${petId}/history`).catch(() => ({ data: [] }))
            ]);

            setScans(scansRes.data || []);
            setHistoryLogs(historyRes.data || []);
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
                        {historyLogs.length === 0 && scans.length === 0 ? (
                            <div className="py-20 bg-white dark:bg-slate-900 rounded-[3rem] border-2 border-dashed border-gray-200 dark:border-slate-800 flex flex-col items-center justify-center text-center p-6">
                                <div className="w-16 h-16 bg-orange-50 dark:bg-orange-950/40 rounded-full flex items-center justify-center text-[#F97316] mb-4">
                                    <History className="w-8 h-8" />
                                </div>
                                <h3 className="text-lg font-black text-[#1a1208] dark:text-white uppercase">No Timeline Events Yet</h3>
                                <p className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-widest mt-2 max-w-sm">
                                    When {pet.pet_name}'s QR tag is scanned, or when recovery confirmation occurs, events are permanently recorded here.
                                </p>
                            </div>
                        ) : (
                            <div className="relative border-l-2 border-orange-500/20 dark:border-slate-800 ml-4 sm:ml-8 pl-6 sm:pl-8 space-y-6 sm:space-y-8">
                                {historyLogs.map((log) => {
                                    const isRecoveryConfirmed = log.event_type === 'OWNER_CONFIRMED_RECOVERY';
                                    const isScanEvent = log.event_type === 'QR_TAG_SCANNED';
                                    const isRejected = log.event_type === 'RECOVERY_REJECTED';

                                    const eventDate = new Date(log.created_at).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        year: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                        hour12: true
                                    });

                                    return (
                                        <div key={log.history_id} className="relative group">
                                            {/* Node Marker */}
                                            <div className={`absolute -left-[35px] sm:-left-[43px] top-1.5 w-7 h-7 sm:w-8 sm:h-8 rounded-full border-4 border-white dark:border-[#121212] flex items-center justify-center shadow-md transition-transform group-hover:scale-110 ${
                                                isRecoveryConfirmed
                                                    ? 'bg-emerald-500 text-white'
                                                    : isScanEvent
                                                    ? 'bg-orange-500 text-white'
                                                    : isRejected
                                                    ? 'bg-rose-500 text-white'
                                                    : 'bg-blue-500 text-white'
                                            }`}>
                                                {isRecoveryConfirmed ? (
                                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                                ) : isScanEvent ? (
                                                    <PawPrint className="w-3.5 h-3.5" />
                                                ) : isRejected ? (
                                                    <XCircle className="w-3.5 h-3.5" />
                                                ) : (
                                                    <ShieldCheck className="w-3.5 h-3.5" />
                                                )}
                                            </div>

                                            {/* Event Card */}
                                            <div className="bg-white dark:bg-[#151C2C] rounded-2xl sm:rounded-3xl border border-gray-100 dark:border-slate-800 shadow-md p-5 sm:p-6 space-y-3 hover:shadow-xl transition-all">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`px-2.5 py-1 rounded-xl text-[9px] font-black uppercase tracking-wider ${
                                                            isRecoveryConfirmed
                                                                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                                                : isScanEvent
                                                                ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/20'
                                                                : isRejected
                                                                ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                                                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                                                        }`}>
                                                            {log.title}
                                                        </span>
                                                        {log.recovery_method && (
                                                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 rounded-lg text-[9px] font-bold">
                                                                Method: {log.recovery_method}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-gray-400 dark:text-slate-500 flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {eventDate}
                                                    </span>
                                                </div>

                                                <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-slate-200 leading-relaxed">
                                                    {log.description}
                                                </p>

                                                {/* Meta Details Pills */}
                                                <div className="pt-2 border-t border-gray-100 dark:border-slate-800/80 flex flex-wrap items-center gap-3 text-[11px]">
                                                    {log.actor_name && (
                                                        <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1 font-bold">
                                                            <User className="w-3 h-3" />
                                                            {log.actor_role ? `${log.actor_role}: ` : ''}{log.actor_name}
                                                        </span>
                                                    )}
                                                    {log.location_name && (
                                                        <span className="text-gray-500 dark:text-slate-400 flex items-center gap-1 font-bold">
                                                            <MapPin className="w-3 h-3" />
                                                            {log.location_name}
                                                        </span>
                                                    )}
                                                    {log.previous_status && log.new_status && log.previous_status !== log.new_status && (
                                                        <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                                                            Status: {log.previous_status} → {log.new_status}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
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
