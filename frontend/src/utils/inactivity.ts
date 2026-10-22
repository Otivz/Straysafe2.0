/**
 * StraySafe Inactivity & Session Lifecycle Utility
 * Idle sign-out depends on who is signed in (like Facebook for residents):
 *   - Residents: no idle sign-out. They stay signed in until 30 days pass without using the app (server rule).
 *   - Subdivision Leaders / Barangay Staff: signed out after 8 hours idle (about one work shift).
 *   - Admins: signed out after 30 minutes idle.
 * Keeps the session alive while active across all tabs.
 */

export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // Admins: 30 minutes
export const STAFF_INACTIVITY_TIMEOUT_MS = 8 * 60 * 60 * 1000; // Leaders and Barangay Staff: 8 hours
export const INACTIVITY_WARNING_LEAD_MS = 2 * 60 * 1000; // warning countdown before the sign-out
export const ACTIVITY_STORAGE_KEY = 'straysafe_last_activity';

/** Idle sign-out time for the area being used, or null when there is none (residents). */
export const getInactivityTimeoutMs = (): number | null => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '';
    if (path.startsWith('/admin')) return INACTIVITY_TIMEOUT_MS;
    if (path.startsWith('/staff') || path.startsWith('/subd') || path.startsWith('/brgy')) return STAFF_INACTIVITY_TIMEOUT_MS;
    return null;
};

/** "30 minutes" / "8 hours" for messages. */
export const describeTimeout = (ms: number): string => {
    const minutes = Math.round(ms / 60000);
    return minutes >= 60 ? `${Math.round(minutes / 60)} hours` : `${minutes} minutes`;
};

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
