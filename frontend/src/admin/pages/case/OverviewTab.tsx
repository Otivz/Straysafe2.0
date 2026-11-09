import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Link2, Lock, Megaphone, Plus, Unlink } from 'lucide-react';
import { isValidLatLng } from '../../../preview/geo';
import { LocationMapPreview } from '../../../preview/map/LocationMapPreview';
import { MapLegend } from '../../../preview/map/MapLegend';
import { adminPath } from '../../config';
import { Badge, IdentityBadge, OutcomeBadge, OwnershipBadge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { EvidenceTile } from '../../components/Evidence';
import { Block, Callout, Kv, Panel } from '../../components/layout';
import { ANIMAL_TYPES, DISPOSITIONS, NOTICE_STATUS, VERIFICATION } from '../../data/constants';
import { useAdminData } from '../../data/context';
import { currentActivity, pendingFollowUpsOf, relatedCandidates } from '../../data/selectors';
import type { Case } from '../../data/types';
import { ago, dueInfo, fmtDateTime, plural } from '../../../preview/lib/format';
import type { OpenCaseDialog } from './dialogState';

export default function OverviewTab({ c, now, openDialog }: { c: Case; now: Date; openDialog: OpenCaseDialog }) {
  const { state } = useAdminData();
  const navigate = useNavigate();
  const linked = state.cases.filter((x) => c.relatedCaseIds.includes(x.id));
  const suggestions = relatedCandidates(state.cases, c, 3);
  const notice = state.notices.find((n) => n.caseId === c.id && n.status !== 'archived');
  const publishable = !c.sensitive && (c.category === 'lost_pet' || c.category === 'found_animal' || c.category === 'safety');
  const next = pendingFollowUpsOf(c).filter((f) => f.dueAt).sort((a, b) => a.dueAt!.localeCompare(b.dueAt!))[0];
  const closed = c.status === 'closed';
  // Administrators are authorized to see the exact spot. A case with no pin shows only its words.
  const pin = isValidLatLng(c.location.lat, c.location.lng) ? { lat: c.location.lat as number, lng: c.location.lng as number } : null;

  return (
    <div className="sa-case">
      <Panel>
        <Block title="What was reported">
          <p className="sa-prose">{c.description}</p>
          <dl className="sa-facts mt-5">
            <div><dt>Observed</dt><dd>{fmtDateTime(c.observedAt)}</dd></div>
            <div><dt>Reported</dt><dd>{fmtDateTime(c.reportedAt)}{ago(c.reportedAt, now) ? <span className="sa-text-3"> · {ago(c.reportedAt, now)}</span> : null}</dd></div>
            <div><dt>Location</dt><dd>{c.location.area}<span className="sa-text-3 block">{c.location.detail}</span></dd></div>
            <div><dt>Animal</dt><dd>{ANIMAL_TYPES[c.animal.type]}{c.animal.count > 1 ? ` × ${c.animal.count}` : ''}<span className="sa-text-3 block">{c.animal.description}</span></dd></div>
          </dl>
          {pin ? (
            <figure className="mt-5 flex flex-col">
              <LocationMapPreview pin={pin} height={200} label={`Map of the reported location: ${c.location.area}`} />
              <MapLegend items={[{ kind: 'pin', label: 'Reported location' }, { kind: 'outline', label: 'Approximate subdivision outline' }]} />
              <figcaption className="sa-meta mt-1.5">Sample coordinates. The outline is approximate and unverified. Only authorized administrators see the exact spot.</figcaption>
            </figure>
          ) : null}
        </Block>

        <Block title="Evidence" description={c.evidence.length ? `${plural(c.evidence.length, 'item')} submitted` : undefined}>
          {c.evidence.length === 0 ? (
            <p className="sa-small sa-text-2">{c.noPhotoReason ?? 'No photos or videos were submitted. A photo is never required, especially when it is not safe to take one.'}</p>
          ) : (
            <div className="sa-evgrid">{c.evidence.map((e) => <EvidenceTile key={e.id} item={e} reviewed={c.assessment.evidenceReviewed.includes(e.id)} onOpen={() => openDialog({ kind: 'evidence', evidenceId: e.id })} />)}</div>
          )}
        </Block>

        <Block title="Related reports" description="Reports about the same concern. Linking never merges or hides a report." action={!closed ? <Button size="sm" icon={Link2} onClick={() => openDialog({ kind: 'link' })}>Link reports</Button> : undefined}>
          {linked.length === 0 && suggestions.length === 0 ? <p className="sa-small sa-text-2">No related reports yet.</p> : null}
          {linked.length > 0 ? (
            <ul className="m-0 flex list-none flex-col p-0">
              {linked.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-4 border-t border-solid py-3 first:border-t-0 first:pt-0" style={{ borderColor: 'var(--sa-line-soft)' }}>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2"><Link to={adminPath(`/cases/${o.id}`)} className="sa-ref">{o.id}</Link><StatusBadge status={o.status} /></p>
                    <p className="sa-rowtitle mt-1">{o.title}</p>
                    <p className="sa-meta mt-0.5">{o.location.area} · observed {fmtDateTime(o.observedAt)}</p>
                  </div>
                  {!closed ? <Button size="sm" variant="ghost" icon={Unlink} onClick={() => openDialog({ kind: 'unlink', otherId: o.id })}>Unlink</Button> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {suggestions.length > 0 && !closed ? (
            <div className={linked.length ? 'mt-4' : ''}>
              <p className="sa-label mb-2">Possibly related</p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {suggestions.map(({ case: o, reasons }) => (
                  <li key={o.id} className="sa-record flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2"><Link to={adminPath(`/cases/${o.id}`)} className="sa-ref">{o.id}</Link><span className="sa-meta">{o.location.area}</span></p>
                      <p className="mt-0.5 font-medium">{o.title}</p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5">{reasons.map((r) => <Badge key={r}>{r}</Badge>)}</p>
                    </div>
                    <Button size="sm" onClick={() => openDialog({ kind: 'link' })}>Review</Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Block>

        {c.closure ? (
          <Block title="Closure">
            <p className="flex flex-wrap items-center gap-2"><span className="sa-semibold">{DISPOSITIONS[c.closure.disposition].label}</span><OutcomeBadge group={c.closure.outcome} /></p>
            <p className="sa-prose mt-2">{c.closure.reason}</p>
            {c.closure.outcome !== 'resolved' ? <Callout className="mt-3" tone={c.closure.outcome === 'unresolved' ? 'amber' : 'info'}>Closed does not mean resolved. {c.closure.outcome === 'unresolved' ? 'This case ended without a confirmed resolution.' : 'This case did not require action.'}</Callout> : null}
            <p className="sa-meta mt-3">Closed by {c.closure.closedBy} · {fmtDateTime(c.closure.closedAt)}{c.closure.followUpCheck ? ` · follow-up check ${dueInfo(c.closure.followUpCheck, now).label.toLowerCase()}` : ''}</p>
          </Block>
        ) : null}
      </Panel>

      <aside className="sa-case__aside" aria-label="Case details">
        <Panel>
          <Block tight title="Where things stand">
            <Kv stack rows={[
              ['Incident', VERIFICATION[c.assessment.incident].label],
              // identity and ownership do not apply to wild animals
              ...(c.animal.type === 'wildlife' ? [] : [['Animal', <IdentityBadge status={c.identity.status} />] as [string, ReactNode], ['Ownership', <OwnershipBadge status={c.ownership.status} />] as [string, ReactNode]]),
              ['Right now', currentActivity(c, now)],
              ['Next follow-up', next ? <span className={dueInfo(next.dueAt, now).overdue ? 'sa-text-red' : ''}>{dueInfo(next.dueAt, now).label}<span className="sa-text-3 block">{next.title}</span></span> : '—'],
            ]} />
            <p className="sa-small mt-4"><Link to="?tab=assessment" className="font-semibold">Open assessment</Link></p>
          </Block>
        </Panel>

        <Panel>
          <Block tight title={<span className="flex items-center gap-2"><Lock size={14} aria-hidden="true" />Reporter</span>} description="Visible to authorized administrators only.">
            <Kv stack rows={[['Name', c.reporter.name], ['Unit', c.reporter.unit], ['Phone', c.reporter.phone], ['Email', <span className="break-all">{c.reporter.email}</span>], ['Prefers', { phone: 'Phone call', email: 'Email', in_app: 'In-app message' }[c.reporter.preferredContact]]]} />
            {c.reporter.residentId ? <p className="sa-small mt-3"><Link to={adminPath(`/residents/${c.reporter.residentId}`)} className="font-semibold">View resident profile</Link></p> : null}
          </Block>
        </Panel>

        <Panel>
          <Block tight title={<span className="flex items-center gap-2"><Megaphone size={14} aria-hidden="true" />Community notice</span>}>
            {notice ? (
              <div className="flex flex-col gap-2">
                <p className="font-medium">{notice.title}</p>
                <p className="flex items-center gap-2"><Badge tone={NOTICE_STATUS[notice.status].tone}>{NOTICE_STATUS[notice.status].label}</Badge></p>
                <p><Link to={adminPath(`/community/${notice.id}/edit`)} className="sa-small font-semibold">Open notice</Link></p>
              </div>
            ) : c.sensitive ? (
              <Callout icon={Lock}>This is a private complaint. It is never published, and reporter details never appear in a notice.</Callout>
            ) : (
              <>
                <p className="sa-small sa-text-2">Not published. Publishing a notice is a separate step from the case, and the case record stays private.</p>
                {publishable && !closed ? <Button className="mt-3" size="sm" icon={Plus} onClick={() => navigate(`${adminPath('/community/new')}?fromCase=${c.id}`)}>Create notice</Button> : null}
              </>
            )}
          </Block>
        </Panel>
      </aside>
    </div>
  );
}
