// What to call a registered animal on screen: its real name, or "Animal SS-0042" (its permanent Animal Reference
// Code) when it has no name; never the database id. The description ("Brown Aspin • Male • Medium") goes below it.
const UNNAMED = new Set(['', 'no name', 'noname', 'unknown', 'unnamed', 'unnamed pet', 'unnamed animal', 'adopted pet',
    'restored pet', 'n/a', 'na', 'none', '-']);

export const isUnnamedPet = (name?: string | null): boolean => UNNAMED.has((name || '').trim().toLowerCase());

const clean = (v?: string | null): string => {
    const s = (v || '').trim();
    return isUnnamedPet(s) ? '' : s;
};

const titleCase = (s: string): string => s.replace(/\b\w/g, (c) => c.toUpperCase());

export function petName(p: any): string {
    if (!p) return '';
    if (p.display_name) return p.display_name;
    const raw = p.pet_name ?? p.rawName ?? p.name;
    if (!isUnnamedPet(raw)) return String(raw).trim();
    const code = p.reference_code || p.referenceCode;
    return code ? `Animal ${code}` : 'Unnamed animal';
}

export function petDescription(p: any): string {
    if (!p) return '';
    if (p.description_line) return p.description_line;
    const colors: string[] = [];
    [p.primary_color ?? p.primaryColor, p.secondary_color ?? p.secondaryColor].forEach((c: string) => {
        const v = clean(c);
        if (v && !colors.some((x) => x.toLowerCase() === v.toLowerCase())) colors.push(titleCase(v));
    });
    const breed = clean(p.breed) || clean(p.pet_type) || clean(p.species);
    const head = [colors.join(' & '), breed].filter(Boolean).join(' ');
    return [head, clean(p.gender), clean(p.size_category ?? p.sizeCategory)].filter(Boolean).join(' • ');
}
