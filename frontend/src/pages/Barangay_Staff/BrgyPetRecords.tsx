import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DEFAULT_PET_AVATAR } from '../../utils/avatar';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';
import StatCard from '../../components/PetRecords/StatCard';
import PetTable from '../../components/PetRecords/PetTable';
import { type PetRecord, mapRawPetToPetRecord } from '../../components/PetRecords/types';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import AddPetModal from '../../components/PetRecords/AddPetModal';
import Button from '../../components/Button';
import { api } from '../../utils/api';
import { getCachedData, setCachedData, invalidateCache } from '../../utils/cache';

const BrgyPetRecords: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'active' | 'removed'>('active');
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    
    // Active Pets State
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingPet, setEditingPet] = useState<PetRecord | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [pets, setPets] = useState<PetRecord[]>(() => getCachedData<PetRecord[]>('brgy_pet_records') || []);
    const [loading, setLoading] = useState<boolean>(() => !getCachedData<PetRecord[]>('brgy_pet_records'));

    // Removed Pets State
    const [removedPets, setRemovedPets] = useState<PetRecord[]>([]);
    const [loadingRemoved, setLoadingRemoved] = useState<boolean>(false);
    const [removedSearchTerm, setRemovedSearchTerm] = useState<string>('');
    const [removedSpeciesFilter, setRemovedSpeciesFilter] = useState<'ALL' | 'Dog' | 'Cat'>('ALL');
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
            const response = await axios.get('http://localhost:8000/pets/');

            const mappedPets: PetRecord[] = response.data.map((pet: any) => mapRawPetToPetRecord(pet));

            setPets(mappedPets);
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
    const fetchRemovedPets = async () => {
        try {
            setLoadingRemoved(true);
            const response = await api.get('/pets/removed');

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
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#B35D25]/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
            <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-orange-50/50 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0"></div>
            <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-gray-100/50 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>

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
                <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    {/* Header Action Bar with Tab Switcher */}
                    <div className="flex flex-wrap justify-between items-center gap-4 shrink-0">
                        {/* Tab Switcher */}
                        <div className="flex items-center bg-gray-100/80 p-1.5 rounded-2xl border border-gray-200/60 shadow-xs">
                            <button
                                onClick={() => setActiveTab('active')}
                                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                                    activeTab === 'active'
                                        ? 'bg-white text-[#F97316] shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>Active Registry</span>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                    activeTab === 'active' ? 'bg-orange-100 text-[#F97316]' : 'bg-gray-200 text-gray-600'
                                }`}>
                                    {totalCount}
                                </span>
                            </button>

                            <button
                                onClick={() => setActiveTab('removed')}
                                className={`flex items-center gap-2.5 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer ${
                                    activeTab === 'removed'
                                        ? 'bg-white text-rose-600 shadow-sm'
                                        : 'text-gray-500 hover:text-gray-900'
                                }`}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                <span>Archived Records</span>
                                {totalRemovedCount > 0 && (
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${
                                        activeTab === 'removed' ? 'bg-rose-100 text-rose-600' : 'bg-gray-200 text-gray-600'
                                    }`}>
                                        {totalRemovedCount}
                                    </span>
                                )}
                            </button>
                        </div>

                        {/* Action on Right (Only for Active Registry) */}
                        {activeTab === 'active' && (
                            <Button 
                                onClick={() => setIsAddModalOpen(true)}
                                variant="primary" 
                                size="md" 
                                className="shadow-lg shadow-orange-500/10 font-bold tracking-wide"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                </svg>
                                Register Pet
                            </Button>
                        )}
                    </div>

                    {/* TAB 1: ACTIVE PETS */}
                    {activeTab === 'active' && (
                        <>
                            {/* Stat Cards Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
                                <StatCard
                                    label="TOTAL REGISTERED"
                                    value={loading ? '-' : totalCount.toLocaleString()}
                                    badge="Live"
                                    badgeVariant="warning"
                                    icon={
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                    }
                                />
                                <StatCard
                                    label="VACCINATED"
                                    value={loading ? '-' : vaccinatedCount.toLocaleString()}
                                    badge="Protected"
                                    badgeVariant="info"
                                    icon={
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                        </svg>
                                    }
                                />
                                <StatCard
                                    label="ACTIVE ALERTS"
                                    value={loading ? '-' : pendingCount.toLocaleString()}
                                    badge={pendingCount > 0 ? "Alert" : "Clear"}
                                    badgeVariant={pendingCount > 0 ? "warning" : "info"}
                                    icon={
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    }
                                />
                                <StatCard
                                    label="VACCINATION RATE"
                                    value={loading ? '-' : `${complianceRate}%`}
                                    badge="Jurisdiction"
                                    badgeVariant="success"
                                    icon={
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                        </svg>
                                    }
                                />
                            </div>

                            {/* Active Records Table & Search */}
                            <div className="flex flex-col gap-6 flex-1 min-h-0">
                                <div className="flex justify-between items-center shrink-0">
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
                                                placeholder="Search pets..." 
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 focus:border-[#F97316] transition-all w-64 shadow-sm"
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
                                        loading={loading}
                                        searchTerm={searchTerm}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* TAB 2: REMOVED / ARCHIVED PETS */}
                    {activeTab === 'removed' && (
                        <div className="flex flex-col gap-6">
                            {/* Stats Header for Removed */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Total Archived Records</p>
                                        <h3 className="text-3xl font-black text-gray-900 mt-1">{totalRemovedCount}</h3>
                                        <p className="text-xs text-gray-400 font-medium mt-1">Archived pet registrations</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
                                        🗄️
                                    </div>
                                </div>
                                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Archived Canines</p>
                                        <h3 className="text-3xl font-black text-gray-900 mt-1">{removedDogCount}</h3>
                                        <p className="text-xs text-gray-400 font-medium mt-1">Archived dog profiles</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#F97316] flex items-center justify-center font-bold">
                                        🐕
                                    </div>
                                </div>
                                <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Archived Felines</p>
                                        <h3 className="text-3xl font-black text-gray-900 mt-1">{removedCatCount}</h3>
                                        <p className="text-xs text-gray-400 font-medium mt-1">Archived cat profiles</p>
                                    </div>
                                    <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold">
                                        🐈
                                    </div>
                                </div>
                            </div>

                            {/* Search & Filter Toolbar */}
                            <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm flex flex-wrap gap-4 items-center justify-between">
                                <div className="relative flex-1 min-w-[280px]">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Search by pet name, breed, ID, or owner name..."
                                        value={removedSearchTerm}
                                        onChange={(e) => setRemovedSearchTerm(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50/80 border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 transition-all placeholder:text-gray-400"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    {(['ALL', 'Dog', 'Cat'] as const).map((spec) => (
                                        <button
                                            key={spec}
                                            onClick={() => setRemovedSpeciesFilter(spec)}
                                            className={`px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                                                removedSpeciesFilter === spec
                                                    ? 'bg-rose-500 text-white shadow-sm shadow-rose-500/20'
                                                    : 'bg-gray-100 text-gray-500 hover:text-gray-800'
                                            }`}
                                        >
                                            {spec === 'ALL' ? 'All Species' : spec === 'Dog' ? '🐶 Dogs' : '🐱 Cats'}
                                        </button>
                                    ))}

                                    <button
                                        onClick={fetchRemovedPets}
                                        className="p-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-all cursor-pointer ml-2"
                                        title="Refresh Archived Pets"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${loadingRemoved ? 'animate-spin text-rose-500' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Removed Table */}
                            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
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
                                    <div className="overflow-x-auto">
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
                                                                <img
                                                                    src={pet.avatar || DEFAULT_PET_AVATAR}
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
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* Pet Detail Slide-over Panel */}
            {selectedPet && (
                <PetDetailPanel 
                    pet={selectedPet} 
                    onClose={() => setSelectedPet(null)}
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
                        setSelectedPet(null);
                        refreshPets();
                        showToast("Pet record has been moved to archive.");
                    }}
                />
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
