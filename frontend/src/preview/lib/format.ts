const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

const ms = { min: 60_000, hour: 3_600_000, day: 86_400_000 };
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
export const fmtDay = (iso: string) => dayFmt.format(new Date(iso));
export const fmtTime = (iso: string) => timeFmt.format(new Date(iso));
export const fmtDateTime = (iso: string) => `${dateFmt.format(new Date(iso))} · ${timeFmt.format(new Date(iso))}`;
export const fmtWeekday = (d: Date) => weekdayFmt.format(d);

/** "38 min ago", "2 h ago", "Yesterday", "3 d ago", then a plain date. */
export function relative(iso: string, now: Date): string {
  const t = new Date(iso);
  const diff = now.getTime() - t.getTime();
  if (diff < 0) return fmtDateTime(iso);
  if (diff < ms.min) return 'Just now';
  if (diff < ms.hour) return `${Math.floor(diff / ms.min)} min ago`;
  if (diff < ms.day && sameDay(t, now)) return `${Math.floor(diff / ms.hour)} h ago`;
  if (sameDay(t, addDays(now, -1))) return 'Yesterday';
  if (diff < 14 * ms.day) return `${Math.floor(diff / ms.day)} d ago`;
  return fmtDate(iso);
}

/** "38 min ago", "Yesterday", "3 d ago" for recent times; null once the plain date already says it. */
export function ago(iso: string, now: Date): string | null {
  return now.getTime() - new Date(iso).getTime() >= 14 * ms.day ? null : relative(iso, now);
}

export interface DueInfo { label: string; tone: 'red' | 'amber' | 'neutral'; overdue: boolean; today: boolean }

/** How a due date reads in a list: "Overdue by 2 h", "Today, 5:00 PM", "Tomorrow, 10:00 AM", "Nov 12". */
export function dueInfo(iso: string | null, now: Date): DueInfo {
  if (!iso) return { label: 'No date set', tone: 'neutral', overdue: false, today: false };
  const t = new Date(iso);
  const diff = t.getTime() - now.getTime();
  if (diff < 0) {
    const late = -diff;
    const text = late < ms.hour ? `${Math.max(1, Math.floor(late / ms.min))} min` : late < ms.day ? `${Math.floor(late / ms.hour)} h` : `${Math.floor(late / ms.day)} d`;
    return { label: `Overdue by ${text}`, tone: 'red', overdue: true, today: false };
  }
  if (sameDay(t, now)) return { label: `Today, ${fmtTime(iso)}`, tone: 'amber', overdue: false, today: true };
  if (sameDay(t, addDays(now, 1))) return { label: `Tomorrow, ${fmtTime(iso)}`, tone: 'neutral', overdue: false, today: false };
  return { label: `${dayFmt.format(t)}, ${fmtTime(iso)}`, tone: 'neutral', overdue: false, today: false };
}

/** Remaining time until a deadline, for observation periods. */
export function remaining(iso: string, now: Date): string {
  const diff = new Date(iso).getTime() - now.getTime();
  if (diff <= 0) return 'period ended';
  if (diff < ms.hour) return `${Math.max(1, Math.floor(diff / ms.min))} min left`;
  if (diff < ms.day) return `${Math.floor(diff / ms.hour)} h left`;
  const d = Math.floor(diff / ms.day);
  const h = Math.floor((diff % ms.day) / ms.hour);
  return h ? `${d} d ${h} h left` : `${d} d left`;
}

export const daysSince = (iso: string, now: Date) => Math.floor((now.getTime() - new Date(iso).getTime()) / ms.day);

/** <input type="datetime-local"> value from an ISO string (local time). */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export const fromLocalInput = (value: string): string => new Date(value).toISOString();
export const isValidLocalInput = (value: string) => value !== '' && !Number.isNaN(new Date(value).getTime());

export const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase();
}

/** 0917 000 0142 -> 0917 ••• 0142 (lists show contact details only partially). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return phone;
  return `${digits.slice(0, 4)} ••• ${digits.slice(-4)}`;
}

export function greeting(now: Date): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const startOfWeek = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export { addDays, sameDay };

/** Personal contact details must never reach a public notice. */
export const PHONE_PATTERN = /(?:\+?63|0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}/;
export const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;
export const EXACT_ADDRESS_PATTERN = /\b(?:lot|lt\.?)\s*\d+|\bblk\.?\s*\d+\s*(?:,|\s)\s*(?:lot|lt)/i;
