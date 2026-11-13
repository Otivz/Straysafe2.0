import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, CheckCheck, Settings } from 'lucide-react';
import { relative } from '../../../preview/lib/format';
import { NOTIFICATION_ICON } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { Button, EmptyState, IconButton, Segmented } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { unreadCount } from '../../data/selectors';
import type { Notification } from '../../data/types';
import { useNow } from '../../lib/hooks';

type Tab = 'all' | 'unread';

/** R33 — Notifications: report updates, sightings, claim updates, community notices and the Subdivision Leader's lost & found alerts. */
export default function NotificationsPage() {
  const { state, local } = useResidentData();
  const navigate = useNavigate();
  const now = useNow();
  const [tab, setTab] = useState<Tab>('all');
  const unread = unreadCount(state);
  const shown = [...state.notifications].filter((n) => tab === 'all' || !n.read).sort((a, b) => b.at.localeCompare(a.at));

  const open = (n: Notification) => {
    if (!n.read) local({ type: 'notification/read', id: n.id });
    navigate(residentPath(n.to));
  };

  return (
    <Screen title="Notifications" back="/home" actions={<IconButton label="Notification settings" icon={Settings} onClick={() => navigate(residentPath('/settings'))} />}>
      <Segmented<Tab> label="Show" value={tab} onChange={setTab} options={[{ value: 'all', label: 'All', count: state.notifications.length }, { value: 'unread', label: 'Unread', count: unread }]} />
      {unread > 0 ? <Button variant="ghost" icon={CheckCheck} onClick={() => local({ type: 'notification/readAll' })}>Mark all as read</Button> : null}

      {shown.length === 0 ? (
        <EmptyState icon={BellOff} title={tab === 'unread' ? 'You’re all caught up' : 'No notifications yet'}>
          {tab === 'unread' ? 'There is nothing new to read.' : 'Updates about your reports, sightings, claims and lost & found alerts will appear here.'}
        </EmptyState>
      ) : (
        <ul className="rs-notifs" aria-label="Notifications, newest first">
          {shown.map((n) => {
            const Icon = NOTIFICATION_ICON[n.kind];
            return (
              <li key={n.id}>
                <button type="button" className="rs-notif" data-unread={!n.read} onClick={() => open(n)}>
                  <span className="rs-notif__icon"><Icon size={18} aria-hidden="true" /></span>
                  <span className="rs-notif__text">
                    <span className="rs-notif__title">{n.title}{!n.read ? <span className="rs-sr-only"> (unread)</span> : null}</span>
                    <span className="rs-notif__body">{n.body}</span>
                    <span className="rs-meta">{n.kind === 'alert' ? `From your Subdivision Leader · ${relative(n.at, now)}` : relative(n.at, now)}</span>
                  </span>
                  {!n.read ? <span className="rs-notif__dot" aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Screen>
  );
}
