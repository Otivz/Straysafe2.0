import { useMemo, useState, type FormEvent } from 'react';
import { Dialog } from '../components/Dialog';
import { Field, FieldGroup, Input, OptionGroup, Textarea } from '../components/form';
import { Callout, FormError } from '../components/layout';
import { useToast } from '../components/toast';
import { useAdminData } from '../data/context';
import type { Pet, Resident } from '../data/types';
import { maskPhone } from '../../preview/lib/format';
import { useSubmit } from '../lib/useSubmit';
import { FormFooter } from './BasicDialogs';

/** How many characters of "how did you check" the server needs before it will send the request. */
export const MIN_LINK_EVIDENCE = 10;
const MAX_SHOWN = 6;

const matches = (r: Resident, needle: string) => [r.name, r.unit, r.street, r.phone].some((t) => t.toLowerCase().includes(needle));

/**
 * Link a pet record the office entered to the resident it belongs to. This only ASKS the resident: the record stays as it is until they
 * accept in their own app, so nothing is transferred automatically and nobody can claim a pet unseen. The officer must say how they
 * checked the account is the owner's; the server refuses a request without it and keeps the note in the pet's history.
 */
export function LinkOwnerDialog({ pet, onClose }: { pet: Pet; onClose: () => void }) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const { pending, error, run } = useSubmit();
  const [query, setQuery] = useState('');
  const [residentId, setResidentId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [errors, setErrors] = useState<{ resident?: string; evidence?: string }>({});

  const needle = query.trim().toLowerCase();
  const found = useMemo(
    () => (needle.length < 2 ? [] : state.residents.filter((r) => r.status !== 'suspended' && matches(r, needle)).sort((a, b) => a.name.localeCompare(b.name))),
    [needle, state.residents],
  );
  const chosen = state.residents.find((r) => r.id === residentId);
  // The chosen resident stays in the list while the search changes, so the choice never disappears from under the officer
  const shown = [...(chosen && !found.some((r) => r.id === chosen.id) ? [chosen] : []), ...found].slice(0, MAX_SHOWN + 1);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!chosen) next.resident = 'Choose the resident this pet belongs to.';
    if (evidence.trim().length < MIN_LINK_EVIDENCE) next.evidence = 'Say how you checked that this resident is the owner, for example the phone number on the record or a vaccination card.';
    setErrors(next);
    if (!chosen || Object.keys(next).length) return;
    if (await run(() => dispatch({ type: 'pet/linkOwner', petId: pet.id, residentId: chosen.id, evidence: evidence.trim() }))) {
      toast.success(`Request sent to ${chosen.name}. ${pet.name} joins their pets only if they confirm.`);
      onClose();
    }
  };

  return (
    <Dialog
      title="Link to a resident" description={`Ask the resident who owns ${pet.name} to confirm it.`} onClose={onClose} dirty={evidence !== '' || residentId !== ''} onSubmit={submit}
      footer={({ requestClose }) => <FormFooter pending={pending} label="Send request" requestClose={requestClose} />}
    >
      <Callout>The resident gets a request in their app. {pet.name} is added to their pets only if they say yes. Until then nothing changes on the record, and you are not confirming ownership. A new request for this pet replaces one that is still waiting.</Callout>
      <Field label="Find the resident" hint="Type at least two letters of a name, unit or phone number."><Input value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" /></Field>
      <FieldGroup label="Resident" required error={errors.resident}>
        {shown.length === 0
          ? <p className="sa-small sa-text-2">{needle.length < 2 ? 'Search to see residents of your subdivision.' : 'No active resident matches that search.'}</p>
          : <OptionGroup name="resident" label="Resident" value={residentId} onChange={setResidentId} options={shown.map((r) => ({ value: r.id, label: r.name, description: [r.unit, r.street].filter(Boolean).join(', ') + (r.phone && r.phone !== '—' ? ` · ${maskPhone(r.phone)}` : '') }))} />}
        {found.length > MAX_SHOWN ? <p className="sa-hint">Showing the first {MAX_SHOWN} of {found.length}. Type more to narrow the list.</p> : null}
      </FieldGroup>
      <Field label="How did you check this is the owner?" required error={errors.evidence} hint="Saved in the pet's history. For example: the phone number on the record matches, or they showed the vaccination card."><Textarea rows={3} value={evidence} onChange={(e) => setEvidence(e.target.value)} /></Field>
      {error ? <FormError message={error} /> : null}
    </Dialog>
  );
}
