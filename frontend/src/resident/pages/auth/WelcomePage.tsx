import { useLocation } from 'react-router-dom';
import { ClipboardList, LogIn, MailCheck, Search, ShieldCheck, UserPlus } from 'lucide-react';
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
      <style>{`
        @keyframes rsFadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rs-fade-up {
          animation: rsFadeUp 300ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
      `}</style>
      <header className="rs-welcome__brand rs-fade-up flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <img src="/SSLOGO-128.png" alt="" width="48" height="48" className="rounded-xl shadow-xs" />
          <span className="rs-auth__name">Stray<span>Safe</span></span>
        </div>
        <span className="rounded-full border border-[#e7e2da] bg-[#faf7f2] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#78716c]">
          Resident Portal
        </span>
      </header>

      <div className="rs-stack">
        <div className="rs-stack-sm rs-fade-up" style={{ animationDelay: '40ms' }}>
          {/* Nobody has signed in yet, so the app does not know whose subdivision this is. */}
          <h1 className="rs-title rs-title--hero">Keep your subdivision safe for people and animals</h1>
          <p className="rs-sub leading-relaxed">One place to report animal concerns, find lost pets and see what the subdivision is doing about them.</p>
        </div>

        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {POINTS.map(({ icon: Icon, title, text }, idx) => (
            <li
              key={title}
              style={{ animationDelay: `${80 + idx * 45}ms` }}
              className="rs-fade-up flex items-start gap-3 rounded-xl border border-[#e7e2da] bg-gradient-to-b from-white to-[#fcfaf6] p-3.5 shadow-xs transition-all duration-200 hover:border-[#d6cfc7] hover:shadow-sm"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#fed7aa]/70 bg-[#fff7ed] text-[#b45309]">
                <Icon size={18} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <strong className="block text-sm font-semibold text-[#1c1917]">{title}</strong>
                <span className="mt-0.5 block text-xs leading-relaxed text-[#57534e]">{text}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="rs-stack-sm rs-fade-up" style={{ animationDelay: '220ms' }}>
        <LinkButton variant="primary" block icon={LogIn} to={residentPath('/login')} state={{ from: origin }}>
          Sign in
        </LinkButton>
        <LinkButton block icon={UserPlus} to={residentPath('/register')} state={{ from: origin }}>
          Create an account
        </LinkButton>
        <div className="mt-1 flex items-start gap-2.5 rounded-xl border border-[#e7e2da] bg-[#faf7f2] px-3.5 py-2.5 text-xs leading-relaxed text-[#57534e]">
          <MailCheck size={16} className="mt-0.5 shrink-0 text-[#b45309]" aria-hidden="true" />
          <span>
            Did your Subdivision Leader create your account? Open the activation link in the email we sent you.
          </span>
        </div>
      </div>
    </div>
  );
}
