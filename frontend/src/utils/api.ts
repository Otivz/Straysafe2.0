import axios from 'axios';
import { recordUserActivity, ACTIVITY_STORAGE_KEY } from './inactivity';

const CONFIGURED_API_URL: string = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
// An HTTPS page may not call a plain-HTTP API (mixed content). In that case use the same-origin /api
// path, which the Vite dev server (npm run dev:https) forwards to the backend.
export const API_BASE_URL =
    typeof window !== 'undefined' && window.location.protocol === 'https:' && CONFIGURED_API_URL.startsWith('http:')
        ? '/api'
        : CONFIGURED_API_URL;

export const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
});

export const getStoredToken = (): string | null => {
    // Check direct token keys (sessionStorage first, then localStorage)
    const directToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
    if (directToken) return directToken;

    // Check path-based role first to prevent multi-role storage collisions
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    let prioritizedKeys = ['admin_user', 'staff_user', 'resident_user'];
    if (path.startsWith('/admin')) {
        prioritizedKeys = ['admin_user', 'staff_user', 'resident_user'];
    } else if (path.startsWith('/staff') || path.startsWith('/subd') || path.startsWith('/brgy')) {
        prioritizedKeys = ['staff_user', 'admin_user', 'resident_user'];
    } else if (path.startsWith('/resident') || path.startsWith('/resident-home') || path.startsWith('/login')) {
        prioritizedKeys = ['resident_user', 'staff_user', 'admin_user'];
    }

    // Check embedded token in user objects
    for (const key of prioritizedKeys) {
        const raw = sessionStorage.getItem(key) || localStorage.getItem(key);
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
    return null;
};

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
};

export const logoutUser = async () => {
    try {
        await api.post('/auth/logout');
    } catch {
        // Ignore failure if backend unreachable
    } finally {
        clearAuthStorage();
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
        return response;
    },
    async (error) => {
        const originalRequest = error.config;
        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            // Avoid infinite loops for login or refresh requests
            if (originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/login')) {
                clearAuthStorage();
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
                    api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    processQueue(null, newToken);
                    return api(originalRequest);
                }
            } catch (refreshErr) {
                processQueue(refreshErr, null);
                console.warn('Session expired or unauthorized request. Clearing session...');
                clearAuthStorage();
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(error);
    }
);

export default api;
