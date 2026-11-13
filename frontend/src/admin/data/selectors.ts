/** Pure, derived views over AdminState. Nothing here mutates; nothing here knows about React. */
import { CATEGORIES, DISPOSITIONS, DISPOSITION_IDS, OUTCOME_GROUPS, PRIORITIES, REFERRAL_STATUS, REFERRAL_STATUS_IDS } from './constants';
import type {
  AdminState, Case, CaseStatus, CategoryId, DispositionId, FollowUp, LostPetConversation, MatchSide, MediationRequest, OutcomeGroup, Pet, Priority, PossibleMatch, ReferralStatus, Resident, TimelineEvent,
} from './types';
import { addDays, daysSince, dueInfo, fmtDay, median, relative, remaining, startOfDay, startOfWeek } from '../../preview/lib/format';

export const isOpen = (c: Case) => c.status !== 'closed';
/** The number inside a case reference (`SS-2026-0158` -> 158). */
const caseNumber = (id: string) => /(\d+)$/.exec(id)?.[1].replace(/^0+/, '') ?? '';
/**
 * A case by its reference. A reference made from another year (a link to an older report) still finds the case by its number,
 * which is what identifies it; the year in the reference is only for reading.
 */
export const caseById = (s: AdminState, id: string | undefined) => {
  if (!id) return undefined;
  const exact = s.cases.find((c) => c.id === id);
  if (exact) return exact;
  const n = caseNumber(id);
  return n ? s.cases.find((c) => caseNumber(c.id) === n) : undefined;
};
export const residentById = (s: AdminState, id: string | null | undefined) => s.residents.find((r) => r.id === id);
export const petById = (s: AdminState, id: string | null | undefined) => s.pets.find((p) => p.id === id);
export const pendingFollowUpsOf = (c: Case) => c.followUps.filter((f) => f.status === 'pending');
export const isLostPet = (c: Case) => c.category === 'lost_pet';
/**
 * A missing-pet or a found-animal report. These are monitored from the moment they are filed: there is no review, assessment or status step for
 * a Leader to click through, and the system looks for the matching report by itself (possible matches, below).
 */
export const isLostOrFound = (c: Case) => c.category === 'lost_pet' || c.category === 'found_animal';

// ------------------------------------------------------------------------------------ lost and found possible matches
/** The number inside a case reference: two references name the same report when their numbers agree (the year is only for reading). */
export const sameReport = (a: string, b: string) => a === b || (caseNumber(a) !== '' && caseNumber(a) === caseNumber(b));

/** A match a Leader can still decide: it is waiting, and both reports are still open. Strongest first. */
export const isWaiting = (m: PossibleMatch) => m.status === 'pending' && m.lost.open && m.found.open;
export function matchesToReview(matches: PossibleMatch[]): PossibleMatch[] {
  return matches.filter(isWaiting).sort((a, b) => b.score - a.score || Number(b.id) - Number(a.id));
}

/** What a Leader needs on one report: the reports linked to it, the possible matches waiting for a decision, and the ones ruled out. */
export interface CaseMatches { linked: PossibleMatch[]; waiting: PossibleMatch[]; ruledOut: PossibleMatch[] }
export function matchesOf(matches: PossibleMatch[], caseId: string): CaseMatches {
  const mine = matches.filter((m) => sameReport(m.lost.caseId, caseId) || sameReport(m.found.caseId, caseId));
  const byStrength = (a: PossibleMatch, b: PossibleMatch) => b.score - a.score || Number(b.id) - Number(a.id);
  return {
    linked: mine.filter((m) => m.status === 'confirmed').sort((a, b) => (b.decidedAt ?? '').localeCompare(a.decidedAt ?? '')),
    waiting: mine.filter(isWaiting).sort(byStrength),
    ruledOut: mine.filter((m) => m.status === 'rejected').sort(byStrength),
  };
}
export const levelLabel = (level: PossibleMatch['level']) => (level === 'strong' ? 'Strong match' : 'Possible match');

