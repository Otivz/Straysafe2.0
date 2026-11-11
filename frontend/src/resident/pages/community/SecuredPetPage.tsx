import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { isValidLocalInput, toLocalInput } from '../../../preview/lib/format';
import { Field, FieldGroup, Input, OptionList, Textarea } from '../../components/form';
import { LocationPicker } from '../../components/LocationPicker';
import { MediaPicker } from '../../components/MediaPicker';
import { Screen } from '../../components/Screen';
import { DiscardSheet, Sheet } from '../../components/Sheet';
import { useToast } from '../../components/toast';
import { Button, Callout, ErrorState, FormError, ListSkeleton, NotFoundState } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { noticeById } from '../../data/selectors';
import type { GeoPoint, Media } from '../../data/types';
import { useFormFocus, useLeaveGuard, useNow, useSubmit } from '../../lib/hooks';
import { publicTextProblem } from '../../lib/publicText';
import { useLoadNotice } from '../../lib/useLoadNotice';

type Errors = Partial<Record<'foundAt' | 'location' | 'description' | 'contact', string>>;
type Contact = 'direct' | 'leader' | 'later';

const CONTACT = [
  { value: 'direct', label: 'Let us message each other in the app', description: 'The owner can message you once you both agree. No phone number or address is shared.' },
  { value: 'leader', label: 'Ask the Subdivision Leader to help', description: 'The Leader helps you and the owner get in touch. You never have to say why.' },
  { value: 'later', label: 'I’ll decide after I send this', description: 'Nothing is shared until you choose.' },
] as const;

/**
 * R19b — "I may have this pet safely with me": a possible recovery. Only the owner, the Subdivision Leader and the person who writes it see
 * this report; the owner sees the writer's first name and never a phone number or address. It never marks the pet as home: only the owner's
 * own confirmation does. The place where the pet is being kept is private, and so is everything about how to get in touch.
 */
