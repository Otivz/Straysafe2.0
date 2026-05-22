export interface PetRecord {
    id: string;
    name: string;
    gender: 'Male' | 'Female';
    age: string;
    breed: string;
    species: string;
    ownerName: string;
    ownerEmail: string;
    idNumber: string;
    status: 'VACCINATED' | 'MEDICAL ALERT' | 'PENDING DOCS';
    avatar: string;
    weight?: string;
    microchipId?: string;
    insuranceProvider?: string;
}
