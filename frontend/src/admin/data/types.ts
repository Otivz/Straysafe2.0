/**
 * Domain model for the Subdivision Admin UI.
 *
 * Workflow:  REPORT → ASSESS → COORDINATE → MONITOR → DOCUMENT OUTCOME → CLOSE
 *
 * Only four global statuses exist. Warnings, referrals, ownership claims and follow-ups are case DETAILS, never
 * additional statuses. Incident verification, animal identity and ownership are three independent questions.
 * Everything here is JSON-serialisable (ISO strings, no Dates).
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
  | 'duplicate_report'
  /** Set only when the owner withdraws their own report: a Leader never picks it. */
  | 'withdrawn_by_reporter';
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
  /** The stored file, when the server has one; the screens show a placeholder otherwise. */
  url?: string;
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

/** `to_contact`: the assistance is written down but nobody has been contacted yet. Saving a referral is never proof that the organisation was reached. */
export type ReferralStatus = 'to_contact' | 'sent' | 'acknowledged' | 'in_progress' | 'completed' | 'declined' | 'no_response';
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
  /**
   * Whether a Leader has recorded the identity. False while `status` only reflects the reporter naming a registered pet ("Linked by the reporter"):
   * naming a pet is the reporter's say-so, not a decision. Absent when the server did not say; the status is then taken as it is.
   */
  decided?: boolean;
}

/** What identifies a pet in the registry, in words ("Not recorded" for what was left out). */
export interface PetFacts {
  name: string;
  species: string;
  breed: string;
  sex: string;
  colour: string;
  markings: string;
  age: string;
  photos: string[];
}

/**
 * The registered pet a report names, for the Leader (staff only, scoped to their subdivision). A registration is what was declared when the pet was
 * recorded; it is never proof of ownership, which only the Leader's own decision on the case records, with evidence.
 */
export interface RegisteredPet {
  petId: string;
  /** `removed`: the record no longer exists. `restricted`: it belongs to another subdivision, so it is not shown. null: readable. */
  unavailable: 'removed' | 'restricted' | null;
  /** The reporter named this pet and no Leader has decided the animal's identity yet. */
  linkedByReporter: boolean;
  reporterIsOwner: boolean;
  /** The registry record today. */
  current: (PetFacts & { status: string; updatedAt: string | null }) | null;
  /** The record as it was when the report was filed (none for a report filed before pets were frozen into reports). */
  asReported: PetFacts | null;
  /** Which facts differ now from what was reported ("colour", "photos"...). */
  changedSince: string[];
  registration: { byOwner: boolean; registeredAt: string; registeredBy: string } | null;
  /** The registered owner and how to reach them. null when no owner and no contact is recorded. */
  owner: { residentId: string | null; name: string; phone: string; email: string; address: string; emergencyContact: string } | null;
  /** When and where the owner last saw the pet, as filed. */
  lastSeen: { at: string | null; where: string; lat?: number; lng?: number } | null;
  /** What the community notice says, when a notice exists. */
  notice: { at: string | null; where: string; status: string } | null;
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
  /** Words for the place, plus the pin when the reporter placed one. */
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
  /** The registered pet the report names: undefined until the case is opened, null when no pet is linked (an older report). */
  registeredPet?: RegisteredPet | null;
  /** The Lost Pet picture (sightings, conversations, recovery). undefined until the case is opened in full; null for every other kind of case. */
  lostPet?: LostPetCase | null;
  /** The open requests to help an owner and a neighbour get in touch, read from the work queue (so the dashboard needs no case opened). */
  mediation?: MediationRequest[];
  claims: OwnershipClaim[];
  followUps: FollowUp[];
  ownerContacts: OwnerContact[];
  warnings: Warning[];
  referrals: Referral[];
  relatedCaseIds: string[];
  notes: Note[];
  /** The Leader's conversations on a missing pet or a found animal: one per person contacted, and the bridge of each linked pair. Empty until the case is opened. */
  threads: CaseThread[];
  /** Notification alerts sent or scheduled about a missing pet or a found animal (never the Community notice). Empty until the case is opened. */
  alerts: CaseAlert[];
  timeline: TimelineEvent[];
  closure: Closure | null;
}

/** A notification alert's state: scheduled (nothing sent yet), active (repeating), paused, finished, stopped, cancelled (stopped before sending). */
export type AlertStatus = 'scheduled' | 'active' | 'paused' | 'finished' | 'stopped' | 'cancelled';
/** Where a tap on the alert goes: the Community notice, its sighting form (missing pet), its claim form (found animal), or the alert itself. */
export type AlertDestination = 'notice' | 'sighting' | 'claim' | 'inbox';
export interface AlertSchedule {
  mode: 'now' | 'later' | 'repeat';
  repeat: 'every' | 'times' | null;
  everyMinutes: number | null;
  /** "07:00" */
  times: string[];
  startAt: string;
  endKind: 'resolved' | 'date' | 'count' | null;
  /** The end, or the latest end of "until resolved". */
  endAt: string | null;
  maxSends: number | null;
}
/**
 * A push notification the Leader sends about this case (backend services/case_alerts.py): its own title and message, the photo or not, where a tap goes,
 * who receives it and when. It never creates, publishes or edits the Community notice.
 */
