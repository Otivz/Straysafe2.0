import { createContext, useContext } from 'react';
import type { AdminSession, AuthGateway } from './gateway';

export interface AuthValue {
  session: AdminSession | null;
  /** True after a request reported an expired session; the layout then asks the admin to sign in again. */
  expired: boolean;
  /** Why the sign-in screen is showing, when it is not an ordinary visit (kept in auth state, not in navigation state). */
  notice: 'expired' | 'password_changed' | null;
  /** How a forgotten password is recovered: an emailed code (the real backend). */
  recovery: AuthGateway['recovery'];
  signIn(email: string, password: string): Promise<void>;
  signOut(reason?: 'expired'): Promise<void>;
  expireSession(): void;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  resetPasswordWithCode(email: string, code: string, password: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
