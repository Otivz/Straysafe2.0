import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, Calendar, Camera, EllipsisVertical, FileText, Layers, MapPin, Megaphone, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
import { adminPath } from '../config';
import { Badge } from '../components/Badge';
import { Button, LinkButton } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { Segmented, Select, SearchInput } from '../components/form';
import { Block, Callout, EmptyState, PageHeader, Panel } from '../components/layout';
import { NOTICE_ICON } from '../components/icons';
import { Menu } from '../components/Menu';
import { useToast } from '../components/toast';
import { NOTICE_STATUS, NOTICE_TYPES } from '../data/constants';
import { useAdminData } from '../data/context';
import type { Notice, NoticeStatus, NoticeType } from '../data/types';
import { ArchiveNoticeDialog } from '../dialogs/NoticeDialogs';
import { fmtDate, plural } from '../../preview/lib/format';
import { usePageTitle } from '../lib/hooks';

type StatusFilter = NoticeStatus | 'all';
const STATUS_ORDER: StatusFilter[] = ['published', 'draft', 'archived', 'all'];

/** A14 — Community notices. Publishing is a separate act from handling a case, and private complaints never appear here. */
export default function CommunityPage() {
  usePageTitle('Community');
  const { state, dispatch } = useAdminData();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [archiving, setArchiving] = useState<Notice | null>(null);
  const [deleting, setDeleting] = useState<Notice | null>(null);

  const q = params.get('q') ?? '';
  const type = (['lost_pet', 'found_animal', 'safety_advisory'].includes(params.get('type') ?? '') ? params.get('type') : 'all') as NoticeType | 'all';
  const status = (STATUS_ORDER.includes(params.get('status') as StatusFilter) ? params.get('status') : 'published') as StatusFilter;
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === '' || (k === 'status' ? v === 'published' : v === 'all')) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const byStatus = (s: StatusFilter) => state.notices.filter((n) => s === 'all' || n.status === s);
  const needle = q.trim().toLowerCase();
  const list = byStatus(status)
    .filter((n) => type === 'all' || n.type === type)
    .filter((n) => !needle || [n.title, n.description, n.location].some((t) => t.toLowerCase().includes(needle)))
    .sort((a, b) => (b.publishedAt ?? b.updatedAt).localeCompare(a.publishedAt ?? a.updatedAt));

  // Open lost-pet / found-animal reports that nobody has published a notice for. Private complaints are never offered.
  const covered = new Set(state.notices.filter((n) => n.status !== 'archived' && n.caseId).map((n) => n.caseId));
  const candidates = state.cases.filter((c) => c.status !== 'closed' && !c.sensitive && (c.category === 'lost_pet' || c.category === 'found_animal') && !covered.has(c.id));
  const filtered = needle !== '' || type !== 'all' || status !== 'published';

  const remove = async (n: Notice) => { await dispatch({ type: 'notice/delete', id: n.id }); toast.success('Draft deleted'); };

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
        title="Community"
        description={`Notices shared with residents of ${state.settings.subdivision.name}. Publishing is separate from handling a case, and private complaints are never published automatically.`}
        actions={<LinkButton variant="primary" icon={Plus} to={adminPath('/community/new')}>Create notice</LinkButton>}
      />

      {state.notices.length > 0 ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Notice summary">
          {[
            { key: 'published' as const, label: 'Published', value: byStatus('published').length, icon: Megaphone, iconClass: 'bg-[#fff7ed] text-[#b45309] border-[#fed7aa]/70' },
            { key: 'draft' as const, label: 'Drafts', value: byStatus('draft').length, icon: FileText, iconClass: 'bg-[#fffbeb] text-[#92400e] border-[#fde68a]' },
            { key: 'archived' as const, label: 'Archived', value: byStatus('archived').length, icon: Archive, iconClass: 'bg-[#f5f0e8] text-[#57534e] border-[#e7e2da]' },
            { key: 'all' as const, label: 'All notices', value: state.notices.length, icon: Layers, iconClass: 'bg-[#f5f0e8] text-[#57534e] border-[#e7e2da]' },
          ].map((item, idx) => {
            const Icon = item.icon;
            const active = status === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => set({ status: item.key })}
                style={{ animationDelay: `${idx * 40}ms` }}
                className={`sa-fade-up cursor-pointer rounded-xl border p-3.5 text-left shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm ${
                  active
                    ? 'border-[var(--sa-brand)]/50 bg-gradient-to-b from-[#fffaf5] to-[#fff7ed]/60'
                    : 'border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] hover:border-[#d6cfc7]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="sa-meta m-0">{item.label}</span>
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg border ${item.iconClass}`}>
                    <Icon size={14} aria-hidden="true" />
                  </span>
                </div>
                <p className="sa-h3 sa-num m-0 mt-1.5">{item.value}</p>
              </button>
            );
          })}
        </div>
      ) : null}

      {candidates.length > 0 ? (
        <section className="sa-fade-up mb-5" aria-labelledby="cand-h" style={{ animationDelay: '90ms' }}>
          <Panel className="border-[#e7e2da] shadow-xs">
            <Block title={<span id="cand-h">Reports without a notice</span>} description="Lost and found reports can be published according to your community policy. Nothing is published until you choose to.">
              <ul className="m-0 flex list-none flex-col p-0">
                {candidates.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-solid py-3 first:border-t-0 first:pt-0 last:pb-0" style={{ borderColor: 'var(--sa-line-soft)' }}>
                    <div className="min-w-0"><p className="flex items-center gap-2"><Link to={adminPath(`/cases/${c.id}`)} className="sa-ref">{c.id}</Link><span className="sa-meta">{c.category === 'lost_pet' ? 'Lost pet' : 'Found animal'}</span></p><p className="mt-0.5 font-medium">{c.title}</p></div>
                    <Button size="sm" icon={Megaphone} onClick={() => navigate(`${adminPath('/community/new')}?fromCase=${c.id}`)}>Create notice</Button>
                  </li>
                ))}
              </ul>
            </Block>
          </Panel>
        </section>
      ) : null}

      <div className="sa-fade-up mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#e7e2da] bg-[#faf7f2]/85 px-3.5 py-2.5" style={{ animationDelay: '120ms' }}>
        <SearchInput className="w-full sm:w-[280px]" aria-label="Search notices" placeholder="Search notices" value={q} onChange={(e) => set({ q: e.target.value })} />
        <Select className="w-auto min-w-[180px] sa-input--sm" aria-label="Notice type" value={type} onChange={(e) => set({ type: e.target.value })}>
          <option value="all">All types</option>
          {(Object.keys(NOTICE_TYPES) as NoticeType[]).map((t) => <option key={t} value={t}>{NOTICE_TYPES[t].plural}</option>)}
        </Select>
        <span className="sm:ml-auto">
          <Segmented label="Status" value={status} onChange={(s) => set({ status: s })} options={STATUS_ORDER.map((s) => ({ value: s, label: s === 'all' ? 'All' : NOTICE_STATUS[s].label + (s === 'draft' ? 's' : '') }))} />
        </span>
      </div>

      <Panel className="sa-fade-up overflow-hidden border-[#e7e2da] shadow-xs" style={{ animationDelay: '150ms' }}>
        {list.length === 0 ? (
          filtered
            ? <EmptyState icon={SearchX} title="No notices match" action={<Button onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button>}>Try another search, or switch the status filter.</EmptyState>
            : <EmptyState icon={Megaphone} title="No published notices" action={<LinkButton variant="primary" to={adminPath('/community/new')}>Create notice</LinkButton>}>Lost pets, found animals and safety advisories you publish will appear here.</EmptyState>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-3.5 sm:p-4">
            {list.map((n, idx) => {
              const Icon = NOTICE_ICON[n.type];
              const thumb = n.media[0]?.url;
              const accent =
                n.status === 'published'
                  ? 'border-l-[3.5px] border-l-[var(--sa-brand)]'
                  : n.status === 'draft'
                    ? 'border-l-[3.5px] border-l-amber-500'
                    : 'border-l-[3.5px] border-l-stone-300';
              return (
                <li
                  key={n.id}
                  style={{ animationDelay: `${idx * 45}ms` }}
                  className={`sa-fade-up flex flex-wrap items-start justify-between gap-3.5 rounded-xl border border-[#e7e2da] ${accent} bg-gradient-to-b from-white to-[#fcfaf6] p-3.5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-[#d6cfc7] hover:shadow-sm`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="h-13 w-13 shrink-0 rounded-xl border border-[#e7e2da] object-cover"
                      />
                    ) : (
                      <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-xl border border-[#fed7aa]/70 bg-[#fff7ed] text-[#b45309]" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={n.type === 'safety_advisory' ? 'amber' : 'brand'}>{NOTICE_TYPES[n.type].label}</Badge>
                        {n.status !== 'published' ? <Badge tone={NOTICE_STATUS[n.status].tone}>{NOTICE_STATUS[n.status].label}</Badge> : null}
                        {n.source === 'resident' ? (
                          <span className="rounded-full border border-[#e7e2da] bg-[#faf7f2] px-2 py-0.5 text-[11px] font-medium text-[#57534e]">
                            Owner-reported
                          </span>
                        ) : null}
                        {n.caseId ? (
                          <Link
                            to={adminPath(`/cases/${n.caseId}`)}
                            className="rounded-md border border-[#e7e2da] bg-white px-2 py-0.5 font-mono text-[11px] font-semibold text-[#57534e] no-underline hover:border-[#d6cfc7] hover:text-[var(--sa-brand)]"
                          >
                            {n.caseId}
                          </Link>
                        ) : null}
                      </div>
                      <p className="m-0 mt-1.5 text-[15px] font-semibold text-[#1c1917] leading-snug">
                        <Link to={adminPath(`/community/${n.id}/edit`)} className="text-inherit no-underline hover:text-[var(--sa-brand)]">
                          {n.title}
                        </Link>
                      </p>
                      {n.description ? (
                        <p className="m-0 mt-1 text-xs leading-relaxed text-[#57534e] line-clamp-2">{n.description}</p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-[#78716c]">
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={12} aria-hidden="true" />
                          <span>{n.location}</span>
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={12} aria-hidden="true" />
                          <span>{n.publishedAt ? `Published ${fmtDate(n.publishedAt)}` : `Edited ${fmtDate(n.updatedAt)}`}</span>
                        </span>
                        {n.media.length ? (
                          <span className="inline-flex items-center gap-1">
                            <Camera size={12} aria-hidden="true" />
                            <span>{plural(n.media.length, 'photo')}</span>
                          </span>
                        ) : null}
                        {n.archivedReason ? <span>· {n.archivedReason}</span> : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <LinkButton size="sm" variant="secondary" icon={Pencil} to={adminPath(`/community/${n.id}/edit`)}>Edit</LinkButton>
                    <Menu
                      width={200}
                      trigger={(p) => <Button size="sm" variant="ghost" className="sa-btn--icon" aria-label={`More actions for ${n.title}`} {...p}><EllipsisVertical size={16} aria-hidden="true" /></Button>}
                      items={[
                        ...(n.status === 'published' ? [{ label: 'Archive notice', icon: Archive, onSelect: () => setArchiving(n) }] : []),
                        ...(n.status === 'draft' ? [{ label: 'Delete draft', icon: Trash2, danger: true, onSelect: () => setDeleting(n) }] : []),
                        ...(n.status === 'archived' ? [{ label: 'View notice', icon: Pencil, to: adminPath(`/community/${n.id}/edit`) }] : []),
                      ]}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Callout className="mt-5">Notices should show only what neighbours need: the animal, a general area and how to contact the office. Never exact addresses, phone numbers, or the name of a person who reported or owns an animal.</Callout>

      {archiving ? <ArchiveNoticeDialog notice={archiving} onClose={() => setArchiving(null)} /> : null}
      {deleting ? <ConfirmDialog title="Delete this draft?" message={<>“{deleting.title}” has not been published. Deleting it cannot be undone.</>} confirmLabel="Delete draft" tone="danger" onClose={() => setDeleting(null)} onConfirm={() => remove(deleting)} /> : null}
    </div>
  );
}
