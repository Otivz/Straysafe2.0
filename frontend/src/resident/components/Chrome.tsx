import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeft, ClipboardList, House, Megaphone, Plus, UserRound, type LucideIcon } from 'lucide-react';
import { residentPath } from '../config';
import { IconButton } from './ui';

/** Screen header for pushed (secondary) screens: Back, a title and optional actions. */
export function TopBar({ title, subtitle, onBack, actions }: { title: string; subtitle?: string; onBack: () => void; actions?: ReactNode }) {
  return (
    <header className="rs-topbar">
      <IconButton label="Back" icon={ArrowLeft} onClick={onBack} />
      <div className="rs-topbar__text"><h1 className="rs-topbar__title">{title}</h1>{subtitle ? <p className="rs-meta">{subtitle}</p> : null}</div>
      {actions}
    </header>
  );
}

const NAV: { to: string; label: string; icon: LucideIcon; key?: 'report' }[] = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/community', label: 'Community', icon: Megaphone },
  { to: '/report', label: 'Report', icon: Plus, key: 'report' },
  { to: '/reports', label: 'My reports', icon: ClipboardList },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

/** Exactly five primary destinations, shown only on the five primary screens. */
export function BottomNav({ unreadReports }: { unreadReports?: number }) {
  return (
    <nav className="rs-bottomnav" aria-label="Primary">
      {NAV.map(({ to, label, icon: Icon, key }) => (
        <NavLink key={to} to={residentPath(to)} end className={({ isActive }) => `rs-nav__link${key ? ' rs-nav__link--report' : ''}${isActive ? ' is-active' : ''}`}>
          <span className="rs-nav__icon"><Icon size={key ? 22 : 21} strokeWidth={key ? 2.2 : 1.9} aria-hidden="true" /></span>
          <span className="rs-nav__label">{label}</span>
          {to === '/reports' && unreadReports ? <span className="rs-nav__dot" aria-label={`${unreadReports} unread updates`} /> : null}
        </NavLink>
      ))}
    </nav>
  );
}
