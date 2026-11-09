import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Field, Select, Textarea } from '../components/form';
import { Callout, FormError } from '../components/layout';
import { useToast } from '../components/toast';
import { useAdminData } from '../data/context';
import type { Notice } from '../data/types';
import { useSubmit } from '../lib/useSubmit';

/** Publish notice: a deliberate confirmation, because it makes the text visible to every resident. */
export function PublishNoticeDialog({ notice, subdivision, update, onConfirmed, onClose }: {
  notice: Notice; subdivision: string; /** true when the notice is already published and only changes are being saved */ update?: boolean; onConfirmed: () => void; onClose: () => void;
}) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();

  const publish = async () => {
    if (await run(() => dispatch({ type: 'notice/save', notice, publish: true }))) {
      toast.success(update ? 'Notice updated' : 'Notice published');
      onConfirmed();
    }
  };

  return (
    <Dialog
      size="sm"
      title={update ? 'Save changes to this notice?' : 'Publish this notice?'}
      description={`It will be visible to all residents of ${subdivision}.`}
      onClose={onClose}
      footer={(
        <>
          <Button onClick={onClose} disabled={pending}>Back to editing</Button>
          <Button variant="primary" loading={pending} onClick={() => { void publish(); }}>{update ? 'Save changes' : 'Publish notice'}</Button>
        </>
      )}
    >
      <p className="sa-text-2">“{notice.title}”</p>
      <Callout>Only the text, photos and general location you entered are published. {notice.caseId ? 'The linked case, its history and the reporter’s details stay private.' : 'No case or reporter details are included.'}</Callout>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}

const ARCHIVE_REASONS = ['Pet recovered or owner found', 'No longer relevant', 'Published in error', 'Replaced by a newer notice', 'Other'];

/** Archive a published notice. It disappears from residents’ view but stays on record, with the reason. */
export function ArchiveNoticeDialog({ notice, onClose, onDone }: { notice: Notice; onClose: () => void; /** called only after the notice was archived */ onDone?: () => void }) {
  const { dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [reason, setReason] = useState(ARCHIVE_REASONS[0]);
  const [detail, setDetail] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => dispatch({ type: 'notice/archive', id: notice.id, reason: detail.trim() ? `${reason}. ${detail.trim()}` : reason }))) { toast.success('Notice archived'); onDone?.(); onClose(); }
  };

  return (
    <Dialog size="sm" title="Archive this notice?" description="Residents will no longer see it. It stays on record." onClose={onClose} dirty={detail !== ''} onSubmit={submit}
      footer={({ requestClose }) => (<><Button onClick={requestClose} disabled={pending}>Cancel</Button><Button type="submit" variant="primary" loading={pending}>Archive notice</Button></>)}>
      <p className="sa-text-2">“{notice.title}”</p>
      <Field label="Reason"><Select value={reason} onChange={(e) => setReason(e.target.value)}>{ARCHIVE_REASONS.map((r) => <option key={r}>{r}</option>)}</Select></Field>
      <Field label="Details" optional><Textarea rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} /></Field>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
