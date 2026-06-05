import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Button from '../../components/Button';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import { type PetRecord } from '../../components/PetRecords/types';

// Real client-side image color analyzer using HTML5 Canvas
const analyzeImageColors = (file: File): Promise<string> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        
        img.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                // Downscale to 40x40 for fast processing and soft average noise smoothing
                canvas.width = 40;
                canvas.height = 40;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve("Brown");
                    return;
                }
                
                ctx.drawImage(img, 0, 0, 40, 40);
                const imgData = ctx.getImageData(0, 0, 40, 40);
                const data = imgData.data;
                
                let blackCount = 0;
                let whiteCount = 0;
                let goldenCount = 0;
                let brownCount = 0;
                let grayCount = 0;
                let totalPixels = 0;
                
                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i+1];
                    const b = data[i+2];
                    const a = data[i+3];
                    
                    // Skip transparent/extremely dark alpha values
                    if (a < 128) continue;
                    totalPixels++;
                    
                    const max = Math.max(r, g, b);
                    const min = Math.min(r, g, b);
                    const diff = max - min;
                    
                    // 1. Black: very low RGB values
                    if (r < 65 && g < 65 && b < 65) {
                        blackCount++;
                    }
                    // 2. White: very high RGB values and low color saturation difference
                    else if (r > 190 && g > 190 && b > 185 && diff < 30) {
                        whiteCount++;
                    }
                    // 3. Golden/Yellow: High red and green, low blue
                    else if (r > 160 && g > 125 && b < 130 && r > g && g > b && diff > 30) {
                        goldenCount++;
                    }
                    // 4. Brown/Tan: Moderate red/green, low blue, reddish hue
                    else if (r > 60 && g > 40 && b < r - 15 && diff > 15) {
                        if (r > 130 && g > 100 && b < 70) {
                            goldenCount++;
                        } else {
                            brownCount++;
                        }
                    }
                    // 5. Gray: neutral middle-range colors
                    else if (max > 65 && max < 190 && diff < 20) {
                        grayCount++;
                    }
                }
                
                const colorFrequencies = [
                    { name: "Black", count: blackCount },
                    { name: "White", count: whiteCount },
                    { name: "Golden", count: goldenCount },
                    { name: "Brown", count: brownCount },
                    { name: "Gray", count: grayCount }
                ];
                
                // Sort by pixel frequency descending
                colorFrequencies.sort((a, b) => b.count - a.count);
                
                const threshold = totalPixels * 0.15; // requires at least 15% of pixels
                
                const primary = colorFrequencies[0];
                const secondary = colorFrequencies[1];
                
                const primaryName = primary.count > 0 ? primary.name : "Brown";
                const secondaryName = (secondary && secondary.count > threshold) ? secondary.name : "None";
                
                let formatResult = primaryName;
                if (secondaryName !== "None") {
                    formatResult += `, ${secondaryName}`;
                }
                resolve(formatResult);
            } catch (err) {
                console.error("Image analysis failed, falling back to default:", err);
                resolve("Brown");
            }
        };
        
        img.onerror = () => {
            resolve("Brown");
        };
    });
};

