import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../../utils/api';
import { DEFAULT_PET_AVATAR, getPetPicture } from '../../utils/avatar';
import Button from '../../components/Button';
import ResiNavbar from '../../components/Navbars/ResiNavbar';
import ResiMobileNav from '../../components/Navbars/ResiMobileNav';
import PetDetailPanel from '../../components/PetRecords/PetDetailPanel';
import { type PetRecord } from '../../components/PetRecords/types';
import ResolveLostPetModal from '../../components/Modals/ResolveLostPetModal';

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

interface PetFormData {
    name: string;
    species: string;
    breed: string;
    gender: string;
    sizeCategory: string;
    primaryColor: string;
    customPrimaryColor: string;
    secondaryColor: string;
    customSecondaryColor: string;
    tertiaryColor: string;
    customTertiaryColor: string;
    color: string;
    age: string;
    status: string;
    weight: string;
    mediaFiles: File[];
    photoFrontFiles: File[];
    photoLeftFiles: File[];
    photoRightFiles: File[];
    isVaccinated: boolean;
    vaccinationDate: string;
    isNeutered: boolean;
    healthNotes: string;
    vaccineCardFiles: File[];
    temperament: string;
    hasBiteHistory: boolean | null;
    chaseBehavior: boolean | null;
    existingVaccineCardUrl: string | null;
}

const INITIAL_PET_FORM_DATA: PetFormData = {
    name: '',
    species: 'Dog',
    breed: '',
    gender: 'Male',
    sizeCategory: 'Medium',
    primaryColor: 'Brown',
    customPrimaryColor: '',
    secondaryColor: '',
    customSecondaryColor: '',
    tertiaryColor: '',
    customTertiaryColor: '',
    color: '',
    age: '',
    status: 'Active',
    weight: '',
    mediaFiles: [],
    photoFrontFiles: [],
    photoLeftFiles: [],
    photoRightFiles: [],
    isVaccinated: true,
    vaccinationDate: '2026-05-10',
    isNeutered: true,
    healthNotes: '',
    vaccineCardFiles: [],
    temperament: 'Friendly',
    hasBiteHistory: null,
    chaseBehavior: null,
    existingVaccineCardUrl: null
};

interface AiAnalysisSummary {
    species: string;
    breed: string;
    colors: string[];
    primaryColor: string;
    secondaryColor: string;
    tertiaryColor: string;
    pattern?: string;
    size?: string;
    message?: string;
}

