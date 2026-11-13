import { BellRing, EyeOff, HandHeart, House, Megaphone, MessageSquare, PawPrint, PlusCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { reportIdOf } from '../../../live/refs';
import { fmtDateTime, fmtDay, fmtTime, relative } from '../../../preview/lib/format';
import { placePhrase } from '../../../preview/lib/place';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { SightingCard } from '../../components/Cards';
import { Screen } from '../../components/Screen';
import { Callout, LinkButton, ListSkeleton, MediaThumbs, Row, Section, UpdateTimeline } from '../../components/ui';
import { residentPath } from '../../config';
import { ANIMAL_TYPES } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { noticeById, noticeEndedLabel } from '../../data/selectors';
import type { Report } from '../../data/types';
import { useNow } from '../../lib/hooks';
import { pointOf } from '../../lib/location';
import { useLoadNotice } from '../../lib/useLoadNotice';

const SHOWN = 3;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const lowerFirst = (t: string) => (t ? t[0].toLowerCase() + t.slice(1) : t);

/**
 * R15 for a missing pet: the owner's ONE screen for it, instead of the report, their own view of the notice and the sightings on three screens.
 *
 *   the pet and since when it is missing -> one state, "Under monitoring" -> the sightings (once) -> the notice in Community and the alerts the
 *   Subdivision Leader sent -> the report's details (folded) -> the updates
 *
 * "My pet is home" stays the main action. A missing pet has no review steps to climb, so no status ladder is shown.
 */
export function LostReport({ report, detail }: { report: Report; detail: { status: string; error?: string } }) {
  const { state } = useResidentData();
  const now = useNow();
  const notice = noticeById(state, report.noticeId ?? undefined);
  const load = useLoadNotice(report.noticeId ?? undefined);
  const closed = report.status === 'closed';
  const name = report.petName?.trim() || 'Your pet';
  const photo = notice?.photoUrls?.[0] ?? report.media.find((m) => m.kind === 'photo' && m.url)?.url;
  const all = [...(notice?.sightings ?? [])].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const sightings = all.filter((s) => s.kind !== 'secured');
  const leads = all.filter((s) => s.kind === 'secured' && s.review?.status !== 'dismissed');
  const count = Math.max(sightings.length, notice?.sightingCount ?? 0);
  const waiting = Boolean(report.noticeId) && (load.status === 'idle' || load.status === 'loading') && sightings.length === 0;
  const conversations = (state.conversations ?? []).filter((c) => c.myReportNumber === reportIdOf(report.id));
  const pin = pointOf(report.location);
  const where = report.location.label && report.location.label !== 'Pinned on the map' ? placePhrase(report.location.label) : '';
  const alerts = notice?.leaderAlerts;
  const sightingsPath = notice ? residentPath(`/community/${notice.id}/sightings`) : null;

  return (
    <Screen
      title={name}
      subtitle={`${report.id} · your report`}
      back="/reports"
      footer={closed ? (
        <LinkButton variant="primary" block to={residentPath('/report')}>Report something new</LinkButton>
      ) : (
        <>
          <LinkButton variant="primary" block icon={House} to={residentPath(`/reports/${report.id}/recovered`)}>My pet is home</LinkButton>
          <LinkButton block icon={PlusCircle} to={residentPath(`/reports/${report.id}/update`)}>Add information</LinkButton>
        </>
      )}
    >
      <div className="rs-pethero">
        <span className="rs-pethero__photo">{photo ? <img src={photo} alt={`Photo of ${name}`} /> : <PawPrint size={34} aria-hidden="true" />}</span>
        <div className="min-w-0 rs-stack-xs">
          <h2 className="rs-title rs-title--sm">{closed ? (report.outcome?.resolved ? `${name} is home` : 'This report is closed') : `${name} is missing`}</h2>
          <p className="rs-meta">{closed ? `Closed ${fmtDay(report.outcome?.at ?? report.updatedAt)}` : `Since ${fmtDay(report.observedAt)}, ${fmtTime(report.observedAt)}${where ? ` · ${where}` : ''}`}</p>
        </div>
      </div>

      {closed ? (
        report.outcome ? <Callout tone={report.outcome.resolved ? 'sage' : 'info'} title={`${report.outcome.label}.`}>{report.outcome.resolved ? 'Your notice was taken down and the alerts stopped.' : report.outcome.summary}</Callout> : null
      ) : (
        <div className="rs-row-actions"><span className="rs-pill rs-pill--brand"><span className="rs-pill__dot" aria-hidden="true" />Under monitoring</span><span className="rs-meta">Your Subdivision Leader is following it.</span></div>
      )}

      {!closed && leads.length > 0 && notice ? (
        <Callout tone="amber" icon={HandHeart} title={leads.length === 1 ? `Someone may have ${name}` : `${leads.length} reports that someone may have ${name}`}>
          See what they wrote and choose how to get in touch. <Link to={residentPath(`/community/${notice.id}`)}>Open</Link>
        </Callout>
      ) : null}

      <Section
        title={<>Sightings <span className="rs-count rs-meta">{count}</span></>}
        action={count > 0 && sightingsPath ? <Link to={sightingsPath} className="rs-seeall">Show on map</Link> : undefined}
      >
        {waiting ? <ListSkeleton rows={1} /> : sightings.length === 0 ? (
          <p className="rs-sub">{closed ? 'No sightings were reported.' : `No one has reported seeing ${name} yet. When they do, you get a notification.`}</p>
        ) : (
          <>
            <ol className="rs-sightings" aria-label="Sightings, newest first">
              {sightings.slice(0, SHOWN).map((s, i) => <SightingCard key={s.id} sighting={s} now={now} latest={i === 0} />)}
            </ol>
            {sightings.length > SHOWN && sightingsPath ? <LinkButton block to={sightingsPath}>See all {sightings.length} sightings</LinkButton> : null}
          </>
        )}
      </Section>

      <div className="rs-list">
        {notice ? (
          <Row
            to={residentPath(`/community/${notice.id}`)} icon={Megaphone} title="Your notice in Community"
            meta={notice.status === 'active' ? 'Neighbours can see it · see it as they do' : noticeEndedLabel(notice)}
          />
        ) : (
          <div className="rs-row rs-row--static">
            <span className="rs-row__icon"><EyeOff size={19} aria-hidden="true" /></span>
            <span className="rs-row__text"><span className="rs-row__title">{closed ? 'Your notice was taken down' : 'No notice in Community'}</span><span className="rs-row__meta">Neighbours no longer see it.</span></span>
          </div>
        )}
        <div className="rs-row rs-row--static">
          <span className="rs-row__icon"><BellRing size={19} aria-hidden="true" /></span>
          <span className="rs-row__text">
            <span className="rs-row__title">Alerts from your Subdivision Leader</span>
            <span className="rs-row__meta">{alerts && alerts.sent > 0 ? `${plural(alerts.sent, 'alert')} sent to neighbours${alerts.lastAt ? `, the last ${lowerFirst(relative(alerts.lastAt, now))}` : ''}` : 'None sent yet'}</span>
          </span>
        </div>
      </div>

      {conversations.length > 0 ? (
        <Section title="Conversations">
          <div className="rs-list">
            {conversations.map((c) => <Row key={c.id} to={residentPath(`/conversations/${c.id}`)} icon={MessageSquare} title={c.title} meta={c.status === 'closed' ? c.endedReason ?? 'Conversation ended' : c.unread > 0 ? `${c.unread} unread` : c.subtitle} />)}
          </div>
        </Section>
      ) : null}

      <details className="rs-details">
        <summary>Report details</summary>
        <dl className="rs-kv">
          <div><dt>Animal</dt><dd>{ANIMAL_TYPES[report.animalType]}{report.petName ? ` · ${report.petName}` : ''}</dd></div>
          <div><dt>Last seen</dt><dd>{report.location.label}, {fmtDateTime(report.observedAt)}</dd></div>
          <div><dt>What you told us</dt><dd>{report.description}</dd></div>
          <div><dt>Reported</dt><dd>{fmtDateTime(report.submittedAt)}</dd></div>
        </dl>
        {pin ? <LocationMapPreview pin={pin} height={160} label={`Map of the spot: ${report.location.label}`} /> : null}
        <p className="rs-hint">The exact spot is shown only to you and the Subdivision Leader. Neighbours see a general area.</p>
        <MediaThumbs media={report.media} />
      </details>

      <Section title="Updates">
        {detail.error ? <Callout tone="amber">{detail.error}</Callout> : null}
        {/* the sightings are listed once, above */}
        <UpdateTimeline updates={report.updates.filter((u) => u.kind !== 'sighting')} now={now} label="Updates on this report" />
      </Section>
    </Screen>
  );
}
