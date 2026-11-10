import { useState } from 'react';
import { Bell, CircleHelp, Dog, LifeBuoy, LockKeyhole, LogOut, Settings, UserPen } from 'lucide-react';
import { fmtDate } from '../../../preview/lib/format';
import { LogoutSheet } from '../../components/LogoutSheet';
import { PrimaryScreen } from '../../components/Screen';
import { Avatar, Row } from '../../components/ui';
import { residentPath } from '../../config';
import { useResidentData } from '../../data/context';
import { unreadCount } from '../../data/selectors';

/** R34 — Profile and everything that is not a report. R40 (sign out) is the confirmation opened from here. */
export default function ProfilePage() {
  const { state, capabilities } = useResidentData();
  const [leaving, setLeaving] = useState(false);
  const { profile } = state;
  const unread = unreadCount(state);
  const to = (path: string) => residentPath(path);

  return (
    <PrimaryScreen title="Profile">
      <section className="rs-profilehead" aria-label="Your details">
        <Avatar name={profile.name} size="lg" />
        <div className="min-w-0">
          <h2 className="rs-h2">{profile.name}</h2>
          <p className="rs-meta">{profile.email}</p>
          {profile.phone ? <p className="rs-meta">{profile.phone}</p> : null}
          {[profile.unit, profile.street].some(Boolean) ? <p className="rs-meta">{[profile.unit, profile.street].filter(Boolean).join(' · ')}</p> : null}
          <p className="rs-meta">Member since {fmtDate(profile.memberSince)}</p>
        </div>
      </section>

      <div className="rs-list">
        <Row to={to('/profile/edit')} icon={UserPen} title="Edit profile" meta="Name, contact details and address" />
        <Row to={to('/pets')} icon={Dog} title="My pets" meta={state.pets.length === 0 ? 'None registered yet' : `${state.pets.length} registered`} />
        <Row to={to('/notifications')} icon={Bell} title="Notifications" meta={unread > 0 ? `${unread} unread` : 'All caught up'} />
        <Row to={to('/settings')} icon={Settings} title="Settings" meta="Notification choices, password, privacy" />
      </div>
      <div className="rs-list">
        <Row to={to('/privacy')} icon={LockKeyhole} title="Privacy and your data" meta="What is shared, and with whom" />
        <Row to={to('/help')} icon={CircleHelp} title="Help" meta="Questions about reports, notices and claims" />
        <Row to={to('/contact')} icon={LifeBuoy} title="Contact the subdivision" meta={capabilities.messageOffice ? 'Office hours and a message form' : 'Office hours and how to reach them'} />
      </div>
      <div className="rs-list">
        <Row icon={LogOut} title="Sign out" onClick={() => setLeaving(true)} danger />
      </div>

      {leaving ? <LogoutSheet onClose={() => setLeaving(false)} /> : null}
    </PrimaryScreen>
  );
}
