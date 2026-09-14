import { getPetPicture } from '../../utils/avatar';

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
    ownerPhoto?: string | null;
    ownerAddress?: string | null;
    idNumber: string;
    status: string;
    avatar: string;
    weight?: string;
    microchipId?: string;
    insuranceProvider?: string;
    
    // Expanded fields
    primaryColor?: string;
    primary_color?: string;
    secondaryColor?: string;
    secondary_color?: string;
    tertiaryColor?: string;
    tertiary_color?: string;
    colorMarkings?: string;
    color_markings?: string;
    sizeCategory?: string;
    size_category?: string;
    isVaccinated?: boolean;
    is_vaccinated?: boolean;
    vaccinationDate?: string;
    vaccination_date?: string;
    isNeutered?: boolean;
    is_neutered?: boolean;
    temperament?: string;
    hasBiteHistory?: boolean;
    has_bite_history?: boolean;
    biteIncidentCount?: number;
    bite_incident_count?: number;
    chaseBehavior?: boolean;
    chase_behavior?: boolean;
    chaseIncidentCount?: number;
    chase_incident_count?: number;
    healthCondition?: string;
    health_condition?: string;
    notes?: string;
    vaccineCardUrl?: string;
    vaccine_card_url?: string;
    photo_url?: string;
    photo_front_url?: string;
    photo_left_url?: string;
    photo_right_url?: string;
    owner_id?: number | string;
    
    registeredByName?: string;
    registered_by_name?: string;
    registeredAt?: string;

    rawPetObj?: any;
}

export const mapRawPetToPetRecord = (pet: any): PetRecord => {
    if (!pet) return {} as PetRecord;
    const ownerObj = pet.owner || {};
    return {
        id: (pet.pet_id || pet.id || '').toString(),
        name: pet.pet_name || pet.name || 'Unknown',
        gender: pet.gender || 'Unknown',
        age: pet.estimated_age || pet.age || 'Unknown',
        breed: pet.breed || 'Unknown',
        species: pet.pet_type || pet.species || 'Dog',
        ownerName: ownerObj.name || pet.owner_name || (pet.owner_id ? 'Unknown Owner' : 'No Owner (Community Animal)'),
        ownerEmail: ownerObj.email || pet.owner_email || (pet.owner_id ? 'No Email' : 'Unassigned'),
        ownerPhone: pet.emergency_contact_phone || ownerObj.phone || pet.owner_phone || (pet.owner_id ? 'No Contact' : 'Unassigned'),
        ownerPhoto: ownerObj.profile_picture || pet.owner_photo || pet.owner_profile_picture || null,
        ownerAddress: ownerObj.address || pet.registered_address || pet.owner_address || null,
        owner_id: pet.owner_id || ownerObj.user_id || null,
        idNumber: `P-${(pet.pet_id || pet.id || '').toString().padStart(5, '0')}`,
        status: pet.status || 'Active',
        avatar: getPetPicture(pet.photo_url || pet.avatar),
        weight: pet.weight ? (typeof pet.weight === 'string' && pet.weight.includes('kg') ? pet.weight : `${pet.weight}kg`) : 'Unknown',
        primaryColor: pet.primary_color || (pet.color_markings ? pet.color_markings.split(' ')[0] : 'Unknown'),
        secondaryColor: pet.secondary_color || '',
        tertiaryColor: pet.tertiary_color || '',
        colorMarkings: pet.color_markings || pet.distinctive_markings || 'None',
        sizeCategory: pet.size_category || 'Medium',
        isVaccinated: pet.is_vaccinated ?? pet.isVaccinated ?? false,
        vaccinationDate: pet.vaccination_date || pet.vaccinationDate || null,
        isNeutered: pet.is_neutered ?? pet.isNeutered ?? false,
        temperament: pet.temperament || 'Friendly',
        hasBiteHistory: pet.has_bite_history ?? pet.hasBiteHistory ?? false,
        biteIncidentCount: pet.bite_incident_count ?? pet.biteIncidentCount ?? 0,
        chaseBehavior: pet.chase_behavior ?? pet.chaseBehavior ?? false,
        chaseIncidentCount: pet.chase_incident_count ?? pet.chaseIncidentCount ?? 0,
        healthCondition: pet.health_condition || pet.healthCondition || 'Healthy and active',
        notes: pet.notes || '',
        vaccineCardUrl: pet.vaccine_card_url || pet.vaccineCardUrl || null,
        registeredByName: pet.registered_by_name || pet.registered_by?.name || (pet.owner?.name ? `${pet.owner.name} (Resident Owner)` : 'Subdivision Leader / Staff'),
        registeredAt: pet.created_at || pet.registeredAt || null,
        rawPetObj: pet
    };
};
