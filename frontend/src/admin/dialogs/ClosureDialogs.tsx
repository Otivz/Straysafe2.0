import { useState, type FormEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Checkbox, Field, FieldGroup, OptionGroup, Select, Textarea } from '../components/form';
import { Callout, FormError, Kv } from '../components/layout';
import { useToast } from '../components/toast';
import { CATEGORIES, DISPOSITIONS, DISPOSITION_IDS, OUTCOME_GROUPS, PRIORITIES, VERIFICATION } from '../data/constants';
import { useAdminData } from '../data/context';
import { dispositionAvailability, openItems } from '../data/selectors';
import type { DispositionId, OutcomeGroup } from '../data/types';
import { daysSince, fmtDate, fmtDateTime, plural } from '../../preview/lib/format';
import { useSubmit } from '../lib/useSubmit';
import { FormFooter, type CaseDialogProps } from './BasicDialogs';

const ACTION_KINDS = new Set(['follow_up', 'owner_contact', 'warning', 'compliance', 'referral', 'referral_update', 'notice', 'link']);
const FOLLOW_UP_CHOICES = [['', 'No further follow-up needed'], ['3', 'Check again in 3 days'], ['7', 'Check again in 7 days'], ['14', 'Check again in 14 days'], ['30', 'Check again in 30 days']] as const;
const GROUPS: OutcomeGroup[] = ['resolved', 'unresolved', 'invalid'];

/**
 * Close case (A13). Closing needs a documented disposition and reason, and the interface keeps "closed" from being read
 * as "resolved": the outcome group is shown on the form and again on the confirmation step.
 */
