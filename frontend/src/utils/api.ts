import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const getStoredToken = (): string | null => {
    // Check direct token keys first
    const directToken = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (directToken) return directToken;

    // Check embedded token in user objects
    for (const key of ['resident_user', 'admin_user', 'staff_user']) {
        const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
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

// Response Interceptor: Automatically handle 401 Unauthorized
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // Unauthenticated or token expired
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
        }
        return Promise.reject(error);
    }
);

export default api;
