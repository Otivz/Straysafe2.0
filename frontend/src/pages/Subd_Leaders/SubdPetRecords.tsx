import React, { useState, useEffect } from 'react';
import { getPetPicture, DEFAULT_PET_AVATAR } from '../../utils/avatar';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import StatCard from '../../components/PetRecords/StatCard';
import PetTable from '../../components/PetRecords/PetTable';
import { type PetRecord, mapRawPetToPetRecord } from '../../components/PetRecords/types';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import AddPetModal from '../../components/PetRecords/AddPetModal';
import Button from '../../components/Button';
import { api } from '../../utils/api';
import { getCachedData, setCachedData, invalidateCache } from '../../utils/cache';

// Cute Dog and Cat Peek Banner Illustration for Mobile
const PetsIllustration = () => (
    <div className="relative w-36 h-20 sm:w-44 sm:h-24 shrink-0 flex items-end justify-end select-none pointer-events-none">
        {/* Floating background elements */}
        <span className="absolute top-1 left-2 text-xs opacity-60 text-amber-400">🐾</span>
        <span className="absolute top-3 left-7 text-[10px] opacity-70 text-rose-400">❤️</span>
        <span className="absolute top-0 right-1 text-xs opacity-60 text-amber-400">🐾</span>
        <span className="absolute top-4 right-8 text-[9px] opacity-70 text-rose-400">❤️</span>
        
        {/* SVG Illustration of Dog & Cat */}
        <svg viewBox="0 0 200 120" className="w-full h-full object-contain overflow-visible" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Dog Body */}
            <path d="M40 120 C40 85, 60 70, 95 70 C130 70, 150 85, 150 120 Z" fill="#E6A15C" />
            <path d="M70 120 C70 95, 80 85, 95 85 C110 85, 120 95, 120 120 Z" fill="#FDF3E7" />
            
            {/* Dog Head */}
            <ellipse cx="95" cy="55" rx="36" ry="32" fill="#E6A15C" />
            {/* Dog Snout */}
            <ellipse cx="95" cy="62" rx="20" ry="16" fill="#FDF3E7" />
            <ellipse cx="95" cy="54" rx="7" ry="5" fill="#2D2424" />
            {/* Dog Mouth & Tongue */}
            <path d="M95 59 L95 67" stroke="#2D2424" strokeWidth="2" strokeLinecap="round" />
            <path d="M88 65 Q95 72 102 65" stroke="#2D2424" strokeWidth="2" fill="none" strokeLinecap="round" />
            <path d="M92 68 C92 74, 98 74, 98 68 Z" fill="#FF758F" />
            
            {/* Dog Eyes */}
            <circle cx="82" cy="46" r="4.5" fill="#2D2424" />
            <circle cx="80.5" cy="44.5" r="1.5" fill="#FFFFFF" />
            <circle cx="108" cy="46" r="4.5" fill="#2D2424" />
            <circle cx="106.5" cy="44.5" r="1.5" fill="#FFFFFF" />
            
            {/* Dog Ears */}
            <path d="M62 40 C52 45, 45 68, 55 78 C62 82, 68 70, 68 55 Z" fill="#B36829" />
            <path d="M128 40 C138 45, 145 68, 135 78 C128 82, 122 70, 122 55 Z" fill="#B36829" />
            
            {/* Cat Body */}
            <path d="M135 120 C135 95, 150 85, 175 85 C200 85, 210 95, 210 120 Z" fill="#CBD5E1" />
            
            {/* Cat Head */}
            <circle cx="165" cy="70" r="24" fill="#E2E8F0" />
            {/* Cat Ears */}
            <path d="M145 60 L142 42 L158 52 Z" fill="#94A3B8" />
            <path d="M146 58 L144 46 L155 53 Z" fill="#FDA4AF" />
            <path d="M185 60 L188 42 L172 52 Z" fill="#94A3B8" />
            <path d="M184 58 L186 46 L175 53 Z" fill="#FDA4AF" />
            
            {/* Cat Stripes */}
            <path d="M165 48 L165 54" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M160 50 L158 55" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
            <path d="M170 50 L172 55" stroke="#64748B" strokeWidth="2" strokeLinecap="round" />
            
            {/* Cat Eyes */}
            <ellipse cx="155" cy="68" rx="3.5" ry="4" fill="#10B981" />
            <ellipse cx="155" cy="68" rx="1.5" ry="3.5" fill="#0F172A" />
            <ellipse cx="175" cy="68" rx="3.5" ry="4" fill="#10B981" />
            <ellipse cx="175" cy="68" rx="1.5" ry="3.5" fill="#0F172A" />
            
            {/* Cat Nose & Mouth */}
            <polygon points="165,74 162,72 168,72" fill="#F472B6" />
            <path d="M160 76 Q165 79 170 76" stroke="#475569" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            {/* Whiskers */}
            <line x1="144" y1="73" x2="152" y2="74" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="143" y1="77" x2="151" y2="76" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="178" y1="74" x2="186" y2="73" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="179" y1="76" x2="187" y2="77" stroke="#64748B" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
    </div>
);

