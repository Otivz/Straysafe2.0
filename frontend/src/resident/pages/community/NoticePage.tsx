import { Link, useParams } from 'react-router-dom';
import { Check, EyeOff, Eye, Footprints, ShieldCheck } from 'lucide-react';
import { fmtDate, fmtDateTime, relative } from '../../../preview/lib/format';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../preview/map/MapLegend';
import { PhotoStrip, SightingCard } from '../../components/Cards';
import { Screen } from '../../components/Screen';
import { Callout, ClaimPill, LinkButton, NotFoundState, Pill, Section, UpdateTimeline } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES, NOTICE_TYPES, SAMPLE_OFFICE } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { claimForNotice, latestSighting, noticeById, reportById } from '../../data/selectors';
import type { Notice } from '../../data/types';
import { useNow } from '../../lib/hooks';

/**
 * The only map a community notice may show: a general area (a rounded position with a circle around it), never the exact
 * spot. The exact spot stays on the owner's own report, visible to them and to administrators.
 */
function GeneralAreaMap({ notice, what }: { notice: Notice; what: 'last seen' | 'found' }) {
  if (!notice.approx) return null;
  return (
    <figure className="rs-figure">
      <LocationMapPreview areas={[notice.approx]} height={170} label={`Map of the general area where it was ${what}: ${notice.area}`} />
      <MapLegend items={[{ kind: 'area', label: `General area where it was ${what}` }, { kind: 'outline', label: 'Approximate subdivision outline' }]} />
      <figcaption className="rs-hint">A general area only. The exact spot is shown only to {notice.mine ? 'you' : 'the person who reported it'} and subdivision administrators.</figcaption>
    </figure>
  );
}

function Head({ notice }: { notice: Notice }) {
  return (
    <header className="rs-stack-sm">
      <p className="rs-card__kicker">{NOTICE_TYPES[notice.type].label}{notice.mine ? <Pill tone="brand">Your notice</Pill> : null}{notice.status === 'recovered' ? <Pill tone="sage">Recovered</Pill> : null}</p>
      <h2 className="rs-title rs-title--sm">{notice.title}</h2>
      <p className="rs-meta">{notice.area} · published {fmtDate(notice.publishedAt)}</p>
    </header>
  );
}

/** R18 — Lost-pet notice, seen by the owner (with their actions) or by a neighbour (who can report a sighting). */
function LostView({ notice }: { notice: Notice }) {
  const { state } = useResidentData();
  const now = useNow();
  const report = notice.reportId ? reportById(state, notice.reportId) : undefined;
  const name = report?.petName ?? (notice.mine ? 'Your pet' : 'This pet');
  const seen = notice.sightings.length;
  const latest = latestSighting(notice);

  return (
    <Screen
      title="Lost pet"
      back="/community"
      footer={notice.status === 'recovered' ? undefined : notice.mine ? (
        <>
          <LinkButton variant="primary" block icon={Footprints} to={residentPath(`/community/${notice.id}/sightings`)}>Sightings ({seen})</LinkButton>
          {report ? <LinkButton block to={residentPath(`/reports/${report.id}/recovered`)}>My pet is home</LinkButton> : null}
        </>
      ) : (
        <>
          <LinkButton variant="primary" block icon={Footprints} to={residentPath(`/community/${notice.id}/sighting`)}>I saw this pet</LinkButton>
          <LinkButton block to={residentPath(`/community/${notice.id}/sightings`)}>See sightings ({seen})</LinkButton>
        </>
      )}
    >
      <Head notice={notice} />
      {notice.status === 'recovered' ? <Callout tone="sage" title={`${name} is home.`}>Thank you to everyone who helped look.</Callout> : null}
      <PhotoStrip count={notice.photos} media={report?.media} />
      <p className="rs-prose">{notice.description}</p>
      <GeneralAreaMap notice={notice} what="last seen" />
      <dl className="rs-kv">
        {notice.animalType ? <div><dt>Animal</dt><dd>{ANIMAL_TYPES[notice.animalType]}</dd></div> : null}
        {notice.lastSeenAt ? <div><dt>Last seen</dt><dd>{relative(notice.lastSeenAt, now)} · {fmtDateTime(notice.lastSeenAt)}</dd></div> : null}
        <div><dt>General area</dt><dd>{notice.area}</dd></div>
        <div><dt>Sightings</dt><dd><Link to={residentPath(`/community/${notice.id}/sightings`)}>{seen === 0 || !latest ? 'None yet' : `${seen} reported, latest ${relative(latest.observedAt, now)}`}</Link></dd></div>
      </dl>

      {notice.mine ? (
        <section className="rs-visibility rs-visibility--published" aria-label="What neighbours see">
          <p className="rs-visibility__title"><Eye size={18} aria-hidden="true" />Visible to neighbours</p>
          <p>They can see the photo, description, general area and when it was last seen.</p>
          <p className="rs-visibility__title"><EyeOff size={18} aria-hidden="true" />Never shown</p>
          <p>Your name, phone number, address and the exact spot. Neighbours reach you only through the subdivision.</p>
          {report ? <Link to={residentPath(`/reports/${report.id}`)} className="rs-seeall">View my report</Link> : null}
        </section>
      ) : (
        <Callout tone="info">Please don’t chase, corner or feed the animal; a frightened pet may run. If you see it, report a sighting and the owner and the subdivision are told. Don’t post your own contact details.</Callout>
      )}
    </Screen>
  );
}

