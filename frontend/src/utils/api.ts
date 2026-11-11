import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { recordUserActivity, ACTIVITY_STORAGE_KEY } from './inactivity';
import { readDevBackend } from './devBackend';
import { isDataMutation, notifyDataChanged, refreshScope } from './dataRefresh';

// Build kinds (constants defined here, not shared: the bundler folds a constant only within one module, and the folding is what keeps the
// debug-only code out of a release or web bundle). `vite build --mode android` / `--mode android-debug`: the Android app.
const ANDROID_BUILD = import.meta.env.MODE === 'android' || import.meta.env.MODE === 'android-debug';
const ANDROID_DEV_CONNECT = import.meta.env.MODE === 'android-debug';

// The Android Resident app (see docs/05-operations/ANDROID_RESIDENT_APP.md) never guesses its backend:
//  - `vite build --mode android` (release-style) is tied to the one address it was built with (vite.config.ts refuses to build without
//    a valid one). It has no localhost fallback and never uses the dev-only /api path.
//  - `vite build --mode android-debug` (the debug APK) uses the address chosen in its Connection Settings screen (utils/devBackend.ts,
//    saved on the phone), else the optional address it was built with, else none: the app then opens Connection Settings first.
// If something is still wrong the app shows its own "can't reach the server" state; it never quietly talks to another server or switches
// to sample data. Every request below (this client, the sign-in screens, token refresh) reads API_BASE_URL, so one address applies.
const savedAddress = (): string | null => {
    if (!ANDROID_DEV_CONNECT) return null;
    try { return readDevBackend(localStorage); } catch { return null; }
};
const CONFIGURED_API_URL: string = savedAddress() || import.meta.env.VITE_API_BASE_URL || (ANDROID_BUILD ? '' : 'http://localhost:8000');
// Development (npm run dev / dev:https): always call the same-origin /api path, which the Vite dev server
// forwards to the backend on this PC. A phone then only needs the one address it opened (http(s)://<PC-IP>:5173)
// and keeps working when the router gives the PC a new IP. Production builds use VITE_API_BASE_URL.
export const API_BASE_URL = ANDROID_BUILD
    ? CONFIGURED_API_URL
    : import.meta.env.DEV ||
    (typeof window !== 'undefined' && window.location.protocol === 'https:' && CONFIGURED_API_URL.startsWith('http:'))
        ? '/api'
        : CONFIGURED_API_URL;

export const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

const isNativeApp = (): boolean => {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
};

// Installed app (APK): its page (http://localhost) and the backend are different sites, so the httpOnly refresh
// cookie isn't sent. The app marks its requests, keeps the refresh token the backend returns in X-Refresh-Token,
// and sends it back only to /auth/refresh and /auth/logout. This keeps residents signed in (like Facebook) until
// they go 30 days without opening the app. Browsers keep using the cookie only.
const APP_REFRESH_KEY = 'straysafe_app_refresh_token';

const addAppAuthHeaders = (config: any) => {
    if (!isNativeApp()) return config;
    config.headers = config.headers || {};
    config.headers['X-StraySafe-Client'] = 'app';
    const url = String(config.url || '');
    if (url.includes('/auth/refresh') || url.includes('/auth/logout')) {
        try {
            const saved = localStorage.getItem(APP_REFRESH_KEY);
            if (saved) config.headers['X-Refresh-Token'] = saved;
        } catch { /* storage unavailable */ }
    }
    return config;
};

const rememberAppRefreshToken = (response: any) => {
    if (!isNativeApp()) return response;
    const token = response?.headers?.['x-refresh-token'];
    if (token) {
        try { localStorage.setItem(APP_REFRESH_KEY, token); } catch { /* storage unavailable */ }
    }
    return response;
};

export const forgetAppRefreshToken = () => {
    try { localStorage.removeItem(APP_REFRESH_KEY); } catch { /* storage unavailable */ }
};

// Both the shared `api` client and plain `axios` calls (some sign-in pages, token refresh)
for (const client of [api, axios]) {
    client.interceptors.request.use(addAppAuthHeaders);
    client.interceptors.response.use(rememberAppRefreshToken);
}

export const getStoredToken = (): string | null => {
    // Check path-based role first to prevent multi-role storage collisions
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    let prioritizedKeys = ['admin_user', 'staff_user', 'resident_user'];
    if (path.startsWith('/admin')) {
        prioritizedKeys = ['admin_user', 'staff_user', 'resident_user'];
    } else if (path.startsWith('/staff') || path.startsWith('/subd') || path.startsWith('/brgy')) {
        prioritizedKeys = ['staff_user', 'admin_user', 'resident_user'];
    } else if (path.startsWith('/resident') || path.startsWith('/resident-home')) {
        prioritizedKeys = ['resident_user', 'staff_user', 'admin_user'];
    }

    // 1. Check embedded token in path-prioritized user objects first
    for (const key of prioritizedKeys) {
        for (const storage of [sessionStorage, localStorage]) {
            const raw = storage.getItem(key);
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed && (parsed.access_token || parsed.token)) {
                        return parsed.access_token || parsed.token;
                    }
                } catch {
                    // Ignore parse errors
                }
            }
        }
    }

    // 2. Check direct token keys (sessionStorage first, then localStorage)
    const directToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
    if (directToken) return directToken;

    return null;
};

/**
 * Save refreshed profile data into a stored session (resident_user / staff_user / admin_user) without breaking it:
 * only if that session still exists (it may have been signed out by another sign-in in this browser) and is the same
 * account, and keeping its token. Never brings back a signed-out session.
 */
