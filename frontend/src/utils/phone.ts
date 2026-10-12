import type { FormEvent } from 'react';

// Same rules as the backend (backend/app/utils/phone.py): Philippine mobile or landline; spaces, dashes, dots and
// brackets are ignored. The backend stores mobiles as 09XXXXXXXXX.
export const PHONE_HELP = 'Enter a valid Philippine number, e.g. 0917 123 4567 (mobile) or (044) 815 1234 (landline).';

export function normalizePhPhone(value: string): string | null {
    let d = (value || '').trim().replace(/[\s\-().]/g, '');
    if (d.startsWith('+')) d = d.slice(1);
    if (!d || !/^\d+$/.test(d)) return null;
    if (d.startsWith('63')) d = '0' + d.slice(2);
    else if (d.length === 10 && d.startsWith('9')) d = '0' + d;
    if (/^09\d{9}$/.test(d) || /^0[2-8]\d{7,9}$/.test(d)) return d;
    return null;
}

export const isValidPhPhone = (value: string) => normalizePhPhone(value) !== null;

// onInput for <input type="tel">: the browser then blocks the form and shows PHONE_HELP while the number is invalid.
// An empty field is left to the input's own `required`.
export function phoneValidity(e: FormEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    el.setCustomValidity(!el.value.trim() || isValidPhPhone(el.value) ? '' : PHONE_HELP);
}
