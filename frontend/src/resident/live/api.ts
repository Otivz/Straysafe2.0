/**
 * The Resident UI's calls to the existing backend, and the shapes it answers with. Nothing here invents an endpoint: every path
 * is one the backend already serves (reports, lost-pet-alerts, announcements, ownership-claims, pets, users, notifications,
 * chat, landmarks, cases/categories). Types only describe what the screens read.
 */
import { httpDownloadBlob, httpGet, httpGetBlob, httpGetPage, httpPost, httpPut, httpPatch, httpUpload } from '../../live/http';
import type { ApiAnnouncement, ApiGeneratedWarningLetter, ApiNotification, ApiNotificationPrefs, ApiPet, ApiUser } from '../../admin/live/api';

export type { ApiAnnouncement, ApiGeneratedWarningLetter, ApiNotification, ApiNotificationPrefs, ApiPet, ApiUser };

/** Sanitized incident record confirmed for a resident's own pet (`GET /pets/{id}/confirmed-incidents`). */
export interface ApiPetConfirmedIncident {
  report_id: number;
  reference_code: string;
  category: string;
  incident_date: string | null;
  reported_at?: string | null;
  verified_at?: string | null;
  closed_at?: string | null;
  status: 'reported' | 'under_review' | 'in_progress' | 'closed';
  status_label: string;
  location_area?: string | null;
  animal_summary?: string | null;
  condition?: string | null;
  verified_findings?: string[];
  summary: string;
  outcome_group?: 'resolved' | 'unresolved' | 'invalid' | null;
  outcome_label?: string | null;
  photos?: string[];
  warning_letters?: {
    letter_id: number;
    warning_reference: string;
    warning_level: string;
    issued_at: string | null;
  }[];
  milestones?: {
    label: string;
    at: string;
    detail?: string | null;
  }[];
  has_warning_letter: boolean;
}

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
  animal_colors?: string[] | null;
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
  seen_at?: string | null;
  suspected_owner_name?: string | null;
  suspected_owner_address?: string | null;
  suspected_owner_details?: string | null;
  complaint_verified?: boolean | null;
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
  /** The owner (and the Leader) only: how many residents the notice reached, and how many alerts the Leader sent about the case. */
  residents_notified?: number | null; leader_alerts?: { sent: number; last_at: string | null } | null;
}
/** The Community a page at a time (GET /lost-pet-alerts/active and /community/summary): the total says how many more there are. */
export interface ApiCommunityPage { total: number; limit: number; offset: number; results: ApiResidentAlert[] }
export interface ApiCommunitySummary { lost: ApiCommunityPage; found: ApiCommunityPage; preview: number }
export interface CommunityQuery { alert_type: 'lost_pet' | 'found_animal'; q?: string; species?: 'dog' | 'cat' | 'other'; limit?: number; offset?: number }
export interface ApiResidentClaim {
  claim_id: number; report_id: number; alert_id: number | null; status: 'submitted' | 'under_review' | 'needs_info' | 'accepted' | 'rejected' | 'withdrawn';
  statement: string; evidence: string[]; submitted_at: string | null; reviewed_at: string | null; review_note: string | null; claimed_pet_id: number | null;
}

/** A pet's QR tag (GET/POST /pets/{id}/tag). `link` is what the QR holds; `link_is_public` is false when the server has no public address set. */
export interface ApiPetTag {
  pet_id: number; has_tag: boolean; tag_id: number | null; token: string | null; link: string | null; created_at: string | null;
  last_scanned_at?: string | null; cooldown_minutes?: number; cooldown_remaining_seconds?: number;
  link_is_public: boolean; can_manage: boolean; can_disable: boolean;
}

/** One "tell the owner" message from someone who scanned the tag. `finder_phone` only for the owner, only when the finder chose to share it. */
export interface ApiPetTagFoundReport {
  scan_id: number; status: 'new' | 'seen_by_owner' | 'resolved' | 'returned' | 'dismissed'; created_at: string; location_label: string | null;
  latitude: number | null; longitude: number | null; note: string | null; photo_url: string | null;
  from_signed_in_resident: boolean; finder_phone: string | null; phone_shared: boolean;
}
export interface ApiPetTagScans { found_reports: ApiPetTagFoundReport[]; views: { count: number; last_at: string | null } }