const PRESET_PRIMARY_COLORS = ['Brown', 'Black', 'White', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream', 'Red'];
const PRESET_SECONDARY_COLORS = ['White', 'Black', 'Brown', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream'];
const PRESET_TERTIARY_COLORS = ['White', 'Black', 'Brown', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream'];

const matchColorOption = (raw: string, presets: string[]): { selected: string; custom: string } => {
    if (!raw || ['none', 'unknown', 'null', ''].includes(raw.toLowerCase())) {
        return { selected: '', custom: '' };
    }
    const matched = presets.find(p => p.toLowerCase() === raw.toLowerCase());
    if (matched) {
        return { selected: matched, custom: '' };
    }
    return { selected: 'Other', custom: raw };
};

const ResidentPet = () => {
    const navigate = useNavigate();
    const [isAddPetModalOpen, setIsAddPetModalOpen] = useState(false);
    const [isNavbarMenuOpen, setIsNavbarMenuOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [pets, setPets] = useState<any[]>([]);
    const [editingPetId, setEditingPetId] = useState<number | null>(null);
    const [selectedPet, setSelectedPet] = useState<PetRecord | null>(null);

    // Warning Acknowledgment State
    const [pendingWarning, setPendingWarning] = useState<any>(null);
    const [showWarningModal, setShowWarningModal] = useState(false);

    const fetchMyWarnings = async () => {
        try {
            const res = await api.get('/warnings/my-warnings');
            const pending = (res.data || []).filter((w: any) => w.status === 'Pending');
            if (pending.length > 0) {
                setPendingWarning(pending[0]);
            } else {
                setPendingWarning(null);
            }
        } catch (err) {
            console.error('Error fetching warnings:', err);
        }
    };

    useEffect(() => {
        fetchMyWarnings();
    }, []);

    const handleAcknowledgeWarning = async () => {
        if (!pendingWarning) return;
        try {
            await api.patch(`/warnings/${pendingWarning.warning_id}/acknowledge`);
            setPendingWarning(null);
            setShowWarningModal(false);
            fetchMyWarnings();
        } catch (err: any) {
            console.error('Failed to acknowledge warning:', err);
            alert(err.response?.data?.detail || 'Failed to acknowledge warning.');
        }
    };

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
            avatar: getPetPicture(pet.photo_url),
            weight: pet.weight ? `${pet.weight}kg` : 'Unknown',
            primaryColor: pet.primary_color || 'Brown',
            secondaryColor: pet.secondary_color || '',
            tertiaryColor: pet.tertiary_color || '',
            colorMarkings: pet.color_markings || pet.distinctive_markings || 'None',
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

    const [formData, setFormData] = useState<PetFormData>(INITIAL_PET_FORM_DATA);

    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('All Pets');
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const [reportingLostPet, setReportingLostPet] = useState<PetRecord | null>(null);
    const [resolvingLostPet, setResolvingLostPet] = useState<any | null>(null);
    const [isSubmittingLostReport, setIsSubmittingLostReport] = useState(false);
    const [lostPetForm, setLostPetForm] = useState({
        lastSeenAt: '',
        landmark: '',
        latitude: 14.801313,
        longitude: 121.003109,
        collarDetails: '',
        circumstances: '',
        reward: '',
        contactName: '',
        contactPhone: '',
        additionalNotes: ''
    });
    const [breedsData, setBreedsData] = useState<any[]>([]);
    const [breedImageUrl, setBreedImageUrl] = useState<string | null>(null);
    const [isFetchingBreedImage, setIsFetchingBreedImage] = useState(false);

    const [aiAnalysisSummary, setAiAnalysisSummary] = useState<AiAnalysisSummary | null>(null);
    const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
    const [formErrors, setFormErrors] = useState<Record<string, boolean>>({});
    const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(null);

    const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        setFormData((prev) => ({ ...prev, mediaFiles: files }));
        setFormErrors((prev) => ({ ...prev, photo: false }));
        
        if (files.length > 0) {
            setIsAnalyzingPhoto(true);
            setAiAnalysisSummary(null);
            
            const file = files[0];
            
            try {
                const mediaData = new FormData();
                mediaData.append("file", file);
                const res = await axios.post('http://localhost:8000/reports/analyze-media', mediaData);
                
                if (res.status === 200 && res.data) {
                    const ai = res.data;
                    const isDetected = ai.animal_detected !== false && !['unknown', 'none', ''].includes((ai.animal_type || '').toLowerCase());
                    
                    if (isDetected) {
                        const normSpecies = ['Dog', 'Cat'].includes(ai.animal_type)
                            ? ai.animal_type 
                            : (ai.animal_type?.toLowerCase().includes('cat') ? 'Cat' : 'Dog');
                            
                        const p1Match = matchColorOption(ai.primary_color, PRESET_PRIMARY_COLORS);
                        const finalPrimary = p1Match.selected || 'Brown';
                        const finalCustomPrimary = finalPrimary === 'Other' ? (p1Match.custom || ai.primary_color) : '';
                        
                        const p2Match = matchColorOption(ai.secondary_color, PRESET_SECONDARY_COLORS);
                        const p3Match = matchColorOption(ai.tertiary_color, PRESET_TERTIARY_COLORS);
                        
                        const detectedBreed = ai.possible_breed && ai.possible_breed !== 'Unknown' 
                            ? ai.possible_breed 
                            : (normSpecies === 'Cat' ? 'Puspin' : 'Aspin');
                            
                        const detectedSize = ['Small', 'Medium', 'Large'].includes(ai.estimated_size)
                            ? ai.estimated_size
                            : (normSpecies === 'Cat' ? 'Small' : 'Medium');

                        const colorSummaryList: string[] = [];
                        if (ai.primary_color && ai.primary_color !== 'Unknown') colorSummaryList.push(ai.primary_color);
                        if (ai.secondary_color && !['none', 'unknown', ''].includes(ai.secondary_color.toLowerCase())) colorSummaryList.push(ai.secondary_color);
                        if (ai.tertiary_color && !['none', 'unknown', ''].includes(ai.tertiary_color.toLowerCase())) colorSummaryList.push(ai.tertiary_color);

                        setFormData(prev => ({
                            ...prev,
                            species: normSpecies,
                            breed: detectedBreed,
                            sizeCategory: detectedSize,
                            primaryColor: finalPrimary,
                            customPrimaryColor: finalCustomPrimary,
                            secondaryColor: p2Match.selected,
                            customSecondaryColor: p2Match.custom,
                            tertiaryColor: p3Match.selected,
                            customTertiaryColor: p3Match.custom,
                            color: ai.coat_pattern && ai.coat_pattern !== 'Solid' && ai.coat_pattern !== 'Unknown' ? `${ai.coat_pattern} coat` : prev.color
                        }));

                        setAiAnalysisSummary({
                            species: normSpecies,
                            breed: detectedBreed,
                            colors: colorSummaryList.length > 0 ? colorSummaryList : [finalPrimary],
                            primaryColor: finalPrimary === 'Other' ? finalCustomPrimary : finalPrimary,
                            secondaryColor: p2Match.selected === 'Other' ? p2Match.custom : p2Match.selected,
                            tertiaryColor: p3Match.selected === 'Other' ? p3Match.custom : p3Match.selected,
                            pattern: ai.coat_pattern || '',
                            size: detectedSize,
                            message: ai.message
                        });
                    } else {
                        // Fallback to client-side color analyzer
                        const suggestedColor = await analyzeImageColors(file);
                        const p1Match = matchColorOption(suggestedColor, PRESET_PRIMARY_COLORS);
                        const finalPrimary = p1Match.selected || 'Brown';
                        const finalCustomPrimary = finalPrimary === 'Other' ? (p1Match.custom || suggestedColor) : '';
                        
                        setFormData(prev => ({
                            ...prev,
                            primaryColor: finalPrimary,
                            customPrimaryColor: finalCustomPrimary
                        }));

                        setAiAnalysisSummary({
                            species: formData.species || 'Dog',
                            breed: formData.species === 'Cat' ? 'Puspin' : 'Aspin',
                            colors: [suggestedColor],
                            primaryColor: finalPrimary === 'Other' ? finalCustomPrimary : finalPrimary,
                            secondaryColor: '',
                            tertiaryColor: '',
                            pattern: '',
                            size: formData.sizeCategory || 'Medium',
                            message: 'Color detected from photo.'
                        });
                    }
                }
            } catch (err) {
                console.warn("Backend AI media analysis error, falling back to client-side analyzer:", err);
                try {
                    const suggestedColor = await analyzeImageColors(file);
                    const p1Match = matchColorOption(suggestedColor, PRESET_PRIMARY_COLORS);
                    const finalPrimary = p1Match.selected || 'Brown';
                    const finalCustomPrimary = finalPrimary === 'Other' ? (p1Match.custom || suggestedColor) : '';
                    
                    setFormData(prev => ({
                        ...prev,
                        primaryColor: finalPrimary,
                        customPrimaryColor: finalCustomPrimary
                    }));

                    setAiAnalysisSummary({
                        species: formData.species || 'Dog',
                        breed: formData.species === 'Cat' ? 'Puspin' : 'Aspin',
                        colors: [suggestedColor],
                        primaryColor: finalPrimary === 'Other' ? finalCustomPrimary : finalPrimary,
                        secondaryColor: '',
                        tertiaryColor: '',
                        pattern: '',
                        size: formData.sizeCategory || 'Medium',
                        message: 'Color detected from photo.'
                    });
                } catch (fallbackErr) {
                    console.error("Failed to analyze uploaded photo:", fallbackErr);
                }
            } finally {
                setIsAnalyzingPhoto(false);
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
        const petStatus = (pet.status || '').toLowerCase();
        if (petStatus === 'archived' || petStatus === 'inactive') {
            return false;
        }

        const query = searchQuery.toLowerCase();
        const matchesQuery = 
            pet.pet_name.toLowerCase().includes(query) ||
            (pet.breed || '').toLowerCase().includes(query) ||
            (pet.pet_type || '').toLowerCase().includes(query) ||
            (pet.status || '').toLowerCase().includes(query);

        const matchesStatus = 
            statusFilter === 'All Pets' ||
            petStatus === statusFilter.toLowerCase();

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
            const effectivePrimary = formData.primaryColor === 'Other'
                ? (formData.customPrimaryColor.trim() || 'Other')
                : formData.primaryColor;

            const effectiveSecondary = formData.secondaryColor === 'Other'
                ? (formData.customSecondaryColor.trim() || 'Other')
                : formData.secondaryColor;

            const effectiveTertiary = formData.tertiaryColor === 'Other'
                ? (formData.customTertiaryColor.trim() || 'Other')
                : formData.tertiaryColor;

            const petData = {
                pet_name: formData.name,
                pet_type: formData.species,
                breed: formData.breed,
                gender: formData.gender,
                size_category: formData.sizeCategory || 'Medium',
                primary_color: effectivePrimary,
                secondary_color: effectiveSecondary || null,
                tertiary_color: effectiveTertiary || null,
                color_markings: formData.color.trim() || null,
                distinctive_markings: formData.color.trim() || null,
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

            // Handle side-view photo uploads
            const petId = editingPetId || response.data.pet_id;
            if (formData.photoFrontFiles.length > 0) {
                const fd = new FormData();
                fd.append('file', formData.photoFrontFiles[0]);
                await axios.post(`http://localhost:8000/pets/${petId}/photo-front`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }
            if (formData.photoLeftFiles.length > 0) {
                const fd = new FormData();
                fd.append('file', formData.photoLeftFiles[0]);
                await axios.post(`http://localhost:8000/pets/${petId}/photo-left`, fd, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            }
            if (formData.photoRightFiles.length > 0) {
                const fd = new FormData();
                fd.append('file', formData.photoRightFiles[0]);
                await axios.post(`http://localhost:8000/pets/${petId}/photo-right`, fd, {
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
            setFormData(INITIAL_PET_FORM_DATA);
            setAiAnalysisSummary(null);
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

        const presetPrimary = ['Brown', 'Black', 'White', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream', 'Red'];
        const rawPrimary = petObj.primary_color || 'Brown';
        const isPrimaryPreset = presetPrimary.includes(rawPrimary);

        const presetSecondary = ['White', 'Black', 'Brown', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream'];
        const rawSecondary = petObj.secondary_color || '';
        const isSecondaryPreset = !rawSecondary || presetSecondary.includes(rawSecondary);

        const presetTertiary = ['White', 'Black', 'Brown', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream'];
        const rawTertiary = petObj.tertiary_color || '';
        const isTertiaryPreset = !rawTertiary || rawTertiary === 'None' || presetTertiary.includes(rawTertiary);
        
        setEditingPetId(petObj.pet_id);
        setFormData({
            name: petObj.pet_name || '',
            species: petObj.pet_type || 'Dog',
            breed: petObj.breed || '',
            gender: petObj.gender || 'Male',
            sizeCategory: petObj.size_category || 'Medium',
            primaryColor: isPrimaryPreset ? rawPrimary : 'Other',
            customPrimaryColor: isPrimaryPreset ? '' : rawPrimary,
            secondaryColor: isSecondaryPreset ? rawSecondary : (rawSecondary ? 'Other' : ''),
            customSecondaryColor: isSecondaryPreset ? '' : rawSecondary,
            tertiaryColor: isTertiaryPreset ? (rawTertiary === 'None' ? '' : rawTertiary) : (rawTertiary ? 'Other' : ''),
            customTertiaryColor: isTertiaryPreset ? '' : rawTertiary,
            color: petObj.color_markings || petObj.distinctive_markings || '',
            age: petObj.estimated_age || '',
            status: petObj.status || 'Active',
            weight: petObj.weight ? petObj.weight.toString() : '',
            mediaFiles: [],
            photoFrontFiles: [],
            photoLeftFiles: [],
            photoRightFiles: [],
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
        
        setAiAnalysisSummary(null);
        setFormErrors({});
        setSubmitErrorMessage(null);
        
        setIsAddPetModalOpen(true);
    };

    const handleOpenReportLostForm = (petRecord: PetRecord) => {
        const petObj = petRecord.rawPetObj;
        if (!petObj) return;

        setSelectedPet(null);

        const userStr = localStorage.getItem('resident_user');
        const currentUser = userStr ? JSON.parse(userStr) : null;
        
        // Default to local datetime
        const now = new Date();
        const localDatetime = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

        setLostPetForm({
            lastSeenAt: localDatetime,
            landmark: petObj.registered_address || 'Selera Homes Phase 1',
            latitude: petObj.registered_latitude ? Number(petObj.registered_latitude) : 14.801313,
            longitude: petObj.registered_longitude ? Number(petObj.registered_longitude) : 121.003109,
            collarDetails: petObj.distinctive_markings || petObj.color_markings || '',
            circumstances: '',
            reward: '',
            contactName: currentUser?.name || petObj.owner_name || '',
            contactPhone: currentUser?.phone || petObj.emergency_contact_phone || '',
            additionalNotes: ''
        });

        setReportingLostPet(petRecord);
    };

    const handleReportLostFromProfile = handleOpenReportLostForm;

    const handleSubmitLostPetReport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!reportingLostPet || !reportingLostPet.rawPetObj) return;
        const petObj = reportingLostPet.rawPetObj;

        if (!lostPetForm.landmark.trim()) {
            alert('Please specify the landmark or area where the pet was last seen.');
            return;
        }
        if (!lostPetForm.contactPhone.trim()) {
            alert('Please provide a contact phone number so finders can reach you.');
            return;
        }

        setIsSubmittingLostReport(true);
        try {
            // 1. Update pet status in DB to 'Lost' with last seen location and time
            await api.put(`/pets/${petObj.pet_id}`, {
                status: 'Lost',
                last_seen_lat: lostPetForm.latitude,
                last_seen_lng: lostPetForm.longitude,
                last_seen_at: lostPetForm.lastSeenAt ? new Date(lostPetForm.lastSeenAt).toISOString() : new Date().toISOString()
            });

            // 2. Build report payload with rich details
            const storedUserId = localStorage.getItem('user_id');
            const userStr = localStorage.getItem('resident_user');
            const currentUser = userStr ? JSON.parse(userStr) : null;
            const userId = storedUserId ? parseInt(storedUserId) : (petObj.owner_id || 1);
            const storedSubdId = localStorage.getItem('subdivision_id');
            const subdId = storedSubdId ? parseInt(storedSubdId) : (petObj.subdivision_id || 1);

            const colorDesc = `${petObj.primary_color || ''}${petObj.secondary_color ? ' and ' + petObj.secondary_color : ''}${petObj.tertiary_color ? ' and ' + petObj.tertiary_color : ''}`.trim() || 'Brown';
            const ownerName = lostPetForm.contactName.trim() || petObj.owner_name || currentUser?.name || 'Registered Owner';
            const ownerPhone = lostPetForm.contactPhone.trim() || petObj.owner_phone || currentUser?.phone || 'Available in StraySafe';
            const qrInfo = petObj.qr_code_hash ? ` [QR Tag: ${petObj.qr_code_hash}]` : '';

            let desc = `[LOST PET REPORT] Missing registered pet: ${reportingLostPet.name}${qrInfo}.\n\n` +
                `• Species & Breed: ${petObj.pet_type || 'Pet'} - ${petObj.breed || 'Unknown'}\n` +
                `• Color & Markings: ${colorDesc}` + (lostPetForm.collarDetails ? ` | ${lostPetForm.collarDetails}` : '') + `\n` +
                `• Contact Person: ${ownerName} (${ownerPhone})\n` +
                `• Last Seen: ${lostPetForm.lastSeenAt ? new Date(lostPetForm.lastSeenAt).toLocaleString() : 'Recently'} around ${lostPetForm.landmark}\n`;

            if (lostPetForm.circumstances.trim()) {
                desc += `• Loss Circumstances & Notes: ${lostPetForm.circumstances.trim()}\n`;
            }
            if (lostPetForm.reward.trim()) {
                desc += `• Reward: ${lostPetForm.reward.trim()}\n`;
            }
            if (lostPetForm.additionalNotes.trim()) {
                desc += `• Additional Instructions: ${lostPetForm.additionalNotes.trim()}\n`;
            }
            desc += `\nIf you see this pet, please immediately call ${ownerName} at ${ownerPhone} or scan the pet's StraySafe QR tag!`;

            const res = await api.post('/reports/', {
                user_id: userId,
                subdivision_id: subdId,
                pet_id: petObj.pet_id,
                category_id: 6,
                animal_type: petObj.pet_type || 'Dog',
                animal_breed: petObj.breed || '',
                animal_color: colorDesc,
                estimated_size: petObj.size_category || (petObj.weight ? `${petObj.weight} kg` : 'Medium'),
                description: desc,
                landmark: lostPetForm.landmark.trim() || 'Selera Homes',
                latitude: lostPetForm.latitude || 14.801313,
                longitude: lostPetForm.longitude || 121.003109,
                priority_level: 'High',
                visibility: 'Public',
                is_possible_owned: true,
                status_id: 1
            });

            const createdReportId = res.data?.report_id;
            fetchPets();
            setReportingLostPet(null);

            if (createdReportId && window.confirm(`${reportingLostPet.name} has been marked as LOST and an alert was broadcasted to your neighborhood.\n\nWould you like to view the created report now?`)) {
                navigate(`/resident/reports/${createdReportId}`);
            } else {
                alert(`${reportingLostPet.name} has been marked as LOST and an official report has been filed.`);
            }
        } catch (error: any) {
            console.error("Failed to mark pet as lost and file report:", error);
            const errDetail = error.response?.data?.detail;
            alert(errDetail || "Failed to submit lost pet report. Please try again.");
        } finally {
            setIsSubmittingLostReport(false);
        }
    };

    const handleReuniteAndSetActive = async (petObj: any) => {
        const confirmed = window.confirm(`Has ${petObj.pet_name} safely returned home? This will set ${petObj.pet_name}'s status back to ACTIVE and resolve any open search reports.`);
        if (!confirmed) return;

        try {
            await api.put(`/pets/${petObj.pet_id}`, { status: 'Active' });
            
            // If there's an active report for this pet, mark as Claimed by Owner (9)
            try {
                const res = await api.get('/reports/', { params: { limit: 50 } });
                const reports = res.data?.reports || res.data || [];
                const matched = reports.find((r: any) => r.pet_id === petObj.pet_id && ![9, 10, 11, 12].includes(r.status_id));
                if (matched) {
                    await api.patch(`/reports/${matched.report_id}/status`, {
                        status_id: 9,
                        remarks: `${petObj.pet_name} has safely returned home and owner confirmed reunion. Pet status updated to Active.`
                    });
                }
            } catch (err) {
                console.error("Failed to sync report status:", err);
            }

            fetchPets();
            alert(`🎉 Wonderful news! ${petObj.pet_name} is now marked as ACTIVE.`);
        } catch (err) {
            console.error("Error setting pet to active:", err);
            alert("Failed to update pet status. Please check your connection and try again.");
        }
    };

    return (
        <div className={`min-h-screen bg-[#FAFAF9] dark:bg-[#121212] text-[#1a1208] dark:text-gray-100 transition-colors duration-200 font-sans pb-24 ${isMobileSearchOpen ? 'overflow-hidden h-screen' : ''}`}>
            <ResiNavbar 
                onMenuToggle={(isOpen) => setIsNavbarMenuOpen(isOpen)} 
                onSearch={setSearchQuery}
                searchValue={searchQuery}
                isMobileSearchOpen={isMobileSearchOpen}
                onCloseSearch={() => setIsMobileSearchOpen(false)}
            />

            <main className="max-w-6xl mx-auto p-4 sm:p-8 pt-24 sm:pt-32">

                {/* Citizen Alert Banner Removed as per user request */}

                {/* Warning Acknowledgment Modal */}
                {showWarningModal && pendingWarning && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
                        <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-300">
                            <div className="p-8 pb-6 flex flex-col items-center border-b border-gray-50 bg-gradient-to-b from-yellow-50/50 to-white">
                                <div className="w-20 h-20 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-4xl mb-4 shadow-sm border-4 border-white">
                                    ⚠️
                                </div>
                                <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tight text-center">Subdivision Notice</h3>
                                <p className="text-[10px] font-black text-yellow-600 uppercase tracking-widest mt-1 bg-yellow-100 px-3 py-1 rounded-full">
                                    {pendingWarning.warning_level}
                                </p>
                            </div>
                            <div className="p-8 space-y-6">
                                <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                                    <div className="space-y-4">
                                        <div className="flex justify-between items-center border-b border-gray-150 pb-3">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Pet Name</span>
                                            <span className="text-xs font-black text-gray-900">{pendingWarning.pet_name}</span>
                                        </div>
                                        <div className="flex justify-between items-center border-b border-gray-150 pb-3">
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Violation</span>
                                            <span className="text-xs font-black text-red-600">{pendingWarning.violation_type}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Remarks</span>
                                            <p className="text-xs font-semibold text-gray-700 leading-relaxed bg-white p-4 rounded-xl border border-gray-100">
                                                {pendingWarning.description}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex items-start gap-3 bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                    <input type="checkbox" id="ack" className="mt-1 w-5 h-5 rounded border-gray-300 text-blue-500 focus:ring-blue-500" required />
                                    <label htmlFor="ack" className="text-[11px] font-semibold text-gray-700 leading-relaxed">
                                        I acknowledge receipt of this warning. I understand that repeated violations may result in escalation to the Barangay or HOA management.
                                    </label>
                                </div>

                                <button
                                    onClick={handleAcknowledgeWarning}
                                    className="w-full py-4 bg-[#1a1208] hover:bg-black text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl active:scale-[0.98]"
                                >
                                    ACKNOWLEDGE NOTICE
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Title & Action Buttons */}
                <div className="flex flex-row justify-between items-center mb-6 sm:mb-8 gap-3 sm:gap-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="text-2xl sm:text-4xl font-black text-[#1a1208] uppercase tracking-tight sm:tracking-tighter leading-tight">
                            My Family <span className="text-[#F97316]">Pets</span>
                        </h1>
                        <p className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-wider sm:tracking-widest mt-0.5 sm:mt-2 line-clamp-1 sm:line-clamp-none">
                            Manage your pets' health and identification records
                        </p>
                    </div>
                    <div className="flex items-center shrink-0">
                        <Button
                            variant="primary"
                            onClick={() => {
                                setEditingPetId(null);
                                setFormData(INITIAL_PET_FORM_DATA);
                                setAiAnalysisSummary(null);
                                setFormErrors({});
                                setSubmitErrorMessage(null);
                                setIsAddPetModalOpen(true);
                            }}
                            className="bg-[#F97316] text-white px-3.5 py-2.5 sm:px-8 sm:py-4 rounded-xl sm:rounded-2xl font-black uppercase tracking-wider sm:tracking-widest text-[10px] sm:text-xs shadow-md sm:shadow-lg shadow-orange-200 hover:scale-105 transition-all flex items-center gap-1.5 sm:gap-3 cursor-pointer whitespace-nowrap"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="sm:hidden">Register Pet</span>
                            <span className="hidden sm:inline">Register New Pet</span>
                        </Button>
                    </div>
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
                                    <img 
                                        src={getPetPicture(pet.photo_url)} 
                                        alt={pet.pet_name} 
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                                        onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                    />
                                    <div className="absolute top-4 right-4 flex gap-2">
                                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${
                                            pet.status === 'Active' || pet.status === 'Healthy' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                            pet.status === 'Found' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                            pet.status === 'Rescued' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                            pet.status === 'Lost' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                            pet.status === 'Deceased' ? 'bg-stone-100 text-stone-600 border-stone-200' :
                                            'bg-gray-50 text-gray-600 border-gray-200'
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
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="bg-gray-50 rounded-2xl p-2.5 text-center">
                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Breed</p>
                                            <p className="text-xs font-black text-[#1a1208] uppercase truncate">{pet.breed || pet.pet_type}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-2xl p-2.5 text-center">
                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Sex</p>
                                            <p className="text-xs font-black text-[#1a1208] uppercase">{pet.gender || 'Unknown'}</p>
                                        </div>
                                        <div className="bg-gray-50 rounded-2xl p-2.5 text-center">
                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Size</p>
                                            <p className="text-xs font-black text-[#1a1208] uppercase">{pet.size_category || 'Medium'}</p>
                                        </div>
                                    </div>
                                    <div className="pt-4 flex gap-2 border-t border-gray-50">
                                        <button 
                                            onClick={() => setSelectedPet(transformToPetRecord(pet))}
                                            className="flex-1 py-3 bg-orange-50 hover:bg-orange-100 text-[#F97316] text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer text-center"
                                        >
                                            View Profile
                                        </button>
                                        {pet.status?.toLowerCase() === 'deceased' ? (
                                            <span className="px-3.5 py-3 bg-stone-100 text-stone-500 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1.5 border border-stone-200" title="Deceased pet record is archived">
                                                <span>🕊️</span>
                                                Archived
                                            </span>
                                        ) : pet.status?.toLowerCase() === 'lost' ? (
                                            <button 
                                                onClick={() => setResolvingLostPet(pet)}
                                                className="px-3.5 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-emerald-200 shadow-2xs"
                                                title="Resolve Lost Pet Case"
                                            >
                                                <span>🏠</span>
                                                Resolve Case
                                            </button>
                                        ) : (pet.status?.toLowerCase() === 'found' || pet.status?.toLowerCase() === 'rescued') ? (
                                            <button 
                                                onClick={() => handleReuniteAndSetActive(pet)}
                                                className="px-3.5 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-blue-200 shadow-2xs"
                                                title="Confirm Reunion & Set Status Back to Active"
                                            >
                                                <span>🏠</span>
                                                Set as Active
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => handleReportLostFromProfile(transformToPetRecord(pet))}
                                                className="px-3.5 py-3 bg-red-50 hover:bg-red-100 text-red-600 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer flex items-center gap-1.5 border border-red-100 shadow-2xs"
                                                title="Report Lost Pet"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                Report Lost
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => handleDeletePet(pet.pet_id)}
                                            className="p-3 bg-gray-50 text-gray-400 hover:text-red-500 rounded-xl hover:bg-red-50 transition-colors cursor-pointer"
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

                            {/* Section 1: Pet Photos & AI Recognition */}
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="h-6 w-1 bg-[#F97316] rounded-full"></span>
                                        <h3 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Pet Photos</h3>
                                        <span className="text-[9px] font-black text-[#F97316] bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full uppercase tracking-wider">AI Powered</span>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400">Photo auto-fills details</span>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Pet Photo (Primary) <span className="text-red-500">*</span></label>
                                    
                                    {formData.mediaFiles && formData.mediaFiles.length > 0 ? (
                                        <div className="relative rounded-2xl overflow-hidden border-2 border-orange-200 bg-orange-50/20 p-3.5 flex flex-col sm:flex-row items-center gap-4">
                                            <img 
                                                src={URL.createObjectURL(formData.mediaFiles[0])} 
                                                alt="Selected pet" 
                                                className="w-24 h-24 object-cover rounded-2xl shadow-md shrink-0 border border-orange-100" 
                                            />
                                            <div className="flex-1 space-y-1 text-center sm:text-left min-w-0">
                                                <p className="text-xs font-black text-[#1a1208] uppercase tracking-tight truncate">{formData.mediaFiles[0].name}</p>
                                                <p className="text-[10px] font-bold text-gray-400">{(formData.mediaFiles[0].size / 1024).toFixed(1)} KB • AI Analyzed</p>
                                                <label className="inline-block mt-1 text-[10px] font-black text-[#F97316] uppercase tracking-wider hover:underline cursor-pointer">
                                                    Change Photo
                                                    <input 
                                                        type="file" 
                                                        className="hidden" 
                                                        accept="image/*" 
                                                        onChange={(e) => {
                                                            handlePhotoChange(e);
                                                            if (formErrors.photo) setFormErrors({...formErrors, photo: false});
                                                        }} 
                                                    />
                                                </label>
                                            </div>
                                            <button 
                                                type="button" 
                                                onClick={() => {
                                                    setFormData(prev => ({ ...prev, mediaFiles: [] }));
                                                    setAiAnalysisSummary(null);
                                                }} 
                                                className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-50 hover:bg-red-100 px-3.5 py-2 rounded-xl transition-colors cursor-pointer"
                                            >
                                                ✕ Remove
                                            </button>
                                        </div>
                                    ) : (
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
                                    )}

                                    {isAnalyzingPhoto && (
                                        <div className="flex items-center gap-3 text-xs font-bold text-[#F97316] bg-orange-50/80 border border-orange-200/70 rounded-2xl p-4 animate-pulse">
                                            <svg className="animate-spin h-5 w-5 text-[#F97316] shrink-0" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest text-[#F97316]">AI Recognition Active</p>
                                                <p className="text-xs font-bold text-[#1a1208]">Identifying animal breed, coat colors, and details...</p>
                                            </div>
                                        </div>
                                    )}

                                    {!isAnalyzingPhoto && aiAnalysisSummary && (
                                        <div className="bg-gradient-to-br from-orange-50/90 via-amber-50/60 to-white border border-orange-200/80 rounded-2xl p-4 shadow-sm animate-in slide-in-from-top-2 duration-300">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[9px] font-black uppercase tracking-widest bg-[#F97316] text-white px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                                                            <span>✨</span> AI Recognition
                                                        </span>
                                                        <span className="text-xs font-extrabold text-[#1a1208]">
                                                            {aiAnalysisSummary.species} • {aiAnalysisSummary.breed}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                                        {aiAnalysisSummary.colors && aiAnalysisSummary.colors.map((c, i) => (
                                                            <span key={i} className="text-[10px] font-bold bg-white text-gray-700 border border-orange-200/60 px-2 py-0.5 rounded-lg shadow-2xs">
                                                                🎨 {c}
                                                            </span>
                                                        ))}
                                                        {aiAnalysisSummary.size && (
                                                            <span className="text-[10px] font-bold bg-white text-gray-700 border border-orange-200/60 px-2 py-0.5 rounded-lg shadow-2xs">
                                                                📏 {aiAnalysisSummary.size} Size
                                                            </span>
                                                        )}
                                                        {aiAnalysisSummary.pattern && aiAnalysisSummary.pattern !== 'Solid' && (
                                                            <span className="text-[10px] font-bold bg-white text-gray-700 border border-orange-200/60 px-2 py-0.5 rounded-lg shadow-2xs">
                                                                🏷️ {aiAnalysisSummary.pattern}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] font-bold text-[#F97316] flex items-center gap-1">
                                                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                        Species, breed, colors, and size were automatically applied to your form.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setAiAnalysisSummary(null)}
                                                    className="text-gray-400 hover:text-gray-600 text-xs p-1 rounded-lg hover:bg-orange-100/50 transition-colors"
                                                    title="Dismiss"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Multi-Angle Identification Photos */}
                                <div className="pt-2 space-y-4">
                                    <div className="flex items-center gap-2 mb-1">
                                        <h4 className="text-[10px] font-black text-[#1a1208] uppercase tracking-widest">Multi-Angle Identification Photos</h4>
                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">Optional</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 leading-relaxed">Upload photos of your pet from different angles. These are used to improve identification accuracy when your pet is reported missing or found.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                        {/* Front Photo */}
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-[#1a1208] uppercase tracking-widest flex items-center gap-2">
                                                <span className="w-5 h-5 rounded-lg bg-orange-100 text-[#F97316] flex items-center justify-center text-[8px] font-black shrink-0">F</span>
                                                Front View
                                            </label>
                                            <label className={`flex flex-col items-center justify-center h-32 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                                                formData.photoFrontFiles.length > 0
                                                    ? 'border-[#F97316] bg-orange-50/40'
                                                    : 'border-gray-200 bg-[#FAFAF9] hover:border-orange-200 hover:bg-orange-50/20'
                                            }`}>
                                                {formData.photoFrontFiles.length > 0 ? (
                                                    <img
                                                        src={URL.createObjectURL(formData.photoFrontFiles[0])}
                                                        alt="Front preview"
                                                        className="w-full h-full object-cover rounded-2xl"
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 text-gray-400">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Tap to upload</span>
                                                    </div>
                                                )}
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => setFormData({...formData, photoFrontFiles: e.target.files ? Array.from(e.target.files) : []})}
                                                />
                                            </label>
                                            {formData.photoFrontFiles.length > 0 && (
                                                <button type="button" onClick={() => setFormData({...formData, photoFrontFiles: []})} className="text-[9px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 transition-colors cursor-pointer">✕ Remove</button>
                                            )}
                                        </div>

                                        {/* Left Side Photo */}
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-[#1a1208] uppercase tracking-widest flex items-center gap-2">
                                                <span className="w-5 h-5 rounded-lg bg-orange-100 text-[#F97316] flex items-center justify-center text-[8px] font-black shrink-0">L</span>
                                                Left Side
                                            </label>
                                            <label className={`flex flex-col items-center justify-center h-32 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                                                formData.photoLeftFiles.length > 0
                                                    ? 'border-[#F97316] bg-orange-50/40'
                                                    : 'border-gray-200 bg-[#FAFAF9] hover:border-orange-200 hover:bg-orange-50/20'
                                            }`}>
                                                {formData.photoLeftFiles.length > 0 ? (
                                                    <img
                                                        src={URL.createObjectURL(formData.photoLeftFiles[0])}
                                                        alt="Left side preview"
                                                        className="w-full h-full object-cover rounded-2xl"
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 text-gray-400">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Tap to upload</span>
                                                    </div>
                                                )}
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => setFormData({...formData, photoLeftFiles: e.target.files ? Array.from(e.target.files) : []})}
                                                />
                                            </label>
                                            {formData.photoLeftFiles.length > 0 && (
                                                <button type="button" onClick={() => setFormData({...formData, photoLeftFiles: []})} className="text-[9px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 transition-colors cursor-pointer">✕ Remove</button>
                                            )}
                                        </div>

                                        {/* Right Side Photo */}
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-[#1a1208] uppercase tracking-widest flex items-center gap-2">
                                                <span className="w-5 h-5 rounded-lg bg-orange-100 text-[#F97316] flex items-center justify-center text-[8px] font-black shrink-0">R</span>
                                                Right Side
                                            </label>
                                            <label className={`flex flex-col items-center justify-center h-32 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
                                                formData.photoRightFiles.length > 0
                                                    ? 'border-[#F97316] bg-orange-50/40'
                                                    : 'border-gray-200 bg-[#FAFAF9] hover:border-orange-200 hover:bg-orange-50/20'
                                            }`}>
                                                {formData.photoRightFiles.length > 0 ? (
                                                    <img
                                                        src={URL.createObjectURL(formData.photoRightFiles[0])}
                                                        alt="Right side preview"
                                                        className="w-full h-full object-cover rounded-2xl"
                                                    />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-2 text-gray-400">
                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                        <span className="text-[9px] font-black uppercase tracking-widest">Tap to upload</span>
                                                    </div>
                                                )}
                                                <input
                                                    type="file"
                                                    className="hidden"
                                                    accept="image/*"
                                                    onChange={(e) => setFormData({...formData, photoRightFiles: e.target.files ? Array.from(e.target.files) : []})}
                                                />
                                            </label>
                                            {formData.photoRightFiles.length > 0 && (
                                                <button type="button" onClick={() => setFormData({...formData, photoRightFiles: []})} className="text-[9px] font-black text-red-400 uppercase tracking-widest hover:text-red-600 transition-colors cursor-pointer">✕ Remove</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Core Information */}
                            <div className="border-t border-gray-100 pt-8 space-y-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="h-6 w-1 bg-[#F97316] rounded-full"></span>
                                    <h3 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Pet Information</h3>
                                </div>

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
                                                    onClick={() => {
                                                        const newSpecies = type;
                                                        setFormData((prev) => ({
                                                            ...prev,
                                                            species: newSpecies,
                                                            sizeCategory: newSpecies === 'Cat' ? 'Small' : (prev.sizeCategory === 'Small' && newSpecies === 'Dog' ? 'Medium' : prev.sizeCategory)
                                                        }));
                                                    }}
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
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest flex items-center justify-between">
                                            <span>Pet Size <span className="text-red-500">*</span></span>
                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                                                {formData.sizeCategory === 'Small' ? 'Small (< 10kg)' : formData.sizeCategory === 'Large' ? 'Large (> 25kg)' : 'Medium (10-25kg)'}
                                            </span>
                                        </label>
                                        <div className="grid grid-cols-3 gap-2 h-14">
                                            {['Small', 'Medium', 'Large'].map((sz) => (
                                                <button 
                                                    key={sz}
                                                    type="button"
                                                    onClick={() => setFormData({...formData, sizeCategory: sz})}
                                                    className={`rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer flex items-center justify-center ${
                                                        formData.sizeCategory === sz 
                                                            ? 'bg-[#F97316] text-white border-[#F97316] shadow-lg shadow-orange-100' 
                                                            : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200 hover:text-gray-700'
                                                    }`}
                                                >
                                                    {sz}
                                                </button>
                                            ))}
                                        </div>
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
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Primary Color <span className="text-red-500">*</span></label>
                                        <select 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200 cursor-pointer"
                                            value={formData.primaryColor}
                                            onChange={(e) => setFormData({...formData, primaryColor: e.target.value})}
                                        >
                                            {['Brown', 'Black', 'White', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream', 'Red', 'Other'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        {formData.primaryColor === 'Other' && (
                                            <input 
                                                type="text" 
                                                className="w-full h-14 bg-[#FAFAF9] border border-orange-200 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-400 animate-in fade-in slide-in-from-top-1 duration-200"
                                                placeholder="Type custom primary color (e.g. Brindle, Merle, Calico)"
                                                value={formData.customPrimaryColor}
                                                onChange={(e) => setFormData({...formData, customPrimaryColor: e.target.value})}
                                            />
                                        )}
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Secondary Color <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span></label>
                                        <select 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200 cursor-pointer"
                                            value={formData.secondaryColor}
                                            onChange={(e) => setFormData({...formData, secondaryColor: e.target.value})}
                                        >
                                            <option value="">None</option>
                                            {['White', 'Black', 'Brown', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream', 'Other'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        {formData.secondaryColor === 'Other' && (
                                            <input 
                                                type="text" 
                                                className="w-full h-14 bg-[#FAFAF9] border border-orange-200 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-400 animate-in fade-in slide-in-from-top-1 duration-200"
                                                placeholder="Type custom secondary color (e.g. Sable, Chocolate)"
                                                value={formData.customSecondaryColor}
                                                onChange={(e) => setFormData({...formData, customSecondaryColor: e.target.value})}
                                            />
                                        )}
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Third Color (Tertiary) <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span></label>
                                        <select 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200 cursor-pointer"
                                            value={formData.tertiaryColor}
                                            onChange={(e) => setFormData({...formData, tertiaryColor: e.target.value})}
                                        >
                                            <option value="">None</option>
                                            {['White', 'Black', 'Brown', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream', 'Other'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        {formData.tertiaryColor === 'Other' && (
                                            <input 
                                                type="text" 
                                                className="w-full h-14 bg-[#FAFAF9] border border-orange-200 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-400 animate-in fade-in slide-in-from-top-1 duration-200"
                                                placeholder="Type custom third color"
                                                value={formData.customTertiaryColor}
                                                onChange={(e) => setFormData({...formData, customTertiaryColor: e.target.value})}
                                            />
                                        )}
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Color Markings / Patterns <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span></label>
                                        <input 
                                            type="text" 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-orange-200"
                                            placeholder="e.g. Black with white patches on chest"
                                            value={formData.color}
                                            onChange={(e) => setFormData({...formData, color: e.target.value})}
                                        />
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
                            onDeletePet={() => {
                                fetchPets();
                                setSelectedPet(null);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* Lost Pet Additional Details & Broadcast Modal */}
            {reportingLostPet && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="relative w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden p-6 sm:p-8 animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
                        {/* Modal Header */}
                        <div className="flex items-start justify-between pb-4 border-b border-gray-100 shrink-0">
                            <div className="flex items-center gap-3.5">
                                <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center border border-red-100 shadow-xs text-xl">
                                    📢
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg sm:text-xl font-black text-[#1a1208] uppercase tracking-tight">
                                            Report Lost Pet Alert
                                        </h3>
                                        <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[9px] font-black uppercase tracking-wider animate-pulse">
                                            Live Broadcast
                                        </span>
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">
                                        Add sighting details and circumstances before alerting the community
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={() => !isSubmittingLostReport && setReportingLostPet(null)}
                                disabled={isSubmittingLostReport}
                                className="w-9 h-9 rounded-full border border-gray-100 flex items-center justify-center text-gray-400 hover:text-[#1a1208] hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-50"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Pet Summary Card */}
                        <div className="mt-4 p-3.5 bg-red-50/50 rounded-2xl border border-red-100 flex items-center justify-between gap-3 shrink-0">
                            <div className="flex items-center gap-3">
                                <img 
                                    src={reportingLostPet.avatar || DEFAULT_PET_AVATAR} 
                                    alt={reportingLostPet.name}
                                    className="w-12 h-12 rounded-xl object-cover border border-red-200 shadow-xs"
                                    onError={(e) => { e.currentTarget.src = DEFAULT_PET_AVATAR; }}
                                />
                                <div>
                                    <h4 className="text-sm font-black text-[#1a1208] uppercase">{reportingLostPet.name}</h4>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                        {reportingLostPet.breed || reportingLostPet.species} • {reportingLostPet.primaryColor || 'Mixed'} • {reportingLostPet.gender}
                                    </p>
                                </div>
                            </div>
                            {reportingLostPet.rawPetObj?.qr_code_hash && (
                                <div className="text-right">
                                    <span className="text-[8px] font-black text-amber-700 uppercase tracking-widest block">QR Tag ID</span>
                                    <span className="font-mono text-[10px] font-extrabold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200">
                                        {reportingLostPet.rawPetObj.qr_code_hash}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Form Body */}
                        <form onSubmit={handleSubmitLostPetReport} className="mt-4 space-y-4 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                            {/* Time & Location Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                                        <span>⏰</span> When was {reportingLostPet.name} last seen? *
                                    </label>
                                    <input 
                                        type="datetime-local" 
                                        required
                                        className="w-full bg-[#FAFAF9] border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1a1208] focus:outline-none focus:border-red-400 transition-all shadow-inner"
                                        value={lostPetForm.lastSeenAt}
                                        onChange={(e) => setLostPetForm({ ...lostPetForm, lastSeenAt: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                                        <span>📍</span> Last Seen Landmark / Area *
                                    </label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="e.g. Near Selera Clubhouse, Block 5, Phase 1 Gate..."
                                        className="w-full bg-[#FAFAF9] border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1a1208] focus:outline-none focus:border-red-400 transition-all shadow-inner"
                                        value={lostPetForm.landmark}
                                        onChange={(e) => setLostPetForm({ ...lostPetForm, landmark: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Quick Landmark Chips */}
                            <div className="space-y-1.5">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                    Quick Area Suggestions:
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {[
                                        'Selera Clubhouse', 
                                        'Phase 1 Gate', 
                                        'Phase 2 Playground', 
                                        'Basketball Court', 
                                        'Selera Main Boulevard', 
                                        'Near Resident Home'
                                    ].map((spot) => (
                                        <button
                                            type="button"
                                            key={spot}
                                            onClick={() => setLostPetForm({ ...lostPetForm, landmark: spot })}
                                            className="px-2.5 py-1 bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-600 rounded-lg text-[9px] font-bold transition-colors cursor-pointer border border-transparent hover:border-red-200"
                                        >
                                            + {spot}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Collar & Distinguishing Marks */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                                    <span>🏷️</span> Collar, Accessories & Identifying Marks
                                </label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Wearing blue collar with bell, white patch on left chest, cropped tail"
                                    className="w-full bg-[#FAFAF9] border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1a1208] focus:outline-none focus:border-red-400 transition-all shadow-inner"
                                    value={lostPetForm.collarDetails}
                                    onChange={(e) => setLostPetForm({ ...lostPetForm, collarDetails: e.target.value })}
                                />
                            </div>

                            {/* Circumstances & Story */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
                                    <span>📝</span> Circumstances of Loss & Pet Behavior Notes
                                </label>
                                <textarea 
                                    rows={3}
                                    placeholder="e.g. Slipped past the front gate during delivery. Timid with strangers but very gentle, answers to 'Coco'. Please do not chase; approach slowly with treats..."
                                    className="w-full bg-[#FAFAF9] border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-[#1a1208] focus:outline-none focus:border-red-400 transition-all shadow-inner leading-relaxed"
                                    value={lostPetForm.circumstances}
                                    onChange={(e) => setLostPetForm({ ...lostPetForm, circumstances: e.target.value })}
                                />
                            </div>

                            {/* Contact & Reward Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
                                        Contact Person
                                    </label>
                                    <input 
                                        type="text" 
                                        required
                                        placeholder="Owner Name"
                                        className="w-full bg-[#FAFAF9] border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1a1208] focus:outline-none focus:border-red-400 transition-all shadow-inner"
                                        value={lostPetForm.contactName}
                                        onChange={(e) => setLostPetForm({ ...lostPetForm, contactName: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
                                        Emergency Phone *
                                    </label>
                                    <input 
                                        type="tel" 
                                        required
                                        placeholder="0912 345 6789"
                                        className="w-full bg-[#FAFAF9] border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-[#1a1208] focus:outline-none focus:border-red-400 transition-all shadow-inner"
                                        value={lostPetForm.contactPhone}
                                        onChange={(e) => setLostPetForm({ ...lostPetForm, contactPhone: e.target.value })}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest">
                                        Reward (Optional)
                                    </label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. ₱1,000 Reward"
                                        className="w-full bg-[#FAFAF9] border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-amber-900 bg-amber-50/50 border-amber-200 rounded-xl focus:outline-none focus:border-amber-400 transition-all shadow-inner"
                                        value={lostPetForm.reward}
                                        onChange={(e) => setLostPetForm({ ...lostPetForm, reward: e.target.value })}
                                    />
                                </div>
                            </div>

                            {/* Information Notice */}
                            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-[10px] text-amber-900 font-medium leading-relaxed flex items-start gap-2">
                                <span className="text-amber-600 text-sm">💡</span>
                                <span>
                                    Submitting this report will mark <strong>{reportingLostPet.name}</strong> as <span className="text-red-700 font-bold">LOST</span>, broadcast an urgent missing pet alert to your subdivision feed, and enable instant QR-scan notifications for any neighbor who finds your pet.
                                </span>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3 shrink-0">
                                <button
                                    type="button"
                                    disabled={isSubmittingLostReport}
                                    onClick={() => setReportingLostPet(null)}
                                    className="px-5 py-3 rounded-2xl border border-gray-200 text-gray-600 font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all cursor-pointer disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmittingLostReport}
                                    className="px-7 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-200 hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                                >
                                    {isSubmittingLostReport ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                            Broadcasting Alert...
                                        </>
                                    ) : (
                                        <>
                                            <span>📢</span>
                                            Broadcast Lost Pet Report
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Resolve Lost Pet Report Modal */}
            {resolvingLostPet && (
                <ResolveLostPetModal
                    isOpen={!!resolvingLostPet}
                    pet={{
                        pet_id: resolvingLostPet.pet_id,
                        pet_name: resolvingLostPet.pet_name,
                        photo_url: resolvingLostPet.photo_url,
                        breed: resolvingLostPet.breed,
                        species: resolvingLostPet.pet_type
                    }}
                    onClose={() => setResolvingLostPet(null)}
                    onSuccess={() => {
                        fetchPets();
                        setResolvingLostPet(null);
                    }}
                />
            )}
        </div>
    );
};

export default ResidentPet;
