/**
 * The Admin UI's calls to the existing backend, and the shapes the backend answers with. Nothing here invents an endpoint:
 * every path below is one the backend already serves (routes/cases.py, reports.py, warnings.py, users.py, pets.py,
 * lost_pet_alerts.py, announcements.py, notifications.py, analytics.py). Types only describe what the screens read.
 *
 * Type-only imports, so the pure adapters (adapters.ts) that share these types can run under `node --test`.
 */
import { httpDelete, httpGet, httpPatch, httpPost, httpPut, httpUpload } from '../../live/http';
import type {
  CategoryId, ClaimStatus, ComplianceResult, ContactMethod, DispositionId, EvidenceSufficiency, FollowUpKind, IdentityStatus,
  IncidentVerification, OutcomeGroup, OwnershipStatus, Priority, ReferralStatus, UrgencyLevel,
} from '../data/types';
import type { CaseStatus } from '../data/types';

// ------------------------------------------------------------------------------------------------------- the case
export interface ApiClosure {
  disposition: DispositionId | null;
  outcome: OutcomeGroup | null;
  label: string | null;
  reason: string | null;
  closed_at: string | null;
  closed_by: number | null;
  derived_from_legacy_status: boolean;
}

export interface ApiCaseSummary {
  report_id: number;
  reported_at: string;
  updated_at: string;
  last_event: { history_id: number; at: string; text: string; by_name: string | null } | null;
  subdivision_id: number;
  case_status: CaseStatus;
  priority: Priority;
  is_sensitive: boolean;
  category: { category_id: number; name: string | null; family: CategoryId; label: string };
  animal: { type: string | null; breed: string | null; color: string | null; size: string | null; count: number | null; description: string | null; condition: string | null };
  location: { landmark: string | null; latitude: number | null; longitude: number | null };
  reporter: { user_id: number | null; name: string | null };
  assigned_leader_id: number | null;
  assigned_leader_name: string | null;
  assessment: { incident: IncidentVerification; evidence_sufficiency: EvidenceSufficiency; urgency: UrgencyLevel; saved_at: string | null };
  identity_status: IdentityStatus;
  /** False while the status only comes from the reporter naming a registered pet (no Leader has decided the identity yet). */
  identity_decided?: boolean;
  ownership_status: OwnershipStatus;
  /** The resident confirmed as the owner, when there is one (so "confirmed owner in" works from the list alone). */
  ownership_owner_id: number | null;
  /** The registered pet the case is linked to (so a pet's related cases work from the list alone). */
  pet_id: number | null;
  closure: ApiClosure | null;
  reopened_count: number;
  merged_into_report_id: number | null;
  photo_count: number;
  thumbnail_url: string | null;
}

export interface ApiSummaryPage { total: number; limit: number; offset: number; has_more: boolean; items: ApiCaseSummary[] }

