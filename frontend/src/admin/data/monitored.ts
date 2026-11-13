/**
 * What the page of a missing pet or a found animal is made of (pages/case/MonitoredCasePage.tsx). Pure functions over a case and its possible
 * matches: no React, nothing is changed here.
 *
 * The page follows one journey. A report is received, the Leader sees the animal, who reported it and what happened, and the report is
 * "under monitoring". It leaves that resting state only when something needs the Leader (`needsYou`): a possible match to review, someone to
 * contact, the Barangay's help, a possible recovery, a claim, a follow-up. After that the report goes back to monitoring, unless it is resolved.
 */
import type { CaseDialog } from '../pages/case/dialogState';
import { ANIMAL_TYPES, CONTACT_METHODS, REFERRAL_STATUS } from './constants';
import { when } from './alertSchedule';
import { levelLabel, matchSentence, matchesOf, mediationOf, partnerOf, pendingFollowUpsOf, sameReport } from './selectors';
import type { AnimalType, Case, LostPetSighting, Notice, PossibleMatch, ThreadTarget, TimelineEvent } from './types';
import { ago, daysSince, dueInfo, fmtDate, fmtDay, fmtTime, plural, relative } from '../../preview/lib/format';

const NOT_GIVEN = new Set(['', 'Not recorded', '—', 'Not given', 'No description of the animal was given.']);
const known = (text: string | null | undefined): text is string => !!text && !NOT_GIVEN.has(text.trim());
const sentence = (parts: Array<string | null | undefined>, glue = ' · ') => parts.filter(known).join(glue);

/** The first part of a generated title: "Missing dog, Gate 2" -> "Missing dog" (the place has its own line). */
export const titleHead = (title: string) => title.split(',')[0].trim() || title;

/**
 * The possible-recovery record the server makes when a Leader links a missing pet to a found animal (services/lost_found_matching.py,
 * `_open_conversation`). It is how the owner and the finder are put in touch, not a neighbour's report, so it is never shown as a
 * sighting or asked about as a lead.
 */
export const LINK_RECORD_NOTE = 'Linked by the Subdivision Leader from a found-animal report.';
export const isLinkRecord = (s: LostPetSighting) => s.kind === 'secured' && s.description === LINK_RECORD_NOTE;

// ---------------------------------------------------------------------------------------------------------------- the animal
export interface Hero {
  kind: 'lost' | 'found';
  /** The pet's name; for a found animal, what was found. */
  name: string;
  /** The pet's own name is known (a registered pet). Otherwise `name` is made from the title ("Missing dog") and is not used as a name in sentences. */
  named: boolean;
  /** "Dog · Shih Tzu · Female · 3 years" */
  about: string;
  /** "White and golden, with a white chest" */
  looks: string;
  photos: string[];
  animal: AnimalType;
  whenLabel: 'Last seen' | 'Found';
  when: string | null;
  where: string;
  /** What the person who reported it wrote. */
  words: string;
  pin: { lat: number; lng: number } | null;
  petId: string | null;
  /** What changed in the pet's record since the report was filed ("colour"). */
  changed: string[];
}

