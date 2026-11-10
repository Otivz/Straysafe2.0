import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SESSION_ENDED_EVENT } from '../../utils/api';
import { STAFF_INACTIVITY_TIMEOUT_MS, getLastActivityTime, recordUserActivity } from '../../utils/inactivity';
import { AdminApiError } from '../../preview/lib/errors';
import { adminPath } from '../config';
import { useAdminMode } from '../mode';
import { AuthContext, useAuth, type AuthValue } from './context';
import type { AdminSession } from './gateway';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { gateway } = useAdminMode();
  const [session, setSession] = useState<AdminSession | null>(() => gateway.restore());
  const [expired, setExpired] = useState(false);
  const [notice, setNotice] = useState<AuthValue['notice']>(null);
  const signedIn = session !== null;

  // A restored session is only a claim until the server agrees: ask once, and if it disagrees go to sign-in.
  // Trouble reaching the server is not a reason to sign anyone out: the data layer shows it as an error with Try again.
  // Only when a session was restored: a visitor with none has nothing to verify and must not be told one "expired".
  useEffect(() => {
    if (!gateway.verify || !session) return undefined;
    let cancelled = false;
    gateway.verify().then(
      async (next) => {
        if (cancelled || next) { if (next && !cancelled) setSession(next); return; }
        setSession(null);
        setNotice('expired');
        await gateway.signOut();
      },
      (err: unknown) => { if (!(err instanceof AdminApiError)) console.warn('Session check failed', err); },
    );
    return () => { cancelled = true; };
    // Once per mount: the gateway never changes for the life of this provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The shared API client ends a session when the server will not renew it (refresh token expired or revoked,
  // account inactive, password changed elsewhere) and says so with this event; the layout then asks to sign in again.
  useEffect(() => {
    if (!signedIn) return undefined;
    const ended = () => setExpired(true);
    window.addEventListener(SESSION_ENDED_EVENT, ended);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, ended);
  }, [signedIn]);

  // The idle rule of Subdivision Leaders (utils/inactivity.ts): after the staff limit of idleness,
  // ask to sign in again. Pointer and key activity count, as they do there; requests count too (the API client records them).
  useEffect(() => {
    if (!signedIn) return undefined;
    const mark = () => recordUserActivity();
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach((name) => window.addEventListener(name, mark, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - getLastActivityTime() > STAFF_INACTIVITY_TIMEOUT_MS) setExpired(true);
    }, 60_000);
    return () => { events.forEach((name) => window.removeEventListener(name, mark)); window.clearInterval(timer); };
  }, [signedIn]);

  const value: AuthValue = {
    session,
    expired,
    notice,
    recovery: gateway.recovery,
    async signIn(email, password) {
      const next = await gateway.signIn(email, password);
      setSession(next);
      setExpired(false);
      setNotice(null);
    },
    async signOut(reason) {
      // Clear the local session first, in the same tick as any navigation the caller makes, so the sign-in screen
      // never sees a stale session and bounces back into the app. Then tell the gateway (which may fail offline).
      setSession(null);
      setExpired(false);
      setNotice(reason ?? null);
      await gateway.signOut();
    },
    expireSession: () => setExpired(true),
    requestPasswordReset: gateway.requestPasswordReset,
    resetPassword: gateway.resetPassword,
    resetPasswordWithCode: async (email, code, password) => {
      if (!gateway.resetPasswordWithCode) throw new AdminApiError('server', 'This sign-in uses an emailed link, not a code.');
      await gateway.resetPasswordWithCode(email, code, password);
    },
    async changePassword(current, next) {
      await gateway.changePassword(current, next);
      if (gateway.endsSessionOnPasswordChange) {
        // The server signed this person out everywhere, so say so and show the sign-in screen.
        setSession(null);
        setExpired(false);
        setNotice('password_changed');
        await gateway.signOut();
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Route guard for everything except the sign-in, forgot-password and reset-password screens. */
export function RequireAuth() {
  const { session } = useAuth();
  const location = useLocation();
  if (!session) return <Navigate to={adminPath('/login')} replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Outlet />;
}
