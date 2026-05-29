import React from 'react';
import { type PetRecord } from './types';

// Backward compatibility fallback mock data
const defaultMockPets: PetRecord[] = [
    {
        id: '1',
        name: 'Cooper',
        gender: 'Male',
        age: '4y',
        breed: 'Beagle',
        species: 'Dog',
        ownerName: 'Vito Cruz',
        ownerEmail: 'vito.c@example.com',
        idNumber: 'P-00001',
        status: 'Active',
        avatar: 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?q=80&w=100&auto=format&fit=crop',
    },
    {
        id: '2',
        name: 'Luna',
        gender: 'Female',
        age: '2y',
        breed: 'Aspin',
        species: 'Dog',
        ownerName: 'Maria Santos',
        ownerEmail: 'maria.s@example.com',
        idNumber: 'P-00002',
        status: 'Lost',
        avatar: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=100&auto=format&fit=crop',
    },
    {
        id: '3',
        name: 'Milo',
        gender: 'Male',
        age: '1y',
        breed: 'Cat',
        species: 'Cat',
        ownerName: 'John Doe',
        ownerEmail: 'john.d@example.com',
        idNumber: 'P-00003',
        status: 'Found',
        avatar: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=100&auto=format&fit=crop',
    },
    {
        id: '4',
        name: 'Barnaby',
        gender: 'Male',
        age: '6m',
        breed: 'Golden Retriever',
        species: 'Dog',
        ownerName: 'Jessica Alva',
        ownerEmail: 'jalva@example.com',
        idNumber: 'P-00004',
        status: 'Active',
        avatar: 'https://images.unsplash.com/photo-1552053831-71594a27632d?q=80&w=100&auto=format&fit=crop',
    },
    {
        id: '5',
        name: 'Bella',
        gender: 'Female',
        age: '5y',
        breed: 'Jack Russell Terrier',
        species: 'Dog',
        ownerName: 'Robert Wilson',
        ownerEmail: 'r.wilson@example.com',
        idNumber: 'P-00005',
        status: 'Active',
        avatar: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?q=80&w=100&auto=format&fit=crop',
    },
];

interface PetTableProps {
    pets?: PetRecord[];
    onSelectPet: (pet: PetRecord) => void;
    selectedPetId: string | null;
    searchTerm: string;
    loading?: boolean;
}

const formatOwnerName = (fullName: string): string => {
    return (fullName || 'Unknown').trim();
};

// Map status string to premium HSL badge styles
const getStatusBadgeStyle = (statusStr: string) => {
    const s = (statusStr || 'Active').toLowerCase();
    if (s === 'active') return 'bg-emerald-50 text-emerald-600 border border-emerald-100/50';
    if (s === 'lost') return 'bg-rose-50 text-rose-600 border border-rose-100/50 animate-pulse';
    if (s === 'found') return 'bg-amber-50 text-amber-600 border border-amber-100/50';
    if (s === 'rescued') return 'bg-indigo-50 text-indigo-600 border border-indigo-100/50';
    return 'bg-gray-50 text-gray-500 border border-gray-100/50';
};