/**
 * One plain sentence for a possible match: "Found brown dog near Clubhouse may be Coco" on the dashboard and from the missing pet's side; "This animal may be
 * Coco" from the found animal's own page. A missing pet with no name is "a missing pet".
 */
export function matchSentence(m: PossibleMatch, viewpoint?: string): string {
  const lost = m.lost.title === 'Missing pet' ? 'a missing pet' : m.lost.title;
  return viewpoint && sameReport(m.found.caseId, viewpoint) ? `This animal may be ${lost}` : `${m.found.title} may be ${lost}`;
}

/** One line for "Where things stand": what is waiting for the Leader first, then what is linked. */
export function relatedSummary(m: CaseMatches): string {
  if (m.waiting.length > 0) return `${m.waiting.length} possible ${m.waiting.length === 1 ? 'match' : 'matches'} to review`;
  if (m.linked.length > 0) return `${m.linked.length} linked`;
  return 'None yet';
}
/** The other report of a match, seen from this case. */
export const partnerOf = (m: PossibleMatch, caseId: string): MatchSide => (sameReport(m.lost.caseId, caseId) ? m.found : m.lost);

/**
 * The open requests to help an owner and a neighbour get in touch. Read from the case when it has been opened in full (it is then the fresher
 * record), otherwise from the work queue, so the dashboard shows them without opening every case.
 */
export function mediationOf(c: Case): MediationRequest[] {
  if (c.lostPet) {
    return c.lostPet.conversations.filter((x) => x.status === 'open' && x.mode === 'leader')
      .map((x) => ({ id: x.id, requestedAt: x.requestedAt ?? null, ownerName: x.owner?.name ?? 'The owner', finderName: x.finder?.name ?? 'A neighbour' }));
  }
  return c.mediation ?? [];
}
/** Conversations the Leader was asked to help with and has not finished. */
export const openMediation = (c: Case): LostPetConversation[] => (c.lostPet?.conversations ?? []).filter((x) => x.status === 'open' && x.mode === 'leader');

// ----------------------------------------------------------------------------------------------------- dashboard
export type ReasonKind = 'urgent' | 'mediation' | 'new' | 'overdue' | 'due_today' | 'observation' | 'barangay' | 'awaiting' | 'stale';
export interface AttentionReason { kind: ReasonKind; label: string; tone: 'red' | 'amber' | 'neutral' }
export interface AttentionItem { case: Case; reasons: AttentionReason[]; score: number }

const REASON_SCORE: Record<ReasonKind, number> = { urgent: 100, mediation: 95, barangay: 85, overdue: 80, observation: 60, new: 55, due_today: 50, awaiting: 30, stale: 20 };

/**
 * "What needs my attention today?" Cases are ranked by the most pressing reason, not by date. A missing-pet report is not a task by itself: its
 * notice is published at once and nobody has to approve it, so it appears here only for something a Leader has to DO (an owner and a neighbour asked
 * for help, the Barangay still has to be contacted, a follow-up is due), never merely for being new.
 */