export interface CaseAlert {
  id: string;
  title: string;
  message: string;
  includePhoto: boolean;
  destination: AlertDestination;
  audience: 'all' | 'helpers';
  status: AlertStatus;
  stopReason: string | null;
  schedule: AlertSchedule;
  nextSendAt: string | null;
  /** The next few planned sends. */
  upcoming: string[];
  sendsDone: number;
  createdAt: string;
  createdBy: string;
  /** Newest first. `skippedBefore`: planned sends missed while the server was down (never sent late). */
  sends: { slotAt: string; sentAt: string; recipients: number; skippedBefore: number }[];
}
/** How many residents each choice reaches now. */
export interface AlertAudience {
  all: number;
  helpers: number;
  residents: number;
  turnedOff: number;
  /** Phones can be reached (Web Push keys or the Firebase service account are set on the server). Without it alerts reach only the in-app list. */
  pushReady: boolean;
}
/** What the alert window sends to the server. Times are local; the server reads them as the subdivision's time. */
export interface AlertInput {
  title: string;
  message: string;
  includePhoto: boolean;
  destination: AlertDestination;
  audience: 'all' | 'helpers';
  schedule: {
    mode: 'now' | 'later' | 'repeat';
    at?: string;
    repeat?: 'every' | 'times';
    every?: number;
    unit?: 'minutes' | 'hours' | 'days';
    times?: string[];
    startAt?: string | null;
    until?: 'resolved' | 'date' | 'count';
    untilAt?: string;
    count?: number;
    latestEnd?: string;
  };
}

/** Who is in a conversation, as the Leader reads it (full names). `userId` is the resident's id, as on `Person.residentId`. */
export interface ThreadPerson { userId: string; role: 'leader' | 'owner' | 'finder' | 'reporter'; name: string }

/**
 * A conversation of a case (backend: services/case_messaging.py). `direct`: the Leader and one resident ("Contact the owner"). `bridge`: opened the
 * moment two reports are linked, for the owner, the finder and the Leader. What the Leader writes writes itself into the Activity.
 */
export interface CaseThread {
  id: string;
  kind: 'direct' | 'bridge';
  /** closed: the link it was opened for was removed, or a report of it was closed. It can still be read. */
  status: 'open' | 'closed';
  canReply: boolean;
  endedReason: string | null;
  /** A bridge: the possible match (the linked pair) it belongs to. */
  matchId: string | null;
  unread: number;
  messageCount: number;
  lastAt: string;
  people: ThreadPerson[];
}

export interface ThreadMessage {
  id: string;
  /** system: the thread was opened or closed (no sender). */
  kind: 'message' | 'system';
  senderName: string | null;
  /** The sender's role label ("Owner", "Subdivision Leader"). */
  label: string;
  mine: boolean;
  body: string;
  at: string;
}

/** A conversation read in full. */
export interface ThreadView extends CaseThread { messages: ThreadMessage[] }

/** Who a Leader is about to write to (1-to-1): one person of the report or of a linked report. */
export type ThreadTarget = { kind: 'direct'; party: 'owner' | 'reporter'; name: string; label: string; reportId?: string };