export interface ApiReferralUpdate { update_id: number; update_type: string; source: string; update_date: string | null; note: string | null; evidence_url: string | null; status_after: ReferralStatus | null; recorded_by: number | null; recorded_by_name: string | null; recorded_at: string | null }
export interface ApiReferral {
  referral_id: number; report_id: number; org_type: string; org_name: string | null; status: ReferralStatus; is_open: boolean; is_urgent: boolean;
  reason: string | null; reference_no: string | null; contact_method: string | null; contact_person: string | null; contact_detail: string | null;
  referred_at: string | null; referred_by: number | null; referred_by_name: string | null; external_outcome: string | null; remaining_follow_up: string | null;
  follow_up_at: string | null; updates: ApiReferralUpdate[];
}
export interface ApiFollowUp { followup_id: number; kind: FollowUpKind; title: string; notes: string | null; due_at: string | null; status: 'pending' | 'done' | 'cancelled'; referral_id: number | null; created_by: number | null; created_by_name: string | null; created_at: string | null; completed_at: string | null; completion_note: string | null; cancel_reason: string | null }
export interface ApiContact { log_id: number; method: ContactMethod; with_whom: string; summary: string; outcome: 'cooperative' | 'denied_ownership' | 'no_response' | 'other'; contact_at: string | null; logged_by: number | null; logged_by_name: string | null }
export interface ApiObservation { observation_id: number; warning_id: number; result: ComplianceResult | null; observed_at: string | null; notes: string; concluded: 'compliant' | 'non_compliant' | null; by: number | null; by_name: string | null; recorded_at: string | null }
export interface ApiWarning {
  warning_id: number; warning_level: string; violation_type: string; status: string; owner_user_id: number; owner_name: string | null; description: string | null;
  issued_by: number | null; issued_by_name: string | null; policy_id: string | null; policy_title: string | null; policy_reference: string | null;
  observation_days: number | null; follow_up_at: string | null; fine_amount: number; created_at: string | null;
  observations: ApiObservation[]; concluded: 'compliant' | 'non_compliant' | null; concluded_at: string | null;
}
export interface ApiClaim { claim_id: number; report_id: number; status: ClaimStatus | 'withdrawn'; statement: string; evidence: string[]; submitted_at: string | null; reviewed_at: string | null; review_note: string | null; claimant_user_id: number | null; claimant_name: string | null; claimed_pet_id: number | null; evidence_urls: string[]; reviewed_by: number | null }
export interface ApiLink { link_id: number; report_id: number; link_type: string; note: string | null; linked_at: string | null }

/** One sighting or possible-recovery report as the Leader reads it (the writer by name, the exact pin, the private care note). */
export interface ApiLostSighting {
  sighting_id: number; sighting_type: 'seen' | 'secured'; latitude: number | null; longitude: number | null; location_label: string | null;
  seen_at: string; submitted_at: string; description: string | null; photo_url: string | null; status: 'unverified' | 'verified' | 'dismissed';
  review_note: string | null; care_note: string | null; reviewed_by: string | null; reviewed_at: string | null; reported_by: string;
}
export interface ApiLostParty { user_id: number; name: string; first_name: string; phone?: string | null }
export interface ApiLostCoordination {
  coordination_id: number; alert_id: number; report_id: number; sighting_id: number; status: 'open' | 'resolved'; mode: 'none' | 'direct' | 'leader';
  owner_consent: boolean; finder_consent: boolean; mediation_requested_at: string | null; mediation_requested_by_role?: 'owner' | 'finder' | null;
  resolved_at: string | null; resolution_note: string | null; owner?: ApiLostParty | null; finder?: ApiLostParty | null;
}
/** `GET /cases/{id}` -> `lost_pet.alert` (the Leader's view of the notice, with every sighting, lead and conversation). */
export interface ApiLostAlert {
  alert_id: number; report_id: number; status: 'requested' | 'active' | 'closed';
  last_seen: { at: string | null; location: string | null; latitude: number | null; longitude: number | null };
  activated_at: string | null; closed_at: string | null; close_outcome: string | null; close_reason: string | null; residents_notified: number | null;
  recovered_at: string | null;
  recovery: { recovered_at: string; source?: 'owner_app' | 'phone' | 'in_person'; recorded_by?: number | null; confirmed_by?: number | null; recorded_at?: string | null; note?: string | null } | null;
  sightings?: ApiLostSighting[]; coordinations?: ApiLostCoordination[];
}

