/**
 * Backend answers -> the Resident UI's own model (data/types.ts), and back. Pure functions: no React, no network, no browser
 * API, so they run under `node --test` (frontend/tests/residentLiveAdapters.test.mjs).
 *
 * Privacy lives on the server: a resident only ever receives what the server's redaction allowed (the reporter sees their own
 * exact pin; neighbours get rounded positions; staff notes, priority and other residents' names are never sent). These
 * functions only reshape that; they add nothing the server did not send.
 */
import { fromServer } from '../../live/dates.ts';
import type {
  AnimalType, CategoryId, Claim, ClaimStatus, Media, Notice, Notification, Office, Pet, Profile, Report, ReportUpdate, Settings, Sighting,
} from '../data/types.ts';
import type {
  ApiAnnouncement, ApiChatMessage, ApiNotification, ApiNotificationPrefs, ApiPet, ApiResidentAlert, ApiResidentCategories, ApiResidentClaim,
  ApiResidentReport, ApiSighting, ApiUser,
} from './api.ts';

/** What the adapters need to know about the rest of the loaded data. Supplied by the provider. */
export interface ResidentLookup {
  /** The report reference of a report in the loaded list; derived from the id when it is not loaded. */
  refOf(reportId: number): string;
  /** Which kind of concern a stored category id is. */
  familyOf(categoryId: number | null): CategoryId;
  /** The id (as the screens route it) of the resident's own claim on a report, when there is one. */
  claimOfReport(reportId: number): string | undefined;
}

const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text);
const firstSentence = (s: string) => s.trim().split(/(?<=[.!?])\s/)[0];
export const PINNED_LABEL = 'Pinned on the map';

// ------------------------------------------------------------------------------------------------------------ animals
const ANIMAL_BY_LABEL: Record<string, AnimalType> = {
  dog: 'dog', cat: 'cat', bird: 'bird', 'small mammal': 'small_mammal', small_mammal: 'small_mammal', reptile: 'reptile',
  livestock: 'livestock', wildlife: 'wildlife', other: 'other', unknown: 'other',
};
export const animalTypeOf = (value: string | null | undefined): AnimalType => ANIMAL_BY_LABEL[(value ?? '').trim().toLowerCase()] ?? 'other';
/** The label the server stores for an animal type (it also reads the id). */
export const ANIMAL_LABEL: Record<AnimalType, string> = {
  dog: 'Dog', cat: 'Cat', bird: 'Bird', small_mammal: 'Small mammal', reptile: 'Reptile', livestock: 'Livestock', wildlife: 'Wildlife', other: 'Other',
};
const WORD: Record<AnimalType, string> = { dog: 'dog', cat: 'cat', bird: 'bird', small_mammal: 'small animal', reptile: 'reptile', livestock: 'livestock', wildlife: 'wild animal', other: 'animal' };

// ------------------------------------------------------------------------------------------------------------ reports
export const reportKindOf = (family: CategoryId): Report['kind'] => (family === 'lost_pet' ? 'lost' : family === 'found_animal' ? 'found' : 'incident');

/** The question the "extra" answer belongs to is stored with it ("How often does it happen?: Often") and split on the way back. */
export function splitExtra(condition: string | null | undefined): string | undefined {
  const text = (condition ?? '').trim();
  if (!text) return undefined;
  const i = text.indexOf('?: ');
  return i >= 0 ? text.slice(i + 3).trim() || undefined : text;
}
export const joinExtra = (label: string, answer: string): string => `${label}: ${answer}`;

/**
 * A lost pet that is not registered has its name kept at the start of the description ("Pet name: Mochi"), because a report has no
 * field for it. It is taken back out so the screens show the name and the description separately.
 */
export function splitPetName(description: string | null | undefined): { petName?: string; description: string } {
  const text = (description ?? '').trim();
  const m = /^Pet name: ([^\n]{1,60})\n\n([\s\S]*)$/.exec(text);
  return m ? { petName: m[1].trim(), description: m[2].trim() } : { description: text };
}
export const withPetName = (petName: string, description: string): string => (petName.trim() ? `Pet name: ${petName.trim()}\n\n${description.trim()}` : description.trim());

