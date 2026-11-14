/**
 * Complaint management: the screens' pure rules (no React). What needs the Leader now, how each step reads, and the activity, all
 * derived from the server's answer (api.ts). The server enforces every rule again; this only decides what to show.
 */
import { fromServer } from '../../live/dates';
import type { ApiComplaint, ApiStep, EvidenceId, StepAction, StepKind } from './api';

export const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
export const lc = (t: string) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);
export const VERIFIED_RP = 'Verified Responsible Person — Confirmed by Leader';
export const SUSPECT_RP = 'Reported / Suspected Owner — Unverified';

export const EVIDENCE: { id: EvidenceId; label: string }[] = [
  { id: 'firsthand', label: 'Firsthand observation by you' },
  { id: 'cctv', label: 'CCTV or guardhouse record' },
  { id: 'photos', label: 'Photos of the animal with the person' },
  { id: 'markings', label: 'Distinctive markings match' },
  { id: 'statement', label: 'Statement of the person responsible' },
  { id: 'interactions', label: 'Previous documented interactions' },
  { id: 'vet', label: 'Veterinary or vaccination record' },
  { id: 'registry', label: 'Registered pet profile (never enough on its own)' },
];
export const evidenceLabel = (id: string) => EVIDENCE.find((e) => e.id === id)?.label.replace(' (never enough on its own)', '') ?? id;

export const STAGE_TEXT: Record<number, string> = {
  1: 'a first warning letter, delivered to the person responsible',
  2: 'a second warning letter, delivered, and a summons to the subdivision office',
  3: 'a fine you impose under the rule, and a meeting at the Barangay with the complainant, the person responsible and you',
};
export const STEP_TITLE: Record<StepKind, string> = {
  letter_1: 'First warning letter', letter_2: 'Second warning letter', summons: 'Summons to the subdivision office', fine: 'Fine', meeting: 'Meeting at the Barangay',
};
/** Which complaint window is open. */
export type ComplaintDialogState =
  | { kind: 'verify' } | { kind: 'resp'; correcting?: boolean } | { kind: 'offense' } | { kind: 'same' }
  | { kind: 'step'; stepId: number; action: StepAction } | { kind: 'print'; stepId: number };

export const PROOF: Record<string, string> = { signed: 'Signed the receiving copy', refused_to_sign: 'Handed over in person; would not sign', other: 'Other' };
export const NOT_DELIVERED: Record<string, string> = { nobody_home: 'Nobody home', refused: 'Refused to accept it', wrong_address: 'Address wrong or unclear', other: 'Other' };
export const ATTENDANCE: Record<string, string> = { attended: 'Attended', absent: 'Did not attend', asked_new_date: 'Asked for another date' };

