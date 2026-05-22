import { useState } from 'react';
import SubdSidebar from '../../components/SubdSidebar';
import SubdNavbar from '../../components/Navbars/SubdNavbar';
import StatCard from '../../components/PetRecords/StatCard';
import PetTable from '../../components/PetRecords/PetTable';
import { type PetRecord } from '../../components/PetRecords/types';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import AddPetModal from '../../components/PetRecords/AddPetModal';
import Button from '../../components/Button';

const SubdPetRecords = () => {
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const handleSelectPet = (pet: PetRecord) => {
        setSelectedPet(pet);
    };

    return (
        <div className="min-h-screen w-full flex bg-[#FDFDFD] font-sans text-gray-800 relative overflow-hidden">
            {/* Decorative Background Elements */}
            <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-[#B35D25]/5 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>
            <div className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-orange-50/50 rounded-full blur-[120px] pointer-events-none translate-x-1/3 translate-y-1/3 z-0"></div>
            <div className="absolute top-1/2 left-1/2 w-[500px] h-[500px] bg-gray-100/50 rounded-full blur-[100px] pointer-events-none -translate-x-1/2 -translate-y-1/2 z-0"></div>

            {/* Sidebar */}
            <div className="z-10 flex shrink-0">
                <SubdSidebar />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Navbar */}
                <SubdNavbar />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-10 flex flex-col gap-10 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    {/* Header */}
                    <div className="flex justify-between items-end">
                        <div>
                            <h1 className="text-4xl font-black text-gray-900 mb-2">Subdivision Pet Information</h1>
                            <p className="text-gray-500 text-sm font-medium">Manage and monitor all registered animals within your subdivision.</p>
                        </div>
                        <div className="flex items-center gap-4">

                            <Button 
                                variant="primary" 
                                onClick={() => setIsAddModalOpen(true)}
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
                    {!selectedPet && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-500">
                            <StatCard 
                                label="Total Registered" 
                                value="428" 
                                badge="+5%" 
                                badgeVariant="warning"
                            />
                            <StatCard 
                                label="Fully Vaccinated" 
                                value="315" 
                                badge="74%" 
                                badgeVariant="info"
                            />
                            <StatCard 
                                label="Pending Records" 
                                value="5" 
                                badge="Attention" 
                                badgeVariant="info"
                            />
                        </div>
                    )}

                    {/* Main Content Area */}
                    <div className="flex flex-col gap-6">
                        <div className="flex justify-between items-center">
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
                                        placeholder="Search pets, owners, ID..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#B35D25]/20 focus:border-[#B35D25] transition-all w-64 shadow-sm"
                                    />
                                </div>
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Showing 1-10 of 428</p>
                            </div>
                        </div>
                        <PetTable onSelectPet={handleSelectPet} selectedPetId={selectedPet?.id || null} searchTerm={searchTerm} />
                    </div>

                    {/* Add Pet Modal */}
                    <AddPetModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />

                    {/* Centered Modal Popup */}
                    {selectedPet && (
                        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 sm:p-12 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
                            <div className="w-full max-w-6xl rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-300 bg-white overflow-hidden flex flex-col max-h-[90vh]">
                                <PetDetailPanel pet={selectedPet} onClose={() => setSelectedPet(null)} />
                            </div>
                        </div>
                    )}

                </div>
            </main>
        </div>
    );
};

export default SubdPetRecords;
