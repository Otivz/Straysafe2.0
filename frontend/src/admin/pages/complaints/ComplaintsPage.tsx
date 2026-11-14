import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Banknote, Bell, CalendarDays, CircleCheck, ClipboardCheck, Copy, FileText, Landmark, Settings, ShieldCheck, UserCheck, type LucideIcon } from 'lucide-react';
import { adminPath } from '../../config';
import { Button, LinkButton } from '../../components/Button';
import { Segmented } from '../../components/form';
import { ErrorState, PageHeader, PageSkeleton, Panel } from '../../components/layout';
import { useAdminData } from '../../data/context';
import { usePageTitle } from '../../lib/hooks';
import { useNow } from '../../../preview/lib/hooks';
import { errorMessage } from '../../../preview/lib/errors';
import { reportIdOf } from '../../../live/refs';
import { complaintsApi, type ApiWorkspace, type ApiWorkspaceItem } from '../../complaints/api';
import { fmt, lc, needsOf, ord, stepBadge, type NeedIcon, type NeedInput } from '../../complaints/model';

const ICON: Record<NeedIcon, LucideIcon> = {
  copy: Copy, clipboard: ClipboardCheck, userCheck: UserCheck, shield: ShieldCheck, ok: CircleCheck, letter_1: FileText, letter_2: FileText,
  summons: CalendarDays, fine: Banknote, meeting: Landmark,
};

const inputOf = (x: ApiWorkspaceItem): NeedInput => ({
  closed: x.closed, maybeSame: x.maybe_same, incident: x.incident, hasRule: !!x.rule, noRule: x.no_rule, respondentName: x.respondent?.name ?? null,
  checking: x.checking, offense: x.offense, suggestion: x.suggestion, ruleTitle: x.rule?.title ?? null, hasSuspect: !!x.suspect, steps: x.steps,
});

/**
 * The Complaints workspace (docs/01-system/COMPLAINT_MANAGEMENT.md): what needs the Leader across every animal complaint, the complaints
 * themselves (each one an ordinary case), and the people confirmed as responsible with their history per rule.
 */
