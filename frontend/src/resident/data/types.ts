/**
 * Resident-side domain model.
 *
 * Only what a resident is allowed to see lives here. Administrative notes, priority, ownership assessment and reporter
 * identities of other residents are never part of this state. The four global case statuses are the same as in the Admin
 * UI; ownership claims have their own states and never become global statuses.
 */
import type { GeneralArea } from '../../preview/geo';

export type PetSex = 'male' | 'female' | 'unknown';
export type CategoryId = 'lost_pet' | 'found_animal' | 'nuisance' | 'safety' | 'injured' | 'other';
export type AnimalType = 'dog' | 'cat' | 'bird' | 'small_mammal' | 'reptile' | 'livestock' | 'wildlife' | 'other';
export type CaseStatus = 'reported' | 'under_review' | 'in_progress' | 'closed';
export type ReportKind = 'incident' | 'lost' | 'found';
/** private = only authorized administration; published = a community notice exists; pending_review = waiting for an administrator. */
export type Visibility = 'private' | 'published' | 'pending_review';
export type NoticeType = 'lost_pet' | 'found_animal' | 'safety_advisory';
export type ClaimStatus = 'submitted' | 'under_review' | 'needs_info' | 'approved' | 'rejected';

export interface Media {
  id: string;
  name: string;
  kind: 'photo' | 'video';
  size: number;
  /** An object URL in the tab that picked the file (never persisted), or the stored file's address when it came from the server. */
  url?: string;
  /** The file the person just chose, kept in memory until it is sent (live mode uploads it). Never persisted. */
  file?: File;
}
export interface GeoPoint { label: string; lat: number | null; lng: number | null; /** typed by the resident rather than picked on the map */ manual: boolean }

export interface ReportUpdate {
  id: string;
  at: string;
  /** `info`: a line the system recorded (a notice went out, a sighting came in). `message` is only ever a person writing to the resident. */
  kind: 'received' | 'status' | 'message' | 'you' | 'sighting' | 'outcome' | 'info';
  title: string;
  body?: string;
}

export interface Report {
  id: string;
  kind: ReportKind;
  category: CategoryId;
  status: CaseStatus;
  title: string;
  description: string;
  animalType: AnimalType;
  petName?: string;
  petId?: string | null;
  location: GeoPoint;
  observedAt: string;
  submittedAt: string;
  updatedAt: string;
  media: Media[];
  visibility: Visibility;
  noticeId: string | null;
  /** Resident-visible only. */
  updates: ReportUpdate[];
  outcome: { label: string; summary: string; resolved: boolean; at: string } | null;
  extra?: string;
}

export interface Sighting {
  id: string;
  /** When the animal was seen. */
  observedAt: string;
  submittedAt: string;
  location: GeoPoint;
  description: string;
  by: 'you' | 'neighbour';
  /** Someone else saw it and told the resident. */
  onBehalf: boolean;
  photos: number;
  /** seen ("I saw this pet") or secured ("I may have this pet safely with me": a possible recovery, only for the owner and the person who wrote it). */
  kind?: 'seen' | 'secured';
  /** Where a secured pet is being kept. Private: the owner and the person who wrote it only. */
  careNote?: string;
  /** What the Leader decided about it, when they did. */
  review?: { status: 'verified' | 'dismissed'; by: string | null; at?: string; note?: string };
}

/** How the owner and the person who may have the pet get in touch about one possible-recovery report. */
export interface Coordination {
  id: string;
  sightingId: string;
  youAre: 'owner' | 'finder';
  status: 'open' | 'resolved';
  /** none: nothing agreed yet. direct: both agreed to message. leader: the Subdivision Leader was asked to help (direct messages are over). */
  mode: 'none' | 'direct' | 'leader';
  youAgreed: boolean;
  otherAgreed: boolean;
  canMessage: boolean;
  mediationRequested: boolean;
  mediationByYou: boolean;
  unread: number;
  otherName: string;
  resolutionNote?: string;
}

export interface Notice {
  id: string;
  type: NoticeType;
  title: string;
  description: string;
  /** General area only. Never an exact address. */
  area: string;
  /**
   * Where it was seen or found, as a rounded position with a circle (see `generalize`). A notice never holds an exact spot:
   * that stays on the owner's own report and with administrators. Absent when the place was only described in words.
   */
  approx?: GeneralArea;
  animalType?: AnimalType;
  photos: number;
  /** The stored photo(s) of the animal, when the server has them. */
  photoUrls?: string[];
  publishedAt: string;
  source: 'admin' | 'owner';
  /** Published from one of this resident's own reports. */
  mine: boolean;
  reportId?: string;
  /** The number of the report the notice was made from (live mode): what an ownership claim is filed against. */
  reportNumber?: number;
  lastSeenAt?: string;
  /** Publication state is independent of outcome: only confirmed recovery means the pet is home. */
  status: 'requested' | 'active' | 'closed';
  sightings: Sighting[];
  /** Counts and the latest public observation are available even before full sightings are loaded. */
  sightingCount?: number;
  latestSighting?: Sighting;
  /** The notice's own number on the server (what the actions address). */
  alertNumber?: number;
  /** The pet's name, when it has one (a registered pet). */
  petName?: string;
  /** What identifies the animal, in the server's (already protected) words. */
  identity?: { breed?: string; color?: string; marks?: string };
  /** The owner's first name, for a neighbour's "who is looking". */
  ownerName?: string;
  /** When the owner confirmed the pet is home. A notice that ended any other way has no such time. */
  recoveredAt?: string;
  /** How a closed notice ended (recovered, withdrawn, not_found, ...) and why, in the server's words. */
  closeOutcome?: string;
  closeReason?: string;
  /** owner: this is their pet. finder: they wrote a possible-recovery report. neighbor: everyone else. */
  viewerRole?: 'owner' | 'finder' | 'neighbor';
  /** The possible-recovery reports on a missing-pet notice (owner only). */
  securedCount?: number;
  coordinations?: Coordination[];
  /** The owner only: how many residents the notice reached when it was published. */
  residentsNotified?: number;
  /** The owner only: the lost & found alerts the Subdivision Leader sent to neighbours about this pet (never the notice itself). */
  leaderAlerts?: { sent: number; lastAt: string | null };
  /** Official guidance (safety advisories). */
  guidance?: string[];
  updates?: { id: string; at: string; text: string }[];
}