export interface ApiCaseDetail {
  report_id: number;
  case_status: CaseStatus;
  priority: Priority;
  is_sensitive: boolean;
  category: { category_id: number; name: string | null; family: CategoryId; label: string };
  animal: ApiCaseSummary['animal'];
  location: ApiCaseSummary['location'];
  reported_at: string;
  subdivision_id: number;
  reporter: { user_id: number | null; name: string | null };
  assigned_leader_id: number | null;
  assigned_leader_name: string | null;
  assessment: { incident: IncidentVerification; incident_basis: string | null; evidence_sufficiency: EvidenceSufficiency; evidence_reviewed: string[]; urgency: UrgencyLevel; urgency_note: string | null; notes: string | null; saved_at: string | null; saved_by: number | null; saved_by_name: string | null };
  identity: { status: IdentityStatus; note: string | null; pet_id: number | null; decided?: boolean };
  /** The registered pet this report names, as this Leader may see it. */
  pet?: ApiCasePet | null;
  /** The Lost Pet picture. Absent or null for every other kind of case; `alert` is null for a missing-pet report that has no notice. */
  lost_pet?: { alert: ApiLostAlert | null } | null;
  ownership: { status: OwnershipStatus; owner_user_id: number | null; owner_name: string | null; evidence: string[]; note: string | null; decided_at: string | null };
  closure: ApiClosure | null;
  reopened_count: number;
  referrals: ApiReferral[];
  followups: ApiFollowUp[];
  contacts: ApiContact[];
  warnings: ApiWarning[];
  claims: ApiClaim[];
  links: ApiLink[];
  allowed_moves: CaseStatus[];
  can_reopen: boolean;
  warning_eligibility: { ok: boolean; reason: string | null };
}

/** What identifies a pet in the registry (the backend's `pet_facts`, also frozen into the report when it was filed). */
export interface ApiPetFacts {
  pet_id: number; reference_code: string | null; name: string; species: string | null; breed: string | null; sex: string | null; color: string | null;
  markings: string | null; age: string | null; photos: string[]; registered_at: string | null; registered_by_user_id: number | null; registered_by_name: string | null;
  declared_by_owner: boolean; owner_id: number | null; owner_name: string | null;
}
export interface ApiLastSeen { at: string | null; location: string | null; latitude: number | null; longitude: number | null }
/**
 * `GET /cases/{id}` -> `pet`: the registered pet a report names, for the Leader. Null for an older report with no pet link.
 * `available: false` says why the record is not shown: `removed` (it no longer exists) or `restricted` (another subdivision's pet).
 */
export interface ApiCasePet {
  pet_id: number;
  available: boolean;
  reason?: 'removed' | 'restricted';
  /** True until a Leader records the animal's identity: a report naming a pet is the reporter's say-so. */
  linked_by_reporter?: boolean;
  reporter_is_owner?: boolean;
  registry?: ApiPetFacts & { status: string | null; updated_at: string | null };
  registration?: { declared_by_owner: boolean; registered_at: string | null; registered_by_name: string | null; verified: boolean };
  owner?: { user_id?: number; name?: string; phone?: string | null; email?: string | null; address?: string | null; status?: string | null; emergency_contact_name?: string | null; emergency_contact_phone?: string | null } | null;
  as_reported: ApiPetFacts | null;
  snapshot_taken_at?: string | null;
  changed_since_report?: string[];
  last_seen: { as_filed: ApiLastSeen | null; notice: (ApiLastSeen & { status: string }) | null };
}

export interface ApiMedia { media_id: number; file_url: string; media_type: string; is_evidence?: boolean | null; uploaded_at: string }
export interface ApiHistory { history_id: number; remarks: string | null; created_at: string; updater_name: string | null }
/** `GET /reports/{id}` as staff get it: only the parts the case screen reads. */
export interface ApiReport { report_id: number; created_at: string; media: ApiMedia[]; history: ApiHistory[]; reporter_name: string | null }
export interface ApiNote { note_id: number; report_id: number; text: string; by: number | null; by_name: string | null; at: string }

export interface ApiQueue {
  followups: (ApiFollowUp & { report_id: number })[];
  claims: ApiClaim[];
  referrals: (Pick<ApiReferral, 'referral_id' | 'report_id' | 'org_type' | 'org_name' | 'status' | 'is_urgent' | 'reason' | 'referred_at' | 'follow_up_at' | 'contact_person' | 'contact_detail'> & { updated_at: string | null })[];
  warnings: { warning_id: number; report_id: number; owner_user_id: number; owner_name: string | null; policy_id: string | null; policy_title: string | null; policy_reference: string | null; observation_days: number | null; follow_up_at: string | null; status: string; created_at: string | null; description: string | null }[];
  /** An owner and a neighbour who asked the Leader to help them get in touch. */
  coordinations?: { coordination_id: number; report_id: number; alert_id: number; mode: string; status: string; requested_at: string | null; owner_name: string | null; finder_name: string | null }[];
}

