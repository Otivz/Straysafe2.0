import type { ThreadTarget } from '../../data/types';

/** Which contextual dialog is open on the case page. Dialogs are rendered by CaseDialogs and never get their own route. */
export type CaseDialog =
  | { kind: 'status' }
  | { kind: 'priority' }
  | { kind: 'note' }
  | { kind: 'followUp'; mode: 'follow_up' | 'owner' }
  | { kind: 'completeFollowUp'; followUpId: string }
  | { kind: 'warning' }
  | { kind: 'compliance' }
  | { kind: 'referral' }
  /** `contact`: record the contact attempt itself (the referral was only written down). */
  | { kind: 'coordination'; referralId: string; contact?: boolean }
  | { kind: 'claim'; claimId: string }
  | { kind: 'link' }
  | { kind: 'unlink'; otherId: string }
  | { kind: 'unlinkMatch'; matchId: string }
  | { kind: 'messages'; target: ThreadTarget }
  | { kind: 'close' }
  | { kind: 'reopen' }
  | { kind: 'evidence'; evidenceId: string }
  /** Lost Pet: record that the OWNER confirmed the pet is home (by phone or in person). */
  | { kind: 'recovery' }
  | { kind: 'reviewSighting'; sightingId: string }
  | { kind: 'resolveConversation'; conversationId: string }
  /** Lost and found: review a possible match between a missing-pet report and a found-animal report (decide it, or look at one already decided). */
  | { kind: 'match'; matchId: string }
  /** Lost and found: send a notification alert, or change one (`alertId`). Never the Community notice. */
  | { kind: 'alert'; alertId?: string }
  | { kind: 'stopAlert'; alertId: string }
  /** Found animal: publish its Community notice (residents are notified once, when it is published). */
  | { kind: 'publishNotice' };

export type OpenCaseDialog = (dialog: CaseDialog) => void;
