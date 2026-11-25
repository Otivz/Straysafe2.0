import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin, Maximize2, MessageSquare, Phone } from 'lucide-react';
import { isValidLatLng } from '../../../../preview/geo';
import { LocationMapPreview } from '../../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../../preview/map/MapLegend';
import type { NumberedPoint, TrailLine } from '../../../../preview/map/types';
import { ago, fmtDateTime } from '../../../../preview/lib/format';
import { adminPath } from '../../../config';
import { Button } from '../../../components/Button';
import { Callout } from '../../../components/layout';
import { ANIMAL_ICON } from '../../../components/icons';
import { isLinkRecord, type Hero, type Person } from '../../../data/monitored';
import { buildTrail, legText } from '../../../lib/sightingTrail';
import type { Case } from '../../../data/types';
import type { OpenCaseDialog } from '../dialogState';
import { useMediaViewer, type LightboxMediaItem } from '../../../components/MediaLightbox';

/** The animal's photo, or its kind on a neutral square when there is none (or the picture cannot be loaded). */
function Photo({ hero }: { hero: Hero }) {
  const { openMedia } = useMediaViewer();
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const photos = hero.photos.filter((u) => !broken.has(u));
  const Icon = ANIMAL_ICON[hero.animal];
  const [main, ...rest] = photos;

  const mediaItems: LightboxMediaItem[] = photos.map((u, i) => ({
    url: u,
    kind: 'photo',
    title: `${hero.name} · Photo ${i + 1}`,
    caption: `${hero.animal} · Reported in ${hero.where}`,
  }));

  return (
    <div className="sa-mc-hero__photo">
      <div className="sa-mc-photo relative overflow-hidden">
        {main ? (
          <button
            type="button"
            className="w-full h-full cursor-zoom-in group relative overflow-hidden focus:outline-none focus:ring-2 focus:ring-[var(--sa-brand-tint)]"
            onClick={() => openMedia(mediaItems, 0)}
            aria-label={`Preview photo of ${hero.name}`}
          >
            <img
              src={main}
              alt={`Photo of ${hero.name}`}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
              onError={() => setBroken((b) => new Set(b).add(main))}
            />
            <span className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-end justify-end p-2">
              <span className="rounded-full bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-md">
                <Maximize2 size={14} />
              </span>
            </span>
          </button>
        ) : (
          <Icon size={56} strokeWidth={1.4} aria-hidden="true" />
        )}
      </div>
      {rest.length > 0 ? (
        <p className="sa-mc-thumbs">
          {rest.slice(0, 4).map((u, i) => (
            <button
              key={u}
              type="button"
              className="cursor-zoom-in group relative overflow-hidden rounded-lg border border-[var(--sa-line)] bg-[var(--sa-sand)] focus:outline-none focus:ring-2 focus:ring-[var(--sa-brand-tint)]"
              onClick={() => openMedia(mediaItems, i + 1)}
              aria-label={`Preview photo ${i + 2} of ${hero.name}`}
            >
              <img
                src={u}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-110"
                onError={() => setBroken((b) => new Set(b).add(u))}
              />
              <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors" />
            </button>
          ))}
        </p>
      ) : null}
    </div>
  );
}

const telOf = (phone: string) => phone.replace(/[^\d+]/g, '');
const hasValue = (v: string) => v.trim() !== '' && v.trim() !== '—';

