import React, { useState, useEffect, useMemo } from 'react';
import { DEFAULT_PET_AVATAR, getPetThumb } from '../../utils/avatar';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import SubdBottomNav from '../../components/Navbars/SubdBottomNav';
import StatCard from '../../components/PetRecords/StatCard';
import PetTable from '../../components/PetRecords/PetTable';
import { type PetRecord, type PetSortOrder, mapRawPetToPetRecord, sortPetRecords } from '../../components/PetRecords/types';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import AddPetModal from '../../components/PetRecords/AddPetModal';
import PetRecordReviewPanel from '../../components/PetRecordReviewPanel';
import { api } from '../../utils/api';
import { getCachedData, setCachedData, invalidateCache } from '../../utils/cache';

const SubdPetRecords: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'active' | 'removed'>('active');

    // Active Pets State
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingPet, setEditingPet] = useState<PetRecord | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState<PetSortOrder>('newest');
    const [pets, setPets] = useState<PetRecord[]>(() => {
        const cached = getCachedData<PetRecord[]>('subd_pet_records');
        return cached ? sortPetRecords(cached, 'newest') : [];
    });
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<PetRecord[]>('subd_pet_records'));

    // Removed Pets State
    const [removedPets, setRemovedPets] = useState<PetRecord[]>([]);
    const [loadingRemoved, setLoadingRemoved] = useState<boolean>(false);
    const [removedSearchTerm, setRemovedSearchTerm] = useState<string>('');
    const [removedSortOrder, setRemovedSortOrder] = useState<PetSortOrder>('newest');
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
            const sorted = sortPetRecords(mappedPets, sortOrder);

            setPets(sorted);
            setCachedData('subd_pet_records', sorted);
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

    const sortedRemovedPets = useMemo(() => {
        return sortPetRecords(filteredRemovedPets, removedSortOrder);
    }, [filteredRemovedPets, removedSortOrder]);

    return (
        <div className="flex h-screen bg-[#F8FAFC]">
            {/* Toast Notification */}
            {toastMessage && (
                <div className="fixed bottom-6 right-6 z-[100] animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className={`px-5 py-3.5 rounded-2xl shadow-xl border flex items-center gap-3 text-sm font-bold ${toastMessage.isError
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
                <main className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 md:p-8 pb-36 md:pb-8 flex flex-col custom-scrollbar">
                    <div className="max-w-6xl mx-auto w-full flex flex-col gap-3 sm:gap-4 min-w-0">
                        {/* Possible duplicate records and residents' ownership claims (staff decide) */}
                        <PetRecordReviewPanel onChanged={() => fetchRegisteredPets(true)} />

                        {/* Heading (phones; desktop shows it in the top bar) */}
                        <div className="md:hidden">
                            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-tight">Pet Records</h1>
                            <p className="text-xs font-semibold text-gray-500">Registered animals in your subdivision.</p>
                        </div>

                        {/* Active / Archived tabs + Add New Pet */}
                        <div className="flex items-center gap-2 min-w-0">
                            <div className="flex-1 sm:flex-initial grid grid-cols-2 gap-1 p-1 bg-gray-100 rounded-2xl min-w-0" role="tablist" aria-label="Records">
                                {([
                                    ['active', 'Active', totalCount],
                                    ['removed', 'Archived', totalRemovedCount],
                                ] as const).map(([key, label, count]) => {
                                    const isActive = activeTab === key;
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            role="tab"
                                            aria-selected={isActive}
                                            onClick={() => setActiveTab(key)}
                                            className={`h-9 px-3 sm:px-5 min-w-0 rounded-xl text-xs font-black inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer ${isActive
                                                ? 'bg-role text-white shadow-sm'
                                                : 'text-gray-600 hover:text-gray-900'
                                            }`}
                                        >
                                            <span className="truncate">{label}<span className="hidden sm:inline"> Records</span></span>
                                            <span className={`px-1.5 py-px rounded-full text-[10px] font-black shrink-0 ${isActive ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-600'}`}>
                                                {count}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {activeTab === 'active' && (
                                <button
                                    type="button"
                                    onClick={() => setIsAddModalOpen(true)}
                                    aria-label="Add New Pet"
                                    className="h-11 px-3.5 sm:px-5 sm:ml-auto shrink-0 bg-role hover:bg-role-hover text-white rounded-xl shadow-sm inline-flex items-center gap-1.5 font-black text-sm cursor-pointer transition-all active:scale-[0.98]"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 stroke-[3]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                    </svg>
                                    <span className="sm:hidden">Add</span><span className="hidden sm:inline">Add New Pet</span>
                                </button>
                            )}
                        </div>

                        {activeTab === 'removed' && (
                            <div className="grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl sm:max-w-sm" role="tablist" aria-label="Archived species">
                                {([
                                    ['ALL', 'All', totalRemovedCount],
                                    ['Dog', 'Dogs', removedDogCount],
                                    ['Cat', 'Cats', removedCatCount],
                                ] as const).map(([key, label, count]) => (
                                    <button
                                        key={key}
                                        type="button"
                                        role="tab"
                                        aria-selected={removedSpeciesFilter === key}
                                        onClick={() => setRemovedSpeciesFilter(key)}
                                        className={`h-8 rounded-lg text-xs font-black transition-all cursor-pointer ${removedSpeciesFilter === key
                                            ? 'bg-white text-role shadow-2xs'
                                            : 'text-gray-500 hover:text-gray-800'
                                        }`}
                                    >
                                        {label} <span className="text-[10px] opacity-70">{count}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Active Records View */}
                        {activeTab === 'active' && (
                            <>
                                {/* Stats Row (3 Columns matching photo) */}
                                {!selectedPet && (
                                    <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
                                        <StatCard
                                            label="Total Registered"
                                            value={totalCount.toString()}
                                            badge="Live"
                                            badgeVariant="warning"
                                        />
                                        <StatCard
                                            label="Fully Vaccinated"
                                            value={vaccinatedCount.toString()}
                                            badge={`${complianceRate}%`}
                                            badgeVariant="info"
                                        />
                                        <StatCard
                                            label="Lost / Found Cases"
                                            value={pendingCount.toString()}
                                            badge={pendingCount > 0 ? "Alert" : "Clear"}
                                            badgeVariant={pendingCount > 0 ? "error" : "info"}
                                        />
                                    </div>
                                )}

                                {/* Active Records Content Area */}
                                <div className="flex flex-col flex-1 min-h-0">
                                    <div className="flex-1 min-h-0">
                                        <PetTable
                                            pets={pets}
                                            onSelectPet={handleSelectPet}
                                            selectedPetId={selectedPet?.id || null}
                                            searchTerm={searchTerm}
                                            onSearchChange={setSearchTerm}
                                            sortOrder={sortOrder}
                                            onSortOrderChange={(newOrder) => {
                                                setSortOrder(newOrder);
                                                setPets(prev => sortPetRecords(prev, newOrder));
                                            }}
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
                                <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
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
                                <div className="flex flex-col gap-3 flex-1 min-h-0">
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 shrink-0">
                                        <p className="text-xs font-semibold text-gray-500">
                                            Archived animals are kept here and can be restored anytime.
                                        </p>
                                        <div className="flex items-center gap-2 min-w-0">
                                            {/* Sort Filter Selector */}
                                            <div className="relative">
                                                <select
                                                    value={removedSortOrder}
                                                    onChange={(e) => setRemovedSortOrder(e.target.value as PetSortOrder)}
                                                    aria-label="Sort archived records"
                                                    className="h-10 pl-3 pr-8 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role transition-all cursor-pointer appearance-none"
                                                >
                                                    <option value="newest">Latest</option>
                                                    <option value="oldest">Earliest</option>
                                                </select>
                                                <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-gray-400">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </div>
                                            </div>

                                            <div className="relative flex-1 min-w-0 sm:flex-initial order-first">
                                                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                    </svg>
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Search archived pets"
                                                    aria-label="Search archived pets"
                                                    value={removedSearchTerm}
                                                    onChange={(e) => setRemovedSearchTerm(e.target.value)}
                                                    className="h-10 w-full sm:w-64 pl-10 pr-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-all"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Removed Records Table */}
                                    <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden w-full min-w-0">
                                        <ul className="md:hidden divide-y divide-slate-100">
                                            {loadingRemoved ? (
                                                Array.from({ length: 3 }).map((_, idx) => (
                                                    <li key={idx} className="flex items-center gap-3 px-3 py-3 animate-pulse">
                                                        <div className="w-13 h-13 bg-slate-100 rounded-xl shrink-0"></div>
                                                        <div className="flex-1 space-y-2">
                                                            <div className="h-4 w-32 bg-slate-100 rounded"></div>
                                                            <div className="h-3 w-24 bg-slate-50 rounded"></div>
                                                        </div>
                                                    </li>
                                                ))
                                            ) : sortedRemovedPets.length === 0 ? (
                                                <li className="px-4 py-10 text-center">
                                                    <div className="w-12 h-12 mx-auto bg-role-soft rounded-full flex items-center justify-center text-role mb-2">🗂️</div>
                                                    <h4 className="text-sm font-black text-slate-900">No archived records</h4>
                                                    <p className="text-xs text-slate-500 mt-1">
                                                        {removedSearchTerm ? `No archived pets match "${removedSearchTerm}"` : 'There are no archived pet records.'}
                                                    </p>
                                                </li>
                                            ) : (
                                                sortedRemovedPets.map((pet) => (
                                                    <li key={pet.id} className="flex items-center gap-3 px-3 py-3 min-w-0">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedPet(pet)}
                                                            aria-label={`View ${pet.name} record`}
                                                            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                                                        >
                                                            <img loading="lazy" decoding="async"
                                                                src={getPetThumb(pet.avatar)}
                                                                alt=""
                                                                className="w-13 h-13 rounded-xl object-cover border border-slate-100 bg-slate-50 shrink-0"
                                                                onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                            />
                                                            <span className="min-w-0 flex-1">
                                                                <span className="block text-[15px] font-black text-slate-900 leading-snug line-clamp-2 break-words">{pet.name}</span>
                                                                <span className="block text-xs font-semibold text-slate-500 truncate mt-0.5">{pet.breed || 'Unknown breed'} · {pet.species || 'Dog'}</span>
                                                                <span className="block text-[11px] text-slate-400 truncate">{pet.ownerName || 'No owner'}</span>
                                                            </span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setConfirmingRestorePet(pet)}
                                                            className="h-10 px-3 shrink-0 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-600 hover:text-white text-xs font-black transition-colors cursor-pointer"
                                                        >
                                                            Restore
                                                        </button>
                                                    </li>
                                                ))
                                            )}
                                        </ul>
                                        <div className="hidden md:block overflow-x-auto w-full">
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
                                                    ) : sortedRemovedPets.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={6} className="px-6 py-24 text-center">
                                                                <div className="flex flex-col items-center gap-2.5 max-w-[320px] mx-auto">
                                                                    <div className="w-16 h-16 bg-role-soft/60 rounded-[1.5rem] flex items-center justify-center text-[#B35D25] border border-role-muted shadow-inner">
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
                                                        sortedRemovedPets.map((pet) => (
                                                            <tr
                                                                key={pet.id}
                                                                className="group hover:bg-[#B35D25]/5 transition-all duration-300 border-b border-gray-50/80 last:border-0"
                                                            >
                                                                {/* Pet Details (Avatar & Name) */}
                                                                <td className="px-6 py-4.5 pl-8">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="relative rounded-xl overflow-hidden group-hover:shadow-md group-hover:shadow-[#B35D25]/10 transition-all duration-300 w-11 h-11 shrink-0 border border-gray-100">
                                                                            <img loading="lazy" decoding="async"
                                                                                src={getPetThumb(pet.avatar)}
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
                                                                        <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${(pet.species || 'Dog').toLowerCase() === 'dog'
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

                        {/* Centered Pet Details Modal Popup / Fullscreen on Mobile */}
                        {selectedPet && (
                            <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6 md:p-12 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
                                <div className="w-full h-full sm:h-auto sm:max-h-[90vh] max-w-6xl rounded-none sm:rounded-[2.5rem] shadow-2xl animate-in zoom-in-95 duration-300 bg-[#FAFAF9] overflow-hidden flex flex-col border-none sm:border sm:border-gray-100">
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
                <SubdBottomNav activeTab="records" />
            </div>
        </div>
    );
};

export default SubdPetRecords;
