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
  | { kind: 'coordination'; referralId: string }
  | { kind: 'claim'; claimId: string }
  | { kind: 'link' }
  | { kind: 'unlink'; otherId: string }
  | { kind: 'close' }
  | { kind: 'reopen' }
  | { kind: 'evidence'; evidenceId: string };

export type OpenCaseDialog = (dialog: CaseDialog) => void;
