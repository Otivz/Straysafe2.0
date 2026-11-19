import '../../../preview/styles/tokens.css';
import '../../styles/resident.css';
import { lazy, Suspense, useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, CircleCheck, Eye, HeartHandshake, LocateFixed, MapPin, Maximize2, PawPrint, Send, TriangleAlert } from 'lucide-react';
import { MediaLightbox } from '../../../admin/components/MediaLightbox';
import { httpGet, httpPost } from '../../../live/http';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { Checkbox, Field, Input, Textarea } from '../../components/form';
import { Button, Callout, Skeleton } from '../../components/ui';
import { residentPath } from '../../config';
import { residentApi } from '../../live/api';

const LocationMap = lazy(() => import('../../components/LocationMap'));

/** What the server lets anyone who scans a tag see (GET /t/{token}): never the owner's details. */
interface PublicTag {
  pet_name: string; species: string; breed: string | null; photo_url: string | null; subdivision_name: string | null;
  is_lost: boolean; viewer: 'guest' | 'resident' | 'owner';
  /** Only for a signed-in resident of the subdivision while the pet's lost-pet alert is active (Phase 3). */
  alert_id: number | null;
}

const errorText = (err: unknown, fallback: string) => {
  const e = err as { status?: number; message?: string; kind?: string };
  if (e?.status === 429) return 'Too many messages were sent just now. Please wait a while and try again.';
  if (e?.kind === 'network') return 'No connection. Check your internet and try again.';
  return e?.message || fallback;
};

/**
 * The page a phone opens when its camera reads a pet's QR tag: /t/<token>. No account or app is needed. It shows only the
 * pet's photo, name, type and subdivision, a safety note, and a "tell the owner" form. The finder never sees the owner's
 * details; the owner gets a notification. Phase 2 of docs/06-future-proposals/PET_QR_TAGS_PLAN_2026-11-17.md.
 */
