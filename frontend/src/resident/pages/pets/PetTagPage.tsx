import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Printer } from 'lucide-react';
import { ANIMAL_ICON } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { Button, Callout, NotFoundState, Skeleton } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { petById } from '../../data/selectors';
import { residentApi, type ApiPetTag } from '../../live/api';
import '../../styles/petTag.css';

type Size = 'card' | 'collar';

/**
 * The printable QR tag of one pet: the QR code, the pet's photo and name, "Scan if found" and the subdivision name.
 * No owner details. Two sizes: a wallet card (85 x 54 mm) and a collar tag (about 3 x 3 cm, the QR only).
 */
export default function PetTagPage() {
  const { state } = useResidentData();
  const petId = useParams().petId;
  const pet = petById(state, petId);
  const numericId = Number(petId);
  const [tag, setTag] = useState<ApiPetTag | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrBlob, setQrBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<Size>('card');

  useEffect(() => {
    if (!pet || !Number.isInteger(numericId)) return;
    let live = true;
    let objectUrl: string | null = null;
    residentApi.petTag(numericId)
      .then(async (t) => {
        if (!live) return;
        setTag(t);
        if (!t.has_tag) return;
        const blob = await residentApi.petTagQr(numericId);
        if (!live) return;
        objectUrl = URL.createObjectURL(blob);
        setQrBlob(blob);
        setQrUrl(objectUrl);
      })
      .catch((err: unknown) => { if (live) setError((err as Error)?.message || 'The QR tag could not be loaded.'); });
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [pet, numericId]);

  if (!pet) return <Screen title="QR tag" back="/pets"><NotFoundState what="pet" to="/pets" label="Go to My pets" /></Screen>;
  const Icon = ANIMAL_ICON[pet.type];
  const back = `/pets/${pet.id}`;

  const download = () => {
    if (!qrBlob) return;
    const url = URL.createObjectURL(qrBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pet.name.replace(/[^\w-]+/g, '_') || 'pet'}-qr-tag.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  return (
    <Screen title="QR tag" back={back}>
      {error ? (
        <Callout tone="red">{error}</Callout>
      ) : !tag ? (
        <Skeleton h={220} />
      ) : !tag.has_tag ? (
        <Callout tone="amber">{pet.name} has no active QR tag. <a href={residentPath(back)}>Create one on the pet page.</a></Callout>
      ) : (
        <div className="rs-stack">
          <div className="rs-seg" role="group" aria-label="Tag size">
            {(['card', 'collar'] as const).map((s) => (
              <button key={s} type="button" className="rs-seg__btn" aria-pressed={size === s} onClick={() => setSize(s)}>
                {s === 'card' ? 'Card (85 × 54 mm)' : 'Collar tag (3 × 3 cm)'}
              </button>
            ))}
          </div>

          <div className="pt-print-area">
            {size === 'card' ? (
              <div className="pt-card">
                <div className="pt-card__qr">{qrUrl ? <img src={qrUrl} alt={`QR tag of ${pet.name}`} /> : <Skeleton h={120} />}</div>
                <div className="pt-card__info">
                  <span className="pt-card__scan">Scan if found</span>
                  <span className="pt-card__photo">{pet.photoUrl ? <img src={pet.photoUrl} alt="" /> : <Icon size={28} aria-hidden="true" />}</span>
                  <strong className="pt-card__name">{pet.name}</strong>
                  <span className="pt-card__meta">{ANIMAL_TYPES[pet.type]}{pet.breed ? ` · ${pet.breed}` : ''}</span>
                  {state.subdivisionName ? <span className="pt-card__meta">{state.subdivisionName}</span> : null}
                </div>
              </div>
            ) : (
              <div className="pt-collar">
                {qrUrl ? <img src={qrUrl} alt={`QR tag of ${pet.name}`} /> : <Skeleton h={100} />}
                <span>Scan if found</span>
              </div>
            )}
          </div>

          <Button variant="primary" block icon={Printer} onClick={() => window.print()}>Print</Button>
          <Button block icon={Download} disabled={!qrBlob} onClick={download}>Download QR image</Button>
          <p className="rs-meta">
            The tag shows only {pet.name}’s photo, name and type, and your subdivision. Your name, address and phone number are not on it.
            If the tag is lost, replace it on the pet page: the old one then stops working.
          </p>
          {!tag.link_is_public ? (
            <Callout tone="amber">The app’s public address is not set yet, so this tag only opens on this network.</Callout>
          ) : null}
        </div>
      )}
    </Screen>
  );
}
