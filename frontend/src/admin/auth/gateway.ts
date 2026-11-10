/**
 * The seam between the Admin UI and authentication.
 *
 * The UI only ever talks to an `AuthGateway`. Its implementation (httpGateway.ts, imported by AdminLiveRoot.tsx) is not imported
 * here, so this file carries no credentials and no network code. The real backend contract:
 *
 *   POST /auth/login            { email, password }       -> { access_token, user_id, role_id, name, ... }
 *   GET  /auth/verify-session                              (is the stored session still good?)
 *   POST /auth/refresh                                     (done by utils/api.ts on a 401, from the httpOnly cookie)
 *   POST /auth/logout
 *   POST /auth/forgot-password  { email }                  -> an emailed 6-digit code (the answer never says if the email exists)
 *   POST /auth/reset-password   { email, otp, new_password }
 *   POST /auth/change-password  { current_password, new_password }   (ends every session, this one included)
 */
export interface AdminSession {
  userId: string;
  name: string;
  email: string;
  startedAt: string;
  /** The backend role: 2 = Subdivision Leader. */
  roleId?: number;
  subdivisionId?: number | null;
}

export interface AuthGateway {
  restore(): AdminSession | null;
  /** Ask the server whether the restored session is still good. Resolves null when it is not. */
  verify?(): Promise<AdminSession | null>;
  signIn(email: string, password: string): Promise<AdminSession>;
  signOut(): Promise<void>;
  /** How a forgotten password is recovered: an emailed 6-digit code (the real backend). */
  recovery: 'link' | 'code';
  requestPasswordReset(email: string): Promise<void>;
  /** Recovery by link. */
  resetPassword(token: string, password: string): Promise<void>;
  /** Recovery by code. */
  resetPasswordWithCode?(email: string, code: string, password: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  /** True when changing the password ends the session (the real backend signs the person out everywhere). */
  endsSessionOnPasswordChange?: boolean;
}
