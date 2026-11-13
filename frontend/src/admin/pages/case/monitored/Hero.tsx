import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MapPin, MessageSquare, Phone } from 'lucide-react';
import { isValidLatLng } from '../../../../preview/geo';
import { LocationMapPreview } from '../../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../../preview/map/MapLegend';
import type { NumberedPoint } from '../../../../preview/map/types';
import { ago, fmtDateTime } from '../../../../preview/lib/format';
import { adminPath } from '../../../config';
import { Button } from '../../../components/Button';
import { ANIMAL_ICON } from '../../../components/icons';
import { isLinkRecord, type Hero, type Person } from '../../../data/monitored';
import type { Case } from '../../../data/types';
import type { OpenCaseDialog } from '../dialogState';

/** The animal's photo, or its kind on a neutral square when there is none (or the picture cannot be loaded). */
function Photo({ hero }: { hero: Hero }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const photos = hero.photos.filter((u) => !broken.has(u));
  const Icon = ANIMAL_ICON[hero.animal];
  const [main, ...rest] = photos;
  return (
    <div className="sa-mc-hero__photo">
      <div className="sa-mc-photo">
        {main ? <img src={main} alt={`Photo of ${hero.name}`} onError={() => setBroken((b) => new Set(b).add(main))} /> : <Icon size={56} strokeWidth={1.4} aria-hidden="true" />}
      </div>
      {rest.length > 0 ? (
        <p className="sa-mc-thumbs">
          {rest.slice(0, 4).map((u, i) => <a key={u} href={u} target="_blank" rel="noreferrer" aria-label={`Open photo ${i + 2} of ${hero.name}`}><img src={u} alt="" loading="lazy" onError={() => setBroken((b) => new Set(b).add(u))} /></a>)}
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
  const [map, setMap] = useState(false);
  const sightings = (c.lostPet?.sightings ?? []).filter((s) => !isLinkRecord(s)).sort((a, b) => a.seenAt.localeCompare(b.seenAt));
  const numbered: NumberedPoint[] = sightings.flatMap((s, i) => (isValidLatLng(s.lat, s.lng) ? [{ n: i + 1, lat: s.lat as number, lng: s.lng as number, latest: i === sightings.length - 1 }] : []));
  const pin = hero.pin && isValidLatLng(hero.pin.lat, hero.pin.lng) ? hero.pin : null;
  const hasMap = pin !== null || numbered.length > 0;
  const when = hero.when ? <><strong>{fmtDateTime(hero.when)}</strong>{ago(hero.when, now) ? <span className="sa-text-3"> · {ago(hero.when, now)}</span> : null}</> : <span className="sa-text-3">Time not given</span>;

  return (
    <section className="sa-mc-hero" aria-label={`${hero.name}: the animal and what happened`}>
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
            <Button variant="link" size="sm" aria-expanded={map} onClick={() => setMap((o) => !o)}>{map ? 'Hide the map' : 'Show on the map'}</Button>
            {map ? (
              <figure className="mt-2 flex flex-col">
                <LocationMapPreview pin={pin ?? undefined} numbered={numbered} height={210} interactive label={`Map of where ${hero.name} was ${hero.kind === 'lost' ? 'last seen' : 'found'}${numbered.length > 0 ? ' and the places neighbours reported' : ''}`} />
                <MapLegend items={[...(pin ? [{ kind: 'pin' as const, label: hero.whenLabel }] : []), ...(numbered.length > 0 ? [{ kind: 'dot' as const, label: 'Reported by a neighbour (oldest is 1)' }] : []), { kind: 'outline' as const, label: 'Approximate subdivision outline' }]} />
                <figcaption className="sa-meta mt-1.5">Only authorized administrators see the exact spots. It is not live tracking.</figcaption>
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
