/**
 * Backend answers -> the Admin UI's own model (data/types.ts), and back. Pure functions: no React, no network, no browser
 * API, so they run under `node --test` (frontend/tests/adminLiveAdapters.test.mjs). That is where the awkward parts live:
 * status and category names, naive server dates, case references, referral organisations, the lossy notification flags.
 *
 * Runtime imports are limited to the two pure helpers below and use explicit `.ts` paths for that reason; everything else
 * is a type-only import.
 */
import { fromServer, fromServerOrNull } from '../../live/dates.ts';
import { caseRef } from '../../live/refs.ts';
import { fmtDay } from '../../preview/lib/format.ts';
import type {
  AdminNotification, AdminProfile, AnimalType, Case, CategoryId, ClaimStatus, Closure, ComplianceObservation, DispositionId, EventKind, Evidence,
  FollowUp, Note, Notice, NoticeStatus, OwnerContact, OwnershipClaim, Pet, Policy, Referral, ReferralNote, Resident, Settings, TimelineEvent, Warning,
} from '../data/types.ts';
import type {
  ApiAlert, ApiAnalytics, ApiAnnouncement, ApiCaseDetail, ApiCaseSettings, ApiCaseSummary, ApiCategories, ApiClosure, ApiHistory, ApiMedia,
  ApiNote, ApiNotification, ApiNotificationPrefs, ApiPet, ApiQueue, ApiReport, ApiUser,
} from './api.ts';

/** What the adapters need to know about the rest of the loaded data (names and references), supplied by the provider. */
export interface Lookup {
  /** The display name of a user (a resident or a Leader of this subdivision), if known. */
  nameOf(userId: number | null | undefined): string | undefined;
  /** The resident with this id, if known (for the reporter's contact details). */
  resident(userId: number | null | undefined): Resident | undefined;
  /** The case reference of a report in the loaded list; derived from the id when it is not loaded. */
  refOf(reportId: number): string;
}

const clip = (text: string, n = 140) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);
const idOf = (n: number | null | undefined): string | null => (n === null || n === undefined ? null : String(n));

// ---------------------------------------------------------------------------------------------------- animals, titles
const ANIMAL_BY_LABEL: Record<string, AnimalType> = {
  dog: 'dog', cat: 'cat', bird: 'bird', 'small mammal': 'small_mammal', small_mammal: 'small_mammal', reptile: 'reptile',
  livestock: 'livestock', wildlife: 'wildlife', other: 'other', unknown: 'other',
};
export const animalTypeOf = (value: string | null | undefined): AnimalType => ANIMAL_BY_LABEL[(value ?? '').trim().toLowerCase()] ?? 'other';

const ANIMAL_WORD: Record<AnimalType, string> = { dog: 'dog', cat: 'cat', bird: 'bird', small_mammal: 'small animal', reptile: 'reptile', livestock: 'livestock', wildlife: 'wild animal', other: 'animal' };
const upperFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** A report has no title of its own; the list needs a line, so it is made from what the report says. */
export function caseTitle(family: CategoryId, type: AnimalType, landmark: string | null | undefined): string {
  const animal = ANIMAL_WORD[type];
  const base: Record<CategoryId, string> = {
    lost_pet: `Missing ${animal}`, found_animal: `Found ${animal}`, nuisance: `${upperFirst(animal)} causing a nuisance`,
    safety: `Safety concern: ${animal}`, injured: `Injured or distressed ${animal}`, other: `${upperFirst(animal)} concern`,
  };
  const where = (landmark ?? '').trim();
  return where ? `${base[family]}, ${where}` : base[family];
}

/** "Brown, medium size, labrador mix" from the separate fields the report keeps. */
export function animalDescription(a: { breed: string | null; color: string | null; size: string | null; condition?: string | null }): string {
  const parts = [a.color, a.size ? `${a.size.toLowerCase()} size` : null, a.breed].map((p) => (p ?? '').trim()).filter(Boolean);
  const text = parts.join(', ');
  return text ? upperFirst(text) : 'No description of the animal was given.';
}

// ------------------------------------------------------------------------------------------------------ timeline
/** The case timeline is made of neutral lines the server wrote; the kind (the icon) is read from the wording, else 'info'. */
export function eventKindOf(text: string): EventKind {
  const t = text.toLowerCase();
  if (/^case (status changed|moved)/.test(t)) return 'status';
  if (/^case closed/.test(t)) return 'closure';
  if (/^case reopened/.test(t)) return 'reopen';
  if (/warning issued|^official /.test(t) || t.includes('⚠')) return 'warning';
  if (/^observation (started|extended|ended)/.test(t)) return 'compliance';
  if (/referr/.test(t)) return 'referral';
  if (/follow-up|follow up/.test(t)) return 'follow_up';
  if (/\bunlink/.test(t)) return 'unlink';
  if (/\blink/.test(t)) return 'link';
  if (/neighborhood alert|found-animal notice|notice published/.test(t)) return 'notice';
  if (/claim/.test(t)) return 'claim';
  if (/priority/.test(t)) return 'priority';
  if (/assess/.test(t)) return 'assessment';
  return 'info';
}

