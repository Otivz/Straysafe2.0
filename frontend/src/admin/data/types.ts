/**
 * Domain model for the Subdivision Admin UI.
 *
 * Workflow:  REPORT → ASSESS → COORDINATE → MONITOR → DOCUMENT OUTCOME → CLOSE
 *
 * Only four global statuses exist. Warnings, referrals, ownership claims and follow-ups are case DETAILS, never
 * additional statuses. Incident verification, animal identity and ownership are three independent questions.
 * Everything here is JSON-serialisable (ISO strings, no Dates) so the preview store can live in sessionStorage.
 */

export type CaseStatus = 'reported' | 'under_review' | 'in_progress' | 'closed';
export type Priority = 'urgent' | 'high' | 'normal' | 'low';
export type CategoryId = 'lost_pet' | 'found_animal' | 'nuisance' | 'safety' | 'injured' | 'other';
export type AnimalType = 'dog' | 'cat' | 'bird' | 'small_mammal' | 'reptile' | 'livestock' | 'wildlife' | 'other';

/** Who, if anyone, is responsible for the animal. Never conflated with case status. */
export type OwnershipStatus = 'unknown' | 'claimed' | 'under_review' | 'confirmed' | 'disputed' | 'unconfirmed';
/** Which animal was involved. Defaults to unidentified; only an explicit admin decision changes it. */
export type IdentityStatus = 'unidentified' | 'possible_match' | 'identified';
export type MatchDecision = 'possible' | 'not_match' | 'confirmed';
/** Did the reported incident occur? */
export type IncidentVerification = 'not_reviewed' | 'verified' | 'partial' | 'unverified' | 'invalid';
export type EvidenceSufficiency = 'not_assessed' | 'sufficient' | 'needs_more';
export type UrgencyLevel = 'not_assessed' | 'immediate' | 'possible' | 'none';

export type DispositionId =
  | 'resolved_intervention'
  | 'owner_compliance'
  | 'pet_recovered'
  | 'handed_off'
  | 'no_further_sightings'
  | 'unresolved_other'
  | 'invalid_report'
  | 'duplicate_report';
/** A closed case does not necessarily mean the concern was resolved. */
export type OutcomeGroup = 'resolved' | 'unresolved' | 'invalid';

export type EventKind =
  | 'reported' | 'status' | 'priority' | 'assessment' | 'identity' | 'ownership' | 'claim' | 'note'
  | 'follow_up' | 'owner_contact' | 'warning' | 'compliance' | 'referral' | 'referral_update'
  | 'link' | 'unlink' | 'notice' | 'closure' | 'reopen' | 'info';

export interface TimelineEvent {
  id: string;
  at: string;
  actor: string;
  kind: EventKind;
  title: string;
  detail?: string;
}

export interface Evidence {
  id: string;
  kind: 'photo' | 'video' | 'sighting' | 'cctv' | 'document';
  label: string;
  capturedAt: string;
  source: 'reporter' | 'admin' | 'resident' | 'external';
  note?: string;
}

/** Private to authorized administration. Never copied into notices. */
export interface Reporter {
  residentId: string | null;
  name: string;
  unit: string;
  phone: string;
  email: string;
  preferredContact: 'phone' | 'email' | 'in_app';
}

export interface Note {
  id: string;
  at: string;
  by: string;
  text: string;
}

export type FollowUpKind = 'follow_up' | 'site_check' | 'reporter_update' | 'referral_check' | 'warning_end' | 'post_closure';
export interface FollowUp {
  id: string;
  kind: FollowUpKind;
  title: string;
  notes?: string;
  dueAt: string | null;
  status: 'pending' | 'done' | 'cancelled';
  createdAt: string;
  createdBy: string;
  completedAt?: string;
  completionNote?: string;
}

export type ContactMethod = 'in_person' | 'phone' | 'message' | 'letter';
export interface OwnerContact {
  id: string;
  at: string;
  by: string;
  method: ContactMethod;
  withWhom: string;
  summary: string;
  outcome: 'cooperative' | 'denied_ownership' | 'no_response' | 'other';
}

export type WarningDelivery = 'verbal' | 'written' | 'in_app';
export type ComplianceResult = 'compliant' | 'partial' | 'non_compliant' | 'unable_to_observe';
export interface ComplianceObservation {
  id: string;
  at: string;
  by: string;
  result: ComplianceResult;
  notes: string;
}
export interface Warning {
  id: string;
  ownerResidentId: string | null;
  ownerName: string;
  policyId: string;
  policyTitle: string;
  policyRef: string;
  details: string;
  delivery: WarningDelivery;
  issuedAt: string;
  issuedBy: string;
  /** null = the policy defines no observation period (none is assumed). */
  observationDays: number | null;
  observationStart: string | null;
  observationEnd: string | null;
  followUpAt: string | null;
  status: 'active' | 'concluded' | 'withdrawn';
  outcome?: 'compliant' | 'non_compliant' | 'other';
  outcomeNote?: string;
  concludedAt?: string;
  observations: ComplianceObservation[];
}