export const updateStoredSessionUser = (key: 'resident_user' | 'staff_user' | 'admin_user', data: any): void => {
    for (const storage of [localStorage, sessionStorage]) {
        const raw = storage.getItem(key);
        if (!raw) continue;
        try {
            const existing = JSON.parse(raw);
            if (existing?.user_id && data?.user_id && Number(existing.user_id) !== Number(data.user_id)) return;
            storage.setItem(key, JSON.stringify({ ...existing, ...data,
                ...(existing?.access_token ? { access_token: existing.access_token } : {}),
                ...(existing?.token ? { token: existing.token } : {}) }));
        } catch { /* ignore */ }
        return;
    }
};

// Chat messages that earlier versions of the app cached in this browser: purged at every sign-out
const CHAT_CACHE_PREFIXES = ['straysafe_report_chat_', 'straysafe_match_chat_', 'straysafe_adoption_chat_'];

export const clearAuthStorage = () => {
    localStorage.removeItem('access_token');
    sessionStorage.removeItem('access_token');
    localStorage.removeItem('resident_user');
    sessionStorage.removeItem('resident_user');
    localStorage.removeItem('admin_user');
    sessionStorage.removeItem('admin_user');
    localStorage.removeItem('staff_user');
    sessionStorage.removeItem('staff_user');
    localStorage.removeItem(ACTIVITY_STORAGE_KEY);
    delete api.defaults.headers.common['Authorization'];
    // Cached chat messages belong to the account that was signed in: on a shared device the next account must not see
    // them (every sign-in, sign-out and ended session passes through here)
    try {
        Object.keys(localStorage)
            .filter((k) => CHAT_CACHE_PREFIXES.some((p) => k.startsWith(p)))
            .forEach((k) => localStorage.removeItem(k));
    } catch { /* storage unavailable */ }
};

// Fired when the server ends this browser's session (the sign-in could not be renewed). The auth providers of the two interfaces
// then ask the person to sign in again, instead of leaving them on a page whose requests all fail.
export const SESSION_ENDED_EVENT = 'straysafe:session-ended';
const endSession = () => {
    const hadSession = !!getStoredToken();
    clearAuthStorage();
    if (hadSession) window.dispatchEvent(new Event(SESSION_ENDED_EVENT));
};

// Signs out on the server too (revokes the access token and the stay-signed-in cookie / app token); clearing this
// browser alone left the server session valid, and the next request quietly signed the browser back in.
export const logoutUser = async () => {
    try {
        await api.post('/auth/logout', {}, { timeout: 6000 });
    } catch {
        // Ignore failure if backend unreachable
    } finally {
        clearAuthStorage();
        forgetAppRefreshToken();
    }
};

// Request Interceptor: Automatically attach Bearer token, handle FormData, and record activity
api.interceptors.request.use(
    (config) => {
        recordUserActivity();
        const token = getStoredToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        if (config.data instanceof FormData) {
            delete config.headers['Content-Type'];
            delete config.headers['content-type'];
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response Interceptor: Automatically refresh on 401 or handle logout
let isRefreshing = false;
let failedQueue: Array<{
    resolve: (token: string) => void;
    reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else if (token) {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

api.interceptors.response.use(
    (response) => {
        recordUserActivity();
        if (isDataMutation(response.config.method, response.config.url)) {
            notifyDataChanged(refreshScope(getStoredToken()));
        }
        return response;
    },
    async (error) => {
        // FastAPI validation errors (422) come back as a list of {loc, msg}: turn them into one readable message so
        // every form can show err.response.data.detail as text (e.g. "Enter a valid Philippine number ...")
        const detail = error.response?.data?.detail;
        if (error.response?.status === 422 && Array.isArray(detail)) {
            error.response.data.detail = detail
                .map((d: any) => String(d?.msg || '').replace(/^Value error,\s*/i, ''))
                .filter(Boolean)
                .join(' ') || 'Some fields are not valid. Please check the form.';
        }
        const originalRequest = error.config;
        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            // Avoid infinite loops for login or refresh requests
            if (originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/login')) {
                if (originalRequest.url?.includes('/auth/refresh')) endSession(); else clearAuthStorage();
                return Promise.reject(error);
            }

            // Signed out (no account kept in this browser): never sign back in from a leftover cookie
            if (!getStoredToken()) {
                return Promise.reject(error);
            }

            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        originalRequest.headers.Authorization = `Bearer ${token}`;
                        return api(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
                const newToken = res.data?.access_token;
                if (newToken) {
                    if (sessionStorage.getItem('access_token')) {
                        sessionStorage.setItem('access_token', newToken);
                    }
                    if (localStorage.getItem('access_token')) {
                        localStorage.setItem('access_token', newToken);
                    }
                    for (const key of ['staff_user', 'resident_user', 'admin_user']) {
                        const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
                        if (raw) {
                            try {
                                const parsed = JSON.parse(raw);
                                if (parsed && (parsed.access_token || parsed.token)) {
                                    if (parsed.access_token) parsed.access_token = newToken;
                                    if (parsed.token) parsed.token = newToken;
                                    if (sessionStorage.getItem(key)) sessionStorage.setItem(key, JSON.stringify(parsed));
                                    if (localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(parsed));
                                }
                            } catch {}
                        }
                    }
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    processQueue(null, newToken);
                    return api(originalRequest);
                }
            } catch (refreshErr) {
                processQueue(refreshErr, null);
                console.warn('Session expired or unauthorized request. Clearing session...');
                endSession();
                forgetAppRefreshToken();
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(error);
    }
);

export default api;