/**
 * History lines the server wrote on the timeline, as the resident-facing update they are. The server lists them oldest first
 * (the report's `history` relationship is ordered by time) and the screens sort by time anyway, so the line that records the
 * original submission is recognised by what it says, never by where it sits.
 */
export function updateFromHistory(h: { history_id: number; remarks: string | null; created_at: string }): ReportUpdate {
  const text = (h.remarks ?? '').trim() || 'Update recorded';
  const at = fromServer(h.created_at);
  if (/^initial report submitted/i.test(text)) return { id: `h${h.history_id}`, at, kind: 'received', title: 'Report received' };
  const status = /^case (status changed|moved) to (.+?)\.?$/i.exec(text);
  if (status) return { id: `h${h.history_id}`, at, kind: 'status', title: status[2] };
  if (/^case closed/i.test(text)) return { id: `h${h.history_id}`, at, kind: 'outcome', title: 'Closed', body: text.replace(/^case closed:?\s*/i, '').replace(/\.$/, '') || undefined };
  if (/^case reopened/i.test(text)) return { id: `h${h.history_id}`, at, kind: 'status', title: 'Reopened' };
  return { id: `h${h.history_id}`, at, kind: 'message', title: clip(text, 120) };
}

/** What the resident said in the case chat is "you"; what the subdivision said is a message from them. */
export function updateFromChat(m: ApiChatMessage, me: number): ReportUpdate | null {
  if (m.is_system) return null;                                   // the server's own notices are already on the timeline
  const mine = m.sender_id === me;
  const body = (m.message_text ?? '').trim() || (m.media_url ? '[Photo attached]' : '');
  if (!body) return null;
  return { id: `c${m.message_id}`, at: fromServer(m.sent_at), kind: mine ? 'you' : 'message', title: mine ? 'You added information' : 'Message from the subdivision', body };
}

const OUTCOME_SUMMARY = {
  resolved: 'The subdivision recorded that the concern was resolved.',
  unresolved: 'The case was closed without a confirmed resolution. It can be reopened if the concern returns.',
  invalid: 'The report did not need any action.',
} as const;

/**
 * A report as its own reporter sees it. `alert` is the notice made from it (lost or found), when there is one: its state decides
 * whether the report is private, waiting for review, or visible to neighbours.
 */
