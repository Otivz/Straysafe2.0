import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { SESSION_ENDED_EVENT } from '../../utils/api';
import { AdminApiError } from '../../preview/lib/errors';
import { residentPath } from '../config';
import { useResidentMode } from '../mode';
import { AuthContext, useAuth, type AuthValue } from './context';
import type { ResidentSession } from './gateway';

export function AuthProvider({ children }: { children: ReactNode }) {
  const { gateway } = useResidentMode();
  const [session, setSession] = useState<ResidentSession | null>(() => gateway.restore());
  const [expired, setExpired] = useState(false);
  const [notice, setNotice] = useState<AuthValue['notice']>(null);
  const signedIn = session !== null;

  // A restored session is only a claim until the server agrees: ask once, and if it disagrees go to sign-in.
  // Trouble reaching the server is not a reason to sign anyone out: the data layer shows it as an error with Try again.
  // Only when a session was restored: a visitor with none has nothing to verify and must not be told one "expired".
  useEffect(() => {
    if (!gateway.verifySession || !session) return undefined;
    let cancelled = false;
    gateway.verifySession().then(
      async (next) => {
        if (cancelled) return;
        if (next) { setSession(next); return; }
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

  // The shared API client ends a session when the server will not renew it (the 30-day sign-in lapsed, the account
  // was deactivated, the password was changed elsewhere) and says so with this event; the layout then asks to sign in again.
  // Residents have no idle sign-out: that is the server's 30-day rule (utils/inactivity.ts).
  useEffect(() => {
    if (!signedIn) return undefined;
    const ended = () => setExpired(true);
    window.addEventListener(SESSION_ENDED_EVENT, ended);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, ended);
  }, [signedIn]);

  const value: AuthValue = {
    session,
    expired,
    notice,
    signInWith: gateway.signInWith,
    recovery: gateway.recovery,
    async signIn(identifier, password) {
      const result = await gateway.signIn(identifier, password);
      if (result.status === 'signed_in') {
        setSession(result.session);
        setExpired(false);
        setNotice(null);
      }
      return result;
    },
    async verify(code) {
      const next = await gateway.verify(code);
      setSession(next);
      setExpired(false);
      setNotice(null);
    },
    register: gateway.register,
    pendingSignup: gateway.pendingSignup,
    codeNotice: () => gateway.codeNotice?.() ?? null,
    resendCode: gateway.resendCode,
    async signOut(reason) {
      // Clear the local session first (same tick as any navigation) so the next screen never sees a stale session.
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
    subdivisions: async () => (gateway.subdivisions ? gateway.subdivisions() : []),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Route guard for every screen except welcome, sign-up, verification, sign-in and the password screens. */
export function RequireAuth() {
  const { session, notice } = useAuth();
  const location = useLocation();
  // After an expired session the resident goes straight to sign-in, where the reason is explained.
  if (!session) return <Navigate to={residentPath(notice === 'expired' || notice === 'password_changed' ? '/login' : '/welcome')} replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Outlet />;
}
