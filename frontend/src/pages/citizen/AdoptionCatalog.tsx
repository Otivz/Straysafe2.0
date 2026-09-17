import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { getPetPicture } from '../../utils/avatar';
import { Heart, Search, MapPin, Phone, User, Shield, ArrowRight, Sparkles, AlertCircle, ArrowLeft, ClipboardList } from 'lucide-react';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';

interface CatalogAnimal {
    holding_id: number;
    report_id: number;
    animal_name: string | null;
    animal_type: string | null;
    breed: string | null;
    color: string | null;
    estimated_size: string | null;
    facility_status: number;
    adoption_catalog_notes: string | null;
    intake_date: string | null;
    promoted_at: string | null;
    photos: string[];
    intake_staff_name: string | null;
    intake_staff_contact: string | null;
    facility_name: string | null;
    facility_contact: string | null;
    managing_unit: string | null;
    sighting_lat: number | null;
    sighting_lng: number | null;
    sighting_landmark: string | null;
}

const AdoptionCatalog = () => {
    const navigate = useNavigate();
    const [animals, setAnimals] = useState<CatalogAnimal[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

    // Filter states
    const [typeFilter, setTypeFilter] = useState<'all' | 'dog' | 'cat'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const token = localStorage.getItem('token') || sessionStorage.getItem('token') || localStorage.getItem('access_token');
    const rawUser = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const residentObj = rawUser ? JSON.parse(rawUser) : null;
    const isResidentLoggedIn = Boolean((token || residentObj) && residentObj);

    const handleBack = () => {
        if (window.history.length > 2) {
            navigate(-1);
        } else {
            navigate('/resident-home');
        }
    };

    useEffect(() => {
        const fetchCatalog = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await axios.get('http://localhost:8000/adoptions/catalog');
                setAnimals(Array.isArray(res.data) ? res.data : []);
            } catch (err: any) {
                console.error("Failed to load adoption catalog", err);
                setError("Unable to load the adoption catalog at this moment. Please check back shortly.");
            } finally {
                setLoading(false);
            }
        };

        fetchCatalog();
    }, []);

    const filteredAnimals = useMemo(() => {
        return animals.filter((a) => {
            if (typeFilter !== 'all') {
                if (typeFilter === 'dog' && a.animal_type?.toLowerCase() !== 'dog') return false;
                if (typeFilter === 'cat' && a.animal_type?.toLowerCase() !== 'cat') return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchesName = a.animal_name?.toLowerCase().includes(q) || false;
                const matchesBreed = a.breed?.toLowerCase().includes(q) || false;
                const matchesColor = a.color?.toLowerCase().includes(q) || false;
                const matchesLandmark = a.sighting_landmark?.toLowerCase().includes(q) || false;
                if (!matchesName && !matchesBreed && !matchesColor && !matchesLandmark) return false;
            }
            return true;
        });
    }, [animals, typeFilter, searchQuery]);

    const handleApplyClick = (holdingId: number) => {
        if (!isResidentLoggedIn) {
            navigate('/login', { state: { from: `/adopt/apply/${holdingId}` } });
        } else {
            navigate(`/adopt/apply/${holdingId}`);
        }
    };

    return (
        <div className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0F19] text-[#1E293B] dark:text-[#F8FAFC] font-sans selection:bg-orange-100 selection:text-orange-900 pb-20">
            {/* Main Website Navbar */}
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            {/* Back & Request Adoption Action Bar */}
            <div className="max-w-6xl mx-auto px-4 sm:px-8 pt-24 sm:pt-32 pb-2">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-2 group text-gray-500 dark:text-gray-400 hover:text-[#F97316] dark:hover:text-[#F97316] transition-colors cursor-pointer"
                        title="Go Back"
                    >
                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#151C2C] border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 group-hover:text-[#F97316] group-hover:border-orange-200 dark:group-hover:border-orange-500/30 transition-all shadow-sm">
                            <ArrowLeft className="w-5 h-5 transition-transform group-hover:-translate-x-1" />
                        </div>
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#1a1208] dark:text-white group-hover:text-[#F97316] dark:group-hover:text-[#F97316] transition-colors">Back</span>
                    </button>

                    <button
                        onClick={() => navigate('/adopt/applications')}
                        className="px-5 py-3 bg-gradient-to-r from-[#F97316] to-[#EA580C] hover:from-[#EA580C] hover:to-[#C2410C] text-white rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all shadow-lg shadow-orange-500/20 hover:scale-105 active:scale-95 flex items-center gap-2 shrink-0 cursor-pointer"
                        title="View or track your adoption requests"
                    >
                        <ClipboardList className="w-4 h-4" />
                        <span>Request Adoption</span>
                    </button>
                </div>
            </div>

            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-b from-orange-50/80 via-[#FBFBF9] to-[#FBFBF9] dark:from-[#151C2C] dark:via-[#0B0F19] dark:to-[#0B0F19] pt-6 pb-8 px-4 sm:px-8">
                <div className="max-w-6xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-100/90 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 text-xs font-bold uppercase tracking-wider mb-4 border border-orange-200/60 dark:border-orange-900/50 shadow-xs">
                        <Sparkles className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                        Barangay Animal Welfare & Rehoming
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-[#0F172A] dark:text-white mb-3">
                        Give a Rescued Pet a <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 dark:from-orange-400 dark:to-amber-400">Forever Home</span>
                    </h1>
                    <p className="text-base sm:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-8 font-normal">
                        Browse rescued dogs and cats lovingly cared for at the Barangay Animal Facility. Every animal has completed their health observation and is ready for safe adoption.
                    </p>

                    {/* Search & Filter Bar */}
                    <div className="max-w-2xl mx-auto bg-white dark:bg-[#151C2C] rounded-2xl p-2 sm:p-3 border border-gray-200/80 dark:border-gray-800 shadow-md flex flex-col sm:flex-row gap-2.5 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by pet name, breed, or color..."
                                className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-orange-500 dark:focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/80 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 justify-center">
                            <button
                                onClick={() => setTypeFilter('all')}
                                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${typeFilter === 'all' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >
                                All Pets
                            </button>
                            <button
                                onClick={() => setTypeFilter('dog')}
                                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${typeFilter === 'dog' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >
                                Dogs 🐶
                            </button>
                            <button
                                onClick={() => setTypeFilter('cat')}
                                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${typeFilter === 'cat' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >
                                Cats 🐱
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Catalog Grid Section */}
            <main className="max-w-6xl mx-auto px-4 sm:px-8 pb-20">
                {/* Logged-in Resident Account Card */}
                {isResidentLoggedIn && residentObj && (
                    <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 rounded-3xl p-6 sm:p-7 mb-8 text-white shadow-lg border border-orange-400/30">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
                            <div className="flex items-start sm:items-center gap-4">
                                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-2xl border border-white/30 text-white shrink-0 shadow-xs">
                                    {residentObj.name?.[0]?.toUpperCase() || 'R'}
                                </div>
                                <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h2 className="text-xl font-black tracking-tight text-white">{residentObj.name}</h2>
                                        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/25 backdrop-blur-md text-white font-bold tracking-wide uppercase">
                                            Logged-In Resident
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-orange-100 mt-1.5 font-medium">
                                        <span>📧 {residentObj.email}</span>
                                        {residentObj.phone && <span>📞 {residentObj.phone}</span>}
                                        {residentObj.address && <span>📍 {residentObj.address}</span>}
                                    </div>
                                    <p className="text-[11px] text-orange-100/90 mt-2">
                                        ✨ Your account details will automatically pre-populate in any pet adoption form you submit.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2.5 flex-wrap w-full md:w-auto shrink-0 pt-3 md:pt-0 border-t md:border-t-0 border-white/20">
                                <Link
                                    to="/adopt/applications"
                                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-white text-orange-700 font-bold text-xs hover:bg-orange-50 transition-all shadow-xs text-center"
                                >
                                    📋 Track Applications
                                </Link>
                                <Link
                                    to="/resident/pets"
                                    className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-black/20 hover:bg-black/30 backdrop-blur-md text-white font-bold text-xs transition-all border border-white/20 text-center"
                                >
                                    🐾 My Pets
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between mb-6">
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                        Showing <span className="text-gray-900 dark:text-white font-bold">{filteredAnimals.length}</span> adoptable {filteredAnimals.length === 1 ? 'animal' : 'animals'}
                    </p>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3, 4, 5, 6].map((idx) => (
                            <div key={idx} className="bg-white dark:bg-[#151C2C] rounded-3xl p-4 border border-gray-200 dark:border-gray-800 animate-pulse flex flex-col gap-4">
                                <div className="w-full h-56 bg-gray-200 dark:bg-gray-800 rounded-2xl" />
                                <div className="h-5 bg-gray-200 dark:bg-gray-800 rounded-md w-2/3" />
                                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded-md w-1/2" />
                                <div className="h-16 bg-gray-50 dark:bg-gray-900/50 rounded-xl" />
                                <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded-xl mt-auto" />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl p-10 border border-red-200 dark:border-red-900/50 text-center max-w-lg mx-auto shadow-sm">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                        <h3 className="font-bold text-gray-900 dark:text-white text-lg mb-1">Catalog Unavailable</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs font-bold rounded-xl hover:bg-gray-800 dark:hover:bg-gray-600 transition-all cursor-pointer"
                        >
                            Retry
                        </button>
                    </div>
                ) : filteredAnimals.length === 0 ? (
                    <div className="bg-white dark:bg-[#151C2C] rounded-3xl p-12 border border-dashed border-gray-300 dark:border-gray-700 text-center max-w-lg mx-auto shadow-xs">
                        <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto mb-4 text-2xl">
                            🐾
                        </div>
                        <h3 className="font-extrabold text-gray-900 dark:text-white text-lg mb-1">No Animals Found</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                            {searchQuery || typeFilter !== 'all'
                                ? "No adoptable animals match your search filters. Try clearing your search query."
                                : "There are currently no rescued animals listed for adoption. All rescued pets are either being claimed or undergoing health checks."}
                        </p>
                        {(searchQuery || typeFilter !== 'all') && (
                            <button
                                onClick={() => { setSearchQuery(''); setTypeFilter('all'); }}
                                className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-all cursor-pointer"
                            >
                                Reset Filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredAnimals.map((animal) => {
                            const photo = animal.photos.length > 0 ? animal.photos[0] : null;
                            const petImg = getPetPicture(photo);

                            return (
                                <div
                                    key={animal.holding_id}
                                    className="bg-white dark:bg-[#151C2C] rounded-3xl border border-gray-200/90 dark:border-gray-800 hover:border-orange-300 dark:hover:border-orange-500/50 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col overflow-hidden group"
                                >
                                    {/* Pet Image Container */}
                                    <div className="relative w-full h-56 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                        <img
                                            src={petImg}
                                            alt={animal.animal_name || 'Rescue Pet'}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                                            <span className="px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white font-bold text-[11px] uppercase tracking-wide">
                                                {animal.animal_type || 'Rescue'}
                                            </span>
                                            {animal.estimated_size && (
                                                <span className="px-2.5 py-1 rounded-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-md text-gray-800 dark:text-gray-200 font-bold text-[11px]">
                                                    {animal.estimated_size}
                                                </span>
                                            )}
                                        </div>
                                        <div className="absolute top-3 right-3">
                                            <span className="px-3 py-1 rounded-full bg-emerald-500/95 backdrop-blur-md text-white font-black text-[11px] shadow-xs flex items-center gap-1">
                                                <Shield className="w-3 h-3" /> Ready to Adopt
                                            </span>
                                        </div>
                                    </div>

                                    {/* Pet Information */}
                                    <div className="p-5 flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                                <h3 className="font-extrabold text-xl text-gray-900 dark:text-white leading-snug group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                                                    {animal.animal_name || `Rescue #${animal.holding_id}`}
                                                </h3>
                                                <span className="text-xs font-semibold text-gray-400 dark:text-gray-400 shrink-0 mt-1">
                                                    ID #{animal.holding_id}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">
                                                <span>{animal.breed || 'Mixed Breed'}</span>
                                                <span>•</span>
                                                <span>{animal.color || 'Natural'}</span>
                                            </div>

                                            {animal.adoption_catalog_notes && (
                                                <p className="text-xs text-gray-600 dark:text-gray-300 line-clamp-3 mb-4 bg-gray-50/80 dark:bg-[#0E131F] p-3 rounded-xl border border-gray-100 dark:border-gray-800 italic leading-relaxed">
                                                    "{animal.adoption_catalog_notes}"
                                                </p>
                                            )}

                                            {/* Barangay Facility & Contact Card */}
                                            <div className="bg-orange-50/60 dark:bg-orange-950/20 rounded-2xl p-3 border border-orange-100/80 dark:border-orange-900/40 mb-4 text-xs space-y-2">
                                                <div className="flex items-center gap-2 text-orange-900 dark:text-orange-300 font-bold">
                                                    <MapPin className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
                                                    <span className="truncate">{animal.facility_name || 'Barangay Animal Facility'}</span>
                                                </div>

                                                <div className="flex items-center justify-between text-gray-600 dark:text-gray-300 pt-1 border-t border-orange-100/50 dark:border-orange-900/30">
                                                    <span className="font-medium text-gray-500 dark:text-gray-400">Managing Unit:</span>
                                                    <span className="font-semibold text-gray-800 dark:text-gray-200">{animal.managing_unit || 'Barangay Animal Care'}</span>
                                                </div>

                                                {animal.facility_contact && (
                                                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                                                        <span className="font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                            <Phone className="w-3 h-3 text-gray-400" /> Facility Hotline:
                                                        </span>
                                                        <a href={`tel:${animal.facility_contact}`} className="font-bold text-orange-600 dark:text-orange-400 hover:underline">
                                                            {animal.facility_contact}
                                                        </a>
                                                    </div>
                                                )}

                                                {animal.intake_staff_name && (
                                                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
                                                        <span className="font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                            <User className="w-3 h-3 text-gray-400" /> Officer:
                                                        </span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">{animal.intake_staff_name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex flex-col gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                                            <button
                                                onClick={() => handleApplyClick(animal.holding_id)}
                                                className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-xl font-bold text-xs shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                                            >
                                                <Heart className="w-3.5 h-3.5 fill-white/30" /> Apply to Adopt
                                            </button>
                                            <button
                                                onClick={() => navigate(`/adopt/journey/${animal.holding_id}`)}
                                                className="w-full py-2 px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                                            >
                                                <span>View Journey Trail</span>
                                                <ArrowRight className="w-3 h-3 text-gray-400" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
            <ResiMobileNav isNavbarMenuOpen={isNavbarMenuOpen} />
        </div>
    );
};

export default AdoptionCatalog;
