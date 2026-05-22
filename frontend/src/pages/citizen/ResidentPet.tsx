import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Button from '../../components/Button';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';

const ResidentPet = () => {
    const navigate = useNavigate();
    const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pets, setPets] = useState<any[]>([]);
    const [editingPetId, setEditingPetId] = useState<number | null>(null);

    const [formData, setFormData] = useState({
        name: '',
        species: 'Dog',
        breed: '',
        gender: 'Male',
        color: '',
        age: '',
        status: 'Active',
        condition: '',
        mediaFiles: [] as File[]
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

    const userStr = localStorage.getItem('resident_user');
    const currentUser = userStr ? JSON.parse(userStr) : null;

    useEffect(() => {
        if (currentUser) {
            fetchPets();
        }
    }, [currentUser?.user_id]);

    const fetchPets = async () => {
        try {
            const response = await axios.get(`http://localhost:8000/pets/owner/${currentUser.user_id}`);
            setPets(response.data);
        } catch (error) {
            console.error('Error fetching pets:', error);
        }
    };

    const filteredPets = pets.filter(pet => {
        const query = searchQuery.toLowerCase();
        return (
            pet.pet_name.toLowerCase().includes(query) ||
            (pet.breed || '').toLowerCase().includes(query) ||
            (pet.pet_type || '').toLowerCase().includes(query)
        );
    });

    const handleEditClick = (pet: any) => {
        setFormData({
            name: pet.pet_name,
            species: pet.pet_type,
            breed: pet.breed || '',
            gender: pet.gender || 'Male',
            color: pet.color_markings || '',
            age: pet.estimated_age || '',
            status: pet.status || 'Healthy',
            condition: pet.health_condition || '',
            mediaFiles: []
        });
        setEditingPetId(pet.pet_id);
        setIsAddPetModalOpen(true);
    };

    const handleDeletePet = async (id: number) => {
        if (window.confirm('Are you sure you want to remove this pet?')) {
            try {
                await axios.delete(`http://localhost:8000/pets/${id}`);
                fetchPets();
            } catch (error) {
                console.error('Error deleting pet:', error);
            }
        }
    };

    const handleSubmit = async () => {
        if (!currentUser) return;

        // Validation
        if (!formData.name.trim() || !formData.species || !formData.breed.trim() || 
            !formData.color.trim() || !formData.age.trim() || !formData.gender || !formData.condition.trim()) {
            alert('Please fill in all required fields.');
            return;
        }

        // Photo check: Required for new pets, optional for updates if already has one
        const hasPhoto = formData.mediaFiles.length > 0;
        if (!editingPetId && !hasPhoto) {
            alert('Please upload a pet photo.');
            return;
        }

        setIsSubmitting(true);
        try {
            const petData = {
                pet_name: formData.name,
                pet_type: formData.species,
                breed: formData.breed,
                gender: formData.gender,
                color_markings: formData.color,
                estimated_age: formData.age,
                status: formData.status,
                health_condition: formData.condition,
                owner_id: currentUser.user_id
            };

            let response;
            if (editingPetId) {
                response = await axios.put(`http://localhost:8000/pets/${editingPetId}`, petData);
            } else {
                response = await axios.post('http://localhost:8000/pets/', petData);
            }

            // Handle photo upload if any
            if (hasPhoto) {
                const petId = editingPetId || response.data.pet_id;
                const uploadData = new FormData();
                uploadData.append('file', formData.mediaFiles[0]);
                await axios.post(`http://localhost:8000/pets/${petId}/photo`, uploadData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            fetchPets();
            setIsAddPetModalOpen(false);
            setEditingPetId(null);
            setFormData({
                name: '',
                species: 'Dog',
                breed: '',
                gender: 'Male',
                color: '',
                age: '',
                status: 'Active',
                condition: '',
                mediaFiles: []
            });
        } catch (error) {
            console.error('Error saving pet:', error);
            alert('Failed to save pet information.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={`min-h-screen bg-[#FAFAF9] font-sans pb-24 ${isMobileSearchOpen ? 'overflow-hidden h-screen' : ''}`}>
            <ResiNavbar 
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)} 
                onSearch={setSearchQuery}
                searchValue={searchQuery}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            <main className="max-w-6xl mx-auto p-4 sm:p-8 pt-24 sm:pt-32">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-10 gap-4">
                    <div>
                        <h1 className="text-4xl font-black text-[#1a1208] uppercase tracking-tighter">My Family <span className="text-[#F97316]">Pets</span></h1>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">Manage your pets' health and identification records</p>
                    </div>
                    <Button
                        variant="primary"
                        onClick={() => {
                            setEditingPetId(null);
                            setFormData({
                                name: '',
                                species: 'Dog',
                                breed: '',
                                gender: 'Male',
                                color: '',
                                age: '',
                                status: 'Active',
                                condition: '',
                                mediaFiles: []
                            });
                            setIsAddPetModalOpen(true);
                        }}
                        className="bg-[#F97316] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-orange-200 hover:scale-105 transition-all flex items-center gap-3"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                        Register New Pet
                    </Button>
                </div>

                {/* Pets Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {filteredPets.length === 0 ? (
                        <div className="col-span-full py-20 bg-white rounded-[3rem] border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center">
                            <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center text-[#F97316] mb-6">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-black text-[#1a1208] uppercase">
                                {pets.length === 0 ? "No Pets Registered Yet" : "No Pets Match Search"}
                            </h3>
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-2">
                                {pets.length === 0 ? "Add your pets to help the community keep them safe" : "Try a different name or breed"}
                            </p>
                        </div>
                    ) : (
                        filteredPets.map((pet) => (
                            <div key={pet.pet_id} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-300 group">
                                <div className="relative h-56 overflow-hidden bg-gray-50">
                                    {pet.photo_url ? (
                                        <img src={pet.photo_url} alt={pet.pet_name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <span className="text-[10px] font-black uppercase tracking-widest">No Photo</span>
                                        </div>
                                    )}
                                    <div className="absolute top-4 right-4 flex gap-2">
                                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${
                                            pet.status === 'Healthy' ? 'bg-green-50 text-green-600 border-green-100' :
                                            pet.status === 'Under Treatment' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                                            'bg-red-50 text-red-600 border-red-100'
                                        }`}>
                                            {pet.status}
                                        </span>
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                    <div className="absolute bottom-4 left-6">
                                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">{pet.pet_name}</h2>
                                        <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">{pet.breed || pet.pet_type}</p>
                                    </div>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-50 rounded-2xl p-3">
                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Gender / Age</p>
                                            <p className="text-xs font-black text-[#1a1208] uppercase">{pet.gender} • {pet.estimated_age || 'N/A'}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-2xl p-3">
                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Color</p>
                                            <p className="text-xs font-black text-[#1a1208] uppercase">{pet.color_markings || 'Not specified'}</p>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2">Condition Details</p>
                                        <p className="text-xs font-medium text-[#4a3b28] leading-relaxed">
                                            {pet.health_condition || 'No specific conditions noted.'}
                                        </p>
                                    </div>
                                    <div className="pt-4 flex gap-3 border-t border-gray-50">
                                        <button 
                                            onClick={() => handleEditClick(pet)}
                                            className="flex-1 py-3 bg-orange-50 text-[#F97316] text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-orange-100 transition-colors"
                                        >
                                            Update Records
                                        </button>
                                        <button 
                                            onClick={() => handleDeletePet(pet.pet_id)}
                                            className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </main>

            {/* Registration/Update Modal */}
            {isAddPetModalOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
                    <div 
                        className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300"
                        onClick={() => setIsAddPetModalOpen(false)}
                    />
                    <div className="relative w-full max-w-2xl bg-white rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-500">
                        <div className="px-10 pt-10 pb-6 flex justify-between items-center border-b border-gray-50">
                            <div>
                                <h2 className="text-3xl font-black text-[#1a1208] uppercase tracking-tight">{editingPetId ? 'Update Pet Info' : 'Register New Pet'}</h2>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Keep your pet's records up to date for safety</p>
                            </div>
                            <button onClick={() => setIsAddPetModalOpen(false)} className="p-3 bg-gray-50 text-gray-400 hover:text-[#1a1208] rounded-2xl transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Pet Name <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" 
                                        className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200"
                                        placeholder="e.g. Bruno"
                                        value={formData.name}
                                        onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Species <span className="text-red-500">*</span></label>
                                    <div className="flex gap-4 h-14">
                                        {['Dog', 'Cat', 'Other'].map((type) => (
                                            <button 
                                                key={type}
                                                onClick={() => setFormData({...formData, species: type})}
                                                className={`flex-1 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                    formData.species === type ? 'bg-[#F97316] text-white border-[#F97316] shadow-lg shadow-orange-100' : 'bg-white text-gray-400 border-gray-100'
                                                }`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Breed <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" 
                                        className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200"
                                        placeholder="e.g. Aspin / Mixed"
                                        value={formData.breed}
                                        onChange={(e) => setFormData({...formData, breed: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Age / Life Stage <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" 
                                        className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200"
                                        placeholder="e.g. 2 years / Puppy"
                                        value={formData.age}
                                        onChange={(e) => setFormData({...formData, age: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Current Status <span className="text-red-500">*</span></label>
                                    <select 
                                        className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200"
                                        value={formData.status}
                                        onChange={(e) => setFormData({...formData, status: e.target.value})}
                                    >
                                        <option value="Active">Active</option>
                                        <option value="Lost">Lost</option>
                                        <option value="Found">Found</option>
                                        <option value="Rescued">Rescued</option>
                                        <option value="Deceased">Deceased</option>
                                    </select>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Gender <span className="text-red-500">*</span></label>
                                    <div className="flex gap-4 h-14">
                                        {['Male', 'Female'].map((g) => (
                                            <button 
                                                key={g}
                                                onClick={() => setFormData({...formData, gender: g})}
                                                className={`flex-1 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                    formData.gender === g ? 'bg-[#F97316] text-white border-[#F97316]' : 'bg-white text-gray-400 border-gray-100'
                                                }`}
                                            >
                                                {g}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Color / Markings <span className="text-red-500">*</span></label>
                                <input 
                                    type="text" 
                                    className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200"
                                    placeholder="e.g. Brown with white spots"
                                    value={formData.color}
                                    onChange={(e) => setFormData({...formData, color: e.target.value})}
                                />
                            </div>
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Health Conditions & Special Instructions <span className="text-red-500">*</span></label>
                                <textarea 
                                    className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[2rem] p-6 text-sm font-medium focus:outline-none focus:border-orange-200 min-h-[120px]"
                                    placeholder="List any allergies, ongoing medications, or behavioral notes..."
                                    value={formData.condition}
                                    onChange={(e) => setFormData({...formData, condition: e.target.value})}
                                />
                            </div>
                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Pet Photo <span className="text-red-500">*</span></label>
                                <input 
                                    type="file" 
                                    className="w-full text-xs font-bold text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100"
                                    onChange={(e) => setFormData({...formData, mediaFiles: e.target.files ? Array.from(e.target.files) : []})}
                                    accept="image/*"
                                />
                            </div>
                        </div>

                        <div className="p-10 pt-0">
                            <Button
                                disabled={isSubmitting}
                                className={`w-full py-5 text-white text-[12px] font-black uppercase tracking-[0.2em] rounded-[2rem] shadow-xl transition-all ${
                                    isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#F97316] shadow-orange-100 hover:scale-[1.02] active:scale-[0.98]'
                                }`}
                                onClick={handleSubmit}
                            >
                                {isSubmitting ? 'Processing...' : (editingPetId ? 'Update Information' : 'Register Pet')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            <ResiMobileNav 
                isNavbarMenuOpen={isNavbarMenuOpen} 
                isSearchOpen={isMobileSearchOpen}
                onSearchClick={() => setIsMobileSearchOpen(true)}
                onAddReportClick={() => navigate('/resident-home', { state: { openAddModal: true, from: '/resident/pets' } })}
            />
        </div>
    );
};

export default ResidentPet;
