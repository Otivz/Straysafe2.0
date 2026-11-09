import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ClipboardList, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../auth/context';
import { FormError, LinkButton, Button } from '../../components/ui';
import { residentPath } from '../../config';
import { SAMPLE_ACCOUNT } from '../../data/seed';
import { usePageTitle, useSubmit } from '../../lib/hooks';
import { DevNote } from './AuthShell';

const POINTS = [
  { icon: ClipboardList, title: 'Report a concern', text: 'Tell the subdivision about a stray, injured or noisy animal and follow what happens.' },
  { icon: Search, title: 'Lost and found pets', text: 'Share a lost-pet notice with neighbours, or check whether a found animal is yours.' },
  { icon: ShieldCheck, title: 'Private by default', text: 'Reports stay with the subdivision administrators. Only lost and found notices are shared.' },
];

/** R01 — Welcome. */
export default function WelcomePage() {
  usePageTitle('Welcome');
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const origin = ((useLocation().state ?? null) as { from?: string } | null)?.from;
  const { pending, error, run } = useSubmit();

  const trySample = async () => {
    if (await run(async () => { await signIn(SAMPLE_ACCOUNT.email, SAMPLE_ACCOUNT.password); })) navigate(origin ?? residentPath('/home'), { replace: true });
  };

  return (
    <div className="rs-auth rs-welcome">
      <header className="rs-welcome__brand">
        <img src="/SSLOGO-128.png" alt="" width="56" height="56" />
        <span className="rs-auth__name">Stray<span>Safe</span></span>
      </header>
      <div className="rs-stack">
        <div className="rs-stack-sm">
          <h1 className="rs-title rs-title--hero">Keep Selera Homes safe for people and animals</h1>
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
        {error ? <FormError message={error} /> : null}
        <LinkButton variant="primary" block to={residentPath('/register')} state={{ from: origin }}>Create an account</LinkButton>
        <LinkButton block to={residentPath('/login')} state={{ from: origin }}>Sign in</LinkButton>
      </div>
      <DevNote>
        <p>No server is needed. Use the sample resident to explore with sample data, or create an account to see the empty states.</p>
        <Button size="sm" loading={pending} onClick={() => void trySample()}>Use the sample resident</Button>
        <p className="rs-meta">This preview exists in development builds only. <Link to={residentPath('/login')}>Sample sign-in details</Link></p>
      </DevNote>
    </div>
  );
}
