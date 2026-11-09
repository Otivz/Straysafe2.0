import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, EllipsisVertical, Megaphone, Pencil, Plus, SearchX, Trash2 } from 'lucide-react';
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
    for (const [k, v] of Object.entries(patch)) { if (v === '' || v === 'all' || (k === 'status' && v === 'published')) next.delete(k); else next.set(k, v); }
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
      <PageHeader
        title="Community"
        description={`Notices shared with residents of ${state.settings.subdivision.name}. Publishing is separate from handling a case, and private complaints are never published automatically.`}
        actions={<LinkButton variant="primary" icon={Plus} to={adminPath('/community/new')}>Create notice</LinkButton>}
      />

      {candidates.length > 0 ? (
        <section className="mb-6" aria-labelledby="cand-h">
          <Panel>
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput className="w-full sm:w-[300px]" aria-label="Search notices" placeholder="Search notices" value={q} onChange={(e) => set({ q: e.target.value })} />
        <Select className="w-auto min-w-[190px] sa-input--sm" aria-label="Notice type" value={type} onChange={(e) => set({ type: e.target.value })}>
          <option value="all">All types</option>
          {(Object.keys(NOTICE_TYPES) as NoticeType[]).map((t) => <option key={t} value={t}>{NOTICE_TYPES[t].plural}</option>)}
        </Select>
        <span className="sm:ml-auto">
          <Segmented label="Status" value={status} onChange={(s) => set({ status: s })} options={STATUS_ORDER.map((s) => ({ value: s, label: s === 'all' ? 'All' : NOTICE_STATUS[s].label + (s === 'draft' ? 's' : ''), count: byStatus(s).length }))} />
        </span>
      </div>

      <Panel className="overflow-hidden">
        {list.length === 0 ? (
          filtered
            ? <EmptyState icon={SearchX} title="No notices match" action={<Button onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear filters</Button>}>Try another search, or switch the status filter.</EmptyState>
            : <EmptyState icon={Megaphone} title="No published notices" action={<LinkButton variant="primary" to={adminPath('/community/new')}>Create notice</LinkButton>}>Lost pets, found animals and safety advisories you publish will appear here.</EmptyState>
        ) : (
          <ul className="m-0 list-none p-0">
            {list.map((n) => {
              const Icon = NOTICE_ICON[n.type];
              return (
                <li key={n.id} className="sa-notice-row">
                  <span className="sa-tl__icon" aria-hidden="true"><Icon size={14} /></span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="sa-meta" style={{ fontWeight: 600 }}>{NOTICE_TYPES[n.type].label}</span>
                      {n.status !== 'published' ? <Badge tone={NOTICE_STATUS[n.status].tone}>{NOTICE_STATUS[n.status].label}</Badge> : null}
                      {n.source === 'resident' ? <span className="sa-meta">Owner-reported</span> : null}
                    </p>
                    <p className="sa-rowtitle mt-0.5"><Link to={adminPath(`/community/${n.id}/edit`)}>{n.title}</Link></p>
                    <p className="sa-small sa-text-2 sa-clamp-2 mt-1">{n.description}</p>
                    <p className="sa-meta mt-1.5">
                      {n.location}
                      {n.publishedAt ? ` · published ${fmtDate(n.publishedAt)}` : ` · edited ${fmtDate(n.updatedAt)}`}
                      {n.caseId ? <> · <Link to={adminPath(`/cases/${n.caseId}`)} className="sa-ref">{n.caseId}</Link></> : null}
                      {n.media.length ? ` · ${plural(n.media.length, 'photo')}` : ''}
                      {n.archivedReason ? ` · ${n.archivedReason}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <LinkButton size="sm" icon={Pencil} to={adminPath(`/community/${n.id}/edit`)}>Edit</LinkButton>
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
