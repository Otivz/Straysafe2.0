// Shared helpers for pet claiming charges (docs/01-system/CLAIM_FEE_ASSESSMENT_RULES.md).

/** Philippine peso, two decimals. */
export const peso = (n: number | null | undefined) =>
    `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Whether the claiming charges allow the handover: nothing assessed, nothing owed, paid, waived or cancelled. */
export const assessmentSettled = (a: { status: string; total_due: number | null } | null | undefined) =>
    !a || a.status !== 'Assessed' || !a.total_due;

/** Largest claiming charge accepted (same limit as the server). */
export const MAX_CHARGE = 1_000_000;

/**
 * A manually typed peso amount: digits with up to 2 decimals, not negative, within the limit. Letters, signs,
 * commas, spaces, exponents and empty input are refused (the server validates again).
 */
export const parsePesoAmount = (raw: string): { value: number | null; error: string | null } => {
    const t = raw.trim();
    if (!t) return { value: null, error: 'Enter the amount in pesos.' };
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return { value: null, error: 'Use numbers only, with up to 2 decimals (e.g. 250 or 250.50).' };
    const value = Number(t);
    if (value > MAX_CHARGE) return { value: null, error: `The amount can't be more than ${peso(MAX_CHARGE)}.` };
    return { value, error: null };
};
