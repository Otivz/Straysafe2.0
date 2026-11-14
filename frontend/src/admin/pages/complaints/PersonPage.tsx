import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { adminPath } from '../../config';
import { Badge } from '../../components/Badge';
import { Callout, ErrorState, PageSkeleton } from '../../components/layout';
import { useAdminData } from '../../data/context';
import { usePageTitle } from '../../lib/hooks';
import { errorMessage } from '../../../preview/lib/errors';
import { reportIdOf } from '../../../live/refs';
import { complaintsApi, type ApiPersonPage } from '../../complaints/api';
import { fmtDay, lc, ord, stepBadge } from '../../complaints/model';

/** One person's history, rule by rule (docs/01-system/COMPLAINT_MANAGEMENT.md). Kept when complaints close or an account is removed. */
export default function PersonPage() {
  const { respondentId } = useParams();
  const { state } = useAdminData();
  const [p, setP] = useState<ApiPersonPage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  usePageTitle(p?.respondent?.name ?? 'Person responsible');
  useEffect(() => {
    let live = true;
    complaintsApi.person(Number(respondentId)).then((x) => { if (live) { setP(x); setFailed(null); } }, (e: unknown) => { if (live) setFailed(errorMessage(e)); });
    return () => { live = false; };
  }, [respondentId, tries]);
  if (failed && !p) return <ErrorState message={failed} onRetry={() => setTries((n) => n + 1)} />;
  if (!p || !p.respondent) return <PageSkeleton />;
  const refOf = (rid: number) => state.cases.find((x) => reportIdOf(x.id) === rid)?.id ?? `#${rid}`;
  const r = p.respondent;
  return (
    <div>
      <Link className="sa-back" to={adminPath('/complaints')}>← Complaints</Link>
      <div className="sa-cm-person-head mt-1">
        <div className="min-w-0"><h1 className="sa-h1">{r.name}</h1><p className="sa-pageheader__desc">{r.address} · {r.has_account ? 'StraySafe account' : 'No StraySafe account'}{p.first_confirmed_at ? ` · first confirmed ${fmtDay(p.first_confirmed_at)}` : ''}</p></div>
        {r.has_account ? <Badge tone="brand">Resident</Badge> : <Badge>Household on record</Badge>}
      </div>
      <Callout className="mt-4" icon={Lock}>Only you can see this. It stays when complaints close and when an account is removed. Each rule is counted on its own.</Callout>
      {p.rules.length === 0 ? <p className="sa-small sa-text-2 mt-4">No confirmed offenses.</p> : null}
      {p.rules.map((h) => {
        const notCounted = h.not_counted.filter((x) => x.kind !== 'other_rule');
        return (
          <div key={h.policy_id} className="sa-cm-rulecard">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h3>{h.policy_title ?? h.policy_id}</h3><span className="sa-small sa-text-2">{h.counted.length} offense{h.counted.length === 1 ? '' : 's'} counted{h.count_window_days ? ` · counts for ${h.count_window_days} days` : ''}</span></div>
            <ol className="sa-cm-ladder sa-cm-ladder--flat mt-3">
              {h.counted.map((x, i) => (
                <li key={x.offense_id} data-state="done">
                  <span className="sa-cm-ladder__n">{x.number ? ord(x.number) : '—'}</span>
                  <div className="min-w-0">
                    <p><Link to={adminPath(`/cases/${refOf(x.report_id)}`)}>{refOf(x.report_id)}</Link> · seen {fmtDay(x.incident_at)}</p>
                    <p className="sa-meta mt-0.5">Confirmed {fmtDay(x.confirmed_at)}{x.steps.length ? ` · ${x.steps.map((s) => `${lc(s.label)}: ${lc(stepBadge(s.kind, s.state).text)}`).join(' · ')}` : ''}</p>
                    {x.number && x.number !== i + 1 ? <p className="sa-small sa-text-amber mt-0.5">Confirmed as the {ord(x.number)}; after a correction it is the {ord(i + 1)} in this history. Review it.</p> : null}
                  </div>
                </li>
              ))}
              {h.pending.map((x) => (
                <li key={`p-${x.report_id}`} data-state="suggested"><span className="sa-cm-ladder__n">{ord(x.suggestion)}?</span>
                  <div className="min-w-0"><p><Link to={adminPath(`/cases/${refOf(x.report_id)}`)}>{refOf(x.report_id)}</Link> · seen {fmtDay(x.incident_at)}</p><p className="sa-meta mt-0.5">Suggested by StraySafe · waits for your confirmation</p></div></li>
              ))}
              {!h.counted.length && !h.pending.length ? <li><span className="sa-cm-ladder__n">—</span><div className="sa-small sa-text-2">No offense counted.</div></li> : null}
            </ol>
            {notCounted.length ? (
              <details className="sa-cm-fold"><summary>Not counted ({notCounted.length})</summary>
                <ul>{notCounted.map((x) => <li key={`${x.kind}-${x.report_id}`}><Link to={adminPath(`/cases/${refOf(x.report_id)}`)}>{refOf(x.report_id)}</Link> · {x.why}</li>)}</ul>
              </details>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
