import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isValidLocalInput, toLocalInput } from '../../../preview/lib/format';
import { ANIMAL_ICON } from '../../components/icons';
import { ChoiceChips, Field, FieldGroup, Input, Select, Textarea } from '../../components/form';
import { MediaPicker } from '../../components/MediaPicker';
import { ConfirmSheet } from '../../components/Sheet';
import { Button, Callout } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES, ANIMAL_TYPE_IDS, CATEGORIES, EXTRA_FIELD } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { LOST_NOTE } from '../../data/entries';
import { visibilityAfterSending } from '../../data/selectors';
import type { CategoryId, Draft } from '../../data/types';
import { useFlowNav } from '../../lib/flow';
import { useFormFocus, useNow } from '../../lib/hooks';
import { publicTextProblem } from '../../lib/publicText';
import { FlowScreen } from './FlowScreen';
import { LostPetForm } from './LostPetForm';

const MAX = 600;

/** The two forms that describe an animal in words. A lost-pet report is about a registered pet and has its own form (LostPetForm). */
const COPY: Record<'incident' | 'found', { screen: string; label: string; hint: string; placeholder: string; when: string }> = {
  incident: {
    screen: 'What happened?', label: 'What happened?', when: 'When did you see it?',
    hint: 'Stick to what you saw: what the animal did, how many there were, and anything that worries you.',
    placeholder: 'A medium brown dog without a leash ran toward joggers near the park path.',
  },
  found: {
    screen: 'About the animal', label: 'Describe the animal and where you found it', when: 'When did you find it?',
    hint: 'Colour, size, markings, collar or tag, and its condition. Leave out anything only the owner would know, and phone numbers or addresses.',
    placeholder: 'A friendly brown dog with a red collar, found near the clubhouse gate.',
  },
};

const NOTES: Record<CategoryId, { tone: 'info' | 'amber'; title?: string; text: string }> = {
  lost_pet: LOST_NOTE,
  found_animal: { tone: 'info', text: 'An administrator reviews this before any notice is published. Please do not hand the animal to someone who only says it is theirs.' },
  safety: { tone: 'amber', title: 'Stay safe.', text: 'Keep your distance and never touch, feed or corner the animal. If someone is in danger right now, contact the guardhouse or local emergency services first.' },
  injured: { tone: 'amber', title: 'Do not handle the animal.', text: 'Keep a safe distance and note exactly where it is. A frightened or hurt animal may bite or scratch.' },
  nuisance: { tone: 'info', text: 'This report is private. Neighbours will not see it, or who sent it.' },
  other: { tone: 'info', text: 'This report is private. Neighbours will not see it, or who sent it.' },
};

/** The note that follows the subdivision's publication setting (connected); every other note is fixed. */
const FOUND_PUBLISHED: (typeof NOTES)[CategoryId] = { tone: 'info', text: 'After you submit, a notice with the animal’s description and the general area is visible to neighbours. Please do not hand the animal to someone who only says it is theirs.' };

type Errors = Partial<Record<'animalType' | 'description' | 'observedAt', string>>;

function DetailsForm({ draft }: { draft: Draft }) {
  const { state, local } = useResidentData();
  const navigate = useNavigate();
  const { next } = useFlowNav('details');
  const now = useNow();
  const { ref, invalid } = useFormFocus();
  const [errors, setErrors] = useState<Errors>({});
  const [discarding, setDiscarding] = useState(false);
  const kind: 'incident' | 'found' = CATEGORIES[draft.category].kind === 'found' ? 'found' : 'incident';
  const copy = COPY[kind];
  const note = draft.category === 'found_animal' && visibilityAfterSending(state, 'found') === 'published' ? FOUND_PUBLISHED : NOTES[draft.category];
  const extra = EXTRA_FIELD[draft.category];
  const patch = (p: Partial<Draft>) => local({ type: 'draft/patch', patch: p });
  const clear = (key: keyof Errors) => setErrors((prev) => ({ ...prev, [key]: undefined }));

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (!draft.animalType) found.animalType = 'Choose the kind of animal.';
    if (draft.description.trim().length < 10) found.description = 'Add a few more details (at least 10 characters).';
    else if (kind !== 'incident') {
      // A found-animal description ends up in a notice that neighbours read.
      const problem = publicTextProblem(draft.description);
      if (problem) found.description = problem;
    }
    if (!isValidLocalInput(draft.observedAt)) found.observedAt = 'Choose when this happened.';
    else if (new Date(draft.observedAt).getTime() > Date.now() + 60_000) found.observedAt = 'The time cannot be in the future.';
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    next();
  };

  return (
    <FlowScreen
      step="details"
      title={copy.screen}
      footer={(
        <>
          <Button type="submit" form="report-details" variant="primary" block>Continue</Button>
          <p className="rs-center rs-meta">Your progress is saved on this device.</p>
        </>
      )}
    >
      <Callout tone={note.tone} title={note.title}>{note.text}</Callout>

      <form id="report-details" className="rs-stack" onSubmit={submit} noValidate>
        <div ref={ref} className="rs-stack">
          <FieldGroup label={kind === 'incident' ? 'What kind of animal?' : 'What kind of animal is it?'} required error={errors.animalType}>
            <ChoiceChips
              label="Kind of animal"
              value={draft.animalType}
              onChange={(v) => { patch({ animalType: v }); clear('animalType'); }}
              options={ANIMAL_TYPE_IDS.map((id) => ({ value: id, label: ANIMAL_TYPES[id], icon: ANIMAL_ICON[id] }))}
            />
          </FieldGroup>

          <Field label={copy.label} required error={errors.description} hint={<>{copy.hint} <span className="rs-count">{draft.description.length}/{MAX}</span></>}>
            <Textarea value={draft.description} onChange={(e) => { patch({ description: e.target.value }); clear('description'); }} maxLength={MAX} rows={5} placeholder={copy.placeholder} />
          </Field>

          <Field label={copy.when} required error={errors.observedAt}>
            <Input type="datetime-local" value={draft.observedAt} max={toLocalInput(now)} onChange={(e) => { patch({ observedAt: e.target.value }); clear('observedAt'); }} />
          </Field>

          {extra ? (
            <Field label={extra.label} optional>
              <Select value={draft.extra} onChange={(e) => patch({ extra: e.target.value })}>
                <option value="">Choose one</option>
                {extra.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
          ) : null}

          {kind !== 'incident' ? (
            <FieldGroup label="Photo (optional)" hint="A clear photo helps neighbours recognise the animal. Never go near an animal just to take one.">
              <MediaPicker value={draft.media} onChange={(media) => patch({ media })} accept="photo" max={3} />
            </FieldGroup>
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

/** R09 — Report form. Also the found-animal report (R22); the lost-pet report (R17) is registration first and has its own form. */
export default function DetailsPage() {
  const draft = useResidentData().state.draft;
  if (!draft) return <Navigate to={residentPath('/report')} replace />;
  return CATEGORIES[draft.category].kind === 'lost' ? <LostPetForm draft={draft} /> : <DetailsForm draft={draft} />;
}