const ResidentPet = () => {
    const navigate = useNavigate();
    const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pets, setPets] = useState<any[]>([]);
    const [editingPetId, setEditingPetId] = useState<number | null>(null);
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);

    const transformToPetRecord = (pet: any): PetRecord => {
        return {
            id: pet.pet_id?.toString() || '0',
            name: pet.pet_name || 'Unknown',
            gender: pet.gender || 'Male',
            age: pet.estimated_age || 'Unknown',
            breed: pet.breed || pet.pet_type || 'Unknown',
            species: pet.pet_type || 'Unknown',
            ownerName: currentUser ? currentUser.name : 'Unknown Owner',
            ownerEmail: currentUser ? currentUser.email : 'No Email',
            ownerPhone: pet.emergency_contact_phone || (currentUser ? currentUser.phone : 'No Contact'),
            idNumber: `P-${(pet.pet_id || 0).toString().padStart(5, '0')}`,
            status: pet.status || 'Active',
            avatar: pet.photo_url || 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?q=80&w=400&auto=format&fit=crop',
            weight: pet.weight ? `${pet.weight}kg` : 'Unknown',
            colorMarkings: pet.color_markings || 'Unknown',
            sizeCategory: pet.size_category || 'Medium',
            isVaccinated: pet.is_vaccinated || false,
            vaccinationDate: pet.vaccination_date || null,
            isNeutered: pet.is_neutered || false,
            temperament: pet.temperament || 'Friendly',
            hasBiteHistory: pet.has_bite_history === null ? null : pet.has_bite_history,
            chaseBehavior: pet.chase_behavior === null ? null : pet.chase_behavior,
            healthCondition: pet.health_condition || 'Healthy and active',
            notes: pet.notes || '',
            vaccineCardUrl: pet.vaccine_card_url || null,
            rawPetObj: pet
        };
    };

    const [formData, setFormData] = useState({
        name: '',
        species: 'Dog',
        breed: '',
        gender: 'Male',
        color: '',
        age: '',
        status: 'Active',
        weight: '',
        mediaFiles: [] as File[],
        isVaccinated: true,
        vaccinationDate: '2026-05-10',
        isNeutered: true,
        healthNotes: '',
        vaccineCardFiles: [] as File[],
        temperament: 'Friendly',
        hasBiteHistory: null as boolean | null,
        chaseBehavior: null as boolean | null,
        existingVaccineCardUrl: null as string | null
    });

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All Pets');
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const [breedsData, setBreedsData] = useState<any[]>([]);
    const [breedImageUrl, setBreedImageUrl] = useState<string | null>(null);
    const [isFetchingBreedImage, setIsFetchingBreedImage] = useState(false);

    const [aiSuggestedSpecies, setAiSuggestedSpecies] = useState<string | null>(null);
    const [aiSuggestedColor, setAiSuggestedColor] = useState<string | null>(null);
    const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
    const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        setFormData({ ...formData, mediaFiles: files });
        setFormErrors({ ...formErrors, photo: false });
        
        if (files.length > 0) {
            setIsAnalyzingPhoto(true);
            setAiSuggestedSpecies(null);
            setAiSuggestedColor(null);
            
            const file = files[0];
            const fileName = file.name.toLowerCase();
            
            // Basic species detection from filename
            let suggestedSpecies = 'Dog';
            if (fileName.includes('cat') || fileName.includes('kitten') || fileName.includes('meow') || fileName.includes('siamese') || fileName.includes('puspin')) {
                suggestedSpecies = 'Cat';
            } else {
                suggestedSpecies = 'Dog';
            }
            
            try {
                // Perform REAL image pixel color analysis using HTML5 canvas
                const suggestedColor = await analyzeImageColors(file);
                
                // Retain visual interactive analysis delay for enhanced UX
                setTimeout(() => {
                    setAiSuggestedSpecies(suggestedSpecies);
                    setAiSuggestedColor(suggestedColor);
                    setIsAnalyzingPhoto(false);
                }, 850);
            } catch (err) {
                console.error("Failed to analyze uploaded photo:", err);
                setTimeout(() => {
                    setAiSuggestedSpecies(suggestedSpecies);
                    setAiSuggestedColor("Brown");
                    setIsAnalyzingPhoto(false);
                }, 850);
            }
        }
    };

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

    useEffect(() => {
        const fetchBreedData = async () => {
            const url = formData.species === 'Dog' 
              ? 'https://api.thedogapi.com/v1/breeds' 
              : 'https://api.thecatapi.com/v1/breeds';
              
            const apiKey = formData.species === 'Dog'
              ? (import.meta.env.VITE_DOG_API_KEY || 'live_J9RdXZq7OGRCUigDyq3y8rGqcG3Brarp46ohljsIMO572q0KYcW1alD0z88OADKs')
              : (import.meta.env.VITE_CAT_API_KEY || 'live_GqD4rtVuossncqXxRcSvcmptrS9rD7NFoigE6UP59wNG69yZ0YhLh35HRma3ZbEm');

            try {
              const headers: Record<string, string> = {};
              if (apiKey) {
                headers['x-api-key'] = apiKey;
              }
              const res = await fetch(url, { headers });
              if (res.ok) {
                const data = await res.json();
                setBreedsData(data);
              }
            } catch (err) {
              console.error('Failed to load breed images:', err);
              setBreedsData([]);
            }
        };
        fetchBreedData();
    }, [formData.species]);

    useEffect(() => {
        const query = formData.breed.trim().toLowerCase();
        if (!query || breedsData.length === 0) {
            setBreedImageUrl(null);
            return;
        }

        // Standardize common phonetic typos and shortcuts
        const normalizedQuery = query
            .replace('dalmation', 'dalmatian')
            .replace('shihtzu', 'shih tzu')
            .replace('shepard', 'shepherd')
            .replace('coly', 'collie');

        const matchedBreed = breedsData.find((b) => {
            const breedName = b.name.toLowerCase();
            if (breedName === normalizedQuery) return true;
            if (normalizedQuery.length >= 3) {
                return breedName.includes(normalizedQuery) || normalizedQuery.includes(breedName);
            }
            return false;
        });

        if (!matchedBreed) {
            setBreedImageUrl(null);
            return;
        }

        if (matchedBreed.image?.url) {
            setBreedImageUrl(matchedBreed.image.url);
        } else if (matchedBreed.id) {
            // Fetch dynamically from images search
            const fetchImage = async () => {
                setIsFetchingBreedImage(true);
                try {
                    const isDog = formData.species === 'Dog';
                    const baseUrl = isDog ? 'https://api.thedogapi.com' : 'https://api.thecatapi.com';
                    const apiKey = isDog 
                        ? (import.meta.env.VITE_DOG_API_KEY || 'live_J9RdXZq7OGRCUigDyq3y8rGqcG3Brarp46ohljsIMO572q0KYcW1alD0z88OADKs')
                        : (import.meta.env.VITE_CAT_API_KEY || 'live_GqD4rtVuossncqXxRcSvcmptrS9rD7NFoigE6UP59wNG69yZ0YhLh35HRma3ZbEm');
                    
                    const res = await fetch(`${baseUrl}/v1/images/search?breed_id=${matchedBreed.id}`, {
                        headers: apiKey ? { 'x-api-key': apiKey } : {}
                    });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.length > 0 && data[0].url) {
                            setBreedImageUrl(data[0].url);
                        } else {
                            setBreedImageUrl(null);
                        }
                    } else {
                        setBreedImageUrl(null);
                    }
                } catch (err) {
                    console.error('Error fetching breed image:', err);
                    setBreedImageUrl(null);
                } finally {
                    setIsFetchingBreedImage(false);
                }
            };
            fetchImage();
        } else {
            setBreedImageUrl(null);
        }
    }, [formData.breed, formData.species, breedsData]);

    const filteredPets = pets.filter(pet => {
        const query = searchQuery.toLowerCase();
        const matchesQuery = 
            pet.pet_name.toLowerCase().includes(query) ||
            (pet.breed || '').toLowerCase().includes(query) ||
            (pet.pet_type || '').toLowerCase().includes(query) ||
            (pet.status || '').toLowerCase().includes(query);

        const matchesStatus = 
            statusFilter === 'All Pets' ||
            (pet.status || '').toLowerCase() === statusFilter.toLowerCase();

        return matchesQuery && matchesStatus;
    });

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

        // Reset errors
        setFormErrors({});
        setSubmitErrorMessage(null);

        const errors: Record<string, boolean> = {};
        if (!formData.name.trim()) errors.name = true;
        if (!formData.breed.trim()) errors.breed = true;
        if (!formData.age.trim()) errors.age = true;

        const hasPhoto = formData.mediaFiles.length > 0;
        if (!editingPetId && !hasPhoto) {
            errors.photo = true;
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors);
            setSubmitErrorMessage('Please complete the important required fields before registering your pet.');
            
            // Scroll modal to top so they see the reminder
            const scrollContainer = document.querySelector('.custom-scrollbar');
            if (scrollContainer) {
                scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
            }
            return;
        }

        setIsSubmitting(true);
        try {
            const petData = {
                pet_name: formData.name,
                pet_type: formData.species,
                breed: formData.breed,
                gender: formData.gender,
                color_markings: formData.color.trim() || null,
                estimated_age: formData.age,
                status: formData.status,
                health_condition: formData.healthNotes.trim() || 'Healthy and active',
                weight: formData.weight ? parseFloat(formData.weight) : null,
                is_vaccinated: formData.isVaccinated,
                vaccination_date: formData.isVaccinated && formData.vaccinationDate ? formData.vaccinationDate : null,
                is_neutered: formData.isNeutered,
                notes: null,
                temperament: formData.temperament,
                has_bite_history: formData.hasBiteHistory,
                chase_behavior: formData.chaseBehavior,
                owner_id: currentUser.user_id,
                emergency_contact_phone: currentUser.phone
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

            // Handle vaccine card upload if any
            if (formData.vaccineCardFiles.length > 0) {
                const petId = editingPetId || response.data.pet_id;
                const uploadData = new FormData();
                uploadData.append('file', formData.vaccineCardFiles[0]);
                await axios.post(`http://localhost:8000/pets/${petId}/vaccine-card`, uploadData, {
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
                weight: '',
                mediaFiles: [],
                isVaccinated: true,
                vaccinationDate: '2026-05-10',
                isNeutered: true,
                healthNotes: '',
                vaccineCardFiles: [],
                temperament: 'Friendly',
                hasBiteHistory: null,
                chaseBehavior: null,
                existingVaccineCardUrl: null
            });
            setAiSuggestedSpecies(null);
            setAiSuggestedColor(null);
            setFormErrors({});
            setSubmitErrorMessage(null);
        } catch (error) {
            console.error('Error saving pet:', error);
            alert('Failed to save pet information.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditPetFromProfile = (petRecord: PetRecord) => {
        const petObj = petRecord.rawPetObj;
        if (!petObj) return;
        
        setSelectedPet(null); // Close the detail panel
        
        setEditingPetId(petObj.pet_id);
        setFormData({
            name: petObj.pet_name || '',
            species: petObj.pet_type || 'Dog',
            breed: petObj.breed || '',
            gender: petObj.gender || 'Male',
            color: petObj.color_markings || '',
            age: petObj.estimated_age || '',
            status: petObj.status || 'Active',
            weight: petObj.weight ? petObj.weight.toString() : '',
            mediaFiles: [],
            isVaccinated: petObj.is_vaccinated || false,
            vaccinationDate: petObj.vaccination_date || '2026-05-10',
            isNeutered: petObj.is_neutered || false,
            healthNotes: petObj.health_condition === 'Healthy and active' ? '' : petObj.health_condition || '',
            vaccineCardFiles: [],
            temperament: petObj.temperament || 'Friendly',
            hasBiteHistory: petObj.has_bite_history === null ? null : petObj.has_bite_history,
            chaseBehavior: petObj.chase_behavior === null ? null : petObj.chase_behavior,
            existingVaccineCardUrl: petObj.vaccine_card_url || null
        });
        
        setAiSuggestedSpecies(null);
        setAiSuggestedColor(null);
        setFormErrors({});
        setSubmitErrorMessage(null);
        
        setIsAddPetModalOpen(true);
    };

    const handleReportLostFromProfile = async (petRecord: PetRecord) => {
        const petObj = petRecord.rawPetObj;
        if (!petObj) return;
        if (window.confirm("Are you sure you want to mark this pet as LOST? This will alert subdivision leaders and notify your neighborhood.")) {
            try {
                setSelectedPet(null);
                await axios.put(`http://localhost:8000/pets/${petObj.pet_id}`, {
                    status: 'Lost'
                });
                fetchPets();
                alert("Pet marked as LOST. Neighborhood alerts dispatched successfully.");
            } catch (error) {
                console.error("Failed to mark pet as lost:", error);
                alert("Failed to update status.");
            }
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
                {/* Title & Register Action Button */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
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
                                weight: '',
                                mediaFiles: [],
                                isVaccinated: true,
                                vaccinationDate: '2026-05-10',
                                isNeutered: true,
                                healthNotes: '',
                                vaccineCardFiles: [],
                                temperament: 'Friendly',
                                hasBiteHistory: null,
                                chaseBehavior: null,
                                existingVaccineCardUrl: null
                            });
                            setAiSuggestedSpecies(null);
                            setAiSuggestedColor(null);
                            setFormErrors({});
                            setSubmitErrorMessage(null);
                            setIsAddPetModalOpen(true);
                        }}
                        className="bg-[#F97316] text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-orange-200 hover:scale-105 transition-all flex items-center gap-3 cursor-pointer"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                        </svg>
                        Register New Pet
                    </Button>
                </div>

                {/* Premium Custom Search & Status Filter Bar */}
                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl p-6 sm:p-8 mb-10">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        {/* Search Input & Info */}
                        <div className="flex-1 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-black text-[#F97316] bg-orange-50 px-3 py-1 rounded-full uppercase tracking-widest">Search:</span>
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <span>pet name</span>
                                    <span className="text-gray-300">|</span>
                                    <span>breed</span>
                                    <span className="text-gray-300">|</span>
                                    <span>status</span>
                                </div>
                            </div>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                                    <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="🔍 Search pets..."
                                    className="block w-full pl-12 pr-6 py-4 bg-[#FAFAF9] border border-gray-100 rounded-2xl font-bold text-sm text-[#1a1208] placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#F97316]/10 focus:border-[#F97316] transition-all"
                                />
                            </div>
                        </div>

                        {/* Status Filter Dropdown */}
                        <div className="w-full md:w-64 space-y-3">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest block pl-1">Filter by Status</span>
                            <div className="relative">
                                <select
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                    className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 pr-10 text-xs font-black uppercase tracking-widest text-[#1a1208] focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#F97316]/10 focus:border-[#F97316] transition-all cursor-pointer appearance-none"
                                >
                                    <option value="All Pets">All Pets</option>
                                    <option value="Active">Active</option>
                                    <option value="Lost">Lost</option>
                                    <option value="Found">Found</option>
                                    <option value="Rescued">Rescued</option>
                                    <option value="Deceased">Deceased</option>
                                </select>
                                <div className="absolute inset-y-0 right-0 pr-4 flex items-center pointer-events-none text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                    </div>
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
                            <div key={pet.pet_id} className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-300 group flex flex-col justify-between">
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
                                            pet.status === 'Healthy' || pet.status === 'Active' ? 'bg-green-50 text-green-600 border-green-100' :
                                            pet.status === 'Under Treatment' || pet.status === 'Lost' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                            'bg-red-50 text-red-600 border-red-100'
                                        }`}>
                                            {pet.status}
                                        </span>
                                    </div>
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                                    <div className="absolute bottom-4 left-6">
                                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">{pet.pet_name}</h2>
                                    </div>
                                </div>
                                <div className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-gray-50 rounded-2xl p-3 text-center">
                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Breed</p>
                                            <p className="text-xs font-black text-[#1a1208] uppercase truncate">{pet.breed || pet.pet_type}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-2xl p-3 text-center">
                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Sex</p>
                                            <p className="text-xs font-black text-[#1a1208] uppercase">{pet.gender}</p>
                                        </div>
                                    </div>
                                    <div className="pt-4 flex gap-3 border-t border-gray-50">
                                        <button 
                                            onClick={() => setSelectedPet(transformToPetRecord(pet))}
                                            className="flex-1 py-3.5 bg-orange-50 hover:bg-orange-100 text-[#F97316] text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer text-center"
                                        >
                                            View Profile
                                        </button>
                                        <button 
                                            onClick={() => handleDeletePet(pet.pet_id)}
                                            className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors cursor-pointer"
                                            title="Remove Pet"
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
                <div className="fixed top-20 bottom-20 left-0 right-0 md:inset-0 z-[300] flex items-stretch md:items-center justify-center p-0 md:p-4 pb-0 md:pb-4">
                    <div 
                        className="hidden md:block absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300"
                        onClick={() => setIsAddPetModalOpen(false)}
                    />
                    <div className="relative w-full h-full md:h-auto md:max-w-2xl bg-white rounded-none md:rounded-[3rem] shadow-none md:shadow-2xl overflow-hidden flex flex-col animate-in md:zoom-in-95 md:slide-in-from-bottom-10 duration-500">
                        <div className="px-6 md:px-10 pt-6 md:pt-10 pb-4 md:pb-6 flex justify-between items-center border-b border-gray-50">
                            <div>
                                <h2 className="text-2xl md:text-3xl font-black text-[#1a1208] uppercase tracking-tight">{editingPetId ? 'Update Pet Info' : 'Register New Pet'}</h2>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Keep your pet's records up to date for safety</p>
                            </div>
                            <button onClick={() => setIsAddPetModalOpen(false)} className="p-3 bg-gray-50 text-gray-400 hover:text-[#1a1208] rounded-2xl transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="p-6 md:p-10 space-y-8 flex-1 md:max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {submitErrorMessage && (
                                <div className="bg-red-50 border-2 border-dashed border-red-200 rounded-[2rem] p-6 flex items-start gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                                    <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 shadow-sm">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="text-xs font-black text-red-700 uppercase tracking-widest leading-none">Incomplete Registration</p>
                                        <p className="text-xs font-bold text-red-600 leading-normal">Please complete the important required fields before registering your pet.</p>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                            {formErrors.name && <span className="text-[9px] font-black text-red-600 bg-white border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Pet Name</span>}
                                            {formErrors.breed && <span className="text-[9px] font-black text-red-600 bg-white border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Breed</span>}
                                            {formErrors.age && <span className="text-[9px] font-black text-red-600 bg-white border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Estimated Age</span>}
                                            {formErrors.photo && <span className="text-[9px] font-black text-red-600 bg-white border border-red-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Pet Photo</span>}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Section 1: Core Information */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Pet Name <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" 
                                        className={`w-full h-14 bg-[#FAFAF9] border rounded-2xl px-6 text-sm font-bold focus:outline-none transition-all ${
                                            formErrors.name 
                                            ? 'border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 bg-red-50/10' 
                                            : 'border-gray-100 focus:border-orange-200 focus:ring-4 focus:ring-[#F97316]/10'
                                        }`}
                                        placeholder="e.g. Bruno"
                                        value={formData.name}
                                        onChange={(e) => {
                                            setFormData({...formData, name: e.target.value});
                                            if (formErrors.name) setFormErrors({...formErrors, name: false});
                                        }}
                                    />
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Species <span className="text-red-500">*</span></label>
                                    <div className="flex gap-4 h-14">
                                        {['Dog', 'Cat'].map((type) => (
                                            <button 
                                                key={type}
                                                type="button"
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
                                        list="pet-breed-suggestions"
                                        className={`w-full h-14 bg-[#FAFAF9] border rounded-2xl px-6 text-sm font-bold focus:outline-none transition-all ${
                                            formErrors.breed 
                                            ? 'border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 bg-red-50/10' 
                                            : 'border-gray-100 focus:border-orange-200 focus:ring-4 focus:ring-[#F97316]/10'
                                        }`}
                                        placeholder="e.g. Aspin / Mixed"
                                        value={formData.breed}
                                        onChange={(e) => {
                                            setFormData({...formData, breed: e.target.value});
                                            if (formErrors.breed) setFormErrors({...formErrors, breed: false});
                                        }}
                                    />
                                    <datalist id="pet-breed-suggestions">
                                        {formData.species === 'Dog' ? (
                                            <>
                                                <option value="Aspin" />
                                                {breedsData.length > 0 ? (
                                                    breedsData.map((b: any) => (
                                                        <option key={b.id || b.name} value={b.name} />
                                                    ))
                                                ) : (
                                                    <>
                                                        <option value="Shih Tzu" />
                                                        <option value="Shihtzu" />
                                                        <option value="Chihuahua" />
                                                        <option value="Golden Retriever" />
                                                        <option value="Siberian Husky" />
                                                        <option value="Bulldog" />
                                                        <option value="Poodle" />
                                                        <option value="German Shepherd" />
                                                        <option value="Terrier" />
                                                        <option value="Pug" />
                                                    </>
                                                )}
                                                <option value="Mixed Breed" />
                                            </>
                                        ) : (
                                            <>
                                                <option value="Puspin" />
                                                {breedsData.length > 0 ? (
                                                    breedsData.map((b: any) => (
                                                        <option key={b.id || b.name} value={b.name} />
                                                    ))
                                                ) : (
                                                    <>
                                                        <option value="Siamese" />
                                                        <option value="Persian" />
                                                        <option value="Maine Coon" />
                                                        <option value="Bengal" />
                                                        <option value="Ragdoll" />
                                                        <option value="Sphynx" />
                                                        <option value="British Shorthair" />
                                                    </>
                                                )}
                                                <option value="Mixed Breed" />
                                            </>
                                        )}
                                    </datalist>

                                    {/* Dynamic Breed Thumbnail Preview */}
                                    {(() => {
                                        const query = formData.breed.trim().toLowerCase();
                                        if (!query) return null;

                                        // Standardize common phonetic typos and shortcuts
                                        const normalizedQuery = query
                                            .replace('dalmation', 'dalmatian')
                                            .replace('shihtzu', 'shih tzu')
                                            .replace('shepard', 'shepherd')
                                            .replace('coly', 'collie');

                                        const matchedBreed = breedsData.find((b) => {
                                            const breedName = b.name.toLowerCase();
                                            if (breedName === normalizedQuery) return true;
                                            
                                            // Handle smart partial matching when typing is at least 3 characters
                                            if (normalizedQuery.length >= 3) {
                                                return breedName.includes(normalizedQuery) || normalizedQuery.includes(breedName);
                                            }
                                            return false;
                                        });

                                        if (matchedBreed && (breedImageUrl || isFetchingBreedImage)) {
                                            return (
                                                <div className="mt-3 flex items-center gap-3.5 bg-orange-50/40 border border-orange-100 rounded-2xl p-3.5 animate-in slide-in-from-top-2 duration-300">
                                                    {isFetchingBreedImage ? (
                                                        <div className="w-12 h-12 rounded-xl border border-white bg-white/50 flex items-center justify-center shrink-0 shadow-sm">
                                                            <div className="w-4 h-4 border-2 border-[#F97316] border-t-transparent rounded-full animate-spin" />
                                                        </div>
                                                    ) : breedImageUrl ? (
                                                        <img 
                                                            src={breedImageUrl} 
                                                            alt="Breed Preview" 
                                                            className="w-12 h-12 object-cover rounded-xl shadow-sm border border-white shrink-0"
                                                        />
                                                    ) : null}
                                                    <div>
                                                        <p className="text-[9px] font-black text-[#F97316] uppercase tracking-widest leading-none">StraySafe Reference Photo</p>
                                                        <p className="text-[11px] font-black text-[#1a1208] mt-1">{matchedBreed.name} Standard Profile</p>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Age (Estimated Age) <span className="text-red-500">*</span></label>
                                    <input 
                                        type="text" 
                                        className={`w-full h-14 bg-[#FAFAF9] border rounded-2xl px-6 text-sm font-bold focus:outline-none transition-all ${
                                            formErrors.age 
                                            ? 'border-red-300 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 bg-red-50/10' 
                                            : 'border-gray-100 focus:border-orange-200 focus:ring-4 focus:ring-[#F97316]/10'
                                        }`}
                                        placeholder="e.g. 2 years / Puppy"
                                        value={formData.age}
                                        onChange={(e) => {
                                            setFormData({...formData, age: e.target.value});
                                            if (formErrors.age) setFormErrors({...formErrors, age: false});
                                        }}
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
                                    <select
                                        className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200 cursor-pointer"
                                        value={formData.gender}
                                        onChange={(e) => setFormData({...formData, gender: e.target.value})}
                                    >
                                        <option value="Male">Male</option>
                                        <option value="Female">Female</option>
                                        <option value="Unknown">Unknown</option>
                                    </select>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Color Markings <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span></label>
                                    <input 
                                        type="text" 
                                        className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200"
                                        placeholder="e.g. Black with white patches"
                                        value={formData.color}
                                        onChange={(e) => setFormData({...formData, color: e.target.value})}
                                    />
                                    {aiSuggestedColor && (
                                        <div className="mt-2.5 flex items-center justify-between bg-orange-50/50 border border-orange-100 rounded-2xl p-3.5 animate-in slide-in-from-top-2 duration-300">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-black text-[#F97316] uppercase tracking-widest bg-white px-2 py-0.5 rounded-md border border-orange-100 shadow-sm leading-none">AI Suggestion</span>
                                                <span className="text-xs font-semibold text-gray-700">Markings: <span className="font-extrabold text-[#1a1208]">{aiSuggestedColor}</span></span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setFormData({ ...formData, color: aiSuggestedColor });
                                                    setAiSuggestedColor(null);
                                                }}
                                                className="px-3.5 py-2 bg-[#F97316] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-md shadow-orange-100 cursor-pointer"
                                            >
                                                Apply
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Weight <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span></label>
                                    <input 
                                        type="text" 
                                        className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200"
                                        placeholder="e.g. 18kg"
                                        value={formData.weight}
                                        onChange={(e) => setFormData({...formData, weight: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Pet Photo <span className="text-red-500">*</span></label>
                                <input 
                                    type="file" 
                                    className={`w-full text-xs font-bold text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest transition-all ${
                                        formErrors.photo 
                                        ? 'file:bg-red-50 file:text-red-600 border border-dashed border-red-200 rounded-2xl p-4 bg-red-50/5' 
                                        : 'file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100'
                                    }`}
                                    onChange={(e) => {
                                        handlePhotoChange(e);
                                        if (formErrors.photo) setFormErrors({...formErrors, photo: false});
                                    }}
                                    accept="image/*"
                                />
                                {isAnalyzingPhoto && (
                                    <div className="flex items-center gap-2 text-xs font-bold text-[#F97316] animate-pulse py-1 pl-1">
                                        <svg className="animate-spin h-4 w-4 text-[#F97316]" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>🔍 AI suggestion analyzing photo details...</span>
                                    </div>
                                )}
                                {!isAnalyzingPhoto && aiSuggestedSpecies && (
                                    <div className="bg-orange-50/50 border border-orange-100 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-2 duration-300">
                                        <div>
                                            <p className="text-[10px] font-black text-[#F97316] uppercase tracking-widest">StraySafe AI Suggestion</p>
                                            <p className="text-xs font-bold text-[#1a1208] mt-0.5">Detected {aiSuggestedSpecies}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormData({
                                                    ...formData,
                                                    species: aiSuggestedSpecies || 'Dog'
                                                });
                                                setAiSuggestedSpecies(null);
                                            }}
                                            className="px-4 py-2 bg-[#F97316] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:scale-105 transition-all shadow-md shadow-orange-100 cursor-pointer"
                                        >
                                            Apply Suggestion
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Health & Vaccination Details */}
                            <div className="border-t border-gray-100 pt-8 space-y-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="h-6 w-1 bg-[#F97316] rounded-full"></span>
                                    <h3 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Health & Vaccination Records</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Vaccinated?</label>
                                        <div className="flex gap-8 h-14 items-center">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="isVaccinated" 
                                                    className="w-5 h-5 accent-[#F97316]" 
                                                    checked={formData.isVaccinated === true} 
                                                    onChange={() => setFormData({...formData, isVaccinated: true})}
                                                />
                                                <span className="text-sm font-bold text-gray-700">Yes</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="isVaccinated" 
                                                    className="w-5 h-5 accent-[#F97316]" 
                                                    checked={formData.isVaccinated === false} 
                                                    onChange={() => setFormData({...formData, isVaccinated: false})}
                                                />
                                                <span className="text-sm font-bold text-gray-700">No</span>
                                            </label>
                                        </div>
                                    </div>

                                    {formData.isVaccinated && (
                                        <div className="space-y-4 animate-in fade-in duration-300">
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Vaccination Date</label>
                                            <input 
                                                type="date" 
                                                className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200"
                                                value={formData.vaccinationDate}
                                                onChange={(e) => setFormData({...formData, vaccinationDate: e.target.value})}
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Neutered?</label>
                                        <div className="flex gap-8 h-14 items-center">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="isNeutered" 
                                                    className="w-5 h-5 accent-[#F97316]" 
                                                    checked={formData.isNeutered === true} 
                                                    onChange={() => setFormData({...formData, isNeutered: true})}
                                                />
                                                <span className="text-sm font-bold text-gray-700">Yes</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="isNeutered" 
                                                    className="w-5 h-5 accent-[#F97316]" 
                                                    checked={formData.isNeutered === false} 
                                                    onChange={() => setFormData({...formData, isNeutered: false})}
                                                />
                                                <span className="text-sm font-bold text-gray-700">No</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="space-y-4 md:col-span-2">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Health Notes / Remarks (Optional)</label>
                                        <textarea 
                                            className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[2rem] p-6 text-sm font-medium focus:outline-none focus:border-orange-200 min-h-[100px]"
                                            placeholder="List any allergies, ongoing medications, or specific health remarks..."
                                            value={formData.healthNotes}
                                            onChange={(e) => setFormData({...formData, healthNotes: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Upload Vaccination Card or Supporting Document (Optional)</label>
                                    <input 
                                        type="file" 
                                        className="w-full text-xs font-bold text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-orange-50 file:text-[#F97316] hover:file:bg-orange-100"
                                        onChange={(e) => setFormData({...formData, vaccineCardFiles: e.target.files ? Array.from(e.target.files) : []})}
                                        accept=".pdf,image/*"
                                    />
                                    {formData.existingVaccineCardUrl && (
                                        <div className="flex items-center gap-2 mt-2 px-4 py-2 bg-orange-50/50 rounded-xl border border-orange-100/50 w-fit animate-in fade-in slide-in-from-top-1 duration-200">
                                            <span className="text-[10px] text-[#F97316] font-black uppercase tracking-wider">✓ Current Document Uploaded</span>
                                            <span className="text-gray-300">|</span>
                                            <a 
                                                href={formData.existingVaccineCardUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="text-[10px] font-black uppercase tracking-widest text-[#B35D25] hover:underline"
                                            >
                                                View Document
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Section 3: Behavior Information */}
                            <div className="border-t border-gray-100 pt-8 space-y-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="h-6 w-1 bg-[#F97316] rounded-full"></span>
                                    <h3 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Behavior Information</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Temperament</label>
                                        <select
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200 cursor-pointer"
                                            value={formData.temperament}
                                            onChange={(e) => setFormData({...formData, temperament: e.target.value})}
                                        >
                                            <option value="Friendly">Friendly</option>
                                            <option value="Aggressive">Aggressive</option>
                                            <option value="Anxious">Anxious</option>
                                            <option value="Scared">Scared</option>
                                            <option value="Protective">Protective</option>
                                        </select>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Has Bite History?</label>
                                        <div className="flex gap-4 h-14 items-center">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="hasBiteHistory" 
                                                    className="w-4 h-4 accent-[#F97316]" 
                                                    checked={formData.hasBiteHistory === true} 
                                                    onChange={() => setFormData({...formData, hasBiteHistory: true})}
                                                />
                                                <span className="text-xs font-bold text-gray-700">Yes</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="hasBiteHistory" 
                                                    className="w-4 h-4 accent-[#F97316]" 
                                                    checked={formData.hasBiteHistory === false} 
                                                    onChange={() => setFormData({...formData, hasBiteHistory: false})}
                                                />
                                                <span className="text-xs font-bold text-gray-700">No</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="hasBiteHistory" 
                                                    className="w-4 h-4 accent-[#F97316]" 
                                                    checked={formData.hasBiteHistory === null} 
                                                    onChange={() => setFormData({...formData, hasBiteHistory: null})}
                                                />
                                                <span className="text-xs font-bold text-gray-700">Not sure</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Chase Behavior?</label>
                                        <div className="flex gap-4 h-14 items-center">
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="chaseBehavior" 
                                                    className="w-4 h-4 accent-[#F97316]" 
                                                    checked={formData.chaseBehavior === true} 
                                                    onChange={() => setFormData({...formData, chaseBehavior: true})}
                                                />
                                                <span className="text-xs font-bold text-gray-700">Yes</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="chaseBehavior" 
                                                    className="w-4 h-4 accent-[#F97316]" 
                                                    checked={formData.chaseBehavior === false} 
                                                    onChange={() => setFormData({...formData, chaseBehavior: false})}
                                                />
                                                <span className="text-xs font-bold text-gray-700">No</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="chaseBehavior" 
                                                    className="w-4 h-4 accent-[#F97316]" 
                                                    checked={formData.chaseBehavior === null} 
                                                    onChange={() => setFormData({...formData, chaseBehavior: null})}
                                                />
                                                <span className="text-xs font-bold text-gray-700">Not sure</span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="p-6 md:p-10 pt-0 shrink-0">
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

            {/* Centered Modal Popup */}
            {selectedPet && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-6 sm:p-12 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full max-w-6xl rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-300 bg-white overflow-hidden flex flex-col max-h-[90vh]">
                        <PetDetailPanel 
                            pet={selectedPet} 
                            onClose={() => setSelectedPet(null)} 
                            hideRegisteredPets={true} 
                            onEditClick={handleEditPetFromProfile}
                            onReportLostClick={handleReportLostFromProfile}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResidentPet;
