/**
 * The Resident UI's calls to the existing backend, and the shapes it answers with. Nothing here invents an endpoint: every path
 * is one the backend already serves (reports, lost-pet-alerts, announcements, ownership-claims, pets, users, notifications,
 * chat, landmarks, cases/categories). Types only describe what the screens read.
 */
import { httpGet, httpGetPage, httpPost, httpPut, httpPatch, httpUpload } from '../../live/http';
import type { ApiAnnouncement, ApiNotification, ApiNotificationPrefs, ApiPet, ApiUser } from '../../admin/live/api';

export type { ApiAnnouncement, ApiNotification, ApiNotificationPrefs, ApiPet, ApiUser };

/** A pet the office linked to this account, waiting for the resident's answer (GET /pet-ownership/mine). */
export interface ApiOwnershipRequest {
  confirmation_id: number; pet_id: number; pet_name: string | null; pet_type: string | null; breed: string | null; photo_url: string | null;
  proposed_by_name: string | null; created_at: string | null;
}

export interface ApiResidentCategories {
  subdivision_id: number | null;
  subdivision: { name: string | null; city: string | null; office: { address: string; phone: string; email: string; hours: string } };
  publication: { lost_pet: 'immediate' | 'review'; found_animal: 'immediate' | 'review' };
  categories: { id: string; category_id: number | null; label: string; enabled: boolean }[];
  /** Every stored category and the kind of concern it is read as (older reports keep an older category such as "Aggressive"). */
  stored_categories?: { category_id: number; family: string }[];
}
export interface ApiCoverage { center_label: string; center_latitude: number; center_longitude: number; radius_meters: number; boundary_polygon: { lat: number; lng: number }[]; is_active: boolean }
export interface ApiLandmark { landmark_id: number; name: string; latitude: number; longitude: number; is_holding_facility?: boolean | null }

export interface ApiReportMedia { media_id: number; file_url: string; media_type: string; is_evidence?: boolean | null; uploaded_at: string }
export interface ApiReportHistory { history_id: number; remarks: string | null; created_at: string; updater_name: string | null }
/** `GET /reports/` and `GET /reports/{id}` as the person who filed the report gets them: only the parts the screens read. */
export interface ApiResidentReport {
  report_id: number;
  created_at: string;
  case_status: 'reported' | 'under_review' | 'in_progress' | 'closed' | null;
  case_outcome: { label: string; outcome: 'resolved' | 'unresolved' | 'invalid' | null; closed_at: string | null } | null;
  category_id: number | null;
  animal_type: string | null;
  animal_breed: string | null;
  animal_color: string | null;
  description: string | null;
  condition: string | null;
  latitude: number | null;
  longitude: number | null;
  landmark: string | null;
  media: ApiReportMedia[];
  history: ApiReportHistory[];
  pet_id: number | null;
  pet_name: string | null;
  user_id: number | null;
}
export interface ApiChatMessage { message_id: number; sender_id: number; sender_name: string | null; sender_role: string | null; message_text: string; media_url: string | null; is_system: boolean; sent_at: string | null }