export function heroOf(c: Case): Hero {
  const lost = c.category === 'lost_pet';
  const rp = lost && c.registeredPet && !c.registeredPet.unavailable ? c.registeredPet : null;
  const pet = rp ? rp.asReported ?? rp.current : null;
  const evidencePhotos = c.evidence.filter((e) => e.kind === 'photo' && e.url).map((e) => e.url as string);
  const photos = [...new Set([...(pet?.photos ?? []), ...evidencePhotos])];
  const seen = c.lostPet?.lastSeen;
  const where = (lost ? seen?.where || rp?.lastSeen?.where : '') || sentence([c.location.area, c.location.detail], ', ') || 'Place not given';
  const pinOf = (p?: { lat?: number; lng?: number } | null) => (p && typeof p.lat === 'number' && typeof p.lng === 'number' ? { lat: p.lat, lng: p.lng } : null);
  const pin = (lost ? pinOf(seen) ?? pinOf(rp?.lastSeen) : null) ?? pinOf(c.location);
  const petName = pet?.name;
  if (lost) {
    return {
      kind: 'lost', name: known(petName) ? petName : titleHead(c.title), named: known(petName),
      about: pet ? sentence([pet.species, pet.breed, pet.sex, pet.age]) || ANIMAL_TYPES[c.animal.type] : ANIMAL_TYPES[c.animal.type],
      looks: pet ? sentence([pet.colour, pet.markings], ', ') || (known(c.animal.description) ? c.animal.description : '') : (known(c.animal.description) ? c.animal.description : ''),
      photos, animal: c.animal.type, whenLabel: 'Last seen', when: seen?.at ?? rp?.lastSeen?.at ?? c.observedAt, where, words: c.description.trim(), pin,
      petId: rp?.petId ?? null, changed: rp?.changedSince ?? [],
    };
  }
  return {
    kind: 'found', name: titleHead(c.title), named: false, about: known(c.animal.description) ? c.animal.description : `${ANIMAL_TYPES[c.animal.type]}${c.animal.count > 1 ? ` × ${c.animal.count}` : ''}`,
    looks: c.animal.count > 1 ? `${c.animal.count} animals` : '', photos, animal: c.animal.type, whenLabel: 'Found', when: c.observedAt, where, words: c.description.trim(),
    pin, petId: null, changed: [],
  };
}

/** How "until resolved" reads for this case in an alert's schedule: "Mochi is home", "the owner is found". */
export function subjectEnd(c: Case): string {
  if (c.category !== 'lost_pet') return 'the owner is found';
  const h = heroOf(c);
  return h.named ? `${h.name} is home` : 'the pet is home';
}

// --------------------------------------------------------------------------------------------------------------- the people
export interface Person { role: string; name: string; where: string; phone: string; email: string; residentId: string | null; note?: string; contact?: ThreadTarget }

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'resident';

/** Who the Leader may need to reach: the owner of a missing pet and whoever reported it; the resident on a found-animal report and the owner of the report it is linked to. */
export function peopleOf(c: Case, matches: PossibleMatch[]): Person[] {
  const out: Person[] = [];
  if (c.category === 'lost_pet') {
    const rp = c.registeredPet && !c.registeredPet.unavailable ? c.registeredPet : null;
    const owner = rp?.owner ?? null;
    if (owner) {
      const incidentOwner = rp?.reporterIsOwner === true;
      out.push({ role: incidentOwner ? 'Owner' : 'Current registry owner', name: owner.name, where: owner.address, phone: owner.phone, email: owner.email, residentId: owner.residentId, ...(owner.residentId && incidentOwner ? { contact: { kind: 'direct', party: 'owner', name: owner.name, label: 'Contact the owner' } as ThreadTarget } : {}), ...(!incidentOwner ? { note: 'The registry owner differs from the reporter. This earlier report’s conversation stays with its original participants.' } : owner.emergencyContact ? { note: `Emergency contact: ${owner.emergencyContact}` } : {}) });
    }
    if (!owner || !rp?.reporterIsOwner) out.push({ role: 'Reported by', name: c.reporter.name, where: c.reporter.unit, phone: c.reporter.phone, email: c.reporter.email, residentId: c.reporter.residentId, ...(c.reporter.residentId ? { contact: { kind: 'direct', party: 'reporter', name: c.reporter.name, label: `Contact ${firstName(c.reporter.name)}` } as ThreadTarget } : {}) });
    for (const m of matchesOf(matches, c.id).linked) {
      const f = partnerOf(m, c.id);
      if (f.reporter) out.push({ role: `Found-animal report (${f.caseId})`, name: f.reporter.name, where: '—', phone: f.reporter.phone, email: '—', residentId: f.reporter.residentId, ...(f.open && f.reporter.residentId ? { contact: { kind: 'direct', party: 'reporter', name: f.reporter.name, label: `Contact ${firstName(f.reporter.name)}`, reportId: f.caseId } as ThreadTarget } : {}) });
    }
    return out;
  }
  out.push({ role: 'Reported by', name: c.reporter.name, where: c.reporter.unit, phone: c.reporter.phone, email: c.reporter.email, residentId: c.reporter.residentId, ...(c.reporter.residentId ? { contact: { kind: 'direct', party: 'reporter', name: c.reporter.name, label: `Contact ${firstName(c.reporter.name)}` } as ThreadTarget } : {}) });
  for (const m of matchesOf(matches, c.id).linked) {
    const o = partnerOf(m, c.id);
    if (o.reporter) out.push({ role: `Owner of ${o.title}`, name: o.reporter.name, where: '—', phone: o.reporter.phone, email: '—', residentId: o.reporter.residentId, ...(o.open && o.reporter.residentId ? { contact: { kind: 'direct', party: 'owner', name: o.reporter.name, label: 'Contact the owner', reportId: o.caseId } as ThreadTarget } : {}) });
  }
  return out;
}

