/**
 * The seam between the Admin UI and authentication.
 *
 * The UI only ever talks to an `AuthGateway`. Today the only implementation is the in-memory PREVIEW gateway below,
 * which exists in development builds only (see ../config.ts). The real backend contract it will be replaced by is the
 * one the legacy admin login already uses:
 *
 *   POST /auth/login            { email, password }      -> { access_token, user_id, role_id, name, requires_login_code? }
 *   POST /auth/admin/verify-login  { email, otp }        -> session (when a sign-in code is required)
 *   POST /auth/forgot-password  { email }
 *   POST /auth/reset-password   { token/code, password }
 *   POST /auth/change-password  { current_password, new_password }
 *   GET  /auth/verify-session                             (session check)
 *   POST /auth/logout
 *
 * To reconnect: write an `httpGateway` that implements this interface with `utils/api.ts`, return it from `gateway`,
 * and delete the preview gateway. No screen needs to change.
 */
import { SESSION_KEY } from '../config';
import { AdminApiError } from '../../preview/lib/errors';
import { getPreviewFlags, sleep } from '../../preview/lib/previewFlags';

export interface AdminSession {
  userId: string;
  name: string;
  email: string;
  /** Always 'preview' until a real gateway exists. Shown in the UI so mock sessions are never mistaken for real ones. */
  mode: 'preview';
  startedAt: string;
}

export interface AuthGateway {
  restore(): AdminSession | null;
  signIn(email: string, password: string): Promise<AdminSession>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
}

/** Sample account for the preview. Not a real credential: it only unlocks sample data in a development build. */
export const PREVIEW_ACCOUNT = { email: 'carla.mendoza@selera-homes.example', password: 'Preview#2026', name: 'Carla Mendoza', userId: 'adm-1' } as const;

const guardNetwork = () => {
  if (getPreviewFlags().offline) throw new AdminApiError('network');
};

const previewGateway: AuthGateway = {
  restore() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as AdminSession) : null;
    } catch {
      return null;
    }
  },

  async signIn(email, password) {
    await sleep(550);
    guardNetwork();
    if (email.trim().toLowerCase() !== PREVIEW_ACCOUNT.email || password !== PREVIEW_ACCOUNT.password) {
      throw new AdminApiError('server', 'Incorrect email or password.');
    }
    const session: AdminSession = { userId: PREVIEW_ACCOUNT.userId, name: PREVIEW_ACCOUNT.name, email: PREVIEW_ACCOUNT.email, mode: 'preview', startedAt: new Date().toISOString() };
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* storage unavailable: the session lives in memory only */ }
    return session;
  },

  async signOut() {
    // Forget the session locally first, so even a reload right now cannot resurrect it; then "tell the server".
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    await sleep(150);
  },

  async requestPasswordReset() {
    await sleep(600);
    guardNetwork();
    // Always resolves, so the screen never reveals whether an account exists for the address.
  },

  // The preview validates these flows but never changes the sample password, so nothing credential-like is ever kept
  // in memory or browser storage and a page reload cannot revert it.
  async resetPassword(token) {
    await sleep(600);
    guardNetwork();
    if (token !== 'preview') throw new AdminApiError('server', 'This reset link is invalid or has expired. Request a new one.');
  },

  async changePassword(current) {
    await sleep(500);
    guardNetwork();
    if (current !== PREVIEW_ACCOUNT.password) throw new AdminApiError('server', 'Your current password is incorrect.');
  },
};

export const gateway: AuthGateway = previewGateway;