/** The line the server writes when a report is filed. The case timeline already has that event (made from `reported_at`), so it is shown once. */
export const isOriginalSubmission = (remarks: string | null | undefined): boolean => /^initial report submitted/i.test((remarks ?? '').trim());

export function eventFromHistory(h: Pick<ApiHistory, 'history_id' | 'remarks' | 'created_at' | 'updater_name'>): TimelineEvent {
  const text = (h.remarks ?? '').trim() || 'Update recorded';
  return { id: `h${h.history_id}`, at: fromServer(h.created_at), actor: h.updater_name?.trim() || 'System', kind: eventKindOf(text), title: clip(text, 220) };
}

// ------------------------------------------------------------------------------------------------------------ cases
export function closureOf(c: ApiClosure, lookup: Pick<Lookup, 'nameOf'>, followUpCheck: string | null = null): Closure {
  return {
    disposition: (c.disposition ?? 'unresolved_other') as DispositionId,
    outcome: c.outcome ?? 'unresolved',
    reason: c.reason ?? '',
    followUpCheck,
    closedAt: fromServer(c.closed_at),
    closedBy: lookup.nameOf(c.closed_by) ?? 'A case officer',
  };
}

const NO_REPORTER_DETAIL = '—';

function reporterOf(userId: number | null, name: string | null, lookup: Lookup): Case['reporter'] {
  const r = lookup.resident(userId);
  return {
    residentId: idOf(userId), name: r?.name ?? name ?? 'Unknown reporter', unit: r ? [r.unit, r.street].filter(Boolean).join(', ') || NO_REPORTER_DETAIL : NO_REPORTER_DETAIL,
    phone: r?.phone || NO_REPORTER_DETAIL, email: r?.email || NO_REPORTER_DETAIL, preferredContact: 'phone',
  };
}

/** The pet a case is linked to, as the UI's per-pet decision: identified -> confirmed, a possible match -> possible, otherwise none. */
function matchesOf(status: ApiCaseSummary['identity_status'], petId: number | null): Case['identity']['matches'] {
  if (petId === null || status === 'unidentified') return {};
  return { [String(petId)]: status === 'identified' ? 'confirmed' : 'possible' };
}

/** One row of the case list as a Case: everything the list, the dashboard and the map need; the rest arrives with the detail. */
export function caseFromSummary(s: ApiCaseSummary, lookup: Lookup): Case {
  const reportedAt = fromServer(s.reported_at);
  const type = animalTypeOf(s.animal.type);
  const hasPin = s.location.latitude !== null && s.location.longitude !== null;
  return {
    id: caseRef(s.report_id, reportedAt),
    category: s.category.family,
    status: s.case_status,
    priority: s.priority,
    title: caseTitle(s.category.family, type, s.location.landmark),
    description: s.animal.description ?? '',
    animal: { type, description: animalDescription(s.animal), count: s.animal.count ?? 1 },
    location: { area: s.location.landmark?.trim() || 'Location not named', detail: '', ...(hasPin ? { lat: s.location.latitude as number, lng: s.location.longitude as number } : {}) },
    observedAt: reportedAt,
    reportedAt,
    updatedAt: fromServer(s.updated_at) || reportedAt,
    sensitive: s.is_sensitive,
    reporter: reporterOf(s.reporter.user_id, s.reporter.name, lookup),
    assignedTo: s.assigned_leader_name?.trim() || 'Unassigned',
    evidence: [],
    assessment: {
      incident: s.assessment.incident, incidentBasis: '', evidenceSufficiency: s.assessment.evidence_sufficiency, evidenceReviewed: [],
      urgency: s.assessment.urgency, urgencyNote: '', notes: '', savedAt: fromServerOrNull(s.assessment.saved_at), savedBy: null,
    },
    identity: { status: s.identity_status, matches: matchesOf(s.identity_status, s.pet_id), note: '' },
    ownership: { status: s.ownership_status, ownerResidentId: idOf(s.ownership_owner_id), evidence: [], note: '' },
    claims: [], followUps: [], ownerContacts: [], warnings: [], referrals: [], relatedCaseIds: [], notes: [],
    timeline: s.last_event ? [eventFromHistory({ history_id: s.last_event.history_id, remarks: s.last_event.text, created_at: s.last_event.at, updater_name: s.last_event.by_name })] : [],
    closure: s.closure ? closureOf(s.closure, lookup) : null,
  };
}

