import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, Input, OptionGroup, Select, Textarea } from '../components/form';
import { Callout, FormError } from '../components/layout';
import { useToast } from '../components/toast';
import { DANGEROUS_OUTCOMES, WELFARE_OUTCOMES } from '../data/constants';
import { useAdminData } from '../data/context';
import type { CaseConcern, ConcernStatus } from '../data/types';
import { useSubmit } from '../lib/useSubmit';

const CONCERN_STATUS_OPTIONS: { value: ConcernStatus; label: string; description: string }[] = [
  { value: 'ongoing_assessment', label: 'Ongoing Assessment', description: 'Needs further assessment or monitoring.' },
  { value: 'in_progress', label: 'In Progress', description: 'Intervention or follow-up is currently underway.' },
  { value: 'resolved', label: 'Resolved', description: 'This specific concern has met its resolution requirements.' },
  { value: 'not_applicable', label: 'Dismissed / Not Applicable', description: 'Concern determined unfounded or no longer applies.' },
];

/** Update or resolve one concern independently inside a consolidated master case. */
export function ConcernResolutionDialog({
  caseId,
  concern,
  otherCount,
  onClose,
}: {
  caseId: string;
  concern: CaseConcern;
  otherCount: number;
  onClose: () => void;
}) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();

  const [status, setStatus] = useState<ConcernStatus>(concern.status);
  const [outcome, setOutcome] = useState(concern.outcome ?? '');
  const [threatOngoing, setThreatOngoing] = useState(concern.threatOngoing || 'No');
  const [notes, setNotes] = useState(concern.resolutionNotes ?? '');
  const [finalCondition, setFinalCondition] = useState(concern.details?.final_animal_condition ?? '');
  const [assistanceProvided, setAssistanceProvided] = useState(concern.details?.assistance_provided ?? '');
  const [securityActions, setSecurityActions] = useState(concern.details?.security_actions_performed ?? '');
  const [advisoryStatus, setAdvisoryStatus] = useState(concern.details?.advisory_status ?? '');
  const [referralOutcome, setReferralOutcome] = useState(concern.details?.referral_outcome ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isInjured = concern.concernFamily === 'injured';
  const isSafety = concern.concernFamily === 'safety';
  const resolving = status === 'resolved';

  const dirty =
    status !== concern.status
    || outcome !== (concern.outcome ?? '')
    || threatOngoing !== (concern.threatOngoing || 'No')
    || notes !== (concern.resolutionNotes ?? '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (resolving && isInjured && !outcome) {
      next.outcome = 'Document the Animal Welfare Outcome before marking this concern as Resolved.';
    }
    if (resolving && isSafety && !outcome) {
      next.outcome = 'Document the Dangerous Animal Incident Outcome before marking this concern as Resolved.';
    }
    if (resolving && isSafety && threatOngoing === 'Yes') {
      next.threatOngoing = 'A Dangerous Animal concern cannot be marked Resolved while the threat is still ongoing.';
    }
    if (resolving && !outcome && notes.trim().length < 5) {
      next.notes = 'Provide a resolution note (at least 5 characters).';
    }
    if (status === 'not_applicable' && notes.trim().length < 5) {
      next.notes = 'Explain why this concern is dismissed or not applicable (at least 5 characters).';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const ok = await run(() =>
      dispatch({
        type: 'case/updateConcern',
        id: caseId,
        concernId: concern.concernId,
        status,
        outcome: outcome || undefined,
        threatOngoing: isSafety ? threatOngoing : undefined,
        resolutionNotes: notes.trim() || undefined,
        finalAnimalCondition: isInjured ? finalCondition.trim() || undefined : undefined,
        assistanceProvided: isInjured ? assistanceProvided.trim() || undefined : undefined,
        securityActionsPerformed: isSafety ? securityActions.trim() || undefined : undefined,
        advisoryStatus: isSafety ? advisoryStatus.trim() || undefined : undefined,
        referralOutcome: referralOutcome.trim() || undefined,
      }),
    );
    if (ok) {
      toast.success(`${concern.concernLabel} updated`);
      onClose();
    }
  };

  return (
    <Dialog
      size="lg"
      title={`Update ${concern.concernLabel}`}
      description={`Source report: ${concern.sourceReference}${concern.isPrimary ? ' (Primary report)' : ` (Merged into ${caseId})`}`}
      onClose={onClose}
      dirty={dirty}
      dismissible={!pending}
      onSubmit={(e) => { void submit(e); }}
      footer={({ requestClose }) => (
        <>
          <Button type="button" onClick={requestClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" loading={pending}>Save concern status</Button>
        </>
      )}
    >
      {otherCount > 0 ? (
        <Callout tone="info">
          Resolving this concern updates only <strong>{concern.concernLabel}</strong>. The master case {caseId} stays active until all {otherCount + 1} consolidated concerns are resolved.
        </Callout>
      ) : null}

      <Field label="Concern status" required>
        <OptionGroup
          name="concern-status"
          label="Concern status"
          value={status}
          onChange={setStatus}
          options={CONCERN_STATUS_OPTIONS}
        />
      </Field>

      {isInjured ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)]/50 p-3.5">
          <p className="sa-label m-0">Injured animal welfare documentation</p>
          <Field label="Animal welfare status / outcome" required={resolving} error={errors.outcome}>
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">Choose outcome</option>
              {WELFARE_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </Field>
          <Field label="Final animal condition" optional>
            <Input value={finalCondition} onChange={(e) => setFinalCondition(e.target.value)} placeholder="e.g. Stabilized, treated by vet" />
          </Field>
          <Field label="Assistance provided" optional>
            <Input value={assistanceProvided} onChange={(e) => setAssistanceProvided(e.target.value)} placeholder="e.g. Guardhouse secured animal, vet transport" />
          </Field>
          <Field label="Referral outcome" optional>
            <Input value={referralOutcome} onChange={(e) => setReferralOutcome(e.target.value)} placeholder="e.g. Received by City Vet / Barangay team" />
          </Field>
        </div>
      ) : null}

      {isSafety ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)]/50 p-3.5">
          <p className="sa-label m-0">Dangerous animal incident documentation</p>
          <Field label="Dangerous animal incident outcome" required={resolving} error={errors.outcome}>
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              <option value="">Choose outcome</option>
              {DANGEROUS_OUTCOMES.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </Field>
          <Field label="Is the safety threat still ongoing?" error={errors.threatOngoing}>
            <Select value={threatOngoing} onChange={(e) => setThreatOngoing(e.target.value)}>
              <option value="No">No — threat subsided or handled</option>
              <option value="Yes">Yes — threat is still ongoing</option>
            </Select>
          </Field>
          <Field label="Security actions performed" optional>
            <Input value={securityActions} onChange={(e) => setSecurityActions(e.target.value)} placeholder="e.g. Area patrolled, owner notified" />
          </Field>
          <Field label="Community advisory status" optional>
            <Input value={advisoryStatus} onChange={(e) => setAdvisoryStatus(e.target.value)} placeholder="e.g. Published & archived / Not needed" />
          </Field>
          <Field label="External authority response" optional>
            <Input value={referralOutcome} onChange={(e) => setReferralOutcome(e.target.value)} placeholder="e.g. Barangay / Animal Control responded" />
          </Field>
        </div>
      ) : null}

      <Field
        label="Resolution / progress notes"
        required={status === 'not_applicable' || (resolving && !isInjured && !isSafety)}
        error={errors.notes}
      >
        <Textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Document assessment findings, actions taken, or why this concern is resolved or still ongoing."
        />
      </Field>

      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
