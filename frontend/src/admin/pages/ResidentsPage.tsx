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

type Filter = Resident['status'] | 'all';
const FILTERS: Filter[] = ['all', 'active', 'pending', 'suspended'];

/** A18 — Residents. General address and contact details for coordination; full details live in the profile. */
export default function ResidentsPage() {
  usePageTitle('Residents');
  const { state } = useAdminData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const status: Filter = FILTERS.includes(params.get('status') as Filter) ? (params.get('status') as Filter) : 'all';
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v || v === 'all') next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };
  const count = (s: Filter) => state.residents.filter((r) => s === 'all' || r.status === s).length;

  const needle = q.trim().toLowerCase();
  const rows = state.residents
    .filter((r) => status === 'all' || r.status === status)
    .filter((r) => !needle || [r.name, r.unit, r.street, r.email].some((t) => t.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const clear = () => setParams(new URLSearchParams(), { replace: true });

  return (
    <div>
      <PageHeader title="Residents" description="People registered in your subdivision. Contact details are visible to administrators only and are meant for coordinating cases." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput className="w-full sm:w-[340px]" aria-label="Search residents" placeholder="Search name, unit or email" value={q} onChange={(e) => set({ q: e.target.value })} />
        <Segmented label="Account status" value={status} onChange={(s) => set({ status: s })} options={FILTERS.map((s) => ({ value: s, label: s === 'all' ? 'All' : RESIDENT_STATUS[s].label, count: count(s) }))} />
      </div>

      <Panel className="overflow-hidden">
        {state.residents.length === 0 ? (
          <EmptyState icon={Users} title="No residents yet">Residents appear here once they register for StraySafe.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No residents match" action={<Button onClick={clear}>Clear filters</Button>}>Try another name or unit, or change the status filter.</EmptyState>
        ) : (
          <>
            <div className="sa-tablewrap">
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
                  {rows.map((r) => (
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
            <div className="sa-pager"><span>{plural(rows.length, 'resident')}</span></div>
          </>
        )}
      </Panel>
    </div>
  );
}
