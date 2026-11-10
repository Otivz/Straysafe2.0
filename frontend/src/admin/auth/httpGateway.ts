/**
 * Gateway of the Leader UI's sign-in against the real backend. Nothing about authentication is reinvented: the contract and the
 * stored session are the shared ones (utils/api.ts):
 *
 *   - the session is `access_token` plus a `staff_user` record in sessionStorage; the refresh token is the server's httpOnly cookie;
 *   - renewing an expired access token and ending a session whose renewal fails are done by the shared client (utils/api.ts);
 *   - sign-out is utils/api's `logoutUser()`: the server revokes both tokens, then this browser forgets them;
 *   - only Subdivision Leaders (role 2) may use this interface. The server refuses Barangay accounts itself; a resident or an
 *     administrator who signs in here is turned away and the session the server just opened is revoked again.
 */
import axios from 'axios';
import { API_BASE_URL, clearAuthStorage, logoutUser, updateStoredSessionUser } from '../../utils/api';
import { ROLE_ADMINISTRATOR, ROLE_LEADER } from '../../live/config';
import { httpGet, httpPost } from '../../live/http';
import { AdminApiError } from '../../preview/lib/errors';
import type { AdminSession, AuthGateway } from './gateway';

interface LoginResponse {
  user_id: number;
  email?: string;
  name?: string | null;
  role_id: number;
  subdivision_id?: number | null;
  access_token?: string;
}

const STAFF_KEY = 'staff_user';
const STARTED_KEY = 'straysafe_admin_live_started';

const store = (): Storage[] => [sessionStorage, localStorage];

const toSession = (u: LoginResponse): AdminSession => ({
  userId: String(u.user_id),
  name: u.name?.trim() || 'Subdivision Leader',
  email: u.email ?? '',
  startedAt: (() => { try { return sessionStorage.getItem(STARTED_KEY) || new Date().toISOString(); } catch { return new Date().toISOString(); } })(),
  roleId: u.role_id,
  subdivisionId: u.subdivision_id ?? null,
});

/** The server just opened a session for someone this interface does not serve: close it again so no cookie is left behind. */
async function revoke(token: string): Promise<void> {
  try {
    await axios.post(`${API_BASE_URL}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` }, withCredentials: true, timeout: 6000 });
  } catch { /* nothing more to do: the person is turned away either way */ }
}

export const httpGateway: AuthGateway = {
  recovery: 'code',
  endsSessionOnPasswordChange: true,

  restore() {
    for (const storage of store()) {
      try {
        const raw = storage.getItem(STAFF_KEY);
        if (!raw) continue;
        const user = JSON.parse(raw) as LoginResponse;
        const token = user.access_token || storage.getItem('access_token');
        if (user?.user_id && user.role_id === ROLE_LEADER && token) return toSession(user);
      } catch { /* unreadable record: treated as signed out */ }
    }
    return null;
  },

  async verify() {
    try {
      const me = await httpGet<LoginResponse & { status?: string }>('/auth/verify-session');
      if (me.role_id !== ROLE_LEADER || me.status !== 'valid') return null;
      updateStoredSessionUser(STAFF_KEY, { user_id: me.user_id, name: me.name, email: me.email, subdivision_id: me.subdivision_id });
      return toSession(me);
    } catch (err) {
      if (err instanceof AdminApiError && err.kind === 'session') return null;
      throw err;     // network or server trouble: the session may still be fine, so the caller keeps it
    }
  },

  async signIn(email, password) {
    // 401 here means a wrong email or password, which is not an expired session.
    const data = await httpPost<LoginResponse>('/auth/login', { email: email.trim(), password }, { unauthorized: 'server' });
    if (data.role_id !== ROLE_LEADER) {
      if (data.access_token) await revoke(data.access_token);
      throw new AdminApiError('server', data.role_id === ROLE_ADMINISTRATOR
        ? 'This sign-in is for Subdivision Leaders. Administrators sign in at the administrator portal.'
        : 'This sign-in is for Subdivision Leaders.', 403);
    }
    if (!data.access_token) throw new AdminApiError('server', 'The server did not start a session. Please try again.');
    clearAuthStorage();            // no other role's session may linger beside this one
    try {
      sessionStorage.setItem('access_token', data.access_token);
      sessionStorage.setItem(STAFF_KEY, JSON.stringify(data));
      sessionStorage.setItem(STARTED_KEY, new Date().toISOString());
    } catch { throw new AdminApiError('server', 'This browser would not keep the sign-in. Allow site data for this page and try again.'); }
    return toSession(data);
  },

  async signOut() {
    try { sessionStorage.removeItem(STARTED_KEY); } catch { /* ignore */ }
    await logoutUser();            // revokes both tokens on the server, then clears every stored session
  },

  async requestPasswordReset(email) {
    // The server answers identically whether or not the email exists, so the screen never reveals it either.
    await httpPost('/auth/forgot-password', { email: email.trim() });
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
};
