/**
 * StraySafe Inactivity & Session Lifecycle Utility
 * Enforces a 30-minute inactivity timeout.
 * Keeps user session alive while active across all tabs.
 */

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
export const INACTIVITY_WARNING_MS = 28 * 60 * 1000; // 28 minutes (2-minute warning countdown)
export const ACTIVITY_STORAGE_KEY = 'straysafe_last_activity';

let lastLocalRecorded = 0;

/**
 * Record user activity timestamp.
 * Throttled to avoid writing to localStorage more than once every 5 seconds.
 */
export const recordUserActivity = () => {
    const now = Date.now();
    if (now - lastLocalRecorded < 5000) {
        return;
    }
    lastLocalRecorded = now;
    try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
    } catch {
        // Fallback if localStorage quota or access fails
    }
};

/**
 * Get the last recorded activity timestamp across tabs.
 */
export const getLastActivityTime = (): number => {
    try {
        const stored = localStorage.getItem(ACTIVITY_STORAGE_KEY);
        if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) {
                return parsed;
            }
        }
    } catch {
        // Fallback
    }
    return lastLocalRecorded || Date.now();
};

/**
 * Reset the activity timer to current timestamp immediately.
 */
export const resetActivityTimer = () => {
    const now = Date.now();
    lastLocalRecorded = now;
    try {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
    } catch {}
};

/**
 * Check if the user is authenticated in localStorage or sessionStorage.
 */
export const hasActiveSession = (): boolean => {
    const directToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
    if (directToken) return true;

    for (const key of ['admin_user', 'staff_user', 'resident_user']) {
        if (sessionStorage.getItem(key) || localStorage.getItem(key)) {
            return true;
        }
    }
    return false;
};

/**
 * Determine the appropriate login redirect path based on current user / path.
 */
export const getAppropriateLoginPath = (): string => {
    const path = window.location.pathname;
    if (path.startsWith('/admin')) {
        return '/admin/login';
    }
    if (path.startsWith('/staff') || path.startsWith('/subd') || path.startsWith('/brgy')) {
        return '/staff/login';
    }
    return '/login';
};
