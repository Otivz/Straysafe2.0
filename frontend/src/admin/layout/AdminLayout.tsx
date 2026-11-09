import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu as MenuIcon } from 'lucide-react';
import { adminPath } from '../config';
import { useAuth } from '../auth/context';
import { IconButton } from '../components/Button';
import { ConfirmDialog } from '../components/Dialog';
import { ErrorState, PageSkeleton } from '../components/layout';
import { useAdminData } from '../data/context';
import { NavGuardContext, type NavGuard } from '../lib/navGuard';
import { NotificationsDrawer } from './NotificationsDrawer';
import { PreviewBar } from './PreviewBar';
import { SessionExpiredDialog, LogoutDialog } from './SessionDialogs';
import { BellButton, Sidebar } from './Sidebar';

/** The signed-in frame: sidebar, preview banner, loading/error gate, and the app-wide dialogs. */
export default function AdminLayout() {
  const { state, status, reload } = useAdminData();
  const { expired } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [navOpen, setNavOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);

  // Unsaved-changes guard: forms register as dirty; in-app navigation asks before discarding.
  const dirty = useRef(new Set<string>());
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const guard = useMemo<NavGuard>(() => ({
    register(key, isDirty) { if (isDirty) dirty.current.add(key); else dirty.current.delete(key); },
    isDirty: () => dirty.current.size > 0,
    go(to) { if (dirty.current.size > 0) setLeaveTo(to); else navigate(to); },
  }), [navigate]);

  // After moving to another screen, start at the top and hand focus to the main region (keyboard and screen readers).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    window.scrollTo(0, 0);
    document.getElementById('main')?.focus({ preventScroll: true });
  }, [pathname]);

  const unread = state.notifications.filter((n) => !n.read).length;
  const newReports = state.cases.filter((c) => c.status === 'reported').length;

  return (
    <NavGuardContext.Provider value={guard}>
      <div className="sa-root">
        <a className="sa-skip" href="#main">Skip to content</a>
        <div className="sa-shell">
          <Sidebar
            open={navOpen}
            subdivision={state.settings.subdivision.name}
            adminName={state.admin.name}
            unread={unread}
            newReports={newReports}
            onClose={() => setNavOpen(false)}
            onNotifications={() => { setNavOpen(false); setNotificationsOpen(true); }}
            onLogout={() => { setNavOpen(false); setLogoutOpen(true); }}
          />
          <div className="sa-main">
            <div className="sa-topbar">
              <IconButton label="Open menu" icon={MenuIcon} onClick={() => setNavOpen(true)} />
              <Link to={adminPath('/dashboard')} className="sa-brand">
                <img src="/SSLOGO-128.png" alt="" />
                <span className="sa-brand__name">Stray<span>Safe</span></span>
              </Link>
              <BellButton unread={unread} onClick={() => setNotificationsOpen(true)} />
            </div>
            <PreviewBar />
            <main id="main" tabIndex={-1} className="sa-page outline-none">
              {status === 'loading' ? <PageSkeleton /> : status === 'error' ? <ErrorState onRetry={reload} /> : <Outlet />}
            </main>
          </div>
        </div>

        {notificationsOpen ? <NotificationsDrawer onClose={() => setNotificationsOpen(false)} /> : null}
        {logoutOpen ? <LogoutDialog onClose={() => setLogoutOpen(false)} /> : null}
        {expired ? <SessionExpiredDialog /> : null}
        {leaveTo ? (
          <ConfirmDialog
            title="Discard unsaved changes?"
            message="You have changes on this screen that have not been saved. If you leave now they will be lost."
            confirmLabel="Discard and leave"
            tone="danger"
            onClose={() => setLeaveTo(null)}
            onConfirm={() => { dirty.current.clear(); navigate(leaveTo); }}
          />
        ) : null}
      </div>
    </NavGuardContext.Provider>
  );
}