/** A case opened by its link that is not in the loaded list (older than the list reads, or linked from another case): the list row made from the record itself. */
export function summaryFromDetail(d: ApiCaseDetail): ApiCaseSummary {
  return {
    report_id: d.report_id, reported_at: d.reported_at, updated_at: d.reported_at, last_event: null, subdivision_id: d.subdivision_id, case_status: d.case_status, priority: d.priority,
    is_sensitive: d.is_sensitive, category: d.category, animal: d.animal, location: d.location, reporter: d.reporter, assigned_leader_id: d.assigned_leader_id, assigned_leader_name: d.assigned_leader_name,
    assessment: { incident: d.assessment.incident, evidence_sufficiency: d.assessment.evidence_sufficiency, urgency: d.assessment.urgency, saved_at: d.assessment.saved_at },
    identity_status: d.identity.status, ownership_status: d.ownership.status, ownership_owner_id: d.ownership.owner_user_id, pet_id: d.identity.pet_id, closure: d.closure, reopened_count: d.reopened_count,
    merged_into_report_id: null, photo_count: 0, thumbnail_url: null,
  };
}

const MEDIA_KIND: Record<string, Evidence['kind']> = { image: 'photo', video: 'video', document: 'document' };

export function evidenceFromMedia(media: ApiMedia[]): Evidence[] {
  const counts: Record<string, number> = {};
  return media.map((m) => {
    const kind = MEDIA_KIND[(m.media_type ?? '').toLowerCase()] ?? 'document';
    counts[kind] = (counts[kind] ?? 0) + 1;
    return { id: `m${m.media_id}`, kind, label: `${upperFirst(kind)} ${counts[kind]}`, capturedAt: fromServer(m.uploaded_at), source: 'reporter', url: m.file_url };
  });
}

const REFERRAL_ORG_ID: Record<string, string> = { barangay: 'barangay', animal_control: 'animal_control', veterinary: 'vet_office', animal_welfare: 'welfare', wildlife: 'wildlife', other: 'other' };
const REFERRAL_ORG_TYPE: Record<string, string> = { barangay: 'barangay', animal_control: 'animal_control', vet_office: 'veterinary', welfare: 'animal_welfare', wildlife: 'wildlife', other: 'other' };
/** The organisation names the Admin UI offers (data/constants.ts ORGANIZATIONS), used when a referral did not record a name. */
const ORG_DEFAULT_NAME: Record<string, string> = {
  barangay: 'Barangay Hall — Peace & Order', animal_control: 'Animal Control Personnel', vet_office: 'City Veterinary Office',
  welfare: 'Local Animal Welfare Group', wildlife: 'Wildlife Response Unit', other: 'Other organisation',
};
export const orgIdOf = (orgType: string): string => REFERRAL_ORG_ID[orgType] ?? 'other';
export const orgTypeOf = (orgId: string): string => REFERRAL_ORG_TYPE[orgId] ?? 'other';

/** The referral's contact channel as one line: the detail given (a number, an address) else the method used. */
const METHOD_LABEL: Record<string, string> = { call: 'Phone call', visit: 'In person', message: 'Message', letter: 'Written notice', other: 'Other' };

export function referralFromApi(r: ApiCaseDetail['referrals'][number]): Referral {
  const orgId = orgIdOf(r.org_type);
  const notes: ReferralNote[] = [...r.updates].sort((a, b) => (b.update_id - a.update_id)).map((u) => ({
    id: `rn${u.update_id}`, at: fromServer(u.recorded_at) || fromServer(u.update_date), by: u.recorded_by_name ?? 'Case officer', text: u.note ?? '', ...(u.status_after ? { status: u.status_after } : {}),
  }));
  return {
    id: String(r.referral_id), orgId, orgName: r.org_name?.trim() || ORG_DEFAULT_NAME[orgId] || 'Other organisation', reason: r.reason ?? '',
    referredAt: fromServer(r.referred_at), contactPerson: r.contact_person ?? '', contactChannel: r.contact_detail?.trim() || METHOD_LABEL[r.contact_method ?? ''] || '',
    status: r.status, notes,
    ...(r.external_outcome ? { externalOutcome: r.external_outcome } : {}), ...(r.remaining_follow_up ? { remainingFollowUp: r.remaining_follow_up } : {}),
    followUpAt: fromServerOrNull(r.follow_up_at), createdBy: r.referred_by_name ?? 'Case officer',
    updatedAt: (notes[0]?.at) || fromServer(r.referred_at),
  };
}