export interface ApiSighting {
  sighting_id: number; latitude: number | null; longitude: number | null; coordinates_generalized: boolean; location_label: string | null; location_source: string;
  seen_at: string; submitted_at: string; description: string | null; photo_url: string | null; status: string; reported_by: string; is_mine: boolean;
  /** seen: "I saw this pet". secured: "I may have this pet safely with me" (a possible-recovery lead: only the owner and its writer get it). */
  sighting_type?: 'seen' | 'secured';
  /** Where a secured pet is being kept: only the owner, the Leader and the person who wrote it. */
  care_note?: string | null;
  on_behalf?: boolean;
  reviewed_by?: string | null; reviewed_at?: string | null; review_note?: string | null;
}
/** One conversation about a possible-recovery report, as THIS resident may see it (GET /lost-pet-alerts/coordinations/{id}). */
export interface ApiCoordination {
  coordination_id: number; alert_id: number; report_id: number; sighting_id: number; you_are: 'owner' | 'finder' | 'leader'; status: 'open' | 'resolved';
  mode: 'none' | 'direct' | 'leader'; owner_consent: boolean; finder_consent: boolean; direct_open: boolean; can_message: boolean;
  mediation_requested: boolean; mediation_requested_by_you: boolean; unread_messages: number; resolution_note: string | null;
  other_party?: { first_name: string | null };
}
export interface ApiCoordinationMessage { message_id: number; text: string; sent_at: string | null; is_mine: boolean; is_read: boolean }
export interface ApiResidentAlert {
  alert_id: number; report_id: number; status: 'requested' | 'active' | 'closed'; alert_type: 'lost_pet' | 'found_animal';
  pet: { name: string; photo_url: string | null; species: string | null; breed: string | null; color: string | null; distinguishing_marks: string | null; description: string | null };
  last_seen: { at: string | null; location: string | null; latitude: number | null; longitude: number | null; generalized: boolean };
  owner_note: string | null; leader_message: string | null; requested_at: string | null; activated_at: string | null; closed_at: string | null;
  close_outcome: string | null; close_reason: string | null; sighting_count: number; accepting_sightings: boolean; is_owner: boolean; requested_by: number | null;
  owner_first_name?: string | null; recovered_at?: string | null; secured_count?: number | null; viewer_role?: 'owner' | 'leader' | 'finder' | 'neighbor';
  sightings?: ApiSighting[]; coordinations?: ApiCoordination[];
  latest_sighting?: ApiSighting | null;
}
/** The Community a page at a time (GET /lost-pet-alerts/active and /community/summary): the total says how many more there are. */
export interface ApiCommunityPage { total: number; limit: number; offset: number; results: ApiResidentAlert[] }
export interface ApiCommunitySummary { lost: ApiCommunityPage; found: ApiCommunityPage; preview: number }
export interface CommunityQuery { alert_type: 'lost_pet' | 'found_animal'; q?: string; species?: 'dog' | 'cat' | 'other'; limit?: number; offset?: number }
export interface ApiResidentClaim {
  claim_id: number; report_id: number; alert_id: number | null; status: 'submitted' | 'under_review' | 'needs_info' | 'accepted' | 'rejected' | 'withdrawn';
  statement: string; evidence: string[]; submitted_at: string | null; reviewed_at: string | null; review_note: string | null; claimed_pet_id: number | null;
}

const PAGE = 100;
const MAX_REPORTS = 500;       // a safety stop: a resident's own reports are read in pages until the server says there is no more

