import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, EllipsisVertical, FileQuestion, Flag, Link2, Lock, Megaphone, NotebookPen, RefreshCw, RotateCcw, Share2 } from 'lucide-react';
import { adminPath } from '../../config';
import { CaseStatusBadge, OutcomeBadge, PriorityMark } from '../../components/Badge';
import { Button, LinkButton } from '../../components/Button';
import { CATEGORY_ICON } from '../../components/icons';
import { Callout, EmptyState, ErrorState, PageSkeleton, Panel, Tabs } from '../../components/layout';
import { Menu } from '../../components/Menu';
import { useToast } from '../../components/toast';
import { CATEGORIES } from '../../data/constants';
import { useAdminData } from '../../data/context';
import { allowedStatusMoves, caseById, isLostOrFound, openItems } from '../../data/selectors';
import { ago, dueInfo, fmtDate } from '../../../preview/lib/format';
import { reportIdOf } from '../../../live/refs';
import { adminApi } from '../../live/api';
import type { RelatedCandidate } from '../../dialogs/DuplicateReviewDialog';
import { usePageTitle } from '../../lib/hooks';
import { useNow } from '../../../preview/lib/hooks';
import { useSubmit } from '../../lib/useSubmit';
import { CaseReferralsSection } from '../../dialogs/CoordinationDialogs';
import ActionsTab from './ActionsTab';
import AssessmentTab from './AssessmentTab';
import { CaseDialogs } from './CaseDialogs';
import type { CaseDialog } from './dialogState';
import HistoryTab from './HistoryTab';
import MonitoredCasePage from './MonitoredCasePage';
import ComplaintPage from '../complaints/ComplaintPage';
import OverviewTab from './OverviewTab';

type TabKey = 'overview' | 'assessment' | 'actions' | 'referrals' | 'history';
const TAB_KEYS: TabKey[] = ['overview', 'assessment', 'actions', 'referrals', 'history'];

function detectUrgentTriggers(c: { category: string; animal: { condition?: string | null }; description: string }): string[] {
  const text = `${c.animal.condition ?? ''}\n${c.description ?? ''}`;
  const triggers: string[] = [];
  if (/chasing|attack/i.test(text)) triggers.push('Chasing / attacking people');
  if (/\bbite\b|\bbit\b|bleeding/i.test(text)) triggers.push('Bite or bleeding reported');
  if (/rabies/i.test(text)) triggers.push('Suspected rabies signs');
  if (/unable to move|immobile|trapped/i.test(text)) triggers.push('Animal immobile / trapped');
  if (/currently aggressive:\s*yes/i.test(text)) triggers.push('Currently aggressive');
  if (triggers.length === 0 && c.category === 'injured') triggers.push('Urgent injury / condition');
  if (triggers.length === 0 && c.category === 'safety') triggers.push('Immediate safety risk');
  return triggers;
}

function buildUrgentDispatchSummary(
  c: { id: string; title: string; location: { area: string; detail: string }; animal: { description: string } },
  triggers: string[],
): string {
  const where = [c.location.area, c.location.detail].filter((s) => s && s !== 'Location not named').join(', ') || 'Subdivision area';
  const triggerText = triggers.length > 0 ? ` Triggers: ${triggers.join(', ')}.` : '';
  return `URGENT response requested for ${c.id} (${c.title}) at ${where}.${c.animal.description ? ` Animal: ${c.animal.description}.` : ''}${triggerText}`;
}

/**
 * A06 Case details: the primary case-management workspace. A missing pet and a found animal have their own, simpler page (MonitoredCasePage): they are
 * monitored from the start, with no assessment, status or priority to manage. Every other kind of case keeps this workspace.
 */
