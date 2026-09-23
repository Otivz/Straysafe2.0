import React, { useState } from 'react';
import { type PetRecord } from './types';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';

interface PetTableProps {
    pets?: PetRecord[];
    onSelectPet: (pet: PetRecord) => void;
    selectedPetId: string | null;
    searchTerm: string;
    onSearchChange?: (term: string) => void;
    loading?: boolean;
}

const formatAge = (age?: string | number): string => {
    if (!age || age === 'UNKNOWN' || age === '-' || age === 'N/A') return 'Age: N/A';
    const s = age.toString().trim();
    if (s.toLowerCase().includes('year') || s.toLowerCase().includes('mo') || s.toLowerCase().includes('yr') || s.toLowerCase().includes('old')) {
        return s;
    }
    const num = parseInt(s);
    if (!isNaN(num)) {
        return `${num} ${num === 1 ? 'yr old' : 'yrs old'}`;
    }
    return `Age: ${s}`;
};

const PetTable: React.FC<PetTableProps> = ({ 
    pets: propPets, 
    onSelectPet, 
    selectedPetId, 
    searchTerm,
    onSearchChange,
    loading = false 
}) => {
    const displayPets = propPets || [];
    const [speciesFilter, setSpeciesFilter] = useState<'All' | 'Dogs' | 'Cats' | 'Others'>('All');

    const filteredPets = displayPets.filter(pet => {
        const term = searchTerm.toLowerCase();
        const matchesTerm = (
            pet.name.toLowerCase().includes(term) ||
            (pet.breed || '').toLowerCase().includes(term) ||
            (pet.species || '').toLowerCase().includes(term) ||
            (pet.age || '').toString().toLowerCase().includes(term)
        );
        if (!matchesTerm) return false;

        const s = (pet.species || '').toLowerCase();
        if (speciesFilter === 'Dogs') return s === 'dog';
        if (speciesFilter === 'Cats') return s === 'cat';
        if (speciesFilter === 'Others') return s !== 'dog' && s !== 'cat' && s !== '';
        return true;
    });

    const accentColors = [
        'bg-amber-500',
        'bg-sky-500',
        'bg-emerald-500',
        'bg-indigo-500'
    ];

    return (
        <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-slate-200/80 overflow-hidden w-full transition-all duration-300">
            {/* ─── MOBILE CARD VIEW (Matches photo exactly) ─── */}
            <div className="block md:hidden space-y-3.5 p-4 sm:p-5 bg-white">
                {/* Mobile Header Row */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xl text-[#F97316]">🐾</span>
                        <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                            Active Records
                        </h3>
                    </div>

                    {/* Mobile Showing Counter */}
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-wider text-right leading-tight shrink-0">
                        SHOWING<br />
                        <span className="text-[#F97316] font-black">{loading ? 0 : filteredPets.length} OF {displayPets.length}</span>
                    </div>
                </div>

                {/* Mobile Search Input (Full width pill with search icon) */}
                <div className="relative w-full">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search pets..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange?.(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-[#F8FAFC] text-xs font-semibold text-slate-800 placeholder-slate-400 rounded-full focus:outline-none focus:ring-2 focus:ring-[#F97316]/20 border border-slate-200/80 transition-all shadow-2xs"
                    />
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {(['All', 'Dogs', 'Cats', 'Others'] as const).map((tab) => {
                        const isActive = speciesFilter === tab;
                        return (
                            <button
                                key={tab}
                                type="button"
                                onClick={() => setSpeciesFilter(tab)}
                                className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer shrink-0 ${
                                    isActive
                                        ? 'bg-[#F97316] text-white shadow-xs font-black'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                                }`}
                            >
                                {tab}
                            </button>
                        );
                    })}
                </div>

                {/* Mobile Pet Cards List */}
                <div className="space-y-2.5 pt-1">
                    {loading ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                            <div key={idx} className="bg-white rounded-2xl p-3 border border-slate-200/70 shadow-sm animate-pulse flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-13 h-13 bg-slate-100 rounded-2xl"></div>
                                    <div className="space-y-2">
                                        <div className="h-4 w-24 bg-slate-100 rounded"></div>
                                        <div className="h-3 w-16 bg-slate-50 rounded"></div>
                                    </div>
                                </div>
                                <div className="space-y-1.5 flex flex-col items-end">
                                    <div className="h-5 w-16 bg-slate-100 rounded-full"></div>
                                    <div className="h-5 w-14 bg-slate-100 rounded-full"></div>
                                </div>
                            </div>
                        ))
                    ) : filteredPets.length === 0 ? (
                        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center shadow-sm">
                            <div className="w-12 h-12 mx-auto bg-orange-50 rounded-2xl flex items-center justify-center text-orange-500 mb-2">
                                🐾
                            </div>
                            <h4 className="text-xs font-black text-slate-800 uppercase">No Records Found</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Try another search or filter</p>
                        </div>
                    ) : (
                        filteredPets.map((pet, index) => {
                            const isDog = (pet.species || 'Dog').toLowerCase() === 'dog';
                            const isCat = (pet.species || '').toLowerCase() === 'cat';
                            const isSelected = selectedPetId === pet.id;
                            const accentColor = accentColors[index % accentColors.length];

                            return (
                                <div
                                    key={pet.id}
                                    onClick={() => onSelectPet(pet)}
                                    className={`bg-white rounded-2xl p-3 border transition-all flex items-center justify-between gap-3 shadow-xs active:scale-[0.99] cursor-pointer overflow-hidden ${
                                        isSelected 
                                            ? 'border-[#F97316] ring-2 ring-orange-500/20 bg-orange-50/20' 
                                            : 'border-slate-200 hover:border-orange-300 hover:shadow-md'
                                    }`}
                                >
                                    {/* Left: Colored Accent Bar + Avatar + Name & Breed */}
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        {/* Colored vertical indicator pill */}
                                        <div className={`w-1.5 self-stretch rounded-full my-0.5 shrink-0 ${accentColor}`}></div>

                                        {/* Pet Avatar */}
                                        <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl overflow-hidden border border-slate-200 shrink-0 bg-slate-50 shadow-2xs">
                                            <img
                                                src={getPetPicture(pet.avatar)}
                                                alt={pet.name}
                                                className="w-full h-full object-cover"
                                                onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                            />
                                        </div>

                                        {/* Pet Name & Breed */}
                                        <div className="min-w-0 flex-1">
                                            <h4 className="text-sm sm:text-base font-black text-slate-900 truncate leading-tight">
                                                {pet.name || 'Unnamed Pet'}
                                            </h4>
                                            <p className="text-xs font-bold text-slate-600 truncate mt-0.5">
                                                {pet.breed || 'Unknown Breed'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Right: Species & Age Badges + Action Chevron */}
                                    <div className="flex items-center gap-2.5 shrink-0">
                                        <div className="flex flex-col items-end gap-1">
                                            {/* Species Badge */}
                                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border shadow-2xs ${
                                                isDog
                                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                                    : isCat
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                    : 'bg-amber-50 text-amber-800 border-amber-200'
                                            }`}>
                                                {(pet.species || 'DOG').toUpperCase()}
                                            </span>

                                            {/* Age Badge */}
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200/80 uppercase tracking-wider shadow-2xs">
                                                {formatAge(pet.age)}
                                            </span>
                                        </div>

                                        {/* Circular Chevron Arrow */}
                                        <div className="w-7 h-7 rounded-full bg-orange-50 text-[#F97316] flex items-center justify-center shrink-0 border border-orange-200/70 shadow-2xs">
                                            <svg className="w-3.5 h-3.5 stroke-[2.5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                            </svg>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* ─── DESKTOP TABLE VIEW (Preserved & Focused: Name, Species, Breed, Age) ─── */}
            <div className="hidden md:block overflow-x-auto w-full">
                <table className="w-full text-left border-collapse min-w-[600px]">
                    <thead>
                        <tr className="border-b border-slate-100 bg-[#FAFAF9]/80">
                            <th className="px-6 py-4.5 pl-8 text-[10px] font-black text-slate-400 uppercase tracking-widest">Pet Name</th>
                            <th className="px-6 py-4.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Species</th>
                            <th className="px-6 py-4.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Breed</th>
                            <th className="px-6 py-4.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Age</th>
                            <th className="px-6 py-4.5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            Array.from({ length: 3 }).map((_, idx) => (
                                <tr key={idx} className="border-b border-slate-50 last:border-none animate-pulse">
                                    <td className="px-6 py-5 pl-8">
                                        <div className="flex items-center gap-4">
                                            <div className="w-11 h-11 bg-slate-100 rounded-xl"></div>
                                            <div className="h-4 w-24 bg-slate-100 rounded"></div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5"><div className="h-6 w-16 bg-slate-100 rounded-full"></div></td>
                                    <td className="px-6 py-5"><div className="h-4 w-28 bg-slate-100 rounded"></div></td>
                                    <td className="px-6 py-5"><div className="h-6 w-16 bg-slate-100 rounded-full"></div></td>
                                    <td className="px-6 py-5 flex justify-center"><div className="h-8 w-16 bg-slate-100 rounded-xl"></div></td>
                                </tr>
                            ))
                        ) : filteredPets.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-24 text-center">
                                    <div className="flex flex-col items-center gap-2.5 max-w-[280px] mx-auto">
                                        <div className="w-16 h-16 bg-orange-50 rounded-[1.5rem] flex items-center justify-center text-[#F97316] border border-orange-100 shadow-inner">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mt-2">No Records Found</h4>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                                            {searchTerm ? `No pets found matching "${searchTerm}"` : 'No registered pets found in database'}
                                        </p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredPets.map((pet) => {
                                const isSelected = selectedPetId === pet.id;
                                const isDog = (pet.species || 'Dog').toLowerCase() === 'dog';
                                const isCat = (pet.species || '').toLowerCase() === 'cat';

                                return (
                                    <tr 
                                        key={pet.id} 
                                        onClick={() => onSelectPet(pet)}
                                        className={`group cursor-pointer transition-all duration-300 border-b border-slate-50 last:border-0 ${
                                            isSelected ? 'bg-orange-50/40' : 'hover:bg-[#B35D25]/5'
                                        }`}
                                    >
                                        {/* Pet Name */}
                                        <td className="px-6 py-4.5 pl-8">
                                            <div className="flex items-center gap-4">
                                                <div className="relative rounded-2xl overflow-hidden group-hover:shadow-md transition-all duration-300 w-12 h-12 shrink-0 border-2 border-orange-100/80 shadow-xs">
                                                    <img 
                                                        src={getPetPicture(pet.avatar)} 
                                                        alt={pet.name} 
                                                        className="w-full h-full object-cover transition-all duration-500 group-hover:scale-110" 
                                                        onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-900 leading-tight group-hover:text-[#B35D25] transition-colors">
                                                        {pet.name || 'Unnamed Pet'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Species */}
                                        <td className="px-6 py-4.5">
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                                isDog 
                                                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80' 
                                                    : isCat
                                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                                                    : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                                            }`}>
                                                {pet.species || 'Dog'}
                                            </span>
                                        </td>

                                        {/* Breed */}
                                        <td className="px-6 py-4.5">
                                            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                                                {pet.breed || 'Unknown Breed'}
                                            </p>
                                        </td>

                                        {/* Age */}
                                        <td className="px-6 py-4.5">
                                            <span className="px-3 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200/60 uppercase tracking-wider">
                                                {formatAge(pet.age)}
                                            </span>
                                        </td>

                                        {/* Action */}
                                        <td className="px-6 py-4.5 text-center">
                                            <button 
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectPet(pet);
                                                }}
                                                className="px-4 py-2 bg-orange-50 text-[#B35D25] border border-orange-200/80 hover:bg-[#B35D25] hover:text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer shadow-xs"
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
                <div className="hidden md:flex px-6 py-4.5 items-center justify-between bg-slate-50/50 border-t border-slate-100">
                    <button className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest disabled:opacity-50" disabled>
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
                    <button className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 hover:text-slate-900 transition-colors uppercase tracking-widest disabled:opacity-50" disabled>
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
