import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { isValidLocalInput, toLocalInput } from '../../../preview/lib/format';
import { ANIMAL_ICON } from '../../components/icons';
import { Field, FieldGroup, Input, Textarea } from '../../components/form';
import { MediaPicker } from '../../components/MediaPicker';
import { ConfirmSheet } from '../../components/Sheet';
import { Button, Callout, LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { LOST_NOTE, LOST_REVIEWED_NOTE, REGISTER_FIRST } from '../../data/entries';
import { lostPetChoices, visibilityAfterSending } from '../../data/selectors';
import type { Draft, Pet, Report } from '../../data/types';
import { registerForLostPath, useFlowNav } from '../../lib/flow';
import { useFormFocus, useNow } from '../../lib/hooks';
import { petSummary } from '../../lib/pets';
import { publicTextProblem } from '../../lib/publicText';
import { FlowScreen } from './FlowScreen';

const MAX = 600;

type Errors = Partial<Record<'pet' | 'observedAt' | 'description', string>>;
type Choice = { pet: Pet; active?: Report };

/** What choosing a pet writes into the draft: only which pet it is. Everything else about it is read from its registered profile. */
const petPatch = (pet: Pet): Partial<Draft> => ({ petId: pet.id, petName: pet.name, animalType: pet.type });

/** The resident's registered pets as cards. A pet that already has an active lost report cannot be chosen again: it links to that report. */
function PetPicker({ choices, value, onChange }: { choices: Choice[]; value: string | null; onChange: (id: string) => void }) {
  return (
    <div className="rs-options" role="radiogroup" aria-label="Which pet is missing?">
      {choices.map(({ pet, active }) => {
        const Icon = ANIMAL_ICON[pet.type];
        const art = <span className="rs-option__icon">{pet.photoUrl ? <img src={pet.photoUrl} alt="" /> : <Icon size={19} aria-hidden="true" />}</span>;
        if (active) {
          return (
            <div key={pet.id} className="rs-option rs-option--taken">
              {art}
              <span className="rs-option__text"><span className="rs-option__title">{pet.name}</span><span className="rs-option__desc">Already reported missing</span></span>
              <LinkButton size="sm" to={residentPath(`/reports/${active.id}`)}>View report</LinkButton>
            </div>
          );
        }
        return (
          <label key={pet.id} className="rs-option">
            <input type="radio" name="missing-pet" value={pet.id} checked={value === pet.id} onChange={() => onChange(pet.id)} />
            {art}
            <span className="rs-option__text"><span className="rs-option__title">{pet.name}</span><span className="rs-option__desc">{petSummary(pet) || ANIMAL_TYPES[pet.type]}</span></span>
          </label>
        );
      })}
    </div>
  );
}

/** The chosen pet's registered profile, read-only: the report uses it, so none of it is typed again. */
function PetProfile({ pet }: { pet: Pet }) {
  const rows = ([
    ['Kind of animal', ANIMAL_TYPES[pet.type]], ['Breed', pet.breed], ['Colour or coat', pet.color], ['Marks, collar or tag', pet.markings.join(', ')], ['Age', pet.ageText],
  ] as [string, string][]).filter(([, value]) => value.trim() !== '');
  return (
    <section className="rs-stack-sm" aria-label={`${pet.name}’s registered profile`}>
      <h2 className="rs-h2">{pet.name}’s registered profile</h2>
      <dl className="rs-summary">
        {rows.map(([label, value]) => <div key={label} className="rs-summary__item"><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="rs-hint">This is used in your report, so you don’t type it again. <Link to={residentPath(`/pets/${pet.id}/edit`)}>Edit {pet.name}’s profile</Link></p>
    </section>
  );
}

/**
 * R17 — The Lost Pet report, registration first: pick one of your registered pets and say only what is about this incident
 * (when it was last seen, anything that may help, a recent photo). The server checks the pet is yours and registered, and
 * that it has no other active lost report; the screen just doesn't offer what would be refused.
 */
export function LostPetForm({ draft }: { draft: Draft }) {
  const { state, local } = useResidentData();
  const navigate = useNavigate();
  const { next } = useFlowNav('details');
  const now = useNow();
  const { ref, invalid } = useFormFocus();
  const [errors, setErrors] = useState<Errors>({});
  const [discarding, setDiscarding] = useState(false);
  const choices = lostPetChoices(state);
  const free = choices.filter((c) => !c.active);
  // The chosen pet, or the only pet that can be chosen (it is shown selected, and saved into the draft when the resident continues)
  const chosen = free.find((c) => c.pet.id === draft.petId)?.pet ?? (free.length === 1 ? free[0].pet : undefined);
  const note = visibilityAfterSending(state, 'lost') === 'pending_review' ? LOST_REVIEWED_NOTE : LOST_NOTE;
  const patch = (p: Partial<Draft>) => local({ type: 'draft/patch', patch: p });
  const clear = (key: keyof Errors) => setErrors((prev) => ({ ...prev, [key]: undefined }));

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (!chosen) found.pet = free.length === 0 && choices.length === 0 ? REGISTER_FIRST : 'Choose which pet is missing.';
    if (!isValidLocalInput(draft.observedAt)) found.observedAt = 'Choose when your pet was last seen.';
    else if (new Date(draft.observedAt).getTime() > Date.now() + 60_000) found.observedAt = 'The time cannot be in the future.';
    // What is written here ends up in a notice that neighbours read.
    const problem = draft.description.trim() ? publicTextProblem(draft.description) : null;
    if (problem) found.description = problem;
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    if (chosen) patch(petPatch(chosen));
    next();
  };

  return (
    <FlowScreen
      step="details"
      title="About your pet"
      footer={(
        <>
          <Button type="submit" form="report-details" variant="primary" block disabled={free.length === 0}>Continue</Button>
          <p className="rs-center rs-meta">Your progress is saved on this device.</p>
        </>
      )}
    >
      <Callout tone={note.tone}>{note.text}</Callout>

      {choices.length === 0 ? (
        <Callout tone="amber" title={REGISTER_FIRST}>
          <span>A lost-pet report uses your pet’s registered profile, so it needs one first. It takes a minute, and you come straight back here.</span>
          <span className="rs-row-actions rs-mt"><LinkButton size="sm" variant="primary" icon={Plus} to={registerForLostPath()}>Register a pet</LinkButton></span>
        </Callout>
      ) : free.length === 0 ? (
        <Callout tone="amber" title="Each of your pets already has an active lost-pet report.">
          <span>Open a report below to follow it, or register another pet.</span>
        </Callout>
      ) : null}

      <form id="report-details" className="rs-stack" onSubmit={submit} noValidate>
        <div ref={ref} className="rs-stack">
          {choices.length > 0 ? (
            <FieldGroup label="Which pet is missing?" required error={errors.pet}>
              <PetPicker choices={choices} value={chosen?.id ?? null} onChange={(id) => { const pet = free.find((c) => c.pet.id === id)?.pet; if (pet) { patch(petPatch(pet)); clear('pet'); } }} />
              <p className="rs-hint rs-mt">Not listed? <Link to={registerForLostPath()}>Register your pet</Link> and you come straight back here.</p>
            </FieldGroup>
          ) : null}

          {chosen ? <PetProfile pet={chosen} /> : null}

          {free.length > 0 ? (
            <>
              <Field label="When was your pet last seen?" required error={errors.observedAt}>
                <Input type="datetime-local" value={draft.observedAt} max={toLocalInput(now)} onChange={(e) => { patch({ observedAt: e.target.value }); clear('observedAt'); }} />
              </Field>

              <Field
                label="Anything else that may help?"
                optional
                error={errors.description}
                hint={<>How your pet went missing, or where they like to go. Leave out phone numbers and your address: neighbours can read this. <span className="rs-count">{draft.description.length}/{MAX}</span></>}
              >
                <Textarea value={draft.description} onChange={(e) => { patch({ description: e.target.value }); clear('description'); }} maxLength={MAX} rows={4} placeholder="Slipped out of the gate this morning. Shy with strangers." />
              </Field>

              <FieldGroup label="A recent photo (optional)" hint="Your pet’s registered photo is used already. Add one only if it shows something new, such as a collar. Never go near an animal just to take one.">
                <MediaPicker value={draft.media} onChange={(media) => patch({ media })} accept="photo" max={3} />
              </FieldGroup>
            </>
          ) : null}
        </div>
      </form>

      <Button variant="ghost" block onClick={() => setDiscarding(true)}>Discard this report</Button>
      {discarding ? (
        <ConfirmSheet
          title="Discard this report?"
          message="The details, location and photos you added will be removed from this device."
          confirmLabel="Discard report"
          tone="danger"
          onConfirm={() => { local({ type: 'draft/clear' }); navigate(residentPath('/report'), { replace: true }); }}
          onClose={() => setDiscarding(false)}
        />
      ) : null}
    </FlowScreen>
  );
}
