// Manual Matching display (docs/01-system/MANUAL_REPORT_MATCHING.md, "Manual comparison display"): the actual values
// the reporter submitted and the actual pet registration record, side by side. Never AI-detected values, generated
// descriptions or scores. A missing value shows as "Not Provided".
import { parseReportDescription } from './reportDescription.ts';

export const NOT_PROVIDED = 'Not Provided';

export interface ComparisonField {
    label: string;
    value: string;
    long?: boolean;
}

/** The report as submitted (only reporter-entered fields; the ai_* columns are deliberately not read). */
export interface ManualReportSource {
    report_id: number;
    animal_type?: string | null;
    animal_breed?: string | null;
    animal_color?: string | null;
    estimated_size?: string | null;
    description?: string | null;
    condition?: string | null;
    landmark?: string | null;
    initial_landmark?: string | null;
    created_at?: string | null;
    animal_count?: number | null;
    category_name?: string | null;
}

/** The pet registration record as saved. */
export interface ManualPetSource {
    pet_id: number;
    pet_name?: string | null;
    reference_code?: string | null;
    pet_type?: string | null;
    breed?: string | null;
    color_markings?: string | null;
    primary_color?: string | null;
    secondary_color?: string | null;
    tertiary_color?: string | null;
    size_category?: string | null;
    distinctive_markings?: string | null;
    registered_address?: string | null;
    owner_name?: string | null;
    notes?: string | null;
    gender?: string | null;
    estimated_age?: string | null;
    is_neutered?: boolean | null;
}

/** A recorded value, or "Not Provided" (empty, blank or a placeholder such as "unknown"). */
export function shown(v: unknown): string {
    if (v === null || v === undefined) return NOT_PROVIDED;
    const t = String(v).trim();
    return !t || ['unknown', 'none', 'n/a', 'null', 'undefined', '-', '—'].includes(t.toLowerCase()) ? NOT_PROVIDED : t;
}

const dateTime = (iso?: string | null) => {
    if (!iso) return NOT_PROVIDED;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? NOT_PROVIDED
        : d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const join = (...parts: Array<string | null | undefined>) =>
    parts.map((p) => (p || '').trim()).filter((p) => p && shown(p) !== NOT_PROVIDED).join(' · ');

export const petIdLabel = (pet: { pet_id: number; reference_code?: string | null }) =>
    `P-${String(pet.pet_id).padStart(5, '0')}${pet.reference_code ? ` (${pet.reference_code})` : ''}`;

export function reportFields(r: ManualReportSource): ComparisonField[] {
    // The reporter's own description, split into its labelled parts (Pattern / Markings / Observed Conditions / Notes)
    const d = parseReportDescription(r.description);
    const fields: ComparisonField[] = [
        { label: 'Report ID', value: `#${r.report_id}` },
        { label: 'Animal type', value: shown(r.animal_type) },
        { label: 'Breed', value: shown(r.animal_breed) },
        { label: 'Color', value: shown(r.animal_color) },
        { label: 'Size', value: shown(r.estimated_size) },
        { label: 'Distinguishing marks', value: shown(join(d.markings, d.pattern && `Pattern: ${d.pattern}`)), long: true },
        { label: 'Original sighting location', value: shown(r.initial_landmark || r.landmark) },
        { label: 'Date and time reported', value: dateTime(r.created_at) },
        { label: 'Report description', value: shown(d.notes), long: true },
        { label: 'Observed condition', value: shown(join(r.condition, d.conditions)), long: true },
    ];
    if (d.custody) fields.push({ label: 'Custody (as reported)', value: d.custody });
    if (r.category_name) fields.push({ label: 'Report type', value: r.category_name });
    if (r.animal_count && r.animal_count > 1) fields.push({ label: 'Animals in the report', value: String(r.animal_count) });
    return fields;
}

export function petFields(p: ManualPetSource): ComparisonField[] {
    const fields: ComparisonField[] = [
        { label: 'Pet name', value: shown(p.pet_name) },
        { label: 'Pet ID', value: petIdLabel(p) },
        { label: 'Animal type', value: shown(p.pet_type) },
        { label: 'Breed', value: shown(p.breed) },
        { label: 'Color', value: shown(join(p.color_markings, p.primary_color, p.secondary_color, p.tertiary_color)) },
        { label: 'Size', value: shown(p.size_category) },
        { label: 'Distinguishing marks', value: shown(p.distinctive_markings), long: true },
        { label: 'Registered address', value: shown(p.registered_address) },
        { label: "Owner's name", value: shown(p.owner_name) },
        { label: 'Pet description', value: shown(p.notes), long: true },
        { label: 'Sex', value: shown(p.gender) },
        { label: 'Age', value: shown(p.estimated_age) },
    ];
    if (p.is_neutered !== null && p.is_neutered !== undefined) fields.push({ label: 'Neutered / spayed', value: p.is_neutered ? 'Yes' : 'No' });
    return fields;
}

/** The saved matching method of a match record (never the current AI setting or the page it is opened from). */
export function isManualMatchRecord(match: { matching_mode?: string | null; ai_evidence?: { engine?: string } | null } | null | undefined): boolean {
    return (match?.matching_mode || '').toLowerCase() === 'manual' || match?.ai_evidence?.engine === 'manual';
}
