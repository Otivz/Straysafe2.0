import { useState, type FormEvent } from 'react';
import { Dialog } from '../components/Dialog';
import { Field, Input, Select, Textarea } from '../components/form';
import { Callout, FormError, Kv } from '../components/layout';
import { useToast } from '../components/toast';
import { CATEGORIES, ORGANIZATIONS, REFERRAL_STATUS, REFERRAL_STATUS_IDS } from '../data/constants';
import { useAdminData } from '../data/context';
import type { CategoryId, ReferralStatus } from '../data/types';
import { fmtDateTime, fromLocalInput, isValidLocalInput, toLocalInput } from '../../preview/lib/format';
import { useSubmit } from '../lib/useSubmit';
import { FormFooter, type CaseDialogProps } from './BasicDialogs';

const CHANNELS = ['Phone call', 'Message', 'In person', 'Email', 'Written letter'];

const SUGGESTED_REASON: Partial<Record<CategoryId, string>> = {
  safety: 'Help locating and containing an animal that poses a risk to residents.',
  injured: 'Injured animal needs veterinary or rehabilitation care.',
  found_animal: 'Found animal with an unknown owner. Asking whether a lost-animal report exists.',
  nuisance: 'Repeated nuisance that needs the authority’s involvement.',
};

/** Create external referral (A10). The subdivision keeps the case; the authority is an external participant. */
export function ReferralDialog({ c, onClose }: CaseDialogProps) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [orgId, setOrgId] = useState<string>(ORGANIZATIONS[0].id);
  const [otherName, setOtherName] = useState('');
  const [reason, setReason] = useState(SUGGESTED_REASON[c.category] ?? '');
  const [at, setAt] = useState(() => toLocalInput(new Date()));
  const [person, setPerson] = useState('');
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (orgId === 'other' && !otherName.trim()) next.org = 'Enter the organization’s name.';
    if (reason.trim().length < 10) next.reason = 'Say why you are referring this case.';
    if (!isValidLocalInput(at)) next.at = 'Choose when you contacted them.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const orgName = orgId === 'other' ? otherName.trim() : ORGANIZATIONS.find((o) => o.id === orgId)!.name;
    const ok = await run(() => dispatch({ type: 'case/createReferral', id: c.id, orgId, orgName, reason: reason.trim(), referredAt: fromLocalInput(at), contactPerson: person.trim() || 'Not recorded', contactChannel: channel, notes: notes.trim() }));
    if (ok) { toast.success(`Referral to ${orgName} recorded`); onClose(); }
  };

  return (
    <Dialog size="lg" title="Create external referral" description="Record who you contacted and why. The case stays with the subdivision." onClose={onClose} dirty={reason !== (SUGGESTED_REASON[c.category] ?? '') || notes !== '' || person !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Create referral" requestClose={requestClose} />}>
      <Kv rows={[['Related case', <span><span className="sa-ref">{c.id}</span> · {c.title}</span>], ['Category', CATEGORIES[c.category].label]]} />
      <Field label="Organization" required error={errors.org}>
        <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {ORGANIZATIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value="other">Another organization…</option>
        </Select>
      </Field>
      {orgId === 'other' ? <Field label="Organization name" required error={errors.org}><Input value={otherName} onChange={(e) => setOtherName(e.target.value)} /></Field> : null}
      <Field label="Reason for referral" required error={errors.reason}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
      <div className="sa-grid2">
        <Field label="Referral date and time" required error={errors.at}><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
        <Field label="How you reached them"><Select value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNELS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
      </div>
      <Field label="Contact person" optional hint="Name or role, and a number or address if you have one."><Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="e.g. Duty officer, 0917 000 0000" /></Field>
      <Field label="Communication notes" optional><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What did you tell them, and what did they say?" /></Field>
      <Callout>A referral does <strong>not</strong> resolve or close the case. You keep monitoring it until a documented outcome is reached.</Callout>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

/** Record coordination update (A10): status, what they said, the external outcome and what the subdivision still has to do. */
export function CoordinationDialog({ c, referralId, onClose }: CaseDialogProps & { referralId: string }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const r = c.referrals.find((x) => x.id === referralId);
  const [status, setStatus] = useState<ReferralStatus>(r?.status ?? 'sent');
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState(r?.externalOutcome ?? '');
  const [remaining, setRemaining] = useState(r?.remainingFollowUp ?? '');
  const [followAt, setFollowAt] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!r) return null;
  const finished = status === 'completed' || status === 'declined';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (note.trim().length < 3) next.note = 'Record what they told you.';
    if (finished && outcome.trim().length < 5) next.outcome = 'Describe the outcome on their side.';
    if (followAt && !isValidLocalInput(followAt)) next.followAt = 'Choose a valid date and time.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const ok = await run(() => dispatch({
      type: 'case/updateReferral', id: c.id, referralId, status, note: note.trim(),
      externalOutcome: finished ? outcome.trim() : undefined, remainingFollowUp: remaining.trim() || undefined, followUpAt: followAt ? fromLocalInput(followAt) : undefined,
    }));
    if (ok) { toast.success('Coordination update recorded'); onClose(); }
  };

  return (
    <Dialog size="lg" title="Record coordination update" description={`${r.orgName} · referred ${fmtDateTime(r.referredAt)}`} onClose={onClose} dirty={note !== '' || followAt !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Record update" requestClose={requestClose} />}>
      <Field label="Referral status">
        <Select value={status} onChange={(e) => setStatus(e.target.value as ReferralStatus)}>{REFERRAL_STATUS_IDS.map((s) => <option key={s} value={s}>{REFERRAL_STATUS[s].label}</option>)}</Select>
      </Field>
      <Field label="What they told you" required error={errors.note}><Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Field>
      {finished ? <Field label="External outcome" required error={errors.outcome} hint="What the organization reports it did or decided."><Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} /></Field> : null}
      <Field label="Remaining subdivision follow-up" optional hint="What the subdivision still needs to do, regardless of the referral.">
        <Textarea value={remaining} onChange={(e) => setRemaining(e.target.value)} rows={2} />
      </Field>
      <Field label="Follow-up date" optional error={errors.followAt} hint="Creates a follow-up so this does not get forgotten."><Input type="datetime-local" value={followAt} onChange={(e) => setFollowAt(e.target.value)} /></Field>
      {status === 'completed' ? <Callout tone="sage" title="External work is complete.">The case stays open. Record anything the subdivision still has to do, or close the case with a documented outcome.</Callout> : null}
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
