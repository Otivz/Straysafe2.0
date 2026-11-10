/**
 * Dates between the backend and the screens.
 *
 * The backend stores and sends LOCAL wall-clock times without an offset (`2026-11-09T14:03:22`): its database columns are
 * naive. The screens format ISO instants with `new Date(...)`, and the sample data uses UTC strings (`...Z`), so every
 * server time is turned into a UTC ISO string on the way in, and every time the screens produce is turned back into local
 * wall-clock text on the way out. Dates without a time of day (`2026-11-09`) stay as they are.
 *
 * Pure functions with no imports, so they run under `node --test` (frontend/tests/liveAdapters.test.mjs).
 */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** A server time as the UTC ISO string the screens use; '' when there is none or it cannot be read. */
export function fromServer(value: string | null | undefined): string {
  if (!value) return '';
  const text = String(value).trim();
  if (DATE_ONLY.test(text)) return text;
  const iso = text.includes(' ') && !text.includes('T') ? text.replace(' ', 'T') : text;
  const date = new Date(iso);      // with an offset it is exact; without one JavaScript reads it as this device's local time
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

/** The same, but null instead of '' (for optional fields). */
export const fromServerOrNull = (value: string | null | undefined): string | null => fromServer(value) || null;

/** A time from a screen as local wall-clock text for the server, e.g. `2026-11-09T22:03:22`; null when empty. */
export function toServer(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const text = typeof value === 'string' ? value.trim() : '';
  if (typeof value === 'string' && DATE_ONLY.test(text)) return `${text}T00:00:00`;
  const date = value instanceof Date ? value : new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** A date-only value (YYYY-MM-DD) in local time, for fields the server types as a date. */
export function toServerDate(value: string | Date | null | undefined): string | null {
  const full = toServer(value);
  return full ? full.slice(0, 10) : null;
}
