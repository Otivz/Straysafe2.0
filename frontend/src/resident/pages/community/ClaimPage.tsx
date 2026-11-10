import { useState, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Checkbox, Field, FieldGroup, OptionList, Textarea } from '../../components/form';
import { MediaPicker } from '../../components/MediaPicker';
import { Screen } from '../../components/Screen';
import { DiscardSheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import { Button, Callout, FormError, NotFoundState } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { claimForNotice, noticeById } from '../../data/selectors';
import type { Media } from '../../data/types';
import { useFormFocus, useLeaveGuard, useSubmit } from '../../lib/hooks';

const PROOF = ['I have photos of the animal with me', 'I have a vet or vaccination record', 'I know its tag or microchip details'];
type Errors = Partial<Record<'statement' | 'consent', string>>;

/** R24 — Claim a found animal. The subdivision reviews every claim; nothing is handed over automatically. */
export default function ClaimPage() {
  const { state, dispatch } = useResidentData();
  const { noticeId } = useParams();
  const notice = noticeById(state, noticeId);
  const existing = notice ? claimForNotice(state, notice.id) : undefined;
  const toast = useToast();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [petId, setPetId] = useState<string>('none');
  const [statement, setStatement] = useState('');
  const [proof, setProof] = useState<string[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const guard = useLeaveGuard(statement.trim() !== '' || proof.length > 0 || media.length > 0, residentPath(`/community/${noticeId}`));

  if (!notice || notice.type !== 'found_animal') return <Screen title="Claim an animal" back="/community"><NotFoundState what="found-animal notice" to="/community" label="Go to Community" /></Screen>;
  if (existing) return <Navigate to={residentPath(`/claims/${existing.id}`)} replace />;
  if (notice.mine) {
    return (
      <Screen title="Claim an animal" back={`/community/${notice.id}`}>
        <Callout tone="info" title="This is your own notice.">You published it, so there is nothing to claim. The subdivision will contact you if an owner comes forward.</Callout>
      </Screen>
    );
  }

  const pets = state.pets.filter((p) => !notice.animalType || p.type === notice.animalType);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (statement.trim().length < 20) found.statement = 'Tell us a little more (at least 20 characters).';
    if (!consent) found.consent = 'Please confirm to send your claim.';
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    const ok = await run(async () => {
      await dispatch({
        type: 'claim/submit', noticeId: notice.id, petId: petId === 'none' ? null : petId, statement,
        evidence: [...proof, ...media.map((m) => `Photo: ${m.name}`)], media,
      });
    });
    if (ok) toast.success('Claim sent for review');
  };

  return (
    <Screen
      title="Claim this animal"
      subtitle={notice.title}
      onBack={guard.leave}
      footer={(
        <>
          <Button type="submit" form="claim-form" variant="primary" block loading={pending}>Send claim for review</Button>
          <Button variant="ghost" block onClick={guard.leave} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      <Callout tone="info" title="Before you start.">
        An administrator reviews every claim before anyone hands the animal over. Registering a pet helps, but it does not prove ownership on its own.
      </Callout>
      {error ? <FormError message={error} /> : null}
      <form id="claim-form" className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <div ref={ref} className="rs-stack">
          {pets.length > 0 ? (
            <FieldGroup label="Is it one of your registered pets?" hint="Your pet’s profile is shared only with the administrators reviewing this claim.">
              <OptionList
                name="Registered pet"
                value={petId}
                onChange={setPetId}
                options={[
                  { value: 'none', label: 'Not registered', description: 'I will describe the animal below.' },
                  ...pets.map((p) => ({ value: p.id, label: p.name, description: `${p.breed || 'Pet'} · ${p.color}` })),
                ]}
              />
            </FieldGroup>
          ) : null}

          <Field label="How do you know it is yours?" required error={errors.statement} hint="Mention things that are not visible in the notice: a mark, a habit, where it sleeps, or when it went missing.">
            <Textarea value={statement} onChange={(e) => { setStatement(e.target.value); setErrors((p) => ({ ...p, statement: undefined })); }} maxLength={600} rows={5} />
          </Field>

          <FieldGroup label="What can you show the administrators?" hint="Tick what you have. You can bring or send it if they ask.">
            {PROOF.map((label) => (
              <Checkbox key={label} label={label} checked={proof.includes(label)} onChange={(e) => setProof((prev) => (e.target.checked ? [...prev, label] : prev.filter((x) => x !== label)))} />
            ))}
          </FieldGroup>

          <FieldGroup label="Photos of you with the animal (optional)">
            <MediaPicker value={media} onChange={setMedia} accept="photo" max={3} />
          </FieldGroup>

          <Checkbox
            checked={consent}
            onChange={(e) => { setConsent(e.target.checked); setErrors((p) => ({ ...p, consent: undefined })); }}
            error={errors.consent}
            label="I understand the subdivision may ask for more information and decides who the animal is returned to."
          />
        </div>
      </form>
      <Button variant="link" onClick={() => guard.leaveTo(residentPath('/help'))}>How ownership claims work</Button>
      {guard.asking ? <DiscardSheet onDiscard={guard.discard} onKeep={guard.keep} /> : null}
    </Screen>
  );
}
