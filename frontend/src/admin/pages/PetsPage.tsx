import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, MessageSquare, PackageCheck, PawPrint, QrCode, RefreshCw, SearchX, Send, Tag } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Dialog } from '../components/Dialog';
import { adminApi, type ApiQrCollarRequest, type ApiQrCollarRequestsResponse } from '../live/api';
import { adminPath } from '../config';
import { Button, LinkButton } from '../components/Button';
import { Callout, EmptyState, PageHeader, Panel, Tabs } from '../components/layout';
import { PetAvatar } from '../components/PetAvatar';
import { Field, Segmented, SearchInput, Select, Textarea } from '../components/form';
import { useToast } from '../components/toast';
import { ANIMAL_TYPES, SIZE_LABEL } from '../data/constants';
import { useAdminData } from '../data/context';
import { residentById } from '../data/selectors';
import type { AnimalType } from '../data/types';
import { fromServer } from '../../live/dates';
import { errorMessage } from '../../preview/lib/errors';
import { fmtDate, fmtDateTime, plural } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';

type CollarFilter = 'all' | 'pending' | 'accepted' | 'ready_for_pickup' | 'completed';
type PetSort = 'newest' | 'oldest' | 'name';
const PAGE_SIZE = 10;

const STATUS_TONE: Record<ApiQrCollarRequest['status'], 'amber' | 'brand' | 'sage' | 'neutral'> = {
  pending: 'amber',
  accepted: 'brand',
  ready_for_pickup: 'sage',
  completed: 'neutral',
};

