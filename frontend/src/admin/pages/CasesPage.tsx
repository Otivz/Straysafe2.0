import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight, Clock, FolderOpen, MapPin, PawPrint, SearchX } from 'lucide-react';
import { adminPath } from '../config';
import { LinkButton, Button } from '../components/Button';
import { CaseStatusBadge, ClosureOutcome, PriorityMark } from '../components/Badge';
import { Segmented, Select, SearchInput } from '../components/form';
import { EmptyState, PageHeader, Panel } from '../components/layout';
import { ANIMAL_ICON } from '../components/icons';
import { ANIMAL_TYPES, CATEGORIES, CATEGORY_IDS, PRIORITY_IDS } from '../data/constants';
import { useAdminData } from '../data/context';
import type { Case } from '../data/types';
import { DEFAULT_FILTERS, filterCases, type CaseFilters, type StatusFilter } from '../data/selectors';
import { ago, fmtDate, plural } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useNow } from '../../preview/lib/hooks';
import { cx } from '../../preview/lib/cx';
import { useMediaViewer } from '../components/MediaLightbox';

const PAGE_SIZE = 12;
const STATUS_VALUES: StatusFilter[] = ['all', 'open', 'reported', 'under_review', 'in_progress', 'closed'];
const SORT_LABEL: Record<CaseFilters['sort'], string> = { newest: 'Newest first', oldest: 'Oldest first', updated: 'Recently updated', priority: 'Highest priority' };

