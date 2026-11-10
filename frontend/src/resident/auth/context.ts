import { createContext, useContext } from 'react';
import type { ResidentGateway, ResidentSession } from './gateway';

export interface AuthValue {
  session: ResidentSession | null;
  /** True after a request reported an expired session; the layout then asks the resident to sign in again. */
  expired: boolean;
  /** Why the sign-in screen is showing, when it is not an ordinary visit. */
  notice: 'expired' | 'password_changed' | null;
  /** What identifies a resident when signing in, and how a forgotten password is recovered, in this mode. */
  signInWith: ResidentGateway['signInWith'];
  recovery: ResidentGateway['recovery'];
  signIn: ResidentGateway['signIn'];
  /** Completes sign-up after the verification code and signs the new resident in. */
  verify(code: string): Promise<void>;
  register: ResidentGateway['register'];
  pendingSignup: ResidentGateway['pendingSignup'];
  codeNotice(): string | null;
  resendCode: ResidentGateway['resendCode'];
  signOut(reason?: 'expired'): Promise<void>;
  expireSession(): void;
  requestPasswordReset: ResidentGateway['requestPasswordReset'];
  resetPassword: ResidentGateway['resetPassword'];
  resetPasswordWithCode(email: string, code: string, password: string): Promise<void>;
  changePassword: ResidentGateway['changePassword'];
  /** The subdivisions a new resident can join. */
  subdivisions(): Promise<{ id: number; name: string }[]>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