/** A16 — Pet registry & QR Collar Requests. */
export default function PetsPage() {
  usePageTitle('Pet Registry');
  const { state } = useAdminData();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const tab = params.get('tab') === 'collar-requests' ? 'collar-requests' : 'registry';

  const [tagged, setTagged] = useState<Set<string>>(() => new Set());
  const [collarData, setCollarData] = useState<ApiQrCollarRequestsResponse | null>(null);
  const [collarLoading, setCollarLoading] = useState(false);
  const [collarFilter, setCollarFilter] = useState<CollarFilter>('all');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pickupTarget, setPickupTarget] = useState<ApiQrCollarRequest | null>(null);
  const [pickupMessage, setPickupMessage] = useState('');

  const loadCollarRequests = useCallback(async () => {
    setCollarLoading(true);
    try {
      const res = await adminApi.qrCollarRequests();
      setCollarData(res);
    } catch {
      // keep silent if endpoint isn't available yet
    } finally {
      setCollarLoading(false);
    }
  }, []);

  useEffect(() => {
    let live = true;
    adminApi.taggedPetIds().then((r) => { if (live) setTagged(new Set(r.pet_ids.map(String))); }, () => undefined);
    adminApi.qrCollarRequests().then((res) => { if (live) setCollarData(res); }, () => undefined);
    return () => { live = false; };
  }, []);

  const q = params.get('q') ?? '';
  const typesPresent = (Object.keys(ANIMAL_TYPES) as AnimalType[]).filter((t) => state.pets.some((p) => p.type === t));
  const requested = params.get('type') as AnimalType | null;
  const type: AnimalType | 'all' = requested && typesPresent.includes(requested) ? requested : 'all';
  const sort: PetSort = params.get('sort') === 'oldest' ? 'oldest' : params.get('sort') === 'name' ? 'name' : 'newest';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) { if (!v || v === 'all' || (k === 'tab' && v === 'registry') || (k === 'sort' && v === 'newest')) next.delete(k); else next.set(k, v); }
    next.delete('page');
    setParams(next, { replace: true });
  };
  const setPage = (p: number) => {
    const next = new URLSearchParams(params);
    if (p <= 1) next.delete('page'); else next.set('page', String(p));
    setParams(next, { replace: true });
  };

  const needle = q.trim().toLowerCase();
  const rows = state.pets
    .filter((p) => type === 'all' || p.type === type)
    .filter((p) => !needle || [p.name, p.breed, p.color, residentById(state, p.ownerId)?.name ?? ''].some((t) => t.toLowerCase().includes(needle)))
    .sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      const timeDiff = Date.parse(a.registeredAt || '') - Date.parse(b.registeredAt || '');
      const idDiff = (Number(a.id) || 0) - (Number(b.id) || 0);
      const diff = Number.isFinite(timeDiff) && timeDiff !== 0 ? timeDiff : idDiff;
      return sort === 'newest' ? -diff : diff;
    });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const pagedRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const clear = () => setParams(new URLSearchParams(), { replace: true });

  const handleAccept = async (req: ApiQrCollarRequest) => {
    setBusyId(req.request_id);
    try {
      const updated = await adminApi.acceptQrCollarRequest(req.request_id);
      setCollarData((prev) => prev ? {
        items: prev.items.map((x) => (x.request_id === updated.request_id ? updated : x)),
        counts: {
          ...prev.counts,
          pending: Math.max(0, prev.counts.pending - 1),
          accepted: prev.counts.accepted + 1,
        },
      } : prev);
      toast.success(`Accepted QR collar request ${updated.reference} for ${updated.pet_name}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const openReadyDialog = (req: ApiQrCollarRequest) => {
    const details = [req.pet_type, req.pet_breed, req.pet_color, req.pet_reference ? `Ref ${req.pet_reference}` : null].filter(Boolean).join(' · ');
    setPickupMessage(
      `Your requested QR collar for ${req.pet_name}${details ? ` (${details})` : ''} is ready for pickup. Please coordinate with the Subdivision Administration regarding its collection.`,
    );
    setPickupTarget(req);
  };

  const handleSendPickupReady = async () => {
    if (!pickupTarget) return;
    setBusyId(pickupTarget.request_id);
    try {
      const updated = await adminApi.readyQrCollarRequest(pickupTarget.request_id, pickupMessage);
      await loadCollarRequests();
      setPickupTarget(null);
      toast.success(`Marked ${updated.reference} ready for pickup and messaged ${updated.resident_name}.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async (req: ApiQrCollarRequest) => {
    setBusyId(req.request_id);
    try {
      await adminApi.completeQrCollarRequest(req.request_id);
      await loadCollarRequests();
      toast.success(`Marked ${req.reference} as picked up.`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const collarItems = (collarData?.items ?? [])
    .filter((r) => collarFilter === 'all' || r.status === collarFilter)
    .filter((r) => !needle || [r.reference, r.pet_name, r.pet_breed ?? '', r.resident_name, r.resident_unit ?? ''].some((t) => t.toLowerCase().includes(needle)));

  const pendingCount = collarData?.counts.pending ?? 0;
  const dogCount = state.pets.filter((p) => p.type === 'dog').length;
  const catCount = state.pets.filter((p) => p.type === 'cat').length;

  return (
    <div>
      <style>{`
        @keyframes saFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .sa-fade-up {
          animation: saFadeUp 280ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
      <PageHeader
        title="Pet Registry"
        description="The pets registered in your subdivision and resident requests for physical QR collars. A registration is declared by whoever entered it and does not verify ownership."
      />

      <Tabs
        idPrefix="pets"
        label="Pet Registry sections"
        value={tab}
        onChange={(nextTab: string) => set({ tab: nextTab })}
        items={[
          { key: 'registry', label: 'Registered Pets', count: state.pets.length },
          { key: 'collar-requests', label: 'QR Collar Requests', count: collarData?.counts.total, alert: pendingCount > 0 },
        ]}
      />

      <div className="pt-4">
        {tab === 'registry' && state.pets.length > 0 ? (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Pet registry summary">
            {[
              { label: 'Total registered', value: state.pets.length, icon: PawPrint, iconClass: 'bg-[#fff7ed] text-[#b45309] border-[#fed7aa]/70', onClick: () => set({ type: 'all' }) },
              { label: 'Dogs', value: dogCount, icon: PawPrint, iconClass: 'bg-[#f5f0e8] text-[#57534e] border-[#e7e2da]', onClick: () => set({ type: 'dog' }) },
              { label: 'Cats', value: catCount, icon: PawPrint, iconClass: 'bg-[#f5f0e8] text-[#57534e] border-[#e7e2da]', onClick: () => set({ type: 'cat' }) },
              { label: 'QR tagged', value: tagged.size, icon: QrCode, iconClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', onClick: undefined },
            ].map((s, idx) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.label}
                  role={s.onClick ? 'button' : undefined}
                  tabIndex={s.onClick ? 0 : undefined}
                  onClick={s.onClick}
                  onKeyDown={s.onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.onClick!(); } } : undefined}
                  style={{ animationDelay: `${idx * 40}ms` }}
                  className={`sa-fade-up rounded-xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] p-3.5 shadow-xs transition-all duration-200 ${
                    s.onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[#d6cfc7] hover:shadow-sm' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="sa-meta m-0">{s.label}</span>
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${s.iconClass}`}>
                      <Icon size={14} aria-hidden="true" />
                    </span>
                  </div>
                  <p className="sa-h3 sa-num m-0 mt-1.5">{s.value}</p>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="sa-fade-up mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e7e2da] bg-[#faf7f2]/85 px-3.5 py-2.5" style={{ animationDelay: '100ms' }}>
          <SearchInput
            className="w-full sm:w-[340px]"
            aria-label={tab === 'registry' ? 'Search the registry' : 'Search QR collar requests'}
            placeholder={tab === 'registry' ? 'Search pet, breed or owner' : 'Search request, pet, or resident'}
            value={q}
            onChange={(e) => set({ q: e.target.value })}
          />
          {tab === 'registry' ? (
            <div className="flex flex-wrap items-center gap-2.5 sm:flex-nowrap">
              {typesPresent.length > 1 || type !== 'all' ? (
                <Segmented label="Animal type" value={type} onChange={(t) => set({ type: t })} options={[{ value: 'all', label: 'All' }, ...typesPresent.map((t) => ({ value: t, label: ANIMAL_TYPES[t] }))]} />
              ) : null}
              <Select
                aria-label="Sort registered pets"
                className="sa-input--sm w-auto shrink-0"
                value={sort}
                onChange={(e) => set({ sort: e.target.value })}
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name (A–Z)</option>
              </Select>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Filter QR collar requests"
                value={collarFilter}
                onChange={setCollarFilter}
                options={[
                  { value: 'all', label: 'All', count: collarData?.counts.total ?? 0 },
                  { value: 'pending', label: 'Pending', count: collarData?.counts.pending ?? 0 },
                  { value: 'accepted', label: 'Accepted', count: collarData?.counts.accepted ?? 0 },
                  { value: 'ready_for_pickup', label: 'Ready', count: collarData?.counts.ready_for_pickup ?? 0 },
                  { value: 'completed', label: 'Picked Up', count: collarData?.counts.completed ?? 0 },
                ]}
              />
              <Button size="sm" variant="ghost" icon={RefreshCw} loading={collarLoading} onClick={() => void loadCollarRequests()}>
                Refresh
              </Button>
            </div>
          )}
        </div>

        {tab === 'registry' ? (
          <>
            <Panel className="sa-fade-up overflow-hidden border-[#e7e2da] shadow-xs [animation-delay:140ms]">
              {state.pets.length === 0 ? (
                <EmptyState icon={PawPrint} title="No pets registered yet">Residents register their pets from their own account, and a registered pet is how they report it missing. Registered pets appear here.</EmptyState>
              ) : rows.length === 0 ? (
                <EmptyState icon={SearchX} title="No pets match" action={<Button onClick={clear}>Clear filters</Button>}>Try another name, or choose a different animal type.</EmptyState>
              ) : (
                <>
                  <div className="sa-tablewrap max-h-[440px] overflow-y-auto [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10">
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
                        {pagedRows.map((p) => {
                          const owner = residentById(state, p.ownerId);
                          return (
                            <tr key={p.id} onClick={() => navigate(adminPath(`/pets/${p.id}`))}>
                              <td>
                                <div className="flex items-center gap-3">
                                  <PetAvatar type={p.type} photoUrl={p.photoUrls?.[0]} />
                                  <div className="min-w-0"><p className="sa-rowtitle"><Link to={adminPath(`/pets/${p.id}`)} onClick={(e) => e.stopPropagation()}>{p.name}</Link></p><p className="sa-meta">{ANIMAL_TYPES[p.type]} · {p.breed}</p>{(p.status === 'Lost' || tagged.has(p.id)) ? <p className="mt-1 flex flex-wrap gap-1.5">{p.status === 'Lost' ? <Badge tone="amber" dot>Lost</Badge> : null}{tagged.has(p.id) ? <Badge icon={QrCode}>QR tag</Badge> : null}</p> : null}</div>
                                </div>
                              </td>
                              <td className="hidden md:table-cell"><p className="sa-small">{p.color}</p><p className="sa-meta">{SIZE_LABEL[p.size]} · {p.ageText}</p></td>
                              <td>{owner ? <><p className="sa-small">{owner.name}</p><p className="sa-meta">{owner.unit} · {p.registeredBy && !p.registeredBy.byOwner ? 'entered by the office' : 'owner-declared'}</p></> : <><p className="sa-small">No resident linked</p><p className="sa-meta">{p.registeredBy ? `Entered by ${p.registeredBy.name}` : 'Not recorded'}</p></>}</td>
                              <td className="hidden whitespace-nowrap lg:table-cell"><span className="sa-small">{fmtDate(p.registeredAt)}</span></td>
                              <td className="sa-right"><LinkButton size="sm" to={adminPath(`/pets/${p.id}`)} aria-label={`View ${p.name}`} onClick={(e) => e.stopPropagation()}>View<ArrowRight size={14} aria-hidden="true" /></LinkButton></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="sa-pager">
                    <span>
                      Showing {(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, rows.length)} of {plural(rows.length, 'pet')}{type !== 'all' || needle ? ' match' : ' registered'}
                    </span>
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
            <Callout className="mt-4 shrink-0">Pets can appear in a case as a <strong>possible match</strong> for a reported animal. That is a comparison aid only: looking alike is not identity, and a registration is not proof of ownership.</Callout>
          </>
        ) : (
          <div className="space-y-4">
            {collarData ? (
              <div className="sa-fade-up grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/55 px-3.5 py-2.5">
                  <div className="sa-eyebrow">Pending</div>
                  <div className="mt-0.5 text-xl font-bold text-amber-700">{collarData.counts.pending}</div>
                </div>
                <div className="rounded-xl border border-[#e7e2da] bg-white px-3.5 py-2.5">
                  <div className="sa-eyebrow">Accepted</div>
                  <div className="mt-0.5 text-xl font-bold text-[#b45309]">{collarData.counts.accepted}</div>
                </div>
                <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/55 px-3.5 py-2.5">
                  <div className="sa-eyebrow">Ready for Pickup</div>
                  <div className="mt-0.5 text-xl font-bold text-emerald-700">{collarData.counts.ready_for_pickup}</div>
                </div>
                <div className="rounded-xl border border-[#e7e2da] bg-[#faf7f2] px-3.5 py-2.5">
                  <div className="sa-eyebrow">Picked Up</div>
                  <div className="mt-0.5 text-xl font-bold text-[#57534e]">{collarData.counts.completed}</div>
                </div>
              </div>
            ) : null}

            <Panel className="p-4">
              {collarItems.length === 0 ? (
                <EmptyState
                  icon={Tag}
                  title={collarData?.counts.total ? 'No matching QR collar requests' : 'No QR collar requests yet'}
                >
                  {collarData?.counts.total
                    ? 'Try clearing your search or status filter.'
                    : 'When residents request a physical QR collar for their registered pet, their requests appear here for acceptance and pickup coordination.'}
                </EmptyState>
              ) : (
                <div className="space-y-3">
                  {collarItems.map((req) => {
                    const petDetails = [req.pet_type, req.pet_breed, req.pet_color, req.pet_size].filter(Boolean).join(' · ');
                    const busy = busyId === req.request_id;
                    return (
                      <div
                        key={req.request_id}
                        className="rounded-xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] p-4 shadow-xs transition-all duration-150 hover:border-[#d6cfc7]"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="flex min-w-0 items-start gap-3">
                            <PetAvatar
                              type={req.pet_type?.toLowerCase() === 'cat' ? 'cat' : 'dog'}
                              photoUrl={req.pet_photo_url ?? undefined}
                            />
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="sa-ref">{req.reference}</span>
                                <Link
                                  to={adminPath(`/pets/${req.pet_id}`)}
                                  className="text-sm font-semibold text-[#1c1917] hover:underline"
                                >
                                  {req.pet_name}
                                </Link>
                                {req.pet_reference ? (
                                  <span className="text-xs text-[#78716c]">({req.pet_reference})</span>
                                ) : null}
                                <Badge tone={STATUS_TONE[req.status]} dot>
                                  {req.status_label}
                                </Badge>
                              </div>
                              <p className="sa-small m-0 text-[#44403c]">
                                Resident: <strong>{req.resident_name}</strong>
                                {req.resident_unit ? ` · ${req.resident_unit}` : ''}
                                {petDetails ? ` · ${petDetails}` : ''}
                              </p>
                              <p className="sa-meta m-0">
                                Requested {fmtDateTime(fromServer(req.requested_at))}
                                {req.accepted_at ? ` · Accepted ${fmtDateTime(fromServer(req.accepted_at))}${req.accepted_by_name ? ` by ${req.accepted_by_name}` : ''}` : ''}
                                {req.ready_at ? ` · Ready ${fmtDateTime(fromServer(req.ready_at))}${req.ready_by_name ? ` by ${req.ready_by_name}` : ''}` : ''}
                              </p>
                              {req.notes ? (
                                <p className="m-0 rounded-lg border border-[#ede7de] bg-[#faf7f2] px-2.5 py-1.5 text-xs text-[#44403c]">
                                  Resident note: {req.notes}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {req.status === 'pending' ? (
                              <Button
                                size="sm"
                                variant="primary"
                                icon={Check}
                                loading={busy}
                                onClick={() => void handleAccept(req)}
                              >
                                Accept Request
                              </Button>
                            ) : null}
                            {req.status === 'accepted' || req.status === 'pending' ? (
                              <Button
                                size="sm"
                                variant={req.status === 'accepted' ? 'primary' : 'secondary'}
                                icon={Send}
                                disabled={busy}
                                onClick={() => openReadyDialog(req)}
                              >
                                Ready for Pickup & Notify
                              </Button>
                            ) : null}
                            {req.status === 'ready_for_pickup' ? (
                              <>
                                {req.thread_id ? (
                                  <LinkButton
                                    size="sm"
                                    variant="secondary"
                                    icon={MessageSquare}
                                    to={adminPath(`/messages/${req.thread_id}`)}
                                  >
                                    Open Conversation
                                  </LinkButton>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  icon={PackageCheck}
                                  loading={busy}
                                  onClick={() => void handleComplete(req)}
                                >
                                  Mark Picked Up
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>

      {pickupTarget ? (
        <Dialog
          size="md"
          title={`Notify Resident — ${pickupTarget.reference}`}
          description={`Mark the QR collar for ${pickupTarget.pet_name} as Ready for Pickup and automatically send this message to ${pickupTarget.resident_name}'s Resident Inbox with an in-app notification.`}
          onClose={() => !busyId && setPickupTarget(null)}
          footer={(
            <div className="flex w-full justify-end gap-2">
              <Button type="button" variant="ghost" disabled={Boolean(busyId)} onClick={() => setPickupTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                icon={Send}
                loading={busyId === pickupTarget.request_id}
                disabled={!pickupMessage.trim()}
                onClick={() => void handleSendPickupReady()}
              >
                Mark Ready & Send Message
              </Button>
            </div>
          )}
        >
          <div className="space-y-3">
            <Field label="Message to Resident" required hint="Sent directly through the messaging system and triggers an in-app notification.">
              <Textarea
                rows={4}
                maxLength={2000}
                value={pickupMessage}
                onChange={(e) => setPickupMessage(e.target.value)}
                disabled={Boolean(busyId)}
              />
            </Field>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