export function attentionItems(cases: Case[], now: Date): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const c of cases) {
    if (!isOpen(c)) continue;
    const reasons: AttentionReason[] = [];
    if (c.priority === 'urgent') reasons.push({ kind: 'urgent', label: c.status === 'reported' ? 'Urgent · not yet assessed' : 'Urgent safety concern', tone: 'red' });
    const asked = mediationOf(c);
    if (asked.length > 0) {
      const first = asked[0];
      reasons.push({ kind: 'mediation', label: asked.length === 1 ? `${first.ownerName} and ${first.finderName} asked you to help them get in touch` : `${asked.length} requests to help an owner and a neighbour get in touch`, tone: 'amber' });
    }
    if (c.status === 'reported' && c.priority !== 'urgent' && !isLostOrFound(c)) reasons.push({ kind: 'new', label: `New report · ${relative(c.reportedAt, now)}`, tone: 'amber' });
    const pending = pendingFollowUpsOf(c).filter((f) => f.dueAt);
    const overdue = pending.filter((f) => dueInfo(f.dueAt, now).overdue).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
    const today = pending.filter((f) => dueInfo(f.dueAt, now).today)[0];
    if (overdue) reasons.push({ kind: 'overdue', label: `Follow-up ${dueInfo(overdue.dueAt, now).label.toLowerCase()}: ${overdue.title}`, tone: 'red' });
    else if (today) reasons.push({ kind: 'due_today', label: `Follow-up due today: ${today.title}`, tone: 'amber' });
    for (const w of c.warnings.filter((x) => x.status === 'active' && x.observationEnd)) {
      const left = new Date(w.observationEnd!).getTime() - now.getTime();
      if (left <= 0) reasons.push({ kind: 'observation', label: 'Observation period ended · record the outcome', tone: 'red' });
      else if (left <= 48 * 3_600_000) reasons.push({ kind: 'observation', label: `Observation ends soon · ${remaining(w.observationEnd!, now)}`, tone: 'amber' });
    }
    const unsent = c.referrals.find((x) => x.orgId === 'barangay' && x.status === 'to_contact');
    if (unsent) reasons.push({ kind: 'barangay', label: `Help from ${unsent.orgName} is written down but nobody has contacted them yet`, tone: 'amber' });
    for (const r of c.referrals.filter((x) => x.orgId === 'barangay' && REFERRAL_STATUS[x.status].open && x.status !== 'to_contact')) {
      if (r.status === 'no_response' || ((r.status === 'sent' || r.status === 'acknowledged') && daysSince(r.updatedAt, now) >= 3)) {
        reasons.push({ kind: 'awaiting', label: `Awaiting an update from ${r.orgName}`, tone: 'neutral' });
        break;
      }
    }
    if ((c.status === 'in_progress' || c.status === 'under_review') && daysSince(c.updatedAt, now) >= 7 && pending.length === 0) {
      reasons.push({ kind: 'stale', label: `No activity for ${daysSince(c.updatedAt, now)} days`, tone: 'neutral' });
    }
    if (reasons.length === 0) continue;
    const score = Math.max(...reasons.map((r) => REASON_SCORE[r.kind])) + PRIORITIES[c.priority].rank;
    items.push({ case: c, reasons, score });
  }
  return items.sort((a, b) => b.score - a.score || b.case.reportedAt.localeCompare(a.case.reportedAt));
}

export interface FollowUpRef { case: Case; followUp: FollowUp }

/** Pending follow-ups on any case that is still open (or has a post-closure check), soonest first. */
export function pendingFollowUps(cases: Case[]): FollowUpRef[] {
  const out: FollowUpRef[] = [];
  for (const c of cases) for (const f of pendingFollowUpsOf(c)) if (f.dueAt && (isOpen(c) || f.kind === 'post_closure')) out.push({ case: c, followUp: f });
  return out.sort((a, b) => a.followUp.dueAt!.localeCompare(b.followUp.dueAt!));
}

export function dashboardCounts(cases: Case[], now: Date) {
  const endOfToday = addDays(startOfDay(now), 1).getTime();
  return {
    // A missing-pet or found-animal report is monitored from the start, so it is not a report waiting for review
    newReports: cases.filter((c) => c.status === 'reported' && !isLostOrFound(c)).length,
    active: cases.filter(isOpen).length,
    urgent: cases.filter((c) => isOpen(c) && c.priority === 'urgent').length,
    followUpsDue: pendingFollowUps(cases).filter((x) => new Date(x.followUp.dueAt!).getTime() < endOfToday).length,
    /** Owners and neighbours waiting for the Leader to help them get in touch. */
    mediation: cases.filter(isOpen).reduce((n, c) => n + mediationOf(c).length, 0),
    /** Missing pets still being looked for. */
    missingPets: cases.filter((c) => isOpen(c) && isLostPet(c)).length,
  };
}

export function recentActivity(cases: Case[], limit: number): { case: Case; event: TimelineEvent }[] {
  const all: { case: Case; event: TimelineEvent }[] = [];
  for (const c of cases) for (const e of c.timeline.slice(0, 4)) all.push({ case: c, event: e });
  return all.sort((a, b) => b.event.at.localeCompare(a.event.at)).slice(0, limit);
}

