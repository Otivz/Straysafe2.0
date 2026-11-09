import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Field, Textarea } from '../../components/form';
import { MediaPicker } from '../../components/MediaPicker';
import { Screen } from '../../components/Screen';
import { DiscardSheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import { Button, Callout, FormError, LinkButton, NotFoundState } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { reportById } from '../../data/selectors';
import type { Media } from '../../data/types';
import { useFormFocus, useLeaveGuard, useSubmit } from '../../lib/hooks';

const MAX = 500;

/** R16 — Add information to a report that is still open. */
export default function AddUpdatePage() {
  const { state, dispatch } = useResidentData();
  const { reportId } = useParams();
  const report = reportById(state, reportId);
  const navigate = useNavigate();
  const toast = useToast();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [text, setText] = useState('');
  const [media, setMedia] = useState<Media[]>([]);
  const [fieldError, setFieldError] = useState<string>();
  const guard = useLeaveGuard(text.trim() !== '' || media.length > 0, residentPath(`/reports/${reportId}`));

  if (!report) return <Screen title="Add information" back="/reports"><NotFoundState what="report" to="/reports" label="Go to My reports" /></Screen>;
  if (report.status === 'closed') {
    return (
      <Screen title="Add information" back={`/reports/${report.id}`}>
        <Callout tone="info" title="This report is closed.">New information can’t be added to a closed report. If the problem returns, send a new report.</Callout>
        <LinkButton variant="primary" block to={residentPath('/report')}>Report something new</LinkButton>
      </Screen>
    );
  }

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (text.trim().length < 5) { setFieldError('Write a few words about what you want to add.'); invalid(); return; }
    const ok = await run(async () => { await dispatch({ type: 'report/addUpdate', reportId: report.id, text: text.trim(), media }); });
    if (ok) { toast.success('Information added to your report'); navigate(residentPath(`/reports/${report.id}`), { replace: true }); }
  };

  return (
    <Screen
      title="Add information"
      subtitle={report.id}
      onBack={guard.leave}
      footer={(
        <>
          <Button type="submit" form="add-update" variant="primary" block loading={pending}>Send to the subdivision</Button>
          <Button variant="ghost" block onClick={guard.leave} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      <p className="rs-sub">Tell the subdivision anything new about <strong>{report.title}</strong>. An administrator will see it with your report.</p>
      {error ? <FormError message={error} /> : null}
      <form id="add-update" className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <div ref={ref} className="rs-stack">
          <Field label="What would you like to add?" required error={fieldError} hint={<>For example when you saw the animal again, or an answer to a question. <span className="rs-count">{text.length}/{MAX}</span></>}>
            <Textarea value={text} onChange={(e) => { setText(e.target.value); setFieldError(undefined); }} maxLength={MAX} rows={5} />
          </Field>
          <div className="rs-field">
            <span className="rs-label">Photos or video <span className="rs-opt">optional</span></span>
            <MediaPicker value={media} onChange={setMedia} accept="both" max={3} />
          </div>
        </div>
      </form>
      {guard.asking ? <DiscardSheet onDiscard={guard.discard} onKeep={guard.keep} /> : null}
    </Screen>
  );
}
