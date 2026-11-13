import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { isValidLocalInput, toLocalInput } from '../../../preview/lib/format';
import { Checkbox, Field, FieldGroup, Input, Textarea } from '../../components/form';
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

type Errors = Partial<Record<'observedAt' | 'location' | 'description', string>>;

/** R19 — Report a sighting of a lost pet. Your name is never shown to the owner or to neighbours. */
export default function SightingPage() {
  const { state, dispatch } = useResidentData();
  const { noticeId } = useParams();
  const notice = noticeById(state, noticeId);
  const detail = useLoadNotice(noticeId);
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();
  const { ref, invalid } = useFormFocus();
  const { pending, error, run } = useSubmit();
  const [observedAt, setObservedAt] = useState(() => toLocalInput(new Date()));
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [description, setDescription] = useState('');
  // The owner can record a sighting that someone told them about; for them it is second-hand by definition.
  const [onBehalf, setOnBehalf] = useState(() => Boolean(notice?.mine));
  const [media, setMedia] = useState<Media[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [picking, setPicking] = useState(false);
  const [clientRequestId] = useState(() => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
  const guard = useLeaveGuard(description.trim() !== '' || location !== null || media.length > 0, residentPath(`/community/${noticeId}`));

  if (detail.status === 'idle' || detail.status === 'loading') return <Screen title="Report a sighting" back="/community"><ListSkeleton rows={3} /></Screen>;
  if (detail.status === 'error') return <Screen title="Report a sighting" back="/community"><ErrorState onRetry={detail.retry}>{detail.error}</ErrorState></Screen>;
  if (!notice || notice.type === 'safety_advisory') return <Screen title="Report a sighting" back="/community"><NotFoundState what="notice" to="/community" label="Go to Community" /></Screen>;
  if (notice.status !== 'active') {
    return (
      <Screen title="Report a sighting" back={`/community/${notice.id}`}>
        {notice.type === 'lost_pet'
          ? (notice.closeOutcome === 'recovered' || notice.recoveredAt
            ? <Callout tone="sage" title="This pet is home.">Thank you for looking. The owner confirmed the pet is home.</Callout>
            : <Callout tone="info" title="This notice is closed.">Thank you for looking. It no longer takes sightings.</Callout>)
          : <Callout tone="info" title="This notice is no longer accepting sightings.">Thank you for looking.</Callout>}
      </Screen>
    );
  }

  // the question names the pet ("When did you see Mochi?"); a found animal, or a pet without a name, is "it"
  const lost = notice.type === 'lost_pet';
  const it = lost && notice.petName ? notice.petName : 'it';
  const title = lost ? 'I saw this pet' : 'I saw this animal';

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const found: Errors = {};
    if (!isValidLocalInput(observedAt)) found.observedAt = 'Choose when you saw it.';
    else if (new Date(observedAt).getTime() > Date.now() + 60_000) found.observedAt = 'The time cannot be in the future.';
    if (!location) found.location = 'Choose where you saw it.';
    if (description.trim().length < 10) found.description = 'Describe what you saw (at least 10 characters).';
    else {
      // What was seen is shown to the owner and to neighbours.
      const problem = publicTextProblem(description);
      if (problem) found.description = problem;
    }
    setErrors(found);
    if (Object.keys(found).length > 0) { invalid(); return; }
    const ok = await run(async () => {
      await dispatch({ type: 'sighting/add', noticeId: notice.id, clientRequestId, observedAt, location: location as GeoPoint, description, onBehalf: notice.mine || onBehalf, photos: media.length, media });
    });
    if (ok) { toast.success('Sighting shared'); navigate(residentPath(`/community/${notice.id}/sightings`), { replace: true }); }
  };

  return (
    <Screen
      title={title}
      subtitle={lost && notice.petName ? notice.petName : notice.title}
      onBack={guard.leave}
      footer={(
        <>
          <Button type="submit" form="sighting-form" variant="primary" block loading={pending}>Share this sighting</Button>
          <Button variant="ghost" block onClick={guard.leave} disabled={pending}>Cancel</Button>
        </>
      )}
    >
      {notice.mine ? (
        <Callout tone="info">Add a sighting someone told you about, so it is kept in the history and shared with the subdivision.</Callout>
      ) : (
        <p className="rs-hint">Your name is never shown. Only the owner and the Subdivision Leader see the exact spot.</p>
      )}
      {error ? <FormError message={error} /> : null}
      <form id="sighting-form" className="rs-stack" onSubmit={(e) => void submit(e)} noValidate>
        <div ref={ref} className="rs-stack">
          <Field label={`When did you see ${it}?`} required error={errors.observedAt}>
            <Input type="datetime-local" value={observedAt} max={toLocalInput(now)} onChange={(e) => { setObservedAt(e.target.value); setErrors((p) => ({ ...p, observedAt: undefined })); }} />
          </Field>

          <FieldGroup label={`Where did you see ${it}?`} required error={errors.location}>
            <button type="button" className="rs-locfield" aria-invalid={errors.location ? true : undefined} onClick={() => setPicking(true)}>
              <MapPin size={19} aria-hidden="true" />
              <span>{location ? location.label : 'Choose the place'}</span>
              <span className="rs-locfield__action">{location ? 'Change' : 'Choose'}</span>
            </button>
          </FieldGroup>

          <Field label="What did you see?" required error={errors.description} hint="Which way it went, whether it looked well, and anything that helps someone find it.">
            <Textarea value={description} onChange={(e) => { setDescription(e.target.value); setErrors((p) => ({ ...p, description: undefined })); }} maxLength={400} rows={4} placeholder="Sitting under a parked car near the carport, looked calm." />
          </Field>

          <FieldGroup label="Photo (optional)" hint="Only if you can take it from a safe distance.">
            <MediaPicker value={media} onChange={setMedia} accept="photo" max={1} />
          </FieldGroup>

          <Checkbox checked={onBehalf} onChange={(e) => setOnBehalf(e.target.checked)} label="Someone else saw it and told me." hint="We will note that this is second-hand." />
        </div>
      </form>

      {picking ? (
        <Sheet title={`Where did you see ${it}?`} tall onClose={() => setPicking(false)}>
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