export function followUpFromApi(f: ApiCaseDetail['followups'][number]): FollowUp {
  return {
    id: String(f.followup_id), kind: f.kind, title: f.title, ...(f.notes ? { notes: f.notes } : {}), dueAt: fromServerOrNull(f.due_at), status: f.status,
    createdAt: fromServer(f.created_at), createdBy: f.created_by_name ?? 'Case officer',
    ...(f.completed_at ? { completedAt: fromServer(f.completed_at) } : {}), ...(f.completion_note ? { completionNote: f.completion_note } : {}),
  };
}

export function contactFromApi(c: ApiCaseDetail['contacts'][number]): OwnerContact {
  return { id: String(c.log_id), at: fromServer(c.contact_at), by: c.logged_by_name ?? 'Case officer', method: c.method, withWhom: c.with_whom, summary: c.summary, outcome: c.outcome };
}

/**
 * A warning as the UI reads it. The server keeps a warning's observation as audit entries and ends it when an officer
 * concludes it; a case that closed also ends its observation (the closure hook), which the UI shows as concluded "Case closed.".
 */
export function warningFromApi(w: ApiCaseDetail['warnings'][number], caseClosure: Closure | null): Warning {
  const observations: ComplianceObservation[] = w.observations.map((o) => ({
    id: `obs${o.observation_id}`, at: fromServer(o.observed_at) || fromServer(o.recorded_at), by: o.by_name ?? 'Case officer', result: o.result ?? 'unable_to_observe', notes: o.notes,
  }));
  const concluded = w.concluded !== null;
  const endedByClosure = !concluded && caseClosure !== null;
  const start = w.observation_days ? fromServer(w.created_at) : null;
  return {
    id: String(w.warning_id), ownerResidentId: idOf(w.owner_user_id), ownerName: w.owner_name ?? 'Owner', policyId: w.policy_id ?? '', policyTitle: w.policy_title ?? 'Policy not recorded',
    policyRef: w.policy_reference ?? '', details: w.description ?? '', delivery: 'in_app', issuedAt: fromServer(w.created_at), issuedBy: w.issued_by_name ?? 'Case officer',
    observationDays: w.observation_days, observationStart: start, observationEnd: w.observation_days ? fromServerOrNull(w.follow_up_at) : null, followUpAt: fromServerOrNull(w.follow_up_at),
    status: concluded || endedByClosure ? 'concluded' : 'active',
    ...(concluded ? { outcome: w.concluded as 'compliant' | 'non_compliant', outcomeNote: observations[0]?.notes ?? '', concludedAt: fromServer(w.concluded_at) }
      : endedByClosure ? { outcome: 'other' as const, outcomeNote: 'Case closed.', concludedAt: caseClosure.closedAt } : {}),
    observations,
  };
}

export function claimFromApi(c: ApiCaseDetail['claims'][number], lookup: Pick<Lookup, 'nameOf'>): OwnershipClaim {
  const status: ClaimStatus = c.status === 'withdrawn' ? 'rejected' : c.status;
  return {
    id: String(c.claim_id), claimantResidentId: idOf(c.claimant_user_id), claimantName: c.claimant_name ?? 'Unknown claimant', claimedPetId: idOf(c.claimed_pet_id),
    submittedAt: fromServer(c.submitted_at), statement: c.statement, evidence: c.evidence, status,
    ...(c.review_note ? { reviewNote: c.review_note } : {}), ...(c.reviewed_at ? { reviewedAt: fromServer(c.reviewed_at) } : {}),
    ...(c.reviewed_by ? { reviewedBy: lookup.nameOf(c.reviewed_by) ?? 'Case officer' } : {}),
  };
}

export function noteFromApi(n: ApiNote): Note {
  return { id: `n${n.note_id}`, at: fromServer(n.at), by: n.by_name ?? 'Case officer', text: n.text };
}