export const residentApi = {
  categories: () => httpGet<ApiResidentCategories>('/cases/categories'),
  coverage: () => httpGet<ApiCoverage>('/reports/coverage-area'),
  landmarks: (subdivisionId: number) => httpGet<ApiLandmark[]>('/landmarks', { subdivision_id: subdivisionId }),

  user: (id: number) => httpGet<ApiUser>(`/users/${id}`),
  updateUser: (id: number, patch: Record<string, unknown>) => httpPut<ApiUser>(`/users/${id}`, patch),

  /** Every report the resident filed, newest first (read in pages). `truncated` says the safety stop was reached. */
  async myReports(): Promise<{ items: ApiResidentReport[]; truncated: boolean }> {
    const items: ApiResidentReport[] = [];
    for (let offset = 0; offset < MAX_REPORTS; offset += PAGE) {
      const page = await httpGetPage<ApiResidentReport[]>('/reports/', { mine: true, limit: PAGE, offset });
      items.push(...page.items);
      if (!page.hasMore || page.items.length === 0) return { items, truncated: false };
    }
    return { items, truncated: true };
  },
  report: (id: number) => httpGet<ApiResidentReport>(`/reports/${id}`),
  createReport: (body: Record<string, unknown>) => httpPost<ApiResidentReport>('/reports/', body),
  uploadReportMedia: (id: number, file: File) => { const form = new FormData(); form.append('file', file); form.append('is_evidence', 'false'); return httpUpload(`/reports/${id}/media`, form); },
  chat: (id: number) => httpGet<ApiChatMessage[]>(`/chat/reports/${id}/messages`),
  sendChat: (id: number, text: string, mediaUrl?: string | null) => httpPost(`/chat/reports/${id}/messages`, { message_text: text, media_url: mediaUrl ?? null }),
  confirmReunited: (id: number, notes: string) => httpPost(`/reports/${id}/confirm-reunited`, { notes }),

  alertsActive: () => httpGet<{ results: ApiResidentAlert[] }>('/lost-pet-alerts/active'),
  /** The Community overview: a few missing pets and a few found animals, with how many there are in all. */
  communitySummary: () => httpGet<ApiCommunitySummary>('/lost-pet-alerts/community/summary'),
  /** One page of the Community directory, searched and filtered on the server. */
  communityPage: (q: CommunityQuery) => httpGet<ApiCommunityPage>('/lost-pet-alerts/active', { alert_type: q.alert_type, q: q.q || undefined, species: q.species, limit: q.limit ?? 20, offset: q.offset ?? 0 }),
  coordinationConsent: (id: number, allow: boolean) => httpPost<ApiCoordination>(`/lost-pet-alerts/coordinations/${id}/consent`, { allow }),
  coordinationMediation: (id: number) => httpPost<ApiCoordination>(`/lost-pet-alerts/coordinations/${id}/mediation`),
  coordinationMessages: (id: number) => httpGet<{ results: ApiCoordinationMessage[]; coordination: ApiCoordination }>(`/lost-pet-alerts/coordinations/${id}/messages`),
  sendCoordinationMessage: (id: number, text: string, clientRequestId?: string) => httpPost<ApiCoordinationMessage>(`/lost-pet-alerts/coordinations/${id}/messages`, { text, ...(clientRequestId ? { client_request_id: clientRequestId } : {}) }),
  alertsMine: () => httpGet<{ results: ApiResidentAlert[] }>('/lost-pet-alerts/mine'),
  alert: (id: number) => httpGet<ApiResidentAlert>(`/lost-pet-alerts/${id}`),
  requestAlert: (reportId: number, body: Record<string, unknown>) => httpPost<ApiResidentAlert>(`/lost-pet-alerts/reports/${reportId}/request`, body),
  submitSighting: (alertId: number, form: FormData) => httpUpload(`/lost-pet-alerts/${alertId}/sightings`, form),
  announcements: (userId: number) => httpGet<ApiAnnouncement[]>(`/announcements/feed/resident/${userId}`, { community_animal_only: true }),

  claims: () => httpGet<ApiResidentClaim[]>('/ownership-claims/mine'),
  submitClaim: (reportId: number, body: Record<string, unknown>) => httpPost(`/reports/${reportId}/ownership-claims`, body),
  claimInfo: (claimId: number, text: string) => httpPost(`/ownership-claims/${claimId}/info`, { text }),

  pets: () => httpGet<ApiPet[]>('/pets/'),
  createPet: (body: Record<string, unknown>) => httpPost<ApiPet>('/pets/', body),
  updatePet: (id: number, body: Record<string, unknown>) => httpPut<ApiPet>(`/pets/${id}`, body),
  uploadPetPhoto: (id: number, file: File) => { const form = new FormData(); form.append('file', file); return httpUpload<{ photo_url: string }>(`/pets/${id}/photo`, form); },
  ownershipRequests: () => httpGet<ApiOwnershipRequest[]>('/pet-ownership/mine'),
  answerOwnership: (id: number, accept: boolean, reason?: string) => httpPost(`/pet-ownership/${id}/${accept ? 'accept' : 'reject'}`, accept ? {} : { reason: reason ?? null }),

  notifications: () => httpGet<ApiNotification[]>('/notifications/me'),
  markRead: (id: number) => httpPatch(`/notifications/${id}/read`, { is_read: true }),
  markAllRead: (userId: number) => httpPost(`/notifications/mark-all-read/${userId}`),
  preferences: () => httpGet<ApiNotificationPrefs>('/notifications/preferences'),
  savePreferences: (body: Partial<ApiNotificationPrefs>) => httpPut<ApiNotificationPrefs>('/notifications/preferences', body),
};
