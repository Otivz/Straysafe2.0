import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Circle } from 'lucide-react';
import { passwordRules } from '../../../utils/passwordPolicy';
import { residentPath } from '../../config';
import { usePageTitle } from '../../lib/hooks';

/** Frame for the signed-out screens: brand, a heading and the form. `back` is a path inside the app. */
export function AuthShell({ title, lead, back, children, below }: { title: string; lead?: ReactNode; back?: string; children: ReactNode; below?: ReactNode }) {
  usePageTitle(title);
  return (
    <div className="rs-auth">
      <header className="rs-auth__top">
        {back ? <Link to={residentPath(back)} className="rs-iconbtn" aria-label="Back" title="Back"><ArrowLeft size={21} strokeWidth={1.9} aria-hidden="true" /></Link> : <span className="rs-auth__spacer" />}
        <span className="rs-auth__brand">
          <img src="/SSLOGO-128.png" alt="" width="32" height="32" />
          <span className="rs-auth__name">Stray<span>Safe</span></span>
        </span>
        <span className="rs-auth__spacer" />
      </header>
      <div className="rs-auth__body">
        <div className="rs-stack-sm">
          <h1 className="rs-title">{title}</h1>
          {lead ? <p className="rs-sub">{lead}</p> : null}
        </div>
        {children}
      </div>
      {below}
    </div>
  );
}

/** Live checklist for the platform's password policy (the same rules as the rest of the app). */
export function PasswordRules({ password }: { password: string }) {
  return (
    <ul className="rs-rules" aria-label="Password requirements">
      {passwordRules(password).map((rule) => (
        <li key={rule.id} data-met={rule.met}>
          {rule.met ? <Check size={15} aria-hidden="true" /> : <Circle size={15} aria-hidden="true" />}
          <span>{rule.label}<span className="rs-sr-only">{rule.met ? ' (met)' : ' (not met)'}</span></span>
        </li>
      ))}
    </ul>
  );
}