/** The whole case: the list row plus everything the case screen needs. */
export function applyDetail(base: Case, d: ApiCaseDetail, report: ApiReport | null, notes: ApiNote[], lookup: Lookup): Case {
  const type = animalTypeOf(d.animal.type);
  const closure = d.closure ? closureOf(d.closure, lookup) : null;
  const followUps = d.followups.map(followUpFromApi);
  const hasPin = d.location.latitude !== null && d.location.longitude !== null;
  const noteList = notes.map(noteFromApi);
  const history = (report?.history ?? []).filter((h) => !isOriginalSubmission(h.remarks)).map(eventFromHistory);
  const noteEvents: TimelineEvent[] = noteList.map((n) => ({ id: `ev-${n.id}`, at: n.at, actor: n.by, kind: 'note', title: 'Internal note added', detail: clip(n.text) }));
  const reportedAt = fromServer(d.reported_at) || base.reportedAt;
  const first: TimelineEvent = { id: 'reported', at: reportedAt, actor: d.reporter.name ?? 'Reporter', kind: 'reported', title: 'Report submitted' };
  const timeline = [...history, ...noteEvents, first].sort((a, b) => b.at.localeCompare(a.at));
  const confirmedPet = matchesOf(d.identity.status, d.identity.pet_id);
  const closureWithCheck = closure ? { ...closure, followUpCheck: followUps.find((f) => f.kind === 'post_closure' && f.status === 'pending')?.dueAt ?? null } : null;

  return {
    ...base,
    category: d.category.family, status: d.case_status, priority: d.priority, sensitive: d.is_sensitive,
    title: caseTitle(d.category.family, type, d.location.landmark),
    description: d.animal.description ?? '',
    animal: { type, description: animalDescription(d.animal), count: d.animal.count ?? 1 },
    location: { area: d.location.landmark?.trim() || 'Location not named', detail: '', ...(hasPin ? { lat: d.location.latitude as number, lng: d.location.longitude as number } : {}) },
    observedAt: reportedAt, reportedAt,
    updatedAt: timeline[0]?.at ?? base.updatedAt,
    reporter: reporterOf(d.reporter.user_id, d.reporter.name, lookup),
    assignedTo: d.assigned_leader_name?.trim() || 'Unassigned',
    evidence: evidenceFromMedia(report?.media ?? []),
    assessment: {
      incident: d.assessment.incident, incidentBasis: d.assessment.incident_basis ?? '', evidenceSufficiency: d.assessment.evidence_sufficiency, evidenceReviewed: d.assessment.evidence_reviewed,
      urgency: d.assessment.urgency, urgencyNote: d.assessment.urgency_note ?? '', notes: d.assessment.notes ?? '', savedAt: fromServerOrNull(d.assessment.saved_at), savedBy: d.assessment.saved_by_name,
    },
    identity: { status: d.identity.status, matches: confirmedPet, note: d.identity.note ?? '' },
    ownership: { status: d.ownership.status, ownerResidentId: idOf(d.ownership.owner_user_id), evidence: d.ownership.evidence, note: d.ownership.note ?? '' },
    claims: d.claims.map((c) => claimFromApi(c, lookup)),
    followUps,
    ownerContacts: d.contacts.map(contactFromApi),
    warnings: d.warnings.map((w) => warningFromApi(w, closure)),
    referrals: d.referrals.map(referralFromApi),
    relatedCaseIds: d.links.map((l) => lookup.refOf(l.report_id)),
    notes: noteList,
    timeline,
    closure: closureWithCheck,
  };
}

/**
 * The work queue gives the dashboard what it needs without opening every case: it fills the OPEN follow-ups, claims,
 * referrals and warnings of each case that has not been opened yet. A case already opened keeps its full record.
 */
export function applyQueue(cases: Case[], queue: ApiQueue, opened: ReadonlySet<string>, lookup: Lookup): Case[] {
  const by = new Map<string, Case>(cases.map((c) => [c.id, { ...c }]));
  const get = (reportId: number) => by.get(lookup.refOf(reportId));
  for (const f of queue.followups) {
    const c = get(f.report_id);
    if (c && !opened.has(c.id)) c.followUps = [...c.followUps, followUpFromApi(f)];
  }
  for (const k of queue.claims) {
    const c = get(k.report_id);
    if (c && !opened.has(c.id)) c.claims = [...c.claims, claimFromApi(k, lookup)];
  }
  for (const r of queue.referrals) {
    const c = get(r.report_id);
    if (c && !opened.has(c.id)) {
      const orgId = orgIdOf(r.org_type);
      c.referrals = [...c.referrals, {
        id: String(r.referral_id), orgId, orgName: r.org_name?.trim() || ORG_DEFAULT_NAME[orgId] || 'Other organisation', reason: r.reason ?? '', referredAt: fromServer(r.referred_at),
        contactPerson: r.contact_person ?? '', contactChannel: r.contact_detail ?? '', status: r.status, notes: [], followUpAt: fromServerOrNull(r.follow_up_at), createdBy: 'Case officer',
        updatedAt: fromServer(r.updated_at) || fromServer(r.referred_at),
      }];
    }
  }
  for (const w of queue.warnings) {
    const c = get(w.report_id);
    if (c && !opened.has(c.id)) {
      c.warnings = [...c.warnings, {
        id: String(w.warning_id), ownerResidentId: idOf(w.owner_user_id), ownerName: w.owner_name ?? 'Owner', policyId: w.policy_id ?? '', policyTitle: w.policy_title ?? 'Policy not recorded',
        policyRef: w.policy_reference ?? '', details: w.description ?? '', delivery: 'in_app', issuedAt: fromServer(w.created_at), issuedBy: 'Case officer', observationDays: w.observation_days,
        observationStart: w.observation_days ? fromServer(w.created_at) : null, observationEnd: w.observation_days ? fromServerOrNull(w.follow_up_at) : null, followUpAt: fromServerOrNull(w.follow_up_at),
        status: 'active', observations: [],
      }];
    }
  }
  return cases.map((c) => by.get(c.id) ?? c);
}