export interface Claim {
  id: string;
  noticeId: string;
  petId: string | null;
  status: ClaimStatus;
  statement: string;
  evidence: string[];
  submittedAt: string;
  updates: ReportUpdate[];
  decisionNote?: string;
}

export interface Pet {
  id: string;
  name: string;
  type: AnimalType;
  breed: string;
  color: string;
  ageText: string;
  markings: string[];
  description: string;
  photoUrl?: string;
  photoName?: string;
  registeredAt: string;
  sex: PetSex;
  /** The record's status as the server holds it (Active, Lost, Deceased...). Only a deceased pet cannot be reported missing. */
  status?: string;
}

/** An office-registered pet that a Subdivision Leader linked to this account and that the resident has not answered yet. */
export interface OwnershipRequest { id: string; petId: string; petName: string; petType: AnimalType; photoUrl?: string; proposedBy: string; at: string }

export interface Notification {
  id: string;
  /** `alert`: a lost & found alert the Subdivision Leader sent (a tap opens its notice, the notice's form, or the notifications). */
  kind: 'report_update' | 'sighting' | 'claim_update' | 'community_notice' | 'safety_advisory' | 'alert';
  title: string;
  body: string;
  at: string;
  read: boolean;
  /** Path inside the resident app, e.g. /reports/SS-2026-0161 */
  to: string;
}

/** A case conversation the signed-in resident belongs to. It never grants access to another resident's report. */
export interface CaseConversation {
  id: string;
  kind: 'direct' | 'bridge';
  status: 'open' | 'closed';
  canReply: boolean;
  endedReason: string | null;
  myReportNumber: number | null;
  title: string;
  subtitle: string;
  unread: number;
  messageCount: number;
  lastAt: string;
  lastText: string;
  people: Array<{ id: string; name: string; label: string; me: boolean }>;
}

export interface Profile { id: string; name: string; email: string; phone: string; unit: string; street: string; memberSince: string }

/** How to reach the subdivision office: the office's own details, set by the Leader. */
export interface Office { name: string; phone: string; email: string; hours: string; address: string }

export interface Settings {
  /** `lostFoundAlerts`: the Subdivision Leader's alerts about missing and found animals (notices stay in Community either way). */
  notifications: { reportUpdates: boolean; sightings: boolean; claims: boolean; community: boolean; advisories: boolean; lostFoundAlerts: boolean };
  channels: { push: boolean; email: boolean; sms: boolean };
}

/** A report that is being written. Kept in state so leaving the flow does not lose it. */
export interface Draft {
  kind: ReportKind;
  category: CategoryId;
  animalType: AnimalType | '';
  petId: string | null;
  petName: string;
  description: string;
  /** <input type="datetime-local"> value */
  observedAt: string;
  location: GeoPoint | null;
  media: Media[];
  extra: string;
}

export interface ResidentState {
  profile: Profile;
  /** Where the Contact screens say to reach the office. Absent until the office has recorded how (live). */
  office?: Office | null;
  /** The subdivision's own name, once the server has told it. */
  subdivisionName?: string | null;
  /** How the subdivision publishes each kind of notice (the server's publication setting). Absent until it has been read. */
  publication?: { lost_pet: 'immediate' | 'review'; found_animal: 'immediate' | 'review' };
  /** Which kinds of report the subdivision accepts right now (the Leader's category settings, as the server says them). Absent until read, or when it could not be. */
  accepting?: Partial<Record<CategoryId, boolean>>;
  settings: Settings;
  reports: Report[];
  notices: Notice[];
  /** How many missing pets and found animals the Community holds in all (the overview shows only a few of each). Absent until read. */
  community?: { lostTotal: number; foundTotal: number };
  claims: Claim[];
  pets: Pet[];
  /** Pets the office linked to this account, waiting for the resident to say yes or no. Absent until read. */
  ownershipRequests?: OwnershipRequest[];
  notifications: Notification[];
  /** Case-linked conversations, separate from the reporter's original confidential case updates. */
  conversations?: CaseConversation[];
  draft: Draft | null;
  /** Next report reference number (SS-2026-0168 → 168). */
  nextRef: number;
  /** Deterministic id counter (keeps the reducer pure under StrictMode). */
  seq: number;
}
