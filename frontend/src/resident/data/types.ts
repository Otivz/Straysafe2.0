/**
 * Resident-side domain model.
 *
 * Only what a resident is allowed to see lives here. Administrative notes, priority, ownership assessment and reporter
 * identities of other residents are never part of this state. The four global case statuses are the same as in the Admin
 * UI; ownership claims have their own states and never become global statuses.
 */
import type { GeneralArea } from '../../preview/geo';

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
  kind: 'received' | 'status' | 'message' | 'you' | 'sighting' | 'outcome';
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
  /** 'recovered' means resolved (the pet is home, or the case closed): the notice no longer appears in Community. */
  status: 'active' | 'recovered';
  sightings: Sighting[];
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
}

export interface Notification {
  id: string;
  kind: 'report_update' | 'sighting' | 'claim_update' | 'community_notice' | 'safety_advisory';
  title: string;
  body: string;
  at: string;
  read: boolean;
  /** Path inside the resident app, e.g. /reports/SS-2026-0161 */
  to: string;
}

export interface Profile { id: string; name: string; email: string; phone: string; unit: string; street: string; memberSince: string }

/** How to reach the subdivision office: the office's own details, set by the Leader. */
export interface Office { name: string; phone: string; email: string; hours: string; address: string }

export interface Settings {
  notifications: { reportUpdates: boolean; sightings: boolean; claims: boolean; community: boolean; advisories: boolean };
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
  settings: Settings;
  reports: Report[];
  notices: Notice[];
  claims: Claim[];
  pets: Pet[];
  notifications: Notification[];
  draft: Draft | null;
  /** Next report reference number (SS-2026-0168 → 168). */
  nextRef: number;
  /** Deterministic id counter (keeps the reducer pure under StrictMode). */
  seq: number;
}