// ----------------------------------------------------------------------------------------------------- case list
/** `open` is every status except Closed. */
export type StatusFilter = CaseStatus | 'all' | 'open';
export interface CaseFilters { q: string; status: StatusFilter; category: CategoryId | 'all'; priority: Priority | 'all'; sort: 'newest' | 'oldest' | 'updated' | 'priority' }
export const DEFAULT_FILTERS: CaseFilters = { q: '', status: 'all', category: 'all', priority: 'all', sort: 'newest' };

export function filterCases(cases: Case[], f: CaseFilters): Case[] {
  const q = f.q.trim().toLowerCase();
  const list = cases.filter((c) => {
    if (f.status === 'open' ? c.status === 'closed' : f.status !== 'all' && c.status !== f.status) return false;
    if (f.category !== 'all' && c.category !== f.category) return false;
    if (f.priority !== 'all' && c.priority !== f.priority) return false;
    if (!q) return true;
    return [c.id, c.title, c.description, c.location.area, c.location.detail, c.animal.description, CATEGORIES[c.category].label].some((t) => t.toLowerCase().includes(q));
  });
  const by: Record<CaseFilters['sort'], (a: Case, b: Case) => number> = {
    newest: (a, b) => b.reportedAt.localeCompare(a.reportedAt),
    oldest: (a, b) => a.reportedAt.localeCompare(b.reportedAt),
    updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
    priority: (a, b) => PRIORITIES[b.priority].rank - PRIORITIES[a.priority].rank || b.reportedAt.localeCompare(a.reportedAt),
  };
  return [...list].sort(by[f.sort]);
}

export function statusCounts(cases: Case[]): Record<StatusFilter, number> {
  const out: Record<StatusFilter, number> = { all: cases.length, open: 0, reported: 0, under_review: 0, in_progress: 0, closed: 0 };
  for (const c of cases) { out[c.status]++; if (c.status !== 'closed') out.open++; }
  return out;
}

