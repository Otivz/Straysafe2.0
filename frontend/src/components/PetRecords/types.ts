export interface PetRecord {
    id: string;
    name: string;
    gender: string;
    age: string;
    breed: string;
    species: string;
    ownerName: string;
    ownerEmail: string;
    ownerPhone?: string;
    idNumber: string;
    status: string;
    avatar: string;
    weight?: string;
    microchipId?: string;
    insuranceProvider?: string;
    
    // Expanded fields
    primaryColor?: string;
    secondaryColor?: string;
    tertiaryColor?: string;
    colorMarkings?: string;
    sizeCategory?: string;
    isVaccinated?: boolean;
    vaccinationDate?: string;
    isNeutered?: boolean;
    temperament?: string;
    hasBiteHistory?: boolean;
    chaseBehavior?: boolean;
    healthCondition?: string;
    notes?: string;
    vaccineCardUrl?: string;
    
    registeredByName?: string;
    registeredAt?: string;

    rawPetObj?: any;
}

import { getPetPicture } from '../../utils/avatar';

export const mapRawPetToPetRecord = (pet: any): PetRecord => {
    if (!pet) return {} as PetRecord;
    return {
        id: (pet.pet_id || pet.id || '').toString(),
        name: pet.pet_name || pet.name || 'Unknown',
        gender: pet.gender || 'Unknown',
        age: pet.estimated_age || pet.age || 'Unknown',
        breed: pet.breed || 'Unknown',
        species: pet.pet_type || pet.species || 'Dog',
        ownerName: pet.owner?.name || pet.owner_name || (pet.owner_id ? 'Unknown Owner' : 'No Owner (Community Animal)'),
        ownerEmail: pet.owner?.email || pet.owner_email || (pet.owner_id ? 'No Email' : 'Unassigned'),
        ownerPhone: pet.emergency_contact_phone || pet.owner?.phone || pet.owner_phone || (pet.owner_id ? 'No Contact' : 'Unassigned'),
        idNumber: `P-${(pet.pet_id || pet.id || '').toString().padStart(5, '0')}`,
        status: pet.status || 'Active',
        avatar: getPetPicture(pet.photo_url || pet.avatar),
        weight: pet.weight ? (typeof pet.weight === 'string' && pet.weight.includes('kg') ? pet.weight : `${pet.weight}kg`) : 'Unknown',
        primaryColor: pet.primary_color || (pet.color_markings ? pet.color_markings.split(' ')[0] : 'Unknown'),
        secondaryColor: pet.secondary_color || '',
        tertiaryColor: pet.tertiary_color || '',
        colorMarkings: pet.color_markings || pet.distinctive_markings || 'None',
        sizeCategory: pet.size_category || 'Medium',
        isVaccinated: pet.is_vaccinated ?? false,
        vaccinationDate: pet.vaccination_date || null,
        isNeutered: pet.is_neutered ?? false,
        temperament: pet.temperament || 'Friendly',
        hasBiteHistory: pet.has_bite_history ?? false,
        chaseBehavior: pet.chase_behavior ?? false,
        healthCondition: pet.health_condition || 'Healthy and active',
        notes: pet.notes || '',
        vaccineCardUrl: pet.vaccine_card_url || null,
        registeredByName: pet.registered_by_name || pet.registered_by?.name || (pet.owner?.name ? `${pet.owner.name} (Resident Owner)` : 'Subdivision Leader / Staff'),
        registeredAt: pet.created_at || null,
        rawPetObj: pet
    };
};
