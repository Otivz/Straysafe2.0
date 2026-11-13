/**
 * Gateway of the Resident UI's sign-up and sign-in against the real backend. Nothing about authentication is reinvented: the
 * contract and the stored session are the shared ones (utils/api.ts):
 *
 *   - sign-up is `POST /users/` (always an UNVERIFIED resident), then `POST /auth/login`, which answers with a RESTRICTED token and
 *     emails a 6-digit code; `POST /auth/verify-otp` with that token completes it. The restricted token is kept in memory only.
 *   - the session is `access_token` plus a `resident_user` record in localStorage (residents stay signed in until they have been
 *     away 30 days: a server rule); the refresh token is the server's httpOnly cookie, renewed by the shared client (utils/api.ts);
 *   - sign-out is utils/api's `logoutUser()`: the server revokes both tokens, then this browser forgets them;
 *   - only residents (role 1) may use this interface; anyone else who signs in here is turned away and the session the server just
 *     opened is revoked again.
 * The calls that carry the restricted token (or must carry no token at all) use axios directly: the shared client would put a
 * stored session's token on them instead.
 */
import axios from 'axios';
import { API_BASE_URL, clearAuthStorage, logoutUser, updateStoredSessionUser } from '../../utils/api';
import { ROLE_RESIDENT } from '../../live/config';
import { httpGet, httpPost, toApiError } from '../../live/http';
import { AdminApiError } from '../../preview/lib/errors';
import { stopPush } from '../native/push';
import type { ResidentGateway, ResidentSession, SignInResult, SignupProfile } from './gateway';

interface LoginResponse {
  user_id: number;
  email?: string;
  name?: string | null;
  role_id: number;
  subdivision_id?: number | null;
  phone?: string | null;
  address?: string | null;
  is_verified?: boolean;
  access_token?: string;
  requires_profile_completion?: boolean;
  requires_otp?: boolean;
  email_sent?: boolean;
  message?: string;
}

const USER_KEY = 'resident_user';
const PENDING_KEY = 'straysafe_resident_live_pending';   // the profile only: no password, no token
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The restricted token of a sign-up that is not verified yet. Memory only: a reload means signing in again for a new code. */
let pendingToken: string | null = null;
let pending: SignupProfile | null = null;
let notice: string | null = null;

const writePending = (p: SignupProfile | null) => {
  pending = p;
  try { if (p) sessionStorage.setItem(PENDING_KEY, JSON.stringify(p)); else sessionStorage.removeItem(PENDING_KEY); } catch { /* memory only */ }
};

const toSession = (u: LoginResponse, startedAt = new Date().toISOString()): ResidentSession => ({
  userId: String(u.user_id),
  name: u.name?.trim() || 'Resident',
  email: u.email ?? '',
  startedAt,
  roleId: u.role_id,
  subdivisionId: u.subdivision_id ?? null,
  phone: u.phone ?? null,
  address: u.address ?? null,
});

/** The server just opened a session for someone this interface does not serve: close it again so no cookie is left behind. */
async function revoke(token: string): Promise<void> {
  try {
    await axios.post(`${API_BASE_URL}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` }, withCredentials: true, timeout: 6000 });
  } catch { /* nothing more to do: the person is turned away either way */ }
}

/** A call made with the restricted token of the sign-up in progress. */
async function withPendingToken<T>(path: string, body: unknown): Promise<T> {
  if (!pendingToken) throw new AdminApiError('server', 'Your sign-up session ended. Sign in to get a new code.', 401);
  try {
    const res = await axios.post<T>(`${API_BASE_URL}${path}`, body, { headers: { Authorization: `Bearer ${pendingToken}` }, withCredentials: true, timeout: 30_000 });
    return res.data;
  } catch (err) {
    const mapped = toApiError(err, { unauthorized: 'server' });
    if (mapped.status === 401) throw new AdminApiError('server', 'Your sign-up session ended. Sign in to get a new code.', 401);
    throw mapped;
  }
}

const persist = (data: LoginResponse): ResidentSession => {
  clearAuthStorage();            // no other role's session may linger beside this one
  try {
    localStorage.setItem('access_token', data.access_token as string);
    localStorage.setItem(USER_KEY, JSON.stringify(data));
  } catch { throw new AdminApiError('server', 'This browser would not keep the sign-in. Allow site data for this page and try again.'); }
  return toSession(data);
};

const sentNotice = (data: { email_sent?: boolean; message?: string }) =>
  (data.email_sent === false ? (data.message || 'We couldn’t send the verification email right now. Tap “Send a new code” in a moment.') : null);

/** The subdivisions a new resident can join. A plain function (not `this`), because the gateway's methods are handed around detached. */
async function listSubdivisions(): Promise<{ id: number; name: string }[]> {
  const rows = await httpGet<{ subdivision_id: number; subdivision_name: string }[]>('/auth/subdivisions');
  return rows.map((r) => ({ id: r.subdivision_id, name: r.subdivision_name }));
}

