import { useState, type FormEvent } from 'react';
import { Dialog } from '../components/Dialog';
import { Field, FieldGroup, Input, OptionGroup, Select, Textarea } from '../components/form';
import { Callout, FormError, Kv } from '../components/layout';
import { useToast } from '../components/toast';
import { CATEGORIES, ORGANIZATIONS, REFERRAL_STATUS, REFERRAL_STATUS_IDS } from '../data/constants';
import { useAdminData } from '../data/context';
import type { CategoryId, ContactMethod, ReferralStatus } from '../data/types';
import { fmtDateTime, fromLocalInput, isValidLocalInput, toLocalInput } from '../../preview/lib/format';
import { useSubmit } from '../lib/useSubmit';
import { FormFooter, type CaseDialogProps } from './BasicDialogs';

const CHANNELS = ['Phone call', 'Message', 'In person', 'Email', 'Written letter'];
/** How a channel the Leader names is stored as a contact method. */
const METHOD_OF: Record<string, ContactMethod> = { 'Phone call': 'phone', Message: 'message', 'In person': 'in_person', Email: 'message', 'Written letter': 'letter' };

const SUGGESTED_REASON: Partial<Record<CategoryId, string>> = {
  lost_pet: 'Asking the Barangay for help looking for a missing pet.',
  safety: 'Help locating and containing an animal that poses a risk to residents.',
  injured: 'Injured animal needs veterinary or rehabilitation care.',
  found_animal: 'Found animal with an unknown owner. Asking whether a lost-animal report exists.',
  nuisance: 'Repeated nuisance that needs the authority’s involvement.',
};

/**
 * Create external referral (A10). The subdivision keeps the case; the authority is an external participant. A referral can be written down before
 * anyone is contacted: it then reads "Not contacted yet" and counts as contact only when the Leader records the attempt. Saving a referral is never
 * proof that the organisation was reached.
 */
