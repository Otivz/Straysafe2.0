/**
 * Animal breed suggestions and autocomplete helpers categorized by animal type.
 * Common breeds in the Philippines (e.g. Aspin, Puspin, Shih Tzu, etc.) are prioritized.
 */

export const DOG_BREEDS: readonly string[] = [
  'Aspin (Asong Pinoy)',
  'Shih Tzu',
  'Pomeranian',
  'Golden Retriever',
  'Labrador Retriever',
  'Siberian Husky',
  'German Shepherd',
  'Poodle (Toy / Standard)',
  'Chihuahua',
  'Pug',
  'French Bulldog',
  'Belgian Malinois',
  'Beagle',
  'Dachshund',
  'Chow Chow',
  'Rottweiler',
  'Doberman',
  'American Bully / Pitbull',
  'Jack Russell Terrier',
  'Corgi',
  'Dalmatian',
  'Boxer',
  'Samoyed',
  'Maltese',
  'Yorkshire Terrier',
  'Bichon Frise',
  'Alaskan Malamute',
  'Cocker Spaniel',
  'Great Dane',
  'Mixed / Mutt',
] as const;

export const CAT_BREEDS: readonly string[] = [
  'Puspin (Pusang Pinoy)',
  'Persian',
  'Siamese',
  'British Shorthair',
  'Scottish Fold',
  'Maine Coon',
  'Bengal',
  'Ragdoll',
  'Russian Blue',
  'American Shorthair',
  'Sphynx',
  'Munchkin',
  'Himalayan',
  'Birman',
  'Abyssinian',
  'Exotic Shorthair',
  'Domestic Longhair',
  'Mixed / Domestic Shorthair',
] as const;

export const BIRD_BREEDS: readonly string[] = [
  'Parakeet / Budgerigar',
  'Cockatiel',
  'Lovebird',
  'Pigeon / Dove',
  'Canary',
  'Finch',
  'Parrot',
  'Native / Wild Bird',
] as const;

export const SMALL_MAMMAL_BREEDS: readonly string[] = [
  'Rabbit',
  'Hamster (Syrian / Dwarf)',
  'Guinea Pig',
  'Hedgehog',
  'Ferret',
  'Chinchilla',
] as const;

export const COMMON_BREEDS_ALL: readonly string[] = [
  'Aspin (Asong Pinoy)',
  'Puspin (Pusang Pinoy)',
  'Shih Tzu',
  'Persian',
  'Pomeranian',
  'Golden Retriever',
  'Siamese',
  'Labrador Retriever',
  'British Shorthair',
  'Siberian Husky',
  'German Shepherd',
  'Poodle',
  'Chihuahua',
  'Mixed / Crossbreed',
] as const;

export function getBreedsForAnimalType(animalType?: string | null): readonly string[] {
  if (!animalType) return COMMON_BREEDS_ALL;
  const t = animalType.toLowerCase().trim();
  if (t === 'dog') return DOG_BREEDS;
  if (t === 'cat') return CAT_BREEDS;
  if (t === 'bird') return BIRD_BREEDS;
  if (t === 'small_mammal') return SMALL_MAMMAL_BREEDS;
  return COMMON_BREEDS_ALL;
}

export function filterBreedSuggestions(
  animalType?: string | null,
  query: string = '',
  limit = 25
): string[] {
  const list = getBreedsForAnimalType(animalType);
  const q = query.trim().toLowerCase();
  if (!q) {
    return list.slice(0, limit);
  }

  const starts: string[] = [];
  const contains: string[] = [];

  for (const breed of list) {
    const lower = breed.toLowerCase();
    if (lower.startsWith(q)) {
      starts.push(breed);
    } else if (lower.includes(q)) {
      contains.push(breed);
    }
  }

  return [...starts, ...contains].slice(0, limit);
}
