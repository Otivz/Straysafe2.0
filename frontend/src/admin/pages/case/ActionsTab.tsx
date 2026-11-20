import { useState, type ElementType } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarPlus, Check, ClipboardCheck, Download, Eye, Landmark, Megaphone, MessageSquare, NotebookPen, RefreshCw, X } from 'lucide-react';
import { adminPath } from '../../config';
import { Badge } from '../../components/Badge';
import { Button, LinkButton } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { Block, Callout, Panel } from '../../components/layout';
import { useToast } from '../../components/toast';
import { CATEGORIES, COMPLIANCE_RESULTS, FOLLOWUP_KINDS, WARNING_DELIVERY } from '../../data/constants';
import { useAdminData } from '../../data/context';
import { pendingFollowUpsOf, warningEligibility } from '../../data/selectors';
import type { Case, Warning } from '../../data/types';
import { adminApi, type ApiGeneratedWarningLetter } from '../../live/api';
import { dueInfo, fmtDateTime, remaining } from '../../../preview/lib/format';
import { errorMessage } from '../../../preview/lib/errors';
import type { OpenCaseDialog } from './dialogState';

type Props = { c: Case; now: Date; openDialog: OpenCaseDialog };

function WarningCard({ w, c, now, openDialog, delayMs = 0 }: { w: Warning; c: Case; now: Date; openDialog: OpenCaseDialog; delayMs?: number }) {
  const toast = useToast();
  const [letterModal, setLetterModal] = useState<ApiGeneratedWarningLetter | null>(null);
  const [busy, setBusy] = useState(false);
  const [notifStatus, setNotifStatus] = useState<string | null>(w.notificationStatus ?? null);
  const [notifErr, setNotifErr] = useState<string | null>(w.notificationError ?? null);

  const start = w.observationStart ? new Date(w.observationStart).getTime() : null;
  const end = w.observationEnd ? new Date(w.observationEnd).getTime() : null;
  const pct = start && end ? Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100)) : null;
  const outcome = w.outcome === 'compliant' ? <Badge tone="sage">Compliant</Badge> : w.outcome === 'non_compliant' ? <Badge tone="red">Not compliant</Badge> : <Badge>Concluded</Badge>;
  const ref = w.warningReference || `WARN-${w.id}`;

  const viewLetter = async () => {
    if (!w.letterId) return;
    setBusy(true);
    try {
      const data = await adminApi.warningLetterDetail(w.letterId);
      setLetterModal(data);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const download = async (format: 'pdf' | 'docx') => {
    if (!w.letterId) return;
    try {
      await adminApi.downloadWarningLetter(w.letterId, ref, format);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const retryNotif = async () => {
    if (!w.letterId) return;
    setBusy(true);
    try {
      const updated = await adminApi.retryWarningNotification(w.letterId);
      setNotifStatus(updated.notification_status);
      setNotifErr(updated.notification_error);
      if (updated.notification_status === 'sent') toast.success('Notification resent to resident');
      else toast.error(updated.notification_error || 'Notification retry failed');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const accentClass =
    w.status === 'active'
      ? 'border-l-[3.5px] border-l-[#b45309]'
      : w.outcome === 'compliant'
        ? 'border-l-[3.5px] border-l-emerald-600'
        : w.outcome === 'non_compliant'
          ? 'border-l-[3.5px] border-l-red-500'
          : '';

  return (
    <div
      className={`sa-fade-up rounded-xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] p-4 shadow-xs transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[#d6cfc7] hover:shadow-sm ${accentClass}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 flex flex-wrap items-center gap-2">
            {w.warningReference ? <span className="sa-ref">{w.warningReference}</span> : null}
            {w.warningLevel ? <Badge tone="amber">{w.warningLevel}</Badge> : null}
            <span className="sa-semibold text-[#1c1917]">{w.policyRef}</span>
            <span className="sa-text-2">{w.policyTitle}</span>
          </p>
          <p className="sa-meta mt-1">
            Issued {fmtDateTime(w.issuedAt)} · {WARNING_DELIVERY[w.delivery].toLowerCase()} · to {w.ownerName}
            {w.templateName ? ` · Template: ${w.templateName} (v${w.templateVersionNumber ?? 1})` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {notifStatus ? (
            <Badge tone={notifStatus === 'sent' || notifStatus === 'delivered' ? 'sage' : notifStatus === 'failed' ? 'red' : 'neutral'}>
              {notifStatus === 'sent' || notifStatus === 'delivered' ? 'Notified' : notifStatus === 'failed' ? 'Notification failed' : notifStatus}
            </Badge>
          ) : null}
          {w.viewedAt ? <Badge tone="sage">Viewed {fmtDateTime(w.viewedAt).split(' · ')[0]}</Badge> : (w.letterId ? <Badge tone="neutral">Unread by resident</Badge> : null)}
          <Badge tone={w.acknowledgedAt ? 'sage' : 'neutral'}>
            {w.acknowledgedAt ? `Acknowledged ${fmtDateTime(w.acknowledgedAt).split(' · ')[0]}` : 'Awaiting Acknowledgment'}
          </Badge>
          {w.status === 'active' ? <Badge tone="brand" dot>Active</Badge> : w.status === 'concluded' ? outcome : <Badge>Withdrawn</Badge>}
        </div>
      </div>
      {notifStatus === 'failed' && notifErr ? (
        <Callout tone="amber" className="mt-2.5" title="Notification delivery failed">
          {notifErr} — Warning record is preserved.
        </Callout>
      ) : null}
      <div className="mt-3 rounded-lg border border-[#ede7de] bg-[#faf7f2] px-3 py-2 text-sm text-[#1c1917] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {w.details}
      </div>

      {w.ownerResponse ? (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs space-y-0.5">
          <div className="font-semibold text-[var(--sa-brand-ink)]">
            Owner Response / Clarification{w.ownerRespondedAt ? ` (${fmtDateTime(w.ownerRespondedAt)})` : ''}:
          </div>
          <p className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-sm text-[var(--sa-text-1)]">{w.ownerResponse}</p>
        </div>
      ) : null}

      {w.letterId || w.threadId ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {w.letterId ? (
            <>
              <Button size="sm" icon={Eye} loading={busy} onClick={() => void viewLetter()}>View letter</Button>
              <Button size="sm" variant="ghost" icon={Download} onClick={() => void download('pdf')}>Download PDF</Button>
              <Button size="sm" variant="ghost" icon={Download} onClick={() => void download('docx')}>Download DOCX</Button>
              {notifStatus === 'failed' ? (
                <Button size="sm" icon={RefreshCw} loading={busy} onClick={() => void retryNotif()}>Retry notification</Button>
              ) : null}
            </>
          ) : null}
          {w.threadId ? (
            <LinkButton size="sm" variant="ghost" icon={MessageSquare} to={adminPath(`/messages/${w.threadId}`)}>
              Conversation
            </LinkButton>
          ) : null}
        </div>
      ) : null}

      {w.observationEnd ? (
        <div className="mt-4 rounded-lg border border-[#ede7de] bg-white/80 p-3">
          <div className="flex items-center justify-between sa-small">
            <span className="font-medium text-[#292524]">{w.observationDays} {w.observationDays === 1 ? 'day' : 'days'} observation</span>
            <span className={w.status === 'active' && end && end < now.getTime() ? 'sa-text-red sa-semibold' : 'sa-text-2 font-medium'}>{w.status === 'active' ? remaining(w.observationEnd, now) : `ended ${fmtDateTime(w.observationEnd).split(' · ')[0]}`}</span>
          </div>
          <div className="sa-progress mt-2 overflow-hidden" role="progressbar" aria-label="Observation period elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct ?? 0)}>
            <span className="transition-[width] duration-700 ease-out" style={{ width: `${pct ?? 0}%` }} />
          </div>
          <p className="sa-meta mt-1.5">{fmtDateTime(w.observationStart!)} → {fmtDateTime(w.observationEnd)}</p>
        </div>
      ) : <p className="sa-meta mt-3">The policy defines no observation period, so none was assumed.</p>}

      {w.observations.length > 0 ? (
        <div className="mt-4">
          <p className="sa-label mb-1.5">Compliance observations</p>
          <ul className="m-0 list-none space-y-1 p-0">
            {w.observations.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-lg bg-[#faf7f2] px-2.5 py-1.5">
                <Badge tone={COMPLIANCE_RESULTS[o.result].tone}>{COMPLIANCE_RESULTS[o.result].label}</Badge>
                <span className="sa-small">{o.notes}</span>
                <span className="sa-meta">{fmtDateTime(o.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {w.status === 'concluded' && w.outcomeNote ? <p className="sa-small sa-text-2 mt-3"><span className="sa-semibold">Outcome:</span> {w.outcomeNote}</p> : null}
      {w.status === 'active' && c.status !== 'closed' ? <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#ede7de] pt-3"><Button size="sm" icon={ClipboardCheck} onClick={() => openDialog({ kind: 'compliance' })}>Record compliance observation</Button><span className="sa-meta">No fine is assessed by the subdivision.</span></div> : null}

      {letterModal ? (
        <Dialog
          size="lg"
          title={`${letterModal.warning_reference} · ${letterModal.warning_level}`}
          description={`Template: ${letterModal.template_name} (v${letterModal.template_version_number}) · Issued ${letterModal.issued_at ? fmtDateTime(letterModal.issued_at) : ''}`}
          onClose={() => setLetterModal(null)}
          footer={(
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button size="sm" icon={Download} onClick={() => void download('pdf')}>Download PDF</Button>
                <Button size="sm" icon={Download} onClick={() => void download('docx')}>Download DOCX</Button>
              </div>
              <Button variant="primary" onClick={() => setLetterModal(null)}>Close</Button>
            </div>
          )}
        >
          <div className="sa-cm-letter">
            <p><strong>{letterModal.rendered_subject}</strong></p>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{letterModal.rendered_body}</div>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}

interface ActionTileProps {
  icon: ElementType;
  title: string;
  subtitle: string;
  tone?: 'primary' | 'amber' | 'neutral';
  disabled?: boolean;
  onClick?: () => void;
  to?: string;
  delayMs?: number;
}

function ActionTile({
  icon: Icon,
  title,
  subtitle,
  tone = 'neutral',
  disabled = false,
  onClick,
  to,
  delayMs = 0,
}: ActionTileProps) {
  const toneClasses =
    tone === 'primary'
      ? 'border-[#b45309]/35 bg-gradient-to-br from-[#fff7ed] to-[#ffedd5]/60 hover:border-[#b45309]/65'
      : tone === 'amber'
        ? 'border-[#d97706]/30 bg-[#fffbeb]/55 hover:border-[#d97706]/55'
        : 'border-[var(--sa-line,#e7e2da)] bg-white hover:border-[#c7bfb5]';

  const iconClasses =
    tone === 'primary'
      ? 'bg-[#b45309] text-white shadow-xs'
      : tone === 'amber'
        ? 'bg-[#fef3c7] text-[#b45309]'
        : 'bg-[#f5f0e8] text-[#57534e]';

  const baseClass = `group relative flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all duration-200 ease-out sa-fade-up ${disabled
    ? 'cursor-not-allowed border-[var(--sa-line,#e7e2da)] bg-[#faf8f5] opacity-60'
    : `${toneClasses} cursor-pointer hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0`
    }`;

  const inner = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 ${!disabled ? 'group-hover:scale-105' : ''} ${iconClasses}`}>
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-1.5">
          <span className="text-sm font-semibold text-[#1c1917]">{title}</span>
          {!disabled ? (
            <ArrowRight size={14} className="shrink-0 text-[#78716c] opacity-60 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[#b45309] group-hover:opacity-100" aria-hidden="true" />
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs leading-snug text-[#57534e]">{subtitle}</span>
      </span>
    </>
  );

  if (to && !disabled) {
    return (
      <Link
        to={to}
        className={`${baseClass} no-underline`}
        style={{ animationDelay: `${delayMs}ms` }}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={baseClass}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {inner}
    </button>
  );
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
  const advisory = state.notices.find((n) => n.caseId === c.id && n.status !== 'archived');

  const cancel = (id: string) => { dispatch({ type: 'case/cancelFollowUp', id: c.id, followUpId: id }).then(() => toast.success('Follow-up cancelled')).catch((e: unknown) => toast.error(errorMessage(e))); };

  const actionTiles: ActionTileProps[] = [];
  if (!closed) {
    actionTiles.push({
      icon: CalendarPlus,
      title: 'Record Follow-up',
      subtitle: 'Document a completed follow-up activity on this case',
      onClick: () => openDialog({ kind: 'followUp', mode: 'follow_up' }),
    });
  }
  if (!closed && ownerRelevant) {
    actionTiles.push({
      icon: MessageSquare,
      title: 'Record owner coordination',
      subtitle: 'Log contact attempts or owner updates',
      onClick: () => openDialog({ kind: 'followUp', mode: 'owner' }),
    });
  }
  if (!closed && warningRelevant) {
    actionTiles.push({
      icon: AlertTriangle,
      title: 'Issue warning',
      subtitle: eligibility.ok ? 'Send formal policy warning to owner' : eligibility.reason || 'Complete ownership review first',
      tone: 'amber',
      disabled: !eligibility.ok,
      onClick: () => openDialog({ kind: 'warning' }),
    });
  }
  if (!closed && hasActive) {
    actionTiles.push({
      icon: ClipboardCheck,
      title: 'Record compliance',
      subtitle: 'Log observation for active warning',
      tone: 'amber',
      onClick: () => openDialog({ kind: 'compliance' }),
    });
  }
  if (!closed) {
    actionTiles.push({
      icon: Landmark,
      title: 'Create Referral',
      subtitle: 'Refer case to Barangay, Vet Office, Animal Control, or Welfare Agency',
      tone: c.priority === 'urgent' ? 'primary' : 'neutral',
      onClick: () => openDialog({ kind: 'referral' }),
    });
  }
  if (!closed && c.category === 'safety') {
    actionTiles.push({
      icon: Megaphone,
      title: advisory ? 'View / edit Safety Advisory' : 'Publish Safety Advisory',
      subtitle: advisory ? 'Update the active community notice' : 'Alert residents about this safety concern',
      tone: 'amber',
      to: advisory ? adminPath(`/community/${advisory.id}`) : adminPath(`/community/new?fromCase=${c.id}`),
    });
  }
  actionTiles.push({
    icon: NotebookPen,
    title: 'Add internal note',
    subtitle: 'Record private staff-only case notes',
    onClick: () => openDialog({ kind: 'note' }),
  });

  return (
    <div className="flex max-w-[920px] flex-col gap-5">
      <style>{`
        @keyframes saFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sa-fade-up {
          animation: saFadeUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>

      {closed ? (
        <div className="sa-fade-up">
          <Callout>This case is closed. You can still add internal notes, or reopen the case to record new actions.</Callout>
        </div>
      ) : null}

      {c.priority === 'urgent' && !closed ? (
        <div className="sa-fade-up rounded-xl border border-[#ef4444]/30 bg-gradient-to-r from-[#fef2f2] to-[#fff5f5] p-3.5 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-[#b91c1c]">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ef4444]/35" />
              <AlertTriangle size={15} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="m-0 text-sm font-semibold text-[#991b1b]">
                {c.category === 'injured' ? 'Urgent injured / sick animal response' : 'Urgent safety concern'}
              </p>
              <p className="m-0 mt-0.5 text-xs leading-relaxed text-[#7f1d1d]">
                {c.category === 'injured'
                  ? 'Coordinate immediate on-site guardhouse check, veterinary care, or Barangay/animal welfare assistance.'
                  : 'Begin safety coordination now. Routine warnings and observation periods must not delay it.'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <Panel className="sa-fade-up" >
        <Block title="Response actions" description="Choose an action to coordinate response, notify parties, or record progress.">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {actionTiles.map((tile, idx) => (
              <ActionTile key={tile.title} {...tile} delayMs={idx * 35} />
            ))}
          </div>
        </Block>
      </Panel>

      {pending.length > 0 ? (
        <Panel className="sa-fade-up">
          <Block title="Follow-ups" description="What is still to be done on this case.">
            <ul className="m-0 flex list-none flex-col p-0">
              {pending.map((f) => {
                const due = dueInfo(f.dueAt, now);
                return (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-solid py-3 transition-colors first:border-t-0 first:pt-0 last:pb-0" style={{ borderColor: 'var(--sa-line-soft)' }}>
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
        <Panel className="sa-fade-up">
          <Block title="Warning & compliance observations" description="Issued under a confirmed policy. The observation period comes from that policy.">
            <div className="flex flex-col gap-3.5">{warnings.map((w, idx) => <WarningCard key={w.id} w={w} c={c} now={now} openDialog={openDialog} delayMs={idx * 55} />)}</div>
          </Block>
        </Panel>
      ) : null}

    </div>
  );
}
