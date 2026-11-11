import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { PartyPopper } from 'lucide-react';
import { FieldGroup, Field, OptionList, Textarea } from '../../components/form';
import { Screen } from '../../components/Screen';
import { ConfirmSheet } from '../../components/Sheet';
import { Button, Callout, EmptyState, LinkButton, NotFoundState } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { reportById } from '../../data/selectors';

const HOW = [
  { value: 'home', label: 'Came home on their own' },
  { value: 'neighbour', label: 'A neighbour brought them back' },
  { value: 'subdivision', label: 'The subdivision helped bring them home' },
  { value: 'other', label: 'Something else' },
] as const;
type How = (typeof HOW)[number]['value'];

/** R21 — Confirm that a lost pet is back. Closes the report and takes the notice out of Community. */
export default function RecoveryPage() {
  const { state, dispatch } = useResidentData();
  const report = reportById(state, useParams().reportId);
  const [how, setHow] = useState<How | ''>('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <Screen title="Pet recovered" back="/reports">
        <EmptyState tone="sage" icon={PartyPopper} title={`${report?.petName ?? 'Your pet'} is home`} action={<LinkButton variant="primary" to={residentPath(`/reports/${report?.id}`)}>View the closed report</LinkButton>}>
          The notice was removed from Community and the report is closed. Thank you for letting us know, and to everyone who helped look.
        </EmptyState>
        <LinkButton block to={residentPath('/home')}>Back to Home</LinkButton>
      </Screen>
    );
  }
  if (!report || report.kind !== 'lost') return <Screen title="My pet is home" back="/reports"><NotFoundState what="lost-pet report" to="/reports" label="Go to My reports" /></Screen>;
  if (report.status === 'closed') {
    return (
      <Screen title="My pet is home" back={`/reports/${report.id}`}>
        <Callout tone="info" title="This report is already closed.">{report.outcome?.summary ?? 'No further action is needed.'}</Callout>
        <LinkButton variant="primary" block to={residentPath(`/reports/${report.id}`)}>View the report</LinkButton>
      </Screen>
    );
  }

  const name = report.petName ?? 'your pet';
  const ask = () => setConfirming(true);
  const label = HOW.find((h) => h.value === how)?.label ?? '';

  return (
    <Screen
      title="My pet is home"
      subtitle={report.id}
      back={`/reports/${report.id}`}
      footer={<Button variant="primary" block onClick={ask}>Mark as recovered</Button>}
    >
      <p className="rs-sub">Confirm that {name} is safely back with you. We will close the report, remove the notice from Community and restore your pet’s Active registry state.</p>
      <div className="rs-stack">
        <FieldGroup label={`How did ${name} come home?`} hint="Optional. Your confirmation is what closes the case.">
          <OptionList name="How they came home" value={how} onChange={setHow} options={HOW.map((h) => ({ value: h.value, label: h.label }))} />
        </FieldGroup>
        <Field label="Anything you want to add" optional>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={3} placeholder="Thank you to everyone who helped." />
        </Field>
      </div>
      {confirming ? (
        <ConfirmSheet
          title={`Mark ${name} as recovered?`}
          message="Confirm that your pet is safely back with you. The notice will be removed from Community and this report will be closed. You can’t undo this from the app."
          confirmLabel="Yes, mark as recovered"
          onConfirm={async () => {
            await dispatch({ type: 'lost/recover', reportId: report.id, note: [label, note.trim()].filter(Boolean).join('. ') });
            setDone(true);
          }}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </Screen>
  );
}
