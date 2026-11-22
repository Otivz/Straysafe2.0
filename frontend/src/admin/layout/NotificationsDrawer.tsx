import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, BellOff, CalendarClock, CheckCheck, Share2 } from 'lucide-react';
import { adminPath } from '../config';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/layout';
import { Segmented } from '../components/form';
import { NOTIFICATION_ICON } from '../components/icons';
import { useToast } from '../components/toast';
import { useAdminData } from '../data/context';
import { dueReferralItems, pendingFollowUps } from '../data/selectors';
import { cx } from '../../preview/lib/cx';
import { errorMessage } from '../../preview/lib/errors';
import { dueInfo, relative } from '../../preview/lib/format';
import { useNow } from '../../preview/lib/hooks';

/** A23 — Notifications. A drawer, not a page: reachable from the bell in every screen, with read/unread state. */
export function NotificationsDrawer({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useAdminData();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const now = useNow();
  const navigate = useNavigate();
  const toast = useToast();

  const all = [...state.notifications].sort((a, b) => b.at.localeCompare(a.at));
  const unread = all.filter((n) => !n.read);
  const list = filter === 'unread' ? unread : all;
  const dueReferrals = dueReferralItems(state.cases, now);
  const dueFollowUps = pendingFollowUps(state.cases).filter((x) => {
    const d = dueInfo(x.followUp.dueAt, now);
    return d.overdue || d.today;
  });
  const hasDueAlerts = dueReferrals.length > 0 || dueFollowUps.length > 0;

  const open = (id: string, caseId?: string, read?: boolean, to?: string) => {
    if (!read) dispatch({ type: 'notification/read', id }).catch((e: unknown) => toast.error(errorMessage(e)));
    if (to) { onClose(); navigate(adminPath(to)); }
    else if (caseId) { onClose(); navigate(adminPath(`/cases/${caseId}`)); }
  };

  return (
    <Dialog variant="drawer" flush title="Notifications" description={unread.length ? `${unread.length} unread` : 'You’re all caught up.'} onClose={onClose}>
      <div className="flex items-center justify-between gap-3 border-b border-solid px-5 py-3" style={{ borderColor: 'var(--sa-line-soft)' }}>
        <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All', count: all.length }, { value: 'unread', label: 'Unread', count: unread.length }]} />
        <Button size="sm" variant="ghost" icon={CheckCheck} disabled={unread.length === 0} onClick={() => { dispatch({ type: 'notification/readAll' }).catch((e: unknown) => toast.error(errorMessage(e))); }}>Mark all read</Button>
      </div>
      {hasDueAlerts ? (
        <div className="border-b border-solid bg-[#fffbeb]/70 px-5 py-3.5" style={{ borderColor: 'var(--sa-line-soft)' }}>
          <p className="m-0 mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#92400e]">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>Overdue &amp; due today ({dueReferrals.length + dueFollowUps.length})</span>
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {dueReferrals.slice(0, 4).map(({ case: c, referral: r, overdue, label }) => (
              <li key={`due-ref-${r.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    navigate(`${adminPath(`/cases/${c.id}`)}?tab=referrals`);
                  }}
                  className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[#e7e2da] bg-white px-3 py-2 text-left transition-colors hover:border-[#d6cfc7] hover:bg-[#fcfaf6]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1c1917]">
                      <Share2 size={12} className="shrink-0 text-[var(--sa-brand)]" aria-hidden="true" />
                      <span className="truncate">{r.orgName} ({c.id})</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-[#57534e]">{r.referenceNo} · {c.title}</span>
                  </span>
                  <Badge tone={overdue ? 'red' : 'amber'}>{label}</Badge>
                </button>
              </li>
            ))}
            {dueFollowUps.slice(0, 4).map(({ case: c, followUp: f }) => {
              const d = dueInfo(f.dueAt, now);
              return (
                <li key={`due-fu-${f.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      navigate(`${adminPath(`/cases/${c.id}`)}?tab=actions`);
                    }}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg border border-[#e7e2da] bg-white px-3 py-2 text-left transition-colors hover:border-[#d6cfc7] hover:bg-[#fcfaf6]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1c1917]">
                        <CalendarClock size={12} className="shrink-0 text-[var(--sa-brand)]" aria-hidden="true" />
                        <span className="truncate">{f.title}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[#57534e]">{c.id} · {c.title}</span>
                    </span>
                    <Badge tone={d.overdue ? 'red' : 'amber'}>{d.label}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {list.length === 0 ? (
        <EmptyState icon={BellOff} title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'} compact>
          New reports, urgent incidents, follow-up reminders and ownership claim updates will appear here.
        </EmptyState>
      ) : (
        <ul className="m-0 list-none p-0">
          {list.map((n) => {
            const { icon: Icon, tone } = NOTIFICATION_ICON[n.kind];
            return (
              <li key={n.id}>
                <button type="button" className="sa-notif" data-unread={!n.read} onClick={() => open(n.id, n.caseId, n.read, n.to)}>
                  <span className={cx('sa-tl__icon', tone !== 'neutral' && `sa-tl__icon--${tone}`)}><Icon size={14} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="sa-notif__title">{n.title}</span>
                    <span className="sa-notif__body">{n.body}</span>
                    <span className="sa-meta mt-1 block">{relative(n.at, now)}</span>
                  </span>
                  {!n.read ? <span className="sa-notif__dot" role="img" aria-label="Unread" /> : <span />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}