/** One person the Leader may need to reach. The phone number and the address are shown to the Leader only; nothing here is copied anywhere else. */
function PersonBlock({ p, onContact }: { p: Person; onContact?: () => void }) {
  return (
    <div className="sa-mc-person">
      <p className="sa-mc-kicker">{p.role}</p>
      <p className="sa-mc-person__name">{p.name}</p>
      {hasValue(p.where) ? <p className="sa-small sa-text-2">{p.where}</p> : null}
      {hasValue(p.phone) ? <p className="sa-mc-person__line"><Phone size={14} aria-hidden="true" /><a href={`tel:${telOf(p.phone)}`}>{p.phone}</a></p> : <p className="sa-small sa-text-3">No phone number</p>}
      {hasValue(p.email) ? <p className="sa-mc-person__line"><Mail size={14} aria-hidden="true" /><a href={`mailto:${p.email}`} className="break-all">{p.email}</a></p> : null}
      {p.note ? <p className="sa-small sa-text-2">{p.note}</p> : null}
      <p className="sa-mc-person__acts">
        {onContact ? <Button variant="link" size="sm" icon={MessageSquare} onClick={onContact}>{p.contact?.label ?? 'Open conversation'}</Button> : null}
        {p.residentId ? <Link className="sa-small" to={adminPath(`/residents/${p.residentId}`)}>View profile</Link> : null}
      </p>
    </div>
  );
}

/**
 * THE FIRST THING A LEADER READS: the animal (its photo, its name, what it looks like), what happened (when and where it was last seen or found, in the
 * reporter's own words) and who to talk to. Nothing here is a task. The map is one tap away, because the place is already in words.
 */
