import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, SearchX, Users } from 'lucide-react';
import { adminPath } from '../config';
import { Badge } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { Segmented, SearchInput } from '../components/form';
import { Avatar, EmptyState, PageHeader, Panel } from '../components/layout';
import { RESIDENT_STATUS } from '../data/constants';
import { useAdminData } from '../data/context';
import type { Resident } from '../data/types';
import { maskPhone, plural } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';
import { ResidentsTabs } from './ResidentsTabs';

type Filter = Resident['status'] | 'all';
const FILTERS: Filter[] = ['all', 'active', 'inactive', 'pending', 'suspended'];
const PAGE_SIZE = 10;

/** A18 — Residents. General address and contact details for coordination; full details live in the profile. */
export default function ResidentsPage() {
  usePageTitle('Residents');
  const { state } = useAdminData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const status: Filter = FILTERS.includes(params.get('status') as Filter) ? (params.get('status') as Filter) : 'all';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v || v === 'all') next.delete(k); else next.set(k, v); }
    next.delete('page');
    setParams(next, { replace: true });
  };
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete('page'); else next.set('page', String(p));
    setParams(next, { replace: true });
  };
  const count = (s: Filter) => state.residents.filter((r) => s === 'all' || r.status === s).length;

  const hasMultipleStatuses = state.residents.some((r) => r.status !== 'active');
  const showStatusFilter = hasMultipleStatuses || status !== 'all';
  const needle = q.trim().toLowerCase();
  const rows = state.residents
    .filter((r) => status === 'all' || r.status === status)
    .filter((r) => !needle || [r.name, r.unit, r.street, r.email].some((t) => t.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pagedRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const clear = () => setParams(new URLSearchParams(), { replace: true });

  return (
    <div className="lg:flex lg:h-[calc(100dvh-112px)] lg:flex-col lg:overflow-hidden">
      <style>{`
        @keyframes saFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sa-fade-up {
          animation: saFadeUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
      <PageHeader title="Residents" description="People registered in your subdivision. Contact details are visible to administrators only and are meant for coordinating cases." />
      <ResidentsTabs />

      {state.residents.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Resident summary">
          {[
            { label: 'Total registered', value: state.residents.length, accent: 'border-[#e7e2da]' },
            { label: 'Active', value: count('active'), accent: 'border-emerald-500/30' },
            { label: 'Inactive / Pending', value: count('inactive') + count('pending'), accent: 'border-[#e7e2da]' },
            { label: 'Suspended', value: count('suspended'), accent: count('suspended') > 0 ? 'border-red-300' : 'border-[#e7e2da]' },
          ].map((s, idx) => (
            <Panel
              key={s.label}
              className={`sa-fade-up p-3.5 ${s.accent} ${['[animation-delay:0ms]', '[animation-delay:40ms]', '[animation-delay:80ms]', '[animation-delay:120ms]'][idx] ?? ''} bg-gradient-to-b from-white to-[#fcfaf6] shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm`}
            >
              <p className="sa-meta m-0">{s.label}</p>
              <p className="sa-h3 sa-num m-0 mt-1">{s.value}</p>
            </Panel>
          ))}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput className="w-full sm:w-[340px]" aria-label="Search residents" placeholder="Search name, unit or email" value={q} onChange={(e) => set({ q: e.target.value })} />
        {showStatusFilter ? (
          <Segmented
            label="Account status"
            value={status}
            onChange={(s) => set({ status: s })}
            options={FILTERS.filter((s) => s === 'all' || count(s) > 0 || s === status).map((s) => ({
              value: s,
              label: s === 'all' ? 'All' : RESIDENT_STATUS[s].label,
            }))}
          />
        ) : null}
      </div>

      <Panel className="sa-fade-up overflow-hidden border-[#e7e2da] shadow-xs [animation-delay:140ms] lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
        {state.residents.length === 0 ? (
          <EmptyState icon={Users} title="No residents yet">Residents appear here once they register for StraySafe.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No residents match" action={<Button onClick={clear}>Clear filters</Button>}>Try another name or unit, or change the status filter.</EmptyState>
        ) : (
          <>
            <div className="sa-tablewrap lg:min-h-0 lg:flex-1 lg:overflow-y-auto [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10">
              <table className="sa-table sa-table--rows">
                <caption className="sa-sr-only">Residents, {plural(rows.length, 'result')}</caption>
                <thead>
                  <tr>
                    <th scope="col">Resident</th>
                    <th scope="col" className="hidden md:table-cell">Address</th>
                    <th scope="col">Account</th>
                    <th scope="col" className="hidden lg:table-cell">Contact</th>
                    <th scope="col" className="hidden xl:table-cell">Pets</th>
                    <th scope="col"><span className="sa-sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((r) => (
                    <tr key={r.id} onClick={() => navigate(adminPath(`/residents/${r.id}`))}>
                      <td><div className="flex items-center gap-3"><Avatar name={r.name} /><p className="sa-rowtitle"><Link to={adminPath(`/residents/${r.id}`)} onClick={(e) => e.stopPropagation()}>{r.name}</Link></p></div></td>
                      <td className="hidden md:table-cell"><p className="sa-small">{r.unit}</p><p className="sa-meta">{r.street}</p></td>
                      <td><Badge tone={RESIDENT_STATUS[r.status].tone} dot>{RESIDENT_STATUS[r.status].label}</Badge></td>
                      <td className="hidden lg:table-cell"><p className="sa-small">{r.email}</p><p className="sa-meta sa-num">{maskPhone(r.phone)}</p></td>
                      <td className="hidden xl:table-cell"><span className="sa-small sa-num">{r.petIds.length}</span></td>
                      <td className="sa-right"><LinkButton size="sm" to={adminPath(`/residents/${r.id}`)} aria-label={`View profile of ${r.name}`} onClick={(e) => e.stopPropagation()}>View profile<ArrowRight size={14} aria-hidden="true" /></LinkButton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sa-pager">
              <span>Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, rows.length)} of {plural(rows.length, 'resident')}</span>
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
