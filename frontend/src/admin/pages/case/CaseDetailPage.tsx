import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, EllipsisVertical, FileQuestion, Flag, Lock, Megaphone, NotebookPen, RefreshCw, RotateCcw } from 'lucide-react';
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
import { usePageTitle } from '../../lib/hooks';
import { useNow } from '../../../preview/lib/hooks';
import { useSubmit } from '../../lib/useSubmit';
import ActionsTab from './ActionsTab';
import AssessmentTab from './AssessmentTab';
import { CaseDialogs } from './CaseDialogs';
import type { CaseDialog } from './dialogState';
import HistoryTab from './HistoryTab';
import MonitoredCasePage from './MonitoredCasePage';
import ComplaintPage from '../complaints/ComplaintPage';
import OverviewTab from './OverviewTab';

type TabKey = 'overview' | 'assessment' | 'actions' | 'history';
const TAB_KEYS: TabKey[] = ['overview', 'assessment', 'actions', 'history'];

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
  const c = caseById(state, caseId);
  usePageTitle(c ? `${c.id} · ${c.title}` : 'Case not found');

  // The list holds a short row per case; the full record (assessment, referrals, follow-ups, photos, history) is read when the case
  // is opened.
  const load = useRef(loadCase);
  useEffect(() => { load.current = loadCase; });
  useEffect(() => { if (caseId) void load.current(caseId); }, [caseId]);
  const detail = detailStatus(caseId ?? '');

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

  const requested = params.get('tab') as TabKey | null;
  const tab: TabKey = requested && TAB_KEYS.includes(requested) ? requested : 'overview';
  const setTab = (key: TabKey) => { const next = new URLSearchParams(params); if (key === 'overview') next.delete('tab'); else next.set('tab', key); setParams(next, { replace: true }); };
  const open = (d: CaseDialog) => setDialog(d);

  const items = openItems(c);
  const overdue = items.followUps.some((f) => dueInfo(f.dueAt, now).overdue);
  const actionCount = items.followUps.length + items.warnings.length + items.referrals.length;
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

      <Tabs
        idPrefix="case"
        label="Case workspace"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'overview', label: 'Overview' },
          { key: 'assessment', label: 'Assessment' },
          { key: 'actions', label: 'Actions & follow-ups', count: full ? actionCount : undefined, alert: full && overdue },
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
                {tab === 'history' ? <HistoryTab c={c} now={now} /> : null}
              </>
            )}
      </div>

      <CaseDialogs c={c} dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
