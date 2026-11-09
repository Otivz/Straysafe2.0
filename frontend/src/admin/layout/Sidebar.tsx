import { useContext } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Bell, Building2, ChartColumn, ChevronsUpDown, FolderOpen, LayoutDashboard, LogOut, Megaphone, PawPrint, Settings, UserRound, Users, type LucideIcon } from 'lucide-react';
import { adminPath } from '../config';
import { NavGuardContext } from '../lib/navGuard';
import { IconButton } from '../components/Button';
import { Avatar } from '../components/layout';
import { Menu } from '../components/Menu';

const NAV: { to: string; label: string; icon: LucideIcon; badge?: 'newReports' }[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/cases', label: 'Cases', icon: FolderOpen, badge: 'newReports' },
  { to: '/community', label: 'Community', icon: Megaphone },
  { to: '/pets', label: 'Pet Registry', icon: PawPrint },
  { to: '/residents', label: 'Residents', icon: Users },
  { to: '/reports', label: 'Analytics', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function BellButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <span className="sa-bell">
      <IconButton label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} icon={Bell} onClick={onClick} />
      {unread > 0 ? <span className="sa-bell__dot" aria-hidden="true">{unread}</span> : null}
    </span>
  );
}

export function Sidebar({ open, subdivision, adminName, unread, newReports, onClose, onNotifications, onLogout }: {
  open: boolean; subdivision: string; adminName: string; unread: number; newReports: number;
  onClose: () => void; onNotifications: () => void; onLogout: () => void;
}) {
  const guard = useContext(NavGuardContext);
  return (
    <>
      <div className="sa-scrim" data-open={open} onClick={onClose} aria-hidden="true" />
      <aside className="sa-sidebar" data-open={open} aria-label="Sidebar">
        <div className="flex items-start justify-between gap-2">
          <Link to={adminPath('/dashboard')} className="sa-brand">
            <img src="/SSLOGO-128.png" alt="" />
            <span>
              <span className="sa-brand__name block">Stray<span>Safe</span></span>
              <span className="sa-brand__sub block">Subdivision Admin</span>
            </span>
          </Link>
          <BellButton unread={unread} onClick={onNotifications} />
        </div>
        <div className="sa-place"><Building2 size={15} aria-hidden="true" /><span className="sa-clamp-1">{subdivision}</span></div>

        <nav aria-label="Primary" className="sa-nav">
          {NAV.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={adminPath(to)}
              className="sa-nav__link"
              onClick={(e) => {
                if (guard?.isDirty()) { e.preventDefault(); guard.go(adminPath(to)); }
                onClose();
              }}
            >
              <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
              {label}
              {badge === 'newReports' && newReports > 0 ? <span className="sa-nav__count" aria-label={`${newReports} new reports`}>{newReports}</span> : null}
            </NavLink>
          ))}
        </nav>

        <div className="sa-sidebar__foot">
          <Menu
            fill
            direction="up"
            align="left"
            width={236}
            trigger={(p) => (
              <button type="button" className="sa-account" {...p}>
                <Avatar name={adminName} brand />
                <span className="min-w-0 flex-1">
                  <span className="sa-account__name sa-clamp-1 block">{adminName}</span>
                  <span className="sa-account__role block">Subdivision Admin</span>
                </span>
                <ChevronsUpDown size={15} className="shrink-0" aria-hidden="true" />
              </button>
            )}
            items={[
              { label: 'Your profile', icon: UserRound, to: adminPath('/profile') },
              { kind: 'separator' },
              { label: 'Sign out', icon: LogOut, onSelect: onLogout, danger: true },
            ]}
          />
        </div>
      </aside>
    </>
  );
}
