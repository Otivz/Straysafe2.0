import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Banknote, Bell, CalendarDays, Camera, CircleCheck, ClipboardCheck, Copy, FileText, Landmark, Link2, Lock, MapPin, Megaphone, Printer, RotateCcw,
  ShieldCheck, UserCheck, XCircle, type LucideIcon,
} from 'lucide-react';
import { adminPath } from '../../config';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Callout, ErrorState, PageSkeleton } from '../../components/layout';
import { Timeline } from '../../components/Timeline';
import { ANIMAL_TYPES, DISPOSITIONS } from '../../data/constants';
import { useAdminData } from '../../data/context';
import type { Case } from '../../data/types';
import { useNow } from '../../../preview/lib/hooks';
import { errorMessage } from '../../../preview/lib/errors';
import { reportIdOf } from '../../../live/refs';
import { complaintsApi, type ApiComplaint, type ApiStep } from '../../complaints/api';
import {
  SUSPECT_RP, STAGE_TEXT, VERIFIED_RP, activityOf, evidenceLabel, fmt, fmtDay, lc, needInputOf, needsOf, ord, peso, stepBadge, stepNext, stepTrail,
  type ComplaintDialogState, type Need, type NeedIcon,
} from '../../complaints/model';
import { CaseDialogs } from '../case/CaseDialogs';
import type { CaseDialog } from '../case/dialogState';
import { ComplaintDialogs } from './ComplaintDialogs';

const ICON: Record<NeedIcon | 'megaphone' | 'link' | 'x', LucideIcon> = {
  copy: Copy, clipboard: ClipboardCheck, userCheck: UserCheck, shield: ShieldCheck, ok: CircleCheck, letter_1: FileText, letter_2: FileText,
  summons: CalendarDays, fine: Banknote, meeting: Landmark, megaphone: Megaphone, link: Link2, x: XCircle,
};

/**
 * One animal complaint (docs/01-system/COMPLAINT_MANAGEMENT.md): what was reported, what needs the Leader now, the findings, the person's
 * history under the rule, what the rule asks for this offense, and the activity, which writes itself. One case, never a copy.
 */
