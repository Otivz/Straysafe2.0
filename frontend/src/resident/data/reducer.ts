/**
 * All preview mutations as one pure reducer. Screens never edit records directly; they dispatch an action.
 * When connected to the API each action maps to one request. IDs come from a counter in state and timestamps arrive on the
 * action, so the reducer stays pure under StrictMode.
 *
 * The `preview/*` actions stand in for the subdivision administrator (who has no screen here): they move a report or
 * claim forward and add the resident-visible message an administrator would send. They exist only in this preview.
 */
import { fromLocalInput, toLocalInput } from '../../preview/lib/format';
import { generalize, samplePoint } from '../../preview/geo';
import { pointOf } from '../lib/location';
import { ANIMAL_TYPES, CLAIM_STATUS } from './constants';
import type {
  CategoryId, Claim, Draft, GeoPoint, Media, Notice, Notification, Pet, Profile, Report, ReportKind, ReportUpdate, ResidentState, Settings, Sighting,
} from './types';

export type ResidentAction =
  | { type: 'draft/start'; kind: ReportKind; category: CategoryId; patch?: Partial<Draft> }
  | { type: 'draft/patch'; patch: Partial<Draft> }
  | { type: 'draft/clear' }
  | { type: 'report/submit' }
  | { type: 'report/addUpdate'; reportId: string; text: string; media?: Media[] }
  | { type: 'lost/recover'; reportId: string; note: string }
  | { type: 'sighting/add'; noticeId: string; observedAt: string; location: GeoPoint; description: string; onBehalf: boolean; photos: number }
  | { type: 'claim/submit'; noticeId: string; petId: string | null; statement: string; evidence: string[] }
  | { type: 'claim/addInfo'; claimId: string; text: string }
  | { type: 'pet/save'; pet: Pet }
  | { type: 'notification/read'; id: string }
  | { type: 'notification/readAll' }
  | { type: 'profile/update'; patch: Partial<Pick<Profile, 'name' | 'email' | 'phone' | 'unit' | 'street'>> }
  | { type: 'settings/set'; settings: Settings }
  | { type: 'contact/send'; topic: string; message: string }
  | { type: 'preview/advanceReport' }
  | { type: 'preview/advanceClaim'; decision?: 'reject' }
  | { type: 'preview/sighting' }
  | { type: 'preview/replace'; state: ResidentState };

export type Stamped = ResidentAction & { now: string };

