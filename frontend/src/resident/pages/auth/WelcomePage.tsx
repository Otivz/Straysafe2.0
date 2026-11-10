import { useLocation } from 'react-router-dom';
import { ClipboardList, Search, ShieldCheck } from 'lucide-react';
import { LinkButton } from '../../components/ui';
import { residentPath } from '../../config';
import { usePageTitle } from '../../lib/hooks';

const POINTS = [
  { icon: ClipboardList, title: 'Report a concern', text: 'Tell the subdivision about a stray, injured or noisy animal and follow what happens.' },
  { icon: Search, title: 'Lost and found pets', text: 'Share a lost-pet notice with neighbours, or check whether a found animal is yours.' },
  { icon: ShieldCheck, title: 'Private by default', text: 'Reports stay with the subdivision administrators. Only lost and found notices are shared.' },
];

/** R01 — Welcome. */
export default function WelcomePage() {
  usePageTitle('Welcome');
  const origin = ((useLocation().state ?? null) as { from?: string } | null)?.from;

  return (
    <div className="rs-auth rs-welcome">
      <header className="rs-welcome__brand">
        <img src="/SSLOGO-128.png" alt="" width="56" height="56" />
        <span className="rs-auth__name">Stray<span>Safe</span></span>
      </header>
      <div className="rs-stack">
        <div className="rs-stack-sm">
          {/* Nobody has signed in yet, so the app does not know whose subdivision this is. */}
          <h1 className="rs-title rs-title--hero">Keep your subdivision safe for people and animals</h1>
          <p className="rs-sub">One place to report animal concerns, find lost pets and see what the subdivision is doing about them.</p>
        </div>
        <ul className="rs-points">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <span className="rs-points__icon"><Icon size={20} aria-hidden="true" /></span>
              <span><strong>{title}</strong><span className="rs-points__text">{text}</span></span>
            </li>
          ))}
        </ul>
      </div>
      <div className="rs-stack-sm">
        <LinkButton variant="primary" block to={residentPath('/register')} state={{ from: origin }}>Create an account</LinkButton>
        <LinkButton block to={residentPath('/login')} state={{ from: origin }}>Sign in</LinkButton>
      </div>
    </div>
  );
}