export const httpGateway: ResidentGateway = {
  signInWith: 'email',
  recovery: 'code',
  endsSessionOnPasswordChange: true,

  restore() {
    for (const storage of [localStorage, sessionStorage]) {
      try {
        const raw = storage.getItem(USER_KEY);
        if (!raw) continue;
        const user = JSON.parse(raw) as LoginResponse;
        const token = user.access_token || storage.getItem('access_token');
        if (user?.user_id && user.role_id === ROLE_RESIDENT && user.is_verified !== false && token) return toSession(user);
      } catch { /* unreadable record: treated as signed out */ }
    }
    return null;
  },

  async verifySession() {
    try {
      const me = await httpGet<LoginResponse & { status?: string }>('/auth/verify-session');
      if (me.role_id !== ROLE_RESIDENT || me.status !== 'valid' || me.is_verified === false) return null;
      updateStoredSessionUser(USER_KEY, { user_id: me.user_id, name: me.name, email: me.email, subdivision_id: me.subdivision_id });
      return toSession(me);
    } catch (err) {
      if (err instanceof AdminApiError && err.kind === 'session') return null;
      throw err;     // network or server trouble: the session may still be fine, so the caller keeps it
    }
  },

  async signIn(identifier, password): Promise<SignInResult> {
    const email = identifier.trim();
    if (!EMAIL.test(email)) throw new AdminApiError('server', 'Sign in with the email address you registered with. A mobile number cannot be used to sign in.');
    // 401 here means a wrong email or password, which is not an expired session.
    const data = await httpPost<LoginResponse>('/auth/login', { email, password }, { unauthorized: 'server' });
    if (data.role_id !== ROLE_RESIDENT) {
      if (data.access_token) await revoke(data.access_token);
      throw new AdminApiError('server', 'This sign-in is for residents. Staff sign in at their own portal.', 403);
    }
    if (data.requires_profile_completion) {
      if (data.access_token) await revoke(data.access_token);
      throw new AdminApiError('server', 'Your account needs a few more details before it can be used. Finish your profile in the StraySafe resident portal, then sign in here.', 403);
    }
    if (data.requires_otp) {
      // An account that was never verified: the server has just emailed a code. Keep the restricted token for the next step.
      pendingToken = data.access_token ?? null;
      notice = sentNotice(data);
      writePending({ id: String(data.user_id), name: data.name?.trim() || 'Resident', email: data.email ?? email, phone: data.phone ?? '', unit: data.address ?? '', street: '' });
      return { status: 'verify' };
    }
    if (!data.access_token) throw new AdminApiError('server', 'The server did not start a session. Please try again.');
    return { status: 'signed_in', session: persist(data) };
  },

  async register(profile, password) {
    // The account is always created unverified: the server ignores any role or verified flag sent from here.
    const subdivisionId = profile.subdivisionId ?? (await listSubdivisions())[0]?.id;
    if (!subdivisionId) throw new AdminApiError('server', 'No subdivision is open for sign-up yet. Please contact the subdivision office.');
    const address = [profile.unit.trim(), profile.street.trim()].filter(Boolean).join(', ');
    try {
      // No token on this call: an administrator's leftover session must never make the new account "verified".
      await axios.post(`${API_BASE_URL}/users/`, {
        name: profile.name.trim(), email: profile.email.trim(), password, phone: profile.phone.trim(),
        role_id: ROLE_RESIDENT, subdivision_id: subdivisionId, address, status: 'Active',
      }, { timeout: 30_000 });
    } catch (err) {
      throw toApiError(err, { unauthorized: 'server' });
    }
    // Signing in right away is what makes the server email the code.
    const data = await httpPost<LoginResponse>('/auth/login', { email: profile.email.trim(), password }, { unauthorized: 'server' });
    if (!data.access_token) throw new AdminApiError('server', 'Your account was created, but the verification could not start. Sign in to get a code.');
    pendingToken = data.access_token;
    let started: { email_sent?: boolean; message?: string } = data;
    if (data.requires_profile_completion) {
      started = await withPendingToken('/auth/complete-profile', { name: profile.name.trim(), phone: profile.phone.trim(), subdivision_id: subdivisionId, address });
    }
    notice = sentNotice(started);
    writePending({ id: String(data.user_id), name: profile.name.trim(), email: profile.email.trim(), phone: profile.phone.trim(), unit: profile.unit.trim(), street: profile.street.trim(), subdivisionId });
  },

  pendingSignup() {
    if (pending) return pending;
    try { const raw = sessionStorage.getItem(PENDING_KEY); pending = raw ? (JSON.parse(raw) as SignupProfile) : null; } catch { pending = null; }
    return pending;
  },

  codeNotice: () => notice,

  async resendCode() {
    const data = await withPendingToken<{ email_sent?: boolean; message?: string }>('/auth/resend-otp', {});
    notice = sentNotice(data);
    if (notice) throw new AdminApiError('server', notice);
  },

  async verify(code) {
    if (!pending) throw new AdminApiError('server', 'Your sign-up expired. Please create the account again.');
    const data = await withPendingToken<LoginResponse>('/auth/verify-otp', { otp: code.trim() });
    if (!data.access_token) throw new AdminApiError('server', 'The account is verified, but the server did not start a session. Please sign in.');
    pendingToken = null;
    notice = null;
    writePending(null);
    return persist(data);
  },

  async signOut() {
    pendingToken = null;
    writePending(null);
    await stopPush();              // the phone stops receiving this account's notifications (Android app; nothing in a browser)
    await logoutUser();            // revokes both tokens on the server, then clears every stored session
  },

  async requestPasswordReset(identifier) {
    const email = identifier.trim();
    if (!EMAIL.test(email)) throw new AdminApiError('server', 'Enter the email address you registered with.');
    // The server answers identically whether or not the email exists, so the screen never reveals it either.
    await httpPost('/auth/forgot-password', { email });
  },

  async resetPassword() {
    throw new AdminApiError('server', 'Password recovery uses the 6-digit code that was emailed to you.');
  },

  async resetPasswordWithCode(email, code, password) {
    await httpPost('/auth/reset-password', { email: email.trim(), otp: code.trim(), new_password: password });
  },

  async changePassword(current, next) {
    await httpPost('/auth/change-password', { current_password: current, new_password: next });
  },

  subdivisions: listSubdivisions,
};