const PAGE = 100;
const MAX_REPORTS = 500;       // a safety stop: a resident's own reports are read in pages until the server says there is no more

export interface ApiQrCollarHistoryEntry {
  status: string;
  label: string;
  at: string;
  by_id?: number | null;
  by_name?: string | null;
  note?: string | null;
}

export interface ApiQrCollarRequest {
  request_id: number;
  reference: string;
  pet_id: number;
  pet_name: string;
  pet_reference: string | null;
  pet_type: string | null;
  pet_breed: string | null;
  pet_color: string | null;
  pet_size: string | null;
  pet_photo_url: string | null;
  resident_id: number;
  resident_name: string;
  resident_unit: string | null;
  subdivision_id: number;
  status: 'pending' | 'accepted' | 'ready_for_pickup' | 'completed';
  status_label: string;
  notes: string | null;
  admin_notes: string | null;
  thread_id: number | null;
  requested_at: string;
  accepted_at: string | null;
  accepted_by_name: string | null;
  ready_at: string | null;
  ready_by_name: string | null;
  completed_at: string | null;
  completed_by_name: string | null;
  updated_at: string;
  history: ApiQrCollarHistoryEntry[];
}

export interface ApiCaseConversation {
  thread_id: number; kind: 'direct' | 'bridge' | 'general'; status: 'open' | 'closed'; can_reply: boolean; ended_reason: string | null;
  report_id: number | null; related_report_id: number | null;
  /** Resident-to-Administration messaging (2026-11-19): what it is about, its report and how it ended. */
  subject: string | null; report_ref: string | null; report_category: string | null; case_status: string | null;
  closed_at: string | null; close_trigger: 'case_closed' | 'link_removed' | 'manual' | null; started_by_resident: boolean; my_report_id: number | null; title: string; subtitle: string;
  unread: number; message_count: number; last_at: string | null; last_text: string; created_at: string;
  people: Array<{ user_id: number; role: string; label: string; name: string; me: boolean; report_id: number | null }>;
}
export interface ApiCaseConversationMessage {
  message_id: number; kind: 'message' | 'system'; sender_id: number | null; sender_name: string | null;
  sender_role: string; label: string; mine: boolean; body: string; at: string;
  delivery_status?: 'sent' | 'delivered' | 'read' | null;
}
/**
 * Possible Pet Owner Verification (2026-11-20): the Subdivision Administration asks whether a reported animal is this resident's registered pet.
 * Only the pet's owner receives it: the reported animal (no reporter details, no exact pin) and their own pet, and the Yes / No answer.
 */
export interface ApiOwnershipVerification {
  request_id: number; status: 'identified' | 'awaiting' | 'owner_confirmed' | 'owner_declined' | 'verified' | 'not_confirmed' | 'unable_to_contact'; status_label: string;
  owner_response: 'YES' | 'NO' | null; owner_response_at: string | null; final_label: string | null;
  question?: string; can_answer?: boolean;
  owner_note?: string | null; final_at?: string | null; requested_at?: string | null; staff_message?: string | null; thread_id?: number | null;
  history?: { label: string; at: string | null }[];
  reported_animal?: { reference: string | null; photos: string[]; animal_type: string | null; breed: string | null; color: string | null; size: string | null;
    landmark: string | null; subdivision: string | null; reported_at: string | null };
  your_pet?: { pet_id: number; pet_name: string; reference_code: string | null; photos: string[]; animal_type: string | null; breed: string | null; color: string | null;
    gender?: string | null; size?: string | null; distinctive_markings?: string | null } | null;
}
export interface ApiCaseConversationDetail extends ApiCaseConversation { messages: ApiCaseConversationMessage[]; verification?: ApiOwnershipVerification | null; report_photos?: string[] }

