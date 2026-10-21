import React, { useState, useMemo } from 'react';
import { type PetRecord, type PetSortOrder, sortPetRecords } from './types';
import { DEFAULT_PET_AVATAR, getPetThumb } from '../../utils/avatar';

interface PetTableProps {
    pets?: PetRecord[];
    onSelectPet: (pet: PetRecord) => void;
    selectedPetId: string | null;
    searchTerm: string;
    onSearchChange?: (term: string) => void;
    sortOrder?: PetSortOrder;
    onSortOrderChange?: (order: PetSortOrder) => void;
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

// Species colours: dogs blue, cats green, everything else amber
const speciesBadge = (species?: string) => {
    const s = (species || 'Dog').toLowerCase();
    if (s === 'dog') return 'bg-blue-50 text-blue-700';
    if (s === 'cat') return 'bg-emerald-50 text-emerald-700';
    return 'bg-amber-50 text-amber-800';
};

const PetTable: React.FC<PetTableProps> = ({
    pets: propPets,
    onSelectPet,
    selectedPetId,
    searchTerm,
    onSearchChange,
    sortOrder: propSortOrder,
    onSortOrderChange,
    loading = false
}) => {
    const displayPets = propPets || [];
    const [speciesFilter, setSpeciesFilter] = useState<'All' | 'Dogs' | 'Cats'>('All');
    const [internalSortOrder, setInternalSortOrder] = useState<PetSortOrder>('newest');

    const currentSortOrder = propSortOrder !== undefined ? propSortOrder : internalSortOrder;
    const handleSortChange = (newOrder: PetSortOrder) => {
        if (onSortOrderChange) {
            onSortOrderChange(newOrder);
        } else {
            setInternalSortOrder(newOrder);
        }
    };

    const filteredPets = useMemo(() => {
        const list = displayPets.filter(pet => {
            const term = searchTerm.toLowerCase();
            const matchesTerm = (
                pet.name.toLowerCase().includes(term) ||
                (pet.referenceCode || '').toLowerCase().includes(term) ||
                (pet.breed || '').toLowerCase().includes(term) ||
                (pet.species || '').toLowerCase().includes(term) ||
                (pet.ownerName || '').toLowerCase().includes(term) ||
                (pet.ownerEmail || '').toLowerCase().includes(term) ||
                (pet.age || '').toString().toLowerCase().includes(term)
            );
            if (!matchesTerm) return false;

            const s = (pet.species || '').toLowerCase();
            if (speciesFilter === 'Dogs') return s === 'dog';
            if (speciesFilter === 'Cats') return s === 'cat';
            return true;
        });

        return sortPetRecords(list, currentSortOrder);
    }, [displayPets, searchTerm, speciesFilter, currentSortOrder]);

    const hasFilters = !!searchTerm || speciesFilter !== 'All';

    return (
        <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden w-full min-w-0">
            {/* ─── Toolbar: search, species, sort, count ─── */}
            <div className="p-3 sm:p-4 flex flex-col gap-2.5 border-b border-slate-100">
                {onSearchChange && (
                    <div className="relative w-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            type="search"
                            placeholder="Search name, breed, owner or ID"
                            aria-label="Search pets"
                            value={searchTerm}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full h-11 pl-10 pr-3 bg-slate-50 text-sm text-slate-800 placeholder:text-slate-400 rounded-xl border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-role/20 focus:border-role/40 transition-colors"
                        />
                    </div>
                )}

                <div className="flex items-center gap-2 min-w-0">
                    <div className="flex-1 min-w-0 sm:flex-initial sm:w-64 grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl" role="tablist" aria-label="Species">
                        {(['All', 'Dogs', 'Cats'] as const).map((tab) => {
                            const isActive = speciesFilter === tab;
                            return (
                                <button
                                    key={tab}
                                    type="button"
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setSpeciesFilter(tab)}
                                    className={`h-8 min-w-0 rounded-lg text-xs font-black transition-all cursor-pointer ${isActive
                                        ? 'bg-white text-role shadow-2xs'
                                        : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    {tab}
                                </button>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        onClick={() => handleSortChange(currentSortOrder === 'newest' ? 'oldest' : 'newest')}
                        className="h-10 px-2.5 shrink-0 rounded-xl text-xs font-black flex items-center gap-1 bg-white text-slate-700 border border-slate-200 hover:border-role-border hover:text-role cursor-pointer transition-colors"
                        title="Toggle sort order (Latest / Earliest)"
                        aria-label={`Sort: ${currentSortOrder === 'newest' ? 'latest first' : 'earliest first'}. Tap to change.`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d={currentSortOrder === 'newest' ? 'M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12' : 'M3 4h13M3 8h9m-9 4h9m5-4v12m0 0l-4-4m4 4l4-4'} />
                        </svg>
                        <span className="hidden min-[360px]:inline">{currentSortOrder === 'newest' ? 'Latest' : 'Earliest'}</span>
                    </button>

                    <p className="hidden sm:block ml-auto text-xs font-semibold text-slate-500 whitespace-nowrap">
                        {loading ? 'Loading…' : `${filteredPets.length} of ${displayPets.length} pets`}
                    </p>
                </div>
                <p className="sm:hidden text-[11px] font-semibold text-slate-500">
                    {loading ? 'Loading…' : `Showing ${filteredPets.length} of ${displayPets.length} pets`}
                </p>
            </div>

            {/* ─── Mobile / tablet list ─── */}
            <div className="md:hidden">
                {loading ? (
                    <ul className="divide-y divide-slate-100">
                        {Array.from({ length: 4 }).map((_, idx) => (
                            <li key={idx} className="flex items-center gap-3 px-3 py-3 animate-pulse">
                                <div className="w-13 h-13 bg-slate-100 rounded-xl shrink-0"></div>
                                <div className="flex-1 space-y-2">
                                    <div className="h-4 w-32 bg-slate-100 rounded"></div>
                                    <div className="h-3 w-24 bg-slate-50 rounded"></div>
                                </div>
                            </li>
                        ))}
                    </ul>
                ) : filteredPets.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                        <div className="w-12 h-12 mx-auto bg-role-soft rounded-full flex items-center justify-center text-role mb-2">🐾</div>
                        <h4 className="text-sm font-black text-slate-900">No records found</h4>
                        <p className="text-xs text-slate-500 mt-1">
                            {hasFilters ? 'Try another search or species.' : 'No registered pets yet.'}
                        </p>
                        {speciesFilter !== 'All' && (
                            <button
                                type="button"
                                onClick={() => setSpeciesFilter('All')}
                                className="mt-3 h-9 px-4 rounded-xl border border-slate-200 text-xs font-black text-slate-700 hover:text-role hover:border-role-border cursor-pointer"
                            >
                                Show all species
                            </button>
                        )}
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {filteredPets.map((pet) => {
                            const isSelected = selectedPetId === pet.id;
                            const secondary = pet.description || pet.breed || 'Unknown breed';
                            return (
                                <li key={pet.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectPet(pet)}
                                        aria-label={`View ${pet.name || 'pet'} record`}
                                        className={`w-full min-w-0 flex items-center gap-3 px-3 py-3 text-left transition-colors cursor-pointer active:bg-slate-50 ${isSelected ? 'bg-role-soft/40' : 'hover:bg-slate-50'}`}
                                    >
                                        <img loading="lazy" decoding="async"
                                            src={getPetThumb(pet.avatar)}
                                            alt=""
                                            className="w-13 h-13 rounded-xl object-cover border border-slate-100 bg-slate-50 shrink-0"
                                            onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[15px] font-black text-slate-900 leading-snug line-clamp-2 break-words">
                                                {pet.name || 'Unnamed animal'}
                                            </span>
                                            <span className="block text-xs font-semibold text-slate-500 truncate mt-0.5">
                                                {secondary}
                                            </span>
                                            <span className="flex items-center gap-1.5 mt-1 min-w-0">
                                                <span className={`px-1.5 py-px rounded-md text-[10px] font-black uppercase tracking-wide shrink-0 ${speciesBadge(pet.species)}`}>
                                                    {pet.species || 'Dog'}
                                                </span>
                                                <span className="text-[11px] font-semibold text-slate-500 truncate">{formatAge(pet.age)}</span>
                                            </span>
                                        </span>
                                        <svg className="w-4 h-4 text-slate-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* ─── Desktop table ─── */}
            <div className="hidden md:block overflow-x-auto w-full">
                <table className="w-full text-left border-collapse min-w-[680px]">
                    <thead>
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                            <th className="px-4 py-3 pl-5 text-[11px] font-bold text-slate-500">Pet</th>
                            <th className="px-4 py-3 text-[11px] font-bold text-slate-500">Species</th>
                            <th className="px-4 py-3 text-[11px] font-bold text-slate-500">Breed</th>
                            <th className="px-4 py-3 text-[11px] font-bold text-slate-500">Age</th>
                            <th className="px-4 py-3 text-[11px] font-bold text-slate-500">Owner</th>
                            <th className="px-4 py-3 pr-5 text-[11px] font-bold text-slate-500 text-right"><span className="sr-only">Action</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            Array.from({ length: 3 }).map((_, idx) => (
                                <tr key={idx} className="animate-pulse">
                                    <td className="px-4 py-3 pl-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-11 h-11 bg-slate-100 rounded-xl"></div>
                                            <div className="h-4 w-24 bg-slate-100 rounded"></div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3"><div className="h-5 w-12 bg-slate-100 rounded-md"></div></td>
                                    <td className="px-4 py-3"><div className="h-4 w-28 bg-slate-100 rounded"></div></td>
                                    <td className="px-4 py-3"><div className="h-4 w-16 bg-slate-100 rounded"></div></td>
                                    <td className="px-4 py-3"><div className="h-4 w-24 bg-slate-100 rounded"></div></td>
                                    <td className="px-4 py-3 pr-5"><div className="h-8 w-16 bg-slate-100 rounded-xl ml-auto"></div></td>
                                </tr>
                            ))
                        ) : filteredPets.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-6 py-14 text-center">
                                    <div className="flex flex-col items-center gap-2 max-w-[320px] mx-auto">
                                        <div className="w-12 h-12 bg-role-soft rounded-full flex items-center justify-center text-role">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <h4 className="text-sm font-black text-slate-900 mt-1">No records found</h4>
                                        <p className="text-xs text-slate-500">
                                            {searchTerm ? `No pets match "${searchTerm}".` : hasFilters ? 'No pets of this species.' : 'No registered pets found in database.'}
                                        </p>
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
                                        className={`group cursor-pointer transition-colors ${isSelected ? 'bg-role-soft/40' : 'hover:bg-slate-50'}`}
                                    >
                                        <td className="px-4 py-3 pl-5">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <img loading="lazy" decoding="async"
                                                    src={getPetThumb(pet.avatar)}
                                                    alt=""
                                                    className="w-11 h-11 rounded-xl object-cover border border-slate-100 bg-slate-50 shrink-0"
                                                    onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-black text-slate-900 leading-tight group-hover:text-role transition-colors break-words">
                                                        {pet.name || 'Unnamed animal'}
                                                    </p>
                                                    {pet.description && (
                                                        <p className="text-xs text-slate-500 leading-tight mt-0.5 line-clamp-1">{pet.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wide ${speciesBadge(pet.species)}`}>
                                                {pet.species || 'Dog'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-slate-700">{pet.breed || 'Unknown breed'}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm text-slate-700 whitespace-nowrap">{formatAge(pet.age)}</p>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-semibold text-slate-800 leading-tight">
                                                {pet.ownerName || 'No Owner (Community Animal)'}
                                            </p>
                                            {pet.ownerEmail && pet.ownerEmail !== 'Unassigned' && pet.ownerEmail !== 'No Email' ? (
                                                <p className="text-xs text-slate-400 mt-0.5 break-all">{pet.ownerEmail}</p>
                                            ) : null}
                                        </td>
                                        <td className="px-4 py-3 pr-5 text-right">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onSelectPet(pet);
                                                }}
                                                aria-label={`View ${pet.name || 'pet'} record`}
                                                className="h-9 px-3.5 bg-role-soft text-role-hover border border-role-border/80 hover:bg-role hover:text-white text-xs font-black rounded-xl transition-colors cursor-pointer"
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
        </div>
    );
};

export default PetTable;
