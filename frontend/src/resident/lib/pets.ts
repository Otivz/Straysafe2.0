import type { Pet } from '../data/types';

/** A starting description for a lost-pet notice, from what the resident already registered. Editable before it is sent. */
export const describePet = (p: Pet): string =>
  `${p.name} is a ${p.color.toLowerCase()} ${p.breed || p.type}${p.ageText ? `, about ${p.ageText} old` : ''}. ${p.markings.length ? `Markings: ${p.markings.join(', ')}. ` : ''}${p.description}`.trim();

/** "Shih Tzu · White and gold · 3 years" for lists and summaries. */
export const petSummary = (p: Pet): string => [p.breed, p.color, p.ageText].filter(Boolean).join(' · ');