// --------------------------------------------------------------------------------------------------- case details
/** What is happening on the case right now, in a few words. Separate from the global status. */
export function currentActivity(c: Case, now: Date): string {
  if (c.status === 'closed') return 'Closed';
  if (mediationOf(c).length > 0) return 'Waiting for you · help an owner and a neighbour get in touch';
  if (c.referrals.some((x) => x.status === 'to_contact')) return 'Barangay help written down · nobody contacted yet';
  const w = c.warnings.find((x) => x.status === 'active');
  if (w) return w.observationEnd ? `Owner observation · ${remaining(w.observationEnd, now)}` : 'Warning issued · monitoring';
  const r = c.referrals.find((x) => REFERRAL_STATUS[x.status].open);
  if (r) return `External coordination · ${r.orgName}`;
  const f = pendingFollowUpsOf(c).filter((x) => x.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  if (f) return `Follow-up · ${dueInfo(f.dueAt, now).label.toLowerCase()}`;
  if (isLostOrFound(c)) return 'Monitoring';
  return c.status === 'reported' ? 'Awaiting assessment' : c.status === 'under_review' ? 'Assessment in progress' : 'Monitoring';
}

export function allowedStatusMoves(c: Case): CaseStatus[] {
  // A missing-pet or found-animal case has no manual status to move: it is monitored until it is resolved (for a missing pet, when the owner
  // confirms the pet is home) or closed another way
  if (isLostOrFound(c)) return [];
  switch (c.status) {
    case 'reported': return ['under_review', 'in_progress'];
    case 'under_review': return ['in_progress'];
    case 'in_progress': return ['under_review'];
    default: return [];
  }
}

export function openItems(c: Case) {
  return {
    followUps: pendingFollowUpsOf(c),
    warnings: c.warnings.filter((w) => w.status === 'active'),
    referrals: c.referrals.filter((r) => REFERRAL_STATUS[r.status].open),
    conversations: openMediation(c),
    claims: c.claims.filter((x) => x.status === 'submitted' || x.status === 'under_review' || x.status === 'needs_info'),
  };
}

/**
 * Warnings need an applicable, CONFIRMED policy, a verified incident and a confirmed owner (rules 5, 6, 9).
 * Returns the first reason it is not available yet so the UI can say what is missing.
 */
export function warningEligibility(c: Case, s: AdminState): { ok: boolean; reason?: string } {
  if (c.status === 'closed') return { ok: false, reason: 'The case is closed.' };
  if (!CATEGORIES[c.category].violation) return { ok: false, reason: 'Owner warnings do not apply to this kind of concern.' };
  if (c.ownership.status !== 'confirmed' || !c.ownership.ownerResidentId) return { ok: false, reason: 'Requires a confirmed owner. Complete the ownership review first.' };
  if (c.assessment.incident !== 'verified') return { ok: false, reason: 'Requires a verified incident. Record the assessment first.' };
  if (!s.settings.policies.some((p) => p.status === 'confirmed' && p.appliesTo.includes(c.category))) return { ok: false, reason: 'No confirmed policy applies to this concern.' };
  return { ok: true };
}

export function dispositionAvailability(c: Case, id: DispositionId): { ok: boolean; reason?: string } {
  switch (id) {
    // A recovery is only ever the OWNER's confirmation (in the app, or by phone / in person and recorded by the Leader): closing a case never says it
    case 'pet_recovered': return c.category === 'lost_pet' ? { ok: false, reason: 'Only the owner’s confirmation records a recovery. Use “Record owner confirmation” on the case.' } : { ok: false, reason: 'Only for lost-pet cases.' };
    case 'withdrawn_by_reporter': return { ok: false, reason: 'Only the owner can withdraw their own report.' };
    case 'owner_compliance': return c.warnings.some((w) => w.observations.some((o) => o.result === 'compliant')) ? { ok: true } : { ok: false, reason: 'Needs a warning with a compliant observation on record.' };
    case 'handed_off': return c.referrals.length > 0 ? { ok: true } : { ok: false, reason: 'Needs an external referral on record.' };
    case 'duplicate_report': return c.relatedCaseIds.length > 0 ? { ok: true } : { ok: false, reason: 'Link the related report first.' };
    default: return { ok: true };
  }
}

const areaKey = (c: Case) => { const [a, b] = c.location.area.split(' · '); return { block: a, street: b ?? '' }; };

/** Possibly-related reports. Suggestions only: linking is always an explicit choice and never merges anything. */
export function relatedCandidates(cases: Case[], base: Case, limit = 5): { case: Case; reasons: string[] }[] {
  const b = areaKey(base);
  const out: { case: Case; reasons: string[]; score: number }[] = [];
  for (const c of cases) {
    if (c.id === base.id || base.relatedCaseIds.includes(c.id)) continue;
    const k = areaKey(c);
    const reasons: string[] = [];
    let score = 0;
    if (k.block === b.block) { reasons.push('Same area'); score += 3; } else if (k.street && k.street === b.street) { reasons.push('Same street'); score += 1; }
    if (c.category === base.category) { reasons.push('Same category'); score += 2; }
    if (c.animal.type === base.animal.type) { reasons.push('Same animal type'); score += 1; }
    if (Math.abs(new Date(c.reportedAt).getTime() - new Date(base.reportedAt).getTime()) <= 14 * 86_400_000) { reasons.push('Within 14 days'); score += 1; }
    if (score >= 5) out.push({ case: c, reasons, score });
  }
  return out.sort((x, y) => y.score - x.score || y.case.reportedAt.localeCompare(x.case.reportedAt)).slice(0, limit);
}

const COLOR_WORDS = ['brown', 'white', 'black', 'gray', 'grey', 'tan', 'gold', 'golden', 'orange', 'tabby', 'yellow', 'red', 'cream', 'tri-colour', 'tricolor', 'tri-color'];

/** Registered pets worth comparing. Similar looks are NOT identity, and registration is NOT ownership. */
export function registryMatches(pets: Pet[], c: Case, limit = 4): Pet[] {
  const text = `${c.animal.description} ${c.description}`.toLowerCase();
  const words = COLOR_WORDS.filter((w) => text.includes(w));
  const scored = pets.map((p) => {
    const hay = `${p.color} ${p.markings.join(' ')}`.toLowerCase();
    const shared = words.filter((w) => hay.includes(w)).length;
    const sameType = p.type === c.animal.type;
    const decided = c.identity.matches[p.id] !== undefined;
    return { p, score: decided ? 99 : sameType && shared > 0 ? shared + 1 : 0 };
  });
  return scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.p);
}

