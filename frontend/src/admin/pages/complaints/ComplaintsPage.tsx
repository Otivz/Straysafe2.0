import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardCheck,
  Copy,
  FileText,
  Landmark,
  LayoutGrid,
  Megaphone,
  Scale,
  Settings,
  ShieldCheck,
  Table as TableIcon,
  User,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { adminPath } from '../../config';
import { Button, LinkButton } from '../../components/Button';
import { Segmented } from '../../components/form';
import { ErrorState, PageHeader, PageSkeleton, Panel } from '../../components/layout';
import { useAdminData } from '../../data/context';
import type { Case } from '../../data/types';
import { usePageTitle } from '../../lib/hooks';
import { useNow } from '../../../preview/lib/hooks';
import { errorMessage } from '../../../preview/lib/errors';
import { reportIdOf } from '../../../live/refs';
import { complaintsApi, type ApiWorkspace, type ApiWorkspaceItem } from '../../complaints/api';
import { fmt, lc, needsOf, ord, stepBadge, type NeedIcon, type NeedInput } from '../../complaints/model';
import { useMediaViewer } from '../../components/MediaLightbox';
import { cx } from '../../../preview/lib/cx';

const ICON: Record<NeedIcon, LucideIcon> = {
  copy: Copy, clipboard: ClipboardCheck, userCheck: UserCheck, shield: ShieldCheck, ok: CircleCheck, letter_1: FileText, letter_2: FileText,
  summons: CalendarDays, fine: Banknote, meeting: Landmark,
};

const inputOf = (x: ApiWorkspaceItem): NeedInput => ({
  closed: x.closed, maybeSame: x.maybe_same, incident: x.incident, hasRule: !!x.rule, noRule: x.no_rule, respondentName: x.respondent?.name ?? null,
  checking: x.checking, offense: x.offense, suggestion: x.suggestion, ruleTitle: x.rule?.title ?? null, hasSuspect: !!x.suspect, steps: x.steps,
});