export default function ComplaintsPage() {
  usePageTitle('Complaints');
  const { state } = useAdminData();
  const navigate = useNavigate();
  const now = useNow();
  const [w, setW] = useState<ApiWorkspace | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [seg, setSeg] = useState<'open' | 'all' | 'people'>('open');

  useEffect(() => {
    let live = true;
    complaintsApi.workspace().then((x) => { if (live) { setW(x); setFailed(null); } }, (e: unknown) => { if (live) setFailed(errorMessage(e)); });
    return () => { live = false; };
  }, [tries, state.cases.length]);

  if (failed && !w) return <ErrorState message={failed} onRetry={() => setTries((n) => n + 1)} />;
  if (!w) return <PageSkeleton />;

  const caseOf = (rid: number) => state.cases.find((x) => reportIdOf(x.id) === rid);
  const refOf = (rid: number) => caseOf(rid)?.id ?? `#${rid}`;
  const open = w.items.filter((x) => !x.closed);
  const needs = open.flatMap((x) => { const n = needsOf(inputOf(x), now, refOf)[0]; return n ? [{ ...n, item: x }] : []; });
  const order: Record<string, number> = { same: 0, offense: 1, resp: 2, verify: 3, step: 2.5, close: 4 };
  needs.sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3));
  const rows = (seg === 'open' ? open : w.items).slice().sort((a, b) => (caseOf(b.report_id)?.reportedAt ?? '').localeCompare(caseOf(a.report_id)?.reportedAt ?? ''));

  return (
    <div>
      <PageHeader title="Complaints"
        description="Animal complaints: what happened, who is responsible, and what the subdivision’s rules ask next. Each complaint is one of your cases; nothing is copied."
        actions={<LinkButton to={adminPath('/settings')} icon={Settings}>Complaint rules</LinkButton>} />
      <div className="mt-5 flex flex-col gap-5">
        {needs.length ? (
          <section className="sa-mc-lane" data-active aria-label="Needs you">
            <h2 className="sa-mc-lane__head"><Bell size={15} aria-hidden="true" />Needs you</h2>
            <ul className="sa-mc-needs">
              {needs.map((n, i) => {
                const Icon = ICON[n.icon];
                return (
                  <li key={n.item.report_id} className="sa-mc-need">
                    <span className="sa-mc-need__icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
                    <div className="min-w-0"><p className="sa-mc-need__title"><Link className="sa-ref" style={{ fontSize: 13 }} to={adminPath(`/cases/${refOf(n.item.report_id)}`)}>{refOf(n.item.report_id)}</Link> · {n.title}</p><p className="sa-mc-need__detail">{n.detail}</p></div>
                    <Button variant={i === 0 ? 'primary' : 'secondary'} size="sm" onClick={() => navigate(adminPath(`/cases/${refOf(n.item.report_id)}`))} aria-label={`Review ${refOf(n.item.report_id)}`}>Review</Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section className="sa-mc-lane" aria-label="Situation"><div className="sa-mc-lane__calm"><p className="sa-mc-calm" role="status"><CircleCheck size={18} aria-hidden="true" />Nothing needs you right now</p><p className="sa-mc-lane__line">{open.length} active complaint{open.length === 1 ? '' : 's'}.</p></div></section>
        )}

        <div className="flex flex-col gap-3">
          <Segmented label="Show" value={seg} onChange={setSeg} options={[
            { value: 'open', label: 'Active' },
            { value: 'all', label: 'All complaints' },
            { value: 'people', label: 'People responsible' },
          ]} />
          {seg === 'people' ? (
            <>
              <Panel><div className="sa-tablewrap"><table className="sa-table sa-table--rows">
                <thead><tr><th>Person</th><th>History, per rule</th></tr></thead>
                <tbody>
                  {w.people.length === 0 ? <tr><td colSpan={2} className="sa-small sa-text-2">Nobody has been confirmed as responsible yet.</td></tr> : null}
                  {w.people.map((p) => (
                    <tr key={p.respondent_id} onClick={() => navigate(adminPath(`/complaints/people/${p.respondent_id}`))}>
                      <td><span className="sa-semibold">{p.name}</span><span className="sa-cm-sub">{p.address} · {p.has_account ? 'StraySafe account' : 'No StraySafe account'}</span></td>
                      <td className="sa-small">{p.rules.map((r) => `${r.title ?? r.policy_id}: ${r.counted} offense${r.counted === 1 ? '' : 's'}${r.pending ? ` + ${r.pending} to confirm` : ''}${r.corrected ? ` (${r.corrected} corrected)` : ''}`).join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div></Panel>
              <p className="sa-hint">Only people you confirmed as responsible appear here. A complainant’s suggestion never creates an entry.</p>
            </>
          ) : (
            <Panel><div className="sa-tablewrap"><table className="sa-table sa-table--rows">
              <thead><tr><th>Ref</th><th>Complaint</th><th>Rule</th><th>Person responsible</th><th>Offense</th><th>Where it stands</th></tr></thead>
              <tbody>
                {rows.length === 0 ? <tr><td colSpan={6} className="sa-small sa-text-2">{seg === 'open' ? 'No active complaints.' : 'No complaints yet.'}</td></tr> : null}
                {rows.map((x) => {
                  const c = caseOf(x.report_id);
                  const need = needsOf(inputOf(x), now, refOf)[0];
                  const wait = x.steps.map((s) => ({ s, b: stepBadge(s.kind, s.state) })).find((y) => y.b.wait);
                  return (
                    <tr key={x.report_id} onClick={() => navigate(adminPath(`/cases/${refOf(x.report_id)}`))}>
                      <td className="whitespace-nowrap"><span className="sa-ref">{refOf(x.report_id)}</span></td>
                      <td style={{ minWidth: 220 }}><span className="font-medium">{c?.title ?? 'Animal complaint'}</span><span className="sa-cm-sub">Seen {fmt(x.incident_at)}</span></td>
                      <td className="sa-small">{x.rule?.title ?? (x.no_rule ? 'No rule applies' : <span className="sa-text-3">—</span>)}</td>
                      <td style={{ minWidth: 170 }}>
                        {x.respondent ? <><span className="sa-semibold">{x.respondent.name}</span><span className="sa-cm-sub">Confirmed by you</span></>
                          : x.same_as ? <span className="sa-text-3">—</span>
                            : x.suspect ? <><span>{[x.suspect.name, x.suspect.address].filter(Boolean).join(' · ') || 'Suggested'}</span><span className="sa-cm-sub">Suggested by the complainant · unverified</span></>
                              : <span className="sa-text-3">Not identified</span>}
                      </td>
                      <td className="whitespace-nowrap">
                        {x.same_as ? <span className="sa-small sa-text-2">Same occurrence as {refOf(x.same_as)}</span>
                          : x.offense ? (x.offense.counted && x.offense.number ? <span className="sa-semibold">{ord(x.offense.number)} offense</span> : <span className="sa-small sa-text-2">Not counted</span>)
                            : x.suggestion ? <><span className="sa-small">To confirm</span><span className="sa-cm-sub">Suggested: {ord(x.suggestion)}</span></> : <span className="sa-text-3">—</span>}
                      </td>
                      <td style={{ minWidth: 180 }}>
                        {x.closed ? <span className="sa-small sa-text-2">Closed</span>
                          : need ? <span className="sa-cm-needs-badge">Needs you</span>
                            : wait ? <span className="sa-small sa-text-2">Waiting: {lc(wait.s.kind === 'meeting' ? 'Meeting at the Barangay' : wait.s.kind === 'fine' ? 'Fine' : wait.s.kind === 'summons' ? 'Summons' : 'Letter')} · {lc(wait.b.text)}</span>
                              : <span className="sa-text-3">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div></Panel>
          )}
        </div>
      </div>
    </div>
  );
}
