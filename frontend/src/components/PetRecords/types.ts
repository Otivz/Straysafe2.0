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
