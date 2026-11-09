import { useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { residentPath } from '../config';
import { AuthContext, useAuth, type AuthValue } from './context';
import { gateway, type ResidentSession } from './gateway';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ResidentSession | null>(() => gateway.restore());
  const [expired, setExpired] = useState(false);
  const [notice, setNotice] = useState<'expired' | null>(null);

  const value: AuthValue = {
    session,
    expired,
    notice,
    async signIn(identifier, password) {
      const next = await gateway.signIn(identifier, password);
      setSession(next);
      setExpired(false);
      setNotice(null);
      return next;
    },
    async verify(code) {
      const next = await gateway.verify(code);
      setSession(next);
      setExpired(false);
      setNotice(null);
    },
    register: gateway.register,
    pendingSignup: gateway.pendingSignup,
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
    changePassword: gateway.changePassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Route guard for every screen except welcome, sign-up, verification, sign-in and the password screens. */
export function RequireAuth() {
  const { session, notice } = useAuth();
  const location = useLocation();
  // After an expired session the resident goes straight to sign-in, where the reason is explained.
  if (!session) return <Navigate to={residentPath(notice === 'expired' ? '/login' : '/welcome')} replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Outlet />;
}
