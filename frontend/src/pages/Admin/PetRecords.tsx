import { useState, useEffect } from 'react';
import axios from 'axios';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import AdminSidebar from '../../components/AdminSidebar';
import AdminNavbar from '../../components/Navbars/AdminNavbar';
import StatCard from '../../components/PetRecords/StatCard';
import PetTable from '../../components/PetRecords/PetTable';
import { type PetRecord } from '../../components/PetRecords/types';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import Button from '../../components/Button';

const PetRecords = () => {
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [pets, setPets] = useState<PetRecord[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchAllPets = async () => {
        try {
            setLoading(true);
            const response = await axios.get('http://localhost:8000/pets/');
            
            // Map backend schema values into PetRecord structure
            const mappedPets: PetRecord[] = response.data.map((pet: any) => ({
                id: pet.pet_id.toString(),
                name: pet.pet_name || 'Unknown',
                gender: pet.gender || 'Unknown',
                age: pet.estimated_age || 'Unknown',
                breed: pet.breed || 'Unknown',
                species: pet.pet_type || 'Dog',
                ownerName: pet.owner?.name || 'Unknown Owner',
                ownerEmail: pet.owner?.email || 'No Email',
                ownerPhone: pet.emergency_contact_phone || pet.owner?.phone || 'No Contact',
                idNumber: `P-${pet.pet_id.toString().padStart(5, '0')}`,
                status: pet.status || 'Active',
                avatar: getPetPicture(pet.photo_url),
                weight: pet.weight ? `${pet.weight}kg` : 'Unknown',
                colorMarkings: pet.color_markings || 'Unknown',
                sizeCategory: pet.size_category || 'Medium',
                isVaccinated: pet.is_vaccinated || false,
                vaccinationDate: pet.vaccination_date || null,
                isNeutered: pet.is_neutered || false,
                temperament: pet.temperament || 'Friendly',
                hasBiteHistory: pet.has_bite_history || false,
                chaseBehavior: pet.chase_behavior || false,
                healthCondition: pet.health_condition || 'Healthy and active',
                notes: pet.notes || '',
                vaccineCardUrl: pet.vaccine_card_url || null,
                rawPetObj: pet
            }));
            
            setPets(mappedPets);
        } catch (error) {
            console.error('Error fetching all pets:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAllPets();
    }, []);

    // Calculate dynamic stats
    const totalCount = pets.length;
    const vaccinatedCount = pets.filter(p => p.isVaccinated).length;
    const medicalAlertsCount = pets.filter(p => p.status === 'Lost' || p.hasBiteHistory).length;
    const complianceRate = totalCount > 0 ? Math.round((vaccinatedCount / totalCount) * 100) : 0;

    return (
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800 relative overflow-hidden">
            {/* Sidebar */}
            <AdminSidebar />

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                <AdminNavbar
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Pet Registry</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Manage and monitor all registered animals within the PetOps network</p>
                        </div>
                    }
                />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-10 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    {/* Header */}
                    <div className="flex justify-end items-end shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="relative flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input
                                    type="text"
                                    placeholder="Search by name, breed or owner..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#B35D25] focus:border-transparent w-72 shadow-sm transition-all"
                                />
                            </div>
                            <Button 
                                variant="primary" 
                                className="px-6 py-2.5 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-xl shadow-lg shadow-orange-900/10 flex items-center gap-2 font-black text-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                                </svg>
                                Add New Pet
                            </Button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 shrink-0">
                        <StatCard 
                            label="Total Registered" 
                            value={totalCount.toLocaleString()} 
                            badge="Live" 
                            badgeVariant="warning"
                        />
                        <StatCard 
                            label="Fully Vaccinated" 
                            value={vaccinatedCount.toLocaleString()} 
                            badge={`${complianceRate}%`} 
                            badgeVariant="info"
                        />
                        <StatCard 
                            label="Medical/Bite Alerts" 
                            value={medicalAlertsCount.toString()} 
                            badge="Attention" 
                            badgeVariant={medicalAlertsCount > 0 ? "error" : "info"}
                        />
                        <StatCard 
                            label="Registry Compliance" 
                            value={`${complianceRate}%`} 
                            badge="Target 85%" 
                            badgeVariant="info"
                        />
                    </div>

                    {/* Table Section */}
                    <div className="flex flex-col gap-6 flex-1 min-h-0">
                        <div className="flex justify-between items-center shrink-0">
                            <h2 className="text-xl font-black text-gray-900">Active Records</h2>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                Showing {loading ? 0 : Math.min(pets.length, 10)} of {pets.length}
                            </p>
                        </div>
                        <div className="flex-1 min-h-0">
                            <PetTable 
                                pets={pets} 
                                onSelectPet={setSelectedPet} 
                                selectedPetId={selectedPet?.id || null} 
                                searchTerm={searchTerm}
                                loading={loading}
                            />
                        </div>
                    </div>

                    {/* Modal Popup */}
                    {selectedPet && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 sm:p-12 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
                            <div className="w-full max-w-6xl rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-300 bg-white overflow-hidden flex flex-col max-h-[90vh]">
                                <PetDetailPanel pet={selectedPet} onClose={() => {
                                    setSelectedPet(null);
                                    fetchAllPets(); // Refresh list on close in case of edits
                                }} />
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default PetRecords;