export function ReferralDialog({ c, onClose }: CaseDialogProps) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const lost = c.category === 'lost_pet';
  const [orgId, setOrgId] = useState<string>(ORGANIZATIONS[0].id);
  const [otherName, setOtherName] = useState('');
  const [reason, setReason] = useState(SUGGESTED_REASON[c.category] ?? '');
  const [contacted, setContacted] = useState<'yes' | 'no'>('yes');
  const [at, setAt] = useState(() => toLocalInput(new Date()));
  const [person, setPerson] = useState('');
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const reached = contacted === 'yes';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (orgId === 'other' && !otherName.trim()) next.org = 'Enter the organization’s name.';
    if (reason.trim().length < 10) next.reason = lost ? 'Say what help you are asking for.' : 'Say why you are referring this case.';
    if (reached && !isValidLocalInput(at)) next.at = 'Choose when you contacted them.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const orgName = orgId === 'other' ? otherName.trim() : ORGANIZATIONS.find((o) => o.id === orgId)!.name;
    const ok = await run(() => dispatch({
      type: 'case/createReferral', id: c.id, orgId, orgName, reason: reason.trim(), referredAt: reached ? fromLocalInput(at) : new Date().toISOString(),
      contactPerson: reached ? person.trim() || 'Not recorded' : 'Not recorded', contactChannel: reached ? channel : '', notes: notes.trim(), contacted: reached,
    }));
    if (ok) { toast.success(reached ? `Referral to ${orgName} recorded` : `Help from ${orgName} written down. Nobody has been contacted yet`); onClose(); }
  };

  return (
    <Dialog
      size="lg" title={lost ? 'Ask for help' : 'Create external referral'}
      description={lost ? 'Write down who can help look for the pet, and whether you have already contacted them.' : 'Record who you contacted and why. The case stays with the subdivision.'}
      onClose={onClose} dirty={reason !== (SUGGESTED_REASON[c.category] ?? '') || notes !== '' || person !== '' || !reached} onSubmit={submit}
      footer={({ requestClose }) => <FormFooter pending={pending} label={reached ? 'Create referral' : 'Write it down'} requestClose={requestClose} />}
    >
      <Kv rows={[['Related case', <span><span className="sa-ref">{c.id}</span> · {c.title}</span>], ['Category', CATEGORIES[c.category].label]]} />
      <Field label="Organization" required error={errors.org}>
        <Select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
          {ORGANIZATIONS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          <option value="other">Another organization…</option>
        </Select>
      </Field>
      {orgId === 'other' ? <Field label="Organization name" required error={errors.org}><Input value={otherName} onChange={(e) => setOtherName(e.target.value)} /></Field> : null}
      <Field label={lost ? 'What help you are asking for' : 'Reason for referral'} required error={errors.reason}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
      <FieldGroup label="Have you already contacted them?">
        <OptionGroup
          name="contacted" label="Have you already contacted them?" value={contacted} onChange={setContacted}
          options={[
            { value: 'yes', label: 'Yes, I have contacted them', description: 'Record when and how, and who you spoke with.' },
            { value: 'no', label: 'Not yet', description: 'Only write down that help is needed. It stays on your list as “Not contacted yet” until you record the contact.' },
          ]}
        />
      </FieldGroup>
      {reached ? (
        <>
          <div className="sa-grid2">
            <Field label="Referral date and time" required error={errors.at}><Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></Field>
            <Field label="How you reached them"><Select value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNELS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
          </div>
          <Field label="Contact person" optional hint="Name or role, and a number or address if you have one."><Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="e.g. Duty officer, 0917 000 0000" /></Field>
        </>
      ) : null}
      <Field label={reached ? 'Communication notes' : 'Notes'} optional><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder={reached ? 'What did you tell them, and what did they say?' : 'Anything to remember when you contact them.'} /></Field>
      <Callout>{reached ? <>A referral does <strong>not</strong> resolve or close the case. You keep monitoring it until a documented outcome is reached.</> : <>Writing this down does <strong>not</strong> contact anyone, and it does not close the case. It counts as contact only when you record the attempt.</>}</Callout>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

/**
 * Record coordination update (A10): status, what they said, the external outcome and what the subdivision still has to do. For a referral that was
 * only written down it is the CONTACT ATTEMPT itself: how, with whom, and what came of it (including "tried, no answer").
 */
export function CoordinationDialog({ c, referralId, contact: asContact, onClose }: CaseDialogProps & { referralId: string; contact?: boolean }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const r = c.referrals.find((x) => x.id === referralId);
  const contact = asContact === true || r?.status === 'to_contact';
  const [status, setStatus] = useState<ReferralStatus>(r && r.status !== 'to_contact' ? r.status : 'sent');
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [person, setPerson] = useState('');
  const [detail, setDetail] = useState('');
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
    if (contact && person.trim().length < 2) next.person = 'Say who you spoke with, or who you tried to reach.';
    if (note.trim().length < 3) next.note = contact ? 'Record what happened: what they said, or that nobody answered.' : 'Record what they told you.';
    if (finished && outcome.trim().length < 5) next.outcome = 'Describe the outcome on their side.';
    if (followAt && !isValidLocalInput(followAt)) next.followAt = 'Choose a valid date and time.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const ok = await run(() => dispatch({
      type: 'case/updateReferral', id: c.id, referralId, status, note: note.trim(),
      externalOutcome: finished ? outcome.trim() : undefined, remainingFollowUp: remaining.trim() || undefined, followUpAt: followAt ? fromLocalInput(followAt) : undefined,
      ...(contact ? { contact: { method: METHOD_OF[channel] ?? 'phone', person: person.trim(), detail: detail.trim() } } : {}),
    }));
    if (ok) { toast.success(contact ? 'Contact attempt recorded' : 'Coordination update recorded'); onClose(); }
  };

  return (
    <Dialog
      size="lg" title={contact ? 'Record contact attempt' : 'Record coordination update'}
      description={contact ? `${r.orgName} · written down ${fmtDateTime(r.referredAt)}, not contacted yet` : `${r.orgName} · referred ${fmtDateTime(r.referredAt)}`}
      onClose={onClose} dirty={note !== '' || followAt !== '' || person !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label={contact ? 'Record attempt' : 'Record update'} requestClose={requestClose} />}
    >
      {contact ? (
        <>
          <div className="sa-grid2">
            <Field label="How you tried to reach them"><Select value={channel} onChange={(e) => setChannel(e.target.value)}>{CHANNELS.map((x) => <option key={x}>{x}</option>)}</Select></Field>
            <Field label="Who you spoke with" required error={errors.person}><Input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="e.g. Duty officer" /></Field>
          </div>
          <Field label="Number or address" optional hint="So the next person knows how to reach them."><Input value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
        </>
      ) : null}
      <Field label={contact ? 'What came of it' : 'Referral status'}>
        <Select value={status} onChange={(e) => setStatus(e.target.value as ReferralStatus)}>
          {REFERRAL_STATUS_IDS.filter((s) => s !== 'to_contact').map((s) => <option key={s} value={s}>{contact && s === 'sent' ? 'Reached, waiting to hear back' : contact && s === 'no_response' ? 'Tried, no answer' : REFERRAL_STATUS[s].label}</option>)}
        </Select>
      </Field>
      <Field label={contact ? 'What happened' : 'What they told you'} required error={errors.note}><Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Field>
      {finished ? <Field label="External outcome" required error={errors.outcome} hint="What the organization reports it did or decided."><Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={2} /></Field> : null}
      <Field label={contact ? 'Next action' : 'Remaining subdivision follow-up'} optional hint="What the subdivision still needs to do, regardless of the referral.">
        <Textarea value={remaining} onChange={(e) => setRemaining(e.target.value)} rows={2} />
      </Field>
      <Field label="Follow-up date" optional error={errors.followAt} hint="Creates a follow-up so this does not get forgotten."><Input type="datetime-local" value={followAt} onChange={(e) => setFollowAt(e.target.value)} /></Field>
      {status === 'completed' ? <Callout tone="sage" title="External work is complete.">The case stays open. Record anything the subdivision still has to do, or close the case with a documented outcome.</Callout> : null}
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
