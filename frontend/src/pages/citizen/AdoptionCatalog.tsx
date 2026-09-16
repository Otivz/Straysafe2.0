import { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { getPetPicture } from '../../utils/avatar';
import { Heart, Search, MapPin, Phone, User, Shield, ArrowRight, Sparkles, AlertCircle } from 'lucide-react';

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

    // Filter states
    const [typeFilter, setTypeFilter] = useState<'all' | 'dog' | 'cat'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    const rawUser = localStorage.getItem('resident_user') || sessionStorage.getItem('resident_user');
    const isResidentLoggedIn = Boolean(token && rawUser);

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
        <div className="min-h-screen bg-[#FBFBF9] text-[#1E293B] font-sans selection:bg-orange-100 selection:text-orange-900">
            {/* Top Navigation */}
            <header className="sticky top-0 z-40 bg-white/85 backdrop-blur-md border-b border-[#E2E8F0] px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
                <Link to="/" className="flex items-center gap-3 group">
                    <img src="/SSLOGO.png" alt="StraySafe" className="w-9 h-9 object-contain group-hover:scale-105 transition-transform" />
                    <div>
                        <span className="font-extrabold text-lg tracking-tight text-[#0F172A] flex items-center gap-1.5">
                            STRAY<span className="text-[#F97316]">SAFE</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-bold tracking-normal">
                                Adoption Portal
                            </span>
                        </span>
                    </div>
                </Link>

                <div className="flex items-center gap-3">
                    {isResidentLoggedIn ? (
                        <>
                            <Link
                                to="/adopt/applications"
                                className="text-sm font-semibold text-gray-700 hover:text-orange-600 transition-colors hidden sm:block"
                            >
                                My Applications
                            </Link>
                            <Link
                                to="/resident-home"
                                className="text-sm px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-xs hover:shadow-sm"
                            >
                                Resident Portal
                            </Link>
                        </>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Link
                                to="/login"
                                className="text-sm font-semibold text-gray-700 hover:text-orange-600 px-3 py-1.5 transition-colors"
                            >
                                Log In
                            </Link>
                            <Link
                                to="/login"
                                className="text-sm px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-xs"
                            >
                                Register to Adopt
                            </Link>
                        </div>
                    )}
                </div>
            </header>

            {/* Hero Section */}
            <section className="relative overflow-hidden bg-gradient-to-b from-orange-50/80 via-[#FBFBF9] to-[#FBFBF9] pt-12 pb-8 px-4 sm:px-8">
                <div className="max-w-6xl mx-auto text-center relative z-10">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-orange-100/90 text-orange-800 text-xs font-bold uppercase tracking-wider mb-4 border border-orange-200/60 shadow-xs">
                        <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                        Barangay Animal Welfare & Rehoming
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-[#0F172A] mb-3">
                        Give a Rescued Pet a <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-amber-500">Forever Home</span>
                    </h1>
                    <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto mb-8 font-normal">
                        Browse rescued dogs and cats lovingly cared for at the Barangay Animal Facility. Every animal has completed their health observation and is ready for safe adoption.
                    </p>

                    {/* Search & Filter Bar */}
                    <div className="max-w-2xl mx-auto bg-white rounded-2xl p-2 sm:p-3 border border-gray-200/80 shadow-md flex flex-col sm:flex-row gap-2.5 items-center">
                        <div className="relative flex-1 w-full">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by pet name, breed, or color..."
                                className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-transparent hover:border-gray-200 focus:border-orange-500 focus:outline-hidden transition-all bg-gray-50/80 focus:bg-white text-gray-800"
                            />
                        </div>
                        <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 justify-center">
                            <button
                                onClick={() => setTypeFilter('all')}
                                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${typeFilter === 'all' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                All Pets
                            </button>
                            <button
                                onClick={() => setTypeFilter('dog')}
                                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${typeFilter === 'dog' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                Dogs 🐶
                            </button>
                            <button
                                onClick={() => setTypeFilter('cat')}
                                className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all ${typeFilter === 'cat' ? 'bg-orange-500 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                            >
                                Cats 🐱
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Catalog Grid Section */}
            <main className="max-w-6xl mx-auto px-4 sm:px-8 pb-20">
                <div className="flex items-center justify-between mb-6">
                    <p className="text-sm font-semibold text-gray-500">
                        Showing <span className="text-gray-900 font-bold">{filteredAnimals.length}</span> adoptable {filteredAnimals.length === 1 ? 'animal' : 'animals'}
                    </p>
                </div>

                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3, 4, 5, 6].map((idx) => (
                            <div key={idx} className="bg-white rounded-3xl p-4 border border-gray-200 animate-pulse flex flex-col gap-4">
                                <div className="w-full h-56 bg-gray-200 rounded-2xl" />
                                <div className="h-5 bg-gray-200 rounded-md w-2/3" />
                                <div className="h-4 bg-gray-100 rounded-md w-1/2" />
                                <div className="h-16 bg-gray-50 rounded-xl" />
                                <div className="h-10 bg-gray-200 rounded-xl mt-auto" />
                            </div>
                        ))}
                    </div>
                ) : error ? (
                    <div className="bg-white rounded-3xl p-10 border border-red-200 text-center max-w-lg mx-auto shadow-sm">
                        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
                        <h3 className="font-bold text-gray-900 text-lg mb-1">Catalog Unavailable</h3>
                        <p className="text-sm text-gray-600 mb-4">{error}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-gray-900 text-white text-xs font-bold rounded-xl hover:bg-gray-800 transition-all"
                        >
                            Retry
                        </button>
                    </div>
                ) : filteredAnimals.length === 0 ? (
                    <div className="bg-white rounded-3xl p-12 border border-dashed border-gray-300 text-center max-w-lg mx-auto shadow-xs">
                        <div className="w-16 h-16 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mx-auto mb-4 text-2xl">
                            🐾
                        </div>
                        <h3 className="font-extrabold text-gray-900 text-lg mb-1">No Animals Found</h3>
                        <p className="text-sm text-gray-500 mb-6">
                            {searchQuery || typeFilter !== 'all'
                                ? "No adoptable animals match your search filters. Try clearing your search query."
                                : "There are currently no rescued animals listed for adoption. All rescued pets are either being claimed or undergoing health checks."}
                        </p>
                        {(searchQuery || typeFilter !== 'all') && (
                            <button
                                onClick={() => { setSearchQuery(''); setTypeFilter('all'); }}
                                className="px-4 py-2 rounded-xl bg-orange-500 text-white text-xs font-bold hover:bg-orange-600 transition-all"
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
                                    className="bg-white rounded-3xl border border-gray-200/90 hover:border-orange-300 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col overflow-hidden group"
                                >
                                    {/* Pet Image Container */}
                                    <div className="relative w-full h-56 bg-gray-100 overflow-hidden">
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
                                                <span className="px-2.5 py-1 rounded-full bg-white/80 backdrop-blur-md text-gray-800 font-bold text-[11px]">
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
                                                <h3 className="font-extrabold text-xl text-gray-900 leading-snug group-hover:text-orange-600 transition-colors">
                                                    {animal.animal_name || `Rescue #${animal.holding_id}`}
                                                </h3>
                                                <span className="text-xs font-semibold text-gray-400 shrink-0 mt-1">
                                                    ID #{animal.holding_id}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 mb-3">
                                                <span>{animal.breed || 'Mixed Breed'}</span>
                                                <span>•</span>
                                                <span>{animal.color || 'Natural'}</span>
                                            </div>

                                            {animal.adoption_catalog_notes && (
                                                <p className="text-xs text-gray-600 line-clamp-3 mb-4 bg-gray-50/80 p-3 rounded-xl border border-gray-100 italic leading-relaxed">
                                                    "{animal.adoption_catalog_notes}"
                                                </p>
                                            )}

                                            {/* Barangay Facility & Contact Card */}
                                            <div className="bg-orange-50/60 rounded-2xl p-3 border border-orange-100/80 mb-4 text-xs space-y-2">
                                                <div className="flex items-center gap-2 text-orange-900 font-bold">
                                                    <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                                                    <span className="truncate">{animal.facility_name || 'Barangay Animal Facility'}</span>
                                                </div>

                                                <div className="flex items-center justify-between text-gray-600 pt-1 border-t border-orange-100/50">
                                                    <span className="font-medium text-gray-500">Managing Unit:</span>
                                                    <span className="font-semibold text-gray-800">{animal.managing_unit || 'Barangay Animal Care'}</span>
                                                </div>

                                                {animal.facility_contact && (
                                                    <div className="flex items-center justify-between text-gray-600">
                                                        <span className="font-medium text-gray-500 flex items-center gap-1">
                                                            <Phone className="w-3 h-3 text-gray-400" /> Facility Hotline:
                                                        </span>
                                                        <a href={`tel:${animal.facility_contact}`} className="font-bold text-orange-600 hover:underline">
                                                            {animal.facility_contact}
                                                        </a>
                                                    </div>
                                                )}

                                                {animal.intake_staff_name && (
                                                    <div className="flex items-center justify-between text-gray-600">
                                                        <span className="font-medium text-gray-500 flex items-center gap-1">
                                                            <User className="w-3 h-3 text-gray-400" /> Officer:
                                                        </span>
                                                        <span className="font-semibold text-gray-800">{animal.intake_staff_name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
                                            <button
                                                onClick={() => handleApplyClick(animal.holding_id)}
                                                className="w-full py-2.5 px-4 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white rounded-xl font-bold text-xs shadow-xs hover:shadow-sm transition-all flex items-center justify-center gap-2"
                                            >
                                                <Heart className="w-3.5 h-3.5 fill-white/30" /> Apply to Adopt
                                            </button>
                                            <button
                                                onClick={() => navigate(`/adopt/journey/${animal.holding_id}`)}
                                                className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-1.5"
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
        </div>
    );
};

export default AdoptionCatalog;