export default function TagScanPage() {
  const token = useParams().token ?? '';
  const [tag, setTag] = useState<PublicTag | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sentCoords, setSentCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    document.title = 'Found a pet? · StraySafe';
    let live = true;
    httpGet<PublicTag>(`/t/${encodeURIComponent(token)}`).then(
      (t) => { if (live) setTag(t); },
      (err: unknown) => {
        if (!live) return;
        const status = (err as { status?: number })?.status;
        setLoadError(status === 404 ? 'This tag is no longer active.' : errorText(err, 'This tag could not be opened right now.'));
      },
    );
    return () => { live = false; };
  }, [token]);

  return (
    <div className="sa-root rs-root">
      <div className="rs-frame">
        <main id="main" className="rs-main rs-content">
          <div className="rs-stack">
            <p className="rs-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><PawPrint size={16} aria-hidden="true" /> StraySafe pet tag</p>
            {loadError ? (
              <Callout tone="amber" title={loadError}>
                The owner may have replaced or turned off this tag. If the animal seems lost, tell the subdivision guardhouse.
              </Callout>
            ) : !tag ? (
              <Skeleton h={240} />
            ) : (
              <>
                <div className="rs-pethero rs-pethero--center">
                  {tag.photo_url ? (
                    <div className="rs-tag-avatar__wrap">
                      <button
                        type="button"
                        className="rs-tag-avatar"
                        onClick={() => setLightboxOpen(true)}
                        aria-label={`View full photo of ${tag.pet_name}`}
                      >
                        <img src={tag.photo_url} alt={tag.pet_name} />
                      </button>
                      <button
                        type="button"
                        className="rs-tag-avatar__max"
                        onClick={() => setLightboxOpen(true)}
                        aria-label="Maximize pet photo"
                        title="Maximize photo"
                      >
                        <Maximize2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <span className="rs-pethero__photo" style={{ borderRadius: '50%' }}><PawPrint size={40} aria-hidden="true" /></span>
                  )}
                  <div className="rs-stack-xs min-w-0">
                    <h1 className="rs-title rs-title--sm">{tag.pet_name}</h1>
                    <p className="rs-meta">{tag.species}{tag.breed ? ` · ${tag.breed}` : ''}</p>
                    {tag.subdivision_name ? <p className="rs-meta">{tag.subdivision_name}</p> : null}
                  </div>
                </div>

                {lightboxOpen && tag.photo_url ? (
                  <MediaLightbox
                    items={[{
                      url: tag.photo_url,
                      kind: 'photo',
                      title: tag.pet_name,
                      caption: [tag.species, tag.breed, tag.subdivision_name].filter(Boolean).join(' · '),
                    }]}
                    onClose={() => setLightboxOpen(false)}
                  />
                ) : null}

                {tag.is_lost ? (
                  <Callout tone="red" title="This pet is missing.">Its owner is looking for it. Please tell them where it is.</Callout>
                ) : null}

                <Callout tone="amber" icon={TriangleAlert} title="Stay safe">
                  Keep your distance and do not chase or grab the animal. If it is frightened or aggressive, tell the subdivision guardhouse.
                </Callout>

                {tag.viewer === 'owner' ? (
                  <Callout tone="info">
                    This is your own pet’s tag. Messages from people who scan it appear on <a href={residentPath('/pets')}>your pet’s page</a>.
                  </Callout>
                ) : sent ? (
                  <div className="rs-stack-sm">
                    <Callout tone="sage" icon={CircleCheck} title="The owner has been told. Thank you!">
                      If you shared your number, the owner may call you. Meet in a public place or at the guardhouse.
                    </Callout>
                    {sentCoords ? (
                      <div className="rs-card rs-stack-sm" style={{ alignItems: 'stretch' }}>
                        <p className="rs-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={14} aria-hidden="true" /> Location pin shared with {tag.pet_name}’s owner
                        </p>
                        <LocationMapPreview pin={sentCoords} height={180} label="Location sent to the owner" />
                      </div>
                    ) : null}
                  </div>
                ) : tag.alert_id ? (
                  // A neighbour while the pet's lost-pet alert is active: the existing sighting flows, which notify the owner and the
                  // Leader, put the sighting on the alert's map and open the owner-finder conversation (Phase 3).
                  <div className="rs-card rs-stack-sm" style={{ alignItems: 'stretch' }}>
                    <h2 className="rs-h2">Help bring {tag.pet_name} home</h2>
                    <p className="rs-sub">{tag.pet_name} has a missing-pet notice in your subdivision. Tell the owner through it:</p>
                    <a className="rs-btn rs-btn--primary rs-btn--block" href={residentPath(`/community/alert-${tag.alert_id}/sighting`)}><Eye size={18} aria-hidden="true" />I saw this pet</a>
                    <a className="rs-btn rs-btn--secondary rs-btn--block" href={residentPath(`/community/alert-${tag.alert_id}/secured`)}><HeartHandshake size={18} aria-hidden="true" />I have it safely with me</a>
                  </div>
                ) : (
                  <FoundForm token={token} petName={tag.pet_name} signedIn={tag.viewer === 'resident'} onSent={(c) => { setSentCoords(c); setSent(true); }} />
                )}

                <p className="rs-meta">The owner’s name, address and phone number are private and not shown here.</p>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function FoundForm({ token, petName, signedIn, onSent }: { token: string; petName: string; signedIn: boolean; onSent: (coords: { lat: number; lng: number } | null) => void }) {
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [share, setShare] = useState(false);
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placeError, setPlaceError] = useState<string | undefined>();

  const locate = () => {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError('Your location can only be read on a secure (https) page. Tap the map to place the pin instead.');
      return;
    }
    if (!('geolocation' in navigator)) { setError('This browser cannot share your location. Tap the map or describe the place instead.'); return; }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setPlaceError(undefined); setLocating(false); },
      () => { setError('Your location could not be read. Tap the map or describe the place instead.'); setLocating(false); },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!place.trim() && !coords) { setPlaceError('Say where you found the pet, tap the map, or add your current location.'); return; }
    setPlaceError(undefined);
    if (share && !phone.trim()) { setError('Enter your phone number, or untick “Share my number”.'); return; }
    setPending(true);
    try {
      let photoUrl: string | null = null;
      if (photo && signedIn) photoUrl = (await residentApi.uploadChatMedia(photo)).url;
      await httpPost(`/t/${encodeURIComponent(token)}/found`, {
        location_label: place.trim() || null,
        latitude: coords?.lat ?? null,
        longitude: coords?.lng ?? null,
        note: note.trim() || null,
        share_contact: share,
        finder_phone: share ? phone.trim() : null,
        photo_url: photoUrl,
      });
      onSent(coords);
    } catch (err) {
      setError(errorText(err, 'Your message could not be sent. Please try again.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="rs-card rs-stack" style={{ alignItems: 'stretch' }} onSubmit={(e) => { void submit(e); }} noValidate>
      <h2 className="rs-h2">Tell {petName}’s owner</h2>
      <Field label="Where is the pet?" required error={placeError} hint="For example: near the clubhouse, Block 4 park.">
        <Input value={place} maxLength={255} onChange={(e) => setPlace(e.target.value)} />
      </Field>
      <Button icon={LocateFixed} loading={locating} onClick={locate}>{coords ? 'Location pinned on map ✓' : 'Add my current location'}</Button>
      <div className="rs-stack-sm">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span className="rs-meta">Tap the map to drop or adjust the pin.</span>
          {coords ? (
            <button type="button" className="rs-btn rs-btn--link" onClick={() => setCoords(null)} style={{ padding: 0, minHeight: 'auto' }}>Clear pin</button>
          ) : null}
        </div>
        {tilesFailed ? (
          <Callout tone="amber">The map background could not load. You can still tap “Add my current location” or describe the place above.</Callout>
        ) : (
          <Suspense fallback={<Skeleton h={290} />}>
            <LocationMap
              pin={coords}
              onPick={(lat, lng) => { setCoords({ lat, lng }); setPlaceError(undefined); }}
              onTilesFailed={() => setTilesFailed(true)}
            />
          </Suspense>
        )}
      </div>
      <Field label="Message" optional hint="How the pet looks, whether you are keeping it safe, when you saw it.">
        <Textarea value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {signedIn ? (
        <Field label="Photo" optional>
          <Input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </Field>
      ) : (
        <p className="rs-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Camera size={14} aria-hidden="true" /><span>Residents who <a href={residentPath('/login')}>sign in</a> can also attach a photo.</span></p>
      )}
      <Checkbox
        label="Share my number with the owner"
        hint="Only the owner sees it, so they can call you. It is deleted when the matter is closed."
        checked={share}
        onChange={(e) => setShare(e.target.checked)}
      />
      {share ? (
        <Field label="Your mobile number" required>
          <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="09171234567" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      ) : null}
      {error ? <Callout tone="red">{error}</Callout> : null}
      <Button type="submit" variant="primary" block icon={Send} loading={pending}>Send to the owner</Button>
    </form>
  );
}