export const residentApi = {
  /** The possible owner's answer to an ownership verification. Recorded and shown to the administration; it never decides ownership by itself. */
  /** The verification page (linked from the request message and notification): the reported animal beside the owner's registered pet. */
  ownershipVerification: (requestId: number) => httpGet<ApiOwnershipVerification>(`/pet-match-confirmations/${requestId}/verification`),
  answerOwnershipVerification: (requestId: number, answer: 'YES' | 'NO', note: string) =>
    httpPost<{ message: string }>(`/pet-match-confirmations/${requestId}/respond`, { answer, note: note.trim() || null }),
  conversations: () => httpGet<ApiCaseConversation[]>('/case-messages'),
  conversation: (id: number) => httpGet<ApiCaseConversationDetail>(`/case-messages/${id}`),
  sendConversationMessage: (id: number, body: string, clientRequestId: string) => httpPost<ApiCaseConversationDetail>(`/case-messages/${id}/messages`, { body, client_request_id: clientRequestId }),
  readConversation: (id: number, throughMessageId: number) => httpPost<ApiCaseConversation>(`/case-messages/${id}/read`, { through_message_id: throughMessageId }),
  /** "Message Subdivision Administration" from the resident's own report: the open conversation about it (the same one when asked again). */
  openReportConversation: (reportId: number) => httpPost<ApiCaseConversationDetail>(`/case-messages/reports/${reportId}`, {}),
  /** A general conversation with the Subdivision Administration (no report), opened with its first message. */
  startGeneralConversation: (subject: string, body: string, clientRequestId: string) =>
    httpPost<ApiCaseConversationDetail>('/case-messages/general', { subject, body, client_request_id: clientRequestId }),
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
  /** A photo or video for "Add information" or a claim, uploaded to Cloudinary by the server (phone -> backend -> Cloudinary). */
  uploadChatMedia: (file: File) => { const form = new FormData(); form.append('file', file); return httpUpload<{ url: string; media_type: string }>('/chat/media', form); },
  chat: (id: number) => httpGet<ApiChatMessage[]>(`/chat/reports/${id}/messages`),
  sendChat: (id: number, text: string, mediaUrl?: string | null) => httpPost(`/chat/reports/${id}/messages`, { message_text: text, media_url: mediaUrl ?? null }),
  confirmReunited: (id: number, notes: string) => httpPost(`/reports/${id}/confirm-reunited`, { notes }),

  alertsActive: () => httpGet<{ results: ApiResidentAlert[] }>('/lost-pet-alerts/active'),
  /** The Community overview: a few missing pets and a few found animals, with how many there are in all. */
  communitySummary: async () => {
    try {
      return await httpGet<ApiCommunitySummary>('/lost-pet-alerts/community/summary');
    } catch (err: unknown) {
      if ((err as { status?: number })?.status === 404) {
        // Fallback for servers running earlier route schemas where /active is the endpoint
        const res = await httpGet<{ results?: ApiResidentAlert[]; total?: number } | ApiResidentAlert[]>('/lost-pet-alerts/active');
        const results = Array.isArray(res) ? res : (res?.results ?? []);
        const lost = results.filter((a) => a.alert_type === 'lost_pet');
        const found = results.filter((a) => a.alert_type === 'found_animal');
        return {
          lost: { total: lost.length, limit: lost.length, offset: 0, results: lost.slice(0, 4) },
          found: { total: found.length, limit: found.length, offset: 0, results: found.slice(0, 4) },
          preview: 4,
        };
      }
      throw err;
    }
  },
  /** One page of the Community directory, searched and filtered on the server. */
  communityPage: async (q: CommunityQuery) => {
    const res = await httpGet<ApiCommunityPage | { results?: ApiResidentAlert[]; total?: number }>('/lost-pet-alerts/active', {
      alert_type: q.alert_type,
      q: q.q || undefined,
      species: q.species,
      limit: q.limit ?? 20,
      offset: q.offset ?? 0,
    });
    const results = Array.isArray(res) ? res : (res?.results ?? []);
    const total = 'total' in res && typeof res.total === 'number' ? res.total : results.length;
    return {
      results,
      total,
      limit: 'limit' in res && typeof res.limit === 'number' ? res.limit : (q.limit ?? 20),
      offset: 'offset' in res && typeof res.offset === 'number' ? res.offset : (q.offset ?? 0),
    };
  },
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
  petConfirmedIncidents: (id: number) => httpGet<{ items: ApiPetConfirmedIncident[] }>(`/pets/${id}/confirmed-incidents`),
  createPet: (body: Record<string, unknown>) => httpPost<ApiPet>('/pets/', body),
  updatePet: (id: number, body: Record<string, unknown>) => httpPut<ApiPet>(`/pets/${id}`, body),
  uploadPetPhoto: (id: number, file: File) => { const form = new FormData(); form.append('file', file); return httpUpload<{ photo_url: string }>(`/pets/${id}/photo`, form); },
  petTag: (id: number) => httpGet<ApiPetTag>(`/pets/${id}/tag`),
  /** Create a tag, or replace the current one (the old tag stops working at once). */
  createPetTag: (id: number) => httpPost<ApiPetTag>(`/pets/${id}/tag`),
  disablePetTag: (id: number) => httpPost<ApiPetTag>(`/pets/${id}/tag/disable`),
  petTagQr: (id: number) => httpGetBlob(`/pets/${id}/tag/qr.png`),
  petTagScans: (id: number) => httpGet<ApiPetTagScans>(`/pets/${id}/tag/scans`),
  resolvePetTagScan: (id: number, scanId: number, body?: { recovered?: boolean; note?: string; answer?: 'not_yet' | 'not_real' }) =>
    httpPost<{ resolved: number; recovered: boolean; pet_status: string; report_id?: number | null; alert_id?: number | null }>(
      `/pets/${id}/tag/scans/${scanId}/resolve`,
      body,
    ),
  /** "Pet is back home": every open message resolved (and any shared phone number deleted). */
  resolveAllPetTagScans: (id: number, body?: { recovered?: boolean; note?: string; answer?: 'not_yet' | 'not_real' }) =>
    httpPost<{ resolved: number; recovered: boolean; pet_status: string; report_id?: number | null; alert_id?: number | null }>(
      `/pets/${id}/tag/scans/resolve`,
      body,
    ),
  qrCollarRequests: (petId?: number) =>
    httpGet<{ items: ApiQrCollarRequest[] }>('/qr-collar-requests/mine', petId ? { pet_id: petId } : undefined),
  requestQrCollar: (petId: number, notes?: string) =>
    httpPost<ApiQrCollarRequest>('/qr-collar-requests', { pet_id: petId, notes: notes?.trim() || null }),
  ownershipRequests: () => httpGet<ApiOwnershipRequest[]>('/pet-ownership/mine'),
  answerOwnership: (id: number, accept: boolean, reason?: string) => httpPost(`/pet-ownership/${id}/${accept ? 'accept' : 'reject'}`, accept ? {} : { reason: reason ?? null }),

  notifications: () => httpGet<ApiNotification[]>('/notifications/me'),
  markRead: (id: number) => httpPatch(`/notifications/${id}/read`, { is_read: true }),
  markAllRead: (userId: number) => httpPost(`/notifications/mark-all-read/${userId}`),
  preferences: () => httpGet<ApiNotificationPrefs>('/notifications/preferences'),
  savePreferences: (body: Partial<ApiNotificationPrefs>) => httpPut<ApiNotificationPrefs>('/notifications/preferences', body),

  myWarningLetters: () => httpGet<{ items: ApiGeneratedWarningLetter[] }>('/warning-letters/mine'),
  caseWarningLetters: (reportId: number) => httpGet<{ items: ApiGeneratedWarningLetter[] }>(`/warning-letters/case/${reportId}`),
  warningLetter: (letterId: number) => httpGet<ApiGeneratedWarningLetter>(`/warning-letters/${letterId}`),
  downloadWarningLetter: (letterId: number, ref: string, format: 'pdf' | 'docx') => httpDownloadBlob(`/warning-letters/${letterId}/download`, `${ref}.${format}`, { format }),
  acknowledgeWarning: (warningId: number) => httpPatch(`/warnings/${warningId}/acknowledge`, { confirmed: true }),
  respondToWarning: (warningId: number, response: string) => httpPost(`/warnings/${warningId}/respond`, { response }),
};
