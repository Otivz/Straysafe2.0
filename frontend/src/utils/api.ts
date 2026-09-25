import axios from 'axios';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true,
});

export const getStoredToken = (): string | null => {
    // Check direct token keys (sessionStorage first, then localStorage)
    const directToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
    if (directToken) return directToken;

    // Check embedded token in user objects
    for (const key of ['staff_user', 'resident_user', 'admin_user']) {
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

// Request Interceptor: Automatically attach Bearer token
api.interceptors.request.use(
    (config) => {
        const token = getStoredToken();
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
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
    (response) => response,
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
                if (!window.location.pathname.includes('/login')) {
                    const isStaff = window.location.pathname.startsWith('/subd') || window.location.pathname.startsWith('/brgy');
                    const isAdmin = window.location.pathname.startsWith('/admin');
                    if (isAdmin) {
                        window.location.href = '/admin/login';
                    } else if (isStaff) {
                        window.location.href = '/staff/login';
                    } else {
                        window.location.href = '/login';
                    }
                }
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }
        return Promise.reject(error);
    }
);

export default api;
