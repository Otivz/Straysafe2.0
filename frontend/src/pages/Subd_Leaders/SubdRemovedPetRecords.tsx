import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import StatCard from '../../components/PetRecords/StatCard';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import { type PetRecord } from '../../components/PetRecords/types';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import { api } from '../../utils/api';
import { invalidateCache } from '../../utils/cache';

const SubdRemovedPetRecords: React.FC = () => {
    const navigate = useNavigate();
    const [removedPets, setRemovedPets] = useState<PetRecord[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [speciesFilter, setSpeciesFilter] = useState<'ALL' | 'Dog' | 'Cat'>('ALL');
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);
    const [confirmingRestorePet, setConfirmingRestorePet] = useState<PetRecord | null>(null);
    const [isRestoring, setIsRestoring] = useState<boolean>(false);
    const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

    const showToast = (text: string, isError = false) => {
        setToastMessage({ text, isError });
        setTimeout(() => setToastMessage(null), 4000);
    };

    const fetchRemovedPets = async () => {
        try {
            setLoading(true);
            const userStr = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
            const currentUser = userStr ? JSON.parse(userStr) : null;
            const subId = currentUser?.subdivision_id;

            const url = subId ? `/pets/removed?subdivision_id=${subId}` : '/pets/removed';
            const response = await api.get(url);

            const mapped: PetRecord[] = (response.data || []).map((pet: any) => ({
                id: pet.pet_id.toString(),
                name: pet.pet_name || 'Unnamed Animal',
                gender: pet.gender || 'Unknown',
                age: pet.estimated_age || 'Unknown',
                breed: pet.breed || 'Unknown Breed',
                species: pet.pet_type || 'Dog',
                ownerName: pet.owner?.name || (pet.owner_id ? 'Registered Owner' : 'Community / Unassigned'),
                ownerEmail: pet.owner?.email || 'No email',
                ownerPhone: pet.emergency_contact_phone || pet.owner?.phone || 'No phone',
                idNumber: `P-${pet.pet_id.toString().padStart(5, '0')}`,
                status: 'Archived',
                avatar: getPetPicture(pet.photo_url),
                weight: pet.weight ? `${pet.weight}kg` : 'Unknown',
                primaryColor: pet.primary_color || 'Unknown',
                secondaryColor: pet.secondary_color || '',
                tertiaryColor: pet.tertiary_color || '',
                colorMarkings: pet.color_markings || pet.distinctive_markings || 'None',
                sizeCategory: pet.size_category || 'Medium',
                isVaccinated: pet.is_vaccinated || false,
                vaccinationDate: pet.vaccination_date || null,
                isNeutered: pet.is_neutered || false,
                temperament: pet.temperament || 'Friendly',
                hasBiteHistory: pet.has_bite_history || false,
                chaseBehavior: pet.chase_behavior || false,
                healthCondition: pet.health_condition || 'Healthy',
                notes: pet.notes || '',
                vaccineCardUrl: pet.vaccine_card_url || null,
                registeredByName: pet.registered_by_name || 'Subdivision Leader / Staff',
                registeredAt: pet.created_at || null,
                rawPetObj: pet
            }));

            setRemovedPets(mapped);
        } catch (error) {
            console.error('Error fetching removed pets:', error);
            showToast('Failed to load removed pet records.', true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRemovedPets();
    }, []);

    const handleRestorePet = async (petToRestore: PetRecord) => {
        try {
            setIsRestoring(true);
            await api.post(`/pets/${petToRestore.id}/restore`);
            
            // Invalidate pet cache so active pet records page gets fresh live data
            invalidateCache('subd_pet_records');

            showToast(`Successfully restored "${petToRestore.name}" back to active pet records!`);
            setConfirmingRestorePet(null);
            if (selectedPet?.id === petToRestore.id) {
                setSelectedPet(null);
            }
            // Refresh removed list
            fetchRemovedPets();
        } catch (error: any) {
            console.error('Error restoring pet:', error);
            showToast(error.response?.data?.detail || 'Failed to restore pet record. Please try again.', true);
        } finally {
            setIsRestoring(false);
        }
    };

    const filteredPets = removedPets.filter(pet => {
        const matchesSearch = 
            pet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (pet.breed || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (pet.species || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (pet.ownerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            pet.idNumber.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesSpecies = speciesFilter === 'ALL' || pet.species.toLowerCase() === speciesFilter.toLowerCase();
        return matchesSearch && matchesSpecies;
    });

    const totalRemoved = removedPets.length;
    const dogCount = removedPets.filter(p => (p.species || '').toLowerCase() === 'dog').length;
    const catCount = removedPets.filter(p => (p.species || '').toLowerCase() === 'cat').length;

    return (
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800 relative overflow-hidden">
            {/* Ambient Background Lights */}
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#B35D25]/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
            <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-orange-50/40 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0"></div>

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
                <SubdSidebar />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <SubdNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Removed Pet Records</h1>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-orange-100/80 text-[#B35D25] border border-orange-200/60">
                                    Archive
                                </span>
                            </div>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">
                                View, search, and restore removed animal records
                            </p>
                        </div>
                    }
                />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    {/* Header Action Bar */}
                    <div className="flex flex-wrap justify-between items-center gap-4 shrink-0">
                        <button
                            onClick={() => navigate('/subd/pet-records')}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-black uppercase tracking-widest text-gray-700 hover:bg-gray-50 hover:border-gray-300 hover:text-gray-900 shadow-sm transition-all duration-200 cursor-pointer active:scale-95"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            Back to Active Records
                        </button>

                        <div className="flex items-center gap-3">
                            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Filter:</span>
                            <div className="inline-flex bg-gray-100/80 p-1 rounded-xl border border-gray-200/60 text-xs font-black uppercase tracking-wider">
                                <button
                                    onClick={() => setSpeciesFilter('ALL')}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${
                                        speciesFilter === 'ALL' 
                                            ? 'bg-white text-gray-900 shadow-sm' 
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    All ({totalRemoved})
                                </button>
                                <button
                                    onClick={() => setSpeciesFilter('Dog')}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${
                                        speciesFilter === 'Dog' 
                                            ? 'bg-white text-indigo-600 shadow-sm' 
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    Dogs ({dogCount})
                                </button>
                                <button
                                    onClick={() => setSpeciesFilter('Cat')}
                                    className={`px-3 py-1.5 rounded-lg transition-all ${
                                        speciesFilter === 'Cat' 
                                            ? 'bg-white text-teal-600 shadow-sm' 
                                            : 'text-gray-500 hover:text-gray-800'
                                    }`}
                                >
                                    Cats ({catCount})
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Stats Overview */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
                        <StatCard
                            label="Total Removed Records"
                            value={totalRemoved.toString()}
                            badge="Archived"
                            badgeVariant="warning"
                        />
                        <StatCard
                            label="Canines (Dogs)"
                            value={dogCount.toString()}
                            badge="Canine"
                            badgeVariant="info"
                        />
                        <StatCard
                            label="Felines (Cats)"
                            value={catCount.toString()}
                            badge="Feline"
                            badgeVariant="info"
                        />
                    </div>

                    {/* Main Table Section */}
                    <div className="flex flex-col gap-6 flex-1 min-h-0">
                        <div className="flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-xl font-black text-gray-900">Archived Records</h2>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                    Records here are kept safely and can be restored back to active records anytime
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
                                        placeholder="🔍 Search removed pets..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#B35D25]/20 focus:border-[#B35D25] transition-all w-64 shadow-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Table */}
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
                                        {loading ? (
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
                                        ) : filteredPets.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="px-6 py-24 text-center">
                                                    <div className="flex flex-col items-center gap-2.5 max-w-[320px] mx-auto">
                                                        <div className="w-16 h-16 bg-orange-50/60 rounded-[1.5rem] flex items-center justify-center text-[#B35D25] border border-orange-100 shadow-inner">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </div>
                                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight mt-2">No Removed Records</h4>
                                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">
                                                            {searchTerm ? `No archived pets match "${searchTerm}"` : 'There are currently no removed pet records in the archive.'}
                                                        </p>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : (
                                            filteredPets.map((pet) => (
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
                </div>
            </main>

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
                            Are you sure you want to restore <span className="text-gray-900 font-black">"{confirmingRestorePet.name}"</span> back to active registered pets? It will become visible across the subdivision records and community listings.
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

            {/* Pet Detail Modal Popup */}
            {selectedPet && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 sm:p-12 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full max-w-6xl rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-300 bg-white overflow-hidden flex flex-col max-h-[90vh] relative">
                        {/* Top banner highlighting it's an archived pet */}
                        <div className="bg-amber-50 border-b border-amber-200/80 px-8 py-3 flex items-center justify-between">
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
                        <div className="flex-1 overflow-y-auto">
                            <PetDetailPanel
                                pet={selectedPet}
                                onClose={() => setSelectedPet(null)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SubdRemovedPetRecords;