// ------------------------------------------------------------------------------------------------------ directories
/** "Blk 4 Lot 12, Molave St." -> the unit and the street. An address with no comma is all unit. */
export function splitAddress(address: string | null | undefined): { unit: string; street: string } {
  const text = (address ?? '').trim();
  if (!text) return { unit: 'Address not recorded', street: '' };
  const i = text.indexOf(',');
  return i < 0 ? { unit: text, street: '' } : { unit: text.slice(0, i).trim(), street: text.slice(i + 1).trim() };
}

export function residentFromUser(u: ApiUser, petIds: string[]): Resident {
  const { unit, street } = splitAddress(u.address);
  const status = (u.status ?? 'Active').toLowerCase() !== 'active' ? 'suspended' : u.is_verified ? 'active' : 'pending';
  const joinedAt = fromServer(u.created_at);
  return { id: String(u.user_id), name: u.name, unit, street, phone: u.phone?.trim() || '—', email: u.email, status, joinedAt, lastActiveAt: fromServer(u.last_login) || joinedAt, petIds };
}

const SEX: Record<string, Pet['sex']> = { male: 'male', female: 'female' };
const SIZE: Record<string, Pet['size']> = { small: 'small', medium: 'medium', large: 'large' };

export function petFromApi(p: ApiPet, now: Date): Pet {
  const photoUrls = [p.photo_url, p.photo_front_url, p.photo_left_url, p.photo_right_url].filter((u): u is string => !!u);
  const expiry = p.vaccine_expiry ? new Date(`${p.vaccine_expiry}T00:00:00`) : null;
  const vaccination: Pet['vaccination'] = !p.is_vaccinated ? 'unknown' : expiry && !Number.isNaN(expiry.getTime()) && expiry.getTime() < now.getTime() ? 'overdue' : 'up_to_date';
  const color = [p.primary_color, p.secondary_color, p.color_markings].map((c) => (c ?? '').trim()).filter(Boolean);
  return {
    id: String(p.pet_id), name: p.pet_name, type: animalTypeOf(p.pet_type), breed: p.breed?.trim() || 'Not recorded', color: [...new Set(color)].join(', ') || 'Not recorded',
    sex: SEX[(p.gender ?? '').toLowerCase()] ?? 'unknown', ageText: p.estimated_age?.trim() || (p.birth_date ? `Born ${p.birth_date}` : 'Not recorded'),
    size: SIZE[(p.size_category ?? '').toLowerCase()] ?? 'medium',
    markings: (p.distinctive_markings ?? '').split(/[,;]\s*/).map((m) => m.trim()).filter(Boolean),
    description: (p.notes ?? p.health_condition ?? '').trim(), photos: photoUrls.length, photoUrls,
    ownerId: p.owner_id === null ? '' : String(p.owner_id), registeredAt: fromServer(p.created_at), vaccination, microchipped: false,
  };
}

/** Which residents own which pets, so a resident's record can list its pets. */
export function petIdsByOwner(pets: ApiPet[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const p of pets) if (p.owner_id !== null) out.set(p.owner_id, [...(out.get(p.owner_id) ?? []), String(p.pet_id)]);
  return out;
}

// -------------------------------------------------------------------------------------------------------- notices
export const ALERT_ID_PREFIX = 'alert-';
export const ANNOUNCEMENT_ID_PREFIX = 'ann-';
/** `alert-12` -> { kind: 'alert', id: 12 } ; `ann-7` -> { kind: 'announcement', id: 7 } ; otherwise null (a notice not saved yet). */
export function noticeRef(id: string): { kind: 'alert' | 'announcement'; id: number } | null {
  const alert = /^alert-(\d+)$/.exec(id);
  if (alert) return { kind: 'alert', id: Number(alert[1]) };
  const ann = /^ann-(\d+)$/.exec(id);
  return ann ? { kind: 'announcement', id: Number(ann[1]) } : null;
}

const ALERT_STATUS: Record<ApiAlert['status'], NoticeStatus> = { requested: 'draft', active: 'published', closed: 'archived' };

