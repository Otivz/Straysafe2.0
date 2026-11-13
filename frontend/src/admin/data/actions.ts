/**
 * Every change the Subdivision Leader screens can ask for, as one typed action. Screens never edit records directly; they dispatch an
 * action, and the live provider (src/admin/live/actions.ts) turns each one into one or a few requests on the real API. The server decides
 * the result: nothing is applied to the screen's data until the request has succeeded and the touched records have been read back.
 */
import type {
  AdminProfile, AlertInput, Assessment, CaseStatus, ClaimStatus, ComplianceResult, ContactMethod, DispositionId, FollowUpKind, IdentityReview, Notice,
  OwnerContact, OwnershipReview, Priority, ReferralStatus, Resident, Settings, WarningDelivery,
} from './types';

export type AdminAction =
  | { type: 'case/changeStatus'; id: string; to: CaseStatus; note?: string }
  | { type: 'case/changePriority'; id: string; to: Priority; reason: string }
  | { type: 'case/addNote'; id: string; text: string }
  | { type: 'case/saveAssessment'; id: string; assessment: Omit<Assessment, 'savedAt' | 'savedBy'>; identity: IdentityReview; ownership: OwnershipReview; alsoSetUrgent: boolean }
  | { type: 'case/recordFollowUp'; id: string; kind: FollowUpKind; title: string; notes?: string; dueAt: string | null; doneNow: boolean }
  | { type: 'case/completeFollowUp'; id: string; followUpId: string; note?: string }
  | { type: 'case/cancelFollowUp'; id: string; followUpId: string }
  | { type: 'case/recordOwnerContact'; id: string; at: string; method: ContactMethod; withWhom: string; summary: string; outcome: OwnerContact['outcome']; nextStepAt: string | null }
  | { type: 'case/issueWarning'; id: string; policyId: string; details: string; delivery: WarningDelivery; observationDays: number | null; observationStart: string | null; followUpAt: string | null }
  | { type: 'case/recordCompliance'; id: string; warningId: string; observedAt: string; result: ComplianceResult; notes: string; conclude: 'compliant' | 'non_compliant' | null }
  /** `contacted: false` writes the assistance down without claiming anyone was reached (status "Not contacted yet"): saving a referral is never proof of contact. */
  | { type: 'case/createReferral'; id: string; orgId: string; orgName: string; reason: string; referredAt: string; contactPerson: string; contactChannel: string; notes: string; contacted?: boolean }
  /** `contact` is the attempt itself (how, whom), when this update records the first contact or another one. */
  | { type: 'case/updateReferral'; id: string; referralId: string; status: ReferralStatus; note: string; externalOutcome?: string; remainingFollowUp?: string; followUpAt?: string | null; contact?: { method: ContactMethod; person: string; detail: string } }
  /** The OWNER confirmed by phone or in person that the pet is home, and the Leader records it. It is the one recovery operation: the Leader never declares a recovery alone. */
  | { type: 'lost/recordRecovery'; id: string; alertId: string; source: 'phone' | 'in_person'; confirmedAt: string; note?: string }
  | { type: 'lost/reviewSighting'; id: string; sightingId: string; status: 'unverified' | 'verified' | 'dismissed'; note?: string }
  /** The Leader finished helping an owner and a neighbour get in touch. The contact work itself is in the case's contact log and follow-ups. */
  | { type: 'lost/resolveConversation'; id: string; conversationId: string; note?: string }
  /**
   * A Leader's decision on a possible match between a missing-pet report and a found-animal report. `confirm` links the two reports (nothing is merged
   * or hidden) and tells both residents; `reject` rules the pair out and tells nobody; `reopen` reviews a ruled-out pair again. A link is never ownership
   * and never a recovery.
   */
  | { type: 'match/decide'; matchId: string; decision: 'confirm' | 'reject' | 'reopen' }
  | { type: 'match/unlink'; matchId: string }
  /** Lost and found: a notification alert about the case (never the Community notice). `requestId` keeps a double tap from sending twice. */
  | { type: 'alert/create'; id: string; alert: AlertInput; requestId: string }
  | { type: 'alert/update'; id: string; alertId: string; alert: AlertInput }
  | { type: 'alert/pause' | 'alert/resume' | 'alert/stop'; id: string; alertId: string }
  | { type: 'thread/send'; id: string; threadId: string; body: string; clientRequestId: string }
  | { type: 'case/reviewClaim'; id: string; claimId: string; decision: ClaimStatus; note: string }
  | { type: 'case/linkCases'; id: string; otherIds: string[]; sameAnimal?: boolean }
  | { type: 'case/unlinkCase'; id: string; otherId: string }
  | { type: 'case/close'; id: string; disposition: DispositionId; reason: string; followUpCheckAt: string | null; endOpenItems: boolean }
  | { type: 'case/reopen'; id: string; reason: string }
  | { type: 'notice/save'; notice: Notice; publish: boolean }
  | { type: 'notice/archive'; id: string; reason: string }
  | { type: 'notice/delete'; id: string }
  | { type: 'notification/read'; id: string }
  | { type: 'notification/readAll' }
  | { type: 'resident/setStatus'; id: string; status: Resident['status'] }
  /** Ask a resident to confirm that an existing pet record (one the office entered) is theirs. Nothing moves until they accept. */
  | { type: 'pet/linkOwner'; petId: string; residentId: string; evidence: string }
  | { type: 'settings/set'; settings: Settings }
  | { type: 'admin/updateProfile'; patch: Partial<Pick<AdminProfile, 'name' | 'title' | 'email' | 'phone'>> };
