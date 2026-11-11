import { useState, type FormEvent } from 'react';
import { Dialog } from '../components/Dialog';
import { Button } from '../components/Button';
import { Checkbox, Field, FieldGroup, Input, OptionGroup, Textarea } from '../components/form';
import { Callout, FormError, Kv } from '../components/layout';
import { useToast } from '../components/toast';
import { useAdminData } from '../data/context';
import { fmtDateTime, fromLocalInput, isValidLocalInput, toLocalInput } from '../../preview/lib/format';
import { useSubmit } from '../lib/useSubmit';
import { FormFooter, type CaseDialogProps } from './BasicDialogs';

type Source = 'phone' | 'in_person';

/**
 * Record owner confirmation: the owner told the Leader (by phone, or in person) that the pet is home. The Leader never declares a recovery alone:
 * this records what the OWNER said, when they said it and who recorded it, and then does exactly what the owner's own "My pet is home" does (the
 * notice is resolved, the case is closed, the pet is Active again). Nothing a neighbour reports, and no closure, ever records a recovery.
 */
export function RecordRecoveryDialog({ c, onClose }: CaseDialogProps) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [source, setSource] = useState<Source | ''>('');
  const [at, setAt] = useState(() => toLocalInput(new Date()));
  const [note, setNote] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const alertId = c.lostPet?.alertId ?? null;
  const pet = c.registeredPet?.current?.name;
  const owner = c.registeredPet?.owner?.name ?? c.reporter.name;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!source) next.source = 'Choose how the owner told you.';
    if (!isValidLocalInput(at)) next.at = 'Choose when the owner told you.';
    else if (new Date(at).getTime() > Date.now() + 60_000) next.at = 'That time is in the future.';
    if (!confirmed) next.confirmed = 'Confirm that the owner told you the pet is home.';
    setErrors(next);
    if (Object.keys(next).length || !source || !alertId) return;
    const ok = await run(() => dispatch({ type: 'lost/recordRecovery', id: c.id, alertId, source, confirmedAt: fromLocalInput(at), note: note.trim() || undefined }));
    if (ok) { toast.success(`${pet ?? 'The pet'} is home: ${c.id} closed`); onClose(); }
  };

  return (
    <Dialog
      size="lg" title="Record owner confirmation" description="The owner told you the pet is home. This records what they said." onClose={onClose} dirty={source !== '' || note !== '' || confirmed} onSubmit={submit}
      footer={({ requestClose }) => alertId === null ? <Button onClick={requestClose}>Close</Button> : <FormFooter pending={pending} label="Record and close the case" requestClose={requestClose} />}
    >
      {alertId === null ? <Callout tone="amber" title="This older report has no missing-pet notice.">Create its notice from the case first, then record the owner’s confirmation here. A generic case closure does not record a recovery.</Callout> : null}
      <Callout tone="info" title="Only the owner can say the pet is home.">If you have not spoken with the owner, do not record this. A sighting, a lead or a call to the Barangay does not mean the pet is home.</Callout>
      <Kv rows={[['Pet', pet ?? c.title], ['Owner who confirmed', owner]]} />
      <FieldGroup label="How the owner told you" required error={errors.source}>
        <OptionGroup
          name="source" label="How the owner told you" value={source} onChange={setSource}
          options={[{ value: 'phone', label: 'By phone', description: 'They called you, or you called them.' }, { value: 'in_person', label: 'In person', description: 'The owner explicitly told you face to face that the pet is safely home.' }]}
        />
      </FieldGroup>
      <Field label="When the owner told you" required error={errors.at} hint="The time of the conversation, not the time you are saving this."><Input type="datetime-local" value={at} max={toLocalInput(new Date())} onChange={(e) => setAt(e.target.value)} /></Field>
      <Field label="Notes" optional hint="Anything worth keeping, such as where and how the pet was found. Do not write phone numbers or addresses."><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} /></Field>
      <Checkbox label={`${owner} told me that ${pet ?? 'the pet'} is home.`} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
      {errors.confirmed ? <p className="sa-error" role="alert">{errors.confirmed}</p> : null}
      <Callout>Recording this resolves the notice, closes the case as “Missing pet recovered”, puts the pet back to Active in the registry and tells the owner and the neighbours who helped. It cannot be undone from here.</Callout>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

type Review = 'unverified' | 'verified' | 'dismissed';

/** Review one sighting or possible recovery: it checks out, it is not a match, or it has not been looked at. Who reviewed it and when are kept. */
export function ReviewSightingDialog({ c, sightingId, onClose }: CaseDialogProps & { sightingId: string }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const s = c.lostPet?.sightings.find((x) => x.id === sightingId);
  const [status, setStatus] = useState<Review>(s && s.review !== 'unverified' ? s.review : 'verified');
  const [note, setNote] = useState(s?.reviewNote ?? '');
  if (!s) return null;
  const lead = s.kind === 'secured';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => dispatch({ type: 'lost/reviewSighting', id: c.id, sightingId, status, note: note.trim() || undefined }))) { toast.success('Review saved'); onClose(); }
  };

  return (
    <Dialog size="md" title={lead ? 'Review this possible recovery' : 'Review this sighting'} description={`${fmtDateTime(s.seenAt)} · ${s.place}`} onClose={onClose} dirty={note !== (s.reviewNote ?? '') || status !== s.review} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Save review" requestClose={requestClose} />}>
      <p className="sa-prose">{s.description || 'No description was given.'}</p>
      <FieldGroup label="What did you find?">
        <OptionGroup
          name="review" label="Review" value={status} onChange={setStatus}
          options={[
            { value: 'verified', label: lead ? 'It looks like the missing pet' : 'It checks out', description: 'For example the guard saw it too, or the photo matches.' },
            { value: 'dismissed', label: 'It does not match', description: 'It is a different animal, or the report is not reliable.' },
            { value: 'unverified', label: 'Not reviewed yet', description: 'Put it back to the unreviewed state.' },
          ]}
        />
      </FieldGroup>
      <Field label="Note" optional hint="Shown to the owner next to the report. Do not write phone numbers or addresses."><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} /></Field>
      {lead ? <Callout>Reviewing a possible recovery does not mark the pet as home. Only the owner’s confirmation does.</Callout> : null}
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

/** Mark a request for help as finished. What was done (calls, visits, next steps) is in the case's contact log and follow-ups. */
export function ResolveConversationDialog({ c, conversationId, onClose }: CaseDialogProps & { conversationId: string }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [note, setNote] = useState('');
  const conversation = c.lostPet?.conversations.find((x) => x.id === conversationId);
  if (!conversation) return null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => dispatch({ type: 'lost/resolveConversation', id: c.id, conversationId, note: note.trim() || undefined }))) { toast.success('Marked as finished'); onClose(); }
  };

  return (
    <Dialog size="sm" title="Mark this request as finished" description={`${conversation.owner?.name ?? 'The owner'} and ${conversation.finder?.name ?? 'the neighbour'}`} onClose={onClose} dirty={note !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Mark as finished" requestClose={requestClose} />}>
      <Field label="What was the result?" optional hint="A short note. The calls and visits themselves belong in “Record owner coordination”."><Textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={1000} placeholder="Both were reached; the owner is collecting the pet today." /></Field>
      <Callout>This does not mark the pet as home. Only the owner’s confirmation does, with “Record owner confirmation”.</Callout>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
