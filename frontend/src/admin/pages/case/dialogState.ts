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
  | { kind: 'close' }
  | { kind: 'reopen' }
  | { kind: 'evidence'; evidenceId: string }
  /** Lost Pet: record that the OWNER confirmed the pet is home (by phone or in person). */
  | { kind: 'recovery' }
  | { kind: 'reviewSighting'; sightingId: string }
  | { kind: 'resolveConversation'; conversationId: string };

export type OpenCaseDialog = (dialog: CaseDialog) => void;
