import { ConfirmDialog } from '../../components/Dialog';
import { useToast } from '../../components/toast';
import { useAdminData } from '../../data/context';
import type { Case } from '../../data/types';
import { ComplianceDialog, CompleteFollowUpDialog, FollowUpDialog, WarningDialog } from '../../dialogs/ActionDialogs';
import { AlertDialog, PublishCaseNoticeDialog, StopAlertDialog } from '../../dialogs/AlertDialogs';
import { EvidenceDialog, NoteDialog, PriorityDialog, StatusDialog } from '../../dialogs/BasicDialogs';
import { CloseCaseDialog, ReopenDialog } from '../../dialogs/ClosureDialogs';
import { CoordinationDialog, ReferralDialog } from '../../dialogs/CoordinationDialogs';
import { RecordRecoveryDialog, ResolveConversationDialog, ReviewSightingDialog } from '../../dialogs/LostPetDialogs';
import { MatchCompareDialog } from '../../dialogs/MatchDialogs';
import { CaseMessagesDialog } from '../../dialogs/CaseMessagesDialog';
import { ClaimReviewDialog, LinkReportsDialog } from '../../dialogs/ReviewDialogs';
import type { CaseDialog } from './dialogState';

/** Renders whichever contextual dialog is open on the case page. One at a time, never a separate route. */
export function CaseDialogs({ c, dialog, onClose }: { c: Case; dialog: CaseDialog | null; onClose: () => void }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  if (!dialog) return null;

  switch (dialog.kind) {
    case 'status': return <StatusDialog c={c} onClose={onClose} />;
    case 'priority': return <PriorityDialog c={c} onClose={onClose} />;
    case 'note': return <NoteDialog c={c} onClose={onClose} />;
    case 'followUp': return <FollowUpDialog c={c} mode={dialog.mode} onClose={onClose} />;
    case 'completeFollowUp': return <CompleteFollowUpDialog c={c} followUpId={dialog.followUpId} onClose={onClose} />;
    case 'warning': return <WarningDialog c={c} onClose={onClose} />;
    case 'compliance': return <ComplianceDialog c={c} onClose={onClose} />;
    case 'referral': return <ReferralDialog c={c} onClose={onClose} />;
    case 'coordination': return <CoordinationDialog c={c} referralId={dialog.referralId} contact={dialog.contact} onClose={onClose} />;
    case 'recovery': return <RecordRecoveryDialog c={c} onClose={onClose} />;
    case 'reviewSighting': return <ReviewSightingDialog c={c} sightingId={dialog.sightingId} onClose={onClose} />;
    case 'resolveConversation': return <ResolveConversationDialog c={c} conversationId={dialog.conversationId} onClose={onClose} />;
    case 'messages': return <CaseMessagesDialog c={c} target={dialog.target} onClose={onClose} />;
    case 'match': return <MatchCompareDialog matchId={dialog.matchId} onClose={onClose} />;
    case 'alert': return <AlertDialog c={c} alertId={dialog.alertId} onClose={onClose} />;
    case 'stopAlert': return <StopAlertDialog c={c} alertId={dialog.alertId} onClose={onClose} />;
    case 'publishNotice': return <PublishCaseNoticeDialog c={c} onClose={onClose} />;
    case 'claim': return <ClaimReviewDialog c={c} claimId={dialog.claimId} onClose={onClose} />;
    case 'link': return <LinkReportsDialog c={c} onClose={onClose} />;
    case 'close': return <CloseCaseDialog c={c} onClose={onClose} />;
    case 'reopen': return <ReopenDialog c={c} onClose={onClose} />;
    case 'evidence': return <EvidenceDialog c={c} evidenceId={dialog.evidenceId} onClose={onClose} />;
    case 'unlink':
      return (
        <ConfirmDialog
          title="Unlink this report?"
          message={<>Only the connection between {c.id} and {dialog.otherId} is removed. Both reports, with their evidence and history, stay exactly as they are.</>}
          confirmLabel="Unlink report"
          onClose={onClose}
          onConfirm={async () => { await dispatch({ type: 'case/unlinkCase', id: c.id, otherId: dialog.otherId }); toast.success('Report unlinked'); }}
        />
      );
    case 'unlinkMatch':
      return <ConfirmDialog title="Unlink these reports?" message="Both reports and their histories stay. The direct conversation between the owner and the finder closes, and both residents are told that the link was removed. Nothing is marked recovered." confirmLabel="Unlink reports" onClose={onClose} onConfirm={async () => { await dispatch({ type: 'match/unlink', matchId: dialog.matchId }); toast.success('Reports unlinked. The conversation between the owner and the finder is closed.'); }} />;
    default: return null;
  }
}
