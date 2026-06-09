import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MapContainer, TileLayer, Marker, Popup, Polygon } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';

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

const SELERA_POLYGON = [
    { lat: 14.801496, lng: 121.005174 },
    { lat: 14.799577, lng: 121.003911 },
    { lat: 14.800634, lng: 121.002228 },
    { lat: 14.802461, lng: 121.003280 }
];

// Mock database for citizen matches and claims
const MOCK_RESIDENT_CLAIMS = [
    {
        claim_id: 101,
        report_id: 2004,
        pet_id: 1,
        status: "Pending Review",
        remarks: "Subdivision staff is reviewing the submitted vaccination files. Please wait for coordinates verification.",
        similarity_score: 94.5,
        reported_date: "2026-06-05",
        sighting_location: "Phase 2, Selera Homes",
        sighting_lat: 14.8018,
        sighting_lng: 121.0035,
        description: "Belgian Shepherd seen drinking water near the basketball court. Friendly, responded to name whistle, wearing no collar.",
        sighting_photo: "https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?w=600&auto=format&fit=crop",
        
        pet: {
            pet_name: "Bruno",
            pet_type: "Dog",
            breed: "Belgian Shepherd",
            gender: "Male",
            primary_color: "Brown",
            secondary_color: "Black",
            distinctive_markings: "Black muzzle, tan socks, small white patch on chest",
            registered_address: "Blk 4 Lot 12, Phase 2, Selera Homes",
            registered_latitude: 14.801496,
            registered_longitude: 121.003280,
            photo_url: "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop"
        },
        
        evidence_url: "https://images.unsplash.com/photo-1584036561566-baf241f8022a?w=600&auto=format&fit=crop",
        previous_photos: [
            "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&auto=format&fit=crop"
        ],
        supporting_docs: ["vaccine_cert.pdf", "owner_license_bruno.png"],
        owner_notes: "Bruno escaped through the main gate when deliveries were arriving. He's very gentle."
    },
    {
        claim_id: 102,
        report_id: 2005,
        pet_id: 2,
        status: "Evidence Requested",
        remarks: "Please upload a clearer scan of the official vaccine registration booklet showing the veterinarian stamp.",
        similarity_score: 89.2,
        reported_date: "2026-06-04",
        sighting_location: "Block 4, Selera Homes",
        sighting_lat: 14.8005,
        sighting_lng: 121.0042,
        description: "Siamese cat spotted sitting on top of the brick boundary wall.",
        sighting_photo: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop",
        
        pet: {
            pet_name: "Luna",
            pet_type: "Cat",
            breed: "Siamese",
            gender: "Female",
            primary_color: "Cream",
            secondary_color: "Brown",
            distinctive_markings: "Dark point markings on tail, ears and face",
            registered_address: "Blk 12 Lot 3, Selera Homes",
            registered_latitude: 14.8002,
            registered_longitude: 121.0040,
            photo_url: "https://images.unsplash.com/photo-1533738363-b7f9aef128ce?w=600&auto=format&fit=crop"
        },
        
        evidence_url: "",
        previous_photos: [
            "https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=600&auto=format&fit=crop"
        ],
        supporting_docs: [],
        owner_notes: "Luna wears a silver collar with a tiny bell."
    },
    {
        claim_id: 103,
        report_id: 2006,
        pet_id: 3,
        status: "Approved",
        remarks: "Ownership claim verified. Please coordinate with subdivision security center for handoff.",
        similarity_score: 95.8,
        reported_date: "2026-06-03",
        sighting_location: "Phase 3, Selera Homes",
        sighting_lat: 14.8022,
        sighting_lng: 121.0028,
        description: "A fluffy white cat resting near the clubhouse garden.",
        sighting_photo: "https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=600&auto=format&fit=crop",
        
        pet: {
            pet_name: "Bella",
            pet_type: "Cat",
            breed: "Mixed Breed",
            gender: "Female",
            primary_color: "White",
            secondary_color: "None",
            distinctive_markings: "Heterochromia, pink collar, fluffy tail",
            registered_address: "Blk 8 Lot 5, Phase 3, Selera Homes",
            registered_latitude: 14.802461,
            registered_longitude: 121.003280,
            photo_url: "https://images.unsplash.com/photo-1518791841217-8f162f1e1131?w=600&auto=format&fit=crop"
        },
        
        evidence_url: "https://images.unsplash.com/photo-1584036561566-baf241f8022a?w=600&auto=format&fit=crop",
        previous_photos: [],
        supporting_docs: ["bellapassport.pdf"],
        owner_notes: "She is very friendly and vocal when hungry. Thank you so much!"
    },
    {
        claim_id: 104,
        report_id: 2007,
        pet_id: 4,
        status: "Rejected",
        remarks: "Sighting report details a light brown retriever whereas the registered pet is a black shepherd mix.",
        similarity_score: 61.3,
        reported_date: "2026-06-02",
        sighting_location: "Subdivision Gate 1",
        sighting_lat: 14.8010,
        sighting_lng: 121.0048,
        description: "A large golden retriever sitting quietly near the entrance guardhouse.",
        sighting_photo: "https://images.unsplash.com/photo-1552053831-71594a27632d?w=600&auto=format&fit=crop",
        
        pet: {
            pet_name: "Rocky",
            pet_type: "Dog",
            breed: "German Shepherd",
            gender: "Male",
            primary_color: "Black",
            secondary_color: "Tan",
            distinctive_markings: "Floppy right ear, white spot on left paw",
            registered_address: "Blk 1 Lot 9, Selera Homes",
            registered_latitude: 14.799577,
            registered_longitude: 121.003911,
            photo_url: "https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?w=600&auto=format&fit=crop"
        },
        
        evidence_url: "",
        previous_photos: [],
        supporting_docs: [],
        owner_notes: "Rocky was lost near gate 1."
    },
    {
        claim_id: 105,
        report_id: 2008,
        pet_id: 5,
        status: "Possible Match Found",
        remarks: "",
        similarity_score: 91.7,
        reported_date: "2026-06-06",
        sighting_location: "Selera Park Playground",
        sighting_lat: 14.8015,
        sighting_lng: 121.0030,
        description: "Brown puppy running around the slide. Super playful.",
        sighting_photo: "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&auto=format&fit=crop",
        
        pet: {
            pet_name: "Buddy",
            pet_type: "Dog",
            breed: "Aspin",
            gender: "Male",
            primary_color: "Brown",
            secondary_color: "White",
            distinctive_markings: "White chest patch, white tail tip",
            registered_address: "Blk 5 Lot 8, Selera Homes",
            registered_latitude: 14.800634,
            registered_longitude: 121.002228,
            photo_url: "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&auto=format&fit=crop"
        },
        
        evidence_url: "",
        previous_photos: [],
        supporting_docs: [],
        owner_notes: ""
    }
];

