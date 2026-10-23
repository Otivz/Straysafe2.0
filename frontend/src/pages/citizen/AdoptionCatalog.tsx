import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { useSignedInUser, homePathFor } from '../../utils/useSignedInUser';
import { getPetPicture } from '../../utils/avatar';
import { Heart, Search, MapPin, Phone, User, Shield, ArrowRight, Sparkles, AlertCircle, ArrowLeft, Check } from 'lucide-react';
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
    facility_officer?: string | null;
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

    // Signed in only when the server confirms it (a kept account may have been signed out or expired)
    const { user: residentObj } = useSignedInUser();
    const isUserLoggedIn = Boolean(residentObj);

    const handleBack = () => navigate(residentObj ? homePathFor(residentObj) : '/');

    useEffect(() => {
        const fetchCatalog = async () => {
            setLoading(true);
            setError(null);
            try {
                const res = await api.get('/adoptions/catalog');
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

    // Animals this resident already applied for (pending or approved): the card button is locked
    const [appliedHoldingIds, setAppliedHoldingIds] = useState<Set<number>>(new Set());
    useEffect(() => {
        if (!isUserLoggedIn) {
            setAppliedHoldingIds(new Set());
            return;
        }
        api.get('/adoptions/my-applications')
            .then((res) => {
                const list = Array.isArray(res.data) ? res.data : [];
                setAppliedHoldingIds(new Set(list.filter((a: any) => ['Pending', 'Approved'].includes(a.status)).map((a: any) => Number(a.holding_id))));
            })
            .catch(() => setAppliedHoldingIds(new Set()));
    }, [isUserLoggedIn]);

    const handleApplyClick = (holdingId: number) => {
        if (appliedHoldingIds.has(holdingId)) return;
        if (!isUserLoggedIn) {
            navigate('/login', { state: { from: `/adopt/apply/${holdingId}` } });
        } else {
            navigate(`/adopt/apply/${holdingId}`);
        }
    };

    return (
        <div className="min-h-screen bg-[#FBFBF9] dark:bg-[#0B0F19] text-[#1E293B] dark:text-[#F8FAFC] font-sans selection:bg-orange-100 selection:text-orange-900 pb-16 sm:pb-20">
            {/* Main Website Navbar */}
            <ResiNavbar
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            {/* Back Action Bar */}
            <div className="max-w-6xl mx-auto px-3 sm:px-8 pt-20 sm:pt-32 pb-1 sm:pb-2">
                <div className="flex items-center justify-between gap-2.5 sm:gap-4 flex-wrap">
                    <button
                        onClick={handleBack}
                        className="flex items-center gap-1.5 sm:gap-2 group text-gray-500 dark:text-gray-400 hover:text-[#F97316] dark:hover:text-[#F97316] transition-colors cursor-pointer"
                        title="Back to Homepage"
                    >
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-white dark:bg-[#151C2C] border border-gray-200 dark:border-gray-800 flex items-center justify-center text-gray-400 group-hover:text-[#F97316] group-hover:border-orange-200 dark:group-hover:border-orange-500/30 transition-all shadow-2xs sm:shadow-sm">
                            <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 transition-transform group-hover:-translate-x-1" />
                        </div>
                        <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-[#1a1208] dark:text-white group-hover:text-[#F97316] dark:group-hover:text-[#F97316] transition-colors">Back</span>
                    </button>
                </div>
            </div>

            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-b from-orange-50/80 via-[#FBFBF9] to-[#FBFBF9] dark:from-[#151C2C] dark:via-[#0B0F19] dark:to-[#0B0F19] pt-3 sm:pt-6 pb-4 sm:pb-8 px-3 sm:px-8">
                <div className="max-w-6xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-orange-100/90 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 text-[10px] sm:text-xs font-bold uppercase tracking-wider mb-2 sm:mb-4 border border-orange-200/60 dark:border-orange-900/50 shadow-2xs">
                        <Sparkles className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-orange-600 dark:text-orange-400" />
                        Barangay Animal Welfare & Rehoming
                    </div>
                    <h1 className="text-xl sm:text-3xl md:text-5xl font-black tracking-tight text-[#0F172A] dark:text-white mb-1.5 sm:mb-3">
                        Give a Rescued Pet a <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500 dark:from-orange-400 dark:to-amber-400">Forever Home</span>
                    </h1>
                    <p className="text-xs sm:text-base md:text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-4 sm:mb-8 font-normal leading-relaxed">
                        Browse rescued dogs and cats lovingly cared for at the Barangay Animal Facility. Every animal has completed their health observation and is ready for safe adoption.
                    </p>

                    {/* Search & Filter Bar */}
                    <div className="max-w-2xl mx-auto bg-white dark:bg-[#151C2C] rounded-xl sm:rounded-2xl p-1.5 sm:p-3 border border-gray-200/80 dark:border-gray-800 shadow-sm sm:shadow-md flex flex-col sm:flex-row gap-1.5 sm:gap-2.5 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by pet name, breed, or color..."
                                className="w-full pl-8 sm:pl-10 pr-3 sm:pr-4 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg sm:rounded-xl border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:border-orange-500 dark:focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/80 dark:bg-[#0E131F] focus:bg-white dark:focus:bg-[#151C2C] text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                            />
                        </div>
                        <div className="flex items-center gap-1 sm:gap-1.5 w-full sm:w-auto shrink-0 justify-center">
                            <button
                                onClick={() => setTypeFilter('all')}
                                className={`px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-lg sm:rounded-xl transition-all cursor-pointer ${typeFilter === 'all' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >
                                All Pets
                            </button>
                            <button
                                onClick={() => setTypeFilter('dog')}
                                className={`px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-lg sm:rounded-xl transition-all cursor-pointer ${typeFilter === 'dog' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >
                                Dogs 🐶
                            </button>
                            <button
                                onClick={() => setTypeFilter('cat')}
                                className={`px-2.5 py-1 sm:px-3.5 sm:py-1.5 text-[11px] sm:text-xs font-bold rounded-lg sm:rounded-xl transition-all cursor-pointer ${typeFilter === 'cat' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                            >
                                Cats 🐱
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Catalog Grid Section */}
            <main className="max-w-6xl mx-auto px-3 sm:px-8 pb-16 sm:pb-20">
                {/* Logged-in Resident Account Card */}
                {isUserLoggedIn && residentObj && (
                    <div className="bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 rounded-2xl sm:rounded-3xl p-3.5 sm:p-7 mb-4 sm:mb-8 text-white shadow-md sm:shadow-lg border border-orange-400/30">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-5">
                            <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                                <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center font-black text-lg sm:text-2xl border border-white/30 text-white shrink-0 shadow-2xs">
                                    {((residentObj.name || residentObj.email || 'R')[0] || 'R').toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                        <h2 className="text-sm sm:text-xl font-black tracking-tight text-white truncate">{residentObj.name || residentObj.email || 'Resident'}</h2>
                                        <span className="text-[9px] sm:text-[11px] px-2 py-0.5 rounded-full bg-white/25 backdrop-blur-md text-white font-bold tracking-wide uppercase">
                                            {residentObj.role_id === 1 ? 'Resident' : (residentObj.role_id === 2 ? 'Subdivision Leader' : (residentObj.role_id === 3 ? 'Barangay Staff' : 'Administrator'))}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-4 gap-y-0.5 sm:gap-y-1 text-[10px] sm:text-xs text-orange-100 mt-1 font-medium">
                                        {residentObj.email && <span>📧 {residentObj.email}</span>}
                                        {residentObj.phone && <span>📞 {residentObj.phone}</span>}
                                        {residentObj.address && <span>📍 {residentObj.address}</span>}
                                    </div>
                                    <p className="text-[10px] sm:text-[11px] text-orange-100/90 mt-1 sm:mt-2">
                                        ✨ Your account details will automatically pre-populate in any pet adoption form you submit.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap w-full md:w-auto shrink-0 pt-2.5 md:pt-0 border-t md:border-t-0 border-white/20">
                                <Link
                                    to="/adopt/applications"
                                    className="flex-1 sm:flex-initial px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl bg-white text-orange-700 font-bold text-[11px] sm:text-xs hover:bg-orange-50 transition-all shadow-2xs text-center"
                                >
                                    📋 Track Applications
                                </Link>
                                <Link
                                    to="/resident/pets"
                                    className="flex-1 sm:flex-initial px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl bg-black/20 hover:bg-black/30 backdrop-blur-md text-white font-bold text-[11px] sm:text-xs transition-all border border-white/20 text-center"
                                >
                                    🐾 My Pets
                                </Link>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between mb-3 sm:mb-6">
                    <p className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400">
                        Showing <span className="text-gray-900 dark:text-white font-bold">{filteredAnimals.length}</span> adoptable {filteredAnimals.length === 1 ? 'animal' : 'animals'}
                    </p>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6">
                        {[1, 2, 3, 4, 5, 6].map((idx) => (
                            <div key={idx} className="bg-white dark:bg-[#151C2C] rounded-2xl sm:rounded-3xl p-3 sm:p-4 border border-gray-200 dark:border-gray-800 animate-pulse flex flex-col gap-3 sm:gap-4">
                                <div className="w-full h-44 sm:h-56 bg-gray-200 dark:bg-gray-800 rounded-xl sm:rounded-2xl" />
                                <div className="h-4 sm:h-5 bg-gray-200 dark:bg-gray-800 rounded-md w-2/3" />
                                <div className="h-3 sm:h-4 bg-gray-100 dark:bg-gray-800 rounded-md w-1/2" />
                                <div className="h-12 sm:h-16 bg-gray-50 dark:bg-gray-900/50 rounded-lg sm:rounded-xl" />
                                <div className="h-8 sm:h-10 bg-gray-200 dark:bg-gray-800 rounded-lg sm:rounded-xl mt-auto" />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="bg-white dark:bg-[#151C2C] rounded-2xl sm:rounded-3xl p-6 sm:p-10 border border-red-200 dark:border-red-900/50 text-center max-w-lg mx-auto shadow-sm">
                        <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-red-500 mx-auto mb-2.5 sm:mb-3" />
                        <h3 className="font-bold text-gray-900 dark:text-white text-base sm:text-lg mb-1">Catalog Unavailable</h3>
                        <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-3.5 py-1.5 sm:px-4 sm:py-2 bg-gray-900 dark:bg-gray-700 text-white text-[11px] sm:text-xs font-bold rounded-lg sm:rounded-xl hover:bg-gray-800 dark:hover:bg-gray-600 transition-all cursor-pointer"
                        >
                            Retry
                        </button>
                    </div>
                ) : filteredAnimals.length === 0 ? (
                    <div className="bg-white dark:bg-[#151C2C] rounded-2xl sm:rounded-3xl p-8 sm:p-12 border border-dashed border-gray-300 dark:border-gray-700 text-center max-w-lg mx-auto shadow-2xs">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center mx-auto mb-3 sm:mb-4 text-xl sm:text-2xl">
                            🐾
                        </div>
                        <h3 className="font-extrabold text-gray-900 dark:text-white text-base sm:text-lg mb-1">No Animals Found</h3>
                        <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-4 sm:mb-6 leading-relaxed">
                            {searchQuery || typeFilter !== 'all'
                                ? "No adoptable animals match your search filters. Try clearing your search query."
                                : "There are currently no rescued animals listed for adoption. All rescued pets are either being claimed or undergoing health checks."}
                        </p>
                        {(searchQuery || typeFilter !== 'all') && (
                            <button
                                onClick={() => { setSearchQuery(''); setTypeFilter('all'); }}
                                className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl bg-orange-500 text-white text-[11px] sm:text-xs font-bold hover:bg-orange-600 transition-all cursor-pointer"
                            >
                                Reset Filters
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-6">
                        {filteredAnimals.map((animal) => {
                            const photo = animal.photos.length > 0 ? animal.photos[0] : null;
                            const petImg = getPetPicture(photo);

                            return (
                                <div
                                    key={animal.holding_id}
                                    className="bg-white dark:bg-[#151C2C] rounded-2xl sm:rounded-3xl border border-gray-200/90 dark:border-gray-800 hover:border-orange-300 dark:hover:border-orange-500/50 shadow-2xs sm:shadow-xs hover:shadow-md transition-all duration-300 flex flex-col overflow-hidden group"
                                >
                                    {/* Pet Image Container */}
                                    <div className="relative w-full h-44 sm:h-56 bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                        <img
                                            src={petImg}
                                            alt={animal.animal_name || 'Rescue Pet'}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                        <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 flex flex-wrap gap-1 sm:gap-1.5">
                                            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-full bg-black/60 backdrop-blur-md text-white font-bold text-[9px] sm:text-[11px] uppercase tracking-wide">
                                                {animal.animal_type || 'Rescue'}
                                            </span>
                                            {animal.estimated_size && (
                                                <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-md text-gray-800 dark:text-gray-200 font-bold text-[9px] sm:text-[11px]">
                                                    {animal.estimated_size}
                                                </span>
                                            )}
                                        </div>
                                        <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3">
                                            <span className="px-2 py-0.5 sm:px-3 sm:py-1 rounded-md sm:rounded-full bg-emerald-500/95 backdrop-blur-md text-white font-black text-[9px] sm:text-[11px] shadow-2xs flex items-center gap-1">
                                                <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> Ready to Adopt
                                            </span>
                                        </div>
                                    </div>

                                    {/* Pet Information */}
                                    <div className="p-3.5 sm:p-5 flex-1 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-start justify-between gap-1.5 sm:gap-2 mb-1 sm:mb-1.5">
                                                <h3 className="font-extrabold text-base sm:text-xl text-gray-900 dark:text-white leading-snug group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                                                    {animal.animal_name || `Rescue #${animal.holding_id}`}
                                                </h3>
                                                <span className="text-[10px] sm:text-xs font-semibold text-gray-400 dark:text-gray-400 shrink-0 mt-0.5 sm:mt-1">
                                                    ID #{animal.holding_id}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 sm:mb-3">
                                                <span>{animal.breed || 'Mixed Breed'}</span>
                                                <span>•</span>
                                                <span>{animal.color || 'Natural'}</span>
                                            </div>

                                            {animal.adoption_catalog_notes && (
                                                <p className="text-[11px] sm:text-xs text-gray-600 dark:text-gray-300 line-clamp-2 sm:line-clamp-3 mb-2.5 sm:mb-4 bg-gray-50/80 dark:bg-[#0E131F] p-2.5 sm:p-3 rounded-lg sm:rounded-xl border border-gray-100 dark:border-gray-800 italic leading-relaxed">
                                                    "{animal.adoption_catalog_notes}"
                                                </p>
                                            )}

                                            {/* Barangay Facility & Contact Card */}
                                            <div className="bg-orange-50/60 dark:bg-orange-950/20 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 border border-orange-100/80 dark:border-orange-900/40 mb-2.5 sm:mb-4 text-[11px] sm:text-xs space-y-1.5 sm:space-y-2">
                                                <div className="flex items-center gap-1.5 sm:gap-2 text-orange-900 dark:text-orange-300 font-bold">
                                                    <MapPin className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-orange-600 dark:text-orange-400 shrink-0" />
                                                    <span className="truncate">{animal.facility_name || 'Barangay Animal Facility'}</span>
                                                </div>

                                                <div className="flex items-center justify-between text-gray-600 dark:text-gray-300 pt-1 border-t border-orange-100/50 dark:border-orange-900/30 text-[10px] sm:text-xs">
                                                    <span className="font-medium text-gray-500 dark:text-gray-400">Managing Unit:</span>
                                                    <span className="font-semibold text-gray-800 dark:text-gray-200">{animal.managing_unit || 'Barangay Animal Care'}</span>
                                                </div>

                                                {animal.facility_contact && (
                                                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-300 text-[10px] sm:text-xs">
                                                        <span className="font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                            <Phone className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-400" /> Facility Hotline:
                                                        </span>
                                                        <a href={`tel:${animal.facility_contact}`} className="font-bold text-orange-600 dark:text-orange-400 hover:underline">
                                                            {animal.facility_contact}
                                                        </a>
                                                    </div>
                                                )}

                                                {(animal.facility_officer || animal.intake_staff_name) && (
                                                    <div className="flex items-center justify-between text-gray-600 dark:text-gray-300 text-[10px] sm:text-xs">
                                                        <span className="font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                                            <User className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-400" /> Officer:
                                                        </span>
                                                        <span className="font-semibold text-gray-800 dark:text-gray-200">{animal.facility_officer || animal.intake_staff_name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex flex-col gap-1.5 sm:gap-2 pt-1.5 sm:pt-2 border-t border-gray-100 dark:border-gray-800">
                                            {appliedHoldingIds.has(animal.holding_id) ? (
                                                <div className="flex flex-col gap-1">
                                                    <button
                                                        type="button"
                                                        disabled
                                                        aria-disabled="true"
                                                        title="You have already submitted an adoption application for this animal."
                                                        className="w-full py-2 sm:py-2.5 px-3 sm:px-4 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-lg sm:rounded-xl font-bold text-[11px] sm:text-xs flex items-center justify-center gap-1.5 sm:gap-2 cursor-not-allowed select-none"
                                                    >
                                                        <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500 shrink-0" />
                                                        <span>Application Submitted</span>
                                                    </button>
                                                    <div className="flex items-center justify-between px-1 text-[10px] text-gray-500 dark:text-gray-400">
                                                        <span className="truncate">Application submitted</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate('/adopt/applications')}
                                                            className="font-bold text-orange-600 dark:text-orange-400 hover:underline shrink-0 cursor-pointer"
                                                        >
                                                            View Status
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => handleApplyClick(animal.holding_id)}
                                                    className="w-full py-2 sm:py-2.5 px-3 sm:px-4 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-lg sm:rounded-xl font-bold text-[11px] sm:text-xs shadow-2xs hover:shadow-xs transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer"
                                                >
                                                    <Heart className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-white/30" /> Apply to Adopt
                                                </button>
                                            )}
                                            <button
                                                onClick={() => navigate(`/adopt/journey/${animal.holding_id}`)}
                                                className="w-full py-1.5 sm:py-2 px-3 sm:px-4 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg sm:rounded-xl font-semibold text-[10px] sm:text-xs transition-colors flex items-center justify-center gap-1 sm:gap-1.5 cursor-pointer"
                                            >
                                                <span>View Journey Trail</span>
                                                <ArrowRight className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-400" />
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