/** Single complaint card displaying photo evidence, offense tier, rule violated, person responsible, and next action. */
function ComplaintCard({
  item,
  c,
  refId,
  now,
  onNavigate,
}: {
  item: ApiWorkspaceItem;
  c?: Case;
  refId: string;
  now: Date;
  onNavigate: (ref: string) => void;
}) {
  const { openMedia } = useMediaViewer();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [imgFailed, setImgFailed] = useState(false);

  const availablePhotos = (c?.evidence ?? [])
    .filter((e) => (e.kind === 'photo' || e.url) && !e.url?.endsWith('.mp4') && !e.url?.endsWith('.webm'))
    .map((e) => e.url!);
  const photos = Array.from(new Set(availablePhotos));
  const hasPhotos = photos.length > 0 && !imgFailed;
  const currentPhoto = hasPhotos ? photos[((photoIndex % photos.length) + photos.length) % photos.length] : null;

  const need = needsOf(inputOf(item), now, () => refId)[0];
  const wait = item.steps.map((s) => ({ s, b: stepBadge(s.kind, s.state) })).find((y) => y.b.wait);

  const offenseChip = item.closed ? (
    <span className="sa-mc__chip text-xs" data-tone="muted">Closed</span>
  ) : item.same_as ? (
    <span className="sa-mc__chip text-xs" data-tone="muted">Same occurrence</span>
  ) : item.offense?.counted && item.offense.number ? (
    <span className="sa-mc__chip text-xs">{ord(item.offense.number)} offense</span>
  ) : item.suggestion ? (
    <span className="sa-mc__chip text-xs" data-tone="amber">To confirm · {ord(item.suggestion)}</span>
  ) : item.incident === 'verified' ? (
    <span className="sa-mc__chip text-xs">Verified</span>
  ) : item.checking ? (
    <span className="sa-mc__chip text-xs" data-tone="amber">Being checked</span>
  ) : (
    <span className="sa-mc__chip text-xs" data-tone="muted">Pending review</span>
  );

  return (
    <article
      tabIndex={0}
      role="button"
      aria-label={`Complaint ${refId}: ${c?.title ?? 'Animal complaint'}`}
      onClick={() => onNavigate(refId)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onNavigate(refId);
        }
      }}
      className={cx(
        'group relative flex flex-col justify-between rounded-xl border border-[var(--sa-line)] bg-[var(--sa-surface)] p-4 sm:p-4.5 transition-all duration-150',
        'hover:border-[var(--sa-brand-tint)] hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--sa-brand-tint)]',
        need && 'border-l-4 border-l-[var(--sa-amber)]'
      )}
    >
      <div>
        {/* Header: Ref & Time + Badges */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="sa-ref text-xs font-semibold">{refId}</span>
            <p className="sa-meta mt-0.5 text-xs truncate">Seen {fmt(item.incident_at)}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
            {need && (
              <span className="sa-cm-needs-badge text-[11px] font-semibold flex items-center gap-1">
                <Bell size={11} aria-hidden="true" /> Needs you
              </span>
            )}
            {offenseChip}
          </div>
        </div>

        {/* Body: Thumbnail & Details */}
        <div className="flex gap-3.5 my-3">
          {currentPhoto ? (
            <div className="relative w-20 h-20 sm:w-22 sm:h-22 rounded-lg overflow-hidden shrink-0 border border-[var(--sa-line)] bg-[var(--sa-sand)] group/img">
              <img
                src={currentPhoto}
                alt=""
                className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200 cursor-zoom-in"
                loading="lazy"
                onError={() => setImgFailed(true)}
                onClick={(e) => {
                  e.stopPropagation();
                  openMedia(
                    photos.map((url, i) => ({ url, title: `${c?.title ?? 'Complaint'} · Photo ${i + 1}` })),
                    ((photoIndex % photos.length) + photos.length) % photos.length
                  );
                }}
              />

              {photos.length >= 2 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoIndex((i) => i - 1);
                    }}
                    className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 hover:bg-black/90 text-white shadow transition-all focus:outline-none"
                    title="Previous photo"
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoIndex((i) => i + 1);
                    }}
                    className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/65 hover:bg-black/90 text-white shadow transition-all focus:outline-none"
                    title="Next photo"
                    aria-label="Next photo"
                  >
                    <ChevronRight size={13} />
                  </button>
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
            <div className="w-20 h-20 sm:w-22 sm:h-22 rounded-lg shrink-0 flex items-center justify-center bg-[var(--sa-sand)] border border-[var(--sa-line)] text-[var(--sa-ink-3)] group-hover:text-[var(--sa-brand-ink)] group-hover:bg-[var(--sa-brand-soft)] transition-colors" aria-hidden="true">
              <Megaphone size={24} strokeWidth={1.7} />
            </div>
          )}

          <div className="min-w-0 flex-1 flex flex-col justify-between">
            <div>
              <h3 className="sa-rowtitle text-[15px] font-semibold leading-snug line-clamp-2 group-hover:text-[var(--sa-brand-ink)] transition-colors">
                <Link to={adminPath(`/cases/${refId}`)} onClick={(e) => e.stopPropagation()}>
                  {c?.title ?? 'Animal complaint'}
                </Link>
              </h3>
              <p className="mt-1 text-xs text-[var(--sa-ink-2)] line-clamp-1 flex items-center gap-1.5" title={item.rule?.title ?? undefined}>
                <Scale size={12} className="shrink-0 text-[var(--sa-ink-3)]" />
                <span className="truncate">{item.rule?.title ?? (item.no_rule ? 'No rule applies' : 'Rule unassigned')}</span>
              </p>
            </div>

            <div className="mt-2 text-xs">
              {item.respondent ? (
                <div className="flex items-center gap-1.5 truncate" title={`Confirmed: ${item.respondent.name}`}>
                  <UserCheck size={13} className="shrink-0 text-[var(--sa-brand-ink)]" />
                  <span className="font-semibold text-[var(--sa-ink)] truncate">{item.respondent.name}</span>
                  <span className="text-[10px] text-[var(--sa-brand-ink)] bg-[var(--sa-brand-soft)] px-1 py-0.2 rounded font-medium shrink-0">Confirmed</span>
                </div>
              ) : item.same_as ? (
                <span className="text-xs text-[var(--sa-ink-3)] truncate">Same occurrence as {refId}</span>
              ) : item.suspect ? (
                <div className="flex items-center gap-1.5 text-[var(--sa-ink-2)] truncate" title={`Suggested: ${[item.suspect.name, item.suspect.address].filter(Boolean).join(' · ')}`}>
                  <User size={13} className="shrink-0 text-[var(--sa-ink-3)]" />
                  <span className="truncate">{[item.suspect.name, item.suspect.address].filter(Boolean).join(' · ') || 'Suggested suspect'}</span>
                  <span className="text-[10px] text-amber-700 bg-amber-50 dark:bg-amber-950/40 px-1 py-0.2 rounded shrink-0">Unverified</span>
                </div>
              ) : (
                <span className="text-xs text-[var(--sa-ink-3)] italic">Responsible party not identified</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer: Where it stands / Next step */}
      <div className="pt-2.5 mt-auto border-t border-[var(--sa-line-soft)] flex items-center justify-between gap-2 text-xs">
        <div className="min-w-0 flex items-center gap-1.5 text-[var(--sa-ink-2)] truncate">
          {item.closed ? (
            <span className="flex items-center gap-1 text-[var(--sa-ink-3)]">
              <CircleCheck size={13} className="shrink-0" /> Closed
            </span>
          ) : need ? (
            <span className="flex items-center gap-1 text-amber-800 font-medium truncate" title={need.detail}>
              <Bell size={13} className="shrink-0 text-amber-700" />
              <span className="truncate">{need.title}</span>
            </span>
          ) : wait ? (
            <span className="truncate text-[var(--sa-ink-2)]" title={`${wait.s.kind}: ${wait.b.text}`}>
              Waiting: {lc(wait.s.kind === 'meeting' ? 'Meeting at the Barangay' : wait.s.kind === 'fine' ? 'Fine' : wait.s.kind === 'summons' ? 'Summons' : 'Letter')} · {lc(wait.b.text)}
            </span>
          ) : (
            <span className="text-[var(--sa-ink-3)]">In progress</span>
          )}
        </div>
        <span className="shrink-0 font-medium text-[var(--sa-brand-ink)] group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 text-xs">
          Review <ArrowRight size={12} />
        </span>
      </div>
    </article>
  );
}

