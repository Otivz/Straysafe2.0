import { useAutoRefresh } from '../../utils/useAutoRefresh';
import React, { useState, useEffect } from 'react';
import { DEFAULT_PET_AVATAR } from '../../utils/avatar';
import { cloudinaryResized } from '../../utils/cloudinaryImage';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import BrgyBottomNav from '../../components/Navbars/BrgyBottomNav';
import StatCard from '../../components/PetRecords/StatCard';
import PetTable from '../../components/PetRecords/PetTable';
import { type PetRecord, mapRawPetToPetRecord } from '../../components/PetRecords/types';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import AddPetModal from '../../components/PetRecords/AddPetModal';
import PetRecordReviewPanel from '../../components/PetRecordReviewPanel';
import { api } from '../../utils/api';
import { getCachedData, setCachedData, invalidateCache } from '../../utils/cache';
import { usePersistentState } from '../../utils/useCachedState';

const BrgyPetRecords: React.FC = () => {
    const [activeTab, setActiveTab] = usePersistentState<'active' | 'removed'>('brgy_pets_tab', 'active');
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

    // Active Pets State
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingPet, setEditingPet] = useState<PetRecord | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = usePersistentState('brgy_pets_search', '');
    const [pets, setPets] = useState<PetRecord[]>(() => getCachedData<PetRecord[]>('brgy_pet_records') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<PetRecord[]>('brgy_pet_records'));

    // Removed Pets State
    const [removedPets, setRemovedPets] = useState<PetRecord[]>([]);
    const [loadingRemoved, setLoadingRemoved] = useState<boolean>(false);
    const [removedSearchTerm, setRemovedSearchTerm] = useState<string>('');
    const [removedSpeciesFilter, setRemovedSpeciesFilter] = usePersistentState<'ALL' | 'Dog' | 'Cat'>('brgy_pets_species', 'ALL');
    const [confirmingRestorePet, setConfirmingRestorePet] = useState<PetRecord | null>(null);
    const [isRestoring, setIsRestoring] = useState<boolean>(false);

    // Toast Notifications
    const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

    const showToast = (text: string, isError = false) => {
        setToastMessage({ text, isError });
        setTimeout(() => setToastMessage(null), 4000);
    };

    // Fetch Active Pets
    const fetchRegisteredPets = async (forceLoading = false) => {
        try {
            if (forceLoading || !getCachedData('brgy_pet_records')) {
                setLoading(true);
            }
            const response = await api.get('/pets/');

            const mappedPets: PetRecord[] = response.data.map((pet: any) => mapRawPetToPetRecord(pet));

            setPets(mappedPets);
            setSelectedPet(current => current ? mappedPets.find(pet => pet.id === current.id) || current : null);
            setCachedData('brgy_pet_records', mappedPets);
        } catch (error) {
            console.error('Error fetching barangay pets:', error);
            if (!getCachedData('brgy_pet_records')) {
                setPets([]);
            }
        } finally {
            setLoading(false);
        }
    };

    // Fetch Removed / Archived Pets
    const fetchRemovedPets = async (silent = false) => {
        try {
            if (!silent) setLoadingRemoved(true);
            const response = await api.get('/pets/removed');

            const mapped: PetRecord[] = (response.data || []).map((pet: any) => ({
                ...mapRawPetToPetRecord(pet),
                status: 'Archived'
            }));

            setRemovedPets(mapped);
            setSelectedPet(current => current ? mapped.find(pet => pet.id === current.id) || current : null);
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

    useAutoRefresh(async () => {
        await Promise.all([fetchRegisteredPets(), fetchRemovedPets(true)]);
    });

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
            invalidateCache('brgy_pet_records');
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
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800 relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="hidden md:block absolute top-0 left-0 w-[600px] h-[600px] bg-[#B35D25]/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
            <div className="hidden md:block absolute bottom-0 right-0 w-[800px] h-[800px] bg-role-soft/50 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0"></div>
            <div className="hidden md:block absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-gray-100/50 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>

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
            <div className="z-10 flex shrink-0">
                <BrgySidebar
                    isMobileOpen={mobileDrawerOpen}
                    onCloseMobile={() => setMobileDrawerOpen(false)}
                />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <BrgyNavbar
                    onMenuToggle={() => setMobileDrawerOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Pet Records</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                Manage registered jurisdiction animals and view archived records
                            </p>
                        </div>
                    }
                />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto px-3 py-4 sm:p-6 md:p-8 pb-36 lg:pb-8 flex flex-col custom-scrollbar">
                    <div className="max-w-6xl mx-auto w-full flex flex-col gap-3 sm:gap-4 min-w-0">
                        {/* Possible duplicate records and residents' ownership claims (staff decide) */}
                        <PetRecordReviewPanel onChanged={() => fetchRegisteredPets(true)} />

                        {/* Heading (phones; desktop shows it in the top bar) */}
                        <div className="md:hidden">
                            <h1 className="text-lg font-black text-gray-900 tracking-tight leading-tight">Pet Records</h1>
                            <p className="text-xs font-semibold text-gray-500">Monitoring view · records are added by Subdivision Leaders.</p>
                        </div>

                        {/* Active / Archived tabs (+ monitoring note on desktop) */}
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
                            {/* Pet records are added by Subdivision Leaders; the Barangay monitors them here. */}
                            <span
                                title="Animal records are added by the Subdivision Leader. Barangay staff can add one from a report the Barangay is handling."
                                className="hidden md:inline-flex ml-auto h-9 px-3 items-center gap-1.5 bg-role-soft text-role-strong border border-role-border rounded-xl font-black text-xs"
                            >
                                👁 Monitoring view
                            </span>
                        </div>

                        {/* Active Records View */}
                        {activeTab === 'active' && (
                            <>
                                {/* Stats Row (3 Columns matching photo on mobile, 4 on desktop) */}
                                {!selectedPet && (
                                    <div className="grid grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 shrink-0">
                                        <StatCard
                                            label="Total Registered"
                                            value={loading ? '0' : totalCount.toString()}
                                            badge="Live"
                                            badgeVariant="warning"
                                        />
                                        <StatCard
                                            label="Vaccinated"
                                            value={loading ? '0' : vaccinatedCount.toString()}
                                            badge="Protected"
                                            badgeVariant="info"
                                        />
                                        <StatCard
                                            label="Lost / Found"
                                            value={loading ? '0' : pendingCount.toString()}
                                            badge={pendingCount > 0 ? "Alert" : "Clear"}
                                            badgeVariant={pendingCount > 0 ? "warning" : "info"}
                                        />
                                        <div className="hidden lg:block h-full">
                                            <StatCard
                                                label="Vaccination Rate"
                                                value={`${complianceRate}%`}
                                                badge="Jurisdiction"
                                                badgeVariant="success"
                                            />
                                        </div>
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
                                            loading={loading}
                                        />
                                    </div>
                                </div>
                            </>
                        )}

                        {/* TAB 2: REMOVED / ARCHIVED PETS */}
                        {activeTab === 'removed' && (
                            <div className="flex flex-col gap-3 sm:gap-4">
                                {/* Stats Header for Removed */}
                                <div className="grid grid-cols-3 gap-2 sm:gap-3">
                                    <StatCard label="Total Archived" value={totalRemovedCount} />
                                    <StatCard label="Archived Dogs" value={removedDogCount} />
                                    <StatCard label="Archived Cats" value={removedCatCount} />
                                </div>

                                {/* Search & Filter Toolbar */}
                                <div className="bg-white rounded-2xl p-3 sm:p-4 border border-slate-200/80 flex flex-col sm:flex-row sm:flex-wrap gap-2.5 sm:items-center justify-between min-w-0">
                                    <div className="relative flex-1 min-w-0 sm:min-w-[260px]">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            placeholder="Search name, breed, ID or owner"
                                            aria-label="Search archived pets"
                                            value={removedSearchTerm}
                                            onChange={(e) => setRemovedSearchTerm(e.target.value)}
                                            className="w-full h-11 pl-11 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-all placeholder:text-gray-400"
                                        />
                                    </div>

                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="flex-1 sm:flex-initial grid grid-cols-3 gap-1 p-1 bg-gray-100 rounded-xl min-w-0" role="tablist" aria-label="Archived species">
                                        {(['ALL', 'Dog', 'Cat'] as const).map((spec) => (
                                            <button
                                                key={spec}
                                                type="button"
                                                role="tab"
                                                aria-selected={removedSpeciesFilter === spec}
                                                onClick={() => setRemovedSpeciesFilter(spec)}
                                                className={`h-8 px-3 min-w-0 rounded-lg text-xs font-black transition-all cursor-pointer ${removedSpeciesFilter === spec
                                                    ? 'bg-white text-role shadow-2xs'
                                                    : 'text-gray-500 hover:text-gray-800'
                                                    }`}
                                            >
                                                {spec === 'ALL' ? 'All' : spec === 'Dog' ? 'Dogs' : 'Cats'}
                                            </button>
                                        ))}
                                        </div>

                                        <button
                                            onClick={() => fetchRemovedPets()}
                                            className="w-10 h-10 shrink-0 flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all cursor-pointer"
                                            title="Refresh Archived Pets"
                                            aria-label="Refresh archived pets"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${loadingRemoved ? 'animate-spin text-rose-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Removed Table */}
                                <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden min-w-0">
                                    {loadingRemoved ? (
                                        <div className="py-20 text-center flex flex-col items-center justify-center">
                                            <div className="w-10 h-10 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin"></div>
                                            <p className="text-xs font-bold text-gray-400 mt-4 uppercase tracking-wider">Loading archived records...</p>
                                        </div>
                                    ) : filteredRemovedPets.length === 0 ? (
                                        <div className="py-24 text-center flex flex-col items-center justify-center px-4">
                                            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-2xl mb-4 border border-gray-100">
                                                📂
                                            </div>
                                            <h3 className="text-base font-black text-gray-800 uppercase tracking-wide">No Archived Records</h3>
                                            <p className="text-xs text-gray-400 max-w-sm mt-1">
                                                {removedSearchTerm ? 'No records match your search criteria.' : 'There are currently no archived pet profiles in the barangay database.'}
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Mobile Archived Cards List */}
                                            <div className="block md:hidden p-4 space-y-3 bg-white">
                                                {filteredRemovedPets.map((pet) => (
                                                    <div key={pet.id} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs space-y-3">
                                                        <div className="flex items-center justify-between gap-3">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <img loading="lazy" decoding="async"
                                                                    src={cloudinaryResized(pet.avatar, 320) || DEFAULT_PET_AVATAR}
                                                                    alt={pet.name}
                                                                    className="w-12 h-12 rounded-2xl object-cover border border-slate-200 bg-slate-50 shrink-0"
                                                                    onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                                />
                                                                <div className="min-w-0">
                                                                    <h4 className="font-black text-slate-900 text-sm truncate">{pet.name}</h4>
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{pet.idNumber}</p>
                                                                    <p className="text-xs font-semibold text-slate-600 truncate mt-0.5">{pet.breed} • {pet.species}</p>
                                                                </div>
                                                            </div>
                                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 font-black text-[10px] shrink-0 border border-rose-100">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                                Archived
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                                                            <div>
                                                                <span className="text-[10px] font-bold text-slate-400 block uppercase">Owner</span>
                                                                <span className="font-bold text-slate-800">{pet.ownerName || 'None'}</span>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setConfirmingRestorePet(pet)}
                                                                className="px-3.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-black text-xs rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer border border-emerald-200"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                </svg>
                                                                Restore
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Desktop Table View */}
                                            <div className="hidden md:block overflow-x-auto">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-gray-100 bg-gray-50/50 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                            <th className="py-4 px-6">Animal Info</th>
                                                            <th className="py-4 px-6">Species / Breed</th>
                                                            <th className="py-4 px-6">Owner Contact</th>
                                                            <th className="py-4 px-6">Archived At</th>
                                                            <th className="py-4 px-6 text-right">Actions</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-50 text-xs font-medium">
                                                        {filteredRemovedPets.map((pet) => (
                                                            <tr key={pet.id} className="hover:bg-gray-50/60 transition-colors">
                                                                <td className="py-4 px-6">
                                                                    <div className="flex items-center gap-3">
                                                                        <img loading="lazy" decoding="async"
                                                                            src={cloudinaryResized(pet.avatar, 320) || DEFAULT_PET_AVATAR}
                                                                            alt={pet.name}
                                                                            className="w-10 h-10 rounded-2xl object-cover border border-gray-100 bg-gray-50"
                                                                            onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                                        />
                                                                        <div>
                                                                            <p className="font-black text-gray-900 leading-tight">{pet.name}</p>
                                                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{pet.idNumber}</p>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="py-4 px-6">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-gray-800">{pet.breed}</span>
                                                                        <span className="text-[10px] text-gray-400 uppercase font-semibold">{pet.species} • {pet.gender}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-4 px-6">
                                                                    <div className="flex flex-col">
                                                                        <span className="font-bold text-gray-800">{pet.ownerName}</span>
                                                                        <span className="text-[10px] text-gray-400">{pet.ownerPhone}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="py-4 px-6">
                                                                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px]">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                                                        Archived
                                                                    </span>
                                                                </td>
                                                                <td className="py-4 px-6 text-right">
                                                                    <button
                                                                        onClick={() => setConfirmingRestorePet(pet)}
                                                                        className="px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs rounded-xl transition-all inline-flex items-center gap-1.5 cursor-pointer"
                                                                    >
                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                        </svg>
                                                                        Restore Record
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                    </div>
                </div>

                <BrgyBottomNav />
            </main>

            {/* Centered Pet Details Modal Popup / Fullscreen on Mobile */}
            {selectedPet && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6 md:p-10 bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
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

            {/* Add Pet Modal */}
            <AddPetModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                onPetCreated={() => {
                    refreshPets();
                    showToast("New pet registered successfully!");
                }}
            />

            {/* Edit Pet Modal */}
            {editingPet && (
                <AddPetModal
                    isOpen={isEditModalOpen}
                    onClose={() => {
                        setIsEditModalOpen(false);
                        setEditingPet(null);
                    }}
                    editPetData={editingPet.rawPetObj || editingPet}
                    onPetCreated={() => {
                        refreshPets();
                        showToast("Pet record updated successfully!");
                    }}
                />
            )}

            {/* Restore Confirmation Modal */}
            {confirmingRestorePet && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200 text-center">
                        <div className="w-16 h-16 rounded-3xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-2xl mx-auto mb-4 border border-emerald-100">
                            ♻️
                        </div>
                        <h3 className="text-xl font-black text-gray-900 tracking-tight">Restore Pet Record</h3>
                        <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                            Are you sure you want to restore <span className="font-bold text-gray-800">"{confirmingRestorePet.name}"</span> back to the active registered list?
                        </p>

                        <div className="flex gap-3 mt-8">
                            <button
                                onClick={() => setConfirmingRestorePet(null)}
                                disabled={isRestoring}
                                className="flex-1 py-3 px-4 rounded-xl border border-gray-200 font-bold text-xs uppercase tracking-wider text-gray-600 hover:bg-gray-50 transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleRestorePet(confirmingRestorePet)}
                                disabled={isRestoring}
                                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-xs uppercase tracking-wider text-white shadow-lg shadow-emerald-600/20 transition-all cursor-pointer flex items-center justify-center gap-2"
                            >
                                {isRestoring ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Restoring...</span>
                                    </>
                                ) : (
                                    <span>Confirm Restore</span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyPetRecords;
