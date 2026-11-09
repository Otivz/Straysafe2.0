import { useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { adminPath } from '../config';
import { AuthContext, useAuth, type AuthValue } from './context';
import { gateway, type AdminSession } from './gateway';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AdminSession | null>(() => gateway.restore());
  const [expired, setExpired] = useState(false);
  const [notice, setNotice] = useState<'expired' | null>(null);

  const value: AuthValue = {
    session,
    expired,
    notice,
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
    changePassword: gateway.changePassword,
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
