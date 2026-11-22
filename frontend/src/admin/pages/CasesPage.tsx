import { lazy, Suspense, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, FilePlus2, UserRound, ChevronLeft, ChevronRight, CircleCheck, Clock, FolderOpen, Layers, LayoutGrid, Map as MapIcon, MapPin, PawPrint, Play, SearchX } from 'lucide-react';
import { adminPath } from '../config';
import { LinkButton, Button } from '../components/Button';
import { CaseStatusBadge, ClosureOutcome, PriorityMark } from '../components/Badge';
import { Select, SearchInput } from '../components/form';
import { EmptyState } from '../components/layout';
import { ANIMAL_ICON } from '../components/icons';
import { ANIMAL_TYPES, CATEGORIES, CATEGORY_IDS, PRIORITY_IDS } from '../data/constants';
import { useAdminData } from '../data/context';
import type { Case } from '../data/types';
import { DEFAULT_FILTERS, filterCases, type CaseFilters, type StatusFilter } from '../data/selectors';
import { ago, fmtDate, plural } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useNow } from '../../preview/lib/hooks';
import { useMediaViewer } from '../components/MediaLightbox';
import { reportedByText } from '../live/adapters';

const CasesMap = lazy(() => import('../components/CasesMap'));

const PAGE_SIZE = 12;
const STATUS_VALUES: StatusFilter[] = ['all', 'open', 'reported', 'under_review', 'in_progress', 'closed'];
const SORT_LABEL: Record<CaseFilters['sort'], string> = { newest: 'Newest first', oldest: 'Oldest first', updated: 'Recently updated', priority: 'Highest priority' };

