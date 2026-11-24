import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ANIMAL_ICON } from '../../components/icons';
import { AiBadge } from '../../components/AiBadge';
import { ColorTagInput } from '../../components/ColorTagInput';
import { BreedInput } from '../../components/BreedInput';
import { ChoiceChips, Field, FieldGroup, Input, Textarea } from '../../components/form';
import { MediaPicker } from '../../components/MediaPicker';
import { Screen } from '../../components/Screen';
import { DiscardSheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import { Button, Callout, FormError, LinkButton, NotFoundState } from '../../components/ui';
import { residentPath } from '../../config';
import { parseColorTags } from '../../data/colors';
import { ANIMAL_TYPES, PET_TYPE_IDS, SEX_LABEL } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { petById } from '../../data/selectors';
import type { AnimalType, Media, Pet, PetSex } from '../../data/types';
import { stepPath, useStartReport } from '../../lib/flow';
import { useFormFocus, useLeaveGuard, useSubmit } from '../../lib/hooks';
import { ApiDetailError, errorCodeOf } from '../../../live/http';
import { AdminApiError } from '../../../preview/lib/errors';
import { analyzeReportMedia, animalIdOf, colorsOf, isUsableAnalysis, type MediaAnalysis } from '../../../live/mediaAnalysis';

interface Values { name: string; type: AnimalType | ''; sex: PetSex; breed: string; colors: string[]; ageText: string; markings: string; description: string }
type Errors = Partial<Record<'name' | 'type' | 'color' | 'photo', string>>;
/** The photo check on the registration photo: the fields it may suggest, and where the check stands. */
type AiField = 'type' | 'colors';
type Analysis = { status: 'idle' } | { status: 'busy' } | { status: 'done'; result: MediaAnalysis } | { status: 'failed'; message: string };
/** A record the subdivision office already holds that looks like the pet being registered (the server stops and asks). */
type HeldRecord = { id: string; name: string; kind: string };

const valuesOf = (p?: Pet): Values => ({
  name: p?.name ?? '', type: p?.type ?? '', sex: p?.sex ?? 'unknown', breed: p?.breed ?? '', colors: parseColorTags(p?.colors, p?.color), ageText: p?.ageText ?? '', markings: p?.markings.join(', ') ?? '', description: p?.description ?? '',
});
const photoOf = (p?: Pet): Media[] => (p?.photoUrl ? [{ id: `photo-${p.id}`, name: p.photoName ?? 'Photo', kind: 'photo', size: 0, url: p.photoUrl }] : []);

/** The records the server named when it held one for this resident (see routes/pets.py EXISTING_PET_FOR_YOU). */
function heldRecords(err: unknown): HeldRecord[] {
  if (errorCodeOf(err) !== 'EXISTING_PET_FOR_YOU' || !(err instanceof ApiDetailError) || !Array.isArray(err.data.candidates)) return [];
  return (err.data.candidates as { pet_id?: number; pet_name?: string; pet_type?: string }[]).map((c) => ({ id: String(c.pet_id ?? ''), name: c.pet_name ?? 'A pet', kind: c.pet_type ?? '' }));
}

function PetForm({ pet }: { pet?: Pet }) {
  const { state, dispatch, local } = useResidentData();
  const navigate = useNavigate();
  const toast = useToast();
  const start = useStartReport();
  // "Register now" from a lost-pet report: when the pet is saved, the report continues with it chosen
  const forLost = useSearchParams()[0].get('next') === 'lost' && !pet;
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [initial] = useState(() => valuesOf(pet));
  const [initialPhoto] = useState(() => photoOf(pet));
  const [v, setV] = useState<Values>(initial);
  const [media, setMedia] = useState<Media[]>(initialPhoto);
  const [errors, setErrors] = useState<Errors>({});
  const [held, setHeld] = useState<HeldRecord[]>([]);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || media.map((m) => m.id).join() !== initialPhoto.map((m) => m.id).join();
  const guard = useLeaveGuard(dirty, residentPath(pet ? `/pets/${pet.id}` : '/pets'));
  const set = <K extends keyof Values>(key: K, value: Values[K]) => { setV((p) => ({ ...p, [key]: value })); setErrors((p) => ({ ...p, [key as string]: undefined })); };

  // The photo check (POST /reports/analyze-media, purpose "pet": the local detector only): runs in the background on a newly chosen photo,
  // fills only the kind of animal and the colours the owner has not filled or edited, and never blocks saving.
  const [analysis, setAnalysis] = useState<Analysis>({ status: 'idle' });
  const [ai, setAi] = useState<Partial<Record<AiField, boolean>>>({});
  const [edited, setEdited] = useState<Partial<Record<AiField, boolean>>>({});
  const analysisRun = useRef(0);
  const analyzedId = useRef<string | null>(null);
  // What the owner has entered by the time a check finishes (the answer arrives after later renders)
  const latest = useRef({ v, ai, edited });
  useLayoutEffect(() => { latest.current = { v, ai, edited }; });
  const userEdit = (key: AiField) => { setEdited((e) => ({ ...e, [key]: true })); setAi((a) => ({ ...a, [key]: false })); };

  const applyAnalysis = (result: MediaAnalysis) => {
    if (!isUsableAnalysis(result)) return;
    const { v: cur, ai: wasAi, edited: byHand } = latest.current;
    const filled: Partial<Record<AiField, boolean>> = {};
    const patch: Partial<Values> = {};
    const kind = animalIdOf(result);
    if (kind && !byHand.type && (!cur.type || wasAi.type)) { patch.type = kind; filled.type = true; }
    const colors = colorsOf(result);
    if (colors.length && !byHand.colors && (cur.colors.length === 0 || wasAi.colors)) { patch.colors = colors; filled.colors = true; }
    if (Object.keys(filled).length === 0) return;
    setV((p) => ({ ...p, ...patch }));
    setAi((a) => ({ ...a, ...filled }));
    setErrors((p) => ({ ...p, ...(filled.type ? { type: undefined } : {}), ...(filled.colors ? { color: undefined } : {}) }));
  };

  const analyzePhoto = (next: Media[]) => {
    const first = next.find((m) => m.kind === 'photo' && m.file);
    if (!first?.file) {
      if (!next.some((m) => m.file)) { analysisRun.current += 1; analyzedId.current = null; setAnalysis({ status: 'idle' }); }
      return;
    }
    if (first.id === analyzedId.current) return;          // already checked (or being checked)
    analyzedId.current = first.id;
    const run = ++analysisRun.current;
    setAnalysis({ status: 'busy' });
    analyzeReportMedia(first.file, 'pet').then(
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

  const save = async (confirmNew: boolean) => {
    const saved: Pet = {
      id: pet?.id ?? `pet-${Date.now().toString(36)}`,
      name: v.name.trim(), type: v.type as AnimalType, sex: v.sex, breed: v.breed.trim(), color: v.colors.join(', '), colors: v.colors, ageText: v.ageText.trim(),
      markings: v.markings.split(/[,\n]/).map((m) => m.trim()).filter(Boolean).slice(0, 8), description: v.description.trim(),
      photoUrl: media[0]?.url, photoName: media[0]?.name, registeredAt: pet?.registeredAt ?? '', ...(pet?.status ? { status: pet.status } : {}),
    };
    let savedId = saved.id;
    setHeld([]);
    const ok = await run(async () => {
      try {
        const res = await dispatch({ type: 'pet/save', pet: saved, photo: media[0]?.file, confirmNew });
        if (res?.petId) savedId = res.petId;
      } catch (err) {
        setHeld(heldRecords(err));
        throw err;
      }
    });
    if (!ok) return;
    toast.success(pet ? 'Pet updated' : `${saved.name} is registered`);
    if (!forLost) { navigate(residentPath(`/pets/${savedId}`), { replace: true }); return; }
    // Back to the lost-pet report with the new pet chosen: into the report being written, or a new one
    const chosen = { petId: savedId, petName: saved.name, animalType: saved.type };
    if (state.draft?.kind === 'lost') { local({ type: 'draft/patch', patch: chosen }); navigate(stepPath('details'), { replace: true }); } else start('lost_pet', chosen, { replace: true });
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (v.name.trim().length < 1) found.name = 'Enter your pet’s name.';
    if (!v.type) found.type = 'Choose whether it is a dog or a cat.';
    if (v.colors.length === 0) found.color = 'Add at least one colour, for example “White” or “Brown”.';
    if (!media.some((m) => m.kind === 'photo' && Boolean(m.file || m.url))) {
      found.photo = 'Please upload a photo of your pet to complete the registration.';
    }
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    if (pet && !dirty) { navigate(residentPath(`/pets/${pet.id}`), { replace: true }); return; }
    await save(false);
  };

  return (
    <Screen
      title={pet ? 'Edit pet' : 'Register a pet'}
      subtitle={pet?.name ?? (forLost ? 'Then you go straight back to your report' : undefined)}
      onBack={guard.leave}
      footer={(
        <>
          <Button type="submit" form="pet-form" variant="primary" block loading={pending}>{pet ? 'Save changes' : 'Register pet'}</Button>
          <Button variant="ghost" block onClick={guard.leave} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      {!pet ? <Callout tone="info">Register each pet you own: a registered pet is how you report it missing, in a few taps. The profile is private and is shared only if you report them lost or make an ownership claim. A registration is what you declare; it is not proof of ownership.</Callout> : null}
      {error ? <FormError message={error} /> : null}
      {held.length > 0 ? (
        <Callout tone="amber" title="Your subdivision may already have this pet on record.">
          <span>{held.map((h) => `${h.name}${h.kind ? ` (${h.kind})` : ''}`).join(', ')} was registered for you by your subdivision office. To link it to your account, ask the office: nothing is changed until you accept it here. If it is a different pet, you can register it as new.</span>
          <span className="rs-row-actions rs-mt">
            <LinkButton size="sm" variant="primary" to={residentPath('/contact')}>Contact the office</LinkButton>
            <Button size="sm" loading={pending} onClick={() => void save(true)}>It’s a different pet</Button>
          </span>
        </Callout>
      ) : null}
      <form id="pet-form" className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <div ref={ref} className="rs-stack">
          <FieldGroup
            label="Photo"
            required
            error={errors.photo}
            hint="For accurate animal identification and verification, please upload a clear photo of the animal."
          >
            <MediaPicker
              value={media}
              onChange={(next) => { setMedia(next); setErrors((p) => ({ ...p, photo: undefined })); analyzePhoto(next); }}
              accept="photo"
              max={1}
              invalid={Boolean(errors.photo)}
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
                  <p className="rs-meta m-0">{analysis.message} Please fill in your pet’s details yourself. You can still register.</p>
                ) : null}
                {analysis.status === 'done' && analysis.result.animal_detected === false ? (
                  <Callout tone="info" title="We couldn’t find a dog or cat in this photo.">
                    Please upload a clear photo of your pet. You can still register and fill in the details yourself.
                  </Callout>
                ) : null}
                {analysis.status === 'done' && isUsableAnalysis(analysis.result) && analysis.result.multiple_animals_detected ? (
                  <Callout tone="amber" title="This photo seems to show more than one animal.">
                    Use a photo of only {v.name.trim() || 'this pet'}, so the neighbours and the office can recognise them.
                  </Callout>
                ) : null}
                {analysis.status === 'done' && isUsableAnalysis(analysis.result) && Object.values(ai).some(Boolean) ? (
                  <p className="rs-meta m-0"><AiBadge />Some details were suggested from your photo. Please check them.</p>
                ) : null}
              </div>
            ) : null}
          </FieldGroup>
          <Field label="Name" required error={errors.name}>
            <Input value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={40} autoComplete="off" placeholder="Mochi" />
          </Field>
          <FieldGroup label="Dog or cat" required error={errors.type} hint={<>{ai.type ? <AiBadge /> : null}Dogs and cats can be registered for now.</>}>
            <ChoiceChips label="Dog or cat" value={v.type} onChange={(t) => { set('type', t); userEdit('type'); }} options={PET_TYPE_IDS.map((id) => ({ value: id, label: ANIMAL_TYPES[id], icon: ANIMAL_ICON[id] }))} />
          </FieldGroup>
          <FieldGroup label="Sex (optional)">
            <ChoiceChips label="Sex" value={v.sex} onChange={(s) => set('sex', s)} options={(['male', 'female'] as const).map((id) => ({ value: id, label: SEX_LABEL[id] }))} />
          </FieldGroup>
          <Field label="Breed" optional>
            <BreedInput
              value={v.breed}
              onChange={(b) => set('breed', b)}
              animalType={v.type}
              maxLength={60}
              placeholder="e.g. Shih Tzu, Aspin"
            />
          </Field>
          <FieldGroup label="Colour or coat" required error={errors.color} hint={<>{ai.colors ? <AiBadge /> : null}Type a colour and press Enter or pick a suggestion to add separate tags.</>}>
            <ColorTagInput value={v.colors} onChange={(colors) => { set('colors', colors); userEdit('colors'); setErrors((p) => ({ ...p, color: undefined })); }} invalid={Boolean(errors.color)} />
          </FieldGroup>
          <Field label="Age" optional>
            <Input value={v.ageText} onChange={(e) => set('ageText', e.target.value)} maxLength={30} placeholder="3 years" />
          </Field>
          <Field label="Marks, collar or tag" optional hint="Separate with commas. These help neighbours recognise your pet.">
            <Textarea value={v.markings} onChange={(e) => set('markings', e.target.value)} rows={2} maxLength={200} placeholder="Gold ear tips, pink collar with a tag" />
          </Field>
          <Field label="About your pet" optional hint="How they act around strangers, whether they answer to their name.">
            <Textarea value={v.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={300} />
          </Field>
        </div>
      </form>
      {guard.asking ? <DiscardSheet onDiscard={guard.discard} onKeep={guard.keep} /> : null}
    </Screen>
  );
}

/** R30 — Register a pet. */
export function RegisterPetPage() {
  return <PetForm />;
}

/** R32 — Edit a registered pet. */
export function EditPetPage() {
  const { state } = useResidentData();
  const { petId } = useParams();
  const pet = petById(state, petId);
  if (!petId) return <Navigate to={residentPath('/pets')} replace />;
  if (!pet) return <Screen title="Edit pet" back="/pets"><NotFoundState what="pet" to="/pets" label="Go to My pets" /></Screen>;
  return <PetForm key={pet.id} pet={pet} />;
}
