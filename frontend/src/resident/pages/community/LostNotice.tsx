import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Footprints, HandHeart, House, MapPin, PartyPopper } from 'lucide-react';
import { fmtDay, fmtTime, relative } from '../../../preview/lib/format';
import { placePhrase } from '../../../preview/lib/place';
import { SightingCard } from '../../components/Cards';
import { CoordinationPanel } from '../../components/CoordinationPanel';
import { Screen } from '../../components/Screen';
import { ANIMAL_ICON } from '../../components/icons';
import { Button, Callout, LinkButton, MediaThumbs, Pill, Section } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { reportById } from '../../data/selectors';
import type { Notice, Sighting } from '../../data/types';
import { useNow } from '../../lib/hooks';
import { GeneralAreaMap } from './NoticeParts';

/** What the animal looks like, in one line: the kind of animal, the breed, the colour and the markings the server shared. Nothing is invented. */
function looksOf(notice: Notice): string {
  const id = notice.identity;
  const lower = (t?: string) => (t ? t[0].toLowerCase() + t.slice(1) : '');
  return [notice.animalType ? ANIMAL_TYPES[notice.animalType] : '', id?.breed ?? '', lower(id?.color), lower(id?.marks)].filter(Boolean).join(' · ');
}

/** How a notice that is no longer active ended. "Home" is only ever the owner's own confirmation; every other ending says what it was. */
function EndedCallout({ notice, name }: { notice: Notice; name: string }) {
  if (notice.status === 'requested') return <Callout tone="info" title="This notice has not been published.">It is not visible in Community yet.</Callout>;
  if (notice.closeOutcome === 'recovered' || notice.recoveredAt) {
    return <Callout tone="sage" icon={PartyPopper} title={`${name} is home.`}>Thank you to everyone who helped look. The notice is closed and sightings are no longer taken.</Callout>;
  }
  const title = notice.closeOutcome === 'withdrawn' ? 'The owner withdrew this notice.' : notice.closeOutcome === 'merged' ? 'This notice was merged into another report.' : 'This notice is closed.';
  return <Callout tone="info" title={title}>{notice.closeReason?.trim() || 'It no longer appears in Community, and sightings are no longer taken.'}</Callout>;
}

/** Possible-recovery reports ("I may have this pet safely with me"), each with its own conversation. Only the owner and the writer ever get this list. */
function Leads({ notice, leads, now }: { notice: Notice; leads: Sighting[]; now: Date }) {
  return (
    <ol className="rs-sightings" aria-label="Possible recovery reports">
      {leads.map((s) => {
        const conversation = notice.coordinations?.find((c) => c.sightingId === s.id);
        return <SightingCard key={s.id} sighting={s} now={now}>{conversation ? <CoordinationPanel notice={notice} coordination={conversation} /> : null}</SightingCard>;
      })}
    </ol>
  );
}

/**
 * R18 — A lost-pet notice, in the order a person needs it, kept short:
 *   who it is (photo, name and looks in one block) -> where and when it was last seen (one line; the general-area map one tap away)
 *   -> a possible recovery, when someone may have the pet (owner and the writer only) -> the latest sighting, with the rest one tap away.
 * The owner's actions are "Sightings" and "My pet is home" (always with an explicit confirmation); a neighbour's are "I saw this pet" and
 * "I may have this pet safely with me". A neighbour never sees the owner's contact details, and an ordinary sighting never opens a conversation.
 */
