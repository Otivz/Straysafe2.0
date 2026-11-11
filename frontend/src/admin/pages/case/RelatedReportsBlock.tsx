import { Link } from 'react-router-dom';
import { Link2, Unlink } from 'lucide-react';
import { adminPath } from '../../config';
import { Badge, StatusBadge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Block } from '../../components/layout';
import { useAdminData } from '../../data/context';
import { relatedCandidates } from '../../data/selectors';
import type { Case } from '../../data/types';
import { fmtDateTime } from '../../../preview/lib/format';
import type { OpenCaseDialog } from './dialogState';

/** Reports about the same concern: the ones linked to this case, and a few suggestions. Linking never merges or hides a report. Shared by every kind of case. */
export default function RelatedReportsBlock({ c, openDialog }: { c: Case; openDialog: OpenCaseDialog }) {
  const { state } = useAdminData();
  const linked = state.cases.filter((x) => c.relatedCaseIds.includes(x.id));
  const suggestions = relatedCandidates(state.cases, c, 3);
  const closed = c.status === 'closed';

  return (
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
  );
}
