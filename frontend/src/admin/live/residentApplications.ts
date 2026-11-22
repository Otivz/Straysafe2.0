/** The reviewer's calls for self-registered residents (backend/app/routes/resident_applications.py). */
import { httpGet, httpPost } from '../../live/http';

export type ApplicationStatus = 'PENDING_EMAIL_VERIFICATION' | 'PENDING_RESIDENCY_VERIFICATION' | 'ACTIVE' | 'REJECTED';
export const APPLICATION_STATUSES: ApplicationStatus[] = ['PENDING_RESIDENCY_VERIFICATION', 'PENDING_EMAIL_VERIFICATION', 'ACTIVE', 'REJECTED'];
export type MatchResult = 'Match Found' | 'Possible Match' | 'No Match Found';

export interface Application {
  application_id: number; user_id: number; full_name: string; email: string; contact_number: string | null;
  block_number: string; lot_number: string; status: ApplicationStatus; email_verified: boolean; email_verified_at: string | null;
  registered_at: string | null; reviewed_by: string | null; reviewed_at: string | null; rejection_reason: string | null;
  resubmit_count: number; resubmitted_at: string | null; match?: MatchResult;
}

export interface MatchCandidate {
  record_id: number; full_name: string; block_number: string; lot_number: string; email_matches: boolean; registration_status: string; why: string;
}

export interface ApplicationDetail extends Omit<Application, 'match'> { match: { result: MatchResult; candidates: MatchCandidate[] } }

export const residentApplicationsApi = {
  pendingCount: () => httpGet<{ pending: number }>('/resident-applications/pending-count'),
  list: (p: { status: ApplicationStatus | 'all'; q: string; page: number }) =>
    httpGet<{ total: number; page: number; page_size: number; counts: Record<ApplicationStatus, number>; applications: Application[] }>(
      '/resident-applications', { status: p.status, q: p.q, page: p.page, page_size: 20 }),
  detail: (id: number) => httpGet<ApplicationDetail>(`/resident-applications/${id}`),
  approve: (id: number) => httpPost<Application & { email_sent: boolean }>(`/resident-applications/${id}/approve`),
  reject: (id: number, reason: string) => httpPost<Application & { email_sent: boolean }>(`/resident-applications/${id}/reject`, { reason }),
};
