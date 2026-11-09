/**
 * The seam between the Resident UI and authentication.
 *
 * Screens only talk to a `ResidentGateway`. Today the only implementation is the in-memory PREVIEW gateway below, which
 * exists in development builds only (see ../config.ts). The real backend contract it will be replaced by is the one the
 * legacy resident login already uses (see utils/api.ts and pages/citizen/ResidentsLogin.tsx):
 *
 *   POST /auth/login            { email | phone, password }
 *   POST /auth/register         { name, email, phone, address, password }   then a verification code step
 *   POST /auth/verify-otp       { email, otp }
 *   POST /auth/forgot-password  { email }      POST /auth/reset-password  { token/code, password }
 *   POST /auth/change-password  { current_password, new_password }
 *   GET  /auth/verify-session   POST /auth/logout
 *
 * To reconnect: write an `httpGateway` implementing this interface with utils/api.ts, return it from `gateway`, and delete
 * the preview gateway. No screen needs to change.
 */
import { AdminApiError } from '../../preview/lib/errors';
import { getPreviewFlags, sleep } from '../../preview/lib/previewFlags';
import { PENDING_KEY, PREVIEW_CODE, SESSION_KEY } from '../config';
import { SAMPLE_ACCOUNT } from '../data/seed';

export interface SignupProfile { id: string; name: string; email: string; phone: string; unit: string; street: string }

export interface ResidentSession {
  userId: string;
  name: string;
  email: string;
  /** Always 'preview' until a real gateway exists, so a mock session is never mistaken for a real one. */
  mode: 'preview';
  startedAt: string;
  /** Present for accounts created in the preview, so their (empty) data can be built. */
  profile?: SignupProfile;
}

export interface ResidentGateway {
  restore(): ResidentSession | null;
  signIn(identifier: string, password: string): Promise<ResidentSession>;
  register(profile: Omit<SignupProfile, 'id'>): Promise<void>;
  pendingSignup(): SignupProfile | null;
  resendCode(): Promise<void>;
  verify(code: string): Promise<ResidentSession>;
  signOut(): Promise<void>;
  requestPasswordReset(identifier: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  changePassword(current: string, next: string): Promise<void>;
}

const SAMPLE_PHONE_DIGITS = '09170000104';
const digits = (s: string) => s.replace(/\D/g, '');

const guardNetwork = () => { if (getPreviewFlags().offline) throw new AdminApiError('network'); };
const read = <T>(storage: Storage, key: string): T | null => { try { const raw = storage.getItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; } };
const write = (key: string, value: unknown) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: kept in memory only */ } };

const makeSession = (userId: string, name: string, email: string, profile?: SignupProfile): ResidentSession => {
  const session: ResidentSession = { userId, name, email, mode: 'preview', startedAt: new Date().toISOString(), ...(profile ? { profile } : {}) };
  write(SESSION_KEY, session);
  return session;
};

let pending: SignupProfile | null = null;

const previewGateway: ResidentGateway = {
  restore: () => read<ResidentSession>(sessionStorage, SESSION_KEY),

  async signIn(identifier, password) {
    await sleep(550);
    guardNetwork();
    const id = identifier.trim().toLowerCase();
    const known = id === SAMPLE_ACCOUNT.email || digits(identifier) === SAMPLE_PHONE_DIGITS;
    if (!known || password !== SAMPLE_ACCOUNT.password) throw new AdminApiError('server', 'Incorrect email, phone or password.');
    return makeSession(SAMPLE_ACCOUNT.id, SAMPLE_ACCOUNT.name, SAMPLE_ACCOUNT.email);
  },

  async register(profile) {
    await sleep(650);
    guardNetwork();
    if (profile.email.trim().toLowerCase() === SAMPLE_ACCOUNT.email) throw new AdminApiError('server', 'An account with this email already exists. Try signing in instead.');
    pending = { id: `res-new-${Math.random().toString(36).slice(2, 8)}`, ...profile };
    write(PENDING_KEY, pending); // never includes the password
  },

  pendingSignup() {
    pending ??= read<SignupProfile>(sessionStorage, PENDING_KEY);
    return pending;
  },

  async resendCode() { await sleep(600); guardNetwork(); },

  async verify(code) {
    await sleep(600);
    guardNetwork();
    const p = previewGateway.pendingSignup();
    if (!p) throw new AdminApiError('server', 'Your sign-up expired. Please create the account again.');
    if (code !== PREVIEW_CODE) throw new AdminApiError('server', 'That code is not correct. Check it and try again.');
    pending = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
    return makeSession(p.id, p.name, p.email, p);
  },

  async signOut() {
    // Forget the session locally first, so even a reload right now cannot resurrect it; then "tell the server".
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    await sleep(150);
  },

  async requestPasswordReset() {
    await sleep(600);
    guardNetwork();
    // Always resolves, so the screen never reveals whether an account exists.
  },

  // The preview validates these flows but never changes the sample password, so nothing credential-like is kept anywhere.
  async resetPassword(token) {
    await sleep(600);
    guardNetwork();
    if (token !== 'preview') throw new AdminApiError('server', 'This reset link is invalid or has expired. Request a new one.');
  },

  async changePassword(current) {
    await sleep(500);
    guardNetwork();
    // Only the sample resident has a known password. Accounts created in the preview never stored one, so there is nothing to compare.
    if (read<ResidentSession>(sessionStorage, SESSION_KEY)?.userId === SAMPLE_ACCOUNT.id && current !== SAMPLE_ACCOUNT.password) {
      throw new AdminApiError('server', 'Your current password is incorrect.');
    }
  },
};

export const gateway: ResidentGateway = previewGateway;
