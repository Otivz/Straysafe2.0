import React, { useState, useEffect, useRef } from 'react';
import PhoneInput from '../PhoneInput';
import BehaviorHistoryField from './BehaviorHistoryField';
import { DEFAULT_AVATAR, getProfilePicture } from '../../utils/avatar';
import api from '../../utils/api';
import { uploadDirectToCloudinary } from '../../utils/cloudinaryUpload';
import { usePetPhotoGuard, PetPhotoGuardPanel, RegisterAnotherPrompt } from '../PetPhotoGuard';
import { isUnnamedPet } from '../../utils/petName';
import {
    COAT_PATTERN_PRESETS,
    calculateAge,
    approximateBirthDateFromAge,
    parseAgeToYearsMonths,
    parseCoatPattern,
    composeCoatMarkings
} from '../../utils/petAge';

interface AddPetModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialReportData?: any;
    editPetData?: any;
    onPetCreated?: (createdPet: any) => void;
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

const AddPetModal: React.FC<AddPetModalProps> = ({ isOpen, onClose, initialReportData, editPetData, onPetCreated }) => {
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Section 1: Photos
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    // One animal per pet record: a photo of several animals is cropped (or confirmed) before saving
    const photoGuard = usePetPhotoGuard();
    const [registerAnother, setRegisterAnother] = useState<{ petId: number; petName: string; count: number } | null>(null);
    const [fromPhotoOfPetId, setFromPhotoOfPetId] = useState<number | null>(null);
    const [lastCreated, setLastCreated] = useState<any>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [inheritedReportPhoto, setInheritedReportPhoto] = useState<string | null>(null);
    
    // Multi-angle photos (optional)
    const [photoFrontFile, setPhotoFrontFile] = useState<File | null>(null);
    const [photoFrontPreview, setPhotoFrontPreview] = useState<string | null>(null);
    const [photoLeftFile, setPhotoLeftFile] = useState<File | null>(null);
    const [photoLeftPreview, setPhotoLeftPreview] = useState<string | null>(null);
    const [photoRightFile, setPhotoRightFile] = useState<File | null>(null);
    const [photoRightPreview, setPhotoRightPreview] = useState<string | null>(null);

    const petFileInputRef = useRef<HTMLInputElement>(null);
    const frontFileInputRef = useRef<HTMLInputElement>(null);
    const leftFileInputRef = useRef<HTMLInputElement>(null);
    const rightFileInputRef = useRef<HTMLInputElement>(null);
    const vaccineFileInputRef = useRef<HTMLInputElement>(null);

    // Section 2: Pet Information (Identical to Resident registration)
    const [petName, setPetName] = useState('');
    const [species, setSpecies] = useState<'Dog' | 'Cat'>('Dog');
    const [breed, setBreed] = useState('');
    const [sizeCategory, setSizeCategory] = useState<string>('Medium');
    const [status, setStatus] = useState<string>('Active');
    const [gender, setGender] = useState<string>('Unknown');
    const [weight, setWeight] = useState('');

    // Colors & Markings
    const [primaryColor, setPrimaryColor] = useState<string>('Brown');
    const [customPrimaryColor, setCustomPrimaryColor] = useState<string>('');
    const [secondaryColor, setSecondaryColor] = useState<string>('');
    const [customSecondaryColor, setCustomSecondaryColor] = useState<string>('');
    const [tertiaryColor, setTertiaryColor] = useState<string>('');
    const [customTertiaryColor, setCustomTertiaryColor] = useState<string>('');
    const [pattern, setPattern] = useState<string>('');
    const [markingsDetails, setMarkingsDetails] = useState<string>('');
    const [colorMarkings, setColorMarkings] = useState('');

    // Smart Age Mode
    const [ageMode, setAgeMode] = useState<'approximate' | 'exact'>('approximate');
    const [approxYears, setApproxYears] = useState<number | ''>('');
    const [approxMonths, setApproxMonths] = useState<number | ''>('');
    const [birthDate, setBirthDate] = useState<string>('');

    // Section 3: Health & Vaccination Details
    const [isVaccinated, setIsVaccinated] = useState<boolean>(false);
    const [vaccinationDate, setVaccinationDate] = useState<string>('');
    const [isNeutered, setIsNeutered] = useState<boolean>(false);
    const [healthNotes, setHealthNotes] = useState<string>('');
    const [vaccineCardFile, setVaccineCardFile] = useState<File | null>(null);
    const [vaccineCardPreview, setVaccineCardPreview] = useState<string | null>(null);

    // Section 4: Behavior Information
    const [temperament, setTemperament] = useState<string>('Friendly');
    // Declared bite / chasing history (a person's account); the verified counts come from incident reports, read-only
    const [declaredBite, setDeclaredBite] = useState<boolean>(false);
    const [declaredChase, setDeclaredChase] = useState<boolean>(false);
    const [verifiedBites, setVerifiedBites] = useState<number>(0);
    const [verifiedChases, setVerifiedChases] = useState<number>(0);

    // Step 2: Owner Information
    const [ownerMode, setOwnerMode] = useState<'existing' | 'new' | 'none'>('existing');
    const [usersList, setUsersList] = useState<UserOption[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [userSearchTerm, setUserSearchTerm] = useState('');
    const [selectedOwner, setSelectedOwner] = useState<UserOption | null>(null);

    // New owner form
    // An owner without a StraySafe account: no account is created; their details are kept on the pet record
    // (emergency contact + registered address), so a later case of this pet still shows who the owner is.
    const [newOwnerName, setNewOwnerName] = useState('');
    const [newOwnerPhone, setNewOwnerPhone] = useState('');
    const [newOwnerAddress, setNewOwnerAddress] = useState('');

    // Fetch existing users and prefill report/edit data when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchRegisteredUsers();
            setAgeMode('approximate');
            setApproxYears('');
            setApproxMonths('');
            setBirthDate('');
            if (editPetData) {
                const pet = editPetData;
                const storedName = pet.rawName ?? pet.pet_name ?? pet.name;
                setPetName(isUnnamedPet(storedName) ? '' : storedName);
                setSpecies((pet.species || pet.pet_type || 'Dog') === 'Cat' ? 'Cat' : 'Dog');
                const rawBirthDate = pet.birth_date || pet.birthDate || pet.rawPetObj?.birth_date;
                const rawAgeStr = pet.age || pet.estimated_age || pet.rawPetObj?.estimated_age;
                const parsedAge = parseAgeToYearsMonths(rawBirthDate, rawAgeStr);
                setAgeMode(parsedAge.hasExactDate ? 'exact' : 'approximate');
                setApproxYears(parsedAge.years);
                setApproxMonths(parsedAge.months);
                setBirthDate(parsedAge.birthDate || '');
                setSizeCategory(pet.sizeCategory || pet.size_category || 'Medium');
                setStatus(pet.status || 'Active');
                setGender(pet.gender || 'Unknown');
                setWeight(pet.weight ? pet.weight.toString().replace(/[^0-9.]/g, '') : '');
                setPrimaryColor(pet.primaryColor || pet.primary_color || 'Brown');
                setSecondaryColor(pet.secondaryColor || pet.secondary_color || '');
                setTertiaryColor(pet.tertiaryColor || pet.tertiary_color || '');
                const rawCoat = pet.colorMarkings || pet.color_markings || pet.distinctive_markings || pet.rawPetObj?.color_markings || '';
                const parsedCoat = parseCoatPattern(rawCoat);
                setPattern(parsedCoat.pattern);
                setMarkingsDetails(parsedCoat.details);
                setColorMarkings(rawCoat);
                setIsVaccinated(!!pet.isVaccinated || !!pet.is_vaccinated);
                setVaccinationDate(pet.vaccinationDate || pet.vaccination_date || '');
                setIsNeutered(!!pet.isNeutered || !!pet.is_neutered);
                setHealthNotes(pet.healthCondition || pet.health_condition || pet.notes || '');
                setTemperament(pet.temperament || 'Friendly');
                setDeclaredBite(!!pet.declared_bite_history);
                setDeclaredChase(!!pet.declared_chase_behavior);
                setVerifiedBites((pet.hasBiteHistory ?? pet.has_bite_history) ? ((pet.biteIncidentCount ?? pet.bite_incident_count) || 1) : 0);
                setVerifiedChases((pet.chaseBehavior ?? pet.chase_behavior) ? ((pet.chaseIncidentCount ?? pet.chase_incident_count) || 1) : 0);

                // Previews
                setPhotoPreview(pet.avatar || pet.photo_url || null);
                setInheritedReportPhoto(pet.avatar || pet.photo_url || null);
                setPhotoFrontPreview(pet.rawPetObj?.photo_front_url || pet.photo_front_url || null);
                setPhotoLeftPreview(pet.rawPetObj?.photo_left_url || pet.photo_left_url || null);
                setPhotoRightPreview(pet.rawPetObj?.photo_right_url || pet.photo_right_url || null);
                setVaccineCardPreview(pet.vaccineCardUrl || pet.vaccine_card_url || null);

                const ownerId = pet.owner_id || pet.rawPetObj?.owner_id;
                if (ownerId) {
                    setOwnerMode('existing');
                } else {
                    setOwnerMode('none');
                }
            } else if (initialReportData) {
                const rep = initialReportData;

                // 1. Detected Breed (Prioritize animal_breed / breed first, matching AISuggestionPanel)
                const detectedBreed = rep.animal_breed || rep.breed || rep.ai_possible_breed || '';
                setBreed(detectedBreed);

                // 2. Pet Name (Blank by default if no known name)
                setPetName(rep.pet_name || '');

                // 3. Species
                const speciesType = (rep.animal_type === 'Cat' || rep.ai_animal_type === 'Cat') ? 'Cat' : 'Dog';
                setSpecies(speciesType);

                // 4. Size Category (Prioritize estimated_size first, matching AISuggestionPanel)
                const detectedSize = (rep.estimated_size || rep.ai_estimated_size || rep.size_category || '').toUpperCase();
                if (detectedSize.includes('SMALL')) setSizeCategory('Small');
                else if (detectedSize.includes('LARGE')) setSizeCategory('Large');
                else setSizeCategory('Medium');

                // 5. Gender
                const detectedGender = (rep.gender || rep.animal_gender || '').toLowerCase();
                if (detectedGender.includes('female')) setGender('Female');
                else if (detectedGender.includes('male')) setGender('Male');
                else setGender('Unknown');

                // 6. Estimated Age
                if (rep.birth_date || rep.estimated_age || rep.age) {
                    const rawAge = rep.estimated_age || rep.age;
                    const parsedAge = parseAgeToYearsMonths(rep.birth_date, rawAge);
                    setAgeMode(parsedAge.hasExactDate ? 'exact' : 'approximate');
                    setApproxYears(parsedAge.years);
                    setApproxMonths(parsedAge.months);
                    setBirthDate(parsedAge.birthDate || '');
                }

                // 7. Status
                if (rep.report_type === 'Lost') setStatus('Lost');
                else if (rep.report_type === 'Found') setStatus('Found');
                else setStatus('Active');

                // 8. Colors & Markings (Prioritize animal_color first, matching AISuggestionPanel)
                const rawDominant = rep.animal_color || rep.ai_dominant_color || '';
                const coatPattern = rep.ai_coat_pattern || '';
                
                // Parse Primary, Secondary, and Tertiary Colors in order
                const detectedColors: string[] = [];
                if (rawDominant) {
                    const lc = rawDominant.toLowerCase();
                    const words: string[] = lc.split(/[\s,+/&]+/).map((w: string) => w.trim()).filter((w: string) => Boolean(w) && !['and', 'with', 'a', 'the', 'color', 'colors', 'pattern'].includes(w));
                    
                    const normalizeColor = (w: string): string => {
                        if (w === 'cream') return 'Cream';
                        if (w === 'tan' || w === 'fawn') return 'Tan';
                        if (w === 'golden' || w === 'yellow') return 'Golden';
                        if (w === 'brown' || w === 'chocolate') return 'Brown';
                        if (w === 'black') return 'Black';
                        if (w === 'white') return 'White';
                        if (w === 'gray' || w === 'grey' || w === 'silver') return 'Gray';
                        if (w === 'orange' || w === 'ginger') return 'Orange';
                        if (w === 'red') return 'Red';
                        if (w === 'brindle' || w === 'calico' || w === 'tabby' || w === 'merle') return 'Other';
                        return '';
                    };

                    for (const word of words) {
                        const col = normalizeColor(word);
                        if (col && !detectedColors.includes(col)) {
                            detectedColors.push(col);
                        }
                    }
                }

                if (detectedColors.length > 0) {
                    setPrimaryColor(detectedColors[0]);
                } else {
                    setPrimaryColor('Brown');
                }

                if (detectedColors.length > 1) {
                    setSecondaryColor(detectedColors[1]);
                } else {
                    setSecondaryColor('');
                }

                if (detectedColors.length > 2) {
                    setTertiaryColor(detectedColors[2]);
                } else {
                    setTertiaryColor('');
                }

                // Inferred or provided coat pattern
                let effectivePattern = coatPattern;
                if (!effectivePattern || effectivePattern.toLowerCase() === 'none' || effectivePattern.toLowerCase() === 'solid') {
                    if (detectedColors.length >= 3) effectivePattern = 'Tricolor';
                    else if (detectedColors.length === 2) effectivePattern = 'Bicolor';
                    else effectivePattern = 'Solid';
                }

                let markingsText = rawDominant;
                if (effectivePattern && effectivePattern !== 'Solid' && effectivePattern !== 'None') {
                    markingsText = markingsText ? `${markingsText} (${effectivePattern} pattern)` : `${effectivePattern} pattern`;
                }
                const parsedRepCoat = parseCoatPattern(markingsText || effectivePattern);
                setPattern(parsedRepCoat.pattern || (effectivePattern && effectivePattern !== 'None' ? effectivePattern : ''));
                setMarkingsDetails(parsedRepCoat.details);
                setColorMarkings(markingsText);

                // 9. Temperament & Behavior
                const reasoning = (rep.ai_decision_reasoning || rep.description || '').toLowerCase();
                if (reasoning.includes('friendly') || reasoning.includes('playful')) {
                    setTemperament('Friendly');
                } else if (reasoning.includes('aggressive') || reasoning.includes('growling') || reasoning.includes('bites')) {
                    setTemperament('Aggressive');
                } else if (reasoning.includes('crying') || reasoning.includes('scared') || reasoning.includes('anxious') || reasoning.includes('distress')) {
                    setTemperament('Anxious');
                } else if (reasoning.includes('protective')) {
                    setTemperament('Protective');
                }

                // 10. Health Notes (Leave blank for actual veterinary/health notes)
                setHealthNotes('');

                // 11. Photos
                if (rep.media && rep.media.length > 0 && rep.media[0].file_url) {
                    setPhotoPreview(rep.media[0].file_url);
                    setInheritedReportPhoto(rep.media[0].file_url);
                }

                // 12. Default to 'none' if registering from an unassigned animal report
                setOwnerMode('none');
            }
        }
    }, [isOpen, initialReportData, editPetData]);

    const fetchRegisteredUsers = async () => {
        setIsLoadingUsers(true);
        try {
            const response = await api.get('/users/');
            const users = Array.isArray(response.data) ? response.data : [];
            const validResidents = users.filter((u: any) => u.role_id === 1 || u.role_id === 2);
            setUsersList(validResidents.length > 0 ? validResidents : users);
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
            photoGuard.check(file, false);
        }
    };

    const handleCroppedPhoto = (file: File) => {
        setPhotoFile(file);
        setPhotoPreview(URL.createObjectURL(file));
        setInheritedReportPhoto(null);
        photoGuard.check(file, true);
    };

    const handleClearPhoto = () => {
        setPhotoFile(null);
        setPhotoPreview(null);
        setInheritedReportPhoto(null);
        photoGuard.reset();
        if (petFileInputRef.current) petFileInputRef.current.value = '';
    };

    const handleFrontPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoFrontFile(file);
            setPhotoFrontPreview(URL.createObjectURL(file));
        }
    };

    const handleLeftPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoLeftFile(file);
            setPhotoLeftPreview(URL.createObjectURL(file));
        }
    };

    const handleRightPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setPhotoRightFile(file);
            setPhotoRightPreview(URL.createObjectURL(file));
        }
    };

    const handleVaccineCardSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setVaccineCardFile(file);
            setVaccineCardPreview(URL.createObjectURL(file));
        }
    };

    const resetForm = (keepOwnerAndPhotoSession: boolean = false) => {
        photoGuard.reset(keepOwnerAndPhotoSession);
        if (!keepOwnerAndPhotoSession) setFromPhotoOfPetId(null);
        setStep(1);
        setIsSubmitting(false);
        setErrorMessage(null);
        setPetName('');
        setSpecies('Dog');
        setBreed('');
        setSizeCategory('Medium');
        setStatus('Active');
        setGender('Unknown');
        setWeight('');
        setPrimaryColor('Brown');
        setCustomPrimaryColor('');
        setSecondaryColor('');
        setCustomSecondaryColor('');
        setTertiaryColor('');
        setCustomTertiaryColor('');
        setPattern('');
        setMarkingsDetails('');
        setColorMarkings('');
        setAgeMode('approximate');
        setApproxYears('');
        setApproxMonths('');
        setBirthDate('');
        setIsVaccinated(false);
        setVaccinationDate('');
        setIsNeutered(false);
        setHealthNotes('');
        setTemperament('Friendly');
        setDeclaredBite(false);
        setDeclaredChase(false);
        setVerifiedBites(0);
        setVerifiedChases(0);
        setPhotoFile(null);
        setPhotoPreview(null);
        setInheritedReportPhoto(null);
        setPhotoFrontFile(null);
        setPhotoFrontPreview(null);
        setPhotoLeftFile(null);
        setPhotoLeftPreview(null);
        setPhotoRightFile(null);
        setPhotoRightPreview(null);
        setVaccineCardFile(null);
        setVaccineCardPreview(null);
        if (keepOwnerAndPhotoSession) return;   // the next pet keeps the same owner
        setOwnerMode('existing');
        setSelectedOwner(null);
        setNewOwnerName('');
        setNewOwnerPhone('');
        setNewOwnerAddress('');
        setUserSearchTerm('');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleNextStep = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setErrorMessage(null);
        if (photoGuard.checking) {
            setErrorMessage('Still checking the photo. Wait a moment.');
            return;
        }
        if (photoGuard.blocked) {
            setErrorMessage(`The photo shows ${photoGuard.count} animals. Crop the pet you are registering, or confirm the photo with a reason.`);
            return;
        }

        if (usersList.length === 0) {
            fetchRegisteredUsers();
        }

        setStep(2);
    };

    const handleCompleteRegistration = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (isSubmitting) return;
        if (photoGuard.blocked) {
            setErrorMessage(`The photo shows ${photoGuard.count} animals. Crop the pet you are registering, or confirm the photo with a reason.`);
            return;
        }
        setIsSubmitting(true);
        setErrorMessage(null);

        let targetOwnerId: number | null = null;

        if (ownerMode === 'existing') {
            if (!selectedOwner) {
                setErrorMessage('Please select a registered resident account from the list.');
                return;
            }
            targetOwnerId = selectedOwner.user_id;
        } else if (ownerMode === 'new') {
            // No account is created (it would need the person's own email and password): the owner is kept on the record
            if (!newOwnerName.trim()) {
                setIsSubmitting(false);
                setErrorMessage("Enter the owner's full name.");
                return;
            }
            if (!newOwnerPhone.trim() && !newOwnerAddress.trim()) {
                setIsSubmitting(false);
                setErrorMessage("Enter at least the owner's contact number or address, so they can be reached on a later case.");
                return;
            }
            targetOwnerId = null;
        } else if (ownerMode === 'none') {
            targetOwnerId = null;
        }

        const finalPrimaryColor = primaryColor === 'Other' ? (customPrimaryColor.trim() || 'Other') : primaryColor;
        const finalSecondaryColor = secondaryColor === 'Other' ? (customSecondaryColor.trim() || 'Other') : (secondaryColor || null);
        const finalTertiaryColor = tertiaryColor === 'Other' ? (customTertiaryColor.trim() || 'Other') : (tertiaryColor || null);

        let resultData: any = null;  // read in the catch below too
        try {
            setIsSubmitting(true);
            
            // Get current registrant
            const userStr = localStorage.getItem('admin_user') || sessionStorage.getItem('admin_user') || localStorage.getItem('staff_user') || sessionStorage.getItem('staff_user') || localStorage.getItem('user') || sessionStorage.getItem('user');
            let currentRegistrant: any = null;
            if (userStr) {
                try { currentRegistrant = JSON.parse(userStr); } catch (e) {}
            }

            // Upload all photos in parallel directly to Cloudinary
            let photoUrl = editPetData?.photo_url || inheritedReportPhoto || null;
            let photoFrontUrl = editPetData?.photo_front_url || null;
            let photoLeftUrl = editPetData?.photo_left_url || null;
            let photoRightUrl = editPetData?.photo_right_url || null;
            let vaccineCardUrl = editPetData?.vaccine_card_url || null;

            const uploadTasks: Promise<any>[] = [];
            if (photoFile) {
                uploadTasks.push(uploadDirectToCloudinary(photoFile, 'pets').then(res => { photoUrl = res.url; }));
            }
            if (photoFrontFile) {
                uploadTasks.push(uploadDirectToCloudinary(photoFrontFile, 'pets/sides').then(res => { photoFrontUrl = res.url; }));
            }
            if (photoLeftFile) {
                uploadTasks.push(uploadDirectToCloudinary(photoLeftFile, 'pets/sides').then(res => { photoLeftUrl = res.url; }));
            }
            if (photoRightFile) {
                uploadTasks.push(uploadDirectToCloudinary(photoRightFile, 'pets/sides').then(res => { photoRightUrl = res.url; }));
            }
            if (vaccineCardFile) {
                uploadTasks.push(uploadDirectToCloudinary(vaccineCardFile, 'vaccines').then(res => { vaccineCardUrl = res.url; }));
            }

            if (uploadTasks.length > 0) {
                await Promise.all(uploadTasks);
            }

            let finalBirthDate: string | null = null;
            let finalEstimatedAge: string | null = null;
            if (ageMode === 'exact' && birthDate) {
                finalBirthDate = birthDate;
                finalEstimatedAge = calculateAge(birthDate);
            } else if (ageMode === 'approximate') {
                finalBirthDate = approximateBirthDateFromAge(approxYears, approxMonths) || null;
                finalEstimatedAge = finalBirthDate ? calculateAge(finalBirthDate) : null;
            }

            const composedMarkings = composeCoatMarkings(
                pattern,
                markingsDetails || colorMarkings
            );

            const petPayload = {
                owner_id: targetOwnerId,
                ...(!editPetData ? {
                    registered_by_user_id: currentRegistrant?.user_id || currentRegistrant?.id || null,
                    registered_by_name: currentRegistrant?.name || currentRegistrant?.full_name || (currentRegistrant?.role_id === 4 ? 'System Administrator' : 'Subdivision Leader'),
                } : {}),
                pet_name: petName.trim() || 'No Name',
                pet_type: species,
                breed: breed.trim() || null,
                birth_date: finalBirthDate,
                estimated_age: finalEstimatedAge || null,
                size_category: sizeCategory,
                status: status,
                gender: gender,
                weight: weight ? parseFloat(weight.replace(/[^0-9.]/g, '')) || null : null,
                primary_color: finalPrimaryColor,
                secondary_color: finalSecondaryColor,
                tertiary_color: finalTertiaryColor,
                color_markings: composedMarkings || null,
                distinctive_markings: composedMarkings || null,
                photo_url: photoUrl,
                photo_front_url: photoFrontUrl,
                photo_left_url: photoLeftUrl,
                photo_right_url: photoRightUrl,
                vaccine_card_url: vaccineCardUrl,
                is_vaccinated: isVaccinated,
                vaccination_date: isVaccinated && vaccinationDate ? vaccinationDate : null,
                is_neutered: isNeutered,
                health_condition: healthNotes.trim() || null,
                notes: healthNotes.trim() || null,
                temperament: temperament,
                declared_bite_history: declaredBite,
                declared_chase_behavior: declaredChase,
                // A person's confirmation of a photo the AI check doubted (validated and logged on the server)
                ...(photoFile && photoGuard.overridePayload ? { photo_override: photoGuard.overridePayload } : {}),
                // the next animal registered from the same photo as the previous pet (logged on the server)
                ...(!editPetData && fromPhotoOfPetId ? { registered_from_photo_of_pet_id: fromPhotoOfPetId } : {}),
                // Owner without an account: their name, number and address stay on the pet record
                ...(ownerMode === 'new' ? {
                    emergency_contact_name: newOwnerName.trim(),
                    emergency_contact_phone: newOwnerPhone.trim() || null,
                    registered_address: newOwnerAddress.trim() || null,
                } : {})
            };

            let createdPetId = editPetData?.id || editPetData?.pet_id;

            if (editPetData && createdPetId) {
                const updateRes = await api.put(`/pets/${createdPetId}`, petPayload);
                resultData = updateRes.data;
            } else {
                // Barangay staff may only add a record for a report they're reviewing, so the report goes along.
                // Only the first animal belongs to the report; the others from the same photo are separate pets.
                const linkReportId = !fromPhotoOfPetId ? initialReportData?.report_id : undefined;
                const petRes = await api.post('/pets/', petPayload, {
                    params: linkReportId ? { for_report_id: linkReportId } : undefined
                });
                createdPetId = petRes.data.pet_id;
                resultData = petRes.data;
            }

            // Link to report if initialReportData has report_id (the first animal only)
            if (initialReportData?.report_id && createdPetId && !fromPhotoOfPetId) {
                try {
                    await api.post(`/reports/${initialReportData.report_id}/link-pet?pet_id=${createdPetId}`);
                } catch (linkErr) {
                    console.warn('Could not auto-link pet to report:', linkErr);
                }
            }

            // Pet Records only (a report is about one animal): the photo showed several animals, so offer the next
            // registration from the same (unchanged) photo. The page is told when the person is done, because some
            // pages close this form as soon as they hear about a new pet.
            if (!editPetData && !initialReportData?.report_id && createdPetId && photoGuard.hasSession && photoGuard.original) {
                setLastCreated(resultData);
                setRegisterAnother({ petId: createdPetId, petName: resultData?.pet_name || petName, count: photoGuard.original.count });
                return;
            }

            if (onPetCreated) {
                onPetCreated(resultData);
            }
            handleClose();
        } catch (err: any) {
            console.error('Error registering/updating pet:', err);
            const detail = err.response?.data?.detail || 'Failed to complete pet operation.';
            
            // If the report was already identified or linked with a pet (409 Conflict), close gracefully and update parent
            if (err.response?.status === 409 && typeof detail === 'string' && (detail.includes('already identified') || detail.includes('already linked') || detail.includes('No new animal record is needed'))) {
                if (onPetCreated) {
                    onPetCreated(resultData || { pet_id: initialReportData?.pet_id || null });
                }
                handleClose();
                return;
            }

            setErrorMessage(`Error: ${detail}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const filteredUsers = usersList.filter(u => {
        if (!userSearchTerm.trim()) return true;
        const q = userSearchTerm.toLowerCase();
        return (
            (u.name && u.name.toLowerCase().includes(q)) ||
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.phone && u.phone.includes(q))
        );
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-0 sm:p-4 md:p-6">
            <div 
                className="absolute inset-0 bg-[#1a1208]/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={handleClose}
            />

            <div className="relative w-full h-full sm:h-auto max-w-3xl bg-white rounded-none sm:rounded-[2.5rem] md:rounded-[3rem] shadow-2xl overflow-hidden flex flex-col sm:max-h-[92vh] animate-in zoom-in-95 duration-300 border-none sm:border border-gray-100">
                
                {/* Header */}
                <header className="shrink-0 z-30 bg-white px-4 sm:px-8 py-3.5 sm:py-5 flex items-center justify-between border-b border-gray-100">
                    <div className="min-w-0 pr-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-role">Step {step} of 2</span>
                            <span className="text-gray-300">•</span>
                            <span className="text-[10px] sm:text-xs font-bold text-gray-500 truncate">{step === 1 ? (editPetData ? 'Edit Pet Details' : 'Pet Registration Form') : 'Owner Assignment'}</span>
                        </div>
                        <h2 className="text-lg sm:text-2xl font-black text-[#1a1208] uppercase tracking-tight mt-0.5 truncate">
                            {editPetData ? '✏️ Edit Pet Record' : (initialReportData ? '🐾 Register Pet in System' : 'Register New Pet')}
                        </h2>
                    </div>
                    <button 
                        onClick={handleClose} 
                        className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-gray-50 flex items-center justify-center text-gray-400 hover:text-[#1a1208] hover:bg-gray-100 transition-all cursor-pointer shrink-0"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                {/* Form Content Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-10 space-y-6 sm:space-y-8 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                    
                    {errorMessage && (
                        <div className="bg-red-50 border-2 border-dashed border-red-200 rounded-[2rem] p-6 flex items-start gap-4 animate-in fade-in duration-300">
                            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                                ⚠️
                            </div>
                            <div>
                                <p className="text-xs font-black text-red-700 uppercase tracking-widest leading-none">Incomplete Information</p>
                                <p className="text-xs font-bold text-red-600 mt-1">{errorMessage}</p>
                            </div>
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* STEP 1: PET DETAILS (Matches Resident Pet Registration Form) */}
                    {/* ========================================================================= */}
                    {step === 1 && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                            
                            {/* Section 1: Pet Photos */}
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="h-6 w-1 bg-role rounded-full"></span>
                                        <h3 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Pet Photos</h3>
                                    </div>
                                    <span className="text-[10px] font-bold text-gray-400">Primary & Multi-Angle Photos</span>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">
                                        Pet Photo (Primary) <span className="text-red-500">*</span>
                                    </label>
                                    
                                    {photoPreview ? (
                                        <div className="relative rounded-2xl overflow-hidden border-2 border-role-border bg-role-soft/20 p-4 flex flex-col sm:flex-row items-center gap-5">
                                            <img 
                                                src={photoPreview} 
                                                alt="Selected pet" 
                                                className="w-28 h-28 object-cover rounded-2xl shadow-md shrink-0 border border-role-muted" 
                                            />
                                            <div className="flex-1 space-y-1.5 text-center sm:text-left min-w-0">
                                                <p className="text-xs font-black text-[#1a1208] uppercase tracking-tight">
                                                    {photoFile ? photoFile.name : (inheritedReportPhoto ? `Photo from Report #${initialReportData?.report_id}` : 'Pet Photo Attached')}
                                                </p>
                                                {inheritedReportPhoto && !photoFile && (
                                                    <p className="text-[11px] font-bold text-role bg-role-muted/60 px-2.5 py-1 rounded-lg w-fit">
                                                        📸 Automatically loaded from submitted report
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-3 pt-1">
                                                    <button 
                                                        type="button"
                                                        onClick={() => petFileInputRef.current?.click()}
                                                        className="text-[11px] font-black text-role uppercase tracking-wider hover:underline cursor-pointer"
                                                    >
                                                        Change Photo
                                                    </button>
                                                    <button 
                                                        type="button" 
                                                        onClick={handleClearPhoto}
                                                        className="text-[11px] font-black text-red-500 uppercase tracking-widest bg-red-50 hover:bg-red-100 px-3 py-1 rounded-xl transition-colors cursor-pointer"
                                                    >
                                                        ✕ Remove
                                                    </button>
                                                </div>
                                            </div>
                                            <input 
                                                type="file" 
                                                ref={petFileInputRef}
                                                className="hidden" 
                                                accept="image/*" 
                                                onChange={handlePhotoSelect} 
                                            />
                                        </div>
                                    ) : (
                                        <div 
                                            onClick={() => petFileInputRef.current?.click()}
                                            className="h-36 rounded-2xl border-2 border-dashed border-gray-200 bg-[#FAFAF9] hover:border-role-border hover:bg-role-soft/20 flex flex-col items-center justify-center text-gray-400 hover:text-role transition-all cursor-pointer"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <span className="text-[10px] font-black uppercase tracking-widest">Click to upload primary pet photo</span>
                                            <input 
                                                type="file" 
                                                ref={petFileInputRef}
                                                className="hidden" 
                                                accept="image/*" 
                                                onChange={handlePhotoSelect} 
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Several animals in the photo: crop the pet being registered (or confirm), then re-checked */}
                                <PetPhotoGuardPanel guard={photoGuard} onCropped={handleCroppedPhoto} />

                                {/* Multi-Angle Identification Photos (Optional) */}
                                <div className="pt-2 space-y-3">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-[10px] font-black text-[#1a1208] uppercase tracking-widest">Multi-Angle Identification Photos</h4>
                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider bg-gray-50 px-2 py-0.5 rounded-full border border-gray-100">Optional</span>
                                    </div>
                                    <p className="text-[10px] font-bold text-gray-400 leading-relaxed">
                                        Upload photos of the animal from different angles for more accurate matching.
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        {/* Front Photo */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-[#1a1208] uppercase tracking-widest flex items-center gap-1.5">
                                                <span className="w-4 h-4 rounded-md bg-role-muted text-role flex items-center justify-center text-[8px] font-black">F</span>
                                                Front View
                                            </label>
                                            <div 
                                                onClick={() => frontFileInputRef.current?.click()}
                                                className="h-28 rounded-2xl border-2 border-dashed border-gray-200 bg-[#FAFAF9] hover:border-role-border hover:bg-role-soft/20 flex flex-col items-center justify-center text-gray-400 cursor-pointer overflow-hidden relative"
                                            >
                                                {photoFrontPreview ? (
                                                    <img src={photoFrontPreview} alt="Front" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Tap to upload</span>
                                                )}
                                                <input type="file" ref={frontFileInputRef} className="hidden" accept="image/*" onChange={handleFrontPhotoSelect} />
                                            </div>
                                            {photoFrontPreview && (
                                                <button type="button" onClick={() => { setPhotoFrontFile(null); setPhotoFrontPreview(null); }} className="text-[9px] font-black text-red-400 hover:text-red-600 uppercase">✕ Remove</button>
                                            )}
                                        </div>

                                        {/* Left Photo */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-[#1a1208] uppercase tracking-widest flex items-center gap-1.5">
                                                <span className="w-4 h-4 rounded-md bg-role-muted text-role flex items-center justify-center text-[8px] font-black">L</span>
                                                Left Side
                                            </label>
                                            <div 
                                                onClick={() => leftFileInputRef.current?.click()}
                                                className="h-28 rounded-2xl border-2 border-dashed border-gray-200 bg-[#FAFAF9] hover:border-role-border hover:bg-role-soft/20 flex flex-col items-center justify-center text-gray-400 cursor-pointer overflow-hidden relative"
                                            >
                                                {photoLeftPreview ? (
                                                    <img src={photoLeftPreview} alt="Left" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Tap to upload</span>
                                                )}
                                                <input type="file" ref={leftFileInputRef} className="hidden" accept="image/*" onChange={handleLeftPhotoSelect} />
                                            </div>
                                            {photoLeftPreview && (
                                                <button type="button" onClick={() => { setPhotoLeftFile(null); setPhotoLeftPreview(null); }} className="text-[9px] font-black text-red-400 hover:text-red-600 uppercase">✕ Remove</button>
                                            )}
                                        </div>

                                        {/* Right Photo */}
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-[#1a1208] uppercase tracking-widest flex items-center gap-1.5">
                                                <span className="w-4 h-4 rounded-md bg-role-muted text-role flex items-center justify-center text-[8px] font-black">R</span>
                                                Right Side
                                            </label>
                                            <div 
                                                onClick={() => rightFileInputRef.current?.click()}
                                                className="h-28 rounded-2xl border-2 border-dashed border-gray-200 bg-[#FAFAF9] hover:border-role-border hover:bg-role-soft/20 flex flex-col items-center justify-center text-gray-400 cursor-pointer overflow-hidden relative"
                                            >
                                                {photoRightPreview ? (
                                                    <img src={photoRightPreview} alt="Right" className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-[9px] font-black uppercase tracking-widest">Tap to upload</span>
                                                )}
                                                <input type="file" ref={rightFileInputRef} className="hidden" accept="image/*" onChange={handleRightPhotoSelect} />
                                            </div>
                                            {photoRightPreview && (
                                                <button type="button" onClick={() => { setPhotoRightFile(null); setPhotoRightPreview(null); }} className="text-[9px] font-black text-red-400 hover:text-red-600 uppercase">✕ Remove</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Core Information (Matches Resident registration form) */}
                            <div className="border-t border-gray-100 pt-8 space-y-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="h-6 w-1 bg-role rounded-full"></span>
                                    <h3 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Pet Information</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Pet Name */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">
                                            Pet Name <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span>
                                        </label>
                                        <input 
                                            type="text" 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border"
                                            placeholder="Add name"
                                            value={petName}
                                            onChange={(e) => setPetName(e.target.value)}
                                        />
                                    </div>

                                    {/* Species (Toggle Buttons) */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Species <span className="text-red-500">*</span></label>
                                        <div className="flex gap-4 h-14">
                                            {(['Dog', 'Cat'] as const).map((type) => (
                                                <button 
                                                    key={type}
                                                    type="button"
                                                    onClick={() => setSpecies(type)}
                                                    className={`flex-1 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer ${
                                                        species === type ? 'bg-role text-white border-role shadow-lg shadow-role-muted' : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200 hover:text-gray-700'
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Breed (Optional / Suggestion Datalist) */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">
                                            Breed <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span>
                                        </label>
                                        <input 
                                            type="text" 
                                            list="resident-breed-suggestions"
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border"
                                            placeholder="e.g. Aspin / Mixed / Shih Tzu"
                                            value={breed}
                                            onChange={(e) => setBreed(e.target.value)}
                                        />
                                        <datalist id="resident-breed-suggestions">
                                            {species === 'Dog' ? (
                                                <>
                                                    <option value="Aspin" />
                                                    <option value="Shih Tzu" />
                                                    <option value="Chihuahua" />
                                                    <option value="Golden Retriever" />
                                                    <option value="Siberian Husky" />
                                                    <option value="Bulldog" />
                                                    <option value="Poodle" />
                                                    <option value="German Shepherd" />
                                                    <option value="Pug" />
                                                    <option value="Mixed Breed" />
                                                </>
                                            ) : (
                                                <>
                                                    <option value="Puspin" />
                                                    <option value="Siamese" />
                                                    <option value="Persian" />
                                                    <option value="Maine Coon" />
                                                    <option value="Bengal" />
                                                    <option value="British Shorthair" />
                                                    <option value="Mixed Breed" />
                                                </>
                                            )}
                                        </datalist>
                                    </div>

                                    {/* Smart Age Selector (Auto-advancing) */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest flex items-center gap-1.5">
                                                <span>Age & Birthday</span>
                                                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">(Optional)</span>
                                            </label>
                                            {/* Mode Switcher */}
                                            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
                                                <button
                                                    type="button"
                                                    onClick={() => setAgeMode('approximate')}
                                                    className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                                                        ageMode === 'approximate'
                                                            ? 'bg-white text-role shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-800'
                                                    }`}
                                                >
                                                    Approximate Age
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAgeMode('exact')}
                                                    className={`px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer ${
                                                        ageMode === 'exact'
                                                            ? 'bg-white text-role shadow-xs'
                                                            : 'text-gray-500 hover:text-gray-800'
                                                    }`}
                                                >
                                                    Exact Birthday
                                                </button>
                                            </div>
                                        </div>

                                        {ageMode === 'approximate' ? (
                                            <div className="space-y-2.5">
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Years</label>
                                                        <select
                                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                                            value={approxYears}
                                                            onChange={(e) => setApproxYears(e.target.value === '' ? '' : Number(e.target.value))}
                                                        >
                                                            <option value="">Select years</option>
                                                            {Array.from({ length: 21 }, (_, i) => (
                                                                <option key={i} value={i}>{i} {i === 1 ? 'Year' : 'Years'}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Months</label>
                                                        <select
                                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-4 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                                            value={approxMonths}
                                                            onChange={(e) => setApproxMonths(e.target.value === '' ? '' : Number(e.target.value))}
                                                        >
                                                            <option value="">Select months</option>
                                                            {Array.from({ length: 12 }, (_, i) => (
                                                                <option key={i} value={i}>{i} {i === 1 ? 'Month' : 'Months'}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Quick pick chips */}
                                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                                    {[
                                                        { label: species === 'Cat' ? 'Kitten (4 mos)' : 'Puppy (4 mos)', y: 0, m: 4 },
                                                        { label: 'Young (1 yr)', y: 1, m: 0 },
                                                        { label: 'Adult (3 yrs)', y: 3, m: 0 },
                                                        { label: 'Senior (7 yrs)', y: 7, m: 0 },
                                                    ].map(chip => (
                                                        <button
                                                            key={chip.label}
                                                            type="button"
                                                            onClick={() => {
                                                                setApproxYears(chip.y);
                                                                setApproxMonths(chip.m);
                                                            }}
                                                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer ${
                                                                approxYears === chip.y && approxMonths === chip.m
                                                                    ? 'bg-role-soft border-role-border text-role-hover'
                                                                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                                                            }`}
                                                        >
                                                            {chip.label}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Live preview banner */}
                                                {(approxYears !== '' || approxMonths !== '') && (
                                                    <div className="p-3 bg-role-soft/30 border border-role-border/50 rounded-2xl flex items-center justify-between text-xs font-bold text-gray-700">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="text-role">✨</span>
                                                            <span>Calculated Age: <strong className="text-role-hover">{calculateAge(approximateBirthDateFromAge(approxYears, approxMonths))}</strong></span>
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                                                            Auto-advances over time
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="space-y-2.5">
                                                <input
                                                    type="date"
                                                    max={new Date().toISOString().slice(0, 10)}
                                                    className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                                    value={birthDate}
                                                    onChange={(e) => setBirthDate(e.target.value)}
                                                />
                                                {birthDate && (
                                                    <div className="p-3 bg-role-soft/30 border border-role-border/50 rounded-2xl flex items-center justify-between text-xs font-bold text-gray-700">
                                                        <span className="flex items-center gap-1.5">
                                                            <span className="text-role">🎂</span>
                                                            <span>Age Today: <strong className="text-role-hover">{calculateAge(birthDate)}</strong></span>
                                                        </span>
                                                        <span className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">
                                                            Exact birthday saved
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Pet Size (Buttons) */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest flex items-center justify-between">
                                            <span>Pet Size <span className="text-red-500">*</span></span>
                                            <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">
                                                {sizeCategory === 'Small' ? 'Small (< 10kg)' : sizeCategory === 'Large' ? 'Large (> 25kg)' : 'Medium (10-25kg)'}
                                            </span>
                                        </label>
                                        <div className="grid grid-cols-3 gap-2 h-14">
                                            {['Small', 'Medium', 'Large'].map((sz) => (
                                                <button 
                                                    key={sz}
                                                    type="button"
                                                    onClick={() => setSizeCategory(sz)}
                                                    className={`rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all cursor-pointer flex items-center justify-center ${
                                                        sizeCategory === sz 
                                                            ? 'bg-role text-white border-role shadow-lg shadow-role-muted' 
                                                            : 'bg-white text-gray-400 border-gray-100 hover:border-gray-200 hover:text-gray-700'
                                                    }`}
                                                >
                                                    {sz}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Current Status */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Current Status <span className="text-red-500">*</span></label>
                                        <select 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                            value={status}
                                            onChange={(e) => setStatus(e.target.value)}
                                        >
                                            <option value="Active">Active</option>
                                            <option value="Lost">Lost</option>
                                            <option value="Found">Found</option>
                                            <option value="Rescued">Rescued</option>
                                            <option value="Deceased">Deceased</option>
                                        </select>
                                    </div>

                                    {/* Gender */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Gender <span className="text-red-500">*</span></label>
                                        <select 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                            value={gender}
                                            onChange={(e) => setGender(e.target.value)}
                                        >
                                            <option value="Unknown">Unknown</option>
                                            <option value="Male">Male</option>
                                            <option value="Female">Female</option>
                                        </select>
                                    </div>

                                    {/* Weight */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Weight (kg) <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span></label>
                                        <input 
                                            type="text" 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border"
                                            placeholder="Leave blank if unknown"
                                            value={weight}
                                            onChange={(e) => setWeight(e.target.value)}
                                        />
                                        <p className="text-[10px] text-gray-400 font-semibold">
                                            Not weighed? Skip this. The Pet Size you choose above is enough for matching, and it can be updated later.
                                        </p>
                                    </div>

                                    {/* Primary Color */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Primary Color <span className="text-red-500">*</span></label>
                                        <select 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                            value={primaryColor}
                                            onChange={(e) => setPrimaryColor(e.target.value)}
                                        >
                                            {['Brown', 'Black', 'White', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream', 'Red', 'Other'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        {primaryColor === 'Other' && (
                                            <input 
                                                type="text" 
                                                className="w-full h-14 bg-[#FAFAF9] border border-role-border rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role animate-in fade-in slide-in-from-top-1 duration-200"
                                                placeholder="Type custom primary color (e.g. Brindle, Merle, Calico)"
                                                value={customPrimaryColor}
                                                onChange={(e) => setCustomPrimaryColor(e.target.value)}
                                            />
                                        )}
                                    </div>

                                    {/* Secondary Color */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Secondary Color <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span></label>
                                        <select 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                            value={secondaryColor}
                                            onChange={(e) => setSecondaryColor(e.target.value)}
                                        >
                                            <option value="">None</option>
                                            {['White', 'Black', 'Brown', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream', 'Red', 'Other'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        {secondaryColor === 'Other' && (
                                            <input 
                                                type="text" 
                                                className="w-full h-14 bg-[#FAFAF9] border border-role-border rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role animate-in fade-in slide-in-from-top-1 duration-200"
                                                placeholder="Type custom secondary color"
                                                value={customSecondaryColor}
                                                onChange={(e) => setCustomSecondaryColor(e.target.value)}
                                            />
                                        )}
                                    </div>

                                    {/* Third Color (Tertiary) */}
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Third Color (Tertiary) <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span></label>
                                        <select 
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                            value={tertiaryColor}
                                            onChange={(e) => setTertiaryColor(e.target.value)}
                                        >
                                            <option value="">None</option>
                                            {['Black', 'White', 'Brown', 'Golden', 'Gray', 'Orange', 'Tan', 'Cream', 'Red', 'Other'].map(c => (
                                                <option key={c} value={c}>{c}</option>
                                            ))}
                                        </select>
                                        {tertiaryColor === 'Other' && (
                                            <input 
                                                type="text" 
                                                className="w-full h-14 bg-[#FAFAF9] border border-role-border rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role animate-in fade-in slide-in-from-top-1 duration-200"
                                                placeholder="Type custom third color"
                                                value={customTertiaryColor}
                                                onChange={(e) => setCustomTertiaryColor(e.target.value)}
                                            />
                                        )}
                                    </div>

                                    {/* Coat Pattern & Markings */}
                                    <div className="space-y-3 md:col-span-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">
                                                Coat Pattern & Markings <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider pl-1">(Optional)</span>
                                            </label>
                                            {pattern && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setPattern('');
                                                        setMarkingsDetails('');
                                                    }}
                                                    className="text-[9px] font-black text-gray-400 hover:text-red-500 uppercase tracking-wider transition-colors cursor-pointer"
                                                >
                                                    Clear Pattern
                                                </button>
                                            )}
                                        </div>

                                        {/* Coat Pattern Dropdown */}
                                        <select
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                            value={pattern}
                                            onChange={(e) => setPattern(e.target.value)}
                                        >
                                            <option value="">Select Coat Pattern (e.g. Solid, Bicolor, Tabby, Tuxedo...)</option>
                                            {COAT_PATTERN_PRESETS
                                                .filter(p => !p.suggestedFor || p.suggestedFor === 'Both' || p.suggestedFor === species)
                                                .map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.label}
                                                    </option>
                                                ))
                                            }
                                        </select>

                                        {/* Pattern description card if selected */}
                                        {(() => {
                                            const selectedPreset = COAT_PATTERN_PRESETS.find(p => p.id === pattern);
                                            if (!selectedPreset) return null;
                                            return (
                                                <div className="p-3.5 bg-role-soft/30 border border-role-border/50 rounded-2xl flex items-start gap-2.5 animate-in fade-in duration-200">
                                                    <span className="text-base leading-none">💡</span>
                                                    <div className="text-xs">
                                                        <span className="font-black text-[#1a1208]">{selectedPreset.label}: </span>
                                                        <span className="text-gray-600 font-semibold">{selectedPreset.description}</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Specific markings & details */}
                                        <div className="space-y-1.5">
                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block">
                                                Specific Markings or Details (Optional)
                                            </label>
                                            <input
                                                type="text"
                                                className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border"
                                                placeholder="e.g. White chest patch, left front white sock, scar on ear"
                                                value={markingsDetails || colorMarkings}
                                                onChange={(e) => {
                                                    setMarkingsDetails(e.target.value);
                                                    setColorMarkings(e.target.value);
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Health & Vaccination Details */}
                            <div className="border-t border-gray-100 pt-8 space-y-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="h-6 w-1 bg-role rounded-full"></span>
                                    <h3 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Health & Vaccination Records</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Vaccinated?</label>
                                        <div className="flex gap-8 h-14 items-center">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="subdIsVaccinated" 
                                                    className="w-5 h-5 accent-role" 
                                                    checked={isVaccinated === true} 
                                                    onChange={() => setIsVaccinated(true)}
                                                />
                                                <span className="text-sm font-bold text-gray-700">Yes</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="subdIsVaccinated" 
                                                    className="w-5 h-5 accent-role" 
                                                    checked={isVaccinated === false} 
                                                    onChange={() => setIsVaccinated(false)}
                                                />
                                                <span className="text-sm font-bold text-gray-700">No</span>
                                            </label>
                                        </div>
                                    </div>

                                    {isVaccinated && (
                                        <div className="space-y-3 animate-in fade-in duration-300">
                                            <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Vaccination Date</label>
                                            <input 
                                                type="date" 
                                                className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border"
                                                value={vaccinationDate}
                                                onChange={(e) => setVaccinationDate(e.target.value)}
                                            />
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Neutered / Spayed?</label>
                                        <div className="flex gap-8 h-14 items-center">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="subdIsNeutered" 
                                                    className="w-5 h-5 accent-role" 
                                                    checked={isNeutered === true} 
                                                    onChange={() => setIsNeutered(true)}
                                                />
                                                <span className="text-sm font-bold text-gray-700">Yes</span>
                                            </label>
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input 
                                                    type="radio" 
                                                    name="subdIsNeutered" 
                                                    className="w-5 h-5 accent-role" 
                                                    checked={isNeutered === false} 
                                                    onChange={() => setIsNeutered(false)}
                                                />
                                                <span className="text-sm font-bold text-gray-700">No</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="space-y-3 md:col-span-2">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Health Notes / Remarks (Optional)</label>
                                        <textarea 
                                            className="w-full bg-[#FAFAF9] border border-gray-100 rounded-[2rem] p-5 text-sm font-medium focus:outline-none focus:border-role-border min-h-[90px]"
                                            placeholder="List any allergies, ongoing medications, or specific health remarks..."
                                            value={healthNotes}
                                            onChange={(e) => setHealthNotes(e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-3 md:col-span-2">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Upload Vaccine Card or Document (Optional)</label>
                                        <input 
                                            type="file" 
                                            ref={vaccineFileInputRef}
                                            className="w-full text-xs font-bold text-gray-400 file:mr-4 file:py-2.5 file:px-5 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-role-soft file:text-role hover:file:bg-role-muted cursor-pointer"
                                            onChange={handleVaccineCardSelect}
                                            accept=".pdf,image/*"
                                        />
                                        {vaccineCardPreview && (
                                            <p className="text-[11px] font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-xl w-fit">
                                                ✓ Vaccine card attached for upload
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Section 4: Behavior Information */}
                            <div className="border-t border-gray-100 pt-8 space-y-6">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="h-6 w-1 bg-role rounded-full"></span>
                                    <h3 className="text-xs font-black text-[#1a1208] uppercase tracking-widest">Behavior Information</h3>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[11px] font-black text-[#1a1208] uppercase tracking-widest">Temperament</label>
                                        <select
                                            className="w-full h-14 bg-[#FAFAF9] border border-gray-100 rounded-2xl px-6 text-sm font-bold focus:outline-none focus:border-role-border cursor-pointer"
                                            value={temperament}
                                            onChange={(e) => setTemperament(e.target.value)}
                                        >
                                            <option value="Friendly">Friendly</option>
                                            <option value="Aggressive">Aggressive</option>
                                            <option value="Anxious">Anxious</option>
                                            <option value="Scared">Scared</option>
                                            <option value="Protective">Protective</option>
                                        </select>
                                    </div>

                                    <BehaviorHistoryField
                                        label="Bite history"
                                        question="Declared: has bitten a person or another animal before"
                                        verifiedCount={verifiedBites}
                                        declared={declaredBite}
                                        accent="accent-role"
                                        onChange={setDeclaredBite}
                                    />

                                    <BehaviorHistoryField
                                        label="Chasing"
                                        question="Declared: chases people, animals or vehicles"
                                        verifiedCount={verifiedChases}
                                        declared={declaredChase}
                                        accent="accent-role"
                                        onChange={setDeclaredChase}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* STEP 2: OWNER ASSIGNMENT (Subdivision Specific) */}
                    {/* ========================================================================= */}
                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                            
                            {/* Mode Selection Tabs */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-gray-100 rounded-2xl border border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOwnerMode('existing');
                                        setErrorMessage(null);
                                        if (usersList.length === 0) fetchRegisteredUsers();
                                    }}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer ${ownerMode === 'existing' ? 'bg-white text-role shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    Existing Resident
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOwnerMode('new');
                                        setErrorMessage(null);
                                    }}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer ${ownerMode === 'new' ? 'bg-role text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                    </svg>
                                    Owner Without Account
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOwnerMode('none');
                                        setErrorMessage(null);
                                    }}
                                    className={`py-2.5 px-3 rounded-xl text-xs font-black transition-all uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer ${ownerMode === 'none' ? 'bg-amber-600 text-white shadow-md' : 'text-gray-500 hover:text-gray-800'}`}
                                >
                                    <span>🐾</span>
                                    No Owner Yet
                                </button>
                            </div>

                            {/* OPTION C: NO OWNER YET */}
                            {ownerMode === 'none' && (
                                <div className="p-6 bg-amber-50/70 border border-amber-200 rounded-3xl space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center text-lg font-black shrink-0">
                                            🐾
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-black text-amber-950 uppercase tracking-tight">Register as Unassigned / Community Animal</h4>
                                            <p className="text-[11px] font-semibold text-amber-800">Unidentified stray animal or community pet with no registered owner yet</p>
                                        </div>
                                    </div>
                                    <div className="p-4 bg-white/80 rounded-2xl border border-amber-100 text-xs text-gray-700 leading-relaxed font-medium space-y-2">
                                        <p>
                                            • This pet record will be added under the subdivision's jurisdiction without an assigned resident owner.
                                        </p>
                                        <p>
                                            • The AI will recognize it as an officially registered candidate in matching workflows.
                                        </p>
                                        <p>
                                            • Subdivision staff can assign or register an owner later at any time from Pet Records.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* OPTION A: SELECT EXISTING OWNER */}
                            {ownerMode === 'existing' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest pl-1">Search Resident Account</label>
                                        <button 
                                            type="button"
                                            onClick={() => setOwnerMode('new')}
                                            className="text-[10px] font-black text-role hover:underline uppercase tracking-wider cursor-pointer"
                                        >
                                            + Owner has no account? Add their details
                                        </button>
                                    </div>

                                    <div className="relative">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                        </svg>
                                        <input
                                            type="text"
                                            placeholder="Search resident by name, email or phone..."
                                            value={userSearchTerm}
                                            onChange={(e) => setUserSearchTerm(e.target.value)}
                                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 placeholder-gray-400 focus:bg-white focus:border-role outline-none transition-all"
                                        />
                                    </div>

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
                                                className="mt-3 px-4 py-2 bg-role text-white rounded-xl text-xs font-bold hover:bg-role-hover transition-all cursor-pointer"
                                            >
                                                Add Owner Without an Account
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
                                                        className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${isSelected ? 'border-role bg-role-soft/60 shadow-sm ring-2 ring-role/20' : 'border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50/50'}`}
                                                    >
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <img loading="lazy" decoding="async" 
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
                                                                <span className="w-6 h-6 rounded-full bg-role text-white flex items-center justify-center font-bold text-xs">
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
                                </div>
                            )}

                            {/* OPTION B: CREATE NEW OWNER */}
                            {ownerMode === 'new' && (
                                <div className="space-y-4 bg-gray-50 p-6 rounded-3xl border border-gray-100">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="w-2.5 h-2.5 rounded-full bg-role"></span>
                                        <h4 className="text-xs font-black text-gray-900 uppercase tracking-widest">Owner Details (No StraySafe Account)</h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest pl-1">Full Name *</label>
                                            <input 
                                                type="text" 
                                                value={newOwnerName}
                                                onChange={(e) => setNewOwnerName(e.target.value)}
                                                placeholder="e.g. Juan Dela Cruz" 
                                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:border-role outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest pl-1">Phone Number (or address) *</label>
                                            <PhoneInput 
                                                 
                                                value={newOwnerPhone}
                                                onChange={(e) => setNewOwnerPhone(e.target.value)}
                                                placeholder="09123456789" 
                                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:border-role outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest pl-1">Address / Block & Lot</label>
                                            <input 
                                                type="text" 
                                                value={newOwnerAddress}
                                                onChange={(e) => setNewOwnerAddress(e.target.value)}
                                                placeholder="Block 12, Lot 5, Phase 2" 
                                                className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:border-role outline-none"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-[10px] font-semibold text-gray-400 pl-1">
                                        💡 No account is created. The owner's name and contact are saved on this pet's record, so a later case of this pet shows who the owner is. If they sign up later, link their account from Pet Records (Assign Owner).
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <footer className="shrink-0 bg-white px-8 py-5 flex items-center justify-between border-t border-gray-100">
                    {step === 1 ? (
                        <>
                            <button
                                type="button"
                                onClick={handleClose}
                                className="px-6 py-3.5 text-xs font-black uppercase tracking-wider text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleNextStep}
                                className="px-8 py-3.5 bg-role hover:bg-role-hover text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-role-muted transition-all flex items-center gap-2 cursor-pointer"
                            >
                                <span>Next: Owner Assignment</span>
                                <span>→</span>
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="px-6 py-3.5 text-xs font-black uppercase tracking-wider text-gray-500 hover:text-gray-900 transition-colors flex items-center gap-2 cursor-pointer"
                            >
                                <span>←</span>
                                <span>Back to Pet Info</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleCompleteRegistration}
                                disabled={isSubmitting}
                                className="px-8 py-3.5 bg-role hover:bg-role-hover text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-role-muted transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        <span>Registering...</span>
                                    </>
                                ) : (
                                    <>
                                        <span>✓</span>
                                        <span>Complete Registration</span>
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </footer>
            </div>
            {registerAnother && (
                <RegisterAnotherPrompt petName={registerAnother.petName} count={registerAnother.count}
                    onNo={() => {
                        setRegisterAnother(null);
                        if (onPetCreated) onPetCreated(lastCreated);
                        setLastCreated(null);
                        handleClose();
                    }}
                    onYes={() => {
                        const previous = registerAnother.petId;
                        setRegisterAnother(null);
                        resetForm(true);               // new pet details; same owner; same photo in memory
                        setFromPhotoOfPetId(previous);
                        photoGuard.setCropping(true);  // crop the next animal right away
                    }} />
            )}
        </div>
    );
};

export default AddPetModal;
