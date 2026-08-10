import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import MapComponent from '../../components/MapComponent';

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
    scanned_at: string;
}

interface PetDetails {
    pet_id: number;
    pet_name: string;
    photo_url: string;
}

const PetScanHistoryPage = () => {
    const { petId } = useParams<{ petId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const isSubdMode = searchParams.get('mode') === 'subd';
    
    const [scans, setScans] = useState<ScanRecord[]>([]);
    const [pet, setPet] = useState<PetDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const currentUser = isSubdMode
        ? JSON.parse(localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user') || 'null')
        : JSON.parse(localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user') || 'null');

    const backPath = isSubdMode ? '/subd/pet-records' : '/resident/pets';
    const loginPath = isSubdMode ? '/staff/login' : '/login';

    useEffect(() => {
        if (!currentUser) {
            navigate(loginPath);
            return;
        }
        fetchScanHistory();
    }, [petId]);

    const fetchScanHistory = async () => {
        try {
            setLoading(true);
            const petRes = await axios.get(`http://localhost:8000/pets/${petId}`);
            setPet(petRes.data);

            const scansRes = await axios.get(`http://localhost:8000/pets/${petId}/scan-history`);
            setScans(scansRes.data);
        } catch (err) {
            console.error("Failed to fetch scan history:", err);
            setError("Failed to retrieve scan logs.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center">
                <div className="text-center">
                    <div className="w-12 h-12 border-4 border-[#F97316]/20 border-t-[#F97316] rounded-full animate-spin mb-4 mx-auto"></div>
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest animate-pulse">Syncing Scan Logs</span>
                </div>
            </div>
        );
    }

    if (error || !pet) {
        return (
            <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h3 className="text-xl font-black text-[#1a1208] uppercase">Retrieval Failed</h3>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">{error || "Pet not found."}</p>
                    <button 
                        onClick={() => navigate(backPath)}
                        className="mt-6 px-6 py-3.5 bg-[#1a1208] text-white text-xs font-black uppercase tracking-widest rounded-xl"
                    >
                        Back to Pets
                    </button>
                </div>
            </div>
        );
    }

    // Convert scan logs to Leaflet map markers
    const mapMarkers = scans
        .filter(s => s.scan_lat !== null && s.scan_lng !== null)
        .map(s => ({
            id: s.scan_id,
            lat: Number(s.scan_lat),
            lng: Number(s.scan_lng),
            title: s.notes || `Scanned by ${s.finder_name || 'Guest'}`,
            priority: 'Medium',
            time: new Date(s.scanned_at).toLocaleString(),
            category: s.location_type || 'Found Location'
        }));

    // Center map on the most recent scan, or default subdivision HQ center
    const defaultCenter: [number, number] = [14.806906, 121.0039297];
    const mapCenter: [number, number] = mapMarkers.length > 0 
        ? [mapMarkers[0].lat, mapMarkers[0].lng] 
        : defaultCenter;

    return (
        <div className="min-h-screen bg-[#FAFAF9] font-sans pb-24">
            {isSubdMode ? <SubdNavbar /> : <ResiNavbar />}

            <main className="max-w-6xl mx-auto p-4 sm:p-8 pt-24 sm:pt-32 space-y-8">
                
                {/* Header block */}
                <div>
                    <button 
                        onClick={() => navigate(backPath)}
                        className="text-xs font-black uppercase text-gray-400 hover:text-[#F97316] tracking-widest flex items-center gap-2 mb-2 transition-colors"
                    >
                        ← Back to Pet Records
                    </button>
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-full overflow-hidden border border-gray-100 shadow-sm bg-gray-50 shrink-0">
                                <img 
                                    src={getPetPicture(pet.photo_url)} 
                                    alt={pet.pet_name} 
                                    className="w-full h-full object-cover" 
                                    onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-[#1a1208] uppercase tracking-tighter">Scan Sighting <span className="text-[#F97316]">History</span></h1>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Geographical logs for {pet.pet_name}</p>
                        </div>
                    </div>
                </div>

                {scans.length === 0 ? (
                    <div className="py-20 bg-white rounded-[3rem] border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center text-[#F97316] mb-6">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 11v1m4-12h1a2 2 0 012 2v1m-9 9h1a2 2 0 012 2v1M4 12H3m18 0h-1m-2-5H8a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V9a2 2 0 00-2-2z" />
                            </svg>
                        </div>
                        <h3 className="text-lg font-black text-[#1a1208] uppercase">No Scan Logs Yet</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2 px-6">
                            Once someone scans your pet's smart collar tag, sighting details and GPS maps will populate here.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Left Column: Sighting List */}
                        <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
                            {scans.map((scan) => (
                                <div key={scan.scan_id} className="bg-white rounded-[2rem] border border-gray-100 shadow-xl p-6 space-y-4 hover:shadow-2xl transition-all duration-300">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <span className="text-[10px] font-black text-[#F97316] bg-orange-50 px-2.5 py-1 rounded-full uppercase tracking-widest">
                                                {scan.location_type}
                                            </span>
                                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">
                                                {new Date(scan.scanned_at).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[9px] font-black text-stone-700 bg-stone-50 px-2 py-0.5 rounded uppercase tracking-wider block">
                                                ID: #{scan.scan_id}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 border-t border-gray-50 pt-4">
                                        <div>
                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Finder Name</span>
                                            <span className="text-xs font-black text-stone-800 uppercase">{scan.finder_name || "Guest Finder"}</span>
                                        </div>
                                        <div>
                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Finder Contact</span>
                                            <span className="text-xs font-black text-stone-800">{scan.finder_contact || "No contact shared"}</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Address Details</span>
                                        <span className="text-xs font-bold text-stone-700 leading-normal block">
                                            {[scan.street_address, scan.barangay, scan.city].filter(Boolean).join(', ') || "No Address Captured"}
                                        </span>
                                        {scan.landmark && (
                                            <span className="text-[11px] font-bold text-stone-500 block italic">
                                                📍 Landmark: {scan.landmark}
                                            </span>
                                        )}
                                    </div>

                                    {scan.notes && (
                                        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                                            <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">Message from Finder</span>
                                            <p className="text-xs font-medium text-stone-600 leading-normal">"{scan.notes}"</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Right Column: Sighting Map */}
                        <div className="h-[70vh] rounded-[2.5rem] overflow-hidden border border-gray-100 shadow-xl bg-gray-50 relative">
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
            </main>
        </div>
    );
};

export default PetScanHistoryPage;