/** A single case card displaying animal media, status, location, and key incident metadata. */
function CaseCard({ c, now, onNavigate }: { c: Case; now: Date; onNavigate: (id: string) => void }) {
  const { openMedia } = useMediaViewer();
  const [imgFailed, setImgFailed] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const petPhotos = (c.registeredPet?.current?.photos ?? []).map((u) => ({ url: u, kind: 'photo' as const }));
  const evidenceMedia = c.evidence
    .filter((e): e is typeof e & { url: string } => Boolean(e.url))
    .map((e) => {
      const isVid = e.kind === 'video' || e.url.endsWith('.mp4') || e.url.endsWith('.webm') || e.url.includes('/video/upload/');
      return { url: e.url, kind: isVid ? ('video' as const) : ('photo' as const) };
    });
  const allMedia = [...evidenceMedia, ...petPhotos];
  const mediaList = allMedia.filter((m, i, arr) => arr.findIndex((x) => x.url === m.url) === i);
  const index = mediaList.length > 0 ? ((photoIndex % mediaList.length) + mediaList.length) % mediaList.length : 0;
  const currentMedia = mediaList.length > 0 && !imgFailed ? mediaList[index] : null;

  const AnimalIcon = ANIMAL_ICON[c.animal.type] ?? PawPrint;
  const open = c.status !== 'closed';
  const tone = open && c.priority === 'urgent' ? 'red' : open && c.priority === 'high' ? 'amber' : undefined;
  const view = (e: React.MouseEvent) => {
    e.stopPropagation();
    openMedia(mediaList.map((m, i) => ({ url: m.url, kind: m.kind, title: `${c.title} · ${m.kind === 'video' ? 'Video' : 'Photo'} ${i + 1}` })), index);
  };
  const ago_ = ago(c.reportedAt, now);

  return (
    <article
      tabIndex={0}
      role="button"
      aria-label={`Case ${c.id}: ${c.title}`}
      className="sa-kcard"
      data-tone={tone}
      onClick={() => onNavigate(c.id)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onNavigate(c.id); } }}
    >
      {/* Reference, category and animal; priority on the right */}
      <div className="sa-kcard__top">
        <div className="sa-kcard__ref">
          <span className="sa-id">{c.id}</span>
          <span>{CATEGORIES[c.category].label} · {ANIMAL_TYPES[c.animal.type]}</span>
        </div>
        <PriorityMark priority={c.priority} />
      </div>

      {/* Photo or video (with previous / next), title and description */}
      <div className="sa-kcard__body">
        <div className="sa-kcard__media">
          {currentMedia ? (
            currentMedia.kind === 'video' ? (
              <>
                <video src={currentMedia.url} preload="metadata" />
                <button type="button" className="sa-kcard__play" onClick={view} aria-label="Play video"><span><Play size={13} fill="currentColor" aria-hidden="true" /></span></button>
              </>
            ) : (
              <img src={currentMedia.url} alt="" loading="lazy" onError={() => setImgFailed(true)} onClick={view} />
            )
          ) : (
            <span className="sa-kcard__noimg" aria-hidden="true"><AnimalIcon size={26} strokeWidth={1.7} /></span>
          )}
          {currentMedia && mediaList.length >= 2 ? (
            <>
              <button type="button" className="sa-kcard__nav" data-side="prev" aria-label="Previous image" title="Previous image"
                onClick={(e) => { e.stopPropagation(); setPhotoIndex((i) => i - 1); }}><ChevronLeft size={14} aria-hidden="true" /></button>
              <button type="button" className="sa-kcard__nav" data-side="next" aria-label="Next image" title="Next image"
                onClick={(e) => { e.stopPropagation(); setPhotoIndex((i) => i + 1); }}><ChevronRight size={14} aria-hidden="true" /></button>
              <span className="sa-kcard__count" title={`${mediaList.length} media`}>{index + 1}/{mediaList.length}</span>
            </>
          ) : null}
        </div>
        <div className="min-w-0">
          <h2 className="sa-kcard__title">
            <Link to={adminPath(`/cases/${c.id}`)} onClick={(e) => e.stopPropagation()}>{c.title}</Link>
          </h2>
          <p className="sa-kcard__desc">{c.description || c.animal.description || 'No description provided.'}</p>
        </div>
      </div>

      {/* Where the case stands */}
      <div className="sa-kcard__status">
        <CaseStatusBadge c={c} />
        <ClosureOutcome c={c} />
      </div>

      {/* Where and when; open the case */}
      <div className="sa-kcard__foot">
        <div className="sa-kcard__facts">
          <span title={c.location.area}><MapPin size={13} aria-hidden="true" /><span>{c.location.area || 'Location not named'}</span></span>
          <span><Clock size={13} aria-hidden="true" /><span>{fmtDate(c.reportedAt)}{ago_ ? ` · ${ago_}` : ''}</span></span>
          <span title={reportedByText(c.reporter)}><UserRound size={13} aria-hidden="true" /><span>{reportedByText(c.reporter)}</span></span>
        </div>
        <LinkButton size="sm" to={adminPath(`/cases/${c.id}`)} aria-label={`View ${c.id}`} onClick={(e) => e.stopPropagation()}>
          View <ArrowRight size={13} aria-hidden="true" />
        </LinkButton>
      </div>
    </article>
  );
}

