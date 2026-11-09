import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, PawPrint, SearchX } from 'lucide-react';
import { adminPath } from '../config';
import { Button, LinkButton } from '../components/Button';
import { Callout, EmptyState, PageHeader, Panel } from '../components/layout';
import { PetAvatar } from '../components/PetAvatar';
import { Segmented, SearchInput } from '../components/form';
import { ANIMAL_TYPES, SIZE_LABEL } from '../data/constants';
import { useAdminData } from '../data/context';
import { residentById } from '../data/selectors';
import type { AnimalType } from '../data/types';
import { fmtDate, plural } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';

/** A16 — Pet registry. A voluntary, owner-declared reference list. Registration is never proof of ownership. */
export default function PetsPage() {
  usePageTitle('Pet Registry');
  const { state } = useAdminData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const q = params.get('q') ?? '';
  const typesPresent = (Object.keys(ANIMAL_TYPES) as AnimalType[]).filter((t) => state.pets.some((p) => p.type === t));
  const requested = params.get('type') as AnimalType | null;
  const type: AnimalType | 'all' = requested && typesPresent.includes(requested) ? requested : 'all';
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v || v === 'all') next.delete(k); else next.set(k, v); }
    setParams(next, { replace: true });
  };

  const needle = q.trim().toLowerCase();
  const rows = state.pets
    .filter((p) => type === 'all' || p.type === type)
    .filter((p) => !needle || [p.name, p.breed, p.color, residentById(state, p.ownerId)?.name ?? ''].some((t) => t.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const clear = () => setParams(new URLSearchParams(), { replace: true });

  return (
    <div>
      <PageHeader title="Pet Registry" description="Pets that residents registered voluntarily. A registration is a convenient reference declared by the owner. It does not verify ownership." />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SearchInput className="w-full sm:w-[340px]" aria-label="Search the registry" placeholder="Search pet, breed or owner" value={q} onChange={(e) => set({ q: e.target.value })} />
        <Segmented label="Animal type" value={type} onChange={(t) => set({ type: t })} options={[{ value: 'all', label: 'All', count: state.pets.length }, ...typesPresent.map((t) => ({ value: t, label: ANIMAL_TYPES[t], count: state.pets.filter((p) => p.type === t).length }))]} />
      </div>

      <Panel className="overflow-hidden">
        {state.pets.length === 0 ? (
          <EmptyState icon={PawPrint} title="No pets registered yet">Residents can register their pets from their own account. Registered pets will appear here as a reference list.</EmptyState>
        ) : rows.length === 0 ? (
          <EmptyState icon={SearchX} title="No pets match" action={<Button onClick={clear}>Clear filters</Button>}>Try another name, or choose a different animal type.</EmptyState>
        ) : (
          <>
            <div className="sa-tablewrap">
              <table className="sa-table sa-table--rows">
                <caption className="sa-sr-only">Registered pets, {plural(rows.length, 'result')}</caption>
                <thead>
                  <tr>
                    <th scope="col">Pet</th>
                    <th scope="col" className="hidden md:table-cell">Details</th>
                    <th scope="col">Registered owner</th>
                    <th scope="col" className="hidden lg:table-cell">Registered</th>
                    <th scope="col"><span className="sa-sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const owner = residentById(state, p.ownerId);
                    return (
                      <tr key={p.id} onClick={() => navigate(adminPath(`/pets/${p.id}`))}>
                        <td>
                          <div className="flex items-center gap-3">
                            <PetAvatar type={p.type} />
                            <div className="min-w-0"><p className="sa-rowtitle"><Link to={adminPath(`/pets/${p.id}`)} onClick={(e) => e.stopPropagation()}>{p.name}</Link></p><p className="sa-meta">{ANIMAL_TYPES[p.type]} · {p.breed}</p></div>
                          </div>
                        </td>
                        <td className="hidden md:table-cell"><p className="sa-small">{p.color}</p><p className="sa-meta">{SIZE_LABEL[p.size]} · {p.ageText}</p></td>
                        <td>{owner ? <><p className="sa-small">{owner.name}</p><p className="sa-meta">{owner.unit} · owner-declared</p></> : <span className="sa-meta">Not recorded</span>}</td>
                        <td className="hidden whitespace-nowrap lg:table-cell"><span className="sa-small">{fmtDate(p.registeredAt)}</span></td>
                        <td className="sa-right"><LinkButton size="sm" to={adminPath(`/pets/${p.id}`)} aria-label={`View ${p.name}`} onClick={(e) => e.stopPropagation()}>View<ArrowRight size={14} aria-hidden="true" /></LinkButton></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sa-pager"><span>{plural(rows.length, 'pet')}{type !== 'all' || needle ? ' match' : ' registered'}</span></div>
          </>
        )}
      </Panel>
      <Callout className="mt-5">Pets can appear in a case as a <strong>possible match</strong> for a reported animal. That is a comparison aid only: looking alike is not identity, and a registration is not proof of ownership.</Callout>
    </div>
  );
}