const PetTable: React.FC<PetTableProps> = ({ 
    pets: propPets, 
    onSelectPet, 
    selectedPetId, 
    searchTerm,
    loading = false 
}) => {
    const displayPets = propPets || defaultMockPets;

    const filteredPets = displayPets.filter(pet => {
        const term = searchTerm.toLowerCase();
        return (
            pet.name.toLowerCase().includes(term) ||
            (pet.breed || '').toLowerCase().includes(term) ||
            (pet.species || '').toLowerCase().includes(term) ||
            (pet.ownerName || '').toLowerCase().includes(term) ||
            (pet.status || '').toLowerCase().includes(term)
        );
    });

    return (
        <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.015)] border border-gray-100/80 overflow-hidden w-full transition-all duration-300">
            <div className="overflow-x-auto w-full">
                <table className="w-full text-left border-collapse min-w-[700px]">
                    <thead>
                        <tr className="border-b border-gray-50 bg-[#FAFAF9]/50">
                            <th className="px-6 py-4.5 pl-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</th>
                            <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Breed</th>
                            <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                            <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Owner</th>
                            <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                            <th className="px-6 py-4.5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            // Premium skeletal loading state
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
                                    <td className="px-6 py-5 flex justify-center"><div className="h-8 w-16 bg-gray-100 rounded-xl"></div></td>
                                </tr>
                            ))
                        ) : filteredPets.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-24 text-center">
                                    <div className="flex flex-col items-center gap-2.5 max-w-[280px] mx-auto">
                                        <div className="w-16 h-16 bg-orange-50/50 rounded-[1.5rem] flex items-center justify-center text-[#F97316]/60 border border-orange-100/50 shadow-inner">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight mt-2">No Records Found</h4>
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest leading-relaxed">No pets found matching "{searchTerm}"</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredPets.map((pet) => {
                                const isSelected = selectedPetId === pet.id;
                                return (
                                    <tr 
                                        key={pet.id} 
                                        onClick={() => onSelectPet(pet)}
                                        className={`group cursor-pointer transition-all duration-300 border-b border-gray-50/80 last:border-0 ${
                                            isSelected ? 'bg-orange-50/40' : 'hover:bg-[#B35D25]/5'
                                        }`}
                                    >
                                        {/* Name (displays avatar and visual tags) */}
                                        <td className="px-6 py-4.5 pl-8">
                                            <div className="flex items-center gap-4">
                                                <div className="relative rounded-xl overflow-hidden group-hover:shadow-md group-hover:shadow-[#B35D25]/10 transition-all duration-300 w-11 h-11 shrink-0 border border-gray-100">
                                                    <img src={pet.avatar} alt={pet.name} className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110" />
                                                    <div className="absolute inset-0 bg-[#B35D25]/0 group-hover:bg-[#B35D25]/20 transition-colors duration-500 mix-blend-overlay"></div>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-gray-900 leading-tight group-hover:text-[#B35D25] transition-colors">{pet.name}</p>
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">{pet.gender} • {pet.age}</p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Breed */}
                                        <td className="px-6 py-4.5">
                                            <p className="text-xs font-black text-gray-800 uppercase tracking-wide">{pet.breed || 'Unknown Breed'}</p>
                                        </td>

                                        {/* Type (Dog / Cat) */}
                                        <td className="px-6 py-4.5">
                                            <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${
                                                (pet.species || 'Dog').toLowerCase() === 'dog' 
                                                ? 'bg-indigo-50/50 text-indigo-600 border-indigo-100/50' 
                                                : 'bg-teal-50/50 text-teal-600 border-teal-100/50'
                                            }`}>
                                                {pet.species || 'Dog'}
                                            </span>
                                        </td>

                                        {/* Owner (formatted name with email) */}
                                        <td className="px-6 py-4.5">
                                            <div>
                                                <p className="text-xs font-black text-gray-900 leading-tight">{formatOwnerName(pet.ownerName)}</p>
                                                <p className="text-[9px] font-bold text-gray-400 tracking-tight lowercase mt-0.5">{pet.ownerEmail}</p>
                                            </div>
                                        </td>

                                        {/* Status */}
                                        <td className="px-6 py-4.5">
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusBadgeStyle(pet.status)}`}>
                                                {pet.status || 'Active'}
                                            </span>
                                        </td>

                                        {/* Action (View trigger) */}
                                        <td className="px-6 py-4.5 text-center">
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectPet(pet);
                                                }}
                                                className="px-4 py-2 bg-orange-50 text-[#B35D25] border border-orange-100 hover:bg-[#B35D25] hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-sm shadow-orange-100"
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination Controls */}
            {!loading && filteredPets.length > 0 && (
                <div className="px-6 py-4.5 flex items-center justify-between bg-gray-50/30 border-t border-gray-100/80">
                    <button className="flex items-center gap-1.5 text-[9px] font-black text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-widest disabled:opacity-50" disabled>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                        Previous
                    </button>
                    <div className="flex items-center gap-1.5">
                        <button className="w-8 h-8 flex items-center justify-center rounded-xl text-[10px] font-black transition-all bg-[#B35D25] text-white shadow-md shadow-orange-950/10">
                            1
                        </button>
                    </div>
                    <button className="flex items-center gap-1.5 text-[9px] font-black text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-widest disabled:opacity-50" disabled>
                        Next
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};

export default PetTable;
