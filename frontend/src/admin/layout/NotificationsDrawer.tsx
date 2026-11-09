import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, CheckCheck } from 'lucide-react';
import { adminPath } from '../config';
import { Button } from '../components/Button';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/layout';
import { Segmented } from '../components/form';
import { NOTIFICATION_ICON } from '../components/icons';
import { useToast } from '../components/toast';
import { useAdminData } from '../data/context';
import { cx } from '../../preview/lib/cx';
import { errorMessage } from '../../preview/lib/errors';
import { relative } from '../../preview/lib/format';
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

  const open = (id: string, caseId?: string, read?: boolean) => {
    if (!read) dispatch({ type: 'notification/read', id }).catch((e: unknown) => toast.error(errorMessage(e)));
    if (caseId) { onClose(); navigate(adminPath(`/cases/${caseId}`)); }
  };

  return (
    <Dialog variant="drawer" flush title="Notifications" description={unread.length ? `${unread.length} unread` : 'You’re all caught up.'} onClose={onClose}>
      <div className="flex items-center justify-between gap-3 border-b border-solid px-5 py-3" style={{ borderColor: 'var(--sa-line-soft)' }}>
        <Segmented label="Show" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All', count: all.length }, { value: 'unread', label: 'Unread', count: unread.length }]} />
        <Button size="sm" variant="ghost" icon={CheckCheck} disabled={unread.length === 0} onClick={() => { dispatch({ type: 'notification/readAll' }).catch((e: unknown) => toast.error(errorMessage(e))); }}>Mark all read</Button>
      </div>
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
                <button type="button" className="sa-notif" data-unread={!n.read} onClick={() => open(n.id, n.caseId, n.read)}>
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
