/**
 * Pet age and coat pattern utilities for StraySafe 2.0.
 * Allows dynamic age calculation based on birth_date so pet records age automatically,
 * and provides standardized coat patterns with plain-English descriptions for residents.
 */

export interface CoatPatternPreset {
    id: string;
    label: string;
    description: string;
    suggestedFor?: 'Dog' | 'Cat' | 'Both';
}

export const COAT_PATTERN_PRESETS: CoatPatternPreset[] = [
    {
        id: 'Solid',
        label: 'Solid / Plain',
        description: 'Single solid color all over the body (no patches or spots)',
        suggestedFor: 'Both',
    },
    {
        id: 'Bicolor',
        label: 'Bicolor / Patched',
        description: 'Two distinct colors (e.g. white chest/belly with dark body)',
        suggestedFor: 'Both',
    },
    {
        id: 'Tuxedo',
        label: 'Tuxedo',
        description: 'Dark body with white chest, belly, and paws (like wearing a suit)',
        suggestedFor: 'Both',
    },
    {
        id: 'Tricolor',
        label: 'Tricolor / Calico',
        description: 'Three distinct colors (e.g. black, white, and tan or orange patches)',
        suggestedFor: 'Both',
    },
    {
        id: 'Brindle',
        label: 'Brindle (Tiger Stripes)',
        description: 'Subtle dark tiger stripes over a brown, tan, or golden coat (common in Aspins)',
        suggestedFor: 'Dog',
    },
    {
        id: 'Tabby',
        label: 'Tabby (Striped / Swirled)',
        description: 'Tiger stripes, swirls, or "M" mark on the forehead (classic Puspin coat)',
        suggestedFor: 'Cat',
    },
    {
        id: 'Socks',
        label: 'Socks / Booties',
        description: 'White paws or legs on all four feet with a darker body',
        suggestedFor: 'Both',
    },
    {
        id: 'Mask',
        label: 'Mask / Dark Muzzle',
        description: 'Darker fur over the muzzle, face, or around the eyes',
        suggestedFor: 'Dog',
    },
    {
        id: 'Points',
        label: 'Points / Colorpoint',
        description: 'Darker face, ears, paws, and tail with a lighter body (like Siamese cats)',
        suggestedFor: 'Cat',
    },
    {
        id: 'Blaze',
        label: 'Blaze / Chest Star',
        description: 'White vertical stripe between the eyes or white star patch on the chest',
        suggestedFor: 'Both',
    },
    {
        id: 'Spotted',
        label: 'Spotted / Flecked',
        description: 'Small distinct dots, flecks, or tick marks scattered across the fur',
        suggestedFor: 'Both',
    },
    {
        id: 'Saddle',
        label: 'Saddle / Blanket',
        description: 'Darker patch covering the back like a saddle (e.g. German Shepherd / Hound)',
        suggestedFor: 'Dog',
    },
    {
        id: 'Merle',
        label: 'Merle / Dappled',
        description: 'Mottled patches of color with irregular edges and marbled coloring',
        suggestedFor: 'Both',
    },
    {
        id: 'Other',
        label: 'Other / Unique Markings',
        description: 'Custom, distinctive markings or scars not listed above',
        suggestedFor: 'Both',
    },
];

/**
 * Calculates human-readable dynamic age from a birth date.
 * Automatically advances as time passes.
 */
