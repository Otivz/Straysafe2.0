import { useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Clock, FlaskConical, Footprints, House, Megaphone, Plus, RefreshCw, RotateCcw, Timer, UserCheck, UserRound, UserX, type LucideIcon } from 'lucide-react';
import { useAuth } from '../auth/context';
import { residentPath } from '../config';
import { useResidentData } from '../data/context';
import { errorMessage } from '../../preview/lib/errors';
import { setPreviewFlags, usePreviewFlags } from '../../preview/lib/previewFlags';
import { Sheet } from './Sheet';
import { Button, IconButton, Row } from './ui';
import { ToggleRow } from './form';
import { useToast } from './toast';

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

/** Permanent notice that this is a preview, plus tools to see the states that need a backend (offline, failure, expiry). */
export function PreviewBar({ signedIn = false }: { signedIn?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="rs-previewbar" role="note">
        <FlaskConical size={14} aria-hidden="true" />
        <span className="rs-previewbar__text"><strong>Preview</strong> · sample data, nothing is sent</span>
        <button type="button" onClick={() => setOpen(true)}>Tools</button>
      </div>
      {open ? (signedIn ? <SignedInTools onClose={() => setOpen(false)} /> : <GuestTools onClose={() => setOpen(false)} />) : null}
    </>
  );
}

/** The network switches, shared by both tool sheets. */
function ProblemRows() {
  const flags = usePreviewFlags();
  return (
    <>
      <p className="rs-list__label">Simulate problems</p>
      <ToggleRow title="Network unavailable" meta="Every request fails, as if offline" checked={flags.offline} onChange={(v) => setPreviewFlags({ offline: v })} />
      <ToggleRow title="Fail the next save" meta="One change is rejected by the server" checked={flags.failNext} onChange={(v) => setPreviewFlags({ failNext: v })} />
    </>
  );
}

function GuestTools({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Preview tools" description="Development only. These stand in for the network, which this preview does not use." onClose={onClose} footer={<Button block onClick={onClose}>Done</Button>}>
      <div className="rs-list"><ProblemRows /></div>
    </Sheet>
  );
}

function SignedInTools({ onClose }: { onClose: () => void }) {
  const { dispatch, reload, resetSample } = useResidentData();
  const { expireSession } = useAuth();
  const toast = useToast();
  const act = (action: Parameters<typeof dispatch>[0], message: string) => {
    dispatch(action).then(() => toast.success(message)).catch((e: unknown) => toast.error(errorMessage(e)));
  };
  return (
    <Sheet title="Preview tools" description="Development only. These stand in for the subdivision administrator and the network." onClose={onClose} tall footer={<Button block onClick={onClose}>Done</Button>}>
      <div className="rs-list">
        <p className="rs-list__label">Simulate the subdivision</p>
        <Row icon={Clock} title="Administrator update on my latest report" meta="Moves it forward and sends a message" onClick={() => act({ type: 'preview/advanceReport' }, 'Update sent')} trailing={<span />} />
        <Row icon={UserCheck} title="Next step on my ownership claim" meta="Under review, more info, approved" onClick={() => act({ type: 'preview/advanceClaim' }, 'Claim updated')} trailing={<span />} />
        <Row icon={UserX} title="Decline my ownership claim" meta="Shows the not-approved decision" onClick={() => act({ type: 'preview/advanceClaim', decision: 'reject' }, 'Claim declined')} trailing={<span />} />
        <Row icon={Footprints} title="A neighbour sees my lost pet" meta="Adds a sighting and a notification" onClick={() => act({ type: 'preview/sighting' }, 'Sighting added')} trailing={<span />} />
        <ProblemRows />
        <Row icon={Timer} title="Expire the session now" onClick={() => { onClose(); expireSession(); }} trailing={<span />} />
        <Row icon={RefreshCw} title="Reload data (loading and error states)" onClick={() => { onClose(); reload(); }} trailing={<span />} />
        <p className="rs-list__label">Data</p>
        <Row icon={RotateCcw} title="Reset sample data" onClick={() => { resetSample(); toast.success('Sample data reset'); }} trailing={<span />} />
      </div>
    </Sheet>
  );
}