export const petCases = (cases: Case[], petId: string) => cases.filter((c) => c.identity.matches[petId] !== undefined);

export function residentStats(cases: Case[], r: Resident) {
  const reported = cases.filter((c) => c.reporter.residentId === r.id);
  const asOwner = cases.filter((c) => c.ownership.status === 'confirmed' && c.ownership.ownerResidentId === r.id);
  const warnings = cases.flatMap((c) => c.warnings.filter((w) => w.ownerResidentId === r.id));
  const claims = cases.flatMap((c) => c.claims.filter((x) => x.claimantResidentId === r.id));
  return { reported, asOwner, warnings, claims };
}

// --------------------------------------------------------------------------------------------------------- reports
export interface DateRange { from: Date; to: Date }

export function analytics(cases: Case[], range: DateRange) {
  const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= range.from.getTime() && t < range.to.getTime(); };
  const received = cases.filter((c) => inRange(c.reportedAt));
  const closed = cases.filter((c) => c.closure && inRange(c.closure.closedAt));

  const weekly: { start: Date; label: string; received: number; closed: number }[] = [];
  for (let s = startOfWeek(range.from); s < range.to; s = addDays(s, 7)) {
    const e = addDays(s, 7);
    const within = (iso: string) => { const t = new Date(iso).getTime(); return t >= s.getTime() && t < e.getTime() && t >= range.from.getTime() && t < range.to.getTime(); };
    weekly.push({ start: s, label: fmtDay(s.toISOString()), received: cases.filter((c) => within(c.reportedAt)).length, closed: cases.filter((c) => c.closure && within(c.closure.closedAt)).length });
  }

  const categories = (Object.keys(CATEGORIES) as CategoryId[])
    .map((id) => ({ id, label: CATEGORIES[id].label, count: received.filter((c) => c.category === id).length }))
    .sort((a, b) => b.count - a.count);

  const groups: OutcomeGroup[] = ['resolved', 'unresolved', 'invalid'];
  const outcomes = groups.map((group) => {
    const items = DISPOSITION_IDS.filter((d) => DISPOSITIONS[d].group === group)
      .map((id) => ({ id, label: DISPOSITIONS[id].label, count: closed.filter((c) => c.closure!.disposition === id).length }));
    return { group, label: OUTCOME_GROUPS[group].label, count: items.reduce((n, i) => n + i.count, 0), items };
  });

  const referrals = cases.flatMap((c) => c.referrals.filter((r) => inRange(r.referredAt)));
  const orgNames = new Map<string, string>();
  referrals.forEach((r) => orgNames.set(r.orgId, r.orgName));
  const byOrg = [...orgNames].map(([id, name]) => ({ id, name, count: referrals.filter((r) => r.orgId === id).length })).sort((a, b) => b.count - a.count);
  const byStatus = (REFERRAL_STATUS_IDS as ReferralStatus[]).map((status) => ({ status, label: REFERRAL_STATUS[status].label, count: referrals.filter((r) => r.status === status).length })).filter((x) => x.count > 0);

  const days = closed.map((c) => (new Date(c.closure!.closedAt).getTime() - new Date(c.reportedAt).getTime()) / 86_400_000);
  const resolved = outcomes.find((o) => o.group === 'resolved')!.count;
  return {
    received: received.length, closed: closed.length,
    resolvedShare: closed.length ? resolved / closed.length : null,
    medianDays: median(days),
    weekly, categories, outcomes, referrals: { total: referrals.length, byOrg, byStatus },
  };
}

export type Analytics = ReturnType<typeof analytics>;
