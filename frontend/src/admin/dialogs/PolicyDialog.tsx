import { useState, type FormEvent } from 'react';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { Checkbox, Field, FieldGroup, Input, OptionGroup, Textarea } from '../components/form';
import { Callout } from '../components/layout';
import { CATEGORIES, CATEGORY_IDS } from '../data/constants';
import type { CategoryId, Policy } from '../data/types';

/** Add or edit a subdivision policy reference. The observation period belongs to the policy; no default is assumed. */
export function PolicyDialog({ policy, onSave, onClose }: { policy?: Policy; onSave: (p: Policy) => void; onClose: () => void }) {
  const [title, setTitle] = useState(policy?.title ?? '');
  const [reference, setReference] = useState(policy?.reference ?? '');
  const [summary, setSummary] = useState(policy?.summary ?? '');
  const [applies, setApplies] = useState<CategoryId[]>(policy?.appliesTo ?? ['nuisance']);
  const [days, setDays] = useState(policy?.observationDays ? String(policy.observationDays) : '');
  const [none, setNone] = useState(policy ? policy.observationDays === null : true);
  const [status, setStatus] = useState<Policy['status']>(policy?.status ?? 'pending_confirmation');
  const [fine, setFine] = useState(policy?.fineAmount != null ? String(policy.fineAmount) : '');
  const [windowDays, setWindowDays] = useState(policy?.countWindowDays != null ? String(policy.countWindowDays) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (title.trim().length < 3) next.title = 'Give the policy a short title.';
    if (reference.trim().length < 2) next.reference = 'Add where it is written, e.g. “House Rules §6.3”.';
    if (applies.length === 0) next.applies = 'Choose at least one kind of concern it applies to.';
    if (!none && !(Number(days) >= 1 && Number(days) <= 60)) next.days = 'Enter 1 to 60 days, or tick “No observation period”.';
    if (fine.trim() && !(Number(fine) >= 0 && Number(fine) <= 1_000_000)) next.fine = 'Enter the amount the rule states, or leave it empty.';
    if (windowDays.trim() && !(Number.isInteger(Number(windowDays)) && Number(windowDays) >= 1 && Number(windowDays) <= 3650)) next.window = 'Enter a number of days (1 to 3650), or leave it empty.';
    setErrors(next);
    if (Object.keys(next).length) return;
    onSave({ id: policy?.id ?? `pol-${Date.now().toString(36)}`, title: title.trim(), reference: reference.trim(), summary: summary.trim(), appliesTo: applies, observationDays: none ? null : Number(days), status,
      fineAmount: fine.trim() ? Number(fine) : null, countWindowDays: windowDays.trim() ? Number(windowDays) : null });
  };

  return (
    <Dialog size="lg" title={policy ? 'Edit policy reference' : 'Add policy reference'} description="Policies are what warnings are issued under. Only confirmed policies can be used." onClose={onClose} dirty onSubmit={submit}
      footer={({ requestClose }) => (<><Button onClick={requestClose}>Cancel</Button><Button type="submit" variant="primary">{policy ? 'Save policy' : 'Add policy'}</Button></>)}>
      <div className="sa-grid2">
        <Field label="Title" required error={errors.title}><Input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Where it is written" required error={errors.reference}><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. House Rules §6.3" /></Field>
      </div>
      <Field label="Summary" optional hint="What the policy requires, in plain words."><Textarea rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} /></Field>
      <FieldGroup label="Applies to" required error={errors.applies}>
        <div className="grid gap-2 sm:grid-cols-2">
          {CATEGORY_IDS.map((id) => <Checkbox key={id} label={CATEGORIES[id].label} checked={applies.includes(id)} onChange={(e) => setApplies(e.target.checked ? [...applies, id] : applies.filter((x) => x !== id))} />)}
        </div>
      </FieldGroup>
      <FieldGroup label="Observation period" error={errors.days} hint="Only if the policy defines one. StraySafe does not assume a standard period.">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2"><Input type="number" min={1} max={60} className="!w-24" aria-label="Days" disabled={none} value={days} onChange={(e) => setDays(e.target.value)} /><span className="sa-small">days</span></div>
          <Checkbox label="No observation period" checked={none} onChange={(e) => setNone(e.target.checked)} />
        </div>
      </FieldGroup>
      {applies.includes('nuisance') ? (
        <div className="sa-grid2">
          <Field label="Fine for a 3rd offense" optional error={errors.fine} hint="Only the amount the rule states. Without one, no fine can be imposed under this rule."><Input type="number" min={0} step="0.01" value={fine} onChange={(e) => setFine(e.target.value)} placeholder="Amount in pesos" /></Field>
          <Field label="Offenses stop counting after" optional error={errors.window} hint="Days. Leave empty if offenses never stop counting."><Input type="number" min={1} max={3650} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} /></Field>
        </div>
      ) : null}
      <FieldGroup label="Status">
        <OptionGroup name="policy-status" label="Status" inline value={status} onChange={setStatus} options={[{ value: 'confirmed', label: 'Confirmed', description: 'Approved. Warnings can be issued under it.' }, { value: 'pending_confirmation', label: 'Awaiting confirmation', description: 'Not yet approved. Cannot be used.' }]} />
      </FieldGroup>
      {status === 'pending_confirmation' ? <Callout tone="amber">A policy that is awaiting confirmation cannot be used to issue a warning.</Callout> : null}
    </Dialog>
  );
}