export function calculateAge(birthDateStr?: string | null, fallbackAge?: string | null): string {
    if (!birthDateStr) {
        return fallbackAge || 'Unknown age';
    }

    try {
        const birth = new Date(birthDateStr);
        if (isNaN(birth.getTime())) {
            return fallbackAge || 'Unknown age';
        }

        const now = new Date();
        let years = now.getFullYear() - birth.getFullYear();
        let months = now.getMonth() - birth.getMonth();
        let days = now.getDate() - birth.getDate();

        if (days < 0) {
            months -= 1;
        }
        if (months < 0) {
            years -= 1;
            months += 12;
        }

        if (years <= 0 && months <= 0) {
            const diffTime = Math.max(0, now.getTime() - birth.getTime());
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays <= 7) return 'Newborn';
            const weeks = Math.floor(diffDays / 7);
            return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} old`;
        }

        if (years <= 0) {
            return `${months} ${months === 1 ? 'month' : 'months'} old`;
        }

        if (years === 1 && months > 0) {
            return `1 yr ${months} ${months === 1 ? 'mo' : 'mos'}`;
        }

        if (months === 0) {
            return `${years} ${years === 1 ? 'year' : 'years'} old`;
        }

        return `${years} yrs ${months} mos`;
    } catch {
        return fallbackAge || 'Unknown age';
    }
}

/**
 * Estimates an approximate birth date (YYYY-MM-DD) from a user-supplied age in years & months.
 */
export function approximateBirthDateFromAge(years: number | '', months: number | '' = ''): string {
    if (years === '' && months === '') return '';
    const now = new Date();
    const estDate = new Date(now.getFullYear() - Number(years), now.getMonth() - Number(months), 15);
    return estDate.toISOString().slice(0, 10);
}

/**
 * Parses an existing pet's birth_date or estimated_age string into years and months
 * to initialize the form.
 */
export function parseAgeToYearsMonths(birthDateStr?: string | null, estimatedAgeStr?: string | null): {
    years: number | '';
    months: number | '';
    birthDate: string;
    hasExactDate: boolean;
} {
    if (birthDateStr) {
        try {
            const birth = new Date(birthDateStr);
            if (!isNaN(birth.getTime())) {
                const now = new Date();
                let years = now.getFullYear() - birth.getFullYear();
                let months = now.getMonth() - birth.getMonth();
                if (now.getDate() < birth.getDate()) months -= 1;
                if (months < 0) {
                    years -= 1;
                    months += 12;
                }
                return {
                    years: Math.max(0, years),
                    months: Math.max(0, months),
                    birthDate: birthDateStr.slice(0, 10),
                    hasExactDate: true,
                };
            }
        } catch { }
    }

    // Try parsing free-form string like "2 years", "6 months", "Puppy", "1 yr 3 mos"
    const raw = (estimatedAgeStr || '').toLowerCase();
    let years = 0;
    let months = 0;

    const yrMatch = raw.match(/(\d+)\s*(?:years?|yrs?)/);
    const moMatch = raw.match(/(\d+)\s*(?:months?|mos?)/);

    if (yrMatch) years = parseInt(yrMatch[1], 10);
    if (moMatch) months = parseInt(moMatch[1], 10);

    if (!yrMatch && !moMatch) {
        if (raw.includes('puppy') || raw.includes('kitten')) {
            months = 4;
        } else if (raw.includes('senior')) {
            years = 9;
        } else if (raw.includes('adult')) {
            years = 3;
        } else if (!raw.includes('newborn') && !/\d+\s*weeks?/.test(raw)) {
            return { years: '', months: '', birthDate: '', hasExactDate: false };
        }
    }

    return {
        years,
        months,
        birthDate: '',
        hasExactDate: false,
    };
}

/**
 * Parses existing color_markings string to extract pattern preset and specific details.
 */
export function parseCoatPattern(rawStr?: string | null): { pattern: string; details: string } {
    if (!rawStr || !rawStr.trim() || rawStr.trim().toLowerCase() === 'none') {
        return { pattern: '', details: '' };
    }

    const clean = rawStr.trim();

    // Check if it matches a preset id or label directly
    for (const p of COAT_PATTERN_PRESETS) {
        if (clean.toLowerCase() === p.id.toLowerCase() || clean.toLowerCase() === p.label.toLowerCase()) {
            return { pattern: p.id, details: '' };
        }
    }

    // Check if formatted like "Pattern — details" or "Pattern: details"
    const colonIdx = clean.indexOf(':');
    const dashIdx = clean.indexOf('—');
    const separatorIdx = colonIdx !== -1 ? colonIdx : dashIdx;

    if (separatorIdx !== -1) {
        const potentialPattern = clean.slice(0, separatorIdx).trim();
        const details = clean.slice(separatorIdx + 1).trim();

        const match = COAT_PATTERN_PRESETS.find(
            p => p.id.toLowerCase() === potentialPattern.toLowerCase() || p.label.toLowerCase().includes(potentialPattern.toLowerCase())
        );
        if (match) {
            return { pattern: match.id, details };
        }
    }

    // Try keyword search
    const lower = clean.toLowerCase();
    for (const p of COAT_PATTERN_PRESETS) {
        if (p.id !== 'Other' && p.id !== 'Solid' && lower.includes(p.id.toLowerCase())) {
            const remaining = clean.replace(new RegExp(p.id, 'i'), '').replace(/^[:—\s,-]+/, '').trim();
            return { pattern: p.id, details: remaining };
        }
    }

    return { pattern: 'Other', details: clean };
}

/**
 * Combines pattern and specific details into the stored string.
 */
export function composeCoatMarkings(pattern: string, details: string): string {
    const cleanPattern = pattern.trim();
    const cleanDetails = details.trim();

    if (!cleanPattern && !cleanDetails) return '';
    if (!cleanPattern || cleanPattern === 'Other') return cleanDetails || 'Custom';
    if (!cleanDetails) return cleanPattern;

    return `${cleanPattern} — ${cleanDetails}`;
}