export default function HeroBlock({ c, hero, people, now, openDialog, canLog }: { c: Case; hero: Hero; people: Person[]; now: Date; openDialog: OpenCaseDialog; canLog: boolean }) {
  // null: not chosen yet. The map then opens by itself when there is a trail to read (two or more places), and stays one tap away otherwise.
  const [mapChoice, setMapChoice] = useState<boolean | null>(null);
  const [zoneOff, setZoneOff] = useState(false);
  const sightings = (c.lostPet?.sightings ?? []).filter((s) => !isLinkRecord(s)).sort((a, b) => a.seenAt.localeCompare(b.seenAt));
  // A sighting the Leader dismissed ("not a match") is not drawn and does not take a number: the numbers are the place among the others.
  const shown = sightings.filter((s) => s.review !== 'dismissed');
  const numbered: NumberedPoint[] = shown.flatMap((s, i) => (isValidLatLng(s.lat, s.lng) ? [{ n: i + 1, lat: s.lat as number, lng: s.lng as number, latest: i === shown.length - 1 }] : []));
  const pin = hero.pin && isValidLatLng(hero.pin.lat, hero.pin.lng) ? hero.pin : null;
  const hasMap = pin !== null || numbered.length > 0;
  // The trail: the last-seen place, then each place a neighbour reported, in the order they were seen. A guide, not live tracking. The area to
  // start looking is only for a missing pet that is still open (a found animal is not being looked for, a closed case is history).
  const trail = buildTrail({ start: pin ? { ...pin, at: hero.when } : null, sightings, animal: hero.animal, now, open: c.status !== 'closed' && hero.kind === 'lost' });
  const lines: TrailLine[] = trail.legs.flatMap((l) => (l.kind === 'same' ? [] : [{ from: l.from, to: l.to, kind: l.kind }]));
  const zone = zoneOff ? null : trail.zone;
  const hasTrail = trail.legs.length > 0;
  const mapOpen = mapChoice ?? hasTrail;
  const has = (k: TrailLine['kind']) => lines.some((l) => l.kind === k);
  const when = hero.when ? <><strong>{fmtDateTime(hero.when)}</strong>{ago(hero.when, now) ? <span className="sa-text-3"> · {ago(hero.when, now)}</span> : null}</> : <span className="sa-text-3">Time not given</span>;

  return (
    <section
      className="sa-mc-hero sa-mc-card sa-mc-card--hero"
      aria-label={`${hero.name}: the animal and what happened`}
    >
      <Photo hero={hero} />

      <div className="sa-mc-hero__head">
        <h1 className="sa-mc-hero__name">{hero.name}</h1>
        <p className="sa-mc-hero__about">{hero.about}</p>
        {hero.looks ? <p className="sa-mc-hero__looks">{hero.looks}</p> : null}
        {hero.petId ? <p className="sa-small mt-1.5"><Link to={adminPath(`/pets/${hero.petId}`)} className="sa-mc-quiet">Open the pet record</Link>{hero.changed.length > 0 ? <span className="sa-text-amber"> · the record changed since this report: {hero.changed.join(', ')}</span> : null}</p> : null}
      </div>

      <div className="sa-mc-hero__story">
        <p className="sa-mc-kicker">{hero.whenLabel}</p>
        <p className="sa-mc-story__when">{when}<span className="sa-mc-story__where"><MapPin size={14} aria-hidden="true" />{hero.where}</span></p>
        {hero.words ? <blockquote className="sa-mc-quote">“{hero.words}”</blockquote> : null}
        {hasMap ? (
          <div className="mt-3">
            <Button variant="link" size="sm" aria-expanded={mapOpen} onClick={() => setMapChoice(!mapOpen)}>{mapOpen ? 'Hide the map' : hasTrail ? 'Show the trail on the map' : 'Show on the map'}</Button>
            {mapOpen ? (
              <figure className="mt-2 flex flex-col">
                <LocationMapPreview pin={pin ?? undefined} numbered={numbered} trail={lines} zone={zone} height={hasTrail ? 280 : 210} interactive label={`Map of where ${hero.name} was ${hero.kind === 'lost' ? 'last seen' : 'found'}${numbered.length > 0 ? ' and the places neighbours reported' : ''}${hasTrail ? ', joined in the order they were seen' : ''}`} />
                <MapLegend items={[
                  ...(pin ? [{ kind: 'pin' as const, label: hero.whenLabel }] : []),
                  ...(numbered.length > 0 ? [{ kind: 'dot' as const, label: 'Reported by a neighbour (oldest is 1)' }] : []),
                  ...(has('arrow') ? [{ kind: 'trail' as const, label: 'In the order seen (the arrow shows the way)' }] : []),
                  ...(has('unclear') ? [{ kind: 'unclear' as const, label: 'Too long between the two to say which way' }] : []),
                  ...(has('jump') ? [{ kind: 'jump' as const, label: 'Far for the time: may be another animal' }] : []),
                  ...(zone ? [{ kind: 'zone' as const, label: `Where to start looking (about ${zone.radiusM} m)` }] : []),
                  { kind: 'outline' as const, label: 'Approximate subdivision outline' },
                ]} />
                {trail.warnings.length > 0 ? (
                  <Callout tone="amber" className="mt-2">
                    <ul className="m-0 list-disc pl-4">{trail.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                  </Callout>
                ) : null}
                {hasTrail ? (
                  <details className="sa-trail mt-2">
                    <summary>How it moved · {trail.legs.length} {trail.legs.length === 1 ? 'step' : 'steps'}</summary>
                    <ol className="sa-trail__steps">{trail.legs.map((l) => <li key={`${l.from.key}-${l.to.key}`} data-kind={l.kind}>{legText(l, hero.whenLabel)}</li>)}</ol>
                  </details>
                ) : null}
                {trail.zone ? (
                  <label className="sa-trail__zone">
                    <input type="checkbox" checked={!zoneOff} onChange={(e) => setZoneOff(!e.target.checked)} />
                    <span>Show where to start looking</span>
                  </label>
                ) : null}
                <figcaption className="sa-meta mt-1.5">
                  {hasTrail ? 'The dashed line joins the places in the order they were seen; nobody knows the way the animal took. ' : ''}
                  {trail.zone ? 'The green area is a guide to where to start looking, not a prediction. ' : ''}
                  Only authorized administrators see the exact spots. It is not live tracking.
                </figcaption>
              </figure>
            ) : null}
          </div>
        ) : null}
      </div>

      <aside className="sa-mc-hero__people" aria-label="Who to contact">
        {people.map((p) => <PersonBlock key={`${p.role}-${p.name}`} p={p} {...(canLog && p.contact ? { onContact: () => openDialog({ kind: 'messages', target: p.contact! }) } : {})} />)}
      </aside>
    </section>
  );
}