const PetClaimsDashboard = () => {
    const navigate = useNavigate();
    
    // Core states
    const [claims, setClaims] = useState<any[]>(MOCK_RESIDENT_CLAIMS);
    const [selectedClaim, setSelectedClaim] = useState<any>(MOCK_RESIDENT_CLAIMS[0]);
    const [statusFilter, setStatusFilter] = useState('All Claims');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeDetailTab, setActiveDetailTab] = useState<'compare' | 'evidence' | 'timeline' | 'map'>('compare');
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    
    // Evidence submission state
    const [evidenceNotes, setEvidenceNotes] = useState('');
    const [vaccineAttached, setVaccineAttached] = useState<string | null>(null);
    const [petPhotosAttached, setPetPhotosAttached] = useState<string[]>([]);
    const [supportingDocsAttached, setSupportingDocsAttached] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Notifications state
    const [notifications, setNotifications] = useState<any[]>([
        { id: 1, text: "AI detected a 94.5% potential match for Bruno in Selera Homes", time: "2 hours ago", type: "match" },
        { id: 2, text: "Evidence requested for Siamese Cat Luna match", time: "1 day ago", type: "action" },
        { id: 3, text: "Claim for Bella has been approved by Barangay Officials", time: "3 days ago", type: "success" }
    ]);

    const userStr = localStorage.getItem('resident_user');
    const residentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (!residentUser) {
            navigate('/login');
            return;
        }
        fetchResidentClaims();
    }, []);

    const fetchResidentClaims = async () => {
        try {
            // Attempt fetching claims registered to the user
            const res = await axios.get(`http://localhost:8000/claims/?owner_id=${residentUser.user_id}`);
            if (res.data && res.data.length > 0) {
                // Merge real DB claims with our mockup claims
                const transformed = res.data.map((c: any) => {
                    const matchedMock = MOCK_RESIDENT_CLAIMS.find(m => m.report_id === c.report_id);
                    return {
                        claim_id: c.claim_id,
                        report_id: c.report_id,
                        pet_id: c.pet_id,
                        status: c.status,
                        remarks: c.remarks || "",
                        similarity_score: matchedMock?.similarity_score || 90.0,
                        reported_date: c.report?.created_at?.slice(0, 10) || "2026-06-06",
                        sighting_location: c.report?.landmark || "Selera Homes",
                        sighting_lat: c.report?.latitude ? parseFloat(c.report.latitude) : 14.8018,
                        sighting_lng: c.report?.longitude ? parseFloat(c.report.longitude) : 121.0035,
                        description: c.report?.description || "Sighted stray animal",
                        sighting_photo: c.report?.media?.[0]?.file_url || "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&auto=format&fit=crop",
                        pet: {
                            pet_name: c.pet?.pet_name || "Unknown",
                            pet_type: c.pet?.pet_type || "Dog",
                            breed: c.pet?.breed || "Aspin",
                            gender: c.pet?.gender || "Male",
                            primary_color: c.pet?.primary_color || "Brown",
                            secondary_color: c.pet?.secondary_color || "",
                            distinctive_markings: c.pet?.distinctive_markings || "",
                            registered_address: c.pet?.registered_address || "Selera Homes",
                            registered_latitude: c.pet?.registered_latitude ? parseFloat(c.pet.registered_latitude) : 14.801496,
                            registered_longitude: c.pet?.registered_longitude ? parseFloat(c.pet.registered_longitude) : 121.003280,
                            photo_url: c.pet?.photo_url || "https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=600&auto=format&fit=crop"
                        },
                        evidence_url: c.evidence_url || "",
                        previous_photos: matchedMock?.previous_photos || [],
                        supporting_docs: matchedMock?.supporting_docs || [],
                        owner_notes: c.remarks || ""
                    };
                });
                
                const merged = [...transformed];
                MOCK_RESIDENT_CLAIMS.forEach(mock => {
                    if (!merged.some(m => m.report_id === mock.report_id)) {
                        merged.push(mock);
                    }
                });
                setClaims(merged);
                setSelectedClaim(merged[0]);
            }
        } catch (err) {
            console.warn("Unable to fetch resident claims, relying on client simulation", err);
        }
    };

    // Simulate Claim Submission / Evidence Upload
    const handleSimulatedSubmitClaim = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClaim) return;
        setIsSubmitting(true);
        
        setTimeout(() => {
            const updated = claims.map(c => {
                if (c.claim_id === selectedClaim.claim_id) {
                    return {
                        ...c,
                        status: c.status === "Possible Match Found" ? "Pending Review" : c.status,
                        owner_notes: evidenceNotes,
                        evidence_url: vaccineAttached || "https://images.unsplash.com/photo-1584036561566-baf241f8022a?w=600&auto=format&fit=crop",
                        previous_photos: petPhotosAttached.length > 0 ? petPhotosAttached : ["https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&auto=format&fit=crop"],
                        supporting_docs: supportingDocsAttached.length > 0 ? supportingDocsAttached : ["microchip_record.pdf"]
                    };
                }
                return c;
            });
            
            setClaims(updated);
            const activeClaim = updated.find(c => c.claim_id === selectedClaim.claim_id);
            setSelectedClaim(activeClaim);
            setIsSubmitting(false);

            // Add simulated notification
            const newNotif = {
                id: Date.now(),
                text: `Successfully submitted claim documents for ${activeClaim.pet.pet_name}!`,
                time: "Just now",
                type: "success"
            };
            setNotifications([newNotif, ...notifications]);

            alert(`[Simulation Success] Ownership documents filed for ${activeClaim.pet.pet_name}. Status updated.`);
            setEvidenceNotes('');
            setVaccineAttached(null);
            setPetPhotosAttached([]);
            setSupportingDocsAttached([]);
        }, 1000);
    };

    // Filter Logic
    const filteredClaims = claims.filter(c => {
        const query = searchQuery.toLowerCase();
        const matchesQuery = 
            c.pet.pet_name.toLowerCase().includes(query) ||
            c.pet.breed.toLowerCase().includes(query) ||
            c.sighting_location.toLowerCase().includes(query);

        const matchesFilter = 
            statusFilter === 'All Claims' ||
            c.status.toLowerCase() === statusFilter.toLowerCase();

        return matchesQuery && matchesFilter;
    });

    // Stats calculations
    const stats = {
        total: claims.length,
        matchFound: claims.filter(c => c.status === "Possible Match Found").length,
        pendingReview: claims.filter(c => c.status === "Pending Review").length,
        evidenceReq: claims.filter(c => c.status === "Evidence Requested").length,
        approved: claims.filter(c => c.status === "Approved").length,
        rejected: claims.filter(c => c.status === "Rejected").length
    };

    // Timeline helpers
    const getTimelineProgress = (status: string) => {
        return [
            { step: "Potential Match Found", done: true, desc: "AI Matching system detected a similarity score above the safety threshold." },
            { step: "Claim Submitted", done: status !== "Possible Match Found", desc: "Citizen claimed matching identity and supplied verification notes." },
            { step: "Under Review", done: ["Pending Review", "Evidence Requested", "Approved", "Rejected"].includes(status), desc: "Barangay / Subdivision administrators reviewing the documentation." },
            { step: "Evidence Requested", done: ["Evidence Requested", "Approved", "Rejected"].includes(status), active: status === "Evidence Requested", desc: "Verification team requested addition vaccination files." },
            { step: status === "Rejected" ? "Rejected" : "Approved", done: ["Approved", "Rejected"].includes(status), highlight: ["Approved", "Rejected"].includes(status), success: status === "Approved", desc: status === "Approved" ? "Ownership established. Sighting record closed." : "Ownership matching rejected." }
        ];
    };

    return (
        <div className="min-h-screen bg-[#F7F7F7] font-sans pb-24 text-gray-800">
            <ResiNavbar onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)} />

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 sm:pt-32 pb-24 md:pb-8 flex flex-col gap-8">
                
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-black text-[#1a1208] uppercase tracking-tight">
                            My <span className="text-[#F97316]">Pet Claims</span>
                        </h1>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1.5">
                            Respond to AI-generated pet matches and view claims status
                        </p>
                    </div>

                    {/* Notifications Button */}
                    <div className="relative bg-white border border-gray-150 rounded-2xl p-3 shadow-sm flex items-center gap-2 max-w-sm">
                        <span className="text-xs">🔔</span>
                        <div className="text-left">
                            <p className="text-[9px] font-black text-[#F97316] uppercase tracking-wider leading-none">Latest Update</p>
                            <p className="text-[10px] font-bold text-gray-650 truncate max-w-[220px] mt-1">{notifications[0]?.text}</p>
                        </div>
                    </div>
                </div>

                {/* Dashboard Stats */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div 
                        onClick={() => setStatusFilter("All Claims")}
                        className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer hover:shadow-md ${statusFilter === 'All Claims' ? 'border-[#F97316] ring-1 ring-[#F97316]/30' : 'border-gray-150'}`}
                    >
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-wider leading-none">Total Matches</p>
                        <p className="text-xl font-black text-[#1a1208] mt-1.5">{stats.total}</p>
                    </div>
                    <div 
                        onClick={() => setStatusFilter("Possible Match Found")}
                        className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer hover:shadow-md ${statusFilter === 'Possible Match Found' ? 'border-orange-500 ring-1 ring-orange-500/30' : 'border-gray-150'}`}
                    >
                        <p className="text-[9px] font-black text-orange-500 uppercase tracking-wider leading-none">Possible Matches</p>
                        <p className="text-xl font-black text-orange-600 mt-1.5">{stats.matchFound}</p>
                    </div>
                    <div 
                        onClick={() => setStatusFilter("Pending Review")}
                        className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer hover:shadow-md ${statusFilter === 'Pending Review' ? 'border-amber-500 ring-1 ring-amber-500/30' : 'border-gray-150'}`}
                    >
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-wider leading-none">Pending Review</p>
                        <p className="text-xl font-black text-amber-600 mt-1.5">{stats.pendingReview}</p>
                    </div>
                    <div 
                        onClick={() => setStatusFilter("Evidence Requested")}
                        className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer hover:shadow-md ${statusFilter === 'Evidence Requested' ? 'border-blue-500 ring-1 ring-blue-500/30' : 'border-gray-150'}`}
                    >
                        <p className="text-[9px] font-black text-blue-500 uppercase tracking-wider leading-none">Evidence Req.</p>
                        <p className="text-xl font-black text-blue-600 mt-1.5">{stats.evidenceReq}</p>
                    </div>
                    <div 
                        onClick={() => setStatusFilter("Approved")}
                        className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer hover:shadow-md ${statusFilter === 'Approved' ? 'border-green-500 ring-1 ring-green-500/30' : 'border-gray-150'}`}
                    >
                        <p className="text-[9px] font-black text-green-500 uppercase tracking-wider leading-none">Approved</p>
                        <p className="text-xl font-black text-green-600 mt-1.5">{stats.approved}</p>
                    </div>
                    <div 
                        onClick={() => setStatusFilter("Rejected")}
                        className={`bg-white rounded-2xl p-4 border transition-all cursor-pointer hover:shadow-md ${statusFilter === 'Rejected' ? 'border-red-500 ring-1 ring-red-500/30' : 'border-gray-150'}`}
                    >
                        <p className="text-[9px] font-black text-red-500 uppercase tracking-wider leading-none">Rejected</p>
                        <p className="text-xl font-black text-red-600 mt-1.5">{stats.rejected}</p>
                    </div>
                </div>

                {/* Workspace Split Panel */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch min-h-[550px]">
                    
                    {/* Left: Claim Card list (Col span 4) */}
                    <div className="lg:col-span-4 bg-white rounded-3xl p-5 border border-gray-150 shadow-sm flex flex-col gap-4">
                        <div className="space-y-3 shrink-0">
                            <h3 className="text-xs font-black text-[#1a1208] uppercase tracking-widest pl-1">Stray Match History</h3>
                            <input 
                                type="text"
                                placeholder="🔍 Search by location or breed..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-11 px-4 bg-[#FAFAF9] border border-gray-150 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-[#F97316]/20 transition-all"
                            />
                        </div>

                        {/* Card List Container */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1">
                            {filteredClaims.length === 0 ? (
                                <div className="text-center py-12 text-gray-300">
                                    <p className="text-xs font-bold uppercase tracking-widest">No matching claims found</p>
                                </div>
                            ) : (
                                filteredClaims.map((c) => (
                                    <div 
                                        key={c.claim_id}
                                        onClick={() => {
                                            setSelectedClaim(c);
                                            setActiveDetailTab('compare');
                                        }}
                                        className={`p-4 rounded-2xl border transition-all cursor-pointer flex gap-3.5 hover:shadow-md ${
                                            selectedClaim?.claim_id === c.claim_id 
                                            ? 'bg-orange-50/40 border-orange-200 ring-1 ring-orange-200 shadow-sm' 
                                            : 'bg-white border-gray-150'
                                        }`}
                                    >
                                        <div className="w-16 h-16 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shrink-0">
                                            <img src={c.sighting_photo} alt={c.pet.pet_name} className="w-full h-full object-cover" />
                                        </div>
                                        
                                        <div className="min-w-0 flex-1 flex flex-col justify-between">
                                            <div className="flex justify-between items-start gap-1">
                                                <h4 className="text-xs font-black text-[#1a1208] uppercase truncate leading-tight">{c.pet.pet_name}</h4>
                                                <span className="text-[9px] font-black text-[#F97316] bg-orange-50 px-1.5 py-0.5 rounded leading-none shrink-0">
                                                    {c.similarity_score}% Match
                                                </span>
                                            </div>
                                            <p className="text-[9.5px] font-semibold text-gray-500 truncate mt-0.5">Loc: {c.sighting_location}</p>
                                            <div className="flex justify-between items-center mt-2">
                                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest">{c.reported_date}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-widest border leading-none shrink-0 ${
                                                    c.status === 'Approved' ? 'bg-green-50 border-green-100 text-green-600' :
                                                    c.status === 'Rejected' ? 'bg-red-50 border-red-100 text-red-600' :
                                                    c.status === 'Evidence Requested' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                                                    c.status === 'Possible Match Found' ? 'bg-orange-50 border-orange-100 text-[#F97316]' :
                                                    'bg-amber-50 border-amber-100 text-amber-600'
                                                }`}>
                                                    {c.status}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Right: Claim Details Container (Col span 8) */}
                    <div className="lg:col-span-8 flex flex-col">
                        {selectedClaim ? (
                            <div className="bg-white rounded-3xl border border-gray-150 shadow-sm p-6 sm:p-8 flex flex-col justify-between flex-1">
                                
                                {/* Detail Header */}
                                <div className="flex justify-between items-start border-b border-gray-100 pb-5 shrink-0 gap-4 flex-wrap">
                                    <div>
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <h3 className="text-xl font-black text-[#1a1208] uppercase tracking-tight">{selectedClaim.pet.pet_name} Match Comparison</h3>
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                                                selectedClaim.status === 'Approved' ? 'bg-green-50 border-green-100 text-green-600' :
                                                selectedClaim.status === 'Rejected' ? 'bg-red-50 border-red-100 text-red-600' :
                                                selectedClaim.status === 'Evidence Requested' ? 'bg-blue-50 border-blue-100 text-blue-600' :
                                                selectedClaim.status === 'Possible Match Found' ? 'bg-orange-50 border-orange-100 text-[#F97316]' :
                                                'bg-amber-50 border-amber-100 text-amber-600'
                                            }`}>
                                                {selectedClaim.status}
                                            </span>
                                        </div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                                            Sighting Location: {selectedClaim.sighting_location} • Detected: {selectedClaim.reported_date}
                                        </p>
                                    </div>

                                    {/* Privacy Banner */}
                                    <div className="bg-[#FAFAF9] border border-gray-150 px-3.5 py-2 rounded-2xl flex items-center gap-2 max-w-[280px]">
                                        <span className="text-xs">🔒</span>
                                        <p className="text-[8.5px] font-bold text-gray-500 uppercase tracking-wide leading-normal">
                                            Privacy Protection: Reporter name and owner identities are hidden to prevent community disputes.
                                        </p>
                                    </div>
                                </div>

                                {/* Tabs Navigation */}
                                <div className="flex items-center gap-6 border-b border-gray-100 pb-1 mt-4 shrink-0 overflow-x-auto scrollbar-none">
                                    <button 
                                        onClick={() => setActiveDetailTab('compare')}
                                        className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative shrink-0 cursor-pointer ${
                                            activeDetailTab === 'compare' ? 'text-[#F97316]' : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        Side-by-Side View
                                        {activeDetailTab === 'compare' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#F97316] rounded-t-full" />}
                                    </button>
                                    <button 
                                        onClick={() => setActiveDetailTab('evidence')}
                                        className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative shrink-0 cursor-pointer ${
                                            activeDetailTab === 'evidence' ? 'text-[#F97316]' : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        Filing & Proofs
                                        {activeDetailTab === 'evidence' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#F97316] rounded-t-full" />}
                                    </button>
                                    <button 
                                        onClick={() => setActiveDetailTab('timeline')}
                                        className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative shrink-0 cursor-pointer ${
                                            activeDetailTab === 'timeline' ? 'text-[#F97316]' : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        Claim Timeline
                                        {activeDetailTab === 'timeline' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#F97316] rounded-t-full" />}
                                    </button>
                                    <button 
                                        onClick={() => setActiveDetailTab('map')}
                                        className={`pb-3 text-xs font-black uppercase tracking-widest transition-all relative shrink-0 cursor-pointer ${
                                            activeDetailTab === 'map' ? 'text-[#F97316]' : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                    >
                                        Map verification
                                        {activeDetailTab === 'map' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-[#F97316] rounded-t-full" />}
                                    </button>
                                </div>

                                {/* Tab Contents */}
                                <div className="flex-1 overflow-y-auto py-6 min-h-[300px] max-h-[500px] custom-scrollbar">
                                    
                                    {/* Tab 1: Compare */}
                                    {activeDetailTab === 'compare' && (
                                        <div className="space-y-6 animate-in fade-in duration-300">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {/* Left: Reported stray */}
                                                <div className="space-y-3">
                                                    <span className="text-[9px] font-black text-[#F97316] bg-orange-50 px-2.5 py-1 rounded uppercase tracking-wider">Reported Animal Sighting</span>
                                                    <div className="relative h-56 rounded-2xl overflow-hidden border border-gray-150 shadow-inner group">
                                                        <img src={selectedClaim.sighting_photo} className="w-full h-full object-cover" alt="Sighted animal" />
                                                        <button 
                                                            onClick={() => setLightboxImage(selectedClaim.sighting_photo)}
                                                            className="absolute inset-0 bg-black/40 flex items-center justify-center text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity font-black uppercase tracking-widest cursor-pointer"
                                                        >
                                                            Zoom Photo
                                                        </button>
                                                    </div>
                                                    <div className="bg-[#FAFAF9] rounded-xl p-4 text-xs space-y-1.5 border border-gray-150">
                                                        <p className="font-black text-[#1a1208] uppercase mb-1">AI Sighting Markers</p>
                                                        <p className="text-gray-500 font-bold">Estimated Species: <span className="text-gray-800">{selectedClaim.pet.pet_type}</span></p>
                                                        <p className="text-gray-500 font-bold">AI Breed Match: <span className="text-gray-800">{selectedClaim.pet.breed}</span></p>
                                                        <p className="text-gray-500 font-bold">Description: <span className="text-gray-700 italic font-medium">"{selectedClaim.description}"</span></p>
                                                    </div>
                                                </div>

                                                {/* Right: Registered pet */}
                                                <div className="space-y-3">
                                                    <span className="text-[9px] font-black text-gray-500 bg-gray-100 px-2.5 py-1 rounded uppercase tracking-wider">Your Registered Pet</span>
                                                    <div className="relative h-56 rounded-2xl overflow-hidden border border-gray-150 shadow-inner group">
                                                        <img src={selectedClaim.pet.photo_url} className="w-full h-full object-cover" alt="Registered pet" />
                                                        <button 
                                                            onClick={() => setLightboxImage(selectedClaim.pet.photo_url)}
                                                            className="absolute inset-0 bg-black/40 flex items-center justify-center text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity font-black uppercase tracking-widest cursor-pointer"
                                                        >
                                                            Zoom Photo
                                                        </button>
                                                    </div>
                                                    <div className="bg-[#FAFAF9] rounded-xl p-4 text-xs space-y-1.5 border border-gray-150">
                                                        <p className="font-black text-[#1a1208] uppercase mb-1">Registered Details</p>
                                                        <p className="text-gray-500 font-bold">Pet Name: <span className="text-gray-800 font-black">{selectedClaim.pet.pet_name}</span></p>
                                                        <p className="text-gray-500 font-bold">Breed Profile: <span className="text-gray-800">{selectedClaim.pet.breed}</span></p>
                                                        <p className="text-gray-500 font-bold">Markings: <span className="text-gray-800 font-medium">{selectedClaim.pet.distinctive_markings || "None"}</span></p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* AI matching statistics card */}
                                            <div className="bg-orange-50/20 border border-orange-100 rounded-2xl p-5 space-y-4">
                                                <h4 className="text-xs font-black text-[#F97316] uppercase tracking-widest">AI Sighting Confidence Metrics</h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                    <div className="bg-white p-3 rounded-xl border border-orange-100/50 text-center">
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Visual Similarity</p>
                                                        <p className="text-xl font-black text-[#F97316]">{selectedClaim.similarity_score}%</p>
                                                    </div>
                                                    <div className="bg-white p-3 rounded-xl border border-orange-100/50 text-center">
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Species Match</p>
                                                        <p className="text-sm font-black text-green-600 uppercase mt-1">CONFIRMED</p>
                                                    </div>
                                                    <div className="bg-white p-3 rounded-xl border border-orange-100/50 text-center">
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Breed Analysis</p>
                                                        <p className="text-sm font-black text-green-600 uppercase mt-1">94% PROB</p>
                                                    </div>
                                                    <div className="bg-white p-3 rounded-xl border border-orange-100/50 text-center">
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Color Coats</p>
                                                        <p className="text-sm font-black text-green-600 uppercase mt-1">MATCHED</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 2: Submission & Evidence */}
                                    {activeDetailTab === 'evidence' && (
                                        <div className="space-y-6 animate-in fade-in duration-300">
                                            
                                            {/* Admin remarks if available */}
                                            {selectedClaim.remarks && (
                                                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-xs text-amber-800 leading-relaxed font-semibold">
                                                    ⚠️ Admin Remarks: "{selectedClaim.remarks}"
                                                </div>
                                            )}

                                            {/* Evidence submission form */}
                                            <form onSubmit={handleSimulatedSubmitClaim} className="space-y-5">
                                                <div className="bg-gray-50 rounded-2xl p-5 border border-gray-150 space-y-4">
                                                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Ownership Verification Submissions</h4>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase leading-normal">
                                                        Provide supportive documentation showing owner matches, past tags, vaccination dates, or other receipts.
                                                    </p>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        {/* Vaccine card simulator */}
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Attach Vaccination Card</label>
                                                            <div className="border border-dashed border-gray-200 bg-white rounded-xl p-3 flex items-center justify-between text-xs">
                                                                <span className="font-semibold text-gray-500">vaccine_record.jpg</span>
                                                                <button 
                                                                    type="button" 
                                                                    onClick={() => setVaccineAttached("https://images.unsplash.com/photo-1584036561566-baf241f8022a?w=600&auto=format&fit=crop")}
                                                                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border transition-all ${
                                                                        vaccineAttached ? 'bg-green-50 text-green-600 border-green-100' : 'bg-orange-50 text-[#F97316] border-orange-100 hover:bg-orange-100'
                                                                    }`}
                                                                >
                                                                    {vaccineAttached ? 'Attached ✓' : 'Upload'}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Previous photos simulator */}
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Previous Pet Photos</label>
                                                            <div className="border border-dashed border-gray-200 bg-white rounded-xl p-3 flex items-center justify-between text-xs">
                                                                <span className="font-semibold text-gray-500">
                                                                    {petPhotosAttached.length > 0 ? `${petPhotosAttached.length} Photo(s) Attached` : 'No Photos'}
                                                                </span>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setPetPhotosAttached([
                                                                        "https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&auto=format&fit=crop",
                                                                        "https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&auto=format&fit=crop"
                                                                    ])}
                                                                    className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-100 rounded-lg text-[#F97316] text-[9px] font-black uppercase tracking-wider transition-all"
                                                                >
                                                                    Attach Files
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Supporting files simulator */}
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Other Documents (PDF/License/Clinic receipts)</label>
                                                        <div className="border border-dashed border-gray-200 bg-white rounded-xl p-3.5 flex items-center justify-between text-xs">
                                                            <span className="font-semibold text-gray-500">
                                                                {supportingDocsAttached.length > 0 ? supportingDocsAttached.join(', ') : 'No legal license attached'}
                                                            </span>
                                                            <button 
                                                                type="button"
                                                                onClick={() => setSupportingDocsAttached(["microchip_record.pdf", "clinic_receipt.png"])}
                                                                className="px-3 py-1.5 bg-orange-50 hover:bg-orange-100 border border-orange-100 rounded-lg text-[#F97316] text-[9px] font-black uppercase tracking-wider transition-all"
                                                            >
                                                                Add PDF
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Owner notes textarea */}
                                                    <div className="space-y-2">
                                                        <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Additional Notes & Verification remarks</label>
                                                        <textarea 
                                                            value={evidenceNotes}
                                                            onChange={(e) => setEvidenceNotes(e.target.value)}
                                                            placeholder="Add descriptions e.g. color of collar worn, answers to name, specific marks, behavior tips..."
                                                            className="w-full h-20 bg-white border border-gray-150 rounded-xl p-3.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 transition-all resize-none"
                                                        />
                                                    </div>
                                                </div>

                                                <button 
                                                    type="submit"
                                                    disabled={isSubmitting || selectedClaim.status === "Approved"}
                                                    className="w-full h-12 bg-[#F97316] hover:bg-[#EA580C] disabled:bg-gray-200 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-orange-100/50 cursor-pointer"
                                                >
                                                    {isSubmitting ? 'Uploading Documents...' : 'Submit Claim Evidence'}
                                                </button>
                                            </form>
                                        </div>
                                    )}

                                    {/* Tab 3: Timeline */}
                                    {activeDetailTab === 'timeline' && (
                                        <div className="space-y-6 animate-in fade-in duration-300">
                                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Process Lifecycle Progress</h4>
                                            
                                            <div className="relative pl-6 space-y-6 border-l-2 border-orange-100 mt-2">
                                                {getTimelineProgress(selectedClaim.status).map((step, idx) => (
                                                    <div key={idx} className="relative">
                                                        <span className={`absolute -left-[31px] top-0.5 w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 text-[8px] font-black ${
                                                            step.done 
                                                            ? (step.success ? 'bg-green-600 border-green-600 text-white' : step.highlight && !step.success ? 'bg-red-600 border-red-600 text-white' : 'bg-[#F97316] border-[#F97316] text-white') 
                                                            : 'bg-white border-gray-300 text-transparent'
                                                        }`}>
                                                            {step.done ? "✓" : ""}
                                                        </span>
                                                        <div>
                                                            <h5 className={`text-xs font-black uppercase tracking-widest leading-none ${
                                                                step.active ? 'text-blue-600 font-extrabold' : step.done ? 'text-gray-900 font-bold' : 'text-gray-400 font-medium'
                                                            }`}>
                                                                {step.step}
                                                            </h5>
                                                            <p className="text-[11px] text-gray-500 mt-1 font-medium leading-relaxed">{step.desc}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Tab 4: Location */}
                                    {activeDetailTab === 'map' && (
                                        <div className="space-y-4 animate-in fade-in duration-300">
                                            <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Sighting Landmark vs Registered Coordinates Pinpoint</h4>
                                            <div className="w-full h-64 rounded-2xl overflow-hidden border border-gray-150 relative z-10 shadow-inner">
                                                <MapContainer
                                                    center={[selectedClaim.sighting_lat, selectedClaim.sighting_lng]}
                                                    zoom={15}
                                                    className="h-full w-full"
                                                >
                                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                                    <Polygon 
                                                        positions={SELERA_POLYGON.map(p => [p.lat, p.lng] as [number, number])}
                                                        pathOptions={{
                                                            color: '#F97316',
                                                            fillColor: '#F97316',
                                                            fillOpacity: 0.08,
                                                            weight: 2,
                                                            dashArray: '5, 8'
                                                        }}
                                                    />
                                                    {/* Sighting position */}
                                                    <Marker position={[selectedClaim.sighting_lat, selectedClaim.sighting_lng]}>
                                                        <Popup>
                                                            <span className="text-[10px] font-black uppercase text-[#F97316]">Report Sighted Sighting Location</span>
                                                        </Popup>
                                                    </Marker>
                                                    {/* Registered owner home */}
                                                    <Marker position={[selectedClaim.pet.registered_latitude, selectedClaim.pet.registered_longitude]}>
                                                        <Popup>
                                                            <span className="text-[10px] font-black uppercase text-gray-600">Your Registered Address</span>
                                                        </Popup>
                                                    </Marker>
                                                </MapContainer>
                                            </div>
                                            <div className="bg-[#FAFAF9] rounded-xl p-4 border border-gray-150 text-xs grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider block">Sighting coordinate readings</span>
                                                    <p className="font-bold text-[#1a1208] mt-0.5">{selectedClaim.sighting_lat.toFixed(6)}, {selectedClaim.sighting_lng.toFixed(6)}</p>
                                                </div>
                                                <div>
                                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider block">Registered Owner coordinates</span>
                                                    <p className="font-bold text-[#1a1208] mt-0.5">{selectedClaim.pet.registered_latitude.toFixed(6)}, {selectedClaim.pet.registered_longitude.toFixed(6)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                </div>

                                {/* Bottom Info panel */}
                                <div className="border-t border-gray-100 pt-5 mt-4 shrink-0 flex items-center justify-between text-xs font-semibold text-gray-400">
                                    <span>Claim Reference ID: #CLM-{(selectedClaim.claim_id).toString()}</span>
                                    <span>Match Score Confidence: {selectedClaim.similarity_score}%</span>
                                </div>

                            </div>
                        ) : (
                            <div className="text-center py-20 bg-white rounded-3xl border border-gray-150 shadow-sm flex flex-col items-center justify-center flex-1">
                                <h2 className="text-2xl font-black uppercase text-gray-800">No Match Selected</h2>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Select an active matching card from the left panel</p>
                            </div>
                        )}
                    </div>

                </div>

            </main>

            <ResiMobileNav
                isNavbarMenuOpen={isNavbarMenuOpen}
                isSearchOpen={false}
            />

            {/* Lightbox Preview */}
            {lightboxImage && (
                <div className="fixed inset-0 z-[2000] bg-stone-900/80 backdrop-blur-md flex items-center justify-center p-4">
                    <div className="relative max-w-3xl w-full flex flex-col items-center gap-4 animate-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => setLightboxImage(null)}
                            className="absolute -top-12 right-0 p-2.5 bg-white/20 hover:bg-white/30 rounded-full text-white text-sm font-black transition-all cursor-pointer uppercase tracking-widest flex items-center gap-1.5"
                        >
                            ✕ Close
                        </button>
                        <div className="w-full max-h-[75vh] rounded-3xl overflow-hidden border border-white/10 bg-black flex items-center justify-center shadow-2xl">
                            <img src={lightboxImage} className="max-w-full max-h-[75vh] object-contain" alt="Lightbox View" />
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};

export default PetClaimsDashboard;
