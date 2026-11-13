import { AlertTriangle, CalendarClock, CalendarPlus, Check, ClipboardCheck, Handshake, Landmark, MessageSquare, NotebookPen, ShieldCheck, X } from 'lucide-react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Block, Callout, Kv, Panel } from '../../components/layout';
import { Timeline, type TimelineItem } from '../../components/Timeline';
import { useToast } from '../../components/toast';
import { CATEGORIES, COMPLIANCE_RESULTS, CONTACT_METHODS, CONTACT_OUTCOMES, FOLLOWUP_KINDS, REFERRAL_STATUS, WARNING_DELIVERY } from '../../data/constants';
import { useAdminData } from '../../data/context';
import { pendingFollowUpsOf, warningEligibility } from '../../data/selectors';
import type { Case, Referral, Warning } from '../../data/types';
import { dueInfo, fmtDateTime, remaining } from '../../../preview/lib/format';
import { errorMessage } from '../../../preview/lib/errors';
import type { OpenCaseDialog } from './dialogState';

type Props = { c: Case; now: Date; openDialog: OpenCaseDialog };

function WarningCard({ w, c, now, openDialog }: { w: Warning; c: Case; now: Date; openDialog: OpenCaseDialog }) {
  const start = w.observationStart ? new Date(w.observationStart).getTime() : null;
  const end = w.observationEnd ? new Date(w.observationEnd).getTime() : null;
  const pct = start && end ? Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100)) : null;
  const outcome = w.outcome === 'compliant' ? <Badge tone="sage">Compliant</Badge> : w.outcome === 'non_compliant' ? <Badge tone="red">Not compliant</Badge> : <Badge>Concluded</Badge>;
  return (
    <div className="sa-record">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2"><span className="sa-semibold">{w.policyRef}</span><span className="sa-text-2">{w.policyTitle}</span></p>
          <p className="sa-meta mt-0.5">Issued {fmtDateTime(w.issuedAt)} · {WARNING_DELIVERY[w.delivery].toLowerCase()} · to {w.ownerName}</p>
        </div>
        {w.status === 'active' ? <Badge tone="brand" dot>Active</Badge> : w.status === 'concluded' ? outcome : <Badge>Withdrawn</Badge>}
      </div>
      <p className="mt-3">{w.details}</p>

      {w.observationEnd ? (
        <div className="mt-4">
          <div className="flex items-center justify-between sa-small"><span>{w.observationDays} {w.observationDays === 1 ? 'day' : 'days'} observation</span><span className={w.status === 'active' && end && end < now.getTime() ? 'sa-text-red sa-semibold' : 'sa-text-2'}>{w.status === 'active' ? remaining(w.observationEnd, now) : `ended ${fmtDateTime(w.observationEnd).split(' · ')[0]}`}</span></div>
          <div className="sa-progress mt-1.5" role="progressbar" aria-label="Observation period elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct ?? 0)}><span style={{ width: `${pct ?? 0}%` }} /></div>
          <p className="sa-meta mt-1">{fmtDateTime(w.observationStart!)} → {fmtDateTime(w.observationEnd)}</p>
        </div>
      ) : <p className="sa-meta mt-3">The policy defines no observation period, so none was assumed.</p>}

      {w.observations.length > 0 ? (
        <div className="mt-4">
          <p className="sa-label mb-1.5">Compliance observations</p>
          <ul className="m-0 list-none p-0">
            {w.observations.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1">
                <Badge tone={COMPLIANCE_RESULTS[o.result].tone}>{COMPLIANCE_RESULTS[o.result].label}</Badge>
                <span className="sa-small">{o.notes}</span>
                <span className="sa-meta">{fmtDateTime(o.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {w.status === 'concluded' && w.outcomeNote ? <p className="sa-small sa-text-2 mt-3"><span className="sa-semibold">Outcome:</span> {w.outcomeNote}</p> : null}
      {w.status === 'active' && c.status !== 'closed' ? <div className="mt-4 flex flex-wrap items-center gap-3"><Button size="sm" icon={ClipboardCheck} onClick={() => openDialog({ kind: 'compliance' })}>Record compliance observation</Button><span className="sa-meta">No fine is assessed by the subdivision.</span></div> : null}
    </div>
  );
}

function ReferralCard({ r, c, openDialog }: { r: Referral; c: Case; openDialog: OpenCaseDialog }) {
  const s = REFERRAL_STATUS[r.status];
  return (
    <div className="sa-record">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sa-semibold">{r.orgName}</p>
          <p className="sa-meta mt-0.5">{r.status === 'to_contact' ? `Written down ${fmtDateTime(r.referredAt)} · nobody contacted yet` : `Referred ${fmtDateTime(r.referredAt)} · ${r.contactPerson} · ${r.contactChannel}`}</p>
        </div>
        <div className="flex items-center gap-2"><Badge tone={s.tone} dot>{s.label}</Badge>{c.status !== 'closed' && r.orgId === 'barangay' ? <Button size="sm" icon={Handshake} onClick={() => openDialog({ kind: 'coordination', referralId: r.id, ...(r.status === 'to_contact' ? { contact: true } : {}) })}>{r.status === 'to_contact' ? 'Record contact attempt' : 'Record update'}</Button> : null}</div>
      </div>
      <Kv wide rows={[
        ['Reason', r.reason],
        ...(r.externalOutcome ? [['External outcome', r.externalOutcome] as [string, string]] : []),
        ...(r.remainingFollowUp ? [['Subdivision follow-up', r.remainingFollowUp] as [string, string]] : []),
      ]} />
      {r.notes.length > 0 ? (
        <details className="mt-3">
          <summary className="sa-small cursor-pointer font-semibold">Communication notes ({r.notes.length})</summary>
          <ul className="m-0 mt-2 list-none p-0">
            {r.notes.map((n) => <li key={n.id} className="sa-small py-1"><span className="sa-text-3">{fmtDateTime(n.at)}</span> · {n.text}</li>)}
          </ul>
        </details>
      ) : null}
      {r.status === 'completed' && c.status !== 'closed' ? <Callout className="mt-3" tone="sage">The external work is complete, but the case is still open. Record any remaining subdivision follow-up, or close the case with a documented outcome.</Callout> : null}
    </div>
  );
}

/** Everything that was done on the case, newest first. Status and assessment changes live in History. */
function actionTimeline(c: Case): TimelineItem[] {
  const items: (TimelineItem & { at: string })[] = [];
  for (const f of c.followUps) {
    if (f.status === 'done' && f.completedAt) items.push({ id: f.id, at: f.completedAt, icon: CalendarClock, tone: 'sage', title: `Follow-up done: ${f.title}`, meta: `${FOLLOWUP_KINDS[f.kind]} · ${fmtDateTime(f.completedAt)}`, body: f.completionNote ? <p className="sa-small sa-text-2">{f.completionNote}</p> : undefined });
    if (f.status === 'cancelled') items.push({ id: f.id, at: f.createdAt, icon: CalendarClock, title: `Follow-up cancelled: ${f.title}`, meta: `${FOLLOWUP_KINDS[f.kind]} · ${fmtDateTime(f.createdAt)}` });
  }
  for (const o of c.ownerContacts) items.push({ id: o.id, at: o.at, icon: MessageSquare, title: `Owner coordination · ${CONTACT_METHODS[o.method].toLowerCase()} with ${o.withWhom}`, meta: `${o.by} · ${fmtDateTime(o.at)} · ${CONTACT_OUTCOMES[o.outcome]}`, body: <p className="sa-small sa-text-2">{o.summary}</p> });
  for (const n of c.notes) items.push({ id: n.id, at: n.at, icon: NotebookPen, title: 'Internal note', meta: `${n.by} · ${fmtDateTime(n.at)}`, body: <p className="sa-small sa-text-2">{n.text}</p> });
  for (const w of c.warnings) {
    items.push({ id: w.id, at: w.issuedAt, icon: AlertTriangle, tone: 'amber', title: `Warning issued under ${w.policyRef}`, meta: `${w.issuedBy} · ${fmtDateTime(w.issuedAt)}`, body: <p className="sa-small sa-text-2">{w.details}</p> });
    for (const o of w.observations) items.push({ id: o.id, at: o.at, icon: ShieldCheck, tone: o.result === 'compliant' ? 'sage' : o.result === 'non_compliant' ? 'red' : undefined, title: `Compliance observation: ${COMPLIANCE_RESULTS[o.result].label.toLowerCase()}`, meta: `${o.by} · ${fmtDateTime(o.at)}`, body: <p className="sa-small sa-text-2">{o.notes}</p> });
    if (w.concludedAt) items.push({ id: `${w.id}-end`, at: w.concludedAt, icon: ShieldCheck, tone: w.outcome === 'compliant' ? 'sage' : undefined, title: `Observation concluded${w.outcome === 'compliant' ? ': compliant' : w.outcome === 'non_compliant' ? ': not compliant' : ''}`, meta: fmtDateTime(w.concludedAt) });
  }
  for (const r of c.referrals) {
    items.push({ id: r.id, at: r.referredAt, icon: Landmark, tone: 'brand', title: `Referred to ${r.orgName}`, meta: `${r.createdBy} · ${fmtDateTime(r.referredAt)}`, body: <p className="sa-small sa-text-2">{r.reason}</p> });
    for (const n of r.notes) if (n.status) items.push({ id: n.id, at: n.at, icon: Handshake, title: `${r.orgName}: ${REFERRAL_STATUS[n.status].label.toLowerCase()}`, meta: `${n.by} · ${fmtDateTime(n.at)}`, body: <p className="sa-small sa-text-2">{n.text}</p> });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).map((x) => ({ id: x.id, icon: x.icon, tone: x.tone, title: x.title, meta: x.meta, body: x.body }));
}

/** A08 Case actions & monitoring, A09 warning & compliance, A10 external coordination. */
export default function ActionsTab({ c, now, openDialog }: Props) {
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const closed = c.status === 'closed';
  const eligibility = warningEligibility(c, state);
  const warningRelevant = CATEGORIES[c.category].violation;
  const hasActive = c.warnings.some((w) => w.status === 'active');
  const ownerRelevant = c.animal.type !== 'wildlife';
  const pending = pendingFollowUpsOf(c).sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
  const warnings = [...c.warnings].sort((a, b) => (a.status === 'active' ? -1 : 0) - (b.status === 'active' ? -1 : 0) || b.issuedAt.localeCompare(a.issuedAt));
  const items = actionTimeline(c);

  const cancel = (id: string) => { dispatch({ type: 'case/cancelFollowUp', id: c.id, followUpId: id }).then(() => toast.success('Follow-up cancelled')).catch((e: unknown) => toast.error(errorMessage(e))); };

  return (
    <div className="flex max-w-[900px] flex-col gap-5">
      {closed ? <Callout>This case is closed. You can still add internal notes, or reopen the case to record new actions.</Callout> : null}
      {c.priority === 'urgent' && !closed ? <Callout tone="red" title="Urgent safety concern.">Begin safety coordination now. Routine warnings and observation periods must not delay it.</Callout> : null}

      <div>
        <div className="flex flex-wrap gap-2">
          {!closed ? <Button icon={CalendarPlus} onClick={() => openDialog({ kind: 'followUp', mode: 'follow_up' })}>Record follow-up</Button> : null}
          {!closed && ownerRelevant ? <Button icon={MessageSquare} onClick={() => openDialog({ kind: 'followUp', mode: 'owner' })}>Record owner coordination</Button> : null}
          {!closed && warningRelevant ? <Button icon={AlertTriangle} disabled={!eligibility.ok} onClick={() => openDialog({ kind: 'warning' })}>Issue warning</Button> : null}
          {!closed && hasActive ? <Button icon={ClipboardCheck} onClick={() => openDialog({ kind: 'compliance' })}>Record compliance</Button> : null}
          {!closed ? <Button variant={c.priority === 'urgent' ? 'primary' : 'secondary'} icon={Landmark} onClick={() => openDialog({ kind: 'referral' })}>Ask the Barangay for help</Button> : null}
          <Button icon={NotebookPen} onClick={() => openDialog({ kind: 'note' })}>Add internal note</Button>
        </div>
        {!closed && warningRelevant && !eligibility.ok ? <p className="sa-hint mt-2">Issuing a warning is not available yet. {eligibility.reason}</p> : null}
      </div>

      {pending.length > 0 ? (
        <Panel>
          <Block title="Follow-ups" description="What is still to be done on this case.">
            <ul className="m-0 flex list-none flex-col p-0">
              {pending.map((f) => {
                const due = dueInfo(f.dueAt, now);
                return (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-solid py-3 first:border-t-0 first:pt-0 last:pb-0" style={{ borderColor: 'var(--sa-line-soft)' }}>
                    <div className="min-w-0">
                      <p className="font-medium">{f.title}</p>
                      <p className="sa-meta mt-0.5">{FOLLOWUP_KINDS[f.kind]} · <span className={due.overdue ? 'sa-text-red sa-semibold' : due.today ? 'sa-text-amber sa-semibold' : ''}>{due.label}</span>{f.notes ? ` · ${f.notes}` : ''}</p>
                    </div>
                    <div className="flex gap-2"><Button size="sm" icon={Check} onClick={() => openDialog({ kind: 'completeFollowUp', followUpId: f.id })}>Mark done</Button><Button size="sm" variant="ghost" icon={X} aria-label={`Cancel follow-up: ${f.title}`} onClick={() => cancel(f.id)}>Cancel</Button></div>
                  </li>
                );
              })}
            </ul>
          </Block>
        </Panel>
      ) : null}

      {warnings.length > 0 ? (
        <Panel>
          <Block title="Warning & compliance" description="Issued under a confirmed policy. The observation period comes from that policy.">
            <div className="flex flex-col gap-3">{warnings.map((w) => <WarningCard key={w.id} w={w} c={c} now={now} openDialog={openDialog} />)}</div>
          </Block>
        </Panel>
      ) : null}

      {c.referrals.length > 0 ? (
        <Panel>
          <Block title="External coordination" description="The subdivision keeps responsibility for the case while others help.">
            <div className="flex flex-col gap-3">{c.referrals.map((r) => <ReferralCard key={r.id} r={r} c={c} openDialog={openDialog} />)}</div>
          </Block>
        </Panel>
      ) : null}

      <Panel>
        <Block title="Activity timeline" description="What was done on this case, newest first. Status and assessment changes are in History.">
          {items.length === 0 ? <p className="sa-small sa-text-2">Nothing has been recorded yet. Follow-ups, owner coordination, warnings, referrals and notes will appear here in order.</p> : <Timeline label="Activity timeline" items={items} />}
        </Block>
      </Panel>
    </div>
  );
}