export default function SecuredPetPage() {
  const { state, dispatch } = useResidentData();
  const { noticeId } = useParams();
  const notice = noticeById(state, noticeId);
  const detail = useLoadNotice(noticeId);
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [foundAt, setFoundAt] = useState(() => toLocalInput(new Date()));
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [description, setDescription] = useState('');
  const [careNote, setCareNote] = useState('');
  const [contact, setContact] = useState<Contact | ''>('');
  const [media, setMedia] = useState<Media[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [picking, setPicking] = useState(false);
  const [clientRequestId] = useState(() => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  const guard = useLeaveGuard(description.trim() !== '' || careNote.trim() !== '' || location !== null || media.length > 0, residentPath(`/community/${noticeId}`));

  if (detail.status === 'idle' || detail.status === 'loading') return <Screen title="I may have this pet" back="/community"><ListSkeleton rows={3} /></Screen>;
  if (detail.status === 'error') return <Screen title="I may have this pet" back="/community"><ErrorState onRetry={detail.retry}>{detail.error}</ErrorState></Screen>;
  if (!notice || notice.type !== 'lost_pet') return <Screen title="I may have this pet" back="/community"><NotFoundState what="notice" to="/community" label="Go to Community" /></Screen>;
  if (notice.status !== 'active') {
    return (
      <Screen title="I may have this pet" back={`/community/${notice.id}`}>
        <Callout tone="info" title="This notice is closed.">Thank you for looking. It no longer takes reports.</Callout>
      </Screen>
    );
  }
  if (notice.mine) {
    return (
      <Screen title="I may have this pet" back={`/community/${notice.id}`}>
        <Callout tone="info" title="This is your own notice.">When someone tells you they may have your pet, it appears on the notice, where you decide how to get in touch.</Callout>
      </Screen>
    );
  }

  const name = notice.petName ?? 'the pet';

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (!isValidLocalInput(foundAt)) found.foundAt = 'Choose when you found it.';
    else if (new Date(foundAt).getTime() > Date.now() + 60_000) found.foundAt = 'The time cannot be in the future.';
    if (!location) found.location = 'Choose where you found it.';
    if (description.trim().length < 10) found.description = 'Describe the animal and how it is (at least 10 characters).';
    else { const problem = publicTextProblem(description); if (problem) found.description = problem; }
    // The place the pet is kept is private (the owner and the Leader only), so it is the writer's own words: no public-text rule applies to it.
    if (!contact) found.contact = 'Choose how the owner can reach you.';
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    const ok = await run(async () => {
      await dispatch({
        type: 'sighting/add', noticeId: notice.id, clientRequestId, kind: 'secured', observedAt: foundAt, location: location as GeoPoint, description,
        careNote: careNote.trim() || undefined, contactChoice: contact === 'later' ? undefined : (contact as 'direct' | 'leader'), onBehalf: false, photos: media.length, media,
      });
    });
    if (ok) { toast.success('The owner was told'); navigate(residentPath(`/community/${notice.id}`), { replace: true }); }
  };

  return (
    <Screen
      title="I may have this pet"
      subtitle={notice.title}
      onBack={guard.leave}
      footer={(
        <>
          <Button type="submit" form="secured-form" variant="primary" block loading={pending}>Tell the owner</Button>
          <Button variant="ghost" block onClick={guard.leave} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      <Callout tone="info" title="Thank you for helping.">
        Only the owner and the Subdivision Leader see this. The owner sees your first name and what you write here. Your phone number and address are not shared unless you write them yourself. This does not mark {name} as home: only the owner can do that, once they have their pet back.
      </Callout>
      {error ? <FormError message={error} /> : null}
      <form id="secured-form" className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <div ref={ref} className="rs-stack">
          <Field label="When did you find it?" required error={errors.foundAt}>
            <Input type="datetime-local" value={foundAt} max={toLocalInput(now)} onChange={(e) => { setFoundAt(e.target.value); setErrors((p) => ({ ...p, foundAt: undefined })); }} />
          </Field>

          <FieldGroup label="Where did you find it?" required error={errors.location}>
            <button type="button" className="rs-locfield" aria-invalid={errors.location ? true : undefined} onClick={() => setPicking(true)}>
              <MapPin size={19} aria-hidden="true" />
              <span>{location ? location.label : 'Choose the place'}</span>
              <span className="rs-locfield__action">{location ? 'Change' : 'Choose'}</span>
            </button>
          </FieldGroup>

          <Field label="What can you tell the owner?" required error={errors.description} hint="What it looks like, how it is, and why you think it is the missing pet.">
            <Textarea value={description} onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })); }} maxLength={400} rows={4} placeholder="A brown dog with a blue collar, calm and drinking water. It looks like the photo." />
          </Field>

          <Field label="Where is it now?" optional hint="Private: only the owner and the Subdivision Leader see this. Add an address or phone number only if you are comfortable with them seeing it.">
            <Textarea value={careNote} onChange={(e) => setCareNote(e.target.value)} maxLength={500} rows={2} placeholder="In my carport, with water and a blanket." />
          </Field>

          <FieldGroup label="A photo (optional)" hint="Only if you can take it safely.">
            <MediaPicker value={media} onChange={setMedia} accept="photo" max={1} />
          </FieldGroup>

          <FieldGroup label="How can the owner reach you?" required error={errors.contact} hint="Nothing is shared until you choose, and you can change it later.">
            <OptionList name="How the owner can reach you" value={contact} onChange={(v) => { setContact(v); setErrors((p) => ({ ...p, contact: undefined })); }} options={CONTACT.map((c) => ({ value: c.value, label: c.label, description: c.description }))} />
          </FieldGroup>
        </div>
      </form>

      {picking ? (
        <Sheet title="Where did you find it?" tall onClose={() => setPicking(false)}>
          <LocationPicker
            initial={location}
            confirmLabel="Use this place"
            publicText
            onConfirm={(g) => { setLocation(g); setErrors((p) => ({ ...p, location: undefined })); setPicking(false); }}
          />
        </Sheet>
      ) : null}
      {guard.asking ? <DiscardSheet onDiscard={guard.discard} onKeep={guard.keep} /> : null}
    </Screen>
  );
}