/** A single case card displaying animal media, status, location, and key incident metadata. */
function CaseCard({ c, now, onNavigate }: { c: Case; now: Date; onNavigate: (id: string) => void }) {
  const { openMedia } = useMediaViewer();
  const [imgFailed, setImgFailed] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);

  const petPhotos = c.registeredPet?.current?.photos ?? [];
  const availablePhotos = c.evidence
    .filter((e) => (e.kind === 'photo' || e.url) && !e.url?.endsWith('.mp4') && !e.url?.endsWith('.webm'))
    .map((e) => e.url!)
    .concat(petPhotos);
  const photos = Array.from(new Set(availablePhotos));
  const hasPhotos = photos.length > 0 && !imgFailed;
  const currentPhoto = hasPhotos ? photos[((photoIndex % photos.length) + photos.length) % photos.length] : null;

  const AnimalIcon = ANIMAL_ICON[c.animal.type] ?? PawPrint;
  const isUrgent = c.status !== 'closed' && c.priority === 'urgent';
  const isHigh = c.status !== 'closed' && c.priority === 'high';

  return (
    <article
      tabIndex={0}
      role="button"
      aria-label={`Case ${c.id}: ${c.title}`}
      onClick={() => onNavigate(c.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(c.id); } }}
      className={cx(
        'group relative flex flex-col justify-between rounded-xl border border-[var(--sa-line)] bg-[var(--sa-surface)] p-4 sm:p-4.5 transition-all duration-150',
        'hover:border-[var(--sa-brand-tint)] hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--sa-brand-tint)]',
        isUrgent && 'border-l-4 border-l-[var(--sa-red)]',
        isHigh && 'border-l-4 border-l-[var(--sa-amber)]'
      )}
    >
      <div>
        {/* Card Header: Reference ID + Category and Status / Priority */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="sa-ref text-xs font-semibold">{c.id}</span>
            <p className="sa-meta mt-0.5 text-xs truncate">
              {CATEGORIES[c.category].label} · {ANIMAL_TYPES[c.animal.type]}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            <PriorityMark priority={c.priority} />
            <CaseStatusBadge c={c} />
            <ClosureOutcome c={c} />
          </div>
        </div>

        {/* Card Body: Thumbnail / Icon with Previous & Next controls + Title and Description */}
        <div className="flex gap-3.5 my-3">
          {currentPhoto ? (
            <div className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-lg overflow-hidden shrink-0 border border-[var(--sa-line)] bg-[var(--sa-sand)] group/img">
              <img
                src={currentPhoto}
                alt=""
                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200 cursor-zoom-in"
                loading="lazy"
                onError={() => setImgFailed(true)}
                onClick={(e) => {
                  e.stopPropagation();
                  openMedia(
                    photos.map((url, i) => ({ url, title: `${c.title} · Photo ${i + 1}` })),
                    ((photoIndex % photos.length) + photos.length) % photos.length
                  );
                }}
              />

              {photos.length >= 2 && (
                <>
                  {/* Previous < button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoIndex((i) => i - 1);
                    }}
                    className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 hover:bg-black/90 text-white shadow transition-all focus:outline-none"
                    title="Previous image"
                    aria-label="Previous image"
                  >
                    <ChevronLeft size={13} />
                  </button>

                  {/* Next > button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoIndex((i) => i + 1);
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 hover:bg-black/90 text-white shadow transition-all focus:outline-none"
                    title="Next image"
                    aria-label="Next image"
                  >
                    <ChevronRight size={13} />
                  </button>

                  {/* Counter: e.g. 1/3 */}
                  <span
                    className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 text-[9px] font-semibold text-white leading-none shadow-sm"
                    title={`${photos.length} photos`}
                  >
                    {(((photoIndex % photos.length) + photos.length) % photos.length) + 1}/{photos.length}
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-lg shrink-0 flex items-center justify-center bg-[var(--sa-sand)] border border-[var(--sa-line)] text-[var(--sa-ink-3)] group-hover:text-[var(--sa-brand-ink)] group-hover:bg-[var(--sa-brand-soft)] transition-colors" aria-hidden="true">
              <AnimalIcon size={24} strokeWidth={1.7} />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="sa-rowtitle text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-[var(--sa-brand-ink)] transition-colors">
              <Link to={adminPath(`/cases/${c.id}`)} onClick={(e) => e.stopPropagation()}>
                {c.title}
              </Link>
            </h2>
            <p className="sa-small sa-text-2 line-clamp-2 mt-1 text-xs leading-relaxed">
              {c.description || (c.animal.description ? c.animal.description : 'No description provided.')}
            </p>
          </div>
        </div>
      </div>

      {/* Card Footer: Location & Date + View Action */}
      <div className="pt-3 mt-auto border-t border-[var(--sa-line-soft)] flex items-center justify-between gap-2 text-xs">
        <div className="min-w-0 flex flex-col gap-1 text-[var(--sa-ink-2)]">
          <span className="flex items-center gap-1.5 truncate" title={c.location.area}>
            <MapPin size={13} className="shrink-0 text-[var(--sa-ink-3)]" aria-hidden="true" />
            <span className="truncate">{c.location.area || 'Location not named'}</span>
          </span>
          <span className="flex items-center gap-1.5 text-[var(--sa-ink-3)]">
            <Clock size={13} className="shrink-0" aria-hidden="true" />
            <span>{fmtDate(c.reportedAt)}{ago(c.reportedAt, now) ? ` · ${ago(c.reportedAt, now)}` : ''}</span>
          </span>
        </div>

        <div className="shrink-0">
          <LinkButton size="sm" to={adminPath(`/cases/${c.id}`)} aria-label={`View ${c.id}`} onClick={(e) => e.stopPropagation()}>
            View <ArrowRight size={13} aria-hidden="true" />
          </LinkButton>
        </div>
      </div>
    </article>
  );
}

/** A05 — Cases list: the central workspace for incident management in a modern card-grid style. */
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

  const currentTab = filters.status === 'closed' ? 'closed' : filters.status === 'all' ? 'all' : 'active';
  const hasActiveFilters = filters.q !== '' || filters.category !== 'all' || filters.priority !== 'all' || (filters.status !== 'all' && filters.status !== 'open');
  const clear = () => setParams(new URLSearchParams(), { replace: true });

  return (
    <div>
      <PageHeader title="Cases" description="Every animal concern reported in the subdivision. Open a case to assess it, coordinate action, monitor and document the outcome." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Case status"
          value={currentTab}
          onChange={(tab) => {
            if (tab === 'active') update({ status: 'open' });
            else if (tab === 'closed') update({ status: 'closed' });
            else update({ status: 'all' });
          }}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'closed', label: 'Closed' },
            { value: 'all', label: 'All' },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <SearchInput
            className="w-full sm:w-[260px]"
            placeholder="Search cases..."
            aria-label="Search cases"
            value={filters.q}
            onChange={(e) => update({ q: e.target.value })}
          />
          <Select
            className="w-auto min-w-[150px] sa-input--sm"
            aria-label="Category"
            value={filters.category}
            onChange={(e) => update({ category: e.target.value as CaseFilters['category'] })}
          >
            <option value="all">All categories</option>
            {CATEGORY_IDS.map((id) => <option key={id} value={id}>{CATEGORIES[id].label}</option>)}
          </Select>
          <Select
            className="w-auto min-w-[150px] sa-input--sm"
            aria-label="Sort by"
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as CaseFilters['sort'] })}
          >
            {(Object.keys(SORT_LABEL) as CaseFilters['sort'][]).map((k) => (
              <option key={k} value={k}>{SORT_LABEL[k]}</option>
            ))}
          </Select>
          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clear}>Clear</Button>
          ) : null}
        </div>
      </div>

      <Panel className="overflow-hidden">
        {state.cases.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No cases yet">When residents report an animal concern it will appear here for assessment.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No cases match these filters" action={<Button onClick={clear}>Clear filters</Button>}>Try a different search, or remove a filter to see more cases.</EmptyState>
        ) : (
          <>
            <div className="p-4 sm:p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4" role="list" aria-label="Cases grid">
                {rows.map((c) => (
                  <CaseCard key={c.id} c={c} now={now} onNavigate={(id) => navigate(adminPath(`/cases/${id}`))} />
                ))}
              </div>
            </div>
            <div className="sa-pager">
              <span>Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, results.length)} of {plural(results.length, 'case')}</span>
              {pages > 1 ? (
                <span className="flex items-center gap-2">
                  <Button size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</Button>
                  <span className="sa-num">Page {current} of {pages}</span>
                  <Button size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</Button>
                </span>
              ) : null}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
