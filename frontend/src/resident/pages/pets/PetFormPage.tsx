import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ANIMAL_ICON } from '../../components/icons';
import { ChoiceChips, Field, FieldGroup, Input, Textarea } from '../../components/form';
import { MediaPicker } from '../../components/MediaPicker';
import { Screen } from '../../components/Screen';
import { DiscardSheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import { Button, Callout, FormError, NotFoundState } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES, PET_TYPE_IDS } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { petById } from '../../data/selectors';
import type { AnimalType, Media, Pet } from '../../data/types';
import { useFormFocus, useLeaveGuard, useSubmit } from '../../lib/hooks';

interface Values { name: string; type: AnimalType | ''; breed: string; color: string; ageText: string; markings: string; description: string }
type Errors = Partial<Record<'name' | 'type' | 'color', string>>;

const valuesOf = (p?: Pet): Values => ({
  name: p?.name ?? '', type: p?.type ?? '', breed: p?.breed ?? '', color: p?.color ?? '', ageText: p?.ageText ?? '', markings: p?.markings.join(', ') ?? '', description: p?.description ?? '',
});
const photoOf = (p?: Pet): Media[] => (p?.photoUrl ? [{ id: `photo-${p.id}`, name: p.photoName ?? 'Photo', kind: 'photo', size: 0, url: p.photoUrl }] : []);

function PetForm({ pet }: { pet?: Pet }) {
  const { dispatch } = useResidentData();
  const navigate = useNavigate();
  const toast = useToast();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [initial] = useState(() => valuesOf(pet));
  const [initialPhoto] = useState(() => photoOf(pet));
  const [v, setV] = useState<Values>(initial);
  const [media, setMedia] = useState<Media[]>(initialPhoto);
  const [errors, setErrors] = useState<Errors>({});
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || media.map((m) => m.id).join() !== initialPhoto.map((m) => m.id).join();
  const guard = useLeaveGuard(dirty, residentPath(pet ? `/pets/${pet.id}` : '/pets'));
  const set = <K extends keyof Values>(key: K, value: Values[K]) => { setV((p) => ({ ...p, [key]: value })); setErrors((p) => ({ ...p, [key as string]: undefined })); };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (v.name.trim().length < 1) found.name = 'Enter your pet’s name.';
    if (!v.type) found.type = 'Choose the kind of animal.';
    if (v.color.trim().length < 2) found.color = 'Describe the colour or coat, for example “white and gold”.';
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    if (pet && !dirty) { navigate(residentPath(`/pets/${pet.id}`), { replace: true }); return; }

    const saved: Pet = {
      id: pet?.id ?? `pet-${Date.now().toString(36)}`,
      name: v.name.trim(), type: v.type as AnimalType, breed: v.breed.trim(), color: v.color.trim(), ageText: v.ageText.trim(),
      markings: v.markings.split(/[,\n]/).map((m) => m.trim()).filter(Boolean).slice(0, 8), description: v.description.trim(),
      photoUrl: media[0]?.url, photoName: media[0]?.name, registeredAt: pet?.registeredAt ?? '',
    };
    let savedId = saved.id;
    const ok = await run(async () => { const res = await dispatch({ type: 'pet/save', pet: saved, photo: media[0]?.file }); if (res?.petId) savedId = res.petId; });
    if (ok) { toast.success(pet ? 'Pet updated' : `${saved.name} is registered`); navigate(residentPath(`/pets/${savedId}`), { replace: true }); }
  };

  return (
    <Screen
      title={pet ? 'Edit pet' : 'Register a pet'}
      subtitle={pet?.name}
      onBack={guard.leave}
      footer={(
        <>
          <Button type="submit" form="pet-form" variant="primary" block loading={pending}>{pet ? 'Save changes' : 'Register pet'}</Button>
          <Button variant="ghost" block onClick={guard.leave} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      {!pet ? <Callout tone="info">Registering a pet is optional, and you can report a lost pet without it. The profile is private and is shared only if you report them lost or make an ownership claim.</Callout> : null}
      {error ? <FormError message={error} /> : null}
      <form id="pet-form" className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <div ref={ref} className="rs-stack">
          <Field label="Name" required error={errors.name}>
            <Input value={v.name} onChange={(e) => set('name', e.target.value)} maxLength={40} autoComplete="off" placeholder="Mochi" />
          </Field>
          <FieldGroup label="Kind of animal" required error={errors.type}>
            <ChoiceChips label="Kind of animal" value={v.type} onChange={(t) => set('type', t)} options={PET_TYPE_IDS.map((id) => ({ value: id, label: ANIMAL_TYPES[id], icon: ANIMAL_ICON[id] }))} />
          </FieldGroup>
          <Field label="Breed" optional>
            <Input value={v.breed} onChange={(e) => set('breed', e.target.value)} maxLength={60} placeholder="Shih Tzu" />
          </Field>
          <Field label="Colour or coat" required error={errors.color}>
            <Input value={v.color} onChange={(e) => set('color', e.target.value)} maxLength={60} placeholder="White and gold" />
          </Field>
          <Field label="Age" optional>
            <Input value={v.ageText} onChange={(e) => set('ageText', e.target.value)} maxLength={30} placeholder="3 years" />
          </Field>
          <Field label="Marks, collar or tag" optional hint="Separate with commas. These help neighbours recognise your pet.">
            <Textarea value={v.markings} onChange={(e) => set('markings', e.target.value)} rows={2} maxLength={200} placeholder="Gold ear tips, pink collar with a tag" />
          </Field>
          <Field label="About your pet" optional hint="How they act around strangers, whether they answer to their name.">
            <Textarea value={v.description} onChange={(e) => set('description', e.target.value)} rows={3} maxLength={300} />
          </Field>
          <FieldGroup label="Photo (optional)">
            <MediaPicker value={media} onChange={setMedia} accept="photo" max={1} addLabel={media.length ? 'Replace photo' : 'Add a photo'} />
          </FieldGroup>
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
