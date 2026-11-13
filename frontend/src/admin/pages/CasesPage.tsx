import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, FolderOpen, SearchX } from 'lucide-react';
import { adminPath } from '../config';
import { LinkButton, Button } from '../components/Button';
import { CaseStatusBadge, ClosureOutcome, PriorityMark } from '../components/Badge';
import { Segmented, Select, SearchInput } from '../components/form';
import { EmptyState, PageHeader, Panel } from '../components/layout';
import { ANIMAL_TYPES, CATEGORIES, CATEGORY_IDS, PRIORITIES, PRIORITY_IDS } from '../data/constants';
import { useAdminData } from '../data/context';
import { DEFAULT_FILTERS, filterCases, statusCounts, type CaseFilters, type StatusFilter } from '../data/selectors';
import { ago, fmtDate, plural } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { useNow } from '../../preview/lib/hooks';

const PAGE_SIZE = 12;
const STATUS_VALUES: StatusFilter[] = ['all', 'open', 'reported', 'under_review', 'in_progress', 'closed'];
const SORT_LABEL: Record<CaseFilters['sort'], string> = { newest: 'Newest first', oldest: 'Oldest first', updated: 'Recently updated', priority: 'Highest priority' };

/** A05 — Cases list: the central workspace for incident management. */
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

  const counts = statusCounts(state.cases);
  const results = filterCases(state.cases, filters);
  const pages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = results.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const filtered = filters.q !== '' || filters.status !== 'all' || filters.category !== 'all' || filters.priority !== 'all';
  const clear = () => setParams(new URLSearchParams(), { replace: true });

  return (
    <div>
      <PageHeader title="Cases" description="Every animal concern reported in the subdivision. Open a case to assess it, coordinate action, monitor and document the outcome." />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput className="w-full sm:w-[340px]" placeholder="Search reference, concern, location" aria-label="Search cases" value={filters.q} onChange={(e) => update({ q: e.target.value })} />
          <Select className="w-auto min-w-[200px] sa-input--sm" aria-label="Category" value={filters.category} onChange={(e) => update({ category: e.target.value as CaseFilters['category'] })}>
            <option value="all">All categories</option>
            {CATEGORY_IDS.map((id) => <option key={id} value={id}>{CATEGORIES[id].label}</option>)}
          </Select>
          <Select className="w-auto min-w-[150px] sa-input--sm" aria-label="Priority" value={filters.priority} onChange={(e) => update({ priority: e.target.value as CaseFilters['priority'] })}>
            <option value="all">All priorities</option>
            {PRIORITY_IDS.map((id) => <option key={id} value={id}>{PRIORITIES[id].label}</option>)}
          </Select>
          <Select className="w-auto min-w-[170px] sa-input--sm sm:ml-auto" aria-label="Sort by" value={filters.sort} onChange={(e) => update({ sort: e.target.value as CaseFilters['sort'] })}>
            {(Object.keys(SORT_LABEL) as CaseFilters['sort'][]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
          </Select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            label="Status"
            value={filters.status}
            onChange={(status) => update({ status })}
            options={[
              { value: 'all', label: 'All', count: counts.all },
              { value: 'open', label: 'Open', count: counts.open },
              { value: 'reported', label: 'Reported', count: counts.reported },
              { value: 'under_review', label: 'Under review', count: counts.under_review },
              { value: 'in_progress', label: 'In progress', count: counts.in_progress },
              { value: 'closed', label: 'Closed', count: counts.closed },
            ]}
          />
          {filtered ? <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button> : null}
        </div>
      </div>

      <Panel className="overflow-hidden">
        {state.cases.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No cases yet">When residents report an animal concern it will appear here for assessment.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No cases match these filters" action={<Button onClick={clear}>Clear filters</Button>}>Try a different search, or remove a filter to see more cases.</EmptyState>
        ) : (
          <>
            <div className="sa-tablewrap">
              <table className="sa-table sa-table--rows">
                <caption className="sa-sr-only">Cases, {plural(results.length, 'result')}</caption>
                <thead>
                  <tr>
                    <th scope="col">Reference</th>
                    <th scope="col">Concern</th>
                    <th scope="col" className="hidden xl:table-cell">Location</th>
                    <th scope="col">Reported</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col"><span className="sa-sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={c.id} data-flag={c.status !== 'closed' && (c.priority === 'urgent' || c.priority === 'high') ? c.priority : undefined} onClick={() => navigate(adminPath(`/cases/${c.id}`))}>
                      <td className="whitespace-nowrap"><span className="sa-ref">{c.id}</span></td>
                      <td className="min-w-[260px] max-w-[420px]">
                        <p className="sa-rowtitle sa-clamp-2"><Link to={adminPath(`/cases/${c.id}`)} onClick={(e) => e.stopPropagation()}>{c.title}</Link></p>
                        <p className="sa-meta mt-0.5">{CATEGORIES[c.category].label} · {ANIMAL_TYPES[c.animal.type]}</p>
                      </td>
                      <td className="hidden max-w-[220px] xl:table-cell"><span className="sa-small sa-text-2 sa-clamp-2">{c.location.area}</span></td>
                      <td className="whitespace-nowrap"><p className="sa-small">{fmtDate(c.reportedAt)}</p>{ago(c.reportedAt, now) ? <p className="sa-meta">{ago(c.reportedAt, now)}</p> : null}</td>
                      <td><PriorityMark priority={c.priority} /></td>
                      <td><div className="flex flex-col items-start gap-1"><CaseStatusBadge c={c} /><ClosureOutcome c={c} /></div></td>
                      <td className="sa-right"><LinkButton size="sm" to={adminPath(`/cases/${c.id}`)} aria-label={`View ${c.id}`} onClick={(e) => e.stopPropagation()}>View<ArrowRight size={14} aria-hidden="true" /></LinkButton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
