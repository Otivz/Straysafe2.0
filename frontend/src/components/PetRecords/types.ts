import { petDescription, petName } from '../../utils/petName';
import { getPetPicture } from '../../utils/avatar';
import { calculateAge } from '../../utils/petAge';

export interface PetRecord {
    id: string;
    name: string;
    /** The stored name ("No Name" for unnamed pets); `name` is what to show. Use this one in edit forms. */
    rawName?: string;
    /** Permanent Animal Reference Code (SS-0001...), the visible id for an unnamed animal */
    referenceCode?: string;
    /** "Brown Aspin • Male • Medium", shown under the name/code */
    description?: string;
    gender: string;
    age: string;
    birthDate?: string;
    birth_date?: string;
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
    // what the owner or registering officer declared (not verified by an incident report)
    declared_bite_history?: boolean;
    declared_chase_behavior?: boolean;
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
    // In the adoption process (from the server): adopted / in_progress lock ownership; applications = in the catalog
    adoptionInfo?: { state: 'adopted' | 'in_progress' | 'applications'; adoption_id: number | null; adopter_name: string | null; stage: string | null; pending_applications: number } | null;
    
    registered_by_user_id?: number | string | null;
    registeredByName?: string;
    registered_by_name?: string;
    registeredAt?: string;

    rawPetObj?: any;
    /** Owner without a StraySafe account (recorded when the pet was returned to them) */
    offlineOwnerName?: string | null;
}

export const mapRawPetToPetRecord = (pet: any): PetRecord => {
    if (!pet) return {} as PetRecord;
    const ownerObj = pet.owner || {};
    return {
        id: (pet.pet_id || pet.id || '').toString(),
        name: petName(pet),
        rawName: pet.pet_name ?? pet.rawName ?? pet.name,
        referenceCode: pet.reference_code ?? pet.referenceCode,
        description: petDescription(pet),
        gender: pet.gender || 'Unknown',
        age: calculateAge(pet.birth_date, pet.estimated_age || pet.age) || 'Unknown',
        birthDate: pet.birth_date || undefined,
        birth_date: pet.birth_date || undefined,
        breed: pet.breed || 'Unknown',
        species: pet.pet_type || pet.species || 'Dog',
        ownerName: ownerObj.name || pet.owner_name || (pet.owner_id ? 'Unknown Owner' : (pet.emergency_contact_name ? `${pet.emergency_contact_name} (No StraySafe Account)` : 'No Owner (Community Animal)')),
        offlineOwnerName: !pet.owner_id && !ownerObj.user_id ? (pet.emergency_contact_name || null) : null,
        ownerEmail: ownerObj.email || pet.owner_email || (pet.owner_id ? 'No Email' : 'Unassigned'),
        ownerPhone: pet.emergency_contact_phone || ownerObj.phone || pet.owner_phone || (pet.owner_id ? 'No Contact' : 'Unassigned'),
        ownerPhoto: ownerObj.profile_picture || pet.owner_photo || pet.owner_profile_picture || null,
        ownerAddress: ownerObj.address || pet.registered_address || pet.owner_address || null,
        owner_id: pet.owner_id || ownerObj.user_id || null,
        adoptionInfo: pet.adoption_info || null,
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
        declared_bite_history: !!pet.declared_bite_history,
        declared_chase_behavior: !!pet.declared_chase_behavior,
        healthCondition: pet.health_condition || pet.healthCondition || 'Healthy and active',
        notes: pet.notes || '',
        vaccineCardUrl: pet.vaccine_card_url || pet.vaccineCardUrl || null,
        registered_by_user_id: pet.registered_by_user_id || pet.registered_by?.user_id || null,
        registeredByName: pet.registered_by_name || pet.registered_by?.name || (pet.owner?.name ? `${pet.owner.name} (Resident Owner)` : 'Subdivision Leader / Staff'),
        registered_by_name: pet.registered_by_name || pet.registered_by?.name || (pet.owner?.name ? `${pet.owner.name} (Resident Owner)` : 'Subdivision Leader / Staff'),
        registeredAt: pet.created_at || pet.registeredAt || null,
        rawPetObj: pet
    };
};

export type PetSortOrder = 'newest' | 'oldest';

export const sortPetRecords = (records: PetRecord[], order: PetSortOrder = 'newest'): PetRecord[] => {
    return [...records].sort((a, b) => {
        // Try parsing timestamps
        const timeA = a.registeredAt ? new Date(a.registeredAt).getTime() : 0;
        const timeB = b.registeredAt ? new Date(b.registeredAt).getTime() : 0;

        if (timeA && timeB && timeA !== timeB && !isNaN(timeA) && !isNaN(timeB)) {
            return order === 'newest' ? timeB - timeA : timeA - timeB;
        }

        // Try numeric ID
        const idA = parseInt(a.id, 10);
        const idB = parseInt(b.id, 10);
        if (!isNaN(idA) && !isNaN(idB) && idA !== idB) {
            return order === 'newest' ? idB - idA : idA - idB;
        }

        // Try extracting numbers from idNumber (e.g., "P-00004")
        const numIdA = parseInt((a.idNumber || '').replace(/\D/g, ''), 10);
        const numIdB = parseInt((b.idNumber || '').replace(/\D/g, ''), 10);
        if (!isNaN(numIdA) && !isNaN(numIdB) && numIdA !== numIdB) {
            return order === 'newest' ? numIdB - numIdA : numIdA - numIdB;
        }

        // Try extracting numbers from referenceCode (e.g., "SS-0004")
        const refNumA = parseInt((a.referenceCode || '').replace(/\D/g, ''), 10);
        const refNumB = parseInt((b.referenceCode || '').replace(/\D/g, ''), 10);
        if (!isNaN(refNumA) && !isNaN(refNumB) && refNumA !== refNumB) {
            return order === 'newest' ? refNumB - refNumA : refNumA - refNumB;
        }

        return 0;
    });
};