export default function ComplaintPage({ c }: { c: Case }) {
  const { state } = useAdminData();
  const now = useNow();
  const id = reportIdOf(c.id) ?? 0;
  const [d, setD] = useState<ApiComplaint | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [leadCount, setLeadCount] = useState<number | undefined>(undefined);
  const [dialog, setDialog] = useState<ComplaintDialogState | null>(null);
  const [caseDialog, setCaseDialog] = useState<CaseDialog | null>(null);

  useEffect(() => {
    let live = true;
    complaintsApi.detail(id).then((x) => { if (live) { setD(x); setFailed(null); } }, (e: unknown) => { if (live) setFailed(errorMessage(e)); });
    return () => { live = false; };
  }, [id, c.status, tries]);
  const needsLeads = !!d && !d.respondent && c.status !== 'closed';
  useEffect(() => {
    if (!needsLeads) return;
    let live = true;
    complaintsApi.leads(id).then((l) => { if (live) setLeadCount(l.suggestion.length + l.registry.length + l.earlier.length); }, () => undefined);
    return () => { live = false; };
  }, [id, needsLeads]);

  if (failed && !d) return <ErrorState message={failed} onRetry={() => setTries((n) => n + 1)} />;
  if (!d) return <PageSkeleton />;

  const refOf = (rid: number) => state.cases.find((x) => reportIdOf(x.id) === rid)?.id ?? `#${rid}`;
  const closed = c.status === 'closed';
  const needs = needsOf(needInputOf(d, closed, leadCount), now, refOf);
  const open = (n: Need) => {
    if (n.kind === 'step' && n.stepId && n.stepAction) setDialog({ kind: 'step', stepId: n.stepId, action: n.stepAction });
    else if (n.kind === 'close') setCaseDialog({ kind: 'close' });
    else if (n.kind === 'resp') setDialog({ kind: 'resp' });
    else setDialog({ kind: n.kind } as ComplaintDialogState);
  };
  const photo = c.evidence.find((e) => e.kind === 'photo' && e.url);
  const chip = d.same_as ? <span className="sa-mc__chip" data-tone="muted">Same occurrence</span>
    : closed ? <span className="sa-mc__chip" data-tone="muted">Closed</span>
      : d.offense?.counted && d.offense.number ? <span className="sa-mc__chip">{ord(d.offense.number)} offense</span>
        : d.incident.status === 'verified' ? <span className="sa-mc__chip">Verified</span>
          : <span className="sa-mc__chip" data-tone="amber">Being checked</span>;
  const waiting = (() => {
    const bits: string[] = [];
    const letter2Delivered = d.steps.some((s) => s.kind === 'letter_2' && s.state === 'delivered');
    for (const s of d.steps) {
      const b = stepBadge(s.kind, s.state);
      const nx = stepNext(s.kind, s.state, letter2Delivered, s.due_at, now);
      if (nx?.later && s.due_at) bits.push(`${s.kind === 'meeting' ? 'the Barangay meeting' : 'the summons'} on ${fmt(s.due_at)}`);
      else if (b.wait && (!nx || nx.quiet)) bits.push(`${lc(s.label)}: ${lc(b.text)}`);
    }
    return bits.length ? `Waiting for ${bits.join('; ')}.` : 'Nothing is waiting.';
  })();
  const activity = activityOf(d, refOf, { at: c.reportedAt, by: c.reporter.name }, c.closure ? { at: c.closure.closedAt, label: DISPOSITIONS[c.closure.disposition].label } : null);

  return (
    <div>
      <Link className="sa-back" to={adminPath('/complaints')}>← Complaints</Link>
      <header className="sa-mc__top">
        <p className="sa-mc__eyebrow">
          <span className="sa-ref" style={{ fontSize: 13.5 }}>{c.id}</span>
          <span className="sa-meta flex items-center gap-1.5"><Megaphone size={14} aria-hidden="true" />Animal complaint</span>
          <span className="sa-meta flex items-center gap-1.5"><Lock size={13} aria-hidden="true" />Private</span>
        </p>
        {chip}
      </header>

      <section className="sa-mc-hero" aria-label="What was reported">
        <div className="sa-mc-hero__photo"><div className="sa-mc-photo">{photo?.url ? <img src={photo.url} alt="Photo from the complainant" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} /> : <span className="sa-cm-nophoto"><Camera size={22} aria-hidden="true" />No photos</span>}</div></div>
        <div className="sa-mc-hero__head">
          <h1 className="sa-mc-hero__name" style={{ fontSize: 26, lineHeight: '32px' }}>{c.title}</h1>
          <p className="sa-mc-hero__about">{ANIMAL_TYPES[c.animal.type]}</p>
          {c.animal.description && !c.animal.description.startsWith('No description') ? <p className="sa-mc-hero__looks">Looked like: {c.animal.description}</p> : null}
        </div>
        <div className="sa-mc-hero__story">
          <p className="sa-mc-kicker">Seen</p>
          <p className="sa-mc-story__when"><strong>{fmt(d.seen_at ?? d.incident_at)}</strong><span className="sa-mc-story__where"><MapPin size={14} aria-hidden="true" />{c.location.area}</span></p>
          <blockquote className="sa-mc-quote">“{c.description}”</blockquote>
        </div>
        <aside className="sa-mc-hero__people" aria-label="People">
          <div className="sa-mc-person"><p className="sa-mc-kicker">Complainant · private</p><p className="sa-mc-person__name">{c.reporter.name}</p>{c.reporter.unit ? <p className="sa-small sa-text-2">{c.reporter.unit}</p> : null}</div>
          {d.suspect ? (
            <div className="sa-mc-person sa-cm-suspect">
              <p className="sa-mc-kicker">Suggested by the complainant</p>
              <p className="sa-mc-person__name">{d.suspect.name || d.suspect.address || 'Nothing named'}</p>
              {d.suspect.name && d.suspect.address ? <p className="sa-small sa-text-2">{d.suspect.address}</p> : null}
              {d.suspect.details ? <p className="sa-small sa-text-2">{d.suspect.details}</p> : null}
              <p className="mt-1"><Badge tone="amber">{SUSPECT_RP}</Badge></p>
              <p className="sa-hint mt-1">A lead for your checks. It is never counted and never shown to anyone else.</p>
            </div>
          ) : <div className="sa-mc-person"><p className="sa-mc-kicker">Suggested by the complainant</p><p className="sa-small sa-text-2">Nothing suggested.</p></div>}
        </aside>
      </section>

      {closed ? (
        <section className="sa-mc-lane" data-closed aria-label="How this complaint ended">
          <p className="sa-mc-calm"><CircleCheck size={18} aria-hidden="true" />{d.same_as ? `Same occurrence as ${refOf(d.same_as.report_id)}` : c.closure ? DISPOSITIONS[c.closure.disposition].label : 'Closed'}</p>
          <p className="sa-small sa-text-2 mt-1">Its findings, decision and steps stay in the history.</p>
          {!d.same_as ? <p className="mt-3"><Button size="sm" icon={RotateCcw} onClick={() => setCaseDialog({ kind: 'reopen' })}>Reopen this complaint</Button></p> : null}
        </section>
      ) : needs.length ? (
        <section className="sa-mc-lane" data-active aria-label="Needs you">
          <h2 className="sa-mc-lane__head"><Bell size={15} aria-hidden="true" />Needs you</h2>
          <ul className="sa-mc-needs">
            {needs.map((n, i) => {
              const Icon = ICON[n.icon];
              return (
                <li key={`${n.kind}-${n.stepId ?? i}`} className="sa-mc-need">
                  <span className="sa-mc-need__icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
                  <div className="min-w-0"><p className="sa-mc-need__title">{n.title}</p><p className="sa-mc-need__detail">{n.detail}</p></div>
                  <Button variant={i === 0 ? 'primary' : 'secondary'} size="sm" onClick={() => open(n)}>{n.action}</Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : (
        <section className="sa-mc-lane" aria-label="Situation">
          <div className="sa-mc-lane__calm"><p className="sa-mc-calm" role="status"><CircleCheck size={18} aria-hidden="true" />Nothing needs you right now</p><p className="sa-mc-lane__line">{waiting}</p></div>
        </section>
      )}

      <Findings c={c} d={d} closed={closed} refOf={refOf} onOpen={setDialog} leadCount={leadCount} />
      <History d={d} refOf={refOf} self={id} />
      <Enforcement d={d} closed={closed} now={now} onOpen={setDialog} />

      <section className="sa-mc-sec" aria-labelledby="cm-activity">
        <div className="sa-mc-sec__head"><h2 id="cm-activity" className="sa-mc-sec__title">Activity <span className="sa-text-3">{activity.length}</span></h2><span className="sa-small sa-text-3">Writes itself</span></div>
        <Timeline label="Activity" items={activity.map((a) => ({ id: a.id, icon: ICON[a.icon], tone: a.tone, title: a.title,
          meta: <>{a.at ? fmtActivity(a.at) : ''}{a.meta ? ` · ${a.meta}` : ''}</>, body: a.detail ? <p className="sa-small sa-text-2">{a.detail}</p> : undefined }))} />
      </section>

      {!closed ? (
        <details className="sa-mc-more sa-mc-more--section">
          <summary>Close this complaint</summary>
          <p className="sa-small sa-text-2 mt-3">Closing records how it ended. It never removes a finding, a decision or a step.</p>
          <p className="mt-3"><Button size="sm" onClick={() => setCaseDialog({ kind: 'close' })}>Close the complaint</Button></p>
        </details>
      ) : null}

      <ComplaintDialogs c={c} d={d} dialog={dialog} refOf={refOf} onClose={() => setDialog(null)} onSaved={setD} />
      <CaseDialogs c={c} dialog={caseDialog} onClose={() => setCaseDialog(null)} />
    </div>
  );
}

const activityFmt = new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const fmtActivity = (iso: string) => activityFmt.format(new Date(iso));

function Findings({ c, d, closed, refOf, onOpen, leadCount }: { c: Case; d: ApiComplaint; closed: boolean; refOf: (id: number) => string; onOpen: (x: ComplaintDialogState) => void; leadCount?: number }) {
  if (d.same_as) {
    return (
      <section className="sa-mc-sec"><div className="sa-mc-sec__head"><h2 className="sa-mc-sec__title">Findings</h2></div>
        <dl className="sa-cm-find"><div><dt>Same occurrence</dt><dd><p>Linked to <Link to={adminPath(`/cases/${refOf(d.same_as.report_id)}`)}>{refOf(d.same_as.report_id)}</Link> on {fmtDay(d.same_as.linked_at)}.{d.same_as.note ? ` ${d.same_as.note}` : ''}</p><p className="sa-small sa-text-2">Counted once there. Both complainants hear the outcome.</p></dd><span /></div></dl>
      </section>
    );
  }
  const inc = d.incident;
  const incTone = inc.status === 'verified' ? 'sage' : inc.status === 'unverified' || inc.status === 'invalid' ? 'red' : 'amber';
  const incLabel = inc.status === 'verified' ? 'Verified' : inc.status === 'unverified' ? 'Not verified' : inc.status === 'invalid' ? 'Invalid' : 'Can’t tell yet';
  const decided = !!d.offense;
  return (
    <section className="sa-mc-sec"><div className="sa-mc-sec__head"><h2 className="sa-mc-sec__title">Findings</h2></div>
      <dl className="sa-cm-find">
        <div><dt>What happened</dt>
          <dd>{inc.at ? <><p className="sa-cm-tagline"><Badge tone={incTone}>{incLabel}</Badge><span className="sa-small sa-text-3">{fmt(inc.at)}{inc.by ? ` · ${inc.by}` : ''}</span></p>{inc.basis ? <p className="sa-small sa-text-2">{inc.basis}</p> : null}</> : <span className="sa-text-3">Not decided yet</span>}</dd>
          {!closed && inc.at ? <Button size="sm" variant="link" onClick={() => onOpen({ kind: 'verify' })}>Change</Button> : <span />}</div>
        <div><dt>Rule broken</dt>
          <dd>{d.rule ? <p>{d.rule.title}{d.rule.reference ? <span className="sa-text-3"> · {d.rule.reference}</span> : null}</p> : d.no_rule ? 'None of the subdivision’s rules applies' : <span className="sa-text-3">Chosen when you verify</span>}</dd><span /></div>
        <div><dt>Person responsible</dt>
          <dd>
            {d.respondent ? (
              <>
                <p><strong>{d.respondent.name}</strong> · {d.respondent.address} · {d.respondent.has_account ? 'StraySafe account' : 'No StraySafe account'}</p>
                <p className="mt-1"><Badge tone="sage">{VERIFIED_RP}</Badge></p>
                <p className="sa-small sa-text-2 mt-1">Evidence: {d.respondent.evidence.map(evidenceLabel).join(', ')}.{d.respondent.note ? ` “${d.respondent.note}”` : ''}{d.respondent.at ? ` · ${fmt(d.respondent.at)}` : ''}</p>
                <p className="sa-small mt-1"><Link to={adminPath(`/complaints/people/${d.respondent.respondent_id}`)}>{d.respondent.name}’s history</Link></p>
              </>
            ) : (
              <>
                <p className="sa-text-3">Not confirmed{d.suspect ? '. The complainant’s suggestion is not a finding.' : ''}</p>
                {!closed ? <p className="sa-small mt-1">{leadCount ? `${leadCount} lead${leadCount === 1 ? '' : 's'} to check in your records` : 'No leads in your records yet: check on the ground'} · <Button size="sm" variant="link" onClick={() => onOpen({ kind: 'resp' })}>See them</Button></p> : null}
              </>
            )}
            {d.corrections.map((k) => <p key={k.offense_id} className="sa-small sa-text-2 mt-1">Corrected {fmtDay(k.voided_at)}: it was not {k.respondent?.name ?? 'that person'}.{k.counted && k.number ? ` The ${ord(k.number)} offense confirmed for them no longer counts.` : ''}{k.void_reason ? ` “${k.void_reason}”` : ''}</p>)}
            {d.ruled_out.length ? <p className="sa-small sa-text-2 mt-1">Ruled out: {d.ruled_out.map((r) => `${r.label}${r.reason ? ` (${r.reason})` : ''}`).join('; ')}</p> : null}
            {!d.respondent && d.check ? <p className="sa-small sa-text-2 mt-1">Checked so far: {d.check.note}</p> : null}
          </dd>
          {!closed && d.respondent && !decided ? <Button size="sm" variant="link" onClick={() => onOpen({ kind: 'resp' })}>Change</Button>
            : d.respondent && decided ? <Button size="sm" variant="link" onClick={() => onOpen({ kind: 'resp', correcting: true })}>Correct</Button> : <span />}
        </div>
        {d.also_reported.length || d.maybe_same ? (
          <div><dt>Also reported</dt><dd>
            {d.also_reported.map((x) => <p key={x.report_id}><Link to={adminPath(`/cases/${refOf(x.report_id)}`)}>{refOf(x.report_id)}</Link>: the same occurrence, linked {fmtDay(x.linked_at)}. Counted once, here.</p>)}
            {d.maybe_same ? <p>May be the same occurrence as <Link to={adminPath(`/cases/${refOf(d.maybe_same.report_id)}`)}>{refOf(d.maybe_same.report_id)}</Link>. Decide before it is counted.</p> : null}
          </dd><span /></div>
        ) : null}
        {d.separate_from ? <div><dt>Same occurrence?</dt><dd><p>You kept it separate from <Link to={adminPath(`/cases/${refOf(d.separate_from.report_id)}`)}>{refOf(d.separate_from.report_id)}</Link>. It counts only if verified on its own.</p></dd><span /></div> : null}
      </dl>
      {c.priority === 'urgent' && !closed ? <Callout tone="red" className="mt-3" title="Urgent safety concern.">Begin safety coordination now. Routine steps must not delay it.</Callout> : null}
    </section>
  );
}

function History({ d, refOf, self }: { d: ApiComplaint; refOf: (id: number) => string; self: number }) {
  const h = d.history;
  if (!h || !d.respondent || d.same_as) return null;
  const pending = h.pending;
  const notCounted = h.not_counted.filter((x) => x.report_id !== self || x.kind === 'corrected');
  return (
    <section className="sa-mc-sec">
      <div className="sa-mc-sec__head"><h2 className="sa-mc-sec__title">{d.respondent.name} · {h.policy_title ?? d.rule?.title}</h2><Link className="sa-small" to={adminPath(`/complaints/people/${d.respondent.respondent_id}`)}>Full history</Link></div>
      <p className="sa-hint mb-2">Counts only verified incidents of this rule where you confirmed {d.respondent.name} as responsible{h.count_window_days ? `, within ${h.count_window_days} days` : ''}. Each occurrence counts once.</p>
      <ol className="sa-cm-ladder">
        {h.counted.map((x, i) => (
          <li key={x.offense_id} data-state={x.report_id === self ? 'current' : 'done'}>
            <span className="sa-cm-ladder__n">{x.number ? ord(x.number) : '—'}</span>
            <div className="min-w-0">
              <p>{x.report_id === self ? <b>This complaint</b> : <Link to={adminPath(`/cases/${refOf(x.report_id)}`)}>{refOf(x.report_id)}</Link>} · seen {fmtDay(x.incident_at)}</p>
              <p className="sa-meta mt-0.5">Confirmed {fmtDay(x.confirmed_at)}{x.steps.length ? ` · ${x.steps.map((s) => `${lc(s.label)}: ${lc(stepBadge(s.kind, s.state).text)}`).join(' · ')}` : ''}</p>
              {x.number && x.number !== i + 1 ? <p className="sa-small sa-text-amber mt-0.5">Confirmed as the {ord(x.number)}; after a correction it is the {ord(i + 1)} in this history. Review it.</p> : null}
            </div>
          </li>
        ))}
        {pending.map((x) => (
          <li key={`p-${x.report_id}`} data-state="suggested">
            <span className="sa-cm-ladder__n">{ord(x.suggestion)}?</span>
            <div className="min-w-0"><p>{x.report_id === self ? <b>This complaint</b> : <Link to={adminPath(`/cases/${refOf(x.report_id)}`)}>{refOf(x.report_id)}</Link>} · seen {fmtDay(x.incident_at)}</p><p className="sa-meta mt-0.5">Suggested by StraySafe · waits for your confirmation</p></div>
          </li>
        ))}
        {!h.counted.length && !pending.length ? <li><span className="sa-cm-ladder__n">—</span><div className="sa-small sa-text-2">No offense counted yet.</div></li> : null}
      </ol>
      {notCounted.length ? (
        <details className="sa-cm-fold"><summary>Not counted here ({notCounted.length})</summary>
          <ul>{notCounted.map((x) => <li key={`${x.kind}-${x.report_id}`}><Link to={adminPath(`/cases/${refOf(x.report_id)}`)}>{refOf(x.report_id)}</Link> · {x.why}</li>)}</ul>
        </details>
      ) : null}
    </section>
  );
}

function stepSub(s: ApiStep, d: ApiComplaint): string | null {
  const summons = d.steps.find((x) => x.kind === 'summons');
  const place = (v: ApiStep | undefined) => (v?.details as Record<string, string> | undefined)?.place;
  if (s.kind === 'letter_2' && summons?.due_at) return `Includes the summons: ${fmt(summons.due_at)}, ${place(summons) ?? 'Subdivision office'}.`;
  if (s.kind === 'summons' && s.state === 'waiting') return 'The date and place are written in the second warning letter.';
  if (s.kind === 'summons' && s.state === 'scheduled' && !d.steps.some((x) => x.kind === 'letter_2' && x.state === 'delivered')) return 'Attendance can be recorded once the letter that sets the date is delivered.';
  if (s.kind === 'fine') return d.rule?.fine_amount != null ? `Amount: ${peso(d.rule.fine_amount)}, from the rule.` : 'This rule has no fine amount yet (Settings, Policies).';
  if (s.kind === 'meeting') return 'With the complainant, the person responsible and you.';
  return null;
}

function Enforcement({ d, closed, now, onOpen }: { d: ApiComplaint; closed: boolean; now: Date; onOpen: (x: ComplaintDialogState) => void }) {
  if (!d.offense) return null;
  if (!d.offense.counted) {
    return <section className="sa-mc-sec"><div className="sa-mc-sec__head"><h2 className="sa-mc-sec__title">Not counted as an offense</h2></div><p className="sa-small sa-text-2">You decided on {fmt(d.offense.confirmed_at)}: {d.offense.note}</p></section>;
  }
  const n = d.offense.number ?? 0;
  const letter2Delivered = d.steps.some((s) => s.kind === 'letter_2' && s.state === 'delivered');
  return (
    <section className="sa-mc-sec">
      <div className="sa-mc-sec__head"><h2 className="sa-mc-sec__title">{ord(n)} offense: what the rule asks</h2><span className="sa-small sa-text-3">Confirmed {fmt(d.offense.confirmed_at)}{d.offense.confirmed_by ? ` · ${d.offense.confirmed_by}` : ''}</span></div>
      {STAGE_TEXT[n] ? <p className="sa-hint mb-2">For a {ord(n)} offense: {STAGE_TEXT[n]}.</p> : null}
      {d.steps.length ? (
        <ul className="sa-cm-steps">
          {d.steps.map((s) => {
            const b = stepBadge(s.kind, s.state);
            const nx = stepNext(s.kind, s.state, letter2Delivered, s.due_at, now);
            const trail = stepTrail(s);
            const sub = stepSub(s, d);
            const Icon = ICON[s.kind];
            return (
              <li key={s.step_id} className="sa-cm-step" data-done={b.done ? '' : undefined} data-wait={b.wait ? '' : undefined}>
                <span className="sa-cm-step__icon" aria-hidden="true"><Icon size={18} /></span>
                <div className="min-w-0">
                  <p className="sa-cm-step__title">{s.label} <Badge tone={b.tone || undefined}>{b.text}</Badge></p>
                  {sub ? <p className="sa-small sa-text-2 mt-0.5">{sub}</p> : null}
                  {trail.length ? <ul className="sa-cm-trail">{trail.map((x, i) => <li key={i} data-tone={x.tone || undefined}>{x.text}</li>)}</ul> : null}
                </div>
                <div className="sa-cm-step__acts">
                  {nx && !closed ? <Button size="sm" onClick={() => onOpen({ kind: 'step', stepId: s.step_id, action: nx.action })}>{nx.label}</Button> : null}
                  {(s.kind === 'letter_1' || s.kind === 'letter_2') && s.state !== 'to_prepare' ? <Button size="sm" variant="ghost" icon={Printer} onClick={() => onOpen({ kind: 'print', stepId: s.step_id })}>Print again</Button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <Callout tone="amber" title={`The rules don’t say what a ${ord(n)} offense requires.`}>This is an open question for the subdivision. Record what you do as internal notes until it is decided.</Callout>}
    </section>
  );
}