/**
 * The Complaints workspace (docs/01-system/COMPLAINT_MANAGEMENT.md): what needs the Leader across every animal complaint, the complaints
 * themselves (each one an ordinary case), and the people confirmed as responsible with their history per rule.
 */
export default function ComplaintsPage() {
  usePageTitle('Complaints');
  const { state } = useAdminData();
  const navigate = useNavigate();
  const now = useNow();
  const [w, setW] = useState<ApiWorkspace | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [seg, setSeg] = useState<'open' | 'all' | 'people'>('open');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  useEffect(() => {
    let live = true;
    complaintsApi.workspace().then((x) => { if (live) { setW(x); setFailed(null); } }, (e: unknown) => { if (live) setFailed(errorMessage(e)); });
    return () => { live = false; };
  }, [tries, state.cases.length]);

  if (failed && !w) return <ErrorState message={failed} onRetry={() => setTries((n) => n + 1)} />;
  if (!w) return <PageSkeleton />;

  const caseOf = (rid: number) => state.cases.find((x) => reportIdOf(x.id) === rid);
  const refOf = (rid: number) => caseOf(rid)?.id ?? `#${rid}`;
  const open = w.items.filter((x) => !x.closed);
  const needs = open.flatMap((x) => { const n = needsOf(inputOf(x), now, refOf)[0]; return n ? [{ ...n, item: x }] : []; });
  const order: Record<string, number> = { same: 0, offense: 1, resp: 2, verify: 3, step: 2.5, close: 4 };
  needs.sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3));
  const rows = (seg === 'open' ? open : w.items).slice().sort((a, b) => (caseOf(b.report_id)?.reportedAt ?? '').localeCompare(caseOf(a.report_id)?.reportedAt ?? ''));

  return (
    <div>
      <PageHeader
        title="Complaints"
        description="Animal complaints: what happened, who is responsible, and what the subdivision’s rules ask next. Each complaint is one of your cases; nothing is copied."
        actions={<LinkButton to={adminPath('/settings')} icon={Settings}>Complaint rules</LinkButton>}
      />
      <div className="mt-5 flex flex-col gap-5">
        {needs.length ? (
          <section className="sa-mc-lane" data-active aria-label="Needs you">
            <h2 className="sa-mc-lane__head"><Bell size={15} aria-hidden="true" />Needs you</h2>
            <ul className="sa-mc-needs">
              {needs.map((n, i) => {
                const Icon = ICON[n.icon];
                return (
                  <li key={n.item.report_id} className="sa-mc-need">
                    <span className="sa-mc-need__icon" aria-hidden="true"><Icon size={20} strokeWidth={1.8} /></span>
                    <div className="min-w-0">
                      <p className="sa-mc-need__title">
                        <Link className="sa-ref" style={{ fontSize: 13 }} to={adminPath(`/cases/${refOf(n.item.report_id)}`)}>
                          {refOf(n.item.report_id)}
                        </Link>{' '}
                        · {n.title}
                      </p>
                      <p className="sa-mc-need__detail">{n.detail}</p>
                    </div>
                    <Button
                      variant={i === 0 ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => navigate(adminPath(`/cases/${refOf(n.item.report_id)}`))}
                      aria-label={`Review ${refOf(n.item.report_id)}`}
                    >
                      Review
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : (
          <section className="sa-mc-lane" aria-label="Situation">
            <div className="sa-mc-lane__calm">
              <p className="sa-mc-calm" role="status">
                <CircleCheck size={18} aria-hidden="true" />Nothing needs you right now
              </p>
              <p className="sa-mc-lane__line">{open.length} active complaint{open.length === 1 ? '' : 's'}.</p>
            </div>
          </section>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Segmented
              label="Show"
              value={seg}
              onChange={setSeg}
              options={[
                { value: 'open', label: 'Active' },
                { value: 'all', label: 'All complaints' },
                { value: 'people', label: 'People responsible' },
              ]}
            />
            {seg !== 'people' && (
              <div className="flex items-center gap-1 bg-[var(--sa-surface)] border border-[var(--sa-line)] rounded-lg p-0.5" role="group" aria-label="View format">
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={cx(
                    'px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors cursor-pointer',
                    viewMode === 'cards' ? 'bg-[var(--sa-brand)] text-white shadow-xs' : 'text-[var(--sa-ink-2)] hover:text-[var(--sa-ink)]'
                  )}
                  aria-pressed={viewMode === 'cards'}
                >
                  <LayoutGrid size={13} aria-hidden="true" /> Cards
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={cx(
                    'px-2.5 py-1 text-xs font-medium rounded flex items-center gap-1.5 transition-colors cursor-pointer',
                    viewMode === 'table' ? 'bg-[var(--sa-brand)] text-white shadow-xs' : 'text-[var(--sa-ink-2)] hover:text-[var(--sa-ink)]'
                  )}
                  aria-pressed={viewMode === 'table'}
                >
                  <TableIcon size={13} aria-hidden="true" /> Table
                </button>
              </div>
            )}
          </div>

          {seg === 'people' ? (
            <>
              <Panel>
                <div className="sa-tablewrap">
                  <table className="sa-table sa-table--rows">
                    <thead>
                      <tr><th>Person</th><th>History, per rule</th></tr>
                    </thead>
                    <tbody>
                      {w.people.length === 0 ? <tr><td colSpan={2} className="sa-small sa-text-2">Nobody has been confirmed as responsible yet.</td></tr> : null}
                      {w.people.map((p) => (
                        <tr key={p.respondent_id} onClick={() => navigate(adminPath(`/complaints/people/${p.respondent_id}`))}>
                          <td>
                            <span className="sa-semibold">{p.name}</span>
                            <span className="sa-cm-sub">{p.address} · {p.has_account ? 'StraySafe account' : 'No StraySafe account'}</span>
                          </td>
                          <td className="sa-small">
                            {p.rules.map((r) => `${r.title ?? r.policy_id}: ${r.counted} offense${r.counted === 1 ? '' : 's'}${r.pending ? ` + ${r.pending} to confirm` : ''}${r.corrected ? ` (${r.corrected} corrected)` : ''}`).join(' · ') || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
              <p className="sa-hint">Only people you confirmed as responsible appear here. A complainant’s suggestion never creates an entry.</p>
            </>
          ) : viewMode === 'cards' ? (
            rows.length === 0 ? (
              <div className="rounded-xl border border-[var(--sa-line)] bg-[var(--sa-surface)] p-8 text-center text-[var(--sa-ink-3)] text-sm">
                {seg === 'open' ? 'No active complaints.' : 'No complaints yet.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rows.map((x) => (
                  <ComplaintCard
                    key={x.report_id}
                    item={x}
                    c={caseOf(x.report_id)}
                    refId={refOf(x.report_id)}
                    now={now}
                    onNavigate={(ref) => navigate(adminPath(`/cases/${ref}`))}
                  />
                ))}
              </div>
            )
          ) : (
            <Panel>
              <div className="sa-tablewrap">
                <table className="sa-table sa-table--rows">
                  <thead>
                    <tr><th>Ref</th><th>Complaint</th><th>Rule</th><th>Person responsible</th><th>Offense</th><th>Where it stands</th></tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? <tr><td colSpan={6} className="sa-small sa-text-2">{seg === 'open' ? 'No active complaints.' : 'No complaints yet.'}</td></tr> : null}
                    {rows.map((x) => {
                      const c = caseOf(x.report_id);
                      const need = needsOf(inputOf(x), now, refOf)[0];
                      const wait = x.steps.map((s) => ({ s, b: stepBadge(s.kind, s.state) })).find((y) => y.b.wait);
                      return (
                        <tr key={x.report_id} onClick={() => navigate(adminPath(`/cases/${refOf(x.report_id)}`))}>
                          <td className="whitespace-nowrap"><span className="sa-ref">{refOf(x.report_id)}</span></td>
                          <td style={{ minWidth: 220 }}><span className="font-medium">{c?.title ?? 'Animal complaint'}</span><span className="sa-cm-sub">Seen {fmt(x.incident_at)}</span></td>
                          <td className="sa-small">{x.rule?.title ?? (x.no_rule ? 'No rule applies' : <span className="sa-text-3">—</span>)}</td>
                          <td style={{ minWidth: 170 }}>
                            {x.respondent ? <><span className="sa-semibold">{x.respondent.name}</span><span className="sa-cm-sub">Confirmed by you</span></>
                              : x.same_as ? <span className="sa-text-3">—</span>
                                : x.suspect ? <><span>{[x.suspect.name, x.suspect.address].filter(Boolean).join(' · ') || 'Suggested'}</span><span className="sa-cm-sub">Suggested by the complainant · unverified</span></>
                                  : <span className="sa-text-3">Not identified</span>}
                          </td>
                          <td className="whitespace-nowrap">
                            {x.same_as ? <span className="sa-small sa-text-2">Same occurrence as {refOf(x.same_as)}</span>
                              : x.offense ? (x.offense.counted && x.offense.number ? <span className="sa-semibold">{ord(x.offense.number)} offense</span> : <span className="sa-small sa-text-2">Not counted</span>)
                                : x.suggestion ? <><span className="sa-small">To confirm</span><span className="sa-cm-sub">Suggested: {ord(x.suggestion)}</span></> : <span className="sa-text-3">—</span>}
                          </td>
                          <td style={{ minWidth: 180 }}>
                            {x.closed ? <span className="sa-small sa-text-2">Closed</span>
                              : need ? <span className="sa-cm-needs-badge">Needs you</span>
                                : wait ? <span className="sa-small sa-text-2">Waiting: {lc(wait.s.kind === 'meeting' ? 'Meeting at the Barangay' : wait.s.kind === 'fine' ? 'Fine' : wait.s.kind === 'summons' ? 'Summons' : 'Letter')} · {lc(wait.b.text)}</span>
                                  : <span className="sa-text-3">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