// ----------------------------------------------------------------------------------------------------- directories
export interface ApiUser {
  user_id: number; name: string; email: string; phone: string | null; role_id: number; address: string | null; status: string | null; is_verified: boolean | null;
  created_at: string; last_login: string | null; position_name: string | null; subdivision_name: string | null; subdivision_id: number | null; role_name?: string | null;
}
export interface ApiPet {
  pet_id: number; pet_name: string; pet_type: string; breed: string | null; color_markings: string | null; primary_color: string | null; secondary_color: string | null;
  gender: string | null; estimated_age: string | null; birth_date: string | null; size_category: string | null; distinctive_markings: string | null;
  health_condition: string | null; notes: string | null; photo_url: string | null; photo_front_url: string | null; photo_left_url: string | null; photo_right_url: string | null;
  owner_id: number | null; created_at: string; is_vaccinated: boolean | null; vaccine_expiry: string | null; status: string | null;
  /** Who entered the record: the owner in their own account, or someone on the team for them. */
  registered_by_user_id?: number | null; registered_by_name?: string | null;
}

// ---------------------------------------------------------------------------------------------------------- notices
export interface ApiAlert {
  alert_id: number; report_id: number; status: 'requested' | 'active' | 'closed'; alert_type: 'lost_pet' | 'found_animal';
  pet: { name: string; photo_url: string | null; species: string | null; breed: string | null; color: string | null; description: string | null };
  last_seen: { at: string | null; location: string | null };
  owner_note: string | null; leader_message: string | null; requested_at: string | null; activated_at: string | null; closed_at: string | null;
  close_outcome: string | null; close_reason: string | null; requested_by: number | null; sighting_count: number;
}
export interface ApiAnnouncement {
  announcement_id: number; title: string; category: string; visibility: string; content: string; pinned: boolean; expiration: string | null;
  location: string | null; posted_by: string; posted_on: string; status: string; media: { media_id: number; file_url: string; media_type: string; caption: string | null }[];
}
export interface ApiNotification { notification_id: number; type: string | null; title: string; message: string | null; related_id: number | null; is_read: boolean; created_at: string }
export interface ApiNotificationPrefs {
  email_reports: boolean; email_rescues: boolean; email_pet_matches: boolean; email_claims: boolean; email_reminders: boolean;
  push_enabled: boolean; push_reports: boolean; push_rescues: boolean; push_pet_matches: boolean; push_claims: boolean; push_adoptions: boolean; push_messages: boolean; push_show_preview: boolean;
}

// ---------------------------------------------------------------------------------------------------------- settings
export interface ApiPolicy { id: string; title: string; reference: string; summary: string; applies_to: CategoryId[]; observation_days: number | null; status: 'confirmed' | 'pending_confirmation' }
export interface ApiCaseSettings {
  categories: Record<CategoryId, boolean>;
  policies: ApiPolicy[];
  followups: { default_days: number; min_days: number; max_days: number };
  publication: { lost_pet: 'immediate' | 'review'; found_animal: 'immediate' | 'review' };
  office: { address: string; phone: string; email: string; hours: string };
}
export interface ApiCategories { subdivision_id: number | null; subdivision: { name: string | null; city: string | null; office: ApiCaseSettings['office'] }; categories: { id: CategoryId; enabled: boolean }[] }

/** The reporting area the server holds (GET /reports/coverage-area): where the maps open, the outline they draw and the radius reports must fall in. */
export interface ApiCoverage { center_label: string; center_latitude: number; center_longitude: number; radius_meters: number; boundary_polygon: { lat: number; lng: number }[]; is_active: boolean }

export interface ApiAnalytics {
  case_lifecycle: {
    received: number; closed: number; resolved_share: number | null; median_days_to_close: number | null;
    timeline: { start_date: string; received: number; closed: number }[];
    categories: { id: CategoryId; label: string; count: number }[];
    outcomes: { group: OutcomeGroup; count: number; items: { id: DispositionId; label: string; count: number }[] }[];
    referrals: { total: number; by_org: { name: string; count: number }[]; by_status: { status: ReferralStatus; count: number }[] };
  };
}

