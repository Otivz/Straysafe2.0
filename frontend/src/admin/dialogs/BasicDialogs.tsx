import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, FieldGroup, OptionGroup, Textarea } from '../components/form';
import { EVIDENCE_ICON } from '../components/icons';
import { Callout, FormError, Kv } from '../components/layout';
import { useToast } from '../components/toast';
import { PRIORITIES, PRIORITY_IDS, STATUSES } from '../data/constants';
import { useAdminData } from '../data/context';
import { allowedStatusMoves } from '../data/selectors';
import type { Case, CaseStatus, Priority } from '../data/types';
import { fmtDateTime } from '../../preview/lib/format';
import { useSubmit } from '../lib/useSubmit';

export interface CaseDialogProps { c: Case; onClose: () => void }

/** Cancel + submit row shared by the simple forms. Cancel respects the discard-changes guard. */
export const FormFooter = ({ pending, label, requestClose, variant = 'primary' }: { pending: boolean; label: string; requestClose: () => void; variant?: 'primary' | 'danger-solid' }) => (
  <>
    <Button onClick={requestClose} disabled={pending}>Cancel</Button>
    <Button type="submit" variant={variant} loading={pending}>{label}</Button>
  </>
);

/** Change status — moves between Under review and In progress. Closing always goes through the closure dialog. */
export function StatusDialog({ c, onClose }: CaseDialogProps) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const moves = allowedStatusMoves(c);
  const [to, setTo] = useState<CaseStatus | ''>(moves[0] ?? '');
  const [note, setNote] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!to) return;
    if (await run(() => dispatch({ type: 'case/changeStatus', id: c.id, to, note: note.trim() || undefined }))) {
      toast.success(`Status changed to ${STATUSES[to].label}`);
      onClose();
    }
  };

  return (
    <Dialog title="Change status" description={`${c.id} is currently ${STATUSES[c.status].label.toLowerCase()}.`} onClose={onClose} dirty={note !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Change status" requestClose={requestClose} />}>
      <FieldGroup label="New status">
        <OptionGroup name="status" label="New status" value={to} onChange={setTo} options={moves.map((s) => ({ value: s, label: STATUSES[s].label, description: STATUSES[s].description }))} />
      </FieldGroup>
      <Field label="Note" optional hint="Shown in the case history."><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} /></Field>
      <Callout>To close a case, use <strong>Close case</strong>. A closed case needs a documented outcome.</Callout>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

/** Change priority. Urgent puts the case at the top of the dashboard and means safety coordination comes first. */
export function PriorityDialog({ c, onClose }: CaseDialogProps) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [to, setTo] = useState<Priority>(c.priority);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ to?: string; reason?: string }>({});

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (to === c.priority) next.to = 'Choose a different priority.';
    if (!reason.trim()) next.reason = 'Add a short reason so the history makes sense.';
    setErrors(next);
    if (Object.keys(next).length) return;
    if (await run(() => dispatch({ type: 'case/changePriority', id: c.id, to, reason: reason.trim() }))) {
      toast.success(`Priority set to ${PRIORITIES[to].label}`);
      onClose();
    }
  };

  return (
    <Dialog title="Change priority" description={`${c.id} is currently ${PRIORITIES[c.priority].label.toLowerCase()} priority.`} onClose={onClose} dirty={to !== c.priority || reason !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Change priority" requestClose={requestClose} />}>
      <FieldGroup label="Priority" error={errors.to}>
        <OptionGroup name="priority" label="Priority" value={to} onChange={setTo} options={PRIORITY_IDS.map((p) => ({ value: p, label: PRIORITIES[p].label, description: PRIORITIES[p].description }))} />
      </FieldGroup>
      {to === 'urgent' ? <Callout tone="red" title="Urgent means safety first.">Start coordinating now. Routine ownership checks, registry matching and warning periods should not delay the response.</Callout> : null}
      <Field label="Reason" required error={errors.reason}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} /></Field>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

/** Add internal note — admin-only; never shown to residents. */
export function NoteDialog({ c, onClose }: CaseDialogProps) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 3) { setErr('Write a note before saving.'); return; }
    if (await run(() => dispatch({ type: 'case/addNote', id: c.id, text: text.trim() }))) { toast.success('Note added to the case'); onClose(); }
  };

  return (
    <Dialog title="Add internal note" description="Visible to administrators only. It is never shown to residents or published." onClose={onClose} dirty={text !== ''} onSubmit={submit} footer={({ requestClose }) => <FormFooter pending={pending} label="Add note" requestClose={requestClose} />}>
      <Field label="Note" required error={err}><Textarea autoFocus value={text} onChange={(e) => { setText(e.target.value); setErr(undefined); }} rows={5} placeholder="What should the next person looking at this case know?" /></Field>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

/** Evidence viewer: the stored file, or a note when the item has no file to show. */
export function EvidenceDialog({ c, evidenceId, onClose }: CaseDialogProps & { evidenceId: string }) {
  const item = c.evidence.find((e) => e.id === evidenceId);
  if (!item) return null;
  const Icon = EVIDENCE_ICON[item.kind];
  const reviewed = c.assessment.evidenceReviewed.includes(item.id);
  return (
    <Dialog title={item.label} description={`${item.kind === 'cctv' ? 'CCTV' : item.kind[0].toUpperCase() + item.kind.slice(1)} · added ${fmtDateTime(item.capturedAt)}`} onClose={onClose} footer={<Button onClick={onClose}>Close</Button>}>
      {item.url && item.kind === 'photo' ? <img src={item.url} alt={item.label} className="w-full rounded-lg" style={{ maxHeight: '60vh', objectFit: 'contain', background: 'var(--sa-sand)' }} />
        : item.url && item.kind === 'video' ? <video src={item.url} controls className="w-full rounded-lg" style={{ maxHeight: '60vh' }} />
          : item.url ? <p className="sa-small"><a href={item.url} target="_blank" rel="noopener noreferrer" className="font-semibold">Open the file</a></p>
            : <div className="sa-tile__art rounded-lg" style={{ aspectRatio: '16 / 10' }}><span className="flex flex-col items-center gap-2"><Icon size={32} aria-hidden="true" /><span className="sa-small">No preview available</span></span></div>}
      <Kv rows={[
        ['Source', { reporter: 'Submitted by the reporter', admin: 'Added by an administrator', resident: 'Another resident', external: 'External authority' }[item.source]],
        ['Review', reviewed ? 'Marked as reviewed in the assessment' : 'Not yet reviewed'],
        ...(item.note ? [['Note', item.note] as [string, string]] : []),
      ]} />
    </Dialog>
  );
}
