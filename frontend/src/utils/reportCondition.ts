// The report form no longer asks for an "observed condition" (it overlapped with the report category).
// The saved `condition` is derived from the category instead. The backend reads keywords in it (injured, sick, weak...)
// to decide if an animal arrives at the holding facility as "Need Treatment" or "Healthy".
// Anything the reporter notices beyond the category goes in the Additional Information note.
const CONDITION_BY_CATEGORY: Record<number, string> = {
    1: 'Injured',            // Injured Animal
    2: 'Aggressive',         // Aggressive Stray
    3: 'Sick',               // Possible Rabies Risk
    4: 'Healthy',            // Roaming
    5: 'Needs rescue',       // Animal Rescue Needed (staff check the real condition on intake)
};

export function conditionForCategory(categoryId?: number | null): string {
    return (categoryId && CONDITION_BY_CATEGORY[categoryId]) || 'Healthy';
}