/** R23 — Found-animal notice. Anyone who thinks it is theirs submits an ownership claim, which an administrator reviews. */
function FoundView({ notice }: { notice: Notice }) {
  const { state } = useResidentData();
  const now = useNow();
  const claim = claimForNotice(state, notice.id);
  const report = notice.reportId ? reportById(state, notice.reportId) : undefined;
  const sightings = [...notice.sightings].sort((a, b) => b.observedAt.localeCompare(a.observedAt));

  return (
    <Screen
      title="Found animal"
      back="/community"
      footer={notice.mine || notice.status === 'recovered' ? undefined : claim ? (
        <LinkButton variant="primary" block to={residentPath(`/claims/${claim.id}`)}>View my claim</LinkButton>
      ) : (
        <LinkButton variant="primary" block icon={ShieldCheck} to={residentPath(`/community/${notice.id}/claim`)}>This may be my animal</LinkButton>
      )}
    >
      <Head notice={notice} />
      {notice.status === 'recovered' ? <Callout tone="sage" title="This animal is back with its owner.">The subdivision closed this notice, so it no longer appears in Community.</Callout> : null}
      <PhotoStrip count={notice.photos} media={report?.media} />
      <p className="rs-prose">{notice.description}</p>
      <GeneralAreaMap notice={notice} what="found" />
      <dl className="rs-kv">
        {notice.animalType ? <div><dt>Animal</dt><dd>{ANIMAL_TYPES[notice.animalType]}</dd></div> : null}
        <div><dt>General area</dt><dd>{notice.area}</dd></div>
      </dl>

      <Section
        title="Related sightings"
        action={sightings.length > 2 ? <Link to={residentPath(`/community/${notice.id}/sightings`)} className="rs-seeall">See all {sightings.length}</Link> : undefined}
      >
        {sightings.length === 0 ? (
          <p className="rs-sub">No one has reported seeing this animal elsewhere yet.</p>
        ) : (
          <ol className="rs-sightings" aria-label="Latest sightings">
            {sightings.slice(0, 2).map((s, i) => <SightingCard key={s.id} sighting={s} now={now} latest={i === 0} />)}
          </ol>
        )}
        {notice.status === 'active' ? (
          <LinkButton block icon={Footprints} to={residentPath(`/community/${notice.id}/sighting`)}>{notice.mine ? 'Add a sighting someone told me about' : 'I saw this animal too'}</LinkButton>
        ) : null}
      </Section>

      {claim ? (
        <Callout tone="info" title="You have sent a claim.">
          <span className="rs-row-actions"><ClaimPill status={claim.status} /></span>
        </Callout>
      ) : null}
      {notice.mine ? (
        <Callout tone="info" title="Published from your report.">
          {report ? <Link to={residentPath(`/reports/${report.id}`)}>View the report</Link> : null} Ownership claims are handled by the subdivision, which will contact you if you need to do anything.
        </Callout>
      ) : (
        <Callout tone="info" title="Is this yours?">
          The subdivision reviews every ownership claim before anyone hands an animal over. Registering a pet helps, but it does not prove ownership on its own.
        </Callout>
      )}
    </Screen>
  );
}

/** R28 — Safety advisory published by the administrators. */
function AdvisoryView({ notice }: { notice: Notice }) {
  const now = useNow();
  return (
    <Screen title="Safety advisory" back="/community" footer={<LinkButton variant="primary" block to={residentPath('/report')}>Report a concern</LinkButton>}>
      <Head notice={notice} />
      <Callout tone="amber" title="From the subdivision administrators.">Follow this guidance until the administrators say otherwise.</Callout>
      <p className="rs-prose">{notice.description}</p>

      {notice.guidance && notice.guidance.length > 0 ? (
        <Section title="What you can do">
          <ul className="rs-checklist">
            {notice.guidance.map((g) => <li key={g}><Check size={18} aria-hidden="true" /><span>{g}</span></li>)}
          </ul>
        </Section>
      ) : null}

      {notice.updates && notice.updates.length > 0 ? (
        <Section title="Updates">
          <UpdateTimeline
            label="Updates on this advisory"
            now={now}
            updates={notice.updates.map((u) => ({ id: u.id, at: u.at, kind: 'message' as const, title: 'Update from the administrators', body: u.text }))}
          />
        </Section>
      ) : null}

      <Callout tone="info" title="Need help or saw the animal?">
        Tell the guardhouse or the HOA office: <span className="rs-nowrap">{SAMPLE_OFFICE.phone}</span> (sample number). You can also send a private report.
      </Callout>
    </Screen>
  );
}

/** R27 — One community notice. The layout follows the type: lost pet, found animal or safety advisory. */
export default function NoticePage() {
  const { state } = useResidentData();
  const notice = noticeById(state, useParams().noticeId);
  if (!notice) return <Screen title="Notice" back="/community"><NotFoundState what="notice" to="/community" label="Go to Community" /></Screen>;
  if (notice.type === 'lost_pet') return <LostView notice={notice} />;
  if (notice.type === 'found_animal') return <FoundView notice={notice} />;
  return <AdvisoryView notice={notice} />;
}