export default function CaseDetailPage() {
  const { caseId } = useParams();
  const { state, dispatch, loadCase, detailStatus } = useAdminData();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const now = useNow();
  const { pending, run } = useSubmit();
  const [dialog, setDialog] = useState<CaseDialog | null>(null);
  const [dupState, setDupState] = useState<{ rid: number; candidates: RelatedCandidate[] } | null>(null);
  const c = caseById(state, caseId);
  usePageTitle(c ? `${c.id} · ${c.title}` : 'Case not found');

  // The list holds a short row per case; the full record (assessment, referrals, follow-ups, photos, history) is read when the case
  // is opened.
  const load = useRef(loadCase);
  useEffect(() => { load.current = loadCase; });
  useEffect(() => { if (caseId) void load.current(caseId); }, [caseId]);
  const detail = detailStatus(caseId ?? '');

  const activeDupRid =
    c && !isLostOrFound(c) && c.category !== 'nuisance' && c.status !== 'closed' && !c.duplicateOfReportId
      ? reportIdOf(c.id)
      : null;
  useEffect(() => {
    if (!activeDupRid) return;
    let cancelled = false;
    adminApi
      .duplicates(activeDupRid)
      .then((res) => {
        if (!cancelled) setDupState({ rid: activeDupRid, candidates: res.candidates ?? [] });
      })
      .catch(() => {
        if (!cancelled) setDupState({ rid: activeDupRid, candidates: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [activeDupRid]);
  const dupCandidates = activeDupRid && dupState?.rid === activeDupRid ? dupState.candidates : [];

  if (!c) {
    if (detail.status === 'idle' || detail.status === 'loading') return <PageSkeleton />;
    if (detail.status === 'error') return <ErrorState message={detail.error} onRetry={() => { void loadCase(caseId ?? ''); }} />;
    return (
      <Panel>
        <EmptyState icon={FileQuestion} title="We can’t find that case" action={<LinkButton variant="primary" to={adminPath('/cases')}>Back to cases</LinkButton>}>
          It may have been removed, or the reference is mistyped.
        </EmptyState>
      </Panel>
    );
  }
  if (isLostOrFound(c)) return <MonitoredCasePage c={c} detail={detail} />;
  // An animal complaint has its own calm page: findings, the person's history under the rule, and what the rule asks (pages/complaints)
  if (c.category === 'nuisance') return detail.status === 'ready' ? <ComplaintPage c={c} /> : <PageSkeleton />;
  const full = detail.status === 'ready';

  const rawRequested = params.get('tab');
  const requested = (rawRequested === 'warnings' ? 'actions' : rawRequested) as TabKey | null;
  const tab: TabKey = requested && TAB_KEYS.includes(requested) ? requested : 'overview';
  const setTab = (key: TabKey) => { const next = new URLSearchParams(params); if (key === 'overview') next.delete('tab'); else next.set('tab', key); setParams(next, { replace: true }); };
  const open = (d: CaseDialog) => setDialog(d);

  const items = openItems(c);
  const overdueFollowUps = items.followUps.some((f) => dueInfo(f.dueAt, now).overdue);
  const overdueReferrals = items.referrals.some((r) => Boolean(r.followUpAt && dueInfo(r.followUpAt, now).overdue));
  const actionCount = items.followUps.length + items.warnings.length;
  const CategoryIcon = CATEGORY_ICON[c.category];
  const publishable = !c.sensitive && c.category === 'safety';
  const moves = allowedStatusMoves(c);

  const move = (to: 'under_review' | 'in_progress', done: string) => { void run(async () => { await dispatch({ type: 'case/changeStatus', id: c.id, to }); toast.success(done); }); };

  // One primary action, chosen by where the case is in the workflow
  const primary = c.status === 'reported' ? <Button variant="primary" loading={pending} onClick={() => move('under_review', 'Review started')}>Start review</Button>
    : c.status === 'under_review' ? (c.assessment.savedAt ? <Button variant="primary" loading={pending} onClick={() => move('in_progress', 'Marked as in progress')}>Mark in progress<ArrowRight size={15} aria-hidden="true" /></Button> : <Button variant="primary" onClick={() => setTab('assessment')}>Record assessment</Button>)
      : c.status === 'in_progress' ? <Button variant="primary" onClick={() => open({ kind: 'close' })}>Close case</Button>
        : <Button variant="primary" icon={RotateCcw} onClick={() => open({ kind: 'reopen' })}>Reopen case</Button>;

  return (
    <div>
      <Link className="sa-back" to={adminPath('/cases')}>← Cases</Link>
      <header className="sa-casehead">
        <div className="sa-casehead__top">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="sa-ref" style={{ fontSize: 13.5 }}>{c.id}</span>
              <span className="sa-meta flex items-center gap-1.5"><CategoryIcon size={14} aria-hidden="true" />{CATEGORIES[c.category].label}</span>
              {c.sensitive ? <span className="sa-meta flex items-center gap-1.5"><Lock size={13} aria-hidden="true" />Private complaint</span> : null}
            </p>
            <h1 className="sa-casehead__title">{c.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {primary}
            <Menu
              width={250}
              trigger={(p) => <Button variant="secondary" className="sa-btn--icon" aria-label="More case actions" {...p}><EllipsisVertical size={17} aria-hidden="true" /></Button>}
              items={[
                { label: 'Create Referral', icon: RefreshCw, disabled: c.status === 'closed', onSelect: () => open({ kind: 'referral' }) },
                { label: 'Change status', icon: RefreshCw, disabled: moves.length === 0, onSelect: () => open({ kind: 'status' }) },
                { label: 'Change priority', icon: Flag, disabled: c.status === 'closed', onSelect: () => open({ kind: 'priority' }) },
                { label: 'Add internal note', icon: NotebookPen, onSelect: () => open({ kind: 'note' }) },
                ...(publishable && c.status !== 'closed' ? [{ kind: 'separator' as const }, { label: 'Create community notice', icon: Megaphone, onSelect: () => navigate(`${adminPath('/community/new')}?fromCase=${c.id}`) }] : []),
              ]}
            />
          </div>
        </div>
        <div className="sa-casehead__meta">
          <CaseStatusBadge c={c} large />
          {c.closure ? <OutcomeBadge group={c.closure.outcome} large /> : null}
          <PriorityMark priority={c.priority} />
          <span className="sa-meta">Reported {fmtDate(c.reportedAt)}{ago(c.reportedAt, now) ? ` · ${ago(c.reportedAt, now)}` : ''}</span>
          <span className="sa-meta">Assigned to {c.assignedTo}</span>
        </div>
      </header>

      {c.priority === 'urgent' && c.status !== 'closed' ? (() => {
        const triggers = detectUrgentTriggers(c);
        const urgentSummary = buildUrgentDispatchSummary(c, triggers);
        const agencies = state.settings.externalCoordination.agencies;
        const primaryAgency = agencies.find((a) => a.type === 'barangay') ?? agencies[0];
        const hasReferral = full && c.referrals.length > 0;
        return (
          <div className="mb-4 rounded-xl border border-[#ef4444]/30 bg-gradient-to-r from-[#fef2f2] to-[#fff5f5] p-3.5 shadow-xs">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <span className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#fee2e2] text-[#b91c1c]">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#ef4444]/35" />
                  <AlertTriangle size={15} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="m-0 text-sm font-semibold text-[#991b1b]">
                      {c.category === 'injured' ? 'Urgent injured / sick animal response' : 'Urgent safety concern'}
                    </p>
                    {hasReferral ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        <CheckCircle2 size={11} aria-hidden="true" />
                        Referral active ({c.referrals.length})
                      </span>
                    ) : null}
                  </div>
                  <p className="m-0 mt-0.5 text-xs leading-relaxed text-[#7f1d1d]">
                    {c.category === 'injured'
                      ? 'Coordinate immediate on-site guardhouse check, veterinary care, or Barangay/animal welfare assistance.'
                      : 'Begin safety coordination now. You do not need to identify the animal or confirm ownership first, and routine warnings or observation periods must not delay it.'}
                  </p>
                  {triggers.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {triggers.map((t) => (
                        <span
                          key={t}
                          className="inline-flex items-center rounded-md border border-[#ef4444]/25 bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-[#991b1b]"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              {full ? (
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="primary"
                    icon={Share2}
                    onClick={() =>
                      open({
                        kind: 'referral',
                        agencyId: primaryAgency?.id ?? 'manual',
                        initialReason: urgentSummary,
                      })
                    }
                  >
                    {primaryAgency ? `Refer to ${primaryAgency.name}` : 'Refer to Barangay'}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        );
      })() : null}

      {dupCandidates.length > 0 && c.status !== 'closed' && !c.duplicateOfReportId ? (() => {
        const top = dupCandidates[0];
        const topPct = top && typeof top.overall_score === 'number' ? Math.round(top.overall_score * 100) : null;
        return (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d97706]/35 bg-gradient-to-r from-[#fffbeb] to-[#fef3c7]/45 px-3.5 py-2.5 shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#fef3c7] text-[#b45309]">
                <Link2 size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="m-0 text-xs font-semibold text-[#92400e]">
                  {dupCandidates.length} similar {dupCandidates.length === 1 ? 'report' : 'reports'} detected
                  {top?.reference ? ` · Top match ${top.reference}${topPct !== null ? ` (${topPct}%)` : ''}` : ''}
                </p>
                <p className="m-0 text-[11px] text-[#78350f]">
                  Review and link or merge potential duplicates to avoid duplicate staff work.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              icon={Link2}
              onClick={() => {
                if (tab !== 'overview') setTab('overview');
                window.setTimeout(() => {
                  document.getElementById('related-reports')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 60);
              }}
            >
              Review &amp; Link
            </Button>
          </div>
        );
      })() : null}

      <Tabs
        idPrefix="case"
        label="Case workspace"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'assessment', label: 'Assessment' },
          { key: 'actions', label: 'Actions & follow-ups', count: full ? actionCount : undefined, alert: full && overdueFollowUps },
          { key: 'referrals', label: 'Referrals', count: full ? c.referrals.length : undefined, alert: full && overdueReferrals },
          { key: 'history', label: 'History', count: full ? c.timeline.length : undefined },
        ]}
      />

      <div role="tabpanel" id="case-panel" aria-labelledby={`case-tab-${tab}`} className="pt-6">
        {detail.status === 'error' ? <ErrorState message={detail.error} onRetry={() => { void loadCase(c.id); }} />
          : !full ? <PageSkeleton />
            : (
              <>
                {detail.error ? <Callout tone="amber" className="mb-4">{detail.error}</Callout> : null}
                {tab === 'overview' ? <OverviewTab c={c} now={now} openDialog={open} /> : null}
                {tab === 'assessment' ? <AssessmentTab c={c} openDialog={open} /> : null}
                {tab === 'actions' ? <ActionsTab c={c} now={now} openDialog={open} /> : null}
                {tab === 'referrals' ? <CaseReferralsSection c={c} openDialog={open} /> : null}
                {tab === 'history' ? <HistoryTab c={c} now={now} /> : null}
              </>
            )}
      </div>

      <CaseDialogs c={c} dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
