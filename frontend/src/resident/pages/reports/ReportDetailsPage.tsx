import { Link, useParams } from 'react-router-dom';
import { Eye, EyeOff, Footprints, Hourglass, PlusCircle } from 'lucide-react';
import { fmtDateTime } from '../../../preview/lib/format';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../preview/map/MapLegend';
import { Screen } from '../../components/Screen';
import { Callout, LinkButton, MediaThumbs, NotFoundState, Row, Section, StatusPill, UpdateTimeline } from '../../components/ui';
import { CATEGORY_ICON } from '../../components/icons';
import { residentPath } from '../../config';
import { ANIMAL_TYPES, CATEGORIES, EXTRA_FIELD, STATUS, VISIBILITY_COPY } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { noticeById, reportById } from '../../data/selectors';
import type { CaseStatus } from '../../data/types';
import { useNow } from '../../lib/hooks';
import { pointOf } from '../../lib/location';

const ORDER: CaseStatus[] = ['reported', 'under_review', 'in_progress', 'closed'];

/**
 * R15 — One report: where it stands, what the subdivision said, and what the resident can still do.
 * For a found animal it is also the found-animal details of the resident who reported it (R23 shows the published notice).
 */
export default function ReportDetailsPage() {
  const { state } = useResidentData();
  const now = useNow();
  const report = reportById(state, useParams().reportId);
  if (!report) return <Screen title="Report" back="/reports"><NotFoundState what="report" to="/reports" label="Go to My reports" /></Screen>;

  const cat = CATEGORIES[report.category];
  const Icon = CATEGORY_ICON[report.category];
  const rank = STATUS[report.status].rank;
  const closed = report.status === 'closed';
  const notice = noticeById(state, report.noticeId ?? undefined);
  const extra = EXTRA_FIELD[report.category];
  const VisIcon = report.visibility === 'published' ? Eye : report.visibility === 'pending_review' ? Hourglass : EyeOff;
  // A lost or found report that has closed no longer has a public notice; say so rather than just "Private".
  const noticeRemoved = closed && report.kind !== 'incident';
  // The reporter sees the exact spot of their own report. Nobody else does, and no coordinates are ever written out.
  const pin = pointOf(report.location);
  const seenLabel = report.kind === 'found' ? 'Found here' : report.kind === 'lost' ? 'Last seen here' : 'Where it was seen';

  return (
    <Screen
      title={report.kind === 'found' ? 'Found animal' : 'Report'}
      subtitle={report.id}
      back="/reports"
      footer={closed ? (
        <LinkButton variant="primary" block to={residentPath('/report')}>Report something new</LinkButton>
      ) : (
        <>
          <LinkButton variant="primary" block icon={PlusCircle} to={residentPath(`/reports/${report.id}/update`)}>Add information</LinkButton>
          {report.kind === 'lost' ? <LinkButton block to={residentPath(`/reports/${report.id}/recovered`)}>My pet is home</LinkButton> : null}
        </>
      )}
    >
      <header className="rs-reporthead">
        <span className="rs-card__icon"><Icon size={19} aria-hidden="true" /></span>
        <div className="min-w-0">
          <h2 className="rs-title rs-title--sm">{report.title}</h2>
          <p className="rs-meta">{cat.label} · reported {fmtDateTime(report.submittedAt)}</p>
        </div>
      </header>

      <section className="rs-stack-sm" aria-label="Status">
        <div className="rs-row-actions"><StatusPill status={report.status} /></div>
        <ol className="rs-stepper" aria-label="Progress">
          {ORDER.map((s, i) => (
            <li key={s} className={i < rank ? 'is-done' : i === rank ? 'is-current' : undefined} aria-current={i === rank ? 'step' : undefined}>
              <span className="rs-stepper__bar" aria-hidden="true" />
              <span className="rs-stepper__label">{STATUS[s].label}</span>
            </li>
          ))}
        </ol>
        <p className="rs-sub">{STATUS[report.status].hint}</p>
      </section>

      {report.outcome ? (
        <Callout tone={report.outcome.resolved ? 'sage' : 'info'} title={`${report.outcome.label}.`}>
          {report.outcome.summary}
        </Callout>
      ) : null}

      <section className={`rs-visibility rs-visibility--${report.visibility}`} aria-label="Who can see this">
        <p className="rs-visibility__title"><VisIcon size={18} aria-hidden="true" />{noticeRemoved ? 'No longer visible to neighbours' : VISIBILITY_COPY[report.visibility].short}</p>
        <p>{noticeRemoved ? 'The notice was removed from Community when this case closed. Only authorized subdivision administrators can still see the report.' : VISIBILITY_COPY[report.visibility].long}</p>
        {notice && notice.status === 'active' ? <Link to={residentPath(`/community/${notice.id}`)} className="rs-seeall">See the notice neighbours see</Link> : null}
      </section>

      {notice && notice.status === 'active' ? (
        <div className="rs-list">
          <Row to={residentPath(`/community/${notice.id}/sightings`)} icon={Footprints} title="Related sightings" meta={notice.sightings.length === 0 ? 'None reported yet' : `${notice.sightings.length} reported`} />
        </div>
      ) : null}

      <Section title="Details">
        <dl className="rs-kv">
          <div><dt>Animal</dt><dd>{ANIMAL_TYPES[report.animalType]}{report.petName ? ` · ${report.petName}` : ''}</dd></div>
          <div><dt>Seen</dt><dd>{fmtDateTime(report.observedAt)}</dd></div>
          <div><dt>Where</dt><dd>{report.location.label}</dd></div>
          {extra && report.extra ? <div><dt>{extra.label}</dt><dd>{report.extra}</dd></div> : null}
          <div><dt>What you told us</dt><dd>{report.description}</dd></div>
        </dl>
        {pin ? (
          <figure className="rs-figure">
            <LocationMapPreview pin={pin} height={170} label={`Map of the spot: ${report.location.label}`} />
            <MapLegend items={[{ kind: 'pin', label: seenLabel }, { kind: 'outline', label: 'Approximate subdivision outline' }]} />
            <figcaption className="rs-hint">The exact spot is shown only to you and subdivision administrators. {report.kind === 'incident' ? 'Neighbours never see this report.' : 'Neighbours see only a general area.'}</figcaption>
          </figure>
        ) : null}
        <MediaThumbs media={report.media} />
      </Section>

      <Section title="Updates">
        <UpdateTimeline updates={report.updates} now={now} label="Updates on this report" />
      </Section>
    </Screen>
  );
}
