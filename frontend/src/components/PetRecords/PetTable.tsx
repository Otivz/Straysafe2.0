import React from 'react';
import { type PetRecord } from './types';

const pets: PetRecord[] = [
    {
        id: '1',
        name: 'Cooper',
        gender: 'Male',
        age: '4y',
        breed: 'Beagle',
        species: 'Canine',
        ownerName: 'Sarah Jenkins',
        ownerEmail: 'sarah.j@example.com',
        idNumber: 'PET-94021-X',
        status: 'VACCINATED',
        avatar: 'https://images.unsplash.com/photo-1537151608828-ea2b11777ee8?q=80&w=100&auto=format&fit=crop',
    },
    {
        id: '2',
        name: 'Luna',
        gender: 'Female',
        age: '2y',
        breed: 'Siamese Mix',
        species: 'Feline',
        ownerName: 'Michael Chen',
        ownerEmail: 'm.chen@example.com',
        idNumber: 'PET-88129-L',
        status: 'MEDICAL ALERT',
        avatar: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=100&auto=format&fit=crop',
    },
    {
        id: '3',
        name: 'Barnaby',
        gender: 'Male',
        age: '6m',
        breed: 'Golden Retriever',
        species: 'Canine',
        ownerName: 'Jessica Alva',
        ownerEmail: 'jalva@example.com',
        idNumber: 'PET-00234-K',
        status: 'PENDING DOCS',
        avatar: 'https://images.unsplash.com/photo-1552053831-71594a27632d?q=80&w=100&auto=format&fit=crop',
    },
    {
        id: '4',
        name: 'Bella',
        gender: 'Female',
        age: '5y',
        breed: 'Jack Russell Terrier',
        species: 'Canine',
        ownerName: 'Robert Wilson',
        ownerEmail: 'r.wilson@example.com',
        idNumber: 'PET-77210-B',
        status: 'VACCINATED',
        avatar: 'https://images.unsplash.com/photo-1583511655857-d19b40a7a54e?q=80&w=100&auto=format&fit=crop',
    },
    {
        id: '5',
        name: 'JD',
        gender: 'Male',
        age: '4m',
        breed: 'Chihuahua',
        species: 'Canine',
        ownerName: 'John Doe',
        ownerEmail: 'john.d@example.com',
        idNumber: 'PET-11932-C',
        status: 'VACCINATED',
        avatar: 'https://images.unsplash.com/photo-1606425271394-c3ca9aa1fc06?q=80&w=100&auto=format&fit=crop',
    },
];

interface PetTableProps {
    onSelectPet: (pet: PetRecord) => void;
    selectedPetId: string | null;
    searchTerm: string;
}

const PetTable: React.FC<PetTableProps> = ({ onSelectPet, selectedPetId, searchTerm }) => {
    const filteredPets = pets.filter(pet => 
        pet.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pet.breed.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pet.ownerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pet.idNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white rounded-3xl shadow-[0_2px_14px_rgba(0,0,0,0.02)] border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-gray-50">
                            <th className="px-6 py-4 pl-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Pet Name</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Breed / Species</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Owner</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">ID Number</th>
                            <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredPets.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-20 text-center">
                                    <div className="flex flex-col items-center gap-2">
                                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                        </div>
                                        <p className="text-gray-400 font-bold">No pets found matching "{searchTerm}"</p>
                                        <button 
                                            onClick={() => {
                                                // Since we don't have a direct way to reset searchTerm from here easily without a callback, 
                                                // we just suggest trying a different search or let the user clear it manually.
                                            }}
                                            className="text-[#B35D25] text-xs font-black uppercase tracking-widest hover:underline mt-2"
                                        >
                                            Try a different search
                                        </button>
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
                                        className={`group cursor-pointer transition-all duration-300 border-b border-gray-50 last:border-0 ${
                                            isSelected ? 'bg-orange-50/50' : 'hover:bg-[#B35D25]/5 hover:shadow-sm'
                                        }`}
                                    >
                                    <td className="px-6 py-4 pl-8">
                                        <div className="flex items-center gap-4">
                                            <div className="relative rounded-xl overflow-hidden group-hover:shadow-lg group-hover:shadow-[#B35D25]/20 transition-all duration-300">
                                                <img src={pet.avatar} alt={pet.name} className="w-11 h-11 object-cover transition-all duration-500 group-hover:scale-110" />
                                                <div className="absolute inset-0 bg-[#B35D25]/0 group-hover:bg-[#B35D25]/20 transition-colors duration-500 mix-blend-overlay"></div>
                                                <div className="absolute inset-0 border-2 border-transparent group-hover:border-[#B35D25]/40 rounded-xl transition-colors duration-500"></div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900 leading-tight">{pet.name}</p>
                                                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-tighter">{pet.gender}, {pet.age}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-semibold text-gray-700">{pet.breed} ({pet.species})</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div>
                                            <p className="text-sm font-bold text-gray-900 leading-tight">{pet.ownerName}</p>
                                            <p className="text-[10px] font-medium text-gray-400 tracking-tight">{pet.ownerEmail}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-sm font-mono font-bold text-gray-600 tracking-tighter">{pet.idNumber}</p>
                                    </td>
                                    <td className="px-6 py-4 flex justify-center">
                                        <button className="p-2 text-gray-400 hover:text-[#B35D25] hover:bg-orange-50 rounded-lg transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            )
                        })
                    )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            <div className="px-6 py-4 flex items-center justify-between bg-gray-50/30 border-t border-gray-50">
                <button className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-gray-900 transition-colors uppercase tracking-widest">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
                    </svg>
                    Previous
                </button>
                <div className="flex items-center gap-1">
                    {[1, 2, 3, '...', 129].map((page, i) => (
                        <button key={i} className={`w-8 h-8 flex items-center justify-center rounded-lg text-[10px] font-black transition-all ${
                            page === 1 ? 'bg-[#B35D25] text-white shadow-md' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-900'
                        }`}>
                            {page}
                        </button>
                    ))}
                </div>
                <button className="flex items-center gap-1 text-[10px] font-bold text-gray-500 hover:text-gray-900 transition-colors uppercase tracking-widest">
                    Next
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default PetTable;