// -------------------------------------------------------------------------------------------------------------- needs you
export type NeedKind = 'help' | 'lead' | 'match' | 'claim' | 'followup' | 'barangay' | 'update';
export interface Need {
  id: string;
  kind: NeedKind;
  score: number;
  /** One sentence, in plain words. */
  title: string;
  detail?: string;
  /** The label of the one button. */
  action: string;
  /** What the button does: open a dialog on the case, or open the help panel of one request. */
  open: CaseDialog | { kind: 'help'; conversationId: string };
  match?: PossibleMatch;
}

/**
 * The things that genuinely need the Leader now, most pressing first. Empty means the report is simply being monitored: nothing is asked of
 * anyone. A closed report asks for nothing.
 */
export function needsYou(c: Case, matches: PossibleMatch[], now: Date): Need[] {
  if (c.status === 'closed') return [];
  const out: Need[] = [];
  const pet = heroOf(c).name;

  for (const r of mediationOf(c)) {
    out.push({
      id: `help-${r.id}`, kind: 'help', score: 100, title: `${r.ownerName} and ${r.finderName} asked you to help them get in touch`,
      ...(r.requestedAt ? { detail: `Asked ${relative(r.requestedAt, now).toLowerCase()}. Direct messages between them are closed.` } : { detail: 'Direct messages between them are closed.' }), action: 'Help them', open: { kind: 'help', conversationId: r.id },
    });
  }
  for (const s of c.lostPet?.sightings ?? []) {
    if (s.kind !== 'secured' || s.review !== 'unverified' || isLinkRecord(s)) continue;
    out.push({
      id: `lead-${s.id}`, kind: 'lead', score: 90, title: `${s.reportedBy} may have ${pet} safe with them`,
      detail: sentence([s.place, ago(s.seenAt, now) ?? relative(s.seenAt, now)]), action: 'Review', open: { kind: 'reviewSighting', sightingId: s.id },
    });
  }
  for (const m of matchesOf(matches, c.id).waiting) {
    out.push({
      id: `match-${m.id}`, kind: 'match', score: m.level === 'strong' ? 85 : 65, title: matchSentence(m, c.id),
      detail: sentence([levelLabel(m.level), ...m.reasons.slice(0, 2)]), action: 'Review match', open: { kind: 'match', matchId: m.id }, match: m,
    });
  }
  for (const k of c.claims) {
    if (k.status !== 'submitted' && k.status !== 'under_review' && k.status !== 'needs_info') continue;
    out.push({ id: `claim-${k.id}`, kind: 'claim', score: 80, title: `${k.claimantName} says this is their pet`, detail: 'Their claim is waiting for your answer.', action: 'Review claim', open: { kind: 'claim', claimId: k.id } });
  }
  for (const f of pendingFollowUpsOf(c)) {
    if (!f.dueAt) continue;
    const due = dueInfo(f.dueAt, now);
    if (!due.overdue && !due.today) continue;
    out.push({ id: `followup-${f.id}`, kind: 'followup', score: due.overdue ? 75 : 55, title: `${due.overdue ? 'Follow-up overdue' : 'Follow-up due today'}: ${f.title}`, detail: due.label, action: 'Mark done', open: { kind: 'completeFollowUp', followUpId: f.id } });
  }
  for (const r of c.referrals) {
    if (r.orgId !== 'barangay') continue; // Older organisations are history, not new assistance tasks.
    if (r.status === 'to_contact') {
      out.push({ id: `ask-${r.id}`, kind: 'barangay', score: 70, title: `Help from ${r.orgName} is written down, but nobody has been contacted`, detail: 'It counts as contact once you record the attempt.', action: 'Record contact', open: { kind: 'coordination', referralId: r.id, contact: true } });
    } else if ((r.status === 'no_response' || r.status === 'sent' || r.status === 'acknowledged') && daysSince(r.updatedAt, now) >= 3) {
      // only after days of silence: a call that was just made, or just went unanswered, is not asked about again at once (the report goes back to being monitored)
      out.push({ id: `wait-${r.id}`, kind: 'update', score: 60, title: `No update from ${r.orgName} for ${plural(Math.max(1, daysSince(r.updatedAt, now)), 'day')}`, action: 'Record update', open: { kind: 'coordination', referralId: r.id } });
    }
  }
  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------------------------------- the situation, in tiles
export type TileTone = 'sage' | 'brand' | 'amber' | 'red';
/** What a tile's one action does: open a dialog on the case, open or create the Community notice, or go to the alerts below. */
export type TileOpen = CaseDialog | { kind: 'viewNotice'; noticeId: string } | { kind: 'createNotice' } | { kind: 'alerts' };
export interface Tile { key: string; label: string; value: string; meta?: string; tone?: TileTone; action?: { label: string; open: TileOpen } }

/** "38 min ago", "yesterday", "Nov 3, 2026": a time inside a sentence. */
const since = (iso: string, now: Date) => {
  const ahead = new Date(iso).getTime() - now.getTime();
  if (ahead > 0 && ahead < 10 * 60_000) return 'just now';           // the page's clock ticks once a minute; the server's stamp can be a moment ahead
  const r = relative(iso, now);
  return r === 'Yesterday' || r === 'Just now' ? r.toLowerCase() : r;
};
const toneOf = (tone: string): TileTone | undefined => (tone === 'sage' || tone === 'brand' || tone === 'amber' || tone === 'red' ? tone : undefined);
const LIVE_ALERT = new Set(['scheduled', 'active', 'paused']);

/**
 * What is true of the report right now, one tile per topic: its state in a word or two, a line of detail and, when there is one, the one occasional
 * action that belongs to it. What needs the Leader is not repeated here (it is in `needsYou`). The Community notice and the notification alerts have a
 * tile each: they are separate things (an alert never posts to Community or changes the notice).
 */
export function situationTiles(c: Case, matches: PossibleMatch[], now: Date, notice: Notice | undefined): Tile[] {
  const out: Tile[] = [];
  const open = c.status !== 'closed';
  const lost = c.category === 'lost_pet';
  const mine = matchesOf(matches, c.id);
  const seen = (c.lostPet?.sightings ?? []).filter((s) => !isLinkRecord(s));

  if (lost) {
    out.push(seen.length === 0
      ? { key: 'sightings', label: 'Sightings', value: 'None yet', meta: 'Neighbours report them from the notice' }
      : { key: 'sightings', label: 'Sightings', value: plural(seen.length, 'sighting'), meta: `Latest ${since(seen[0].seenAt, now)}` });
  }

  const other = lost ? 'found-animal report' : 'missing-pet report';
  const partners = mine.linked.map((m) => partnerOf(m, c.id));
  const byHand = c.relatedCaseIds.filter((id) => !partners.some((p) => sameReport(p.caseId, id)));
  const linkedCount = partners.length + byHand.length;
  if (linkedCount > 0) {
    out.push({ key: 'related', label: 'Linked reports', value: linkedCount === 1 ? 'Linked' : `${linkedCount} linked`, tone: 'sage', meta: linkedCount === 1 ? (partners[0]?.title ?? byHand[0]) : 'Listed below' });
  } else if (mine.waiting.length > 0) {
    out.push({ key: 'related', label: 'Linked reports', value: plural(mine.waiting.length, 'possible match', 'possible matches'), tone: 'amber', meta: 'Waiting for your review' });
  } else {
    out.push({ key: 'related', label: 'Linked reports', value: 'None', meta: `No ${other} is linked` });
  }

  if (!c.sensitive) {
    const shown = notice && notice.status !== 'archived' ? notice : undefined;
    const viewAction = shown ? { label: 'View notice', open: { kind: 'viewNotice' as const, noticeId: shown.id } } : undefined;
    const lp = c.lostPet?.notice;
    if (lost && lp?.status === 'active') {
      const atFiling = !!lp.publishedAt && Math.abs(new Date(lp.publishedAt).getTime() - new Date(c.reportedAt).getTime()) < 10 * 60_000;
      const by = atFiling ? `When ${c.reporter.name.trim() ? firstName(c.reporter.name) : 'the owner'} filed` : lp.publishedAt ? `Published ${since(lp.publishedAt, now)}` : '';
      out.push({ key: 'notice', label: 'Community notice', value: 'Published', tone: 'sage', meta: sentence([by, lp.residentsNotified ? `${lp.residentsNotified} notified` : '']), ...(viewAction ? { action: viewAction } : {}) });
    } else if (!lost && shown?.status === 'published') {
      out.push({ key: 'notice', label: 'Community notice', value: 'Published', tone: 'sage', meta: shown.publishedAt ? `Published ${since(shown.publishedAt, now)}` : 'Residents can see it', ...(viewAction ? { action: viewAction } : {}) });
    } else if (shown || (lost && lp?.status === 'requested')) {
      // written but not published (a found animal's notice a resident asked for, or an older missing-pet request)
      const publish = lost ? (viewAction ?? { label: 'Open notice', open: { kind: 'createNotice' as const } }) : { label: 'Publish notice', open: { kind: 'publishNotice' as const } };
      out.push({ key: 'notice', label: 'Community notice', value: 'Not published yet', tone: 'amber', meta: 'Residents can’t see it yet', ...(open ? { action: publish } : {}) });
    } else {
      const create = lost ? { label: 'Create notice', open: { kind: 'createNotice' as const } } : { label: 'Publish notice', open: { kind: 'publishNotice' as const } };
      out.push({ key: 'notice', label: 'Community notice', value: lp?.status === 'closed' ? 'Closed' : 'Not published', meta: lost ? 'Residents can’t see it' : 'Residents can’t see this animal yet', ...(open ? { action: create } : {}) });
    }

    const live = c.alerts.filter((a) => LIVE_ALERT.has(a.status));
    if (live.length > 0) {
      const paused = live.filter((a) => a.status === 'paused').length;
      const next = live.map((a) => a.nextSendAt).filter((t): t is string => !!t).sort()[0];
      const one = live[0];
      const value = live.length === 1 ? (one.status === 'paused' ? '1 paused' : one.schedule.mode === 'repeat' ? '1 repeating' : '1 scheduled')
        : [live.length - paused ? `${live.length - paused} active` : '', paused ? `${paused} paused` : ''].filter(Boolean).join(', ');
      out.push({ key: 'alerts', label: 'Alerts', value, tone: 'brand', meta: next ? `Next send ${when(new Date(next), now)}` : 'Nothing goes out while paused', action: { label: 'Manage', open: { kind: 'alerts' } } });
    } else {
      const sends = c.alerts.reduce((n, a) => n + a.sendsDone, 0);
      out.push({
        key: 'alerts', label: 'Alerts', value: sends ? `${plural(sends, 'send')} made` : 'None sent', ...(sends ? { tone: 'sage' as const } : {}),
        meta: sends ? 'No alert is active' : 'Notifications to residents', ...(open ? { action: { label: c.alerts.length ? 'Send another' : 'Send an alert', open: { kind: 'alert' as const } } } : {}),
      });
    }
  }

  const barangay = c.referrals.filter((r) => r.orgId === 'barangay');
  const asked = barangay.filter((r) => r.status !== 'to_contact');
  if (asked.length > 0) {
    const last = [...asked].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    out.push({ key: 'barangay', label: 'Barangay', value: REFERRAL_STATUS[last.status].label, tone: toneOf(REFERRAL_STATUS[last.status].tone), meta: `Updated ${since(last.updatedAt, now)}` });
  } else if (barangay.length > 0) {
    out.push({ key: 'barangay', label: 'Barangay', value: 'Not contacted yet', tone: 'amber', meta: 'Written down, nobody called yet' });
  } else {
    out.push({ key: 'barangay', label: 'Barangay', value: 'Not asked', meta: 'Only if you need their help', ...(open ? { action: { label: 'Ask for help', open: { kind: 'referral' as const } } } : {}) });
  }

  const contact = [...c.ownerContacts].sort((a, b) => b.at.localeCompare(a.at))[0];
  if (contact) out.push({ key: 'contact', label: 'Last contact', value: contact.withWhom, meta: `${CONTACT_METHODS[contact.method]} · ${since(contact.at, now)}` });

  const next = pendingFollowUpsOf(c).filter((f) => f.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  if (next && open) {
    const due = dueInfo(next.dueAt, now);
    if (!due.overdue && !due.today) out.push({ key: 'next', label: 'Next check', value: due.label, meta: next.title });
  }
  return out;
}

/** "Under monitoring since Nov 12, 2:14 PM · last update 38 min ago": the calm state's one line. */
export function monitoringLine(c: Case, now: Date): string {
  const latest = [c.updatedAt, activityOf(c)[0]?.at].filter((t): t is string => !!t).sort().pop() ?? c.reportedAt;
  const filed = new Date(c.reportedAt);
  const stamp = `${filed.getFullYear() === now.getFullYear() ? fmtDay(c.reportedAt) : fmtDate(c.reportedAt)}, ${fmtTime(c.reportedAt)}`;
  return `Under monitoring since ${stamp} · last update ${since(latest, now)}`;
}

// ------------------------------------------------------------------------------------------------------------------ activity
/**
 * Everything that happened on the report, newest first, in one list: what the system and the residents recorded (with the staff notes the system writes), the
 * Leader's contacts and the follow-ups finished. Nothing in it is typed in by hand on this page. (The history on its own does not hold contacts or finished follow-ups; it already says when the Barangay was asked.)
 */
export function activityOf(c: Case): TimelineEvent[] {
  // (a status change is left out: a missing pet and a found animal have no status to follow, they are simply monitored; a staff note is shown as the sentence
  // it is, in full, not as "Internal note added", because nobody types one here: the system writes them)
  const out: TimelineEvent[] = c.timeline.filter((e) => e.kind !== 'status' && e.kind !== 'priority' && e.kind !== 'note');
  for (const n of c.notes) out.push({ id: `note-${n.id}`, at: n.at, actor: n.by, kind: 'note', title: n.text });
  for (const o of c.ownerContacts) out.push({ id: `contact-${o.id}`, at: o.at, actor: o.by, kind: 'owner_contact', title: `Contacted ${o.withWhom} (${CONTACT_METHODS[o.method].toLowerCase()})`, detail: o.summary });
  for (const f of c.followUps) if (f.status === 'done' && f.completedAt) out.push({ id: `followup-${f.id}`, at: f.completedAt, actor: f.createdBy, kind: 'follow_up', title: `Follow-up done: ${f.title}`, ...(f.completionNote ? { detail: f.completionNote } : {}) });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