export const peso = (amount: number | null | undefined) =>
  amount == null ? '' : `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
let requestSeq = 0;
/** One retry key per save, so a resent request is recorded once (enforcement_step_events.client_request_id). */
export const newRequestId = () => `cm-${Date.now().toString(36)}-${(requestSeq += 1).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
/** A datetime-local value as the server's local wall-clock text. */
export const localToServer = (value: string) => (value.length === 16 ? `${value}:00` : value);
const t = (s: string | null | undefined) => (s ? fromServer(s) : '');

export type Tone = 'sage' | 'amber' | 'red' | 'brand' | '';
export interface StepBadge { text: string; tone: Tone; done: boolean; wait: boolean }
export function stepBadge(kind: StepKind, state: string): StepBadge {
  const b = (text: string, tone: Tone = '', done = false, wait = false): StepBadge => ({ text, tone, done, wait });
  if (kind === 'letter_1' || kind === 'letter_2') {
    return ({ to_prepare: b('Not prepared'), prepared: b('Printed, not issued', 'amber', false, true), issued: b('Issued, not delivered yet', 'amber', false, true),
      not_delivered: b('Delivery unsuccessful', 'red', false, true), delivered: b('Delivered', 'sage', true) } as Record<string, StepBadge>)[state] ?? b(state);
  }
  if (kind === 'summons') {
    return ({ waiting: b('Set in the second letter'), scheduled: b('Scheduled', 'brand'), attended: b('Attended', 'sage', true),
      absent: b('Did not attend', 'amber', false, true), asked_new_date: b('Asked for another date', 'amber', false, true) } as Record<string, StepBadge>)[state] ?? b(state);
  }
  if (kind === 'fine') {
    return ({ to_impose: b('Not imposed yet'), imposed: b('Imposed, not paid', 'amber', false, true), paid: b('Paid', 'sage', true) } as Record<string, StepBadge>)[state] ?? b(state);
  }
  return ({ to_arrange: b('Not arranged'), arranged: b('Scheduled', 'brand'), held: b('Held', 'sage', true), not_held: b('Did not take place', 'amber', false, true) } as Record<string, StepBadge>)[state] ?? b(state);
}

export interface StepNext { action: StepAction; label: string; title: string; /** a need only once its date has come */ later?: boolean; /** waits on someone else: offered on the step, never listed as a need */ quiet?: boolean }
/** What the Leader can record on a step now (null when nothing). */
export function stepNext(kind: StepKind, state: string, letter2Delivered: boolean, due: string | null, now: Date): StepNext | null {
  const title = STEP_TITLE[kind];
  const isLater = !!due && new Date(t(due)).getTime() > now.getTime();
  if (kind === 'letter_1' || kind === 'letter_2') {
    if (state === 'to_prepare') return { action: 'prepare', label: 'Prepare the letter', title: `Prepare the ${lc(title)}` };
    if (state === 'prepared') return { action: 'issue', label: 'Issue for delivery', title: `Issue the ${lc(title)} for delivery` };
    if (state === 'issued') return { action: 'deliver', label: 'Record delivery', title: `Record the delivery of the ${lc(title)}` };
    if (state === 'not_delivered') return { action: 'deliver', label: 'Record another attempt', title: `${title}: delivery unsuccessful` };
    return null;
  }
  if (kind === 'summons') {
    if (state === 'scheduled') return letter2Delivered ? { action: 'attendance', label: 'Record attendance', title: 'Record the summons attendance', later: isLater } : null;
    if (state === 'absent' || state === 'asked_new_date') return { action: 'reschedule', label: 'Set a new date', title: 'Summons: set a new date' };
    return null;
  }
  if (kind === 'fine') {
    if (state === 'to_impose') return { action: 'impose', label: 'Impose the fine', title: 'Impose the fine' };
    if (state === 'imposed') return { action: 'pay', label: 'Record payment', title: 'Record the payment', quiet: true };
    return null;
  }
  if (state === 'to_arrange' || state === 'not_held') return { action: 'arrange', label: 'Arrange with the Barangay', title: 'Arrange the meeting at the Barangay' };
  if (state === 'arranged') return { action: 'meeting', label: 'Record the meeting', title: 'Record the Barangay meeting', later: isLater };
  return null;
}

export type NeedIcon = 'copy' | 'clipboard' | 'userCheck' | 'shield' | 'ok' | StepKind;
export interface Need { kind: 'same' | 'verify' | 'resp' | 'offense' | 'close' | 'step'; icon: NeedIcon; title: string; detail: string; action: string; stepId?: number; stepAction?: StepAction }
export interface NeedInput {
  closed: boolean; maybeSame: number | null; incident: string; hasRule: boolean; noRule: boolean; respondentName: string | null; checking: boolean;
  offense: { counted: boolean; number: number | null } | null; suggestion: number | null; ruleTitle: string | null; hasSuspect: boolean; leads?: number;
  steps: { step_id: number; kind: StepKind; state: string; due_at: string | null }[];
}
const UNDECIDED = new Set(['not_reviewed', 'partial']);
const NEED_DETAIL: Record<StepAction, string> = {
  prepare: 'Prepare and print it. Printing is not delivering.', issue: 'Printed, not issued for delivery yet.', deliver: 'Issued for delivery, not delivered yet.',
  attendance: 'The summons date has come.', reschedule: 'They did not come, or asked for another date.', impose: 'The amount comes from the confirmed rule.',
  pay: 'Imposed, not paid yet.', arrange: 'With the complainant, the person responsible and you.', meeting: 'The meeting date has come.',
};

/** What needs the Leader on one complaint now, most important first. Nothing that is waiting on someone else. */
export function needsOf(x: NeedInput, now: Date, refOf: (reportId: number) => string): Need[] {
  if (x.closed) return [];
  if (x.maybeSame) {
    return [{ kind: 'same', icon: 'copy', title: `Same occurrence as ${refOf(x.maybeSame)}?`, detail: 'Filed close in time and place to an earlier complaint. Decide before anything is counted.', action: 'Compare' }];
  }
  const verify: Need | null = UNDECIDED.has(x.incident)
    ? { kind: 'verify', icon: 'clipboard', title: 'Verify what happened', detail: x.hasSuspect ? 'The complainant suggested who the owner is. That is a lead to check, not a finding.' : 'Check the report and any evidence.', action: 'Verify' }
    : null;
  if (!verify && (x.incident === 'unverified' || x.incident === 'invalid' || x.noRule)) {
    return [{ kind: 'close', icon: 'ok', title: 'Nothing to count: close the complaint', detail: x.noRule ? 'No rule applies to what happened.' : 'You recorded that it could not be verified.', action: 'Close' }];
  }
  if (!x.respondentName) {
    const leads = x.leads ?? 0;
    const resp: Need = { kind: 'resp', icon: 'userCheck', title: 'Who is responsible?', action: x.checking ? 'Continue' : 'Find the person',
      detail: `${x.checking ? 'Still checking. ' : ''}${leads ? `${leads} lead${leads === 1 ? '' : 's'} in your records. ` : ''}You can settle it during the same visit as the check.` };
    return verify ? [verify, resp] : [resp];
  }
  if (verify) return [verify];
  if (!x.hasRule) return [{ kind: 'verify', icon: 'clipboard', title: 'Choose the rule that was broken', detail: 'History is counted per rule.', action: 'Verify' }];
  if (!x.offense) {
    const n = x.suggestion ?? 1;
    return [{ kind: 'offense', icon: 'shield', title: 'Confirm the offense', detail: `StraySafe suggests the ${ord(n)} offense: ${x.respondentName} · ${x.ruleTitle ?? 'this rule'}. Only you can confirm it.`, action: 'Review' }];
  }
  if (!x.offense.counted) return [{ kind: 'close', icon: 'ok', title: 'Not counted: close when ready', detail: 'You decided this incident does not count.', action: 'Close' }];
  const letter2Delivered = x.steps.some((s) => s.kind === 'letter_2' && s.state === 'delivered');
  const out: Need[] = [];
  for (const s of x.steps) {
    const next = stepNext(s.kind, s.state, letter2Delivered, s.due_at, now);
    if (!next || next.later || next.quiet) continue;
    const detail = s.state === 'not_delivered' ? 'The last attempt did not reach them. Try again when you can.' : NEED_DETAIL[next.action];
    out.push({ kind: 'step', icon: s.kind, title: next.title, detail, action: next.label, stepId: s.step_id, stepAction: next.action });
  }
  if (!out.length && x.steps.length && x.steps.every((s) => stepBadge(s.kind, s.state).done)) {
    out.push({ kind: 'close', icon: 'ok', title: 'Every step is done', detail: 'Close the complaint when you are ready. Its history stays.', action: 'Close' });
  }
  return out;
}

export function needInputOf(d: ApiComplaint, closed: boolean, leads?: number): NeedInput {
  return {
    closed, maybeSame: d.maybe_same?.report_id ?? null, incident: d.incident.status, hasRule: !!d.rule, noRule: d.no_rule,
    respondentName: d.respondent?.name ?? null, checking: !!d.check, offense: d.offense ? { counted: d.offense.counted, number: d.offense.number } : null,
    suggestion: d.suggestion, ruleTitle: d.rule?.title ?? null, hasSuspect: !!d.suspect, leads,
    steps: d.steps.map((s) => ({ step_id: s.step_id, kind: s.kind, state: s.state, due_at: s.due_at })),
  };
}

/** What one event on a step says, without its time (the activity shows the time on its own line). */
export function eventSummary(e: ApiStep['events'][number]): string {
  const d = e.details as Record<string, string | number | boolean | null>;
  switch (e.kind) {
    case 'prepared': return `prepared and printed${d.letter_date ? `, dated ${fmtDay(String(d.letter_date))}` : ''}`;
    case 'issued': return `issued for delivery · ${d.via}`;
    case 'delivered': return `delivered · received by ${d.received_by} · ${lc(PROOF[String(d.proof)] ?? '')}`;
    case 'not_delivered': return `not delivered · ${lc(NOT_DELIVERED[String(d.reason)] ?? '')}${d.note ? ` · ${d.note}` : ''}`;
    case 'scheduled': return `set for ${fmt(String(d.at))} at ${d.place}`;
    case 'rescheduled': return `new date ${fmt(String(d.at))} at ${d.place} · told ${lc(String(d.told))}`;
    case 'attended': case 'absent': case 'asked_new_date': return `${lc(ATTENDANCE[e.kind])} · ${d.note}`;
    case 'imposed': return `imposed · ${peso(Number(d.amount))} · told ${lc(String(d.told))}`;
    case 'paid': return `paid ${fmtDay(String(d.paid_on))} · received by ${d.received_by}`;
    case 'arranged': return `arranged with ${d.contact} for ${fmt(String(d.at))}, ${d.place}`;
    case 'held': case 'not_held': return `${e.kind === 'held' ? 'held' : 'did not take place'} · ${d.outcome}`;
    default: return e.kind;
  }
}

/** One line per thing that happened on a step, in the order it was recorded. */
export function stepTrail(step: ApiStep): { text: string; tone: Tone }[] {
  const title = STEP_TITLE[step.kind];
  return step.events.map((e) => {
    const d = e.details as Record<string, string | number | boolean | null | Record<string, boolean>>;
    const when = fmt(e.occurred_at);
    switch (e.kind) {
      case 'prepared': return { text: `Prepared and printed ${fmt(e.recorded_at)}${d.letter_date ? ` · dated ${fmtDay(String(d.letter_date))}` : ''}`, tone: '' as Tone };
      case 'issued': return { text: `Issued for delivery ${when} · ${d.via}`, tone: 'brand' as Tone };
      case 'delivered': return { text: `Delivered ${when} · received by ${d.received_by} · ${lc(PROOF[String(d.proof)] ?? '')}`, tone: 'sage' as Tone };
      case 'not_delivered': return { text: `Not delivered ${when} · ${lc(NOT_DELIVERED[String(d.reason)] ?? '')}${d.note ? ` · ${d.note}` : ''}`, tone: 'amber' as Tone };
      case 'scheduled': return { text: `Scheduled: ${fmt(String(d.at))} at ${d.place}`, tone: 'brand' as Tone };
      case 'rescheduled': return { text: `New date: ${fmt(String(d.at))} at ${d.place} · told ${lc(String(d.told))}`, tone: 'brand' as Tone };
      case 'attended': case 'absent': case 'asked_new_date': return { text: `${ATTENDANCE[e.kind]} · ${d.note}`, tone: (e.kind === 'attended' ? 'sage' : 'amber') as Tone };
      case 'imposed': return { text: `Imposed ${fmtDay(String(d.imposed_on))} · ${peso(Number(d.amount))} · told ${lc(String(d.told))}`, tone: 'brand' as Tone };
      case 'paid': return { text: `Paid ${fmtDay(String(d.paid_on))} · received by ${d.received_by}`, tone: 'sage' as Tone };
      case 'arranged': return { text: `Arranged with ${d.contact} for ${fmt(String(d.at))}, ${d.place}${d.complainant_agreed ? ' · the complainant agreed to attend' : ' · the complainant has not agreed yet'}`, tone: 'brand' as Tone };
      case 'held': case 'not_held': return { text: `${e.kind === 'held' ? 'Held' : 'Did not take place'} · ${d.outcome}`, tone: (e.kind === 'held' ? 'sage' : 'amber') as Tone };
      default: return { text: `${title}: ${e.kind}`, tone: '' as Tone };
    }
  });
}

const dateFmt = new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
/** A server time ("2026-11-13T10:00:00", local) as "13 Nov, 10:00 am". */
export function fmt(server: string | null | undefined): string {
  const iso = t(server);
  return iso ? dateTimeFmt.format(new Date(iso)) : '';
}
/** A server date or time as "13 Nov 2026". */
export function fmtDay(server: string | null | undefined): string {
  if (!server) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(server) ? `${server}T00:00:00` : server;
  const v = t(iso);
  return v ? dateFmt.format(new Date(v)) : '';
}

export interface ActivityItem { id: string; at: string; icon: NeedIcon | 'megaphone' | 'link' | 'x'; tone?: 'sage' | 'amber' | 'brand'; title: string; meta?: string; detail?: string }
/** The complaint's activity, newest first: it writes itself from what was recorded. */
export function activityOf(d: ApiComplaint, refOf: (reportId: number) => string, filed: { at: string; by: string }, closure: { at: string; label: string } | null): ActivityItem[] {
  const a: ActivityItem[] = [{ id: 'filed', at: filed.at, icon: 'megaphone', title: 'Complaint received', meta: `from ${filed.by}${d.suspect ? ' · with a suggestion of the owner' : ''}` }];
  const ruleMeta = d.rule ? `Rule: ${d.rule.title}` : d.no_rule ? 'No rule applies' : undefined;
  if (d.incident.at) {
    a.push({ id: 'incident', at: t(d.incident.at), icon: 'clipboard', tone: d.incident.status === 'verified' ? 'sage' : undefined,
      title: d.incident.status === 'verified' ? 'Verified: it happened' : d.incident.status === 'unverified' ? 'Not verified' : 'Can’t tell yet', meta: ruleMeta });
  }
  for (const k of d.corrections) {
    a.push({ id: `fix-${k.offense_id}`, at: t(k.voided_at), icon: 'userCheck', tone: 'amber', title: `Corrected: it was not ${k.respondent?.name ?? 'that person'}`,
      meta: k.counted && k.number ? `the ${ord(k.number)} offense no longer counts` : undefined,
      detail: `${k.void_reason ?? ''}${k.steps.length ? ` What was already done stays recorded: ${k.steps.map((s) => `${lc(s.label)}: ${lc(stepBadge(s.kind, s.state).text)}`).join('; ')}.` : ''}` });
  }
  for (const r of d.ruled_out) a.push({ id: `ro-${r.key}`, at: t(r.at), icon: 'x', title: `Ruled out: ${r.label}`, detail: r.reason ?? undefined });
  if (d.check) a.push({ id: 'check', at: t(d.check.at), icon: 'clipboard', title: 'Still checking who is responsible', detail: d.check.note });
  if (d.respondent?.at) a.push({ id: 'resp', at: t(d.respondent.at), icon: 'userCheck', tone: 'sage', title: `Person responsible confirmed: ${d.respondent.name}`, meta: `${d.respondent.evidence.length} kind${d.respondent.evidence.length === 1 ? '' : 's'} of evidence` });
  if (d.offense) {
    a.push({ id: 'offense', at: t(d.offense.confirmed_at), icon: 'shield', tone: d.offense.counted ? 'brand' : undefined,
      title: d.offense.counted && d.offense.number ? `Confirmed as the ${ord(d.offense.number)} offense` : 'Not counted as an offense',
      meta: d.offense.counted ? d.offense.policy_title : undefined, detail: d.offense.counted ? undefined : d.offense.note ?? undefined });
  }
  for (const s of d.steps) {
    const trail = stepTrail(s);
    s.events.forEach((e, i) => a.push({ id: `ev-${e.event_id}`, at: t(e.occurred_at), icon: s.kind, tone: trail[i].tone === 'sage' ? 'sage' : trail[i].tone === 'amber' ? 'amber' : undefined,
      title: `${STEP_TITLE[s.kind]}: ${eventSummary(e)}` }));
  }
  if (d.same_as) a.push({ id: 'same', at: t(d.same_as.linked_at), icon: 'link', title: `Linked as the same occurrence as ${refOf(d.same_as.report_id)}`, detail: d.same_as.note ?? undefined });
  for (const x of d.also_reported) a.push({ id: `also-${x.report_id}`, at: t(x.linked_at), icon: 'link', title: `${refOf(x.report_id)} linked as the same occurrence` });
  if (d.separate_from) a.push({ id: 'sep', at: t(d.separate_from.at), icon: 'link', title: `Kept separate from ${refOf(d.separate_from.report_id)}` });
  if (closure) a.push({ id: 'closed', at: closure.at, icon: 'ok', title: `Closed: ${closure.label}` });
  return a.filter((x) => x.at).sort((x, y) => y.at.localeCompare(x.at));
}