/** A05 — Cases list: the central workspace for incident management in a card grid. */
export default function CasesPage() {
  usePageTitle('Cases');
  const { state } = useAdminData();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const now = useNow();

  const read = <K extends keyof CaseFilters>(key: K, allowed?: readonly string[]): CaseFilters[K] => {
    const v = params.get(key);
    return (v && (!allowed || allowed.includes(v)) ? v : DEFAULT_FILTERS[key]) as CaseFilters[K];
  };
  const filters: CaseFilters = {
    q: params.get('q') ?? '',
    status: read('status', STATUS_VALUES),
    category: read('category', CATEGORY_IDS),
    priority: read('priority', PRIORITY_IDS),
    sort: read('sort', Object.keys(SORT_LABEL)),
  };
  const page = Math.max(1, Number(params.get('page')) || 1);

  const update = (patch: Partial<CaseFilters>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || v === DEFAULT_FILTERS[k as keyof CaseFilters]) next.delete(k); else next.set(k, String(v));
    }
    next.delete('page');
    setParams(next, { replace: true });
  };
  const setPage = (p: number) => { const next = new URLSearchParams(params); if (p <= 1) next.delete('page'); else next.set('page', String(p)); setParams(next, { replace: true }); };

  const results = filterCases(state.cases, filters);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const [view, setView] = useState<'list' | 'map'>(() => (params.get('view') === 'map' ? 'map' : 'list'));
  const currentTab = filters.status === 'closed' ? 'closed' : filters.status === 'all' ? 'all' : 'active';
  const hasActiveFilters = filters.q !== '' || filters.category !== 'all' || filters.priority !== 'all' || (filters.status !== 'all' && filters.status !== 'open');
  const clear = () => setParams(new URLSearchParams(), { replace: true });

  const totalCount = state.cases.length;
  const activeCount = state.cases.filter((c) => c.status !== 'closed').length;
  const urgentCount = state.cases.filter((c) => c.status !== 'closed' && c.priority === 'urgent').length;
  const closedCount = state.cases.filter((c) => c.status === 'closed').length;

  const stats = [
    { label: 'Total cases', value: totalCount, hint: 'Everything reported', icon: Layers, tone: 'neutral', alert: false,
      pressed: filters.status === 'all' && filters.priority === 'all', onClick: () => update({ status: 'all', priority: 'all' }) },
    { label: 'Active', value: activeCount, hint: 'Being handled now', icon: FolderOpen, tone: 'brand', alert: false,
      pressed: filters.status === 'open' && filters.priority === 'all', onClick: () => update({ status: 'open', priority: 'all' }) },
    { label: 'Urgent open', value: urgentCount, hint: urgentCount > 0 ? 'Needs immediate action' : 'No urgent cases', icon: AlertTriangle,
      tone: urgentCount > 0 ? 'red' : 'neutral', alert: urgentCount > 0, pressed: filters.priority === 'urgent', onClick: () => update({ status: 'open', priority: 'urgent' }) },
    { label: 'Closed', value: closedCount, hint: 'Resolved or ended', icon: CircleCheck, tone: 'neutral', alert: false,
      pressed: filters.status === 'closed' && filters.priority === 'all', onClick: () => update({ status: 'closed', priority: 'all' }) },
  ] as const;

  const tabs = [
    { value: 'active', label: 'Active', count: activeCount },
    { value: 'closed', label: 'Closed', count: closedCount },
    { value: 'all', label: 'All', count: totalCount },
  ] as const;

  return (
    <div className="sa-dash">
      <style>{`
        @keyframes saFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sa-fade-up {
          animation: saFadeUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
      <header className="sa-fade-up flex flex-col gap-3 border-b border-[#e7e2da] pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="sa-dash-head__eyebrow"><span>{state.settings.subdivision.name}</span><span>{plural(activeCount, 'active case')}</span></p>
          <h1 className="sa-dash-head__title">Cases</h1>
          <p className="sa-dash-head__line">Every animal concern reported in the subdivision. Open a case to assess it, coordinate action, monitor and document the outcome.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LinkButton size="sm" variant="primary" to={adminPath('/cases/new')}><FilePlus2 size={14} aria-hidden="true" />File a report</LinkButton>
        </div>
      </header>

      {totalCount > 0 ? (
        <ul className="sa-kpis sa-fade-up [animation-delay:50ms]" aria-label="Case summary">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <li key={s.label}>
                <button type="button" className="sa-kpi transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm" data-alert={s.alert} aria-pressed={s.pressed} onClick={s.onClick}>
                  <span className="sa-kpi__top">
                    <span className="sa-kpi__label">{s.label}</span>
                    <span className="sa-kpi__icon" data-tone={s.tone}><Icon size={16} aria-hidden="true" /></span>
                  </span>
                  <span className="sa-kpi__value">{s.value}</span>
                  <span className="sa-kpi__hint">{s.hint}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="sa-fade-up flex flex-col gap-4 [animation-delay:100ms]">
        <div className="rounded-xl border border-[#e7e2da] bg-[#faf7f2]/85 p-3 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="sa-ctabs" role="group" aria-label="Case status">
              {tabs.map((t) => (
                <button key={t.value} type="button" className="sa-ctab" aria-pressed={currentTab === t.value}
                  onClick={() => update({ status: t.value === 'active' ? 'open' : t.value })}>
                  {t.label}<span className="sa-ctab__count">{t.count}</span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {hasActiveFilters ? <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button> : null}
              <div className="inline-flex rounded-lg border border-[#e7e2da] bg-white p-0.5 shadow-2xs" role="group" aria-label="View mode">
                <button
                  type="button"
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                    view === 'list' ? 'bg-[var(--sa-brand)] text-white shadow-2xs' : 'text-[var(--sa-ink-2)] hover:text-[var(--sa-ink)]'
                  }`}
                >
                  <LayoutGrid size={13} aria-hidden="true" />
                  <span>List</span>
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'map'}
                  onClick={() => setView('map')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-medium transition-colors ${
                    view === 'map' ? 'bg-[var(--sa-brand)] text-white shadow-2xs' : 'text-[var(--sa-ink-2)] hover:text-[var(--sa-ink)]'
                  }`}
                >
                  <MapIcon size={13} aria-hidden="true" />
                  <span>Map</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2.5 border-t border-[#e7e2da]/80 pt-2.5">
            <SearchInput className="w-full sm:w-[280px] lg:flex-1 lg:max-w-[360px]" placeholder="Search by ID, title or place" aria-label="Search cases" value={filters.q}
              onChange={(e) => update({ q: e.target.value })} />
            <div className="flex flex-wrap items-center gap-2.5 sm:ml-auto">
              <label className="sa-ctoolbar__select">
                <span>Category</span>
                <Select className="sa-input--sm w-auto" value={filters.category} onChange={(e) => update({ category: e.target.value as CaseFilters['category'] })}>
                  <option value="all">All categories</option>
                  {CATEGORY_IDS.map((id) => <option key={id} value={id}>{CATEGORIES[id].label}</option>)}
                </Select>
              </label>
              <label className="sa-ctoolbar__select">
                <span>Sort</span>
                <Select className="sa-input--sm w-auto" value={filters.sort} onChange={(e) => update({ sort: e.target.value as CaseFilters['sort'] })}>
                  {(Object.keys(SORT_LABEL) as CaseFilters['sort'][]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
                </Select>
              </label>
            </div>
          </div>
        </div>

        {state.cases.length === 0 ? (
          <div className="sa-cempty"><EmptyState icon={FolderOpen} title="No cases yet">When residents report an animal concern it will appear here for assessment.</EmptyState></div>
        ) : rows.length === 0 ? (
          <div className="sa-cempty"><EmptyState icon={SearchX} title="No cases match these filters" action={<Button onClick={clear}>Clear filters</Button>}>Try a different search, or remove a filter to see more cases.</EmptyState></div>
        ) : view === 'map' ? (
          <Suspense fallback={<div className="pv-map pv-map--loading" style={{ height: 460 }} role="status" aria-label="Loading map" />}>
            <CasesMap cases={results} onSelect={(id) => navigate(adminPath(`/cases/${id}`))} />
          </Suspense>
        ) : (
          <>
            <p className="sa-ctoolbar__result" aria-live="polite">
              <span>Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, results.length)} of {plural(results.length, 'case')}</span>
              {filters.priority !== 'all' ? <span>Priority: {filters.priority}</span> : null}
            </p>
            <ul className="sa-cgrid" aria-label="Cases">
              {rows.map((c) => (
                <li key={c.id}><CaseCard c={c} now={now} onNavigate={(id) => navigate(adminPath(`/cases/${id}`))} /></li>
              ))}
            </ul>
            {pages > 1 ? (
              <nav className="sa-cpager" aria-label="Pages">
                <span>Page {current} of {pages}</span>
                <span className="flex items-center gap-2">
                  <Button size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</Button>
                  <Button size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</Button>
                </span>
              </nav>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