export function LostView({ notice }: { notice: Notice }) {
  const { state } = useResidentData();
  const now = useNow();
  const [map, setMap] = useState(false);
  const report = notice.reportId ? reportById(state, notice.reportId) : undefined;
  const role = notice.viewerRole ?? (notice.mine ? 'owner' : 'neighbor');
  const owner = role === 'owner';
  const finder = role === 'finder';
  const ended = notice.status !== 'active';
  const name = notice.petName ?? report?.petName ?? (owner ? 'Your pet' : 'This pet');
  const photos = notice.photoUrls?.length ? notice.photoUrls : (report?.media ?? []).filter((m) => m.kind === 'photo' && m.url).map((m) => m.url as string);
  const Animal = ANIMAL_ICON[notice.animalType ?? 'other'];

  const all = [...notice.sightings].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const leads = all.filter((s) => s.kind === 'secured');
  const seen = all.filter((s) => s.kind !== 'secured');
  const latest = seen.find((s) => s.review?.status !== 'dismissed') ?? seen[0];
  const path = (rest: string) => residentPath(`/community/${notice.id}${rest}`);

  const footer = ended || finder ? undefined : owner ? (
    <>
      <LinkButton variant="primary" block icon={Footprints} to={path('/sightings')}>Sightings ({seen.length})</LinkButton>
      {report ? <LinkButton block icon={House} to={residentPath(`/reports/${report.id}/recovered`)}>My pet is home</LinkButton> : null}
    </>
  ) : (
    <>
      <LinkButton variant="primary" block icon={Eye} to={path('/sighting')}>I saw this pet</LinkButton>
      <LinkButton block icon={HandHeart} to={path('/secured')}>I may have this pet safely with me</LinkButton>
    </>
  );

  return (
    <Screen title={name} subtitle={owner ? 'Your notice, as neighbours see it' : 'Missing pet'} back="/community" footer={footer}>
      {ended ? <EndedCallout notice={notice} name={name} /> : null}
      <div className="rs-pethero">
        <span className="rs-pethero__photo">{photos[0] ? <img src={photos[0]} alt={`Photo of ${name}`} /> : <Animal size={34} aria-hidden="true" />}</span>
        <div className="min-w-0 rs-stack-xs">
          <h2 className="rs-title rs-title--sm">{name}</h2>
          {looksOf(notice) ? <p className="rs-meta">{looksOf(notice)}</p> : null}
          {notice.mine && !ended ? <p><Pill tone="brand">Your notice</Pill></p> : null}
        </div>
      </div>
      {photos.length > 1 ? <MediaThumbs media={photos.slice(1).map((url, i) => ({ id: `p${i}`, name: `Photo ${i + 2}`, kind: 'photo' as const, size: 0, url }))} /> : null}

      <p className="rs-line">
        <MapPin size={16} aria-hidden="true" />
        <span>Last seen {placePhrase(notice.area, 'in the subdivision')}{notice.lastSeenAt ? <>, {fmtDay(notice.lastSeenAt)} at {fmtTime(notice.lastSeenAt)} <span className="rs-meta">· {relative(notice.lastSeenAt, now)}</span></> : null}</span>
      </p>
      {notice.description ? <blockquote className="rs-quote">“{notice.description}”</blockquote> : null}
      {notice.approx ? (map ? <GeneralAreaMap notice={notice} what="last seen" /> : <div><Button size="sm" icon={MapPin} onClick={() => setMap(true)}>Show the area on a map</Button></div>) : null}

      {(owner || finder) && leads.length > 0 ? (
        <Section title={finder ? 'You may have this pet' : leads.length === 1 ? 'Someone may have your pet' : `${leads.length} reports that someone may have your pet`}>
          {finder ? (
            <Callout tone="sage" icon={HandHeart} title="Thank you for helping.">Only the owner and the Subdivision Leader can see your report. It never marks the pet as home: only the owner can do that, once they have their pet back.</Callout>
          ) : !ended ? (
            <Callout tone="amber" title="Only you and the Subdivision Leader see these.">A report that someone may have {name} does not mark {name} as home. Use “My pet is home” only once you have your pet back.</Callout>
          ) : null}
          <Leads notice={notice} leads={leads} now={now} />
        </Section>
      ) : null}

      <Section
        title={<>Sightings <span className="rs-count rs-meta">{seen.length}</span></>}
        action={seen.length > 1 ? <Link to={path('/sightings')} className="rs-seeall">See all</Link> : undefined}
      >
        {latest ? (
          <ol className="rs-sightings" aria-label="The latest sighting">
            <SightingCard sighting={latest} now={now} latest />
          </ol>
        ) : (
          <p className="rs-sub">{owner ? 'No one has reported seeing your pet yet. When they do, you get a notification.' : 'No one has reported seeing this pet yet.'}</p>
        )}
      </Section>

      {owner ? (
        <p className="rs-hint">Neighbours see the photo, the description and the general area: never your name, phone number, address or the exact spot.{report ? <> <Link to={residentPath(`/reports/${report.id}`)}>View my report</Link></> : null}</p>
      ) : !ended && !finder ? (
        <p className="rs-hint">Please don’t chase or corner {name === 'This pet' ? 'it' : name}: a frightened pet may run.</p>
      ) : null}
    </Screen>
  );
}