export function noticeFromAlert(a: ApiAlert, lookup: Pick<Lookup, 'refOf' | 'nameOf' | 'resident'>): Notice {
  const found = a.alert_type === 'found_animal';
  const species = (a.pet.species ?? '').trim().toLowerCase();
  const where = (a.last_seen.location ?? '').trim();
  const title = found ? `Found ${species || 'animal'}${where ? ` near ${where}` : ''}` : `Missing ${species || 'pet'}${a.pet.name && a.pet.name !== 'Missing pet' ? `: ${a.pet.name}` : ''}`;
  // A notice a resident asked for (rather than one the Leader prepared) is shown as the resident's, for the review step
  const askedByResident = a.requested_by !== null && lookup.resident(a.requested_by) !== undefined;
  return {
    id: `${ALERT_ID_PREFIX}${a.alert_id}`, type: a.alert_type, title, description: a.leader_message ?? a.owner_note ?? '', location: where,
    media: a.pet.photo_url ? [{ id: 'photo', name: 'Photo from the report', url: a.pet.photo_url }] : [],
    status: ALERT_STATUS[a.status], caseId: lookup.refOf(a.report_id), source: askedByResident ? 'resident' : 'admin',
    createdAt: fromServer(a.requested_at), updatedAt: fromServer(a.closed_at) || fromServer(a.activated_at) || fromServer(a.requested_at),
    publishedAt: fromServerOrNull(a.activated_at), author: a.requested_by !== null ? (lookup.nameOf(a.requested_by) ?? 'Subdivision Admin') : 'Subdivision Admin',
    ...(a.status === 'closed' && a.close_reason ? { archivedReason: a.close_reason } : {}),
  };
}

const ANNOUNCEMENT_STATUS: Record<string, NoticeStatus> = { draft: 'draft', published: 'published', archived: 'archived' };
/** Announcement categories this interface shows as safety advisories (the other categories are not shown here). */
export const ADVISORY_CATEGORIES: ReadonlySet<string> = new Set(['Animal Advisory', 'Emergency']);

export function noticeFromAnnouncement(a: ApiAnnouncement): Notice {
  const status = ANNOUNCEMENT_STATUS[(a.status ?? '').toLowerCase()] ?? 'draft';
  return {
    id: `${ANNOUNCEMENT_ID_PREFIX}${a.announcement_id}`, type: 'safety_advisory', title: a.title, description: a.content, location: '',
    media: a.media.map((m) => ({ id: String(m.media_id), name: m.caption?.trim() || 'Photo', url: m.file_url })),
    status, caseId: null, source: 'admin', createdAt: fromServer(a.posted_on), updatedAt: fromServer(a.posted_on), publishedAt: status === 'published' ? fromServer(a.posted_on) : null, author: a.posted_by,
  };
}

// --------------------------------------------------------------------------------------------------- notifications
const NOTIFICATION_KIND: [RegExp, AdminNotification['kind']][] = [
  [/urgent|emergency/i, 'urgent'], [/claim/i, 'ownership_claim'], [/referr/i, 'referral'], [/follow.?up|reminder|observation/i, 'follow_up'],
  [/request|new.?report|report.?submitted|new_report/i, 'new_report'],
];
/** Notification types whose related_id is a report id (the others, such as a lost-pet alert, point at something else). */
const REPORT_RELATED = /status_update|new_report|report|follow|observation|warning|claim|referral/i;

export function notificationFromApi(n: ApiNotification): AdminNotification {
  const haystack = `${n.type ?? ''} ${n.title}`;
  const kind = NOTIFICATION_KIND.find(([re]) => re.test(haystack))?.[1] ?? 'case_activity';
  const caseId = n.related_id !== null && REPORT_RELATED.test(n.type ?? '') && !/alert/i.test(n.type ?? '') ? caseRef(n.related_id, n.created_at) : undefined;
  return { id: String(n.notification_id), kind, title: n.title, body: n.message ?? '', at: fromServer(n.created_at), read: n.is_read, ...(caseId ? { caseId } : {}) };
}

// ------------------------------------------------------------------------------------------------------- settings
export function policyFromApi(p: ApiCaseSettings['policies'][number]): Policy {
  return { id: p.id, title: p.title, reference: p.reference, summary: p.summary, appliesTo: p.applies_to, observationDays: p.observation_days, status: p.status };
}
export function policyToApi(p: Policy): ApiCaseSettings['policies'][number] {
  return { id: p.id, title: p.title, reference: p.reference, summary: p.summary, applies_to: p.appliesTo, observation_days: p.observationDays, status: p.status };
}

