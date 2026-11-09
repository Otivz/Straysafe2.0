/** Pure, derived views over ResidentState. */
import { refId } from './reducer';
import type { Claim, Notice, NoticeType, Report, ReportUpdate, ResidentState } from './types';

export const reportById = (s: ResidentState, id: string | undefined) => s.reports.find((r) => r.id === id);
export const noticeById = (s: ResidentState, id: string | undefined) => s.notices.find((n) => n.id === id);
export const claimById = (s: ResidentState, id: string | undefined) => s.claims.find((c) => c.id === id);
export const petById = (s: ResidentState, id: string | null | undefined) => s.pets.find((p) => p.id === id);
export const nextReportId = (s: ResidentState) => refId(s.nextRef);
export const unreadCount = (s: ResidentState) => s.notifications.filter((n) => !n.read).length;

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

export const latestAdvisory = (s: ResidentState) => feed(s, 'safety_advisory')[0];
export const latestSighting = (n: Notice) => [...n.sightings].sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
export const claimForNotice = (s: ResidentState, noticeId: string): Claim | undefined => s.claims.find((c) => c.noticeId === noticeId);

/** Draft steps differ by kind: general concerns have a separate evidence step; lost and found put the photo on the details form. */
export type FlowStep = 'details' | 'location' | 'evidence' | 'review';
export const flowSteps = (kind: 'incident' | 'lost' | 'found'): FlowStep[] => (kind === 'incident' ? ['details', 'location', 'evidence', 'review'] : ['details', 'location', 'review']);