const SubdPetRecords: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'active' | 'removed'>('active');
    
    // Active Pets State
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingPet, setEditingPet] = useState<PetRecord | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [pets, setPets] = useState<PetRecord[]>(() => getCachedData<PetRecord[]>('subd_pet_records') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<PetRecord[]>('subd_pet_records'));

    // Removed Pets State
    const [removedPets, setRemovedPets] = useState<PetRecord[]>([]);
    const [loadingRemoved, setLoadingRemoved] = useState<boolean>(false);
    const [removedSearchTerm, setRemovedSearchTerm] = useState<string>('');
    const [removedSpeciesFilter, setRemovedSpeciesFilter] = useState<'ALL' | 'Dog' | 'Cat'>('ALL');
    const [confirmingRestorePet, setConfirmingRestorePet] = useState<PetRecord | null>(null);
    const [isRestoring, setIsRestoring] = useState<boolean>(false);

    // Toast Notifications
    const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const showToast = (text: string, isError = false) => {
        setToastMessage({ text, isError });
        setTimeout(() => setToastMessage(null), 4000);
    };

    // Fetch Active Pets
    const fetchRegisteredPets = async (forceLoading = false) => {
        try {
            if (forceLoading || !getCachedData('subd_pet_records')) {
                setLoading(true);
            }
            const response = await api.get('/pets/');

            const mappedPets: PetRecord[] = response.data.map((pet: any) => mapRawPetToPetRecord(pet));

            setPets(mappedPets);
            setCachedData('subd_pet_records', mappedPets);
        } catch (error) {
            console.error('Error fetching subdivision pets:', error);
            if (!getCachedData('subd_pet_records')) {
                setPets([]);
            }
        } finally {
            setLoading(false);
        }
    };

    // Fetch Removed / Archived Pets
    const fetchRemovedPets = async () => {
        try {
            setLoadingRemoved(true);
            const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
            const currentUser = userStr ? JSON.parse(userStr) : null;
            const subId = currentUser?.subdivision_id;

            const url = subId ? `/pets/removed?subdivision_id=${subId}` : '/pets/removed';
            const response = await api.get(url);

            const mapped: PetRecord[] = (response.data || []).map((pet: any) => ({
                ...mapRawPetToPetRecord(pet),
                status: 'Archived'
            }));

            setRemovedPets(mapped);
        } catch (error) {
            console.error('Error fetching removed pets:', error);
        } finally {
            setLoadingRemoved(false);
        }
    };

    useEffect(() => {
        fetchRegisteredPets();
        fetchRemovedPets();
    }, []);

    const handleSelectPet = (pet: PetRecord) => {
        setSelectedPet(pet);
    };

    const refreshPets = () => {
        fetchRegisteredPets(true);
        fetchRemovedPets();
    };

    // Restore Pet
    const handleRestorePet = async (petToRestore: PetRecord) => {
        try {
            setIsRestoring(true);
            await api.post(`/pets/${petToRestore.id}/restore`);
            invalidateCache('subd_pet_records');
            showToast(`Successfully restored "${petToRestore.name}" back to active pet records!`);
            setConfirmingRestorePet(null);
            if (selectedPet?.id === petToRestore.id) {
                setSelectedPet(null);
            }
            refreshPets();
        } catch (error: any) {
            console.error('Error restoring pet:', error);
            showToast(error.response?.data?.detail || 'Failed to restore pet record.', true);
        } finally {
            setIsRestoring(false);
        }
    };

    // Stats calculations
    const totalCount = pets.length;
    const vaccinatedCount = pets.filter(p => p.isVaccinated).length;
    const pendingCount = pets.filter(p => p.status === 'Lost' || p.status === 'Found').length;
    const complianceRate = totalCount > 0 ? Math.round((vaccinatedCount / totalCount) * 100) : 0;

    const totalRemovedCount = removedPets.length;
    const removedDogCount = removedPets.filter(p => (p.species || '').toLowerCase() === 'dog').length;
    const removedCatCount = removedPets.filter(p => (p.species || '').toLowerCase() === 'cat').length;

    // Filtered Removed Pets
    const filteredRemovedPets = removedPets.filter(pet => {
        const matchesSearch = 
            pet.name.toLowerCase().includes(removedSearchTerm.toLowerCase()) ||
            (pet.breed || '').toLowerCase().includes(removedSearchTerm.toLowerCase()) ||
            (pet.species || '').toLowerCase().includes(removedSearchTerm.toLowerCase()) ||
            (pet.ownerName || '').toLowerCase().includes(removedSearchTerm.toLowerCase()) ||
            pet.idNumber.toLowerCase().includes(removedSearchTerm.toLowerCase());

        const matchesSpecies = removedSpeciesFilter === 'ALL' || pet.species.toLowerCase() === removedSpeciesFilter.toLowerCase();
        return matchesSearch && matchesSpecies;
    });

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className={`px-5 py-3.5 rounded-2xl shadow-xl border flex items-center gap-3 text-sm font-bold ${
                        toastMessage.isError 
                            ? 'bg-rose-50 border-rose-200 text-rose-800' 
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}>
                        <span>{toastMessage.isError ? '⚠️' : '✅'}</span>
                        <span>{toastMessage.text}</span>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <SubdSidebar mobileOpen={mobileMenuOpen} onMobileClose={() => setMobileMenuOpen(false)} />

            {/* Main Content */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {/* Navbar */}
                <SubdNavbar
                    onMenuToggle={() => setMobileMenuOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Pet Records</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Manage active registered animals and view archived records
                            </p>
                        </div>
                    }
                />

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 pb-36 md:pb-8 flex flex-col gap-6 custom-scrollbar">
                    <div className="max-w-7xl mx-auto w-full flex flex-col gap-6">
                    
                    {/* Header Action Bar with Tab Switcher */}
                    <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 shrink-0">
                        {/* Tab Switcher */}
                        <div className="inline-flex bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80 shadow-2xs self-start w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={() => setActiveTab('active')}
                                className={`flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                                    activeTab === 'active'
                                        ? 'bg-white text-[#F97316] shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <span className="text-sm text-[#F97316]">🐾</span>
                                <span>Active Records</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    activeTab === 'active' 
                                        ? 'bg-[#F97316] text-white' 
                                        : 'bg-slate-200 text-slate-600'
                                }`}>
                                    {totalCount}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab('removed')}
                                className={`flex-1 sm:flex-initial px-4 sm:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                                    activeTab === 'removed'
                                        ? 'bg-white text-[#F97316] shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span>Archived Records</span>
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                    activeTab === 'removed' 
                                        ? 'bg-[#F97316] text-white' 
                                        : 'bg-slate-200 text-slate-600'
                                }`}>
                                    {totalRemovedCount}
                                </span>
                            </button>
                        </div>

                        {/* Top Actions & Illustration Banner (Mobile + Desktop) */}
                        {activeTab === 'active' ? (
                            <div className="flex items-center justify-between gap-3 w-full md:w-auto">
                                <button 
                                    onClick={() => setIsAddModalOpen(true)}
                                    className="px-5 sm:px-6 py-3 bg-[#F97316] hover:bg-[#EA580C] text-white rounded-2xl shadow-sm flex items-center gap-2 font-black text-xs sm:text-sm cursor-pointer transition-all active:scale-[0.98]"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add New Pet
                                </button>
                                
                                {/* Cute Dog & Cat Illustration Banner on Right */}
                                <div className="block md:hidden">
                                    <PetsIllustration />
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Filter:</span>
                                <div className="inline-flex bg-gray-100/80 p-1 rounded-xl border border-gray-200/60 text-xs font-black uppercase tracking-wider">
                                    <button
                                        onClick={() => setRemovedSpeciesFilter('ALL')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${
                                            removedSpeciesFilter === 'ALL' 
                                                ? 'bg-white text-gray-900 shadow-sm' 
                                                : 'text-gray-500 hover:text-gray-800'
                                        }`}
                                    >
                                        All ({totalRemovedCount})
                                    </button>
                                    <button
                                        onClick={() => setRemovedSpeciesFilter('Dog')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${
                                            removedSpeciesFilter === 'Dog' 
                                                ? 'bg-white text-indigo-600 shadow-sm' 
                                                : 'text-gray-500 hover:text-gray-800'
                                        }`}
                                    >
                                        Dogs ({removedDogCount})
                                    </button>
                                    <button
                                        onClick={() => setRemovedSpeciesFilter('Cat')}
                                        className={`px-3 py-1.5 rounded-lg transition-all ${
                                            removedSpeciesFilter === 'Cat' 
                                                ? 'bg-white text-teal-600 shadow-sm' 
                                                : 'text-gray-500 hover:text-gray-800'
                                        }`}
                                    >
                                        Cats ({removedCatCount})
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Active Records View */}
                    {activeTab === 'active' && (
                        <>
                            {/* Stats Row (3 Columns matching photo) */}
                            {!selectedPet && (
                                <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 animate-in fade-in duration-500 shrink-0">
                                    <StatCard 
                                        label="Total Registered" 
                                        value={totalCount.toString()} 
                                        badge="Live" 
                                        badgeVariant="warning"
                                        icon={<span className="text-base text-orange-500">🐾</span>}
                                    />
                                    <StatCard 
                                        label="Fully Vaccinated" 
                                        value={vaccinatedCount.toString()} 
                                        badge={`${complianceRate}%`} 
                                        badgeVariant="info"
                                        icon={<span className="text-base text-sky-500">💉</span>}
                                    />
                                    <StatCard 
                                        label="Lost / Found Cases" 
                                        value={pendingCount.toString()} 
                                        badge={pendingCount > 0 ? "Alert" : "Clear"} 
                                        badgeVariant={pendingCount > 0 ? "error" : "info"}
                                        icon={<span className="text-base text-slate-700">🔍</span>}
                                    />
                                </div>
                            )}

                            {/* Active Records Content Area */}
                            <div className="flex flex-col gap-4 sm:gap-6 flex-1 min-h-0">
                                <div className="hidden md:flex justify-between items-center shrink-0">
                                    <h2 className="text-xl font-black text-gray-900">Active Records</h2>
                                    <div className="flex items-center gap-6">
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                </svg>
                                            </div>
                                            <input 
                                                type="text" 
                                                placeholder="🔍 Search pets..." 
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#B35D25]/20 focus:border-[#B35D25] transition-all w-64 shadow-sm"
                                            />
                                        </div>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                            Showing {loading ? 0 : Math.min(pets.length, 10)} of {pets.length}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0">
                                    <PetTable 
                                        pets={pets} 
                                        onSelectPet={handleSelectPet} 
                                        selectedPetId={selectedPet?.id || null} 
                                        searchTerm={searchTerm} 
                                        onSearchChange={setSearchTerm}
                                        loading={loading}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* Removed Records View */}
                    {activeTab === 'removed' && (
                        <>
                            {/* Stats Row */}
                            <div className="grid grid-cols-3 gap-2 sm:gap-4 md:gap-6 animate-in fade-in duration-500 shrink-0">
                                <StatCard
                                    label="Total Archived Records"
                                    value={totalRemovedCount.toString()}
                                    badge="Archived"
                                    badgeVariant="warning"
                                />
                                <StatCard
                                    label="Canines (Dogs)"
                                    value={removedDogCount.toString()}
                                    badge="Canine"
                                    badgeVariant="info"
                                />
                                <StatCard
                                    label="Felines (Cats)"
                                    value={removedCatCount.toString()}
                                    badge="Feline"
                                    badgeVariant="info"
                                />
                            </div>

                            {/* Removed Table Section */}
                            <div className="flex flex-col gap-6 flex-1 min-h-0">
                                <div className="flex justify-between items-center shrink-0">
                                    <div>
                                        <h2 className="text-xl font-black text-gray-900">Archived Pet Records</h2>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                            Archived animals are safely kept here and can be restored back anytime
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="relative">
                                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                </svg>
                                            </div>
                                            <input
                                                type="text"
                                                placeholder="🔍 Search archived pets..."
                                                value={removedSearchTerm}
                                                onChange={(e) => setRemovedSearchTerm(e.target.value)}
                                                className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#B35D25]/20 focus:border-[#B35D25] transition-all w-64 shadow-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Removed Records Table */}
                                <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.015)] border border-gray-100/80 overflow-hidden w-full transition-all duration-300">
                                    <div className="overflow-x-auto w-full">
                                        <table className="w-full text-left border-collapse min-w-[700px]">
                                            <thead>
                                                <tr className="border-b border-gray-50 bg-[#FAFAF9]/50">
                                                    <th className="px-6 py-4.5 pl-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Pet Details</th>
                                                    <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Breed & ID</th>
                                                    <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Species</th>
                                                    <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Owner / Community</th>
                                                    <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                                    <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {loadingRemoved ? (
                                                    Array.from({ length: 3 }).map((_, idx) => (
                                                        <tr key={idx} className="border-b border-gray-50 last:border-none animate-pulse">
                                                            <td className="px-6 py-5 pl-8">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-11 h-11 bg-gray-100 rounded-xl"></div>
                                                                    <div className="space-y-2">
                                                                        <div className="h-4 w-20 bg-gray-100 rounded"></div>
                                                                        <div className="h-3 w-12 bg-gray-50 rounded"></div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-5"><div className="h-4 w-24 bg-gray-100 rounded"></div></td>
                                                            <td className="px-6 py-5"><div className="h-4 w-12 bg-gray-100 rounded"></div></td>
                                                            <td className="px-6 py-5"><div className="h-4 w-20 bg-gray-100 rounded"></div></td>
                                                            <td className="px-6 py-5"><div className="h-6 w-16 bg-gray-100 rounded-full"></div></td>
                                                            <td className="px-6 py-5 flex justify-center gap-2"><div className="h-8 w-20 bg-gray-100 rounded-xl"></div></td>
                                                        </tr>
                                                    ))
                                                ) : filteredRemovedPets.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="px-6 py-24 text-center">
                                                            <div className="flex flex-col items-center gap-2.5 max-w-[320px] mx-auto">
                                                                <div className="w-16 h-16 bg-orange-50/60 rounded-[1.5rem] flex items-center justify-center text-[#B35D25] border border-orange-100 shadow-inner">
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </div>
                                                                <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight mt-2">No Archived Records</h4>
                                                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                                                                    {removedSearchTerm ? `No archived pets match "${removedSearchTerm}"` : 'There are currently no archived pet records in the archive.'}
                                                                </p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredRemovedPets.map((pet) => (
                                                        <tr
                                                            key={pet.id}
                                                            className="group hover:bg-[#B35D25]/5 transition-all duration-300 border-b border-gray-50/80 last:border-0"
                                                        >
                                                            {/* Pet Details (Avatar & Name) */}
                                                            <td className="px-6 py-4.5 pl-8">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="relative rounded-xl overflow-hidden group-hover:shadow-md group-hover:shadow-[#B35D25]/10 transition-all duration-300 w-11 h-11 shrink-0 border border-gray-100">
                                                                        <img
                                                                            src={getPetPicture(pet.avatar)}
                                                                            alt={pet.name}
                                                                            className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110"
                                                                            onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-sm font-black text-gray-900 leading-tight group-hover:text-[#B35D25] transition-colors">{pet.name}</p>
                                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{pet.gender} • {pet.age}</p>
                                                                    </div>
                                                                </div>
                                                            </td>

                                                            {/* Breed & ID */}
                                                            <td className="px-6 py-4.5">
                                                                <div>
                                                                    <p className="text-xs font-black text-gray-800 uppercase tracking-wide">{pet.breed || 'Unknown Breed'}</p>
                                                                    <p className="text-[9px] font-bold text-gray-400 tracking-wider uppercase mt-0.5">{pet.idNumber}</p>
                                                                </div>
                                                            </td>

                                                            {/* Species & Size */}
                                                            <td className="px-6 py-4.5">
                                                                <div className="flex flex-col gap-1 items-start">
                                                                    <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                                                        (pet.species || 'Dog').toLowerCase() === 'dog' 
                                                                        ? 'bg-indigo-50/50 text-indigo-600 border-indigo-100/50' 
                                                                        : 'bg-teal-50/50 text-teal-600 border-teal-100/50'
                                                                    }`}>
                                                                        {pet.species || 'Dog'}
                                                                    </span>
                                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider pl-0.5">
                                                                        {pet.sizeCategory || 'Medium'} Size
                                                                    </span>
                                                                </div>
                                                            </td>

                                                            {/* Owner */}
                                                            <td className="px-6 py-4.5">
                                                                <div>
                                                                    <p className="text-xs font-black text-gray-900 leading-tight">{pet.ownerName}</p>
                                                                    <p className="text-[9px] font-bold text-gray-400 tracking-tight lowercase mt-0.5">{pet.ownerEmail}</p>
                                                                </div>
                                                            </td>

                                                            {/* Status Badge */}
                                                            <td className="px-6 py-4.5">
                                                                <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest bg-gray-100 text-gray-600 border border-gray-200/80">
                                                                    Archived
                                                                </span>
                                                            </td>

                                                            {/* Actions */}
                                                            <td className="px-6 py-4.5 text-center">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSelectedPet(pet)}
                                                                        className="px-3 py-1.5 bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-200 cursor-pointer"
                                                                    >
                                                                        Details
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setConfirmingRestorePet(pet)}
                                                                        className="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-200 cursor-pointer shadow-sm hover:shadow-emerald-600/20"
                                                                    >
                                                                        Restore
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Add Pet Modal */}
                    <AddPetModal isOpen={isAddModalOpen} onClose={() => {
                        setIsAddModalOpen(false);
                        refreshPets();
                    }} />

                    {/* Edit Pet Modal */}
                    <AddPetModal 
                        isOpen={isEditModalOpen} 
                        editPetData={editingPet}
                        onClose={() => {
                            setIsEditModalOpen(false);
                            setEditingPet(null);
                            refreshPets();
                        }} 
                    />

                    {/* Restore Confirmation Modal */}
                    {confirmingRestorePet && (
                        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                            <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 text-center animate-in zoom-in-95 duration-200">
                                <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-emerald-100 shadow-inner">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Restore Pet Record?</h3>
                                <p className="text-xs font-bold text-gray-500 mt-2 leading-relaxed">
                                    Are you sure you want to restore <span className="text-gray-900 font-black">"{confirmingRestorePet.name}"</span> back to active registered pets? It will become visible across the subdivision records.
                                </p>

                                <div className="flex items-center justify-center gap-3 mt-6">
                                    <button
                                        type="button"
                                        disabled={isRestoring}
                                        onClick={() => setConfirmingRestorePet(null)}
                                        className="px-5 py-2.5 rounded-xl border border-gray-200 text-xs font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isRestoring}
                                        onClick={() => handleRestorePet(confirmingRestorePet)}
                                        className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-2"
                                    >
                                        {isRestoring ? (
                                            <>
                                                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                                                </svg>
                                                Restoring...
                                            </>
                                        ) : (
                                            'Confirm Restore'
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Centered Pet Details Modal Popup */}
                    {selectedPet && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 sm:p-12 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
                            <div className="w-full max-w-6xl rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-300 bg-white overflow-hidden flex flex-col max-h-[90vh]">
                                {selectedPet.status === 'Archived' && (
                                    <div className="bg-amber-50 border-b border-amber-200/80 px-8 py-3 flex items-center justify-between shrink-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-amber-600">📦</span>
                                            <span className="text-xs font-black uppercase tracking-wider text-amber-800">
                                                This pet record is currently archived (Removed from active list).
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setConfirmingRestorePet(selectedPet);
                                            }}
                                            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest transition-all shadow-sm cursor-pointer"
                                        >
                                            📤 Restore to Active Records
                                        </button>
                                    </div>
                                )}
                                <div className="flex-1 overflow-y-auto">
                                    <PetDetailPanel 
                                        pet={selectedPet} 
                                        onClose={() => {
                                            setSelectedPet(null);
                                            refreshPets();
                                        }}
                                        onEditClick={(petToEdit) => {
                                            setEditingPet(petToEdit);
                                            setSelectedPet(null);
                                            setIsEditModalOpen(true);
                                        }}
                                        onOwnerAssigned={() => {
                                            refreshPets();
                                            setSelectedPet(null);
                                        }}
                                        onDeletePet={() => {
                                            showToast('Pet record removed and moved to Removed Records archive.');
                                            refreshPets();
                                            setSelectedPet(null);
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    </div>
                </main>
                <SubdBottomNav />
            </div>
        </div>
    );
};

export default SubdPetRecords;
