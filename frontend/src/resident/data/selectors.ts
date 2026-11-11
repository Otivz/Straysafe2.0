/** Pure, derived views over ResidentState. */
import { refId } from './reducer';
import type { Claim, Notice, NoticeType, Pet, Report, ReportUpdate, ResidentState } from './types';

export const reportById = (s: ResidentState, id: string | undefined) => s.reports.find((r) => r.id === id);
export const noticeById = (s: ResidentState, id: string | undefined) => s.notices.find((n) => n.id === id);
export const claimById = (s: ResidentState, id: string | undefined) => s.claims.find((c) => c.id === id);
export const petById = (s: ResidentState, id: string | null | undefined) => s.pets.find((p) => p.id === id);
export const nextReportId = (s: ResidentState) => refId(s.nextRef);
/**
 * What happens to a lost-pet or found-animal report once it is sent: `published` (a notice is shown to neighbours at once) or
 * `pending_review` (an administrator decides first). A missing pet's notice is always published at once (nobody approves it, whatever an older
 * setting says); a found animal's follows the subdivision's own publication setting.
 */
export const visibilityAfterSending = (s: ResidentState, kind: 'lost' | 'found'): 'published' | 'pending_review' => {
  if (kind === 'lost') return 'published';
  return (s.publication?.found_animal ?? 'review') === 'immediate' ? 'published' : 'pending_review';
};
export const unreadCount = (s: ResidentState) => s.notifications.filter((n) => !n.read).length;

/**
 * Registration-first Lost Pet reports: a lost report is only for a registered pet of this resident (the server enforces it).
 * The pets that can be reported missing are the resident's registered pets whose record is active; a deceased pet cannot.
 */
export const reportablePets = (s: ResidentState): Pet[] => s.pets.filter((p) => p.status !== 'Deceased');
/** The pet's lost report that is still open: the one to open instead of filing another. */
export const activeLostReport = (s: ResidentState, petId: string): Report | undefined =>
  s.reports.find((r) => r.kind === 'lost' && r.petId === petId && r.status !== 'closed');
/** Every pet that can be reported missing, each with its open lost report when it already has one (such a pet cannot be reported again). */
export const lostPetChoices = (s: ResidentState): { pet: Pet; active?: Report }[] =>
  reportablePets(s).map((pet) => ({ pet, active: activeLostReport(s, pet.id) }));

export const isActive = (r: Report) => r.status !== 'closed';
export const myReports = (s: ResidentState, tab: 'active' | 'closed') =>
  s.reports.filter((r) => (tab === 'active' ? isActive(r) : !isActive(r))).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

/** The latest resident-visible update across all reports, newest first. */
export function recentUpdates(s: ResidentState, limit: number): { report: Report; update: ReportUpdate }[] {
  const all: { report: Report; update: ReportUpdate }[] = [];
  for (const r of s.reports) if (r.updates[0]) all.push({ report: r, update: r.updates[0] });
  return all.sort((a, b) => b.update.at.localeCompare(a.update.at)).slice(0, limit);
}

/** Community feed: only published, active notices. Private reports can never appear here. */
export function feed(s: ResidentState, type: NoticeType | 'all'): Notice[] {
  return s.notices.filter((n) => n.status === 'active' && (type === 'all' || n.type === type)).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** How a notice that is no longer active ended, in one or two words. Only the owner's confirmation says a missing pet is home. */
export function noticeEndedLabel(n: Notice): string {
  if (n.status === 'requested') return 'Not published';
  if (n.type === 'lost_pet') return n.closeOutcome === 'recovered' || n.recoveredAt ? 'Pet is home' : 'Closed';
  return n.closeOutcome === 'reunited' || n.closeOutcome === 'recovered' ? 'Recovered' : 'Closed';
}

export const latestAdvisory = (s: ResidentState) => feed(s, 'safety_advisory')[0];
export const latestSighting = (n: Notice) => [...n.sightings].filter((s) => s.review?.status !== 'dismissed').sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0] ?? n.latestSighting;
export const claimForNotice = (s: ResidentState, noticeId: string): Claim | undefined => s.claims.find((c) => c.noticeId === noticeId);

/** Draft steps differ by kind: general concerns have a separate evidence step; lost and found put the photo on the details form. */
export type FlowStep = 'details' | 'location' | 'evidence' | 'review';
export const flowSteps = (kind: 'incident' | 'lost' | 'found'): FlowStep[] => (kind === 'incident' ? ['details', 'location', 'evidence', 'review'] : ['details', 'location', 'review']);