/** The notification flags the backend keeps (per type, per channel) read as the Admin screen's toggles. See notificationFlagsFrom. */
export function notificationSettingsFrom(p: ApiNotificationPrefs): Settings['notifications'] {
  return {
    newReports: p.email_reports || p.push_reports, urgent: true, followUps: p.email_reminders, claims: p.email_claims || p.push_claims,
    caseActivity: p.email_rescues || p.push_rescues || p.push_messages,
    channels: { inApp: true, email: p.email_reports || p.email_reminders || p.email_claims || p.email_rescues || p.email_pet_matches, push: p.push_enabled },
  };
}
/** The reverse: every flag follows its toggle and its channel, so what was saved is what is read back. */
export function notificationFlagsFrom(n: Settings['notifications']): Partial<ApiNotificationPrefs> {
  const email = n.channels.email;
  return {
    email_reports: email && n.newReports, push_reports: n.newReports,
    email_reminders: email && n.followUps,
    email_claims: email && n.claims, push_claims: n.claims,
    email_rescues: email && n.caseActivity, push_rescues: n.caseActivity, push_messages: n.caseActivity,
    push_enabled: n.channels.push,
  };
}

const ALL_CATEGORIES_ON: Settings['categories'] = { lost_pet: true, found_animal: true, nuisance: true, safety: true, injured: true, other: true };

export function settingsFrom(cs: ApiCaseSettings, cats: ApiCategories, prefs: ApiNotificationPrefs): Settings {
  const categories: Settings['categories'] = { ...ALL_CATEGORIES_ON, ...cs.categories };      // an older stored value may lack one
  return {
    subdivision: { name: cats.subdivision.name ?? '', city: cats.subdivision.city ?? '', address: cs.office.address, officePhone: cs.office.phone, officeEmail: cs.office.email, officeHours: cs.office.hours },
    notifications: notificationSettingsFrom(prefs),
    categories,
    policies: cs.policies.map(policyFromApi),
    privacy: { lostPetPublication: cs.publication.lost_pet, foundPublication: cs.publication.found_animal },
  };
}

/** The case settings the server stores, from the screen's settings (the follow-up bounds are kept as the server has them). */
export function caseSettingsTo(s: Settings, current: ApiCaseSettings): ApiCaseSettings {
  return {
    categories: s.categories, policies: s.policies.map(policyToApi), followups: current.followups,
    publication: { lost_pet: s.privacy.lostPetPublication, found_animal: s.privacy.foundPublication },
    office: { address: s.subdivision.address.trim(), phone: s.subdivision.officePhone.trim(), email: s.subdivision.officeEmail.trim(), hours: s.subdivision.officeHours.trim() },
  };
}

export function profileFromUser(u: ApiUser): AdminProfile {
  return { id: String(u.user_id), name: u.name, title: u.position_name?.trim() || 'Subdivision Leader', email: u.email, phone: u.phone?.trim() || '', role: u.role_name?.trim() || 'Subdivision Leader', subdivision: u.subdivision_name ?? '', memberSince: fromServer(u.created_at) };
}

// -------------------------------------------------------------------------------------------------------- analytics
const OUTCOME_LABEL = { resolved: 'Resolved', unresolved: 'Not resolved', invalid: 'No action needed' } as const;
const REFERRAL_LABEL = { sent: 'Sent', acknowledged: 'Acknowledged', in_progress: 'In progress', completed: 'Completed externally', declined: 'Declined', no_response: 'No response' } as const;

/** The server's lifecycle numbers in the shape data/selectors.ts `analytics()` returns, so the page does not change. */
export function analyticsFromApi(api: ApiAnalytics) {
  const c = api.case_lifecycle;
  return {
    received: c.received, closed: c.closed,
    resolvedShare: c.resolved_share === null ? null : c.resolved_share / 100,
    medianDays: c.median_days_to_close,
    weekly: c.timeline.map((t) => {
      const start = new Date(`${t.start_date}T00:00:00`);
      return { start, label: fmtDay(start.toISOString()), received: t.received, closed: t.closed };
    }),
    categories: c.categories.map((x) => ({ id: x.id, label: x.label, count: x.count })),
    outcomes: c.outcomes.map((o) => ({ group: o.group, label: OUTCOME_LABEL[o.group], count: o.count, items: o.items.map((i) => ({ id: i.id, label: i.label, count: i.count })) })),
    referrals: {
      total: c.referrals.total,
      byOrg: c.referrals.by_org.map((o) => ({ id: o.name, name: o.name, count: o.count })),
      byStatus: c.referrals.by_status.map((s) => ({ status: s.status, label: REFERRAL_LABEL[s.status], count: s.count })),
    },
  };
}