/** One thing a neighbour told the owner about a missing pet: an ordinary sighting, or "I may have this pet safely with me" (a possible recovery). */
export interface LostPetSighting {
  id: string;
  kind: 'seen' | 'secured';
  seenAt: string;
  submittedAt: string;
  place: string;
  /** The exact spot: the Leader is authorised to see it. */
  lat?: number;
  lng?: number;
  description: string;
  /** Where a secured pet is being kept (private to the owner, the Leader and its writer). */
  careNote?: string;
  photoUrl?: string;
  /** The writer, by name: only the Leader is given it, because the Leader follows it up. */
  reportedBy: string;
  review: 'unverified' | 'verified' | 'dismissed';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

export interface LostPetPerson { residentId: string | null; name: string; phone: string }

/** How the owner and the person who may have the pet get in touch about one possible recovery. The Leader never reads their messages. */
export interface LostPetConversation {
  id: string;
  sightingId: string;
  status: 'open' | 'resolved';
  /** none: not agreed yet. direct: both agreed to message in the app. leader: one of them asked the Leader to help (direct messages are over). */
  mode: 'none' | 'direct' | 'leader';
  ownerAgreed: boolean;
  finderAgreed: boolean;
  /** Who asked the Leader to help, and when (no reason is ever asked). */
  requestedBy?: 'owner' | 'finder';
  requestedAt?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  owner: LostPetPerson | null;
  finder: LostPetPerson | null;
}

/** The owner's confirmation that the pet is home: the only thing that records a recovery. */
export interface LostPetRecovery {
  at: string;
  source: 'owner_app' | 'phone' | 'in_person';
  /** Who recorded it: the owner (in the app) or the Leader (after a call or a visit). */
  recordedBy: string;
  recordedAt: string;
  note?: string;
}

/** The Lost Pet picture of a case, from the notice and its records. Present on a lost-pet case that has been opened in full. */
export interface LostPetCase {
  /** null: a missing-pet report with no notice (an older one). */
  alertId: string | null;
  notice: { status: 'requested' | 'active' | 'closed'; publishedAt: string | null; closedAt: string | null; closeOutcome: string | null; closeReason: string | null; residentsNotified: number | null } | null;
  lastSeen: { at: string | null; where: string; lat?: number; lng?: number };
  /** Newest first. */
  sightings: LostPetSighting[];
  conversations: LostPetConversation[];
  recovery: LostPetRecovery | null;
}

/** An owner and a neighbour who asked the Leader to help them get in touch: a real request for the Leader's time. */
export interface MediationRequest { id: string; requestedAt: string | null; ownerName: string; finderName: string }

// ----------------------------------------------------------------------------------- lost and found possible matches
/**
 * One side of a possible match: a missing-pet report or a found-animal report. The reporter is private to the Leader, the same as on the case.
 * What the report says is shown in words ("Not noted" is left to the screen), never as a decision.
 */
export interface MatchSide {
  /** The case reference of the report (SS-2026-0012). */
  caseId: string;
  kind: 'lost' | 'found';
  title: string;
  photoUrl?: string;
  species: string;
  breed: string;
  colors: string[];
  size: string;
  features: string[];
  collar: string;
  place: string;
  /** When the pet was last seen / when the animal was found. */
  at: string | null;
  reportedAt: string | null;
  /** What the reporter wrote. */
  words: string;
  /** False once the report is closed: it can no longer be linked. */
  open: boolean;
  reporter: { residentId: string | null; name: string; phone: string } | null;
}

/** pending: waiting for a Leader. confirmed: linked (both residents were told). rejected: ruled out, kept so it is never suggested again. moot: the found report was linked to another lost report. */
export type MatchStatus = 'pending' | 'confirmed' | 'rejected' | 'moot';
/** `manual`: a Leader linked the two reports themselves and they share too little to be compared as a suggestion. */
export type MatchLevel = 'strong' | 'possible' | 'manual';
export interface MatchRow { key: string; label: string; lost: string; found: string; verdict: 'match' | 'similar' | 'differs' | 'unknown'; note: string }

/**
 * A lost-pet report and a found-animal report that may describe the same animal. Only a Leader's confirmation links them: a link is never
 * proof of ownership and never a recovery (only the owner's confirmation recovers a pet).
 */
export interface PossibleMatch {
  /** The server's id of the match, as text. */
  id: string;
  status: MatchStatus;
  level: MatchLevel;
  score: number;
  /** Why they may match, strongest first. */
  reasons: string[];
  lost: MatchSide;
  found: MatchSide;
  createdAt: string | null;
  decidedAt: string | null;
  /** After a confirmation: how the owner and the finder get in touch (they choose; the Leader is asked only when one of them wants help). */
  coordination: { mode: 'none' | 'direct' | 'leader'; status: 'open' | 'resolved' } | null;
  /** Only once the match was opened in full. */
  rows?: MatchRow[];
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
  /** The stored photos, when the server has them. */
  photoUrls?: string[];
  ownerId: string;
  registeredAt: string;
  /** Who entered the record: the owner in their own account, or someone on the team for them. Absent when the server did not say. */
  registeredBy?: { name: string; byOwner: boolean; userId: string | null };
  vaccination: 'up_to_date' | 'overdue' | 'unknown';
  microchipped: boolean;
}

export type NoticeType = 'lost_pet' | 'found_animal' | 'safety_advisory';
export type NoticeStatus = 'draft' | 'published' | 'archived';
export interface NoticeMedia {
  id: string;
  name: string;
  /** Object URL in the tab that added the photo (never persisted), or the stored file's address when it came from the server. */
  url?: string;
  /** The file the person just chose, kept in memory until the notice is saved (live mode uploads it). Never persisted. */
  file?: File;
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
  kind: 'new_report' | 'urgent' | 'follow_up' | 'ownership_claim' | 'case_activity' | 'referral' | 'help_request';
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
  /** The possible matches between missing-pet and found-animal reports (waiting ones first). */
  matches: PossibleMatch[];
  settings: Settings;
  /** Id counter (not used by the connected data layer). */
  seq: number;
}
