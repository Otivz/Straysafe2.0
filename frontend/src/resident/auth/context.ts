import { createContext, useContext } from 'react';
import type { ResidentGateway, ResidentSession } from './gateway';

export interface AuthValue {
  session: ResidentSession | null;
  /** True after a request reported an expired session; the layout then asks the resident to sign in again. */
  expired: boolean;
  /** Why the sign-in screen is showing, when it is not an ordinary visit. */
  notice: 'expired' | null;
  signIn: ResidentGateway['signIn'];
  /** Completes sign-up after the verification code and signs the new resident in. */
  verify(code: string): Promise<void>;
  register: ResidentGateway['register'];
  pendingSignup: ResidentGateway['pendingSignup'];
  resendCode: ResidentGateway['resendCode'];
  signOut(reason?: 'expired'): Promise<void>;
  expireSession(): void;
  requestPasswordReset: ResidentGateway['requestPasswordReset'];
  resetPassword: ResidentGateway['resetPassword'];
  changePassword: ResidentGateway['changePassword'];
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