export const refId = (n: number) => `SS-2026-${String(n).padStart(4, '0')}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const firstSentence = (s: string) => s.trim().split(/(?<=[.!?])\s/)[0];
/** The general area a notice may show for a place: nothing when the place was only described in words. */
const area = (g: GeoPoint) => { const p = pointOf(g); return p ? generalize(p.lat, p.lng) : undefined; };

export const emptyDraft = (kind: ReportKind, category: CategoryId, now: string): Draft => ({
  kind, category, animalType: '', petId: null, petName: '', description: '', observedAt: toLocalInput(now), location: null, media: [], extra: '',
});

function closedOutcome(category: CategoryId, now: string): NonNullable<Report['outcome']> {
  if (category === 'nuisance') return { label: 'Closed without a confirmed resolution', summary: 'Follow-up did not confirm the problem or an owner, so the case was closed. It can be reopened if it returns.', resolved: false, at: now };
  if (category === 'injured') return { label: 'Handled by the animal welfare group', summary: 'An animal welfare group took over the animal. Nothing further is needed from you.', resolved: true, at: now };
  if (category === 'found_animal') return { label: 'Owner found', summary: 'The owner was identified and the animal was returned home.', resolved: true, at: now };
  return { label: 'Concern resolved', summary: 'The subdivision followed up and the concern was resolved.', resolved: true, at: now };
}

const IN_PROGRESS_MESSAGE: Record<CategoryId, string> = {
  lost_pet: 'Your lost-pet notice is visible to neighbours. Tell us as soon as your pet is home.',
  found_animal: 'A found-animal notice was published so the owner can come forward.',
  nuisance: 'The subdivision started following up with the people involved.',
  safety: 'The subdivision started coordinating a response and asked outside help. Please keep a safe distance from the animal.',
  injured: 'The subdivision asked a local animal welfare group for help. Please do not try to handle the animal.',
  other: 'The subdivision started following up on your concern.',
};

const SIGHTING_TEXT = ['Seen walking along the sidewalk, looked calm.', 'Resting under a parked car near the carport.', 'Seen near the playground at dusk.'];
const SIGHTING_PLACE = ['Near the Phase 2 gate', 'Block 6 carports', 'Near the park'];
// Sample coordinates (inside the approximate outline) so the sighting shows on the map: the owner is the one who sees them exactly.

export function reducer(state: ResidentState, a: Stamped): ResidentState {
  const now = a.now;
  let seq = state.seq;
  const id = (p: string) => `${p}-${++seq}`;
  const update = (kind: ReportUpdate['kind'], title: string, body?: string): ReportUpdate => ({ id: id('up'), at: now, kind, title, body });
  const notify = (n: Omit<Notification, 'id' | 'at' | 'read'>): Notification => ({ id: id('nt'), at: now, read: false, ...n });
  const done = (next: Partial<ResidentState>): ResidentState => ({ ...state, ...next, seq });

  switch (a.type) {
    case 'preview/replace':
      return a.state;

    case 'draft/start':
      return done({ draft: { ...emptyDraft(a.kind, a.category, now), ...a.patch } });
    case 'draft/patch':
      return state.draft ? done({ draft: { ...state.draft, ...a.patch } }) : state;
    case 'draft/clear':
      return done({ draft: null });

    case 'report/submit': {
      const d = state.draft;
      if (!d || !d.location || !d.animalType) return state;
      const reportId = refId(state.nextRef);
      const observedAt = fromLocalInput(d.observedAt);
      const animal = ANIMAL_TYPES[d.animalType].toLowerCase();
      const title = d.kind === 'lost' ? `Lost pet: ${d.petName.trim() || `my ${animal}`}` : d.kind === 'found' ? `Found: ${animal}` : clip(firstSentence(d.description), 70);
      const visibility: Report['visibility'] = d.kind === 'lost' ? 'published' : d.kind === 'found' ? 'pending_review' : 'private';
      let noticeId: string | null = null;
      let notices = state.notices;
      const updates = [update('received', 'Report received', visibility === 'private' ? 'This report is private. Only authorized subdivision administrators can see it.' : visibility === 'published' ? 'Your lost-pet notice is visible to neighbours. Your contact details are not shown.' : 'An administrator will review it before any notice is published.')];
      if (d.kind === 'lost') {
        noticeId = id('n');
        const notice: Notice = {
          id: noticeId, type: 'lost_pet', title: `Lost ${animal}${d.petName.trim() ? `: ${d.petName.trim()}` : ''}`, description: d.description.trim(), area: d.location.label, animalType: d.animalType, photos: d.media.length,
          publishedAt: now, source: 'owner', mine: true, reportId, lastSeenAt: observedAt, status: 'active', sightings: [],
          approx: area(d.location),
        };
        notices = [notice, ...notices];
      }
      const report: Report = {
        id: reportId, kind: d.kind, category: d.category, status: 'reported', title, description: d.description.trim(), animalType: d.animalType, petName: d.petName.trim() || undefined, petId: d.petId,
        location: d.location, observedAt, submittedAt: now, updatedAt: now, media: d.media, visibility, noticeId, updates, outcome: null, extra: d.extra.trim() || undefined,
      };
      return done({ reports: [report, ...state.reports], notices, draft: null, nextRef: state.nextRef + 1 });
    }

    case 'report/addUpdate':
      return done({ reports: state.reports.map((r) => (r.id === a.reportId ? { ...r, updatedAt: now, media: [...r.media, ...(a.media ?? [])], updates: [update('you', 'You added information', a.text), ...r.updates] } : r)) });

    case 'lost/recover': {
      const r = state.reports.find((x) => x.id === a.reportId);
      if (!r) return state;
      const summary = a.note.trim() || 'You confirmed your pet is back home.';
      const outcome = { label: 'Pet recovered', summary, resolved: true, at: now };
      return done({
        reports: state.reports.map((x) => (x.id === a.reportId ? { ...x, status: 'closed' as const, visibility: 'private' as const, updatedAt: now, outcome, updates: [update('outcome', 'Pet recovered', summary), ...x.updates] } : x)),
        notices: state.notices.map((n) => (n.id === r.noticeId ? { ...n, status: 'recovered' as const } : n)),
      });
    }

    case 'sighting/add': {
      const s: Sighting = { id: id('sg'), observedAt: fromLocalInput(a.observedAt), submittedAt: now, location: a.location, description: a.description.trim(), by: 'you', onBehalf: a.onBehalf, photos: a.photos };
      const target = state.notices.find((n) => n.id === a.noticeId);
      return done({
        notices: state.notices.map((n) => (n.id === a.noticeId ? { ...n, sightings: [s, ...n.sightings].sort((x, y) => y.observedAt.localeCompare(x.observedAt)) } : n)),
        reports: target?.mine ? state.reports.map((r) => (r.noticeId === a.noticeId ? { ...r, updatedAt: now, updates: [update('you', 'You added a sighting', a.description.trim()), ...r.updates] } : r)) : state.reports,
      });
    }

    case 'claim/submit': {
      const claim: Claim = {
        id: id('cl'), noticeId: a.noticeId, petId: a.petId, status: 'submitted', statement: a.statement.trim(), evidence: a.evidence, submittedAt: now,
        updates: [update('received', 'Claim submitted', 'Ownership claims are reviewed by an administrator. Registering a pet does not prove ownership on its own.')],
      };
      return done({ claims: [claim, ...state.claims] });
    }

    case 'claim/addInfo':
      return done({ claims: state.claims.map((c) => (c.id === a.claimId && c.status === 'needs_info' ? { ...c, status: 'under_review' as const, updates: [update('you', 'You added information', a.text), ...c.updates] } : c)) });

    case 'pet/save': {
      const exists = state.pets.some((p) => p.id === a.pet.id);
      return done({ pets: exists ? state.pets.map((p) => (p.id === a.pet.id ? a.pet : p)) : [...state.pets, { ...a.pet, registeredAt: now }] });
    }

    case 'notification/read':
      return done({ notifications: state.notifications.map((n) => (n.id === a.id ? { ...n, read: true } : n)) });
    case 'notification/readAll':
      return done({ notifications: state.notifications.map((n) => ({ ...n, read: true })) });
    case 'profile/update':
      return done({ profile: { ...state.profile, ...a.patch } });
    case 'settings/set':
      return done({ settings: a.settings });
    // The preview only simulates sending (latency, failure, success); the message is not stored anywhere.
    case 'contact/send':
      return state;

    // ------------------------------------------------------------------------------------- preview: the administrator
    case 'preview/advanceReport': {
      const r = [...state.reports].filter((x) => x.status !== 'closed').sort((x, y) => y.updatedAt.localeCompare(x.updatedAt))[0];
      if (!r) return state;
      let next: Report = r;
      let notices = state.notices;
      let title = '';
      if (r.status === 'reported') {
        title = 'Under review';
        next = { ...r, status: 'under_review', updates: [update('status', title, 'An administrator is reviewing your report.'), ...r.updates] };
      } else if (r.status === 'under_review') {
        title = 'In progress';
        next = { ...r, status: 'in_progress', updates: [update('status', title, IN_PROGRESS_MESSAGE[r.category]), ...r.updates] };
        if (r.kind === 'found' && r.visibility === 'pending_review') {
          const noticeId = id('n');
          notices = [{ id: noticeId, type: 'found_animal', title: `Found: ${ANIMAL_TYPES[r.animalType].toLowerCase()}`, description: r.description, area: r.location.label, animalType: r.animalType, photos: r.media.length, publishedAt: now, source: 'admin', mine: true, reportId: r.id, status: 'active', sightings: [], approx: area(r.location) }, ...notices];
          next = { ...next, visibility: 'published', noticeId };
        }
      } else if (r.kind === 'lost') {
        title = 'No new information yet';
        next = { ...r, updates: [update('message', title, 'Your notice stays visible to neighbours. Tell us as soon as your pet is home.'), ...r.updates] };
      } else {
        title = 'Closed';
        const outcome = closedOutcome(r.category, now);
        // Closing a case takes its notice (if it had one) out of Community, so the report is private again.
        next = { ...r, status: 'closed', outcome, visibility: 'private', updates: [update('outcome', title, outcome.summary), ...r.updates] };
        if (r.noticeId) notices = notices.map((n) => (n.id === r.noticeId ? { ...n, status: 'recovered' as const } : n));
      }
      next = { ...next, updatedAt: now };
      return done({ reports: state.reports.map((x) => (x.id === r.id ? next : x)), notices, notifications: [notify({ kind: 'report_update', title: `Update on ${r.id}`, body: title === 'Closed' ? 'Your report is closed. See the final outcome.' : title, to: `/reports/${r.id}` }), ...state.notifications] });
    }

    case 'preview/advanceClaim': {
      const c = state.claims.find((x) => x.status !== 'approved' && x.status !== 'rejected');
      if (!c) return state;
      const hasReview = c.updates.some((u) => u.title === 'Under review');
      const asked = c.updates.some((u) => u.kind === 'message');
      let status: Claim['status'];
      let note = '';
      if (a.decision === 'reject') { status = 'rejected'; note = 'The information was not enough to confirm ownership. If you have more to show, contact the subdivision office.'; }
      else if (c.status === 'submitted') { status = 'under_review'; note = 'An administrator is comparing your information.'; }
      else if (c.status === 'under_review' && !asked && hasReview) { status = 'needs_info'; note = 'Could you describe one mark that is not in the photos, and where the animal usually sleeps?'; }
      else { status = 'approved'; note = 'Your information matched. Please contact the subdivision office to arrange the handover.'; }
      const kind: ReportUpdate['kind'] = status === 'needs_info' ? 'message' : 'status';
      const title = status === 'needs_info' ? 'More information requested' : status === 'approved' ? 'Claim approved' : status === 'rejected' ? 'Claim not approved' : CLAIM_STATUS[status].label;
      return done({
        claims: state.claims.map((x) => (x.id === c.id ? { ...x, status, decisionNote: status === 'approved' || status === 'rejected' ? note : x.decisionNote, updates: [update(kind, title, note), ...x.updates] } : x)),
        notifications: [notify({ kind: 'claim_update', title: `Your ownership claim: ${CLAIM_STATUS[status].label.toLowerCase()}`, body: note, to: `/claims/${c.id}` }), ...state.notifications],
      });
    }

    case 'preview/sighting': {
      const notice = state.notices.find((n) => n.mine && n.type === 'lost_pet' && n.status === 'active');
      if (!notice) return state;
      const i = notice.sightings.length % SIGHTING_TEXT.length;
      const s: Sighting = { id: id('sg'), observedAt: now, submittedAt: now, location: { label: SIGHTING_PLACE[i], ...samplePoint(`neighbour ${SIGHTING_PLACE[i]}`), manual: false }, description: SIGHTING_TEXT[i], by: 'neighbour', onBehalf: false, photos: 0 };
      return done({
        notices: state.notices.map((n) => (n.id === notice.id ? { ...n, sightings: [s, ...n.sightings] } : n)),
        reports: state.reports.map((r) => (r.noticeId === notice.id ? { ...r, updatedAt: now, updates: [update('sighting', 'A neighbour reported a sighting', `${s.description} (${s.location.label})`), ...r.updates] } : r)),
        notifications: [notify({ kind: 'sighting', title: `Possible sighting of ${state.reports.find((r) => r.noticeId === notice.id)?.petName ?? 'your pet'}`, body: `${SIGHTING_PLACE[i]}. ${SIGHTING_TEXT[i]}`, to: `/community/${notice.id}/sightings` }), ...state.notifications],
      });
    }

    default:
      return state;
  }
}