export function reportFromApi(r: ApiResidentReport, ctx: ResidentLookup, extra: { alert?: ApiResidentAlert | null; chat?: ApiChatMessage[]; me: number }): Report {
  const family = ctx.familyOf(r.category_id);
  const kind = reportKindOf(family);
  const animalType = animalTypeOf(r.animal_type);
  const split = splitPetName(r.description);
  const description = split.description;
  const submittedAt = fromServer(r.created_at);
  const petName = r.pet_name?.trim() || split.petName || undefined;
  const title = kind === 'lost' ? `Lost pet: ${petName || `my ${WORD[animalType]}`}` : kind === 'found' ? `Found: ${WORD[animalType]}` : clip(firstSentence(description), 70) || 'Animal concern';
  const history = [...(r.history ?? [])];
  const updates: ReportUpdate[] = [
    ...history.map(updateFromHistory),
    ...(extra.chat ?? []).map((m) => updateFromChat(m, extra.me)).filter((u): u is ReportUpdate => u !== null),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const alert = extra.alert ?? null;
  const visibility: Report['visibility'] = alert?.status === 'active' ? 'published' : alert?.status === 'requested' ? 'pending_review' : 'private';
  const hasPin = r.latitude !== null && r.longitude !== null;
  const outcome = r.case_outcome && r.case_outcome.label
    ? { label: r.case_outcome.label, summary: OUTCOME_SUMMARY[r.case_outcome.outcome ?? 'unresolved'], resolved: r.case_outcome.outcome === 'resolved', at: fromServer(r.case_outcome.closed_at) || submittedAt }
    : null;
  return {
    id: ctx.refOf(r.report_id), kind, category: family, status: r.case_status ?? 'reported', title, description, animalType, ...(petName ? { petName } : {}), petId: r.pet_id === null ? null : String(r.pet_id),
    location: { label: r.landmark?.trim() || PINNED_LABEL, lat: hasPin ? (r.latitude as number) : null, lng: hasPin ? (r.longitude as number) : null, manual: !hasPin },
    observedAt: fromServer(alert?.last_seen.at) || submittedAt, submittedAt, updatedAt: updates[0]?.at || submittedAt,
    media: mediaFromApi(r.media ?? []), visibility, noticeId: alert?.status === 'active' ? noticeId(alert.alert_id) : null,
    updates, outcome, ...(splitExtra(r.condition) ? { extra: splitExtra(r.condition) } : {}),
  };
}

export function mediaFromApi(media: ApiResidentReport['media']): Media[] {
  const counts = { photo: 0, video: 0 };
  return media.filter((m) => !m.is_evidence && (m.media_type ?? '').toLowerCase() !== 'document').map((m) => {
    const kind: Media['kind'] = (m.media_type ?? '').toLowerCase() === 'video' ? 'video' : 'photo';
    counts[kind] += 1;
    return { id: `m${m.media_id}`, name: `${kind === 'video' ? 'Video' : 'Photo'} ${counts[kind]}`, kind, size: 0, url: m.file_url };
  });
}

// ----------------------------------------------------------------------------------------------------------- notices
export const ALERT_PREFIX = 'alert-';
export const ANNOUNCEMENT_PREFIX = 'ann-';
export const noticeId = (alertId: number): string => `${ALERT_PREFIX}${alertId}`;
/** `alert-12` -> { kind: 'alert', id: 12 } ; `ann-7` -> { kind: 'announcement', id: 7 } ; otherwise null. */
export function noticeRef(id: string): { kind: 'alert' | 'announcement'; id: number } | null {
  const a = /^alert-(\d+)$/.exec(id);
  if (a) return { kind: 'alert', id: Number(a[1]) };
  const n = /^ann-(\d+)$/.exec(id);
  return n ? { kind: 'announcement', id: Number(n[1]) } : null;
}

/** How a community view shows "about here": the position the server already rounded, with a circle that always contains the true spot. */
export const GENERAL_RADIUS_M = 120;

export function sightingFromApi(s: ApiSighting): Sighting {
  const hasPin = s.latitude !== null && s.longitude !== null;
  return {
    id: `sg${s.sighting_id}`, observedAt: fromServer(s.seen_at), submittedAt: fromServer(s.submitted_at),
    location: { label: s.location_label?.trim() || PINNED_LABEL, lat: hasPin ? (s.latitude as number) : null, lng: hasPin ? (s.longitude as number) : null, manual: s.location_source !== 'map_pin' && !hasPin },
    description: s.description ?? '', by: s.is_mine ? 'you' : 'neighbour', onBehalf: false, photos: s.photo_url ? 1 : 0,
  };
}

export function noticeFromAlert(a: ApiResidentAlert, ctx: Pick<ResidentLookup, 'refOf'>, mineReportIds: ReadonlySet<number>): Notice {
  const found = a.alert_type === 'found_animal';
  const type = animalTypeOf(a.pet.species);
  const where = (a.last_seen.location ?? '').trim();
  const mine = a.is_owner || mineReportIds.has(a.report_id);
  const hasPin = a.last_seen.latitude !== null && a.last_seen.longitude !== null;
  const title = found ? `Found: ${WORD[type]}` : `Lost ${WORD[type]}${a.pet.name && a.pet.name !== 'Missing pet' ? `: ${a.pet.name}` : ''}`;
  return {
    id: noticeId(a.alert_id), type: a.alert_type, title, description: a.leader_message ?? a.owner_note ?? a.pet.description ?? '', area: where || 'Somewhere in the subdivision',
    ...(hasPin ? { approx: { lat: a.last_seen.latitude as number, lng: a.last_seen.longitude as number, radiusM: GENERAL_RADIUS_M } } : {}),
    animalType: type, photos: a.pet.photo_url ? 1 : 0, ...(a.pet.photo_url ? { photoUrls: [a.pet.photo_url] } : {}),
    publishedAt: fromServer(a.activated_at) || fromServer(a.requested_at), source: found ? 'admin' : 'owner', mine,
    reportNumber: a.report_id, ...(mine ? { reportId: ctx.refOf(a.report_id) } : {}), ...(a.last_seen.at ? { lastSeenAt: fromServer(a.last_seen.at) } : {}),
    status: a.status === 'active' ? 'active' : 'recovered', sightings: (a.sightings ?? []).map(sightingFromApi).sort((x, y) => y.observedAt.localeCompare(x.observedAt)),
  };
}

/** Announcement categories the app shows as safety advisories (the other categories are not shown here). */
export const ADVISORY_CATEGORIES: ReadonlySet<string> = new Set(['Animal Advisory', 'Emergency']);

export function noticeFromAnnouncement(a: ApiAnnouncement): Notice {
  return {
    id: `${ANNOUNCEMENT_PREFIX}${a.announcement_id}`, type: 'safety_advisory', title: a.title, description: a.content, area: a.location?.trim() || 'Your subdivision',
    photos: a.media.length, ...(a.media.length ? { photoUrls: a.media.map((m) => m.file_url) } : {}),
    publishedAt: fromServer(a.posted_on), source: 'admin', mine: false, status: 'active', sightings: [],
  };
}

// ------------------------------------------------------------------------------------------------------------- claims
const CLAIM_STATUS: Record<ApiResidentClaim['status'], ClaimStatus> = {
  submitted: 'submitted', under_review: 'under_review', needs_info: 'needs_info', accepted: 'approved', rejected: 'rejected', withdrawn: 'rejected',
};

/** The server keeps the latest decision, not a history, so a claim's timeline is: sent, then the latest decision. */
export function claimFromApi(c: ApiResidentClaim): Claim | null {
  if (c.status === 'withdrawn') return null;                          // a claim the resident withdrew is gone from their list
  const status = CLAIM_STATUS[c.status];
  const updates: ReportUpdate[] = [{ id: `cl${c.claim_id}-sent`, at: fromServer(c.submitted_at), kind: 'received', title: 'Claim submitted', body: 'Ownership claims are reviewed by an administrator. Registering a pet does not prove ownership on its own.' }];
  if (c.reviewed_at && c.status !== 'submitted') {
    const title = status === 'needs_info' ? 'More information requested' : status === 'approved' ? 'Claim approved' : status === 'rejected' ? 'Claim not approved' : 'Under review';
    updates.unshift({ id: `cl${c.claim_id}-review`, at: fromServer(c.reviewed_at), kind: status === 'needs_info' ? 'message' : 'status', title, ...(c.review_note ? { body: c.review_note } : {}) });
  }
  return {
    id: String(c.claim_id), noticeId: c.alert_id === null ? '' : noticeId(c.alert_id), petId: c.claimed_pet_id === null ? null : String(c.claimed_pet_id), status,
    statement: c.statement, evidence: c.evidence, submittedAt: fromServer(c.submitted_at), updates,
    ...((status === 'approved' || status === 'rejected') && c.review_note ? { decisionNote: c.review_note } : {}),
  };
}

/** The ownership-evidence ids the server knows, chosen from what the resident said they have. */
export function evidenceIdsFrom(proof: string[]): string[] {
  const ids = new Set<string>(['statement']);
  for (const p of proof) {
    const t = p.toLowerCase();
    if (t.includes('photo')) ids.add('photos');
    if (t.includes('vet') || t.includes('vaccination')) ids.add('vet');
    if (t.includes('tag') || t.includes('microchip') || t.includes('mark')) ids.add('markings');
  }
  return [...ids];
}

// --------------------------------------------------------------------------------------------------------------- pets
export function petFromApi(p: ApiPet): Pet {
  const color = [p.primary_color, p.secondary_color, p.color_markings].map((c) => (c ?? '').trim()).filter(Boolean);
  const photo = p.photo_url ?? p.photo_front_url ?? null;
  return {
    id: String(p.pet_id), name: p.pet_name, type: animalTypeOf(p.pet_type), breed: p.breed?.trim() ?? '', color: [...new Set(color)].join(', '),
    ageText: p.estimated_age?.trim() ?? (p.birth_date ? `Born ${p.birth_date}` : ''), markings: (p.distinctive_markings ?? '').split(/[,;]\s*/).map((m) => m.trim()).filter(Boolean),
    description: (p.notes ?? '').trim(), ...(photo ? { photoUrl: photo, photoName: 'Photo' } : {}), registeredAt: fromServer(p.created_at),
  };
}

/** A pet the resident saved, as the body the server takes. */
export function petToApi(p: Pet): Record<string, unknown> {
  return {
    pet_name: p.name, pet_type: ANIMAL_LABEL[p.type], breed: p.breed || null, color_markings: p.color || null, primary_color: null,
    estimated_age: p.ageText || null, distinctive_markings: p.markings.join(', ') || null, notes: p.description || null,
  };
}

// ---------------------------------------------------------------------------------------------------- notifications
/** Where a notification leads. Alert ids and report ids are different things, so each type is read for what its related_id is. */
export function notificationFromApi(n: ApiNotification, ctx: Pick<ResidentLookup, 'refOf' | 'claimOfReport'>): Notification {
  const type = (n.type ?? '').toLowerCase();
  const text = `${n.title} ${n.message ?? ''}`.toLowerCase();
  const id = n.related_id;
  let kind: Notification['kind'] = 'report_update';
  let to = '/reports';
  if (type.includes('lost_pet_alert')) {
    const sighting = /sighting|spotted/.test(text);
    kind = sighting ? 'sighting' : 'community_notice';
    to = id === null ? '/community' : sighting ? `/community/${noticeId(id)}/sightings` : `/community/${noticeId(id)}`;
  } else if (type.includes('ownership_claim')) {
    kind = 'claim_update';
    const claim = id === null ? undefined : ctx.claimOfReport(id);
    to = claim ? `/claims/${claim}` : '/community';
  } else if (id !== null) {
    to = `/reports/${ctx.refOf(id)}`;
  }
  return { id: String(n.notification_id), kind, title: n.title, body: n.message ?? '', at: fromServer(n.created_at), read: n.is_read, to };
}

// -------------------------------------------------------------------------------------------------- profile, settings
export function splitAddress(address: string | null | undefined): { unit: string; street: string } {
  const text = (address ?? '').trim();
  if (!text) return { unit: '', street: '' };
  const i = text.indexOf(',');
  return i < 0 ? { unit: text, street: '' } : { unit: text.slice(0, i).trim(), street: text.slice(i + 1).trim() };
}
export const joinAddress = (unit: string, street: string): string => [unit.trim(), street.trim()].filter(Boolean).join(', ');

export function profileFromUser(u: ApiUser): Profile {
  const { unit, street } = splitAddress(u.address);
  return { id: String(u.user_id), name: u.name, email: u.email, phone: u.phone?.trim() ?? '', unit, street, memberSince: fromServer(u.created_at) };
}

export function officeFrom(cats: ApiResidentCategories): Office | null {
  const o = cats.subdivision.office;
  if (!o.phone && !o.email && !o.address && !o.hours) return null;       // the office has not recorded how to reach it
  return { name: `${cats.subdivision.name ?? 'Subdivision'} office`, phone: o.phone, email: o.email, hours: o.hours, address: o.address };
}

/** Which kinds of report the subdivision accepts: the Leader's switch for the kind, and a stored category to file it under. */
export function acceptingFrom(cats: Pick<ApiResidentCategories, 'categories'>): Partial<Record<CategoryId, boolean>> {
  const out: Partial<Record<CategoryId, boolean>> = {};
  for (const c of cats.categories) out[c.id as CategoryId] = c.enabled && c.category_id !== null;
  return out;
}

/** The server's per-type, per-channel flags as the resident screen's switches. The community and advisory switches and SMS have no server flag. */
export function settingsFrom(p: ApiNotificationPrefs): Settings {
  return {
    notifications: { reportUpdates: p.email_reports || p.push_reports, sightings: p.email_pet_matches || p.push_pet_matches, claims: p.email_claims || p.push_claims, community: true, advisories: true },
    channels: { push: p.push_enabled, email: p.email_reports || p.email_pet_matches || p.email_claims || p.email_reminders, sms: false },
  };
}
/** The reverse: every flag follows its switch and its channel, so what was saved is what is read back. */
export function preferencesFrom(s: Settings): Partial<ApiNotificationPrefs> {
  const email = s.channels.email;
  return {
    email_reports: email && s.notifications.reportUpdates, push_reports: s.notifications.reportUpdates,
    email_pet_matches: email && s.notifications.sightings, push_pet_matches: s.notifications.sightings,
    email_claims: email && s.notifications.claims, push_claims: s.notifications.claims,
    email_reminders: email && s.notifications.reportUpdates,
    push_enabled: s.channels.push,
  };
}
