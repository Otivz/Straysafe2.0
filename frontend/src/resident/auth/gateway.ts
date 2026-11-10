/**
 * The seam between the Resident UI and authentication.
 *
 * Screens only talk to a `ResidentGateway`. Its implementation (httpGateway.ts, imported by ResidentLiveRoot.tsx) is not imported
 * here, so this file carries no credentials and no network code. The real backend contract:
 *
 *   POST /users/                { name, email, password, phone, role_id: 1, subdivision_id, address }   register (unverified)
 *   POST /auth/login            { email, password }   -> a verified session, or a RESTRICTED token with requires_otp (an emailed code)
 *   POST /auth/verify-otp       { otp }               with the restricted token -> the verified session
 *   POST /auth/resend-otp       {}                    with the restricted token (30 s cooldown)
 *   GET  /auth/verify-session   POST /auth/logout     POST /auth/refresh (done by utils/api.ts from the httpOnly cookie)
 *   POST /auth/forgot-password  { email }  ->  an emailed 6-digit code;   POST /auth/reset-password  { email, otp, new_password }
 *   POST /auth/change-password  { current_password, new_password }   (ends every session, this one included)
 *
 * The server signs in by EMAIL only (LoginRequest.email); a mobile number cannot be used to sign in.
 */
export interface SignupProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  unit: string;
  street: string;
  /** The subdivision the resident joins (the sign-up screen offers a choice only when there is more than one). */
  subdivisionId?: number;
}

export interface ResidentSession {
  userId: string;
  name: string;
  email: string;
  startedAt: string;
  /** The backend role: 1 = resident. */
  roleId?: number;
  subdivisionId?: number | null;
  phone?: string | null;
  address?: string | null;
}

/** Signing in either completes, or the account still has to be verified with the emailed code. */
export type SignInResult = { status: 'signed_in'; session: ResidentSession } | { status: 'verify' };

export interface ResidentGateway {
  /** What identifies a resident when signing in: only the email (the real backend). */
  signInWith: 'email_or_phone' | 'email';
  /** How a forgotten password is recovered: an emailed 6-digit code (the real backend). */
  recovery: 'link' | 'code';
  restore(): ResidentSession | null;
  /** Ask the server whether the restored session is still good. Resolves null when it is not. */
  verifySession?(): Promise<ResidentSession | null>;
  signIn(identifier: string, password: string): Promise<SignInResult>;
  /** Creates the account and starts the verification. The password goes to the server and is never kept here. */
  register(profile: Omit<SignupProfile, 'id'>, password: string): Promise<void>;
  pendingSignup(): SignupProfile | null;
  /** What the server said about sending the code (for example that the email could not be sent). */
  codeNotice?(): string | null;
  resendCode(): Promise<void>;
  verify(code: string): Promise<ResidentSession>;
  signOut(): Promise<void>;
  requestPasswordReset(identifier: string): Promise<void>;
  /** Recovery by link. */
  resetPassword(token: string, password: string): Promise<void>;
  /** Recovery by code. */
  resetPasswordWithCode?(email: string, code: string, password: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
  /** True when changing the password ends the session (the real backend signs the person out everywhere). */
  endsSessionOnPasswordChange?: boolean;
  /** The subdivisions a new resident can join. */
  subdivisions?(): Promise<{ id: number; name: string }[]>;
}
