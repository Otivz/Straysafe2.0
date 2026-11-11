import { Link } from 'react-router-dom';
import { Eye, EyeOff, Footprints, HandHeart, House, PartyPopper } from 'lucide-react';
import { fmtDateTime, relative } from '../../../preview/lib/format';
import { PhotoStrip, SightingCard } from '../../components/Cards';
import { CoordinationPanel } from '../../components/CoordinationPanel';
import { Screen } from '../../components/Screen';
import { Callout, LinkButton, Section } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { reportById } from '../../data/selectors';
import type { Notice, Sighting } from '../../data/types';
import { useNow } from '../../lib/hooks';
import { GeneralAreaMap, NoticeHead } from './NoticeParts';

/** What identifies the animal. Only what the server sent: nothing is invented, and an empty list is not drawn. */
function Identity({ notice }: { notice: Notice }) {
  const id = notice.identity;
  if (!notice.animalType && !id) return null;
  return (
    <dl className="rs-kv">
      {notice.animalType ? <div><dt>Animal</dt><dd>{ANIMAL_TYPES[notice.animalType]}</dd></div> : null}
      {id?.breed ? <div><dt>Breed</dt><dd>{id.breed}</dd></div> : null}
      {id?.color ? <div><dt>Colour</dt><dd>{id.color}</dd></div> : null}
      {id?.marks ? <div><dt>Markings</dt><dd>{id.marks}</dd></div> : null}
    </dl>
  );
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
 * R18 — A lost-pet notice, in the order a person needs it:
 *   who it is (photo, name, what it looks like, whether it is still missing)
 *   -> a possible recovery, when someone may have the pet (owner and the writer only)
 *   -> where it was last seen, from the owner's report
 *   -> the sightings neighbours reported since (clearly a different thing: reports, not tracking)
 * The owner's actions are "Sightings" and "My pet is home" (always with an explicit confirmation); a neighbour's are "I saw this pet" and
 * "I may have this pet safely with me". A neighbour never sees the owner's contact details, and an ordinary sighting never opens a conversation.
 */
export function LostView({ notice }: { notice: Notice }) {
  const { state } = useResidentData();
  const now = useNow();
  const report = notice.reportId ? reportById(state, notice.reportId) : undefined;
  const role = notice.viewerRole ?? (notice.mine ? 'owner' : 'neighbor');
  const owner = role === 'owner';
  const finder = role === 'finder';
  const ended = notice.status !== 'active';
  const name = notice.petName ?? report?.petName ?? (owner ? 'Your pet' : 'This pet');

  const all = [...notice.sightings].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const leads = all.filter((s) => s.kind === 'secured');
  const seen = all.filter((s) => s.kind !== 'secured');
  const latest = seen.find((s) => s.review?.status !== 'dismissed');
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
    <Screen title="Lost pet" back="/community" footer={footer}>
      <NoticeHead notice={notice} />
      {ended ? <EndedCallout notice={notice} name={name} /> : null}
      <PhotoStrip count={notice.photos} media={report?.media} urls={notice.photoUrls} />
      <Identity notice={notice} />
      {notice.description ? <p className="rs-prose">{notice.description}</p> : null}

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

      <Section title="Where it was last seen">
        <p className="rs-hint">From the owner’s report, when the pet went missing.</p>
        <dl className="rs-kv">
          {notice.lastSeenAt ? <div><dt>When</dt><dd>{relative(notice.lastSeenAt, now)} · {fmtDateTime(notice.lastSeenAt)}</dd></div> : null}
          <div><dt>General area</dt><dd>{notice.area}</dd></div>
        </dl>
        <GeneralAreaMap notice={notice} what="last seen" />
      </Section>

      <Section
        title="Sightings since then"
        action={seen.length > 2 ? <Link to={path('/sightings')} className="rs-seeall">See all {seen.length}</Link> : undefined}
      >
        {seen.length === 0 ? (
          <p className="rs-sub">{owner ? 'No one has reported seeing your pet yet. When they do, you get a notification.' : 'No one has reported seeing this pet yet.'}</p>
        ) : (
          <>
            <p className="rs-hint">Each one is a report from a neighbour at the time shown. It is not live tracking and does not show where {owner ? 'your pet' : 'the pet'} is now.</p>
            <ol className="rs-sightings" aria-label="Latest sightings">
              {seen.slice(0, 2).map((s, i) => <SightingCard key={s.id} sighting={s} now={now} latest={i === 0 && latest === s} />)}
            </ol>
          </>
        )}
      </Section>

      {owner ? (
        <section className="rs-visibility rs-visibility--published" aria-label="What neighbours see">
          <p className="rs-visibility__title"><Eye size={18} aria-hidden="true" />Visible to neighbours</p>
          <p>The photo, description, general area and when it was last seen. They can tell you they saw it, or that they may have it.</p>
          <p className="rs-visibility__title"><EyeOff size={18} aria-hidden="true" />Never shown</p>
          <p>Your name, phone number, address and the exact spot. A neighbour who may have your pet can message you only if you both agree.</p>
          {report ? <Link to={residentPath(`/reports/${report.id}`)} className="rs-seeall">View my report</Link> : null}
        </section>
      ) : !ended && !finder ? (
        <Callout tone="info">Please don’t chase, corner or feed the animal; a frightened pet may run. If you see it, tell the owner with “I saw this pet”. If it is safely with you, use “I may have this pet safely with me”. Don’t post your own contact details.</Callout>
      ) : null}
    </Screen>
  );
}
