/**
 * When a notification alert goes out (the alert window and the alerts section). Pure functions, no React. They mirror the server
 * (backend services/case_alerts.py next_slot), which is the authority: what is shown here is the same plan the server will follow.
 *
 * Any interval and any times of day. The safeguards are not presets: sends of one alert are at least 5 minutes apart (a typo guard), every
 * repeating alert ends (when the case is resolved, with a latest end date, on a date, or after a number of sends), and a heavy schedule is
 * named (more than 12 sends in a day) without being blocked.
 */
import type { AlertInput, AlertSchedule, CaseAlert } from './types';

export const MIN_EVERY_MINUTES = 5;
export const DEFAULT_LATEST_DAYS = 14;
export const MAX_LATEST_DAYS = 60;
export const HEAVY_PER_DAY = 12;
export const MAX_SENDS = 500;
export const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440 } as const;
export type Unit = keyof typeof UNIT_MINUTES;

/** What the alert window edits. Times are `datetime-local` / `date` input values (local time). */
export interface DraftSchedule {
  mode: 'now' | 'later' | 'repeat';
  at: string;
  repeat: 'every' | 'times';
  every: string;
  unit: Unit;
  times: string[];
  start: 'now' | 'later';
  startAt: string;
  until: 'resolved' | 'date' | 'count';
  untilAt: string;
  count: string;
  latestEnd: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const toInputValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const toDateValue = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addMin = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
const hm = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const valid = (d: Date) => !Number.isNaN(d.getTime());

/** A fresh schedule: send now; the other choices are filled with sensible starting values the Leader can change. */
export function blankDraft(now: Date): DraftSchedule {
  const morning = new Date(now);
  morning.setDate(morning.getDate() + 1);
  morning.setHours(7, 0, 0, 0);
  return {
    mode: 'now', at: toInputValue(morning), repeat: 'every', every: '30', unit: 'minutes', times: ['07:00', '12:00', '18:00'], start: 'now',
    startAt: toInputValue(addMin(now, 60)), until: 'resolved', untilAt: toInputValue(addMin(now, 3 * 1440)), count: '10',
    latestEnd: toDateValue(addMin(now, DEFAULT_LATEST_DAYS * 1440)),
  };
}

/** The window's values for an alert that already exists (to change it). */
export function draftFrom(a: CaseAlert, now: Date): DraftSchedule {
  const d = blankDraft(now);
  const s = a.schedule;
  d.mode = s.mode === 'now' ? 'now' : s.mode;
  if (s.mode === 'later') d.at = toInputValue(new Date(s.startAt));
  if (s.mode === 'repeat') {
    d.repeat = s.repeat ?? 'every';
    if (s.everyMinutes) {
      const m = s.everyMinutes;
      if (m % 1440 === 0) { d.every = String(m / 1440); d.unit = 'days'; } else if (m % 60 === 0) { d.every = String(m / 60); d.unit = 'hours'; } else { d.every = String(m); d.unit = 'minutes'; }
    }
    if (s.times.length) d.times = [...s.times];
    d.start = new Date(s.startAt) > now ? 'later' : 'now';
    d.startAt = toInputValue(new Date(s.startAt) > now ? new Date(s.startAt) : addMin(now, 60));
    d.until = s.endKind ?? 'resolved';
    if (s.endKind === 'date' && s.endAt) d.untilAt = toInputValue(new Date(s.endAt));
    if (s.endKind === 'resolved' && s.endAt) d.latestEnd = toDateValue(new Date(s.endAt));
    if (s.endKind === 'count' && s.maxSends) d.count = String(Math.max(1, s.maxSends - a.sendsDone));
  }
  return d;
}

const startOf = (d: DraftSchedule, now: Date) => (d.start === 'later' ? new Date(d.startAt) : new Date(now));
const endOf = (d: DraftSchedule, start: Date) => (d.until === 'date' ? new Date(d.untilAt) : d.until === 'resolved' ? new Date(`${d.latestEnd}T23:59`) : addMin(start, MAX_LATEST_DAYS * 1440));

/** Every planned send, from now: the same plan the server follows (sends due at once count as "now"). */
export function plannedSends(d: DraftSchedule, now: Date, limit = 2000): Date[] {
  if (d.mode === 'now') return [new Date(now)];
  if (d.mode === 'later') { const t = new Date(d.at); return valid(t) ? [t] : []; }
  const start = startOf(d, now);
  const end = endOf(d, start);
  if (!valid(start) || !valid(end)) return [];
  const max = d.until === 'count' ? Math.min(MAX_SENDS, Math.max(1, Number(d.count) || 1)) : limit;
  const out: Date[] = [];
  if (d.repeat === 'every') {
    const step = (Number(d.every) || 0) * UNIT_MINUTES[d.unit];
    if (step < 1) return [];
    for (let t = new Date(start); t <= end && out.length < Math.min(max, limit); t = addMin(t, step)) out.push(new Date(t));
    return out;
  }
  const times = [...new Set(d.times.filter(Boolean))].sort((a, b) => hm(a) - hm(b));
  if (!times.length) return [];
  const day = new Date(start);
  day.setHours(0, 0, 0, 0);
  for (let i = 0; i < 400 && out.length < Math.min(max, limit); i++) {
    for (const s of times) {
      const t = new Date(day);
      t.setDate(day.getDate() + i);
      t.setHours(Math.floor(hm(s) / 60), hm(s) % 60, 0, 0);
      if (t < start) continue;
      if (t > end) return out;
      out.push(t);
      if (out.length >= Math.min(max, limit)) return out;
    }
  }
  return out;
}

/** What is wrong with the schedule, in plain words (empty when it can be sent). */
export function scheduleErrors(d: DraftSchedule, now: Date): string[] {
  const out: string[] = [];
  if (d.mode === 'later' && !(new Date(d.at) > now)) out.push('Choose a time in the future.');
  if (d.mode !== 'repeat') return out;
  if (d.repeat === 'every' && (Number(d.every) || 0) * UNIT_MINUTES[d.unit] < MIN_EVERY_MINUTES) out.push(`Sends must be at least ${MIN_EVERY_MINUTES} minutes apart.`);
  if (d.repeat === 'times' && !d.times.filter(Boolean).length) out.push('Add at least one time of day.');
  if (d.start === 'later' && !(new Date(d.startAt) > now)) out.push('Choose a start in the future.');
  const start = startOf(d, now);
  if (d.until === 'date' && !(new Date(d.untilAt) > start)) out.push('Choose an end after the start.');
  if (d.until === 'resolved' && !(new Date(`${d.latestEnd}T23:59`) > start)) out.push('The latest end must be after the start.');
  if ((d.until === 'date' || d.until === 'resolved') && endOf(d, start).getTime() - start.getTime() > MAX_LATEST_DAYS * 86400000) out.push(`An alert can run for at most ${MAX_LATEST_DAYS} days at once.`);
  if (d.until === 'count' && !(Number(d.count) >= 1 && Number(d.count) <= MAX_SENDS)) out.push(`Choose between 1 and ${MAX_SENDS} sends.`);
  return out;
}

/** How many sends fall in the first day (a heavy schedule is named, not blocked). */
export const firstDayCount = (sends: Date[]) => (sends.length ? sends.filter((t) => t.getTime() - sends[0].getTime() < 86400000).length : 0);

/** What the window sends to the server. */
export function inputSchedule(d: DraftSchedule): AlertInput['schedule'] {
  if (d.mode === 'now') return { mode: 'now' };
  if (d.mode === 'later') return { mode: 'later', at: d.at };
  return {
    mode: 'repeat', repeat: d.repeat, ...(d.repeat === 'every' ? { every: Number(d.every), unit: d.unit } : { times: d.times.filter(Boolean) }),
    startAt: d.start === 'later' ? d.startAt : null, until: d.until,
    ...(d.until === 'date' ? { untilAt: d.untilAt } : d.until === 'count' ? { count: Number(d.count) } : { latestEnd: `${d.latestEnd}T23:59` }),
  };
}

// --------------------------------------------------------------------------------------------------------------- words
const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const day = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const hmLabel = (s: string) => { const [h, m] = s.split(':').map(Number); return clock(new Date(2026, 0, 1, h, m)); };
/** "3:15 PM" today, "Fri, Nov 13, 7:00 AM" another day. */
export const when = (d: Date, now: Date) => (d.toDateString() === now.toDateString() ? clock(d) : `${day(d)}, ${clock(d)}`);

function everyLabel(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'Every day' : `Every ${minutes / 1440} days`;
  if (minutes % 60 === 0) return minutes === 60 ? 'Every hour' : `Every ${minutes / 60} hours`;
  return `Every ${minutes} minutes`;
}

/** "Every 30 minutes", "Daily at 7:00 AM, 6:00 PM", "Once, Fri, Nov 13, 7:00 AM", "Once, now". */
export function cadence(s: AlertSchedule, now: Date): string {
  if (s.mode === 'now') return 'Once';
  if (s.mode === 'later') return `Once, ${when(new Date(s.startAt), now)}`;
  if (s.repeat === 'times') return `Daily at ${s.times.map(hmLabel).join(', ')}`;
  return everyLabel(s.everyMinutes ?? 0);
}

/** "until Mochi is home (by Nov 26)", "until Fri, Nov 13, 7:00 AM", "10 sends in all". Empty for a one-time alert. */
export function ending(s: AlertSchedule, subjectEnd: string, now: Date): string {
  if (s.mode !== 'repeat') return '';
  if (s.endKind === 'resolved') return `until ${subjectEnd}${s.endAt ? ` (by ${new Date(s.endAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})` : ''}`;
  if (s.endKind === 'date' && s.endAt) return `until ${when(new Date(s.endAt), now)}`;
  if (s.endKind === 'count' && s.maxSends) return `${s.maxSends} sends in all`;
  return '';
}

/** The window's own words for what it is about to do: "Every 30 minutes", "Daily at …", "Once, …". */
export function draftCadence(d: DraftSchedule, now: Date): string {
  if (d.mode === 'now') return 'Now';
  if (d.mode === 'later') return valid(new Date(d.at)) ? when(new Date(d.at), now) : '—';
  if (d.repeat === 'times') return `Daily at ${d.times.filter(Boolean).map(hmLabel).join(', ') || '—'}`;
  return everyLabel((Number(d.every) || 0) * UNIT_MINUTES[d.unit]);
}
