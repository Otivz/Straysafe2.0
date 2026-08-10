import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Button from '../Button';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';

interface AddPetModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface UserOption {
    user_id: number;
    name: string;
    email: string;
    phone?: string | null;
    address?: string | null;
    profile_picture?: string | null;
    role_id?: number;
    subdivision_id?: number | null;
}

const AddPetModal: React.FC<AddPetModalProps> = ({ isOpen, onClose }) => {
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Step 1: Pet Details
    const [petName, setPetName] = useState('');
    const [species, setSpecies] = useState('Dog');
    const [breed, setBreed] = useState('');
    const [estimatedAge, setEstimatedAge] = useState('');
    const [gender, setGender] = useState<'Male' | 'Female'>('Male');
    const [weight, setWeight] = useState('');
    const [colorMarkings, setColorMarkings] = useState('');
    const [isVaccinated, setIsVaccinated] = useState(false);
    const [isNeutered, setIsNeutered] = useState(false);
    const [temperament, setTemperament] = useState('Friendly');
    const [notes, setNotes] = useState('');
    
    // Media files
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [vaccineCardFile, setVaccineCardFile] = useState<File | null>(null);
    const [vaccineCardPreview, setVaccineCardPreview] = useState<string | null>(null);
    
    const petFileInputRef = useRef<HTMLInputElement>(null);
    const vaccineFileInputRef = useRef<HTMLInputElement>(null);

    // Step 2: Owner Information
    const [ownerMode, setOwnerMode] = useState<'existing' | 'new'>('existing');
    
    // Existing owner search & selection
    const [usersList, setUsersList] = useState<UserOption[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<UserOption | null>(null);

    // New owner form
    const [newOwnerName, setNewOwnerName] = useState('');
    const [newOwnerEmail, setNewOwnerEmail] = useState('');
    const [newOwnerPhone, setNewOwnerPhone] = useState('');
    const [newOwnerAddress, setNewOwnerAddress] = useState('');
    const [newOwnerPassword, setNewOwnerPassword] = useState('password123');

    // Fetch existing users when modal opens or ownerMode changes
    useEffect(() => {
        if (isOpen) {
            fetchRegisteredUsers();
        }
    }, [isOpen]);

    const fetchRegisteredUsers = async () => {
        setIsLoadingUsers(true);
        try {
            const response = await axios.get('http://localhost:8000/users');
            setUsersList(response.data);
        } catch (err) {
            console.error('Error fetching registered users:', err);
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFile(file);
            setPhotoPreview(URL.createObjectURL(file));
        }
    };

    const handleVaccineCardSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setVaccineCardFile(file);
            setVaccineCardPreview(URL.createObjectURL(file));
        }
    };

    const resetForm = () => {
        setStep(1);
        setIsSubmitting(false);
        setErrorMessage(null);
        setPetName('');
        setSpecies('Dog');
        setBreed('');
        setEstimatedAge('');
        setGender('Male');
        setWeight('');
        setColorMarkings('');
        setIsVaccinated(false);
        setIsNeutered(false);
        setTemperament('Friendly');
        setNotes('');
        setPhotoFile(null);
        setPhotoPreview(null);
        setVaccineCardFile(null);
        setVaccineCardPreview(null);
        setOwnerMode('existing');
        setSelectedOwner(null);
        setUserSearchTerm('');
        setNewOwnerName('');
        setNewOwnerEmail('');
        setNewOwnerPhone('');
        setNewOwnerAddress('');
        setNewOwnerPassword('password123');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleNextStep = () => {
        setErrorMessage(null);
        if (!petName.trim()) {
            setErrorMessage('Please enter the pet name before proceeding.');
            return;
        }
        setStep(2);
    };

    const handleCompleteRegistration = async () => {
        setErrorMessage(null);

        let targetOwnerId: number | null = null;

        if (ownerMode === 'existing') {
            if (!selectedOwner) {
                setErrorMessage('Please select an existing pet owner from the list or switch to "Create New Owner".');
                return;
            }
            targetOwnerId = selectedOwner.user_id;
        } else {
            // New Owner Mode
            if (!newOwnerName.trim()) {
                setErrorMessage('Please enter the owner\'s full name.');
                return;
            }
            if (!newOwnerEmail.trim()) {
                setErrorMessage('Please enter a valid email address for the new owner.');
                return;
            }

            try {
                setIsSubmitting(true);
                // Create user account for new owner
                const userRes = await axios.post('http://localhost:8000/users/', {
                    name: newOwnerName.trim(),
                    email: newOwnerEmail.trim().toLowerCase(),
                    phone: newOwnerPhone.trim() || null,
                    password: newOwnerPassword || 'password123',
                    role_id: 1, // Resident
                    subdivision_id: 1,
                    barangay: 'San Vicente',
                    city: 'Santa Maria, Bulacan',
                    address: newOwnerAddress.trim() || null,
                    status: 'Active'
                });

                targetOwnerId = userRes.data.user_id;
            } catch (err: any) {
                setIsSubmitting(false);
                const detail = err.response?.data?.detail || 'Failed to create new pet owner account.';
                setErrorMessage(`Error creating owner: ${detail}`);
                return;
            }
        }

        if (!targetOwnerId) {
            setErrorMessage('Unable to determine owner account.');
            return;
        }

        try {
            setIsSubmitting(true);
            // Create Pet
            const petPayload = {
                owner_id: targetOwnerId,
                pet_name: petName.trim(),
                pet_type: species,
                breed: breed.trim() || null,
                estimated_age: estimatedAge.trim() || null,
                gender: gender,
                weight: weight ? parseFloat(weight) : null,
                color_markings: colorMarkings.trim() || null,
                is_vaccinated: isVaccinated,
                is_neutered: isNeutered,
                temperament: temperament,
                notes: notes.trim() || null,
                status: 'Active'
            };

            const petRes = await axios.post('http://localhost:8000/pets/', petPayload);
            const createdPetId = petRes.data.pet_id;

            // Upload Pet Photo if selected
            if (photoFile && createdPetId) {
                const formData = new FormData();
                formData.append('file', photoFile);
                await axios.post(`http://localhost:8000/pets/${createdPetId}/photo`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            // Upload Vaccine Card if selected
            if (vaccineCardFile && createdPetId) {
                const formData = new FormData();
                formData.append('file', vaccineCardFile);
                await axios.post(`http://localhost:8000/pets/${createdPetId}/vaccine-card`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }

            handleClose();
        } catch (err: any) {
            console.error('Error registering pet:', err);
            const detail = err.response?.data?.detail || 'Failed to complete pet registration.';
            setErrorMessage(`Error registering pet: ${detail}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    // Filter users list by search query
    const filteredUsers = usersList.filter(u => 
        u.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        (u.phone && u.phone.includes(userSearchTerm))
    );

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 sm:p-8 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-3xl rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-300 bg-white overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <header className="shrink-0 z-30 bg-white/80 backdrop-blur-md px-8 py-6 flex items-center justify-between border-b border-gray-100">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Register New Pet</h2>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                            Step {step} of 2 • {step === 1 ? 'Pet Details' : 'Owner Information'}
                        </p>
                    </div>
                    <button 
                        onClick={handleClose} 
                        className="w-10 h-10 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-all"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                {/* Error Banner */}
                {errorMessage && (
                    <div className="mx-8 mt-4 p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-700 text-xs font-bold animate-in fade-in duration-200">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span className="flex-1">{errorMessage}</span>
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    {/* STEP 1: PET DETAILS */}
                    {step === 1 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                            
                            {/* Photo Upload Area */}
                            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                                <input 
                                    type="file" 
                                    ref={petFileInputRef} 
                                    accept="image/*" 
                                    onChange={handlePhotoSelect} 
                                    className="hidden" 
                                />
                                <div 
                                    onClick={() => petFileInputRef.current?.click()}
                                    className="w-32 h-32 rounded-[2rem] border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:border-[#B35D25] hover:bg-orange-50 hover:text-[#B35D25] transition-all cursor-pointer group overflow-hidden relative"
                                >
                                    {photoPreview ? (
                                        <img src={photoPreview} alt="Pet Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-1 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-center">Upload Pet<br/>Photo</span>
                                        </>
                                    )}
                                </div>

                                {/* Vaccine Card Upload Option */}
                                <input 
                                    type="file" 
                                    ref={vaccineFileInputRef} 
                                    accept="image/*" 
                                    onChange={handleVaccineCardSelect} 
                                    className="hidden" 
                                />
                                <div 
                                    onClick={() => vaccineFileInputRef.current?.click()}
                                    className="w-32 h-32 rounded-[2rem] border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400 hover:border-[#B35D25] hover:bg-orange-50 hover:text-[#B35D25] transition-all cursor-pointer group overflow-hidden relative"
                                >
                                    {vaccineCardPreview ? (
                                        <img src={vaccineCardPreview} alt="Vaccine Card Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <>
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-1 group-hover:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-center">Vaccine Card<br/>(Optional)</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Pet Name *</label>
                                    <input 
                                        type="text" 
                                        value={petName}
                                        onChange={(e) => setPetName(e.target.value)}
                                        placeholder="e.g. Buddy" 
                                        className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Species</label>
                                    <select 
                                        value={species}
                                        onChange={(e) => setSpecies(e.target.value)}
                                        className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="Dog">Dog (Canine)</option>
                                        <option value="Cat">Cat (Feline)</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Breed</label>
                                    <input 
                                        type="text" 
                                        value={breed}
                                        onChange={(e) => setBreed(e.target.value)}
                                        placeholder="e.g. Golden Retriever / Aspin" 
                                        className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Estimated Age</label>
                                    <input 
                                        type="text" 
                                        value={estimatedAge}
                                        onChange={(e) => setEstimatedAge(e.target.value)}
                                        placeholder="e.g. 2 Years 4 Months" 
                                        className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Gender</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button 
                                            type="button"
                                            onClick={() => setGender('Male')}
                                            className={`py-3.5 rounded-2xl text-sm font-black transition-all ${gender === 'Male' ? 'bg-[#B35D25] text-white shadow-md shadow-orange-900/10' : 'bg-white border-2 border-gray-100 text-gray-600 hover:border-[#B35D25]'}`}
                                        >
                                            Male
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setGender('Female')}
                                            className={`py-3.5 rounded-2xl text-sm font-black transition-all ${gender === 'Female' ? 'bg-[#B35D25] text-white shadow-md shadow-orange-900/10' : 'bg-white border-2 border-gray-100 text-gray-600 hover:border-[#B35D25]'}`}
                                        >
                                            Female
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Weight (kg)</label>
                                    <input 
                                        type="number" 
                                        step="0.1"
                                        value={weight}
                                        onChange={(e) => setWeight(e.target.value)}
                                        placeholder="e.g. 12.5" 
                                        className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Color / Markings</label>
                                    <input 
                                        type="text" 
                                        value={colorMarkings}
                                        onChange={(e) => setColorMarkings(e.target.value)}
                                        placeholder="e.g. White patch on chest, brown fur" 
                                        className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all" 
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Temperament</label>
                                    <select 
                                        value={temperament}
                                        onChange={(e) => setTemperament(e.target.value)}
                                        className="w-full px-5 py-3.5 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 focus:bg-white focus:border-[#B35D25] focus:ring-2 focus:ring-[#B35D25]/20 outline-none transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="Friendly">Friendly</option>
                                        <option value="Playful">Playful</option>
                                        <option value="Timid">Timid / Shy</option>
                                        <option value="Independent">Independent</option>
                                        <option value="Aggressive">Aggressive / Guard</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Vaccinated?</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button 
                                            type="button"
                                            onClick={() => setIsVaccinated(true)}
                                            className={`py-3.5 rounded-2xl text-sm font-black transition-all ${isVaccinated ? 'bg-teal-600 text-white shadow-md' : 'bg-white border-2 border-gray-100 text-gray-600 hover:border-teal-600'}`}
                                        >
                                            Yes
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setIsVaccinated(false)}
                                            className={`py-3.5 rounded-2xl text-sm font-black transition-all ${!isVaccinated ? 'bg-gray-700 text-white shadow-md' : 'bg-white border-2 border-gray-100 text-gray-600 hover:border-gray-700'}`}
                                        >
                                            No
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Neutered / Spayed?</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button 
                                            type="button"
                                            onClick={() => setIsNeutered(true)}
                                            className={`py-3.5 rounded-2xl text-sm font-black transition-all ${isNeutered ? 'bg-[#B35D25] text-white shadow-md' : 'bg-white border-2 border-gray-100 text-gray-600 hover:border-[#B35D25]'}`}
                                        >
                                            Yes
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setIsNeutered(false)}
                                            className={`py-3.5 rounded-2xl text-sm font-black transition-all ${!isNeutered ? 'bg-gray-700 text-white shadow-md' : 'bg-white border-2 border-gray-100 text-gray-600 hover:border-gray-700'}`}
                                        >
                                            No
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: OWNER SELECTION / CREATION */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                            
                            {/* Mode Selection Tabs */}
                            <div className="grid grid-cols-2 gap-3 p-1.5 bg-gray-100 rounded-2xl border border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOwnerMode('existing');
                                        setErrorMessage(null);
                                    }}
                                    className={`py-3 px-4 rounded-xl text-xs font-black transition-all uppercase tracking-wider flex items-center justify-center gap-2 ${ownerMode === 'existing' ? 'bg-white text-[#B35D25] shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Select Existing Resident
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOwnerMode('new');
                                        setErrorMessage(null);
                                    }}
                                    className={`py-3 px-4 rounded-xl text-xs font-black transition-all uppercase tracking-wider flex items-center justify-center gap-2 ${ownerMode === 'new' ? 'bg-[#B35D25] text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                    </svg>
                                    Create New Owner
                                </button>
                            </div>

                            {/* OPTION A: SELECT EXISTING OWNER */}
                            {ownerMode === 'existing' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Search Resident Account</label>
                                        <button 
                                            type="button"
                                            onClick={() => setOwnerMode('new')}
                                            className="text-[10px] font-black text-[#B35D25] hover:underline uppercase tracking-wider"
                                        >
                                            + Owner not listed? Create new
                                        </button>
                                    </div>

                                    {/* Search Input */}
                                    <div className="relative">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            placeholder="Search resident by name, email or phone..."
                                            value={userSearchTerm}
                                            onChange={(e) => setUserSearchTerm(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] outline-none transition-all"
                                        />
                                    </div>

                                    {/* Users Selection List */}
                                    {isLoadingUsers ? (
                                        <div className="py-8 text-center text-xs font-bold text-gray-400 animate-pulse">
                                            Loading resident accounts...
                                        </div>
                                    ) : filteredUsers.length === 0 ? (
                                        <div className="p-8 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                            <p className="text-xs font-bold text-gray-500">No resident accounts found matching "{userSearchTerm}".</p>
                                            <button
                                                type="button"
                                                onClick={() => setOwnerMode('new')}
                                                className="mt-3 px-4 py-2 bg-[#B35D25] text-white rounded-xl text-xs font-bold hover:bg-[#964E1F] transition-all"
                                            >
                                                Register New Pet Owner
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="max-h-64 overflow-y-auto space-y-2.5 pr-1 custom-scrollbar">
                                            {filteredUsers.map((user) => {
                                                const isSelected = selectedOwner?.user_id === user.user_id;
                                                return (
                                                    <div
                                                        key={user.user_id}
                                                        onClick={() => setSelectedOwner(user)}
                                                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${isSelected ? 'border-[#B35D25] bg-orange-50/60 shadow-sm ring-2 ring-[#B35D25]/20' : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50/50'}`}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <img 
                                                                src={getProfilePicture(user.profile_picture)} 
                                                                alt={user.name} 
                                                                className="w-10 h-10 rounded-full object-cover border border-gray-200 shrink-0" 
                                                                onError={(e) => { e.currentTarget.src = DEFAULT_AVATAR; }}
                                                            />
                                                            <div className="min-w-0">
                                                                <h4 className="text-xs font-black text-gray-900 truncate leading-snug">{user.name}</h4>
                                                                <p className="text-[10px] font-semibold text-gray-500 truncate">{user.email} {user.phone ? `• ${user.phone}` : ''}</p>
                                                            </div>
                                                        </div>
                                                        <div className="shrink-0 pl-2">
                                                            {isSelected ? (
                                                                <span className="w-6 h-6 rounded-full bg-[#B35D25] text-white flex items-center justify-center font-bold text-xs">
                                                                    ✓
                                                                </span>
                                                            ) : (
                                                                <span className="w-6 h-6 rounded-full border border-gray-200 bg-gray-50 text-transparent flex items-center justify-center font-bold text-xs">
                                                                    ✓
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Selected Owner Banner */}
                                    {selectedOwner && (
                                        <div className="p-4 bg-teal-50 border border-teal-100 rounded-2xl flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-teal-600 text-white flex items-center justify-center font-black text-xs">
                                                    ✓
                                                </div>
                                                <div>
                                                    <span className="text-[9px] font-black text-teal-800 uppercase tracking-widest block">Selected Pet Owner</span>
                                                    <span className="text-xs font-extrabold text-teal-900">{selectedOwner.name} ({selectedOwner.email})</span>
                                                </div>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => setSelectedOwner(null)}
                                                className="text-[10px] font-bold text-gray-400 hover:text-red-500 uppercase tracking-wider"
                                            >
                                                Change
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* OPTION B: CREATE NEW OWNER */}
                            {ownerMode === 'new' && (
                                <div className="space-y-4">
                                    <div className="p-3.5 bg-orange-50/70 border border-orange-100 rounded-2xl flex items-start gap-3">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#B35D25] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <p className="text-[11px] font-semibold text-gray-700 leading-relaxed">
                                            This will automatically create a resident account in StraySafe for the owner with default password <span className="font-bold font-mono text-gray-900 bg-white px-1.5 py-0.5 rounded border border-orange-200">password123</span>.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="col-span-1 md:col-span-2 space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Owner Full Name *</label>
                                            <input 
                                                type="text" 
                                                value={newOwnerName}
                                                onChange={(e) => setNewOwnerName(e.target.value)}
                                                placeholder="e.g. Maria Santos" 
                                                className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] outline-none transition-all" 
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Email Address *</label>
                                            <input 
                                                type="email" 
                                                value={newOwnerEmail}
                                                onChange={(e) => setNewOwnerEmail(e.target.value)}
                                                placeholder="maria.santos@gmail.com" 
                                                className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] outline-none transition-all" 
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Phone Number</label>
                                            <input 
                                                type="tel" 
                                                value={newOwnerPhone}
                                                onChange={(e) => setNewOwnerPhone(e.target.value)}
                                                placeholder="0917 123 4567" 
                                                className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] outline-none transition-all" 
                                            />
                                        </div>
                                        <div className="col-span-1 md:col-span-2 space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Residential Address</label>
                                            <textarea 
                                                rows={2} 
                                                value={newOwnerAddress}
                                                onChange={(e) => setNewOwnerAddress(e.target.value)}
                                                placeholder="House / Lot No., Street Address within Subdivision..." 
                                                className="w-full px-5 py-3 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-[#B35D25] outline-none transition-all resize-none"
                                            ></textarea>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>

                {/* Footer / Actions */}
                <footer className="shrink-0 z-30 bg-gray-50 px-8 py-5 flex items-center justify-between border-t border-gray-100">
                    <button 
                        type="button"
                        onClick={() => step > 1 ? setStep(step - 1) : handleClose()} 
                        disabled={isSubmitting}
                        className="px-6 py-2.5 text-sm font-black text-gray-500 hover:text-gray-800 transition-colors disabled:opacity-50"
                    >
                        {step === 1 ? 'Cancel' : 'Back'}
                    </button>
                    
                    {step === 1 ? (
                        <Button 
                            variant="primary" 
                            onClick={handleNextStep}
                            className="px-8 py-2.5 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-xl shadow-lg shadow-orange-900/10 font-black text-sm transition-all flex items-center gap-2"
                        >
                            Next Step
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
                            </svg>
                        </Button>
                    ) : (
                        <Button 
                            variant="primary" 
                            onClick={handleCompleteRegistration}
                            disabled={isSubmitting}
                            className="px-8 py-2.5 bg-[#B35D25] hover:bg-[#964E1F] text-white rounded-xl shadow-lg shadow-orange-900/10 font-black text-sm transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Registering...
                                </>
                            ) : (
                                <>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Complete Registration
                                </>
                            )}
                        </Button>
                    )}
                </footer>

            </div>
        </div>
    );
};

export default AddPetModal;
