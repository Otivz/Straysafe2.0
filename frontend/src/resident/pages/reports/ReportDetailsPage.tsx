import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Eye, EyeOff, Footprints, Hourglass, MessageSquare, PlusCircle } from 'lucide-react';
import { reportIdOf } from '../../../live/refs';
import { fmtDateTime } from '../../../preview/lib/format';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../preview/map/MapLegend';
import { Screen } from '../../components/Screen';
import { Callout, ErrorState, LinkButton, ListSkeleton, MediaThumbs, NotFoundState, Row, Section, StatusPill, UpdateTimeline } from '../../components/ui';
import { CATEGORY_ICON } from '../../components/icons';
import { residentPath } from '../../config';
import { ANIMAL_TYPES, CATEGORIES, EXTRA_FIELD, STATUS, VISIBILITY_COPY } from '../../data/constants';
import { useResidentData } from '../../data/context';
import { noticeById, reportById } from '../../data/selectors';
import type { CaseStatus } from '../../data/types';
import { useNow } from '../../lib/hooks';
import { pointOf } from '../../lib/location';
import { LostReport } from './LostReport';

const ORDER: CaseStatus[] = ['reported', 'under_review', 'in_progress', 'closed'];

/**
 * R15 — One report: where it stands, what the subdivision said, and what the resident can still do.
 * For a found animal it is also the found-animal details of the resident who reported it (R23 shows the published notice).
 */
export default function ReportDetailsPage() {
  const { state, loadReport, reportStatus } = useResidentData();
  const now = useNow();
  const { reportId } = useParams();
  const report = reportById(state, reportId);
  // The list holds each report as the server's timeline gives it; the case chat and the latest changes are read when it is opened.
  const load = useRef(loadReport);
  useEffect(() => { load.current = loadReport; });
  useEffect(() => { if (reportId) void load.current(reportId); }, [reportId]);
  const detail = reportStatus(reportId ?? '');
  if (!report) {
    if (detail.status === 'idle' || detail.status === 'loading') return <Screen title="Report" back="/reports"><ListSkeleton rows={3} /></Screen>;
    if (detail.status === 'error') return <Screen title="Report" back="/reports"><ErrorState onRetry={() => { void loadReport(reportId ?? ''); }}>{detail.error}</ErrorState></Screen>;
    return <Screen title="Report" back="/reports"><NotFoundState what="report" to="/reports" label="Go to My reports" /></Screen>;
  }

  // a missing pet: the owner's one screen for it (the notice, the sightings and the Leader's alerts with the report)
  if (report.kind === 'lost') return <LostReport report={report} detail={detail} />;

  const cat = CATEGORIES[report.category];
  const Icon = CATEGORY_ICON[report.category];
  const rank = STATUS[report.status].rank;
  const closed = report.status === 'closed';
  const notice = noticeById(state, report.noticeId ?? undefined);
  const conversations = (state.conversations ?? []).filter((c) => c.myReportNumber === reportIdOf(report.id));
  const extra = EXTRA_FIELD[report.category];
  const VisIcon = report.visibility === 'published' ? Eye : report.visibility === 'pending_review' ? Hourglass : EyeOff;
  // A lost or found report that has closed no longer has a public notice; say so rather than just "Private".
  const noticeRemoved = closed && report.kind !== 'incident';
  // The reporter sees the exact spot of their own report. Nobody else does, and no coordinates are ever written out.
  const pin = pointOf(report.location);
  const seenLabel = report.kind === 'found' ? 'Found here' : 'Where it was seen';

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

      {report.kind === 'found' && !closed ? (
        // a found animal has no review steps to climb: it is followed by the Subdivision Leader until its owner is found
        <div className="rs-row-actions"><span className="rs-pill rs-pill--brand"><span className="rs-pill__dot" aria-hidden="true" />Under monitoring</span><span className="rs-meta">Your Subdivision Leader is following it.</span></div>
      ) : (
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
      )}

      {report.complaintVerified && report.status !== 'closed' ? (
        <Callout tone="sage" title="Verified.">Your Subdivision Leader checked your complaint and is acting on it under the subdivision’s rules. What happens with the other household stays between them and the subdivision.</Callout>
      ) : null}

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
          {report.looks ? <div><dt>Looked like</dt><dd>{report.looks}</dd></div> : null}
          {report.suspect ? <div><dt>Whose animal (what you told us)</dt><dd>{[report.suspect.name, report.suspect.address, report.suspect.details].filter(Boolean).join(' · ')}<span className="rs-meta" style={{ display: 'block' }}>Shared only with your Subdivision Leader.</span></dd></div> : null}
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

      {conversations.length > 0 ? (
        <Section title="Conversations">
          <div className="rs-list">
            {conversations.map((c) => <Row key={c.id} to={residentPath(`/conversations/${c.id}`)} icon={MessageSquare} title={c.title} meta={c.status === 'closed' ? c.endedReason ?? 'Conversation ended' : c.unread > 0 ? `${c.unread} unread` : c.subtitle} />)}
          </div>
        </Section>
      ) : null}

      <Section title="Updates">
        {detail.error ? <Callout tone="amber">{detail.error}</Callout> : null}
        <UpdateTimeline updates={report.updates} now={now} label="Updates on this report" />
      </Section>
    </Screen>
  );
}
