import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../auth/context';
import { BottomNav } from '../components/Chrome';
import { Sheet } from '../components/Sheet';
import { Button, Callout, ErrorState, ListSkeleton } from '../components/ui';
import { residentBase } from '../config';
import { useResidentData } from '../data/context';
import { Frame } from './Frame';

/** Paths (below the app base) that show the bottom navigation. Every other screen is a focused task with Back. */
const PRIMARY = new Set(['/home', '/community', '/report', '/reports', '/profile']);

/** Shown when a request reports that the session is no longer valid. It cannot be dismissed: the only way on is to sign in. */
function SessionExpiredSheet() {
  const { signOut } = useAuth();
  return (
    <Sheet
      title="Your session has expired"
      description="For your security you were signed out. Anything you already submitted is kept; something you were still typing may need to be entered again."
      onClose={() => undefined}
      dismissible={false}
      footer={<Button variant="primary" block icon={LogOut} autoFocus onClick={() => { void signOut('expired'); }}>Sign in again</Button>}
    >
      <p className="rs-sub">Sign in again to continue where you left off.</p>
    </Sheet>
  );
}

/** The signed-in frame: loading/error gate, bottom navigation on primary screens and the session dialog. */
export default function ResidentLayout() {
  const { state, status, reload, issues, loadError } = useResidentData();
  const { expired } = useAuth();
  const { pathname } = useLocation();

  const base = residentBase();
  const path = pathname.startsWith(base) ? pathname.slice(base.length).replace(/\/+$/, '') || '/' : pathname;
  const primary = PRIMARY.has(path);

  // After moving to another screen, start at the top and hand focus to the main region (keyboard and screen readers).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);

  const unreadReports = state.notifications.filter((n) => !n.read && n.kind !== 'community_notice' && n.kind !== 'safety_advisory').length;

  return (
    <Frame signedIn>
      <main id="main" tabIndex={-1} className="rs-main outline-none">
        {status === 'ready' && issues.length > 0 ? (
          <div className="rs-content">
            <Callout tone="amber" title="Some information could not be loaded.">
              {issues.map((i) => i.message).join(' ')} <button type="button" className="rs-seeall" onClick={reload}>Reload</button>
            </Callout>
          </div>
        ) : null}
        {status === 'loading' ? <div className="rs-content"><ListSkeleton rows={5} /></div> : status === 'error' ? <ErrorState onRetry={reload} title="We can’t load your information">{loadError ? `${loadError} Nothing you already submitted was lost.` : undefined}</ErrorState> : <Outlet />}
      </main>
      {primary && status === 'ready' ? <BottomNav unreadReports={unreadReports} /> : null}
      {expired ? <SessionExpiredSheet /> : null}
    </Frame>
  );
}
