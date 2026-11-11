import { Link, useParams } from 'react-router-dom';
import { Check, Footprints, ShieldCheck } from 'lucide-react';
import { PhotoStrip, SightingCard } from '../../components/Cards';
import { Screen } from '../../components/Screen';
import { Callout, ClaimPill, ErrorState, LinkButton, ListSkeleton, NotFoundState, Section, UpdateTimeline } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { claimForNotice, noticeById, noticeEndedLabel, reportById } from '../../data/selectors';
import type { Notice } from '../../data/types';
import { useNow } from '../../lib/hooks';
import { useLoadNotice } from '../../lib/useLoadNotice';
import { useOffice } from '../../lib/useOffice';
import { LostView } from './LostNotice';
import { GeneralAreaMap, NoticeHead } from './NoticeParts';

/** R23 — Found-animal notice. Anyone who thinks it is theirs submits an ownership claim, which an administrator reviews. */
function FoundView({ notice }: { notice: Notice }) {
  const { state } = useResidentData();
  const now = useNow();
  const claim = claimForNotice(state, notice.id);
  const report = notice.reportId ? reportById(state, notice.reportId) : undefined;
  const sightings = [...notice.sightings].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const recovered = notice.closeOutcome === 'reunited' || notice.closeOutcome === 'recovered';

  return (
    <Screen
      title="Found animal"
      back="/community"
      footer={notice.mine || notice.status !== 'active' ? undefined : claim ? (
        <LinkButton variant="primary" block to={residentPath(`/claims/${claim.id}`)}>View my claim</LinkButton>
      ) : (
        <LinkButton variant="primary" block icon={ShieldCheck} to={residentPath(`/community/${notice.id}/claim`)}>This may be my animal</LinkButton>
      )}
    >
      <NoticeHead notice={notice} />
      {notice.status !== 'active' ? <Callout tone={recovered ? 'sage' : 'info'} title={recovered ? 'This animal is back with its owner.' : noticeEndedLabel(notice)}>{notice.closeReason || 'This notice no longer appears in Community.'}</Callout> : null}
      <PhotoStrip count={notice.photos} media={report?.media} urls={notice.photoUrls} />
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
  const { office } = useOffice();
  return (
    <Screen title="Safety advisory" back="/community" footer={<LinkButton variant="primary" block to={residentPath('/report')}>Report a concern</LinkButton>}>
      <NoticeHead notice={notice} />
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
        Tell the guardhouse{office?.phone ? <> or the HOA office: <span className="rs-nowrap">{office.phone}</span></> : ' or the HOA office'}. You can also send a private report.
      </Callout>
    </Screen>
  );
}

/** R27 — One community notice. The layout follows the type: lost pet, found animal or safety advisory. */
export default function NoticePage() {
  const { state } = useResidentData();
  const { noticeId } = useParams();
  const notice = noticeById(state, noticeId);
  const detail = useLoadNotice(noticeId);
  const waiting = detail.status === 'idle' || detail.status === 'loading';
  if (!notice) {
    if (waiting) return <Screen title="Notice" back="/community"><ListSkeleton rows={3} /></Screen>;
    if (detail.status === 'error') return <Screen title="Notice" back="/community"><ErrorState onRetry={detail.retry}>{detail.error}</ErrorState></Screen>;
    return <Screen title="Notice" back="/community"><NotFoundState what="notice" to="/community" label="Go to Community" /></Screen>;
  }
  // A lost-pet or found-animal notice is shown with its sightings, so it waits for them rather than saying "none yet".
  if (notice.type !== 'safety_advisory' && waiting) return <Screen title={notice.type === 'lost_pet' ? 'Lost pet' : 'Found animal'} back="/community"><ListSkeleton rows={3} /></Screen>;
  if (notice.type !== 'safety_advisory' && detail.status === 'error') return <Screen title="Notice" back="/community"><ErrorState onRetry={detail.retry}>{detail.error}</ErrorState></Screen>;
  if (notice.type === 'lost_pet') return <LostView notice={notice} />;
  if (notice.type === 'found_animal') return <FoundView notice={notice} />;
  return <AdvisoryView notice={notice} />;
}
