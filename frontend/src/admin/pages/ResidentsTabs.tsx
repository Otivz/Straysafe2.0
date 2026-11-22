import { NavLink } from 'react-router-dom';
import { adminPath } from '../config';

/**
 * The two halves of the Residents area share one sidebar entry: the people who already have an account, and the official
 * list a person must match to register. They stay separate routes so each keeps its own filters in the URL.
 */
export function ResidentsTabs() {
  const items = [
    { to: '/residents', label: 'Registered', end: true },
    { to: '/residents/records', label: 'Official list', end: false },
    { to: '/residents/applications', label: 'Applications', end: false },
  ];
  return (
    <nav className="sa-tabs mb-5" aria-label="Residents sections">
      {items.map((t) => (
        <NavLink key={t.to} to={adminPath(t.to)} end={t.end} className="sa-tab">{t.label}</NavLink>
      ))}
    </nav>
  );
}
