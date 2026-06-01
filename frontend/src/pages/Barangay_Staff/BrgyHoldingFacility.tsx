import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import BrgySidebar from '../../components/BrgySidebar';
import BrgyNavbar from '../../components/Navbars/BrgyNavbar';

interface MedLog {
    id: string;
    medicine: string;
    dosage: string;
    loggedAt: string;
    staff: string;
    notes: string;
}

interface AnimalRecord {
    id: string;
    name: string;
    species: 'Canine' | 'Feline' | 'Other';
    breed: string;
    age: string;
    status: 'Healthy' | 'Treatment' | 'Observation' | 'Critical';
    currentStatus: 'Impounded' | 'Reclaimed' | 'Transferred';
    location: string;
    rescueLocation: string;
    intakeDate: string;
    photoUrl: string;
    notes: string;
    weight: string;
    sex: 'Male' | 'Female' | 'Spayed' | 'Neutered';
    history: { date: string; title: string; desc: string; type: string }[];
    medLogs: MedLog[];
}

const BrgyHoldingFacility = () => {
    const navigate = useNavigate();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    
    // Auth Check
    useEffect(() => {
        const rawUser = localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user');
        if (!rawUser) {
            navigate('/staff/login');
            return;
        }
    }, [navigate]);

    // Initial Animal Records
    const [animals, setAnimals] = useState<AnimalRecord[]>([
        {
            id: '#DOG-4402',
            name: 'Cooper',
            species: 'Canine',
            breed: 'Golden Retriever',
            age: '3 Years',
            status: 'Healthy',
            currentStatus: 'Impounded',
            location: 'B02',
            rescueLocation: 'Subdivision Sector 4',
            intakeDate: '2026-05-28',
            photoUrl: 'https://images.unsplash.com/photo-1552053831-71594a27632d?q=80&w=400&auto=format&fit=crop',
            notes: 'Annual vaccinations completed on Oct 14. Clear bloodwork. Showing high energy, responsive to basic commands.',
            weight: '31.2 kg',
            sex: 'Neutered',
            history: [
                { date: '2026-05-28', title: 'Admitted', desc: 'Rescued from Subdivision Sector 4.', type: 'status' },
                { date: '2026-05-30', title: 'Vet Evaluation', desc: 'Vaccinations fully updated. Blood test cleared.', type: 'health' }
            ],
            medLogs: [
                { id: '1', medicine: 'Heartgard Plus', dosage: '1 chewable tablet', loggedAt: '2026-05-30 08:30 AM', staff: 'Officer Kyla Frias', notes: 'Monthly preventative given.' }
            ]
        },
        {
            id: '#CAT-9921',
            name: 'Mittens',
            species: 'Feline',
            breed: 'Domestic Shorthair',
            age: '5 Months',
            status: 'Treatment',
            currentStatus: 'Reclaimed',
            location: 'Ward 3 - Isolation',
            rescueLocation: 'Commercial Area Plaza',
            intakeDate: '2026-05-30',
            photoUrl: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?q=80&w=400&auto=format&fit=crop',
            notes: 'Currently on antibiotics for minor URI. Appetite is good, stable weight. Next assessment scheduled for Nov 20.',
            weight: '2.1 kg',
            sex: 'Female',
            history: [
                { date: '2026-05-30', title: 'Admitted', desc: 'Impounded roaming stray near Commercial Area.', type: 'status' },
                { date: '2026-05-31', title: 'URI Treatment Initiated', desc: 'Diagnosed with Upper Respiratory Sighting. Placed in isolation.', type: 'health' }
            ],
            medLogs: [
                { id: '1', medicine: 'Clavamox Drops', dosage: '0.25 mL orally', loggedAt: '2026-05-31 09:00 AM', staff: 'Officer Emmanuel Vito Cruz', notes: 'Antibiotic therapy initiated.' }
            ]
        },
        {
            id: '#DOG-1123',
            name: 'Max',
            species: 'Canine',
            breed: 'German Shepherd',
            age: '4 Years',
            status: 'Observation',
            currentStatus: 'Transferred',
            location: 'Kennel A-05',
            rescueLocation: 'Selera Homes Park',
            intakeDate: '2026-05-26',
            photoUrl: 'https://images.unsplash.com/photo-1589941013453-ec89f33b5e95?q=80&w=400&auto=format&fit=crop',
            notes: 'Behavioral assessment in progress. Intelligent and alert, but slightly territorial around food. Monitoring social interactions with other canines.',
            weight: '34.8 kg',
            sex: 'Male',
            history: [
                { date: '2026-05-26', title: 'Admitted', desc: 'Sighted and reported roaming near Selera Homes park.', type: 'status' },
                { date: '2026-05-27', title: 'Behavior Assessment', desc: 'High intelligence. Responsive to commands but exhibits food aggression.', type: 'behavior' }
            ],
            medLogs: []
        },
        {
            id: '#DOG-3315',
            name: 'Bella',
            species: 'Canine',
            breed: 'Chihuahua',
            age: '2 Years',
            status: 'Healthy',
            currentStatus: 'Impounded',
            location: 'Kennel A-12',
            rescueLocation: 'Sector C Playground',
            intakeDate: '2026-05-29',
            photoUrl: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?q=80&w=400&auto=format&fit=crop',
            notes: 'Spayed on Nov 14. Extremely friendly and playful. Enjoys human interaction and gets along great with other small dogs.',
            weight: '4.5 kg',
            sex: 'Spayed',
            history: [
                { date: '2026-05-29', title: 'Admitted', desc: 'Brought in by resident after wandering in sector C.', type: 'status' },
                { date: '2026-05-30', title: 'Neutering Surgery', desc: 'Spayed successfully. Full recovery confirmed.', type: 'health' }
            ],
            medLogs: []
        },
        {
            id: '#CAT-2289',
            name: 'Milo',
            species: 'Feline',
            breed: 'Siamese',
            age: '1 Year',
            status: 'Observation',
            currentStatus: 'Impounded',
            location: 'B05',
            rescueLocation: 'Sector B Drainage Pipe',
            intakeDate: '2026-05-31',
            photoUrl: 'https://images.unsplash.com/photo-1592194996308-7b43878e84a6?q=80&w=400&auto=format&fit=crop',
            notes: 'Treated for dehydration. Showing excellent recovery progress. Extremely quiet and gentle.',
            weight: '3.8 kg',
            sex: 'Male',
            history: [
                { date: '2026-05-31', title: 'Admitted', desc: 'Rescued from empty drainage pipe.', type: 'status' },
                { date: '2026-05-31', title: 'Dehydration Therapy', desc: 'Administered IV fluids and recovery supplements.', type: 'health' }
            ],
            medLogs: [
                { id: '1', medicine: 'Rehydration Salts', dosage: '50 mL in water bowl', loggedAt: '2026-05-31 02:00 PM', staff: 'Officer Emmanuel Vito Cruz', notes: 'Hydration improvement logged.' }
            ]
        }
    ]);

    // Filters & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [speciesFilter, setSpeciesFilter] = useState('All Species');
    const [breedFilter, setBreedFilter] = useState('Any Breed');
    const [healthFilter, setHealthFilter] = useState('Any Status');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const recordsPerPage = 3;

    // Modals
    const [selectedAnimal, setSelectedAnimal] = useState<AnimalRecord | null>(null);
    const [medsAnimal, setMedsAnimal] = useState<AnimalRecord | null>(null);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
    const [isAddAnimalOpen, setIsAddAnimalOpen] = useState(false);

    // Form inputs for meds
    const [medInput, setMedInput] = useState({ medicine: '', dosage: '', notes: '' });
    
    // Form inputs for bulk update
    const [bulkUpdateFields, setBulkUpdateFields] = useState({ status: 'Healthy', currentStatus: 'Impounded', location: '' });
    const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);

    // Form inputs for add/edit animal
    const [animalForm, setAnimalForm] = useState({
        name: '',
        species: 'Canine' as 'Canine' | 'Feline' | 'Other',
        breed: '',
        age: '',
        status: 'Healthy' as 'Healthy' | 'Treatment' | 'Observation' | 'Critical',
        currentStatus: 'Impounded' as 'Impounded' | 'Reclaimed' | 'Transferred',
        location: '',
        rescueLocation: '',
        intakeDate: new Date().toISOString().split('T')[0],
        photoUrl: '',
        notes: '',
        weight: '',
        sex: 'Male' as 'Male' | 'Female' | 'Spayed' | 'Neutered'
    });
    const [editingAnimalId, setEditingAnimalId] = useState<string | null>(null);

    // Photo File Upload State
    const [photoFile, setPhotoFile] = useState<File | null>(null);

    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setPhotoFile(file);
            const localUrl = URL.createObjectURL(file);
            setAnimalForm(prev => ({ ...prev, photoUrl: localUrl }));
        }
    };

    // Unique Breeds list based on records
    const uniqueBreeds = Array.from(new Set(animals.map(a => a.breed)));

    // Clear filters
    const handleClearFilters = () => {
        setSearchQuery('');
        setSpeciesFilter('All Species');
        setBreedFilter('Any Breed');
        setHealthFilter('Any Status');
        setStartDate('');
        setEndDate('');
    };

    // Filter Logic
    const filteredAnimals = animals.filter(animal => {
        const matchesQuery = searchQuery.trim() === '' || 
            animal.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            animal.id.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesSpecies = speciesFilter === 'All Species' || animal.species === speciesFilter;
        const matchesBreed = breedFilter === 'Any Breed' || animal.breed === breedFilter;
        const matchesHealth = healthFilter === 'Any Status' || animal.status === healthFilter;
        
        let matchesDates = true;
        if (startDate) {
            matchesDates = matchesDates && animal.intakeDate >= startDate;
        }
        if (endDate) {
            matchesDates = matchesDates && animal.intakeDate <= endDate;
        }

        return matchesQuery && matchesSpecies && matchesBreed && matchesHealth && matchesDates;
    });

    // Pagination Calculations
    const totalRecords = filteredAnimals.length;
    const totalPages = Math.ceil(totalRecords / recordsPerPage) || 1;
    const startIndex = (currentPage - 1) * recordsPerPage;
    const paginatedAnimals = filteredAnimals.slice(startIndex, startIndex + recordsPerPage);

    // Reset pagination when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, speciesFilter, breedFilter, healthFilter, startDate, endDate]);

    // Handle Log Meds Submit
    const handleLogMedsSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!medsAnimal) return;
        
        const newLog: MedLog = {
            id: (medsAnimal.medLogs.length + 1).toString(),
            medicine: medInput.medicine,
            dosage: medInput.dosage,
            loggedAt: new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date().toLocaleDateString(),
            staff: 'Officer Emmanuel Vito Cruz',
            notes: medInput.notes || 'Routine dose logged successfully.'
        };

        const updatedAnimals = animals.map(a => {
            if (a.id === medsAnimal.id) {
                return {
                    ...a,
                    medLogs: [newLog, ...a.medLogs],
                    history: [
                        { 
                            date: new Date().toISOString().split('T')[0], 
                            title: 'Meds Administered', 
                            desc: `Administered ${medInput.medicine} (${medInput.dosage})`, 
                            type: 'health' 
                        },
                        ...a.history
                    ]
                };
            }
            return a;
        });

        setAnimals(updatedAnimals);
        setMedsAnimal(null);
        setMedInput({ medicine: '', dosage: '', notes: '' });
        alert(`Successfully logged medication for ${medsAnimal.name}!`);
    };

    // Handle Bulk Update Submit
    const handleBulkUpdateSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (bulkSelectedIds.length === 0) {
            alert('Please select at least one animal to update.');
            return;
        }

        // Validate 7-day max limit constraint for Impounded status
        if (bulkUpdateFields.currentStatus === 'Impounded') {
            const hasExceeded = animals.some(a => {
                if (bulkSelectedIds.includes(a.id)) {
                    try {
                        const intake = new Date(a.intakeDate);
                        const today = new Date();
                        const diffTime = today.getTime() - intake.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        return diffDays > 7;
                    } catch (e) {
                        return false;
                    }
                }
                return false;
            });

            if (hasExceeded) {
                alert('❌ Error: One or more selected animals have been in care for more than 7 days. They cannot be set to "Impounded" status and must be marked as "Transferred".');
                return;
            }
        }

        const updatedAnimals = animals.map(a => {
            if (bulkSelectedIds.includes(a.id)) {
                return {
                    ...a,
                    status: bulkUpdateFields.status as any,
                    currentStatus: bulkUpdateFields.currentStatus as any,
                    location: bulkUpdateFields.location.trim() !== '' ? bulkUpdateFields.location : a.location,
                    history: [
                        { 
                            date: new Date().toISOString().split('T')[0], 
                            title: 'Bulk Status Updated', 
                            desc: `Updated status to ${bulkUpdateFields.status} / ${bulkUpdateFields.currentStatus} ${bulkUpdateFields.location ? 'at ' + bulkUpdateFields.location : ''}`, 
                            type: 'status' 
                        },
                        ...a.history
                    ]
                };
            }
            return a;
        });

        setAnimals(updatedAnimals);
        setBulkSelectedIds([]);
        setIsBulkUpdateOpen(false);
        alert('Bulk status update successfully applied!');
    };

    // Toggle Bulk selection for an animal
    const toggleBulkSelect = (id: string) => {
        setBulkSelectedIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // Handle Add / Edit Animal Submit
    const handleAddAnimalSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validate days difference for 7-day holding limit
        const intake = new Date(animalForm.intakeDate);
        const today = new Date();
        const diffTime = today.getTime() - intake.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays > 7 && animalForm.currentStatus === 'Impounded') {
            alert('❌ Warning: Days in care cannot exceed the 7-day maximum holding limit for "Impounded" animals. The animal must be marked as "Transferred" or the rescued date must be corrected.');
            return;
        }
        
        if (editingAnimalId) {
            // Edit mode
            const updatedAnimals = animals.map(a => {
                if (a.id === editingAnimalId) {
                    return {
                        ...a,
                        name: animalForm.name,
                        species: animalForm.species,
                        breed: animalForm.breed || 'Unknown',
                        age: animalForm.age,
                        status: animalForm.status,
                        currentStatus: animalForm.currentStatus,
                        location: animalForm.location,
                        rescueLocation: animalForm.rescueLocation || 'Unknown',
                        intakeDate: animalForm.intakeDate,
                        photoUrl: animalForm.photoUrl || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=400&auto=format&fit=crop',
                        notes: animalForm.notes,
                        weight: animalForm.weight || 'Unknown',
                        sex: animalForm.sex,
                        history: [
                            { 
                                date: new Date().toISOString().split('T')[0], 
                                title: 'Profile Updated', 
                                desc: 'General identification parameters updated.', 
                                type: 'status' 
                            },
                            ...a.history
                        ]
                    };
                }
                return a;
            });
            setAnimals(updatedAnimals);
            setEditingAnimalId(null);
            alert('Animal record updated successfully!');
        } else {
            // Add mode
            const newAnimal: AnimalRecord = {
                id: `#${animalForm.species === 'Canine' ? 'DOG' : 'CAT'}-${Math.floor(1000 + Math.random() * 9000)}`,
                name: animalForm.name,
                species: animalForm.species,
                breed: animalForm.breed || 'Unknown',
                age: animalForm.age,
                status: animalForm.status,
                currentStatus: animalForm.currentStatus,
                location: animalForm.location || 'Holding Kennel A-01',
                rescueLocation: animalForm.rescueLocation || 'Unknown',
                intakeDate: animalForm.intakeDate,
                photoUrl: animalForm.photoUrl || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=400&auto=format&fit=crop',
                notes: animalForm.notes || 'No custom notes logged.',
                weight: animalForm.weight || 'Unknown',
                sex: animalForm.sex,
                history: [
                    { date: animalForm.intakeDate, title: 'Admitted', desc: `Logged and impounded. Rescued from ${animalForm.rescueLocation || 'Unknown'}.`, type: 'status' }
                ],
                medLogs: []
            };
            setAnimals([newAnimal, ...animals]);
            alert('New animal record registered successfully!');
        }

        setIsAddAnimalOpen(false);
        setPhotoFile(null);
        setAnimalForm({
            name: '',
            species: 'Canine',
            breed: '',
            age: '',
            status: 'Healthy',
            currentStatus: 'Impounded',
            location: '',
            rescueLocation: '',
            intakeDate: new Date().toISOString().split('T')[0],
            photoUrl: '',
            notes: '',
            weight: '',
            sex: 'Male'
        });
    };

    // Open Edit Mode Form
    const openEditMode = (animal: AnimalRecord) => {
        setSelectedAnimal(null); // Close detail view
        setEditingAnimalId(animal.id);
        setPhotoFile(null);
        setAnimalForm({
            name: animal.name,
            species: animal.species,
            breed: animal.breed,
            age: animal.age,
            status: animal.status,
            currentStatus: animal.currentStatus,
            location: animal.location,
            rescueLocation: animal.rescueLocation || '',
            intakeDate: animal.intakeDate,
            photoUrl: animal.photoUrl,
            notes: animal.notes,
            weight: animal.weight,
            sex: animal.sex
        });
        setIsAddAnimalOpen(true);
    };

    // Handle Cage click to show dynamic animal records/details
    const handleCageClick = (cageId: string) => {
        if (cageId === 'B07') {
            alert('🛠️ Cage B07 is currently OUT OF SERVICE for routine sanitization and maintenance.');
            return;
        }
        const animalInCage = animals.find(a => a.location === cageId && a.currentStatus === 'Impounded');
        if (animalInCage) {
            setSelectedAnimal(animalInCage);
        } else {
            alert(`🟢 Cage ${cageId} is currently EMPTY and available for incoming rescues.`);
        }
    };

    return (
        <div className="min-h-screen w-full flex bg-[#FDFBF9] font-sans text-gray-800">
            {/* Sidebar component */}
            <BrgySidebar 
                isMobileOpen={isMobileSidebarOpen}
                onCloseMobile={() => setIsMobileSidebarOpen(false)}
            />

            {/* Main Area */}
            <main className="flex-1 flex flex-col h-screen overflow-hidden w-full">
                <BrgyNavbar 
                    onMenuToggle={() => setIsMobileSidebarOpen(true)}
                    leftContent={
                        <div className="flex flex-col">
                            <h1 className="text-xl font-black text-gray-900 tracking-tight leading-none uppercase">Rescue Animal Records</h1>
                            <p className="text-[9px] text-gray-400 font-extrabold uppercase tracking-wider mt-1.5 leading-none">Manage and track all current shelter inhabitants and their histories.</p>
                        </div>
                    }
                />

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-6 sm:p-8 custom-scrollbar">
                    <div className="max-w-6xl mx-auto flex flex-col gap-6">

                        {/* Top Utility Row */}
                        <div className="flex justify-end items-center gap-3">
                            <button 
                                onClick={() => setIsPrintModalOpen(true)}
                                className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-gray-50 active:scale-95 transition-all shadow-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                </svg>
                                Print ID Tags
                            </button>
                            <button 
                                onClick={() => {
                                    setEditingAnimalId(null);
                                    setPhotoFile(null);
                                    setAnimalForm({
                                        name: '',
                                        species: 'Canine',
                                        breed: '',
                                        age: '',
                                        status: 'Healthy',
                                        currentStatus: 'Impounded',
                                        location: '',
                                        rescueLocation: '',
                                        intakeDate: new Date().toISOString().split('T')[0],
                                        photoUrl: '',
                                        notes: '',
                                        weight: '',
                                        sex: 'Male'
                                    });
                                    setIsAddAnimalOpen(true);
                                }}
                                className="px-6 py-3 bg-[#F97316] text-[#FAFAF9] rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-[#EA580C] hover:shadow-lg hover:shadow-orange-500/10 active:scale-95 transition-all border border-orange-500/20 shadow-sm"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                </svg>
                                Add Animal
                            </button>
                        </div>

                        {/* Search and Filters Section */}
                        <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 flex flex-col gap-6">
                            
                            {/* Search bar */}
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none text-gray-400">
                                    <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="🔍 Search by ID or Name..."
                                    className="block w-full pl-12 pr-6 py-4 bg-[#FAFAF9] border border-gray-100 rounded-2xl font-bold text-sm text-[#1a1208] placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#F97316]/10 focus:border-[#F97316] transition-all"
                                />
                            </div>

                            {/* Dropdown Filters Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                                
                                {/* Species */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block pl-1">Species</label>
                                    <select
                                        value={speciesFilter}
                                        onChange={(e) => setSpeciesFilter(e.target.value)}
                                        className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-xl px-4 text-xs font-bold text-[#1a1208] focus:outline-none focus:bg-white focus:border-[#F97316] transition-all cursor-pointer"
                                    >
                                        <option value="All Species">All Species</option>
                                        <option value="Canine">Canine (Dogs)</option>
                                        <option value="Feline">Feline (Cats)</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                {/* Breed */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block pl-1">Breed</label>
                                    <select
                                        value={breedFilter}
                                        onChange={(e) => setBreedFilter(e.target.value)}
                                        className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-xl px-4 text-xs font-bold text-[#1a1208] focus:outline-none focus:bg-white focus:border-[#F97316] transition-all cursor-pointer"
                                    >
                                        <option value="Any Breed">Any Breed</option>
                                        {uniqueBreeds.map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                </div>

                                {/* Rescued Date */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block pl-1">Rescued Date</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-xl px-4 text-xs font-bold text-[#1a1208] focus:outline-none focus:bg-white focus:border-[#F97316] transition-all"
                                    />
                                </div>

                                {/* Health Status */}
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block pl-1">Health Status</label>
                                    <select
                                        value={healthFilter}
                                        onChange={(e) => setHealthFilter(e.target.value)}
                                        className="w-full h-12 bg-[#FAFAF9] border border-gray-100 rounded-xl px-4 text-xs font-bold text-[#1a1208] focus:outline-none focus:bg-white focus:border-[#F97316] transition-all cursor-pointer"
                                    >
                                        <option value="Any Status">Any Status</option>
                                        <option value="Healthy">Healthy</option>
                                        <option value="Treatment">Treatment</option>
                                        <option value="Observation">Observation</option>
                                        <option value="Critical">Critical</option>
                                    </select>
                                </div>
                            </div>

                            {/* Clear filters row */}
                            <div className="flex justify-end pt-2 border-t border-gray-50">
                                <button 
                                    onClick={handleClearFilters}
                                    className="text-xs font-black text-[#F97316] hover:text-[#EA580C] uppercase tracking-widest flex items-center gap-2 transition-colors cursor-pointer"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Clear All Filters
                                </button>
                            </div>
                        </div>

                        {/* Bulk mode indicator */}
                        {isBulkUpdateOpen && (
                            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex items-center justify-between text-xs font-bold text-orange-700 animate-in slide-in-from-top-4 duration-300">
                                <div className="flex items-center gap-2">
                                    <span className="relative flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                                    </span>
                                    <span>Bulk Update Mode Active. Click checkboxes on the cards to select animals. ({bulkSelectedIds.length} Selected)</span>
                                </div>
                                <button 
                                    onClick={() => { setBulkSelectedIds([]); setIsBulkUpdateOpen(false); }}
                                    className="text-[10px] font-black uppercase tracking-widest text-orange-800 hover:underline"
                                >
                                    Cancel
                                </button>
                            </div>
                        )}

                        {/* Inhabitants List Table */}
                        <div className="bg-white rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden">
                            {paginatedAnimals.length === 0 ? (
                                <div className="py-20 px-8 flex flex-col items-center justify-center text-center">
                                    <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center text-[#F97316] mb-4">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-black text-gray-900 uppercase">No Shelter Inhabitants Found</h3>
                                    <p className="text-xs font-semibold text-gray-400 max-w-sm mt-2">Try adjusting your search filters or add a new stray record into the database.</p>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-[#FAF0EB] border-b border-gray-100">
                                                <th className="px-6 py-4.5 text-[10px] font-black text-[#8C6D62] tracking-wider uppercase">
                                                    <div className="flex items-center gap-3">
                                                        {isBulkUpdateOpen && (
                                                            <input
                                                                type="checkbox"
                                                                checked={bulkSelectedIds.length === paginatedAnimals.length && paginatedAnimals.length > 0}
                                                                onChange={() => {
                                                                    const allIds = paginatedAnimals.map(a => a.id);
                                                                    if (bulkSelectedIds.length === paginatedAnimals.length) {
                                                                        setBulkSelectedIds([]);
                                                                    } else {
                                                                        setBulkSelectedIds(allIds);
                                                                    }
                                                                }}
                                                                className="w-4 h-4 rounded text-[#F97316] focus:ring-[#F97316] border-gray-300"
                                                            />
                                                        )}
                                                        Animal ID & Photo
                                                    </div>
                                                </th>
                                                <th className="px-6 py-4.5 text-[10px] font-black text-[#8C6D62] tracking-wider uppercase">Species / Breed</th>
                                                <th className="px-6 py-4.5 text-[10px] font-black text-[#8C6D62] tracking-wider uppercase">Rescued Date</th>
                                                <th className="px-6 py-4.5 text-[10px] font-black text-[#8C6D62] tracking-wider uppercase text-center">Health Status</th>
                                                <th className="px-6 py-4.5 text-[10px] font-black text-[#8C6D62] tracking-wider uppercase text-center">Current Status</th>
                                                <th className="px-6 py-4.5 text-[10px] font-black text-[#8C6D62] tracking-wider uppercase text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {paginatedAnimals.map(animal => {
                                                const isSelected = bulkSelectedIds.includes(animal.id);
                                                
                                                // Calculate Days in Care programmatically
                                                const getDaysInCare = (dateStr: string) => {
                                                    try {
                                                        const intake = new Date(dateStr);
                                                        const today = new Date();
                                                        const diffTime = Math.abs(today.getTime() - intake.getTime());
                                                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                                                        const days = diffDays || 1;
                                                        return days > 7 ? 7 : days;
                                                    } catch (e) {
                                                        return 1;
                                                    }
                                                };

                                                const rawDays = (() => {
                                                    try {
                                                        const intake = new Date(animal.intakeDate);
                                                        const today = new Date();
                                                        return Math.floor(Math.abs(today.getTime() - intake.getTime()) / (1000 * 60 * 60 * 24)) || 1;
                                                    } catch (e) {
                                                        return 1;
                                                    }
                                                })();
                                                const isOverLimit = rawDays >= 7 && animal.currentStatus === 'Impounded';

                                                return (
                                                    <tr 
                                                        key={animal.id}
                                                        onClick={isBulkUpdateOpen ? () => toggleBulkSelect(animal.id) : undefined}
                                                        className={`hover:bg-gray-50/50 transition-colors ${
                                                            isBulkUpdateOpen ? 'cursor-pointer' : ''
                                                        } ${isSelected ? 'bg-orange-50/30' : ''}`}
                                                    >
                                                        {/* ID & PHOTO (Name Removed!) */}
                                                        <td className="px-6 py-5.5 whitespace-nowrap">
                                                            <div className="flex items-center gap-4">
                                                                {isBulkUpdateOpen && (
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={(e) => {
                                                                            e.stopPropagation();
                                                                            toggleBulkSelect(animal.id);
                                                                        }}
                                                                        className="w-4 h-4 rounded text-[#F97316] focus:ring-[#F97316] border-gray-300"
                                                                    />
                                                                )}
                                                                <img 
                                                                    src={animal.photoUrl} 
                                                                    alt={animal.id} 
                                                                    className="w-12 h-12 rounded-xl object-cover border border-gray-100 shadow-sm shrink-0"
                                                                />
                                                                <span className="text-[#C2410C] font-black text-sm tracking-tight">
                                                                    {animal.id}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* SPECIES / BREED */}
                                                        <td className="px-6 py-5.5 whitespace-nowrap">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-black text-gray-800 uppercase">
                                                                    {animal.species === 'Canine' ? 'Dog' : animal.species === 'Feline' ? 'Cat' : 'Other'}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wide">
                                                                    {animal.breed}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        {/* RESCUED DATE */}
                                                        <td className="px-6 py-5.5 whitespace-nowrap">
                                                            <div className="flex flex-col">
                                                                <span className="text-xs font-black text-gray-800 uppercase tracking-tight">
                                                                    {new Date(animal.intakeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                                </span>
                                                                <div className="flex items-center gap-1.5 mt-1">
                                                                    <span className={`text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${
                                                                        isOverLimit ? 'text-red-600 animate-pulse font-extrabold' : 'text-[#A16207]'
                                                                    }`}>
                                                                        {getDaysInCare(animal.intakeDate)} Days In Care {isOverLimit && '• Needs Transfer'}
                                                                    </span>
                                                                    {isOverLimit && (
                                                                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500"></span>
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* HEALTH STATUS BADGE */}
                                                        <td className="px-6 py-5.5 whitespace-nowrap text-center">
                                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                                                animal.status === 'Healthy' ? 'bg-[#DCFCE7] text-[#15803D] border-green-200' :
                                                                animal.status === 'Treatment' ? 'bg-[#EEFDFB] text-[#14B8A6] border-teal-200' :
                                                                animal.status === 'Observation' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                                'bg-red-50 text-red-700 border-red-200'
                                                            }`}>
                                                                <span className={`w-1.5 h-1.5 rounded-full ${
                                                                    animal.status === 'Healthy' ? 'bg-green-500' :
                                                                    animal.status === 'Treatment' ? 'bg-teal-500' :
                                                                    animal.status === 'Observation' ? 'bg-rose-500' :
                                                                    'bg-red-500'
                                                                }`} />
                                                                {animal.status}
                                                            </span>
                                                        </td>

                                                        {/* CURRENT STATUS BADGE */}
                                                        <td className="px-6 py-5.5 whitespace-nowrap text-center">
                                                            <span className={`inline-flex items-center px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                                                                animal.currentStatus === 'Impounded' ? 'bg-[#FDF4EE] text-[#A17C6B] border-[#F2E5DC]' :
                                                                animal.currentStatus === 'Reclaimed' ? 'bg-[#EEFDFB] text-[#558D87] border-[#DCF2F0]' :
                                                                animal.currentStatus === 'Transferred' ? 'bg-[#FFF5EE] text-[#EA580C] border-[#FADECF]' :
                                                                'bg-[#EEF7FD] text-[#52778A] border-[#DCEBF2]'
                                                            }`}>
                                                                {animal.currentStatus}
                                                            </span>
                                                        </td>

                                                        {/* ACTIONS */}
                                                        <td className="px-6 py-5.5 whitespace-nowrap text-right">
                                                            <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                                <button 
                                                                    onClick={() => setSelectedAnimal(animal)}
                                                                    className="p-2 bg-white border border-gray-200 hover:bg-orange-50 text-gray-500 hover:text-[#F97316] rounded-xl transition-all shadow-sm cursor-pointer"
                                                                    title="View Details Profile"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Pagination Section */}
                        {filteredAnimals.length > 0 && (
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-6 mb-12">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    Showing {startIndex + 1} to {Math.min(startIndex + recordsPerPage, totalRecords)} of {totalRecords} animal records
                                </span>
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-90 disabled:opacity-50 disabled:pointer-events-none transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>
                                    
                                    {Array.from({ length: totalPages }).map((_, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setCurrentPage(i + 1)}
                                            className={`w-10 h-10 rounded-xl text-xs font-black transition-all ${
                                                currentPage === i + 1 
                                                ? 'bg-[#78350F] text-[#FFFBEB] border border-amber-950/20 shadow-md shadow-amber-500/10' 
                                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                                            }`}
                                        >
                                            {i + 1}
                                        </button>
                                    ))}

                                    <button 
                                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                        disabled={currentPage === totalPages}
                                        className="w-10 h-10 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-90 disabled:opacity-50 disabled:pointer-events-none transition-all"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Cage Occupancy Tracker Section */}
                        {(() => {
                            const activeImpoundedInUnit = animals.filter(a => a.currentStatus === 'Impounded' && ['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B08'].includes(a.location));
                            const occupiedActiveCareCount = activeImpoundedInUnit.filter(a => a.status !== 'Observation').length;
                            const occupiedObservationCount = activeImpoundedInUnit.filter(a => a.status === 'Observation').length;
                            const availableCount = 7 - activeImpoundedInUnit.length;
                            const totalOccupied = activeImpoundedInUnit.length + 1; // including Maintenance (B07)
                            const capacityPercent = (totalOccupied / 8) * 100;

                            return (
                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                                    
                                    {/* Animal Shelter Unit Tracker Widget */}
                                    <div className="lg:col-span-2 bg-[#FAF0EB] border border-[#F2E5DC] rounded-[2.5rem] p-6 sm:p-8 flex flex-col gap-6 shadow-sm">
                                        <div className="flex justify-between items-center">
                                            <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">Animal Shelter Unit (Main Residence)</h2>
                                            <span className="px-3 py-1 bg-[#FEE2E2] border border-[#FECACA] text-[#991B1B] rounded-full text-[9px] font-black uppercase tracking-wider">
                                                Near Capacity
                                            </span>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                            {['B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08'].map(cageId => {
                                                if (cageId === 'B07') {
                                                    return (
                                                        <div 
                                                            key={cageId}
                                                            onClick={() => handleCageClick('B07')}
                                                            className="border-2 border-dashed border-gray-200 bg-[#FAFAF9]/50 rounded-2xl aspect-square flex items-center justify-center relative select-none hover:scale-102 transition-transform cursor-pointer"
                                                            title="Cage B07 is currently OUT OF SERVICE for routine sanitization and maintenance."
                                                        >
                                                            <span className="text-[10px] font-bold text-gray-300">B07</span>
                                                        </div>
                                                    );
                                                }

                                                const animalInCage = animals.find(a => a.location === cageId && a.currentStatus === 'Impounded');

                                                if (animalInCage) {
                                                    const isObservation = animalInCage.status === 'Observation';
                                                    if (isObservation) {
                                                        return (
                                                            <div 
                                                                key={cageId}
                                                                onClick={() => handleCageClick(cageId)}
                                                                className="bg-white border border-[#F2E5DC] rounded-2xl p-4.5 aspect-square flex flex-col justify-between shadow-sm relative hover:scale-102 transition-transform cursor-pointer animate-in fade-in duration-300"
                                                                title={`Occupied by ${animalInCage.name} (${animalInCage.id}) - Observation. Click to view records.`}
                                                            >
                                                                <span className="text-[10px] font-bold text-gray-400">{cageId}</span>
                                                                <div className="absolute bottom-4 right-4 w-2.5 h-2.5 bg-orange-500 rounded-full" />
                                                            </div>
                                                        );
                                                    } else {
                                                        return (
                                                            <div 
                                                                key={cageId}
                                                                onClick={() => handleCageClick(cageId)}
                                                                className="bg-[#FEF2F2] border border-red-200 rounded-2xl p-4.5 aspect-square flex flex-col justify-between shadow-sm relative hover:scale-102 transition-transform cursor-pointer animate-in fade-in duration-300"
                                                                title={`Occupied by ${animalInCage.name} (${animalInCage.id}) - Active Care. Click to view records.`}
                                                            >
                                                                <span className="text-[10px] font-black text-red-600">{cageId}</span>
                                                                <div className="absolute bottom-4 right-4 w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse" />
                                                            </div>
                                                        );
                                                    }
                                                }

                                                return (
                                                    <div 
                                                        key={cageId}
                                                        onClick={() => handleCageClick(cageId)}
                                                        className="bg-white border border-[#F2E5DC] rounded-2xl p-4.5 aspect-square flex flex-col justify-between shadow-sm relative hover:scale-102 transition-transform cursor-pointer"
                                                        title={`Cage ${cageId} is empty. Click to view.`}
                                                    >
                                                        <span className="text-[10px] font-bold text-gray-400">{cageId}</span>
                                                        <div className="absolute bottom-4 right-4 w-2.5 h-2.5 bg-emerald-600 rounded-full" />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Occupancy Info / Legend Widget */}
                                    <div className="bg-white border border-gray-100 rounded-[2.5rem] p-6 sm:p-8 flex flex-col justify-between gap-6 shadow-xl">
                                        <div>
                                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-4">Shelter Unit Occupancy Summary</h3>
                                            <div className="space-y-3.5">
                                                <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
                                                    <span className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
                                                        Available Cages
                                                    </span>
                                                    <span className="font-bold text-gray-800">{availableCount} {availableCount === 1 ? 'Cage' : 'Cages'}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
                                                    <span className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-red-600 shrink-0" />
                                                        Occupied (Active Care)
                                                    </span>
                                                    <span className="font-bold text-red-600">{occupiedActiveCareCount} {occupiedActiveCareCount === 1 ? 'Cage' : 'Cages'}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
                                                    <span className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
                                                        Observation/Quarantine
                                                    </span>
                                                    <span className="font-bold text-orange-500">{occupiedObservationCount} {occupiedObservationCount === 1 ? 'Cage' : 'Cages'}</span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs font-semibold text-gray-600">
                                                    <span className="flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full bg-gray-300 shrink-0" />
                                                        Maintenance (Unavailable)
                                                    </span>
                                                    <span className="font-bold text-gray-400">1 Cage</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="pt-4 border-t border-gray-50 flex flex-col gap-2">
                                            <div className="flex justify-between items-center text-[10px] font-black text-gray-400 uppercase tracking-wider">
                                                <span>Total Shelter Unit Capacity</span>
                                                <span className="text-[#F97316]">{totalOccupied} / 8 Occupied</span>
                                            </div>
                                            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-1">
                                                <div className="h-full bg-[#F97316] rounded-full" style={{ width: `${capacityPercent}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                    </div>
                </div>
            </main>

            {/* FULL ANIMAL PROFILE MODAL */}
            {selectedAnimal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#1a1208]/75 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setSelectedAnimal(null)} />
                    <div className="relative w-full max-w-2xl bg-[#FCFBF9] rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="px-8 py-6 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                            <div className="flex items-center gap-4">
                                <img src={selectedAnimal.photoUrl} className="w-14 h-14 rounded-2xl object-cover border shadow-sm" alt={selectedAnimal.id} />
                                <div>
                                    <div className="flex items-center gap-2.5">
                                        <h2 className="text-xl font-black text-gray-900 leading-none uppercase">{selectedAnimal.id}</h2>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider border ${
                                            selectedAnimal.currentStatus === 'Impounded' ? 'bg-[#FDF4EE] text-[#A17C6B] border-[#F2E5DC]' :
                                            selectedAnimal.currentStatus === 'Reclaimed' ? 'bg-[#EEFDFB] text-[#558D87] border-[#DCF2F0]' :
                                            selectedAnimal.currentStatus === 'Transferred' ? 'bg-[#FFF5EE] text-[#EA580C] border-[#FADECF]' :
                                            'bg-[#EEF7FD] text-[#52778A] border-[#DCEBF2]'
                                        }`}>
                                            {selectedAnimal.currentStatus}
                                        </span>
                                    </div>
                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1.5">{selectedAnimal.breed}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => openEditMode(selectedAnimal)} className="p-3 bg-orange-50 text-[#F97316] hover:bg-orange-100 rounded-2xl transition-all" title="Edit Profile">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                    </svg>
                                </button>
                                <button onClick={() => setSelectedAnimal(null)} className="p-3 bg-gray-50 text-gray-400 hover:text-gray-900 rounded-2xl transition-all">
                                    <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        </div>

                        {/* Scrollable body */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                            
                            {/* Summary parameters list */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                <div className="bg-white p-4.5 rounded-2xl border border-gray-100 text-center shadow-sm">
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Sex</p>
                                    <p className="text-xs font-black text-gray-800 uppercase">{selectedAnimal.sex}</p>
                                </div>
                                <div className="bg-white p-4.5 rounded-2xl border border-gray-100 text-center shadow-sm">
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Weight</p>
                                    <p className="text-xs font-black text-gray-800 uppercase">{selectedAnimal.weight}</p>
                                </div>
                                <div className="bg-white p-4.5 rounded-2xl border border-gray-100 text-center shadow-sm">
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Age</p>
                                    <p className="text-xs font-black text-gray-800 uppercase">{selectedAnimal.age}</p>
                                </div>
                                <div className="bg-white p-4.5 rounded-2xl border border-gray-100 text-center shadow-sm">
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Holding Location</p>
                                    <p className="text-xs font-black text-[#F97316] uppercase truncate">{selectedAnimal.location}</p>
                                </div>
                                <div className="bg-white p-4.5 rounded-2xl border border-gray-100 text-center shadow-sm">
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Rescue Location</p>
                                    <p className="text-xs font-black text-[#7C2D12] uppercase truncate" title={selectedAnimal.rescueLocation}>
                                        {selectedAnimal.rescueLocation || 'Unknown'}
                                    </p>
                                </div>
                                <div className="bg-white p-4.5 rounded-2xl border border-gray-100 text-center shadow-sm">
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Rescued Date</p>
                                    <p className="text-xs font-black text-gray-800 uppercase">
                                        {new Date(selectedAnimal.intakeDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                </div>
                                <div className={`p-4.5 rounded-2xl border text-center shadow-sm transition-all ${
                                    (() => {
                                        try {
                                            const intake = new Date(selectedAnimal.intakeDate);
                                            const today = new Date();
                                            const diffDays = Math.floor(Math.abs(today.getTime() - intake.getTime()) / (1000 * 60 * 60 * 24)) || 1;
                                            return diffDays >= 7 && selectedAnimal.currentStatus === 'Impounded';
                                        } catch(e) { return false; }
                                    })() ? 'bg-red-50 border-red-200 animate-pulse' : 'bg-white border-gray-100'
                                }`}>
                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Days in Care</p>
                                    {(() => {
                                        try {
                                            const intake = new Date(selectedAnimal.intakeDate);
                                            const today = new Date();
                                            const diffDays = Math.floor(Math.abs(today.getTime() - intake.getTime()) / (1000 * 60 * 60 * 24)) || 1;
                                            const capDays = diffDays > 7 ? 7 : diffDays;
                                            const isOver = diffDays >= 7 && selectedAnimal.currentStatus === 'Impounded';
                                            return (
                                                <p className={`text-xs font-black uppercase ${isOver ? 'text-red-600' : 'text-gray-800'}`}>
                                                    {capDays} Days {isOver && '(Needs Transfer)'}
                                                </p>
                                            );
                                        } catch(e) {
                                            return <p className="text-xs font-black text-gray-800 uppercase">1 Day</p>;
                                        }
                                    })()}
                                </div>
                            </div>

                            {/* Alert detail log */}
                            <div className="bg-orange-50 border border-orange-100 rounded-[2rem] p-6">
                                <h3 className="text-[10px] font-black text-[#F97316] uppercase tracking-widest mb-2">Intake Medical Sighting / Behaviour Notes</h3>
                                <p className="text-xs font-medium text-gray-700 leading-relaxed">
                                    "{selectedAnimal.notes}"
                                </p>
                            </div>

                            {/* Medical Log History */}
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Medical Logs</h3>
                                    <button 
                                        onClick={() => { setMedsAnimal(selectedAnimal); setSelectedAnimal(null); }}
                                        className="text-[10px] font-black text-[#F97316] uppercase hover:underline"
                                    >
                                        + Log New Medication
                                    </button>
                                </div>
                                <div className="space-y-3">
                                    {selectedAnimal.medLogs.length === 0 ? (
                                        <p className="text-xs font-semibold text-gray-400 italic bg-white border rounded-2xl p-4.5 text-center">No medical administrations logged.</p>
                                    ) : (
                                        selectedAnimal.medLogs.map(log => (
                                            <div key={log.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-2">
                                                <div className="flex justify-between items-start gap-4">
                                                    <div>
                                                        <h4 className="text-xs font-black text-gray-800 uppercase leading-none">{log.medicine}</h4>
                                                        <p className="text-[9px] font-bold text-orange-600 mt-1">Dosage: {log.dosage}</p>
                                                    </div>
                                                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-wider">{log.loggedAt}</span>
                                                </div>
                                                <p className="text-[11px] font-semibold text-gray-600 leading-normal">{log.notes}</p>
                                                <p className="text-[8px] font-black text-gray-400 uppercase pt-1">Logged By: {log.staff}</p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* Complete History Timeline */}
                            <div className="space-y-4">
                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Facility Operations History</h3>
                                <div className="relative border-l-2 border-gray-100 pl-6 ml-2.5 space-y-6">
                                    {selectedAnimal.history.map((hist, idx) => (
                                        <div key={idx} className="relative">
                                            {/* Bullet icon */}
                                            <span className="absolute -left-[31px] top-0 w-4 h-4 rounded-full border-2 border-white bg-[#F97316] shadow-sm flex items-center justify-center">
                                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                            </span>
                                            <div>
                                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider">{hist.date}</span>
                                                <h4 className="text-xs font-black text-gray-800 uppercase mt-0.5">{hist.title}</h4>
                                                <p className="text-xs font-semibold text-gray-500 leading-relaxed mt-1">{hist.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-5 bg-white border-t border-gray-100 flex justify-between items-center shrink-0">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">STRAYSAFE SHELTER LOGISTICS</p>
                            <button 
                                onClick={() => setSelectedAnimal(null)}
                                className="px-6 py-2.5 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-colors"
                            >
                                Close Records
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* LOG MEDICATION MODAL */}
            {medsAnimal && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#1a1208]/75 backdrop-blur-md" onClick={() => setMedsAnimal(null)} />
                    <div className="relative w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col">
                        
                        {/* Header */}
                        <div className="px-8 pt-8 pb-5 flex justify-between items-center border-b border-gray-100">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 uppercase">Log Medication</h2>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Administer treatment for {medsAnimal.name}</p>
                            </div>
                            <button onClick={() => setMedsAnimal(null)} className="p-2 text-gray-400 hover:text-gray-900">
                                <svg className="w-5.5 h-5.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleLogMedsSubmit} className="p-8 space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Medicine Name</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="e.g. Clavamox / Dewormer"
                                    value={medInput.medicine}
                                    onChange={(e) => setMedInput({ ...medInput, medicine: e.target.value })}
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-xs font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Dosage / Instructions</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="e.g. 0.5 mL / 1 tablet orally"
                                    value={medInput.dosage}
                                    onChange={(e) => setMedInput({ ...medInput, dosage: e.target.value })}
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-xs font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Observation / Notes</label>
                                <textarea 
                                    placeholder="Add any medical observations, side effects, or comments..."
                                    value={medInput.notes}
                                    onChange={(e) => setMedInput({ ...medInput, notes: e.target.value })}
                                    rows={4}
                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all resize-none"
                                />
                            </div>

                            <div className="flex gap-3 pt-3 border-t border-gray-50">
                                <button 
                                    type="button"
                                    onClick={() => setMedsAnimal(null)}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-3 bg-[#F97316] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#EA580C] shadow-lg shadow-orange-100 transition-all cursor-pointer"
                                >
                                    Log Treatment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* PRINT ID TAGS MODAL */}
            {isPrintModalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#1a1208]/75 backdrop-blur-md" onClick={() => setIsPrintModalOpen(false)} />
                    <div className="relative w-full max-w-lg bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col max-h-[80vh]">
                        {/* Header */}
                        <div className="px-8 pt-8 pb-5 flex justify-between items-center border-b border-gray-100">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 uppercase">Print Facility ID Tags</h2>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Shelter inhabitant tracking markers</p>
                            </div>
                            <button onClick={() => setIsPrintModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-900">
                                <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Print Content Preview */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-gray-50/50">
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Tag Printing Preview (Batch of {animals.length} Tags)</p>
                            <div className="space-y-4">
                                {animals.map(animal => (
                                    <div key={animal.id} className="bg-white border-2 border-dashed border-gray-200 rounded-2xl p-5 flex items-center justify-between gap-6 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            {/* Mini tag QR */}
                                            <div className="w-12 h-12 bg-gray-100 border rounded-lg flex items-center justify-center font-bold text-[8px] text-gray-400 uppercase leading-none text-center p-1 shrink-0">
                                                <span>QR SCAN<br/>TRACKER</span>
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black text-gray-900 uppercase">{animal.name}</h4>
                                                <p className="text-[9px] font-bold text-orange-600 uppercase tracking-wider">{animal.id}</p>
                                                <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">{animal.location}</p>
                                            </div>
                                        </div>
                                        <div className="text-right flex flex-col items-end gap-1">
                                            <span className="text-[9px] font-black text-gray-400 uppercase">Barangay Shelter</span>
                                            {/* Barcode representation */}
                                            <div className="h-6 w-24 bg-[repeating-linear-gradient(90deg,black,black_2px,transparent_2px,transparent_4px)]" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-8 py-5 bg-white border-t border-gray-100 flex gap-3">
                            <button 
                                onClick={() => setIsPrintModalOpen(false)}
                                className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer text-center"
                            >
                                Close Preview
                            </button>
                            <button 
                                onClick={() => {
                                    window.print();
                                    setIsPrintModalOpen(false);
                                }}
                                className="flex-1 py-3.5 bg-[#F97316] text-[#FAFAF9] text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-[#EA580C] shadow-lg shadow-orange-100 transition-all cursor-pointer text-center"
                            >
                                Dispatch Print Batch
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* BULK UPDATE STATUS MODAL */}
            {isBulkUpdateOpen && bulkSelectedIds.length > 0 && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#1a1208]/75 backdrop-blur-md" onClick={() => setIsBulkUpdateOpen(false)} />
                    <div className="relative w-full max-w-md bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col">
                        {/* Header */}
                        <div className="px-8 pt-8 pb-5 flex justify-between items-center border-b border-gray-100">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 uppercase">Bulk Update Details</h2>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Applying updates to {bulkSelectedIds.length} animals</p>
                            </div>
                            <button onClick={() => setIsBulkUpdateOpen(false)} className="p-2 text-gray-400 hover:text-gray-900">
                                <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Form */}
                        <form onSubmit={handleBulkUpdateSubmit} className="p-8 space-y-5">
                            
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">New Health Status</label>
                                <select 
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-xs font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all cursor-pointer"
                                    value={bulkUpdateFields.status}
                                    onChange={(e) => setBulkUpdateFields({ ...bulkUpdateFields, status: e.target.value })}
                                >
                                    <option value="Healthy">Healthy</option>
                                    <option value="Treatment">Treatment</option>
                                    <option value="Observation">Observation</option>
                                    <option value="Critical">Critical</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">New Movement / Current Status</label>
                                <select 
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-xs font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all cursor-pointer"
                                    value={bulkUpdateFields.currentStatus}
                                    onChange={(e) => setBulkUpdateFields({ ...bulkUpdateFields, currentStatus: e.target.value as any })}
                                >
                                    <option value="Impounded">Impounded</option>
                                    <option value="Reclaimed">Reclaimed</option>
                                    <option value="Transferred">Transferred</option>
                                    <option value="Adopted">Adopted</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">New Holding Cell / Location (Optional)</label>
                                <select 
                                    className="w-full h-12 bg-gray-50 border border-gray-100 rounded-xl px-4 text-xs font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all cursor-pointer"
                                    value={bulkUpdateFields.location}
                                    onChange={(e) => setBulkUpdateFields({ ...bulkUpdateFields, location: e.target.value })}
                                >
                                    <option value="">Leave empty (Retain current cell)</option>
                                    <option value="B01">B01</option>
                                    <option value="B02">B02</option>
                                    <option value="B03">B03</option>
                                    <option value="B04">B04</option>
                                    <option value="B05">B05</option>
                                    <option value="B06">B06</option>
                                    <option value="B07">B07 (Maintenance)</option>
                                    <option value="B08">B08</option>
                                </select>
                            </div>

                            <div className="flex gap-3 pt-3 border-t border-gray-50">
                                <button 
                                    type="button"
                                    onClick={() => setIsBulkUpdateOpen(false)}
                                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-3 bg-[#F97316] text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#EA580C] shadow-lg shadow-orange-100 transition-all cursor-pointer"
                                >
                                    Apply Updates
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ADD / REGISTER ANIMAL MODAL */}
            {isAddAnimalOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-[#1a1208]/75 backdrop-blur-md" onClick={() => setIsAddAnimalOpen(false)} />
                    <div className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-500 flex flex-col max-h-[85vh]">
                        {/* Header */}
                        <div className="px-8 py-6 bg-white border-b border-gray-100 flex justify-between items-center shrink-0">
                            <div>
                                <h2 className="text-xl font-black text-gray-900 uppercase">
                                    {editingAnimalId ? 'Update Animal Details' : 'Register New Inhabitant'}
                                </h2>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Shelter Facility Intake Logistics</p>
                            </div>
                            <button onClick={() => setIsAddAnimalOpen(false)} className="p-2 text-gray-400 hover:text-gray-900">
                                <svg className="w-5.5 h-5.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        {/* Form Body */}
                        <form onSubmit={handleAddAnimalSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar bg-gray-50/20">
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                
                                {/* Name */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Animal Name</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. Cooper / Unknown Stray"
                                        value={animalForm.name}
                                        onChange={(e) => setAnimalForm({ ...animalForm, name: e.target.value })}
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                    />
                                </div>

                                {/* Species */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Species</label>
                                    <select
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all cursor-pointer"
                                        value={animalForm.species}
                                        onChange={(e) => setAnimalForm({ ...animalForm, species: e.target.value as any })}
                                    >
                                        <option value="Canine">Canine (Dog)</option>
                                        <option value="Feline">Feline (Cat)</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>

                                {/* Breed */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Breed</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Golden Retriever / Tabby"
                                        value={animalForm.breed}
                                        onChange={(e) => setAnimalForm({ ...animalForm, breed: e.target.value })}
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                    />
                                </div>

                                {/* Age */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Approximate Age</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. 3 Years / 5 Months"
                                        value={animalForm.age}
                                        onChange={(e) => setAnimalForm({ ...animalForm, age: e.target.value })}
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                    />
                                </div>

                                {/* Sex */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Sex</label>
                                    <select
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all cursor-pointer"
                                        value={animalForm.sex}
                                        onChange={(e) => setAnimalForm({ ...animalForm, sex: e.target.value as any })}
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Spayed">Spayed</option>
                                        <option value="Neutered">Neutered</option>
                                    </select>
                                </div>

                                {/* Weight */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Weight (e.g. 30 kg)</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. 31.2 kg"
                                        value={animalForm.weight}
                                        onChange={(e) => setAnimalForm({ ...animalForm, weight: e.target.value })}
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                    />
                                </div>

                                {/* Holding Cell */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Holding Location / Cell</label>
                                    <select
                                        required
                                        value={animalForm.location}
                                        onChange={(e) => setAnimalForm({ ...animalForm, location: e.target.value })}
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:bg-white focus:border-[#F97316] transition-all cursor-pointer"
                                    >
                                        <option value="" disabled>Select Cell (B01 - B08)</option>
                                        <option value="B01">B01</option>
                                        <option value="B02">B02</option>
                                        <option value="B03">B03</option>
                                        <option value="B04">B04</option>
                                        <option value="B05">B05</option>
                                        <option value="B06">B06</option>
                                        <option value="B07">B07 (Maintenance)</option>
                                        <option value="B08">B08</option>
                                    </select>
                                </div>

                                {/* Rescue Location */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Rescue Location</label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. Sector C Playground / Roaming near Plaza"
                                        value={animalForm.rescueLocation}
                                        onChange={(e) => setAnimalForm({ ...animalForm, rescueLocation: e.target.value })}
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                    />
                                </div>

                                {/* Health Status */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Health Status</label>
                                    <select
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all cursor-pointer"
                                        value={animalForm.status}
                                        onChange={(e) => setAnimalForm({ ...animalForm, status: e.target.value as any })}
                                    >
                                        <option value="Healthy">Healthy</option>
                                        <option value="Treatment">Treatment</option>
                                        <option value="Observation">Observation</option>
                                        <option value="Critical">Critical</option>
                                    </select>
                                </div>

                                {/* Current Status */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Current Status</label>
                                    <select
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all cursor-pointer"
                                        value={animalForm.currentStatus}
                                        onChange={(e) => setAnimalForm({ ...animalForm, currentStatus: e.target.value as any })}
                                    >
                                        <option value="Impounded">Impounded</option>
                                        <option value="Reclaimed">Reclaimed</option>
                                        <option value="Transferred">Transferred</option>
                                    </select>
                                </div>

                                {/* Intake Date */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Rescued Date</label>
                                    <input 
                                        type="date" 
                                        required
                                        value={animalForm.intakeDate}
                                        onChange={(e) => setAnimalForm({ ...animalForm, intakeDate: e.target.value })}
                                        className="w-full h-12 bg-white border border-gray-150 rounded-xl px-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all"
                                    />
                                    <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider pl-1">
                                        ⚠️ Max 7 days in care allowed for "Impounded" status before transfer.
                                    </p>
                                </div>

                                {/* Photo Upload */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Animal Photo</label>
                                    <div className="relative w-full h-12 bg-white border border-gray-150 rounded-xl px-4 flex items-center gap-3 cursor-pointer hover:border-[#F97316] hover:bg-gray-50/20 transition-all">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-xs font-bold text-gray-500 truncate select-none">
                                            {photoFile ? photoFile.name : (editingAnimalId && animalForm.photoUrl ? '📷 Current Photo Retained' : 'Select image file to upload...')}
                                        </span>
                                        <input 
                                            type="file" 
                                            accept="image/*"
                                            onChange={handlePhotoUpload}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                        />
                                    </div>
                                </div>

                            </div>

                            {/* Medical / Behavior Notes */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest">Intake Medical Sighting / Behaviour Notes</label>
                                <textarea 
                                    required
                                    placeholder="Enter initial vet report, vaccination logs, or behavior observations..."
                                    value={animalForm.notes}
                                    onChange={(e) => setAnimalForm({ ...animalForm, notes: e.target.value })}
                                    rows={4}
                                    className="w-full bg-white border border-gray-150 rounded-xl p-4 text-xs font-bold focus:outline-none focus:border-[#F97316] transition-all resize-none"
                                />
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-3 border-t border-gray-100">
                                <button 
                                    type="button"
                                    onClick={() => setIsAddAnimalOpen(false)}
                                    className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors cursor-pointer text-center"
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit"
                                    className="flex-1 py-3.5 bg-[#F97316] text-[#FAFAF9] rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#EA580C] hover:shadow-lg hover:shadow-orange-500/10 active:scale-95 transition-all border border-orange-500/20 shadow-sm cursor-pointer text-center"
                                >
                                    {editingAnimalId ? 'Save Updates' : 'Admit Animal'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BrgyHoldingFacility;
