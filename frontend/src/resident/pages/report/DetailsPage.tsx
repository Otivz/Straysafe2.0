import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isValidLocalInput, toLocalInput } from '../../../preview/lib/format';
import { ANIMAL_ICON } from '../../components/icons';
import { ColorTagInput } from '../../components/ColorTagInput';
import { BreedInput } from '../../components/BreedInput';
import { ChoiceChips, Field, FieldGroup, Input, Select, Textarea } from '../../components/form';
import { MediaPicker } from '../../components/MediaPicker';
import { ConfirmSheet } from '../../components/Sheet';
import { Loader2, ShieldAlert } from 'lucide-react';
import { AiBadge } from '../../components/AiBadge';
import {
  analyzeReportMedia, animalIdOf, appearanceNoteOf, colorsOf, isBasicAnalysis, isUsableAnalysis, known, looksAiGenerated, matchBreed, sizeOf,
  type MediaAnalysis,
} from '../../../live/mediaAnalysis';
import { AdminApiError } from '../../../preview/lib/errors';
import { getBreedsForAnimalType } from '../../data/breeds';
import { Button, Callout } from '../../components/ui';
import { residentPath } from '../../config';
import {
  ANIMAL_TYPES, ANIMAL_TYPE_IDS, BITE_MEDICAL_WARNING, CATEGORIES, CURRENT_DANGER_OPTIONS,
  DANGEROUS_BEHAVIORS, DANGEROUS_SAFETY_WARNING, EXTRA_FIELD, INJURED_CONDITIONS,
  RABIES_SYMPTOMS, RABIES_WARNING, STILL_IN_LOCATION_OPTIONS,
} from '../../data/constants';
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
    hint: 'Size, markings, collar or tag, and its condition. Leave out anything only the owner would know, and phone numbers or addresses.',
    placeholder: 'A friendly brown dog with a red collar, found near the clubhouse gate.',
  },
};

const NOTES: Partial<Record<CategoryId, { tone: 'info' | 'amber'; title?: string; text: string }>> = {
  lost_pet: LOST_NOTE,
  found_animal: { tone: 'info', text: 'An administrator reviews this before any notice is published. Please do not hand the animal to someone who only says it is theirs.' },
  safety: { tone: 'amber', title: 'Safety Warning — Keep a safe distance', text: DANGEROUS_SAFETY_WARNING },
  nuisance: { tone: 'info', text: 'This report is private. Neighbours will not see it, or who sent it.' },
  other: { tone: 'info', text: 'This report is private. Neighbours will not see it, or who sent it.' },
};

/** The note that follows the subdivision's publication setting (connected); every other note is fixed. */
const FOUND_PUBLISHED: NonNullable<(typeof NOTES)[CategoryId]> = { tone: 'info', text: 'After you submit, a notice with the animal’s description and the general area is visible to neighbours. Please do not hand the animal to someone who only says it is theirs.' };

type Errors = Partial<Record<
  'media' | 'animalType' | 'customAnimalType' | 'description' | 'observedAt' | 'injuredConditions' | 'injuredOtherDetail' | 'canMove'
  | 'dangerousBehaviors' | 'dangerousOtherDetail' | 'currentDanger' | 'stillInLocation'
  | 'bitePerson' | 'biteAnimal' | 'biteDetails' | 'biteNearby',
  string
>>;

type AiField = 'animalType' | 'colors' | 'breed' | 'size' | 'looks';
type Analysis = { status: 'idle' } | { status: 'busy' } | { status: 'done'; result: MediaAnalysis } | { status: 'failed'; message: string };
const SIZES = ['Small', 'Medium', 'Large'] as const;


