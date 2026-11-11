import type { Pet } from '../data/types';

/** "Shih Tzu · White and gold · 3 years" for lists and summaries. */
export const petSummary = (p: Pet): string => [p.breed, p.color, p.ageText].filter(Boolean).join(' · ');