export function CloseCaseDialog({ c, onClose }: CaseDialogProps) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [step, setStep] = useState<'form' | 'confirm'>('form');
  const [disposition, setDisposition] = useState<DispositionId | ''>('');
  const [reason, setReason] = useState('');
  const [followDays, setFollowDays] = useState('');
  const [ack, setAck] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const open = openItems(c);
  const openCount = open.followUps.length + open.warnings.length + open.referrals.length + open.claims.length;
  const actions = c.timeline.filter((e) => ACTION_KINDS.has(e.kind)).slice(0, 6);
  const chosen = disposition ? DISPOSITIONS[disposition] : null;

  const next = (e: FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!disposition) found.disposition = 'Choose the outcome that best describes how this case ended.';
    if (reason.trim().length < 15) found.reason = 'Explain how the outcome was reached (at least a sentence).';
    if (openCount > 0 && !ack) found.ack = 'Confirm that you reviewed the open items.';
    setErrors(found);
    if (Object.keys(found).length === 0) setStep('confirm');
  };

  const confirm = async () => {
    if (!disposition) return;
    const due = followDays ? (() => { const d = new Date(); d.setDate(d.getDate() + Number(followDays)); d.setHours(9, 0, 0, 0); return d.toISOString(); })() : null;
    if (await run(() => dispatch({ type: 'case/close', id: c.id, disposition, reason: reason.trim(), followUpCheckAt: due, endOpenItems: openCount > 0 }))) {
      toast.success(`${c.id} closed — ${OUTCOME_GROUPS[DISPOSITIONS[disposition].group].label.toLowerCase()}`);
      onClose();
    }
  };

  if (step === 'confirm' && chosen) {
    const group = OUTCOME_GROUPS[chosen.group];
    return (
      <Dialog title="Confirm case closure" description="Check the outcome before the case is closed." onClose={onClose} dirty
        footer={(
          <>
            <Button icon={ArrowLeft} onClick={() => setStep('form')} disabled={pending}>Back</Button>
            <Button variant="primary" loading={pending} onClick={() => { void confirm(); }}>Confirm and close case</Button>
          </>
        )}
      >
        <Callout tone={chosen.group === 'resolved' ? 'sage' : chosen.group === 'unresolved' ? 'amber' : 'info'} title={`${c.id} will be closed as “${chosen.label}”.`}>
          {chosen.group === 'resolved' ? 'The concern is recorded as resolved.'
            : chosen.group === 'unresolved' ? 'Closed does not mean resolved. This case will be recorded as closed without a confirmed resolution.'
              : 'The case will be recorded as not requiring action.'}
        </Callout>
        <Kv rows={[
          ['Outcome', group.label],
          ['Reason', reason.trim()],
          ['Follow-up check', followDays ? `Check again in ${followDays} days` : 'None needed'],
          ...(openCount > 0 ? [['Open items', `${plural(openCount, 'item')} will be ended: pending follow-ups cancelled, active warnings concluded. Referrals stay on record.`] as [string, string]] : []),
        ]} />
        {error ? <FormError message={error} /> : null}
      </Dialog>
    );
  }

  return (
    <Dialog size="lg" title="Close case" description="Document how this case ended. You can reopen it later if the concern returns." onClose={onClose} dirty={disposition !== '' || reason !== ''} onSubmit={next} footer={({ requestClose }) => <FormFooter pending={false} label="Review and close" requestClose={requestClose} />}>
      <section aria-label="Case summary">
        <p className="sa-label mb-2">Case summary</p>
        <Kv rows={[
          ['Concern', <span><span className="sa-ref">{c.id}</span> · {c.title}</span>],
          ['Category', `${CATEGORIES[c.category].label} · ${PRIORITIES[c.priority].label} priority`],
          ['Open for', `${plural(Math.max(0, daysSince(c.reportedAt, new Date())), 'day')} (reported ${fmtDate(c.reportedAt)})`],
          ['Incident', VERIFICATION[c.assessment.incident].label],
        ]} />
      </section>

      <section aria-label="Actions taken">
        <p className="sa-label mb-2">Actions taken</p>
        {actions.length === 0 ? <p className="sa-small sa-text-3">No actions recorded yet.</p> : (
          <ul className="m-0 list-none p-0 sa-small">{actions.map((a) => <li key={a.id} className="flex gap-3 py-0.5"><span className="sa-text-3 w-28 shrink-0">{fmtDateTime(a.at).split(' · ')[0]}</span><span>{a.title}</span></li>)}</ul>
        )}
      </section>

      {openCount > 0 ? (
        <Callout tone="amber" title={`${plural(openCount, 'open item')} on this case.`}>
          <ul className="my-1 list-disc pl-5">
            {open.followUps.length ? <li>{plural(open.followUps.length, 'pending follow-up')}</li> : null}
            {open.warnings.length ? <li>{plural(open.warnings.length, 'active warning')}</li> : null}
            {open.referrals.length ? <li>{plural(open.referrals.length, 'open referral')} (kept on record)</li> : null}
            {open.claims.length ? <li>{plural(open.claims.length, 'ownership claim')} not yet decided</li> : null}
          </ul>
          <Checkbox label="I reviewed these. Pending follow-ups will be cancelled and active warnings concluded." checked={ack} onChange={(e) => setAck(e.target.checked)} />
          {errors.ack ? <span className="sa-error mt-1" role="alert">{errors.ack}</span> : null}
        </Callout>
      ) : null}

      <FieldGroup label="Final disposition" required error={errors.disposition}>
        <div className="flex flex-col gap-4">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="sa-meta mb-1.5" style={{ fontWeight: 600 }}>{OUTCOME_GROUPS[g].heading}</p>
              <OptionGroup
                name="disposition" label={OUTCOME_GROUPS[g].heading} value={disposition} onChange={setDisposition}
                options={DISPOSITION_IDS.filter((d) => DISPOSITIONS[d].group === g).map((d) => {
                  const a = dispositionAvailability(c, d);
                  return { value: d, label: DISPOSITIONS[d].label, description: a.ok ? DISPOSITIONS[d].description : a.reason, disabled: !a.ok };
                })}
              />
            </div>
          ))}
        </div>
      </FieldGroup>

      <Field label="Closure reason" required error={errors.reason} hint="Stays in the case record. Say what happened and why it is appropriate to close."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
      <Field label="Remaining follow-up check"><Select value={followDays} onChange={(e) => setFollowDays(e.target.value)}>{FOLLOW_UP_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
    </Dialog>
  );
}

/** Reopen a closed case. The closure stays in the history; the case returns to Under review. */
export function ReopenDialog({ c, onClose }: CaseDialogProps) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 10) { setErr('Say why the case is being reopened.'); return; }
    if (await run(() => dispatch({ type: 'case/reopen', id: c.id, reason: reason.trim() }))) { toast.success(`${c.id} reopened`); onClose(); }
  };

  return (
    <Dialog size="sm" title="Reopen case" description={`${c.id} will return to Under review.`} onClose={onClose} dirty={reason !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Reopen case" requestClose={requestClose} />}>
      <Field label="Reason" required error={err}><Textarea autoFocus value={reason} onChange={(e) => { setReason(e.target.value); setErr(undefined); }} rows={3} placeholder="e.g. The dog was seen again on Tuesday evening." /></Field>
      <Callout>The earlier closure stays in the history. Reopening does not delete anything.</Callout>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