function DetailsForm({ draft }: { draft: Draft }) {
  const { state, local } = useResidentData();
  const navigate = useNavigate();
  const { next } = useFlowNav('details');
  const now = useNow();
  const { ref, invalid } = useFormFocus();
  const [errors, setErrors] = useState<Errors>({});
  const [discarding, setDiscarding] = useState(false);
  const isInjured = draft.category === 'injured';
  const isSafety = draft.category === 'safety';
  const kind: 'incident' | 'found' = CATEGORIES[draft.category].kind === 'found' ? 'found' : 'incident';
  const copy = isInjured
    ? {
        screen: 'Injured or sick animal',
        label: 'Describe the injury, illness, or physical condition',
        when: 'When did you observe the animal?',
        hint: 'Describe visible injuries, bleeding, weakness, entrapment, or neglect and any helpful details.',
        placeholder: 'e.g. Medium brown dog limping near the clubhouse gate, appears weak with a visible wound on its front leg.',
      }
    : isSafety
      ? {
          screen: 'Dangerous animal report',
          label: 'Physical description & additional observations',
          when: 'When did you observe the animal?',
          hint: 'Describe identifying characteristics, size, collar/markings, and what happened.',
          placeholder: 'e.g. Large black dog without a leash barking and lunging at passersby near the park entrance.',
        }
      : COPY[kind];
  const note = draft.category === 'found_animal' && visibilityAfterSending(state, 'found') === 'published' ? FOUND_PUBLISHED : NOTES[draft.category];
  const extra = EXTRA_FIELD[draft.category];
  const patch = (p: Partial<Draft>) => local({ type: 'draft/patch', patch: p });
  const clear = (key: keyof Errors) => setErrors((prev) => ({ ...prev, [key]: undefined }));
  const selectedConditions = draft.injuredConditions ?? [];
  const selectedBehaviors = draft.dangerousBehaviors ?? [];
  const selectedRabies = draft.rabiesSymptoms ?? [];
  const bite = draft.biteDetails ?? {
    personBitten: '', animalBitten: '', affectedCount: '', incidentTime: '', incidentLocation: '', whatHappened: '', stillNearby: '',
  };
  const patchBite = (bPatch: Partial<NonNullable<Draft['biteDetails']>>) => patch({ biteDetails: { ...bite, ...bPatch } });

  // The photo check (POST /reports/analyze-media): runs in the background on the first photo (else video) chosen, fills only fields
  // the resident has not filled or edited, and never blocks Continue. A failed, slow or rate-limited check leaves manual entry as is.
  const [analysis, setAnalysis] = useState<Analysis>({ status: 'idle' });
  const [ai, setAi] = useState<Partial<Record<AiField, boolean>>>({});
  const [edited, setEdited] = useState<Partial<Record<AiField, boolean>>>({});
  const analysisRun = useRef(0);
  const analyzedId = useRef<string | null>(null);
  // What the resident has entered by the time a check finishes (the answer arrives after later renders)
  const latest = useRef({ draft, ai, edited });
  useLayoutEffect(() => { latest.current = { draft, ai, edited }; });
  const showsLooks = draft.category === 'nuisance' || isSafety;
  const userEdit = (key: AiField) => { setEdited((e) => ({ ...e, [key]: true })); setAi((a) => ({ ...a, [key]: false })); };

  const applyAnalysis = (result: MediaAnalysis) => {
    if (!isUsableAnalysis(result)) return;
    const { draft: d, ai: wasAi, edited: byHand } = latest.current;
    const isEmpty = (key: AiField) => {
      const v = d[key];
      return Array.isArray(v) ? v.length === 0 : !String(v ?? '').trim();
    };
    const free = (key: AiField) => !byHand[key] && (isEmpty(key) || Boolean(wasAi[key]));
    const p: Partial<Draft> = {};
    const filled: Partial<Record<AiField, boolean>> = {};
    const aiAnimal = animalIdOf(result);
    if (aiAnimal && free('animalType')) { p.animalType = aiAnimal; p.customAnimalType = ''; filled.animalType = true; }
    const animalFor = p.animalType ?? d.animalType ?? aiAnimal;
    const pattern = known(result.coat_pattern);
    const colors = [...colorsOf(result), ...(pattern && pattern.toLowerCase() !== 'solid' ? [pattern] : [])];
    if (colors.length && free('colors')) { p.colors = colors; filled.colors = true; }
    const breed = matchBreed(result.possible_breed, getBreedsForAnimalType(animalFor || null)) ?? known(result.possible_breed);
    if (breed && free('breed')) { p.breed = breed.slice(0, 60); filled.breed = true; }
    const size = sizeOf(result);
    if (size && free('size')) { p.size = size; filled.size = true; }
    const note = appearanceNoteOf(result);
    if (note && showsLooks && free('looks')) { p.looks = note.slice(0, 200); filled.looks = true; }
    if (Object.keys(filled).length) {
      patch(p);
      setAi((a) => ({ ...a, ...filled }));
      if (filled.animalType) clear('animalType');
    }
  };

  const analyzeFirst = (media: Draft['media']) => {
    const first = media.find((m) => m.kind === 'photo' && m.file) ?? media.find((m) => m.kind === 'video' && m.file);
    if (!first?.file) {
      if (!media.some((m) => m.file)) { analysisRun.current += 1; analyzedId.current = null; setAnalysis({ status: 'idle' }); }
      return;
    }
    if (first.id === analyzedId.current) return;          // already checked (or being checked)
    analyzedId.current = first.id;
    const run = ++analysisRun.current;
    setAnalysis({ status: 'busy' });
    analyzeReportMedia(first.file).then(
      (result) => {
        if (run !== analysisRun.current) return;
        setAnalysis({ status: 'done', result });
        applyAnalysis(result);
      },
      (err: unknown) => {
        if (run !== analysisRun.current) return;
        const busy = err instanceof AdminApiError && err.status === 429;
        setAnalysis({ status: 'failed', message: busy ? 'The photo check is busy right now.' : 'We couldn’t check the photo.' });
      },
    );
  };

  const toggleCondition = (cond: string) => {
    const exists = selectedConditions.includes(cond);
    const updated = exists ? selectedConditions.filter((c) => c !== cond) : [...selectedConditions, cond];
    patch({ injuredConditions: updated });
    clear('injuredConditions');
  };

  const toggleBehavior = (beh: string) => {
    const exists = selectedBehaviors.includes(beh);
    const updated = exists ? selectedBehaviors.filter((b) => b !== beh) : [...selectedBehaviors, beh];
    patch({ dangerousBehaviors: updated });
    clear('dangerousBehaviors');
  };

  const toggleRabies = (sym: string) => {
    const exists = selectedRabies.includes(sym);
    const updated = exists ? selectedRabies.filter((s) => s !== sym) : [...selectedRabies, sym];
    patch({ rabiesSymptoms: updated });
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (!draft.media.some((m) => (m.kind === 'photo' || m.kind === 'video') && Boolean(m.file || m.url))) {
      found.media = 'Please upload at least one photo or video of the animal before submitting your report.';
    }
    if (isInjured) {
      if (selectedConditions.length === 0) found.injuredConditions = 'Select at least one observed condition.';
      if (selectedConditions.includes('Other observable condition') && !(draft.injuredOtherDetail ?? '').trim()) {
        found.injuredOtherDetail = 'Please describe the other observable condition.';
      }
      if (!draft.extra || !draft.extra.trim()) found.canMove = 'Please answer whether the animal can move.';
    }
    if (isSafety) {
      if (selectedBehaviors.length === 0) found.dangerousBehaviors = 'Select at least one observed dangerous behavior.';
      if (selectedBehaviors.includes('Other dangerous behavior') && !(draft.dangerousOtherDetail ?? '').trim()) {
        found.dangerousOtherDetail = 'Please describe the other dangerous behavior.';
      }
      if (!draft.currentDanger) found.currentDanger = 'Please indicate whether the animal is currently displaying dangerous behavior.';
      if (!draft.stillInLocation) found.stillInLocation = 'Please indicate whether the animal is still in the reported location.';
      if (selectedBehaviors.includes('Actual bite incident')) {
        if (!bite.personBitten) found.bitePerson = 'Please indicate if a person was bitten.';
        if (!bite.animalBitten) found.biteAnimal = 'Please indicate if another animal was bitten.';
        if (!bite.stillNearby) found.biteNearby = 'Please indicate if the animal is still nearby.';
        if (bite.whatHappened.trim().length < 5) found.biteDetails = 'Briefly describe what happened during the bite incident.';
      }
    }
    if (!draft.animalType) found.animalType = 'Choose the kind of animal.';
    else if (draft.animalType === 'other' && !(draft.customAnimalType ?? '').trim()) {
      found.customAnimalType = 'Please enter the name or type of the animal.';
    }
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
      {note ? <Callout tone={note.tone} title={note.title}>{note.text}</Callout> : null}

      <form id="report-details" className="rs-stack" onSubmit={submit} noValidate>
        <div ref={ref} className="rs-stack">
          <FieldGroup
            label={kind === 'incident' ? 'Animal photo or video (required)' : 'Animal photo or video'}
            required
            error={errors.media}
            hint="For accurate animal identification and verification, please upload a clear photo or video of the animal."
          >
            <MediaPicker
              value={draft.media}
              onChange={(media) => { patch({ media }); clear('media'); analyzeFirst(media); }}
              accept="both"
              max={kind === 'incident' ? 5 : 3}
              invalid={Boolean(errors.media)}
            />
            {analysis.status !== 'idle' ? (
              <div className="mt-2 flex flex-col gap-2" aria-live="polite">
                {analysis.status === 'busy' ? (
                  <p className="rs-meta m-0 inline-flex items-center gap-1.5">
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                    Analyzing photo… You can keep filling in the form.
                  </p>
                ) : null}
                {analysis.status === 'failed' ? (
                  <p className="rs-meta m-0">{analysis.message} Please fill in the animal details yourself. You can still continue.</p>
                ) : null}
                {analysis.status === 'done' && looksAiGenerated(analysis.result) ? (
                  <Callout tone="amber" title="This photo may be AI-generated.">
                    {analysis.result.verification_message || 'Please upload an actual photo of the animal.'}
                  </Callout>
                ) : null}
                {analysis.status === 'done' && analysis.result.animal_detected === false ? (
                  <Callout tone="info" title="We couldn’t find a dog or cat in this photo.">
                    Please upload a clear photo of the animal. You can still continue and describe it yourself.
                  </Callout>
                ) : null}
                {analysis.status === 'done' && isUsableAnalysis(analysis.result) && analysis.result.multiple_animals_message ? (
                  <Callout tone="info">{analysis.result.multiple_animals_message}</Callout>
                ) : null}
                {analysis.status === 'done' && isUsableAnalysis(analysis.result) && Object.values(ai).some(Boolean) ? (
                  <p className="rs-meta m-0"><AiBadge />{isBasicAnalysis(analysis.result)
                    ? 'The AI photo check is busy right now, so only the kind of animal and its main colours were read from your photo. Shadows can make colours look wrong, so please check them. Breed and size were not guessed.'
                    : 'Some details were suggested from your photo. Please check them.'}</p>
                ) : null}
                {analysis.status === 'done' && isUsableAnalysis(analysis.result) && !showsLooks && appearanceNoteOf(analysis.result) ? (
                  <p className="rs-meta m-0">The photo shows: {appearanceNoteOf(analysis.result)}</p>
                ) : null}
              </div>
            ) : null}
            {kind === 'incident' && draft.category !== 'safety' ? (
              <Callout tone="amber" icon={ShieldAlert} title="Keep a safe distance." className="mt-3">
                Never approach, touch or corner an animal to get a better picture. Avoid showing people’s faces, children or house numbers.
              </Callout>
            ) : null}
          </FieldGroup>

          <FieldGroup label={kind === 'incident' ? 'What kind of animal?' : 'What kind of animal is it?'} required error={errors.animalType} hint={ai.animalType ? <AiBadge /> : undefined}>
            <ChoiceChips
              label="Kind of animal"
              value={draft.animalType}
              onChange={(v) => {
                patch({ animalType: v, ...(v !== 'other' ? { customAnimalType: '' } : {}) });
                userEdit('animalType');
                clear('animalType');
                clear('customAnimalType');
              }}
              options={ANIMAL_TYPE_IDS.map((id) => ({ value: id, label: ANIMAL_TYPES[id], icon: ANIMAL_ICON[id] }))}
            />
          </FieldGroup>

          {draft.animalType === 'other' ? (
            <Field
              label="Specify the animal"
              required
              error={errors.customAnimalType}
              hint="For example: Rabbit, Bird, Turtle, Snake, Hamster"
            >
              <Input
                value={draft.customAnimalType ?? ''}
                maxLength={80}
                onChange={(e) => { patch({ customAnimalType: e.target.value }); clear('customAnimalType'); }}
                placeholder="e.g. Rabbit, Bird, Turtle, Snake, Hamster"
              />
            </Field>
          ) : null}

          <FieldGroup label="Colour or coat" hint={<>{ai.colors ? <AiBadge /> : null}Optional. Type a colour and press Enter (e.g. White, Tan, Black) or choose a suggestion.</>}>
            <ColorTagInput value={draft.colors ?? []} onChange={(colors) => { patch({ colors }); userEdit('colors'); }} />
          </FieldGroup>

          <Field label="Breed" optional hint={ai.breed ? <AiBadge /> : undefined}>
            <BreedInput
              value={draft.breed ?? ''}
              onChange={(breed) => { patch({ breed }); userEdit('breed'); }}
              animalType={draft.animalType}
              placeholder="e.g. Aspin, Shih Tzu, Puspin"
              maxLength={60}
            />
          </Field>

          <FieldGroup label="Estimated size" hint={<>{ai.size ? <AiBadge /> : null}Optional.</>}>
            <ChoiceChips
              label="Estimated size"
              value={draft.size ?? ''}
              onChange={(v) => { patch({ size: v }); userEdit('size'); }}
              options={SIZES.map((s) => ({ value: s, label: s }))}
            />
          </FieldGroup>

          {isInjured ? (
            <>
              <FieldGroup label="Observed condition(s)" required error={errors.injuredConditions} hint="Select all conditions you observed on the animal.">
                <div className="flex flex-wrap gap-2">
                  {INJURED_CONDITIONS.map((cond) => {
                    const active = selectedConditions.includes(cond);
                    return (
                      <button
                        key={cond}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleCondition(cond)}
                        className={active
                          ? 'rounded-full border border-[var(--rs-brand,#b45309)] bg-[var(--rs-brand,#b45309)] px-3 py-1.5 text-sm font-medium text-white transition'
                          : 'rounded-full border border-[var(--rs-line,#d6cfc7)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--rs-ink,#292524)] hover:bg-[var(--rs-sand,#f5f2ed)] transition'}
                      >
                        {cond}
                      </button>
                    );
                  })}
                </div>
              </FieldGroup>

              {selectedConditions.includes('Other observable condition') ? (
                <Field label="Describe the other condition" required error={errors.injuredOtherDetail}>
                  <Input
                    value={draft.injuredOtherDetail ?? ''}
                    maxLength={300}
                    onChange={(e) => { patch({ injuredOtherDetail: e.target.value }); clear('injuredOtherDetail'); }}
                    placeholder="e.g. Swollen eye, limping on rear leg, tangled in wire"
                  />
                </Field>
              ) : null}

              <FieldGroup label="Can the animal move?" required error={errors.canMove} hint="This helps the Subdivision Leader prioritize urgent rescue or veterinary response.">
                <ChoiceChips
                  label="Can the animal move?"
                  value={draft.extra}
                  onChange={(v) => { patch({ extra: v }); clear('canMove'); }}
                  options={(extra?.options ?? ['Yes', 'A little', 'No', 'Not sure']).map((o) => ({ value: o, label: o }))}
                />
                {draft.extra === 'No' ? (
                  <Callout tone="amber" title="Automatic Urgent Priority" className="mt-2">
                    Because the animal cannot move, this report will automatically be marked as Urgent so your Subdivision Leader is alerted immediately. Please keep a safe distance.
                  </Callout>
                ) : null}
              </FieldGroup>
            </>
          ) : null}

          {isSafety ? (
            <>
              <FieldGroup label="Dangerous behavior observed" required error={errors.dangerousBehaviors} hint="Select all behaviors you observed.">
                <div className="flex flex-wrap gap-2">
                  {DANGEROUS_BEHAVIORS.map((beh) => {
                    const active = selectedBehaviors.includes(beh);
                    return (
                      <button
                        key={beh}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleBehavior(beh)}
                        className={active
                          ? 'rounded-full border border-[var(--rs-brand,#b45309)] bg-[var(--rs-brand,#b45309)] px-3 py-1.5 text-sm font-medium text-white transition'
                          : 'rounded-full border border-[var(--rs-line,#d6cfc7)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--rs-ink,#292524)] hover:bg-[var(--rs-sand,#f5f2ed)] transition'}
                      >
                        {beh}
                      </button>
                    );
                  })}
                </div>
              </FieldGroup>

              {selectedBehaviors.includes('Other dangerous behavior') ? (
                <Field label="Describe the other dangerous behavior" required error={errors.dangerousOtherDetail}>
                  <Input
                    value={draft.dangerousOtherDetail ?? ''}
                    maxLength={300}
                    onChange={(e) => { patch({ dangerousOtherDetail: e.target.value }); clear('dangerousOtherDetail'); }}
                    placeholder="e.g. Blocking residents from entering the gate"
                  />
                </Field>
              ) : null}

              {selectedBehaviors.includes('Actual bite incident') ? (
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--rs-line,#d6cfc7)] bg-[var(--rs-sand,#f5f2ed)]/50 p-3.5">
                  <Callout tone="amber" title="Seek immediate medical attention">
                    {BITE_MEDICAL_WARNING}
                  </Callout>
                  <p className="font-semibold text-sm">Bite / Attack Incident Details</p>
                  <FieldGroup label="Was a person bitten?" required error={errors.bitePerson}>
                    <ChoiceChips label="Was a person bitten?" value={bite.personBitten} onChange={(v) => { patchBite({ personBitten: v }); clear('bitePerson'); }} options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                  </FieldGroup>
                  <FieldGroup label="Was another animal bitten?" required error={errors.biteAnimal}>
                    <ChoiceChips label="Was another animal bitten?" value={bite.animalBitten} onChange={(v) => { patchBite({ animalBitten: v }); clear('biteAnimal'); }} options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} />
                  </FieldGroup>
                  <Field label="Number of affected individuals" optional>
                    <Input value={bite.affectedCount} maxLength={40} onChange={(e) => patchBite({ affectedCount: e.target.value })} placeholder="e.g. 1 person" />
                  </Field>
                  <Field label="Approximate time of incident" optional>
                    <Input value={bite.incidentTime} maxLength={80} onChange={(e) => patchBite({ incidentTime: e.target.value })} placeholder="e.g. Around 3:15 PM today" />
                  </Field>
                  <Field label="Location of incident" optional>
                    <Input value={bite.incidentLocation} maxLength={150} onChange={(e) => patchBite({ incidentLocation: e.target.value })} placeholder="e.g. Near Phase 2 basketball court" />
                  </Field>
                  <Field label="Brief description of what happened" required error={errors.biteDetails}>
                    <Textarea rows={2} value={bite.whatHappened} maxLength={400} onChange={(e) => { patchBite({ whatHappened: e.target.value }); clear('biteDetails'); }} placeholder="Describe how the bite or attack occurred." />
                  </Field>
                  <FieldGroup label="Is the animal still nearby?" required error={errors.biteNearby}>
                    <ChoiceChips label="Is the animal still nearby?" value={bite.stillNearby} onChange={(v) => { patchBite({ stillNearby: v }); clear('biteNearby'); }} options={STILL_IN_LOCATION_OPTIONS.map((o) => ({ value: o, label: o }))} />
                  </FieldGroup>
                </div>
              ) : null}

              {selectedBehaviors.includes('Suspected rabies symptoms') ? (
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--rs-line,#d6cfc7)] bg-[var(--rs-sand,#f5f2ed)]/50 p-3.5">
                  <Callout tone="amber" title="Suspected Rabies Warning">
                    {RABIES_WARNING}
                  </Callout>
                  <FieldGroup label="Observable warning signs" hint="Reported warning signs only (not a medical diagnosis).">
                    <div className="flex flex-wrap gap-2">
                      {RABIES_SYMPTOMS.map((sym) => {
                        const active = selectedRabies.includes(sym);
                        return (
                          <button
                            key={sym}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleRabies(sym)}
                            className={active
                              ? 'rounded-full border border-[var(--rs-brand,#b45309)] bg-[var(--rs-brand,#b45309)] px-3 py-1.5 text-sm font-medium text-white transition'
                              : 'rounded-full border border-[var(--rs-line,#d6cfc7)] bg-white px-3 py-1.5 text-sm font-medium text-[var(--rs-ink,#292524)] hover:bg-[var(--rs-sand,#f5f2ed)] transition'}
                          >
                            {sym}
                          </button>
                        );
                      })}
                    </div>
                  </FieldGroup>
                </div>
              ) : null}

              <FieldGroup label="Is the animal currently displaying dangerous behavior?" required error={errors.currentDanger}>
                <ChoiceChips
                  label="Current dangerous behavior"
                  value={draft.currentDanger ?? ''}
                  onChange={(v) => { patch({ currentDanger: v }); clear('currentDanger'); }}
                  options={CURRENT_DANGER_OPTIONS.map((o) => ({ value: o, label: o }))}
                />
              </FieldGroup>

              <FieldGroup label="Is the animal still in the reported location?" required error={errors.stillInLocation}>
                <ChoiceChips
                  label="Still in location"
                  value={draft.stillInLocation ?? ''}
                  onChange={(v) => { patch({ stillInLocation: v }); clear('stillInLocation'); }}
                  options={STILL_IN_LOCATION_OPTIONS.map((o) => ({ value: o, label: o }))}
                />
              </FieldGroup>

              {selectedBehaviors.includes('Dangerous roaming animal') || draft.stillInLocation === 'No' ? (
                <Field label="Last observed location and direction of movement" optional>
                  <Input
                    value={draft.movementDirection ?? ''}
                    maxLength={300}
                    onChange={(e) => patch({ movementDirection: e.target.value })}
                    placeholder="e.g. Heading north toward Block 5 gate"
                  />
                </Field>
              ) : null}

              <Field label="Identifying characteristics" optional hint={<>{ai.looks ? <AiBadge /> : null}Size, collar, ear notch, or distinguishing markings.</>}>
                <Input value={draft.looks ?? ''} maxLength={200} onChange={(e) => { patch({ looks: e.target.value }); userEdit('looks'); }} placeholder="e.g. Large, black collar, scar on muzzle" />
              </Field>
            </>
          ) : null}

          <Field label={copy.label} required error={errors.description} hint={<>{copy.hint} <span className="rs-count">{draft.description.length}/{MAX}</span></>}>
            <Textarea value={draft.description} onChange={(e) => { patch({ description: e.target.value }); clear('description'); }} maxLength={MAX} rows={5} placeholder={copy.placeholder} />
          </Field>

          <Field label={copy.when} required error={errors.observedAt}>
            <Input type="datetime-local" value={draft.observedAt} max={toLocalInput(now)} onChange={(e) => { patch({ observedAt: e.target.value }); clear('observedAt'); }} />
          </Field>

          {extra && !isInjured ? (
            <Field label={extra.label} optional>
              <Select value={draft.extra} onChange={(e) => patch({ extra: e.target.value })}>
                <option value="">Choose one</option>
                {extra.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
          ) : null}

          {draft.category === 'nuisance' || isSafety ? (
            <>
              {draft.category === 'nuisance' ? (
                <Field label="Size, collar or markings" optional hint={<>{ai.looks ? <AiBadge /> : null}Size, collar, tags or distinguishing marks that help recognise it—even if you don’t know the owner.</>}>
                  <Input value={draft.looks ?? ''} maxLength={200} onChange={(e) => { patch({ looks: e.target.value }); userEdit('looks'); }} placeholder="e.g. Small, red collar, notched ear" />
                </Field>
              ) : null}
              <details className="rs-details" open={draft.suspectName || draft.suspectAddress || draft.suspectDetails ? true : undefined}>
                <summary>Do you know whose animal it is?<span className="rs-opt"> optional</span></summary>
                <p className="rs-hint">If you know, it helps your Subdivision Leader look into it. Only they see it. Nobody is penalised because of what you write here: the Leader checks first.</p>
                <Field label="Name" optional><Input value={draft.suspectName ?? ''} maxLength={150} onChange={(e) => patch({ suspectName: e.target.value })} /></Field>
                <Field label="House or general address" optional><Input value={draft.suspectAddress ?? ''} maxLength={255} onChange={(e) => patch({ suspectAddress: e.target.value })} /></Field>
                <Field label="Anything else that helps" optional><Textarea rows={2} value={draft.suspectDetails ?? ''} maxLength={1000} onChange={(e) => patch({ suspectDetails: e.target.value })} /></Field>
              </details>
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

/** R09 — Report form. Also the found-animal report (R22); the lost-pet report (R17) is registration first and has its own form. */
export default function DetailsPage() {
  const draft = useResidentData().state.draft;
  if (!draft) return <Navigate to={residentPath('/report')} replace />;
  return CATEGORIES[draft.category].kind === 'lost' ? <LostPetForm draft={draft} /> : <DetailsForm draft={draft} />;
}