export type ReferralStatus = 'sent' | 'acknowledged' | 'in_progress' | 'completed' | 'declined' | 'no_response';
export interface ReferralNote {
  id: string;
  at: string;
  by: string;
  text: string;
  status?: ReferralStatus;
}
export interface Referral {
  id: string;
  orgId: string;
  orgName: string;
  reason: string;
  referredAt: string;
  contactPerson: string;
  contactChannel: string;
  status: ReferralStatus;
  notes: ReferralNote[];
  externalOutcome?: string;
  remainingFollowUp?: string;
  followUpAt?: string | null;
  createdBy: string;
  updatedAt: string;
}

export type ClaimStatus = 'submitted' | 'under_review' | 'needs_info' | 'accepted' | 'rejected';
export interface OwnershipClaim {
  id: string;
  claimantResidentId: string | null;
  claimantName: string;
  claimedPetId?: string | null;
  submittedAt: string;
  statement: string;
  evidence: string[];
  status: ClaimStatus;
  reviewNote?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface Assessment {
  incident: IncidentVerification;
  incidentBasis: string;
  evidenceSufficiency: EvidenceSufficiency;
  evidenceReviewed: string[];
  urgency: UrgencyLevel;
  urgencyNote: string;
  notes: string;
  savedAt: string | null;
  savedBy: string | null;
}

export interface IdentityReview {
  status: IdentityStatus;
  matches: Record<string, MatchDecision>;
  note: string;
}

export interface OwnershipReview {
  status: OwnershipStatus;
  ownerResidentId: string | null;
  /** Evidence kinds relied on (see OWNERSHIP_EVIDENCE). Pet registration alone is never sufficient. */
  evidence: string[];
  note: string;
}

export interface Closure {
  disposition: DispositionId;
  outcome: OutcomeGroup;
  reason: string;
  followUpCheck: string | null;
  closedAt: string;
  closedBy: string;
}

export interface Case {
  id: string;
  category: CategoryId;
  status: CaseStatus;
  priority: Priority;
  title: string;
  description: string;
  animal: { type: AnimalType; description: string; count: number };
  /** Words for the place, plus the pin when the reporter placed one. Coordinates are SAMPLE values in the preview. */
  location: { area: string; detail: string; lat?: number; lng?: number };
  observedAt: string;
  reportedAt: string;
  updatedAt: string;
  /** Private complaint about a neighbour: never published automatically. */
  sensitive: boolean;
  noPhotoReason?: string;
  reporter: Reporter;
  assignedTo: string;
  evidence: Evidence[];
  assessment: Assessment;
  identity: IdentityReview;
  ownership: OwnershipReview;
  claims: OwnershipClaim[];
  followUps: FollowUp[];
  ownerContacts: OwnerContact[];
  warnings: Warning[];
  referrals: Referral[];
  relatedCaseIds: string[];
  notes: Note[];
  timeline: TimelineEvent[];
  closure: Closure | null;
}

export interface Resident {
  id: string;
  name: string;
  unit: string;
  street: string;
  phone: string;
  email: string;
  status: 'active' | 'pending' | 'suspended';
  joinedAt: string;
  lastActiveAt: string;
  petIds: string[];
}

export interface Pet {
  id: string;
  name: string;
  type: AnimalType;
  breed: string;
  color: string;
  sex: 'male' | 'female' | 'unknown';
  ageText: string;
  size: 'small' | 'medium' | 'large';
  markings: string[];
  description: string;
  photos: number;
  ownerId: string;
  registeredAt: string;
  vaccination: 'up_to_date' | 'overdue' | 'unknown';
  microchipped: boolean;
}

export type NoticeType = 'lost_pet' | 'found_animal' | 'safety_advisory';
export type NoticeStatus = 'draft' | 'published' | 'archived';
export interface NoticeMedia {
  id: string;
  name: string;
  /** Object URL; exists only in the tab that added it (never persisted). */
  url?: string;
}
export interface Notice {
  id: string;
  type: NoticeType;
  title: string;
  description: string;
  location: string;
  media: NoticeMedia[];
  status: NoticeStatus;
  caseId: string | null;
  source: 'admin' | 'resident';
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  author: string;
  archivedReason?: string;
}

export interface AdminNotification {
  id: string;
  kind: 'new_report' | 'urgent' | 'follow_up' | 'ownership_claim' | 'case_activity' | 'referral';
  title: string;
  body: string;
  at: string;
  read: boolean;
  caseId?: string;
}

export interface Policy {
  id: string;
  title: string;
  reference: string;
  summary: string;
  appliesTo: CategoryId[];
  /** null = the policy defines no observation period. No universal default is assumed. */
  observationDays: number | null;
  status: 'confirmed' | 'pending_confirmation';
}

export type PublicationMode = 'immediate' | 'review';
export interface Settings {
  subdivision: { name: string; city: string; address: string; officePhone: string; officeEmail: string; officeHours: string };
  notifications: {
    newReports: boolean; urgent: boolean; followUps: boolean; claims: boolean; caseActivity: boolean;
    channels: { inApp: boolean; email: boolean; push: boolean };
  };
  categories: Record<CategoryId, boolean>;
  policies: Policy[];
  privacy: { lostPetPublication: PublicationMode; foundPublication: PublicationMode };
}

export interface AdminProfile {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  role: string;
  subdivision: string;
  memberSince: string;
}

export interface AdminState {
  admin: AdminProfile;
  cases: Case[];
  residents: Resident[];
  pets: Pet[];
  notices: Notice[];
  notifications: AdminNotification[];
  settings: Settings;
  /** Deterministic id counter (keeps the reducer pure under StrictMode). */
  seq: number;
}