// ------------------------------------------------------------------------------------------------------------ calls
const PAGE = 200;
const MAX_CASES = 2000;       // a safety stop, not a business rule: the list is read in pages of 200 until the server says there is no more

export const adminApi = {
  /** Every case summary the Leader may see, newest first (read in pages). `truncated` says the safety stop was reached. */
  async caseSummaries(): Promise<{ items: ApiCaseSummary[]; total: number; truncated: boolean }> {
    const items: ApiCaseSummary[] = [];
    let total = 0;
    for (let offset = 0; offset < MAX_CASES; offset += PAGE) {
      const page = await httpGet<ApiSummaryPage>('/cases/summaries', { limit: PAGE, offset });
      items.push(...page.items);
      total = page.total;
      if (!page.has_more) return { items, total, truncated: false };
    }
    return { items, total, truncated: true };
  },
  workQueue: () => httpGet<ApiQueue>('/cases/work-queue'),
  coverage: () => httpGet<ApiCoverage>('/reports/coverage-area'),
  caseDetail: (id: number) => httpGet<ApiCaseDetail>(`/cases/${id}`),
  report: (id: number) => httpGet<ApiReport>(`/reports/${id}`),
  notes: (id: number) => httpGet<{ notes: ApiNote[] }>(`/cases/${id}/notes`),
  addNote: (id: number, text: string) => httpPost<ApiNote>(`/cases/${id}/notes`, { text }),
  move: (id: number, to: CaseStatus, note?: string) => httpPost(`/cases/${id}/status`, { to, note: note || null }),
  priority: (id: number, priority: Priority, reason: string) => httpPut(`/cases/${id}/priority`, { priority, reason }),
  assessment: (id: number, body: Record<string, unknown>) => httpPut(`/cases/${id}/assessment`, body),
  close: (id: number, body: Record<string, unknown>) => httpPost(`/cases/${id}/close`, body),
  reopen: (id: number, reason: string) => httpPost(`/cases/${id}/reopen`, { reason }),
  createReferral: (id: number, body: Record<string, unknown>) => httpPost(`/cases/${id}/referrals`, body),
  updateReferral: (id: number, referralId: number, body: Record<string, unknown>) => httpPost(`/cases/${id}/referrals/${referralId}/updates`, body),
  createFollowUp: (id: number, body: Record<string, unknown>) => httpPost(`/cases/${id}/followups`, body),
  completeFollowUp: (id: number, followUpId: number, note?: string) => httpPost(`/cases/${id}/followups/${followUpId}/complete`, { note: note || null }),
  cancelFollowUp: (id: number, followUpId: number, reason?: string) => httpPost(`/cases/${id}/followups/${followUpId}/cancel`, { reason: reason || null }),
  addContact: (id: number, body: Record<string, unknown>) => httpPost(`/cases/${id}/contacts`, body),
  link: (id: number, body: Record<string, unknown>) => httpPost(`/cases/${id}/links`, body),
  unlink: (id: number, linkId: number, reason: string) => httpPost(`/cases/${id}/links/${linkId}/unlink`, { reason }),
  reviewClaim: (id: number, claimId: number, decision: string, note: string) => httpPost(`/cases/${id}/claims/${claimId}/review`, { decision, note: note || null }),
  recordCompliance: (id: number, warningId: number, body: Record<string, unknown>) => httpPost(`/cases/${id}/warnings/${warningId}/observations`, body),
  warningSuggestion: (params: { violation_type: string; report_id: number; owner_id: number; policy_id: string }) => httpGet<{ suggested_tier: string }>('/warnings/suggestion', params),
  issueWarning: (body: Record<string, unknown>) => httpPost('/warnings/', body),

  users: () => httpGet<ApiUser[]>('/users/'),
  user: (id: number) => httpGet<ApiUser>(`/users/${id}`),
  updateUser: (id: number, patch: Record<string, unknown>) => httpPut<ApiUser>(`/users/${id}`, patch),
  pets: (subdivisionId: number) => httpGet<ApiPet[]>(`/pets/subdivision/${subdivisionId}`),
  /** Ask a resident to confirm that a pet record is theirs. Nothing moves until they say yes; the Leader must say how they checked (at least 10 characters). */
  assignPetOwner: (petId: number, ownerId: number, evidenceNote: string) => httpPost<ApiPet>(`/pets/${petId}/assign-owner?owner_id=${ownerId}`, { evidence_note: evidenceNote }),

  alerts: () => httpGet<{ total: number; results: ApiAlert[] }>('/lost-pet-alerts/all', { limit: PAGE }),
  requestAlert: (reportId: number, body: Record<string, unknown>) => httpPost<ApiAlert>(`/lost-pet-alerts/reports/${reportId}/request`, body),
  activateAlert: (alertId: number, body: Record<string, unknown>) => httpPost<ApiAlert>(`/lost-pet-alerts/${alertId}/activate`, body),
  updateAlert: (alertId: number, body: Record<string, unknown>) => httpPatch<ApiAlert>(`/lost-pet-alerts/${alertId}`, body),
  closeAlert: (alertId: number, outcome: string, reason: string) => httpPost<ApiAlert>(`/lost-pet-alerts/${alertId}/close`, { outcome, reason }),
  /** The Leader records that the OWNER confirmed (by phone or in person) that the pet is home: the one recovery operation, never the Leader's own say-so. */
  recordRecovery: (alertId: number, body: { source: 'phone' | 'in_person'; confirmed_at: string | null; note: string | null }) => httpPost(`/lost-pet-alerts/${alertId}/record-recovery`, body),
  reviewSighting: (sightingId: number, status: 'unverified' | 'verified' | 'dismissed', note: string | null) => httpPost(`/lost-pet-alerts/sightings/${sightingId}/review`, { status, note }),
  /** The Leader finished helping an owner and a neighbour get in touch. */
  resolveCoordination: (coordinationId: number, note: string | null) => httpPost(`/lost-pet-alerts/coordinations/${coordinationId}/resolve`, { note }),
  announcements: (subdivisionId: number) => httpGet<ApiAnnouncement[]>(`/announcements/subdivision/${subdivisionId}`),
  createAnnouncement: (body: Record<string, unknown>) => httpPost<ApiAnnouncement>('/announcements/', body),
  updateAnnouncement: (id: number, body: Record<string, unknown>) => httpPut<ApiAnnouncement>(`/announcements/${id}`, body),
  setAnnouncementStatus: (id: number, status: string) => httpPatch<ApiAnnouncement>(`/announcements/${id}/status`, { status }),
  deleteAnnouncement: (id: number) => httpDelete(`/announcements/${id}`),
  uploadAnnouncementMedia: (id: number, file: File) => { const form = new FormData(); form.append('file', file); return httpUpload(`/announcements/${id}/media`, form); },

  notifications: () => httpGet<ApiNotification[]>('/notifications/me'),
  markRead: (id: number) => httpPatch(`/notifications/${id}/read`, { is_read: true }),
  markAllRead: (userId: number) => httpPost(`/notifications/mark-all-read/${userId}`),
  preferences: () => httpGet<ApiNotificationPrefs>('/notifications/preferences'),
  savePreferences: (body: Partial<ApiNotificationPrefs>) => httpPut<ApiNotificationPrefs>('/notifications/preferences', body),

  settings: (subdivisionId: number) => httpGet<ApiCaseSettings>(`/cases/settings/${subdivisionId}`),
  saveSettings: (subdivisionId: number, body: ApiCaseSettings) => httpPut<ApiCaseSettings>(`/cases/settings/${subdivisionId}`, body),
  categories: () => httpGet<ApiCategories>('/cases/categories'),

  analytics: (startDate: string, endDate: string) => httpGet<ApiAnalytics>('/analytics/subdivision', { start_date: startDate, end_date: endDate, group_by: 'week' }),
};
